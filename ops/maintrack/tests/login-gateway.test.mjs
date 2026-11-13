import {withLoginBudget} from '../../../supabase/functions/maintrack-final-047/login-rate-limit.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {createGatewaySigner,createGatewayVerifier,createVercelLoginGateway} from '../../../supabase/functions/maintrack-final-047/login-gateway.mjs';
const secret='synthetic-gateway-key-for-local-tests-only-32bytes';const path='/functions/v1/maintrack-security-qa-final/api';const b={action:'login',code:'90000001',pw:'SyntheticOnly7',admission:{token:'provider-token',requestId:'a'.repeat(32)}};
test('bounded gateway receives a successful upstream result after the observed 5.2 second transport delay',async()=>{
 const gateway=createVercelLoginGateway({secret,gatewayHostname:'qa-gw.example',vercel:'1',ingressContractApproved:true,fetchImpl:async(_url,{signal})=>{
  await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,5200);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});});
  return Response.json({ok:true});
 }});
 const response=await gateway(new Request('https://qa-gw.example/api/login',{method:'POST',headers:{'x-vercel-forwarded-for':'192.0.2.1','x-forwarded-for':'192.0.2.1'},body:JSON.stringify(b)}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
});
test('gateway still aborts failed transport once without retry and stays below client deadline',async()=>{
 const original=AbortSignal.timeout;let requested,calls=0;
 AbortSignal.timeout=ms=>{requested=ms;return original(5);};
 try{
  const gateway=createVercelLoginGateway({secret,gatewayHostname:'qa-gw.example',vercel:'1',ingressContractApproved:true,fetchImpl:async(_url,{signal})=>{calls++;return new Promise((resolve,reject)=>{const guard=setTimeout(()=>reject(Error('SIGNAL_NOT_HONORED')),100);signal.addEventListener('abort',()=>{clearTimeout(guard);reject(signal.reason);},{once:true});});}});
  const result=await gateway(new Request('https://qa-gw.example/api/login',{method:'POST',headers:{'x-vercel-forwarded-for':'192.0.2.1','x-forwarded-for':'192.0.2.1'},body:JSON.stringify(b)}));
  assert.equal(result.status,503);assert.equal(calls,1);assert.equal(requested,8000);assert.ok(requested<10000);
 }finally{AbortSignal.timeout=original;}
});
test('gateway signature binds exact method/path/body/source/expiry; direct and tampered requests reject',()=>{
 const sign=createGatewaySigner({secret}),verify=createGatewayVerifier({secret,expectedPath:path});const token=sign(b,'192.0.2.1',path);const req=new Request('https://szhstrafzkxzstjdcynl.supabase.co'+path,{method:'POST',headers:{'x-maintrack-admission':token}});assert.match(verify(req,b),/^[a-f0-9]{64}$/);
 for(const [request,body] of [[new Request(req.url,{method:'POST'}),b],[req,{...b,code:'90000002'}],[new Request('https://qa.invalid/other',{method:'POST',headers:req.headers}),b],[new Request(req.url,{method:'GET',headers:req.headers}),b]])assert.throws(()=>verify(request,body));
 const expired=createGatewayVerifier({secret,expectedPath:path,now:()=>Date.now()+11000});assert.throws(()=>expired(req,b));assert.throws(()=>createGatewayVerifier({secret:'short',expectedPath:path}));
});
test('Vercel adapter refuses unreviewed platform context and replaces all client assertions',async()=>{
 assert.throws(()=>createVercelLoginGateway({secret,gatewayHostname:'qa-gw.example',vercel:'0',ingressContractApproved:true}),/VERCEL_INGRESS/);
 let forwarded;const gateway=createVercelLoginGateway({secret,gatewayHostname:'qa-gw.example',vercel:'1',ingressContractApproved:true,fetchImpl:async(url,opts)=>{forwarded={url,opts};return Response.json({ok:true});}});
 const req=new Request('https://qa-gw.example/api/login',{method:'POST',headers:{'content-type':'application/json','x-vercel-forwarded-for':'192.0.2.1','x-forwarded-for':'192.0.2.1','cf-connecting-ip':'forged','x-maintrack-admission':'forged'},body:JSON.stringify(b)});assert.equal((await gateway(req)).status,200);assert.equal(forwarded.url,'https://szhstrafzkxzstjdcynl.supabase.co'+path);const verify=createGatewayVerifier({secret,expectedPath:path});assert.match(verify(new Request(forwarded.url,{method:'POST',headers:forwarded.opts.headers}),b),/^[a-f0-9]{64}$/);assert.equal(forwarded.opts.headers['x-forwarded-for'],undefined);
 const mismatched=new Request(req.url,{method:'POST',headers:{'x-vercel-forwarded-for':'192.0.2.1','x-forwarded-for':'203.0.113.99'},body:JSON.stringify(b)});assert.equal((await gateway(mismatched)).status,503);
});

test('native HTTPS localhost gets exact CORS preflight only when explicitly configured',async()=>{
 const gateway=createVercelLoginGateway({secret,gatewayHostname:'qa-gw.example',vercel:'1',ingressContractApproved:true,allowedOrigins:['https://localhost'],fetchImpl:async()=>{throw Error('NO_FORWARD');}});
 const allowed=await gateway(new Request('https://qa-gw.example/api/login',{method:'OPTIONS',headers:{origin:'https://localhost'}}));assert.equal(allowed.status,204);assert.equal(allowed.headers.get('access-control-allow-origin'),'https://localhost');
 const blocked=await gateway(new Request('https://qa-gw.example/api/login',{method:'OPTIONS',headers:{origin:'https://evil.example'}}));assert.equal(blocked.status,403);assert.equal(blocked.headers.get('access-control-allow-origin'),null);
});

test('gateway signature normalizes mapped IPv4 and IPv6 /64 without accepting arbitrary proxy lists',()=>{
 const sign=createGatewaySigner({secret}),verify=createGatewayVerifier({secret,expectedPath:path});const source=ip=>verify(new Request('https://qa.invalid'+path,{method:'POST',headers:{'x-maintrack-admission':sign(b,ip,path)}}),b);
 assert.equal(source('192.0.2.1'),source('::ffff:192.0.2.1'));assert.equal(source('2001:db8:1:2::1'),source('2001:db8:1:2::ffff'));assert.throws(()=>source('192.0.2.1, 203.0.113.1'));
});

test('gateway budget mode rejects missing verified source and unknown policies before checking out PostgreSQL',async()=>{
 let calls=0;const pool={connect:async()=>{calls++;throw Error('UNEXPECTED_DB');}};
 for(const [source,policy] of [[undefined,{kind:'verified-gateway-v1'}],['a'.repeat(64),{kind:'client-selected'}]])await assert.rejects(()=>withLoginBudget(pool,source,'90000001',async()=>true,policy),e=>e.code==='LOGIN_INGRESS_UNVERIFIED');
 assert.equal(calls,0);
});

test('only the explicit Supabase gateway prefix rewrite maps to the same signed logical path',()=>{
 const sign=createGatewaySigner({secret}),verify=createGatewayVerifier({secret,expectedPath:path}),headers={'x-maintrack-admission':sign(b,'192.0.2.1',path)};
 assert.match(verify(new Request('https://qa.invalid'+path.replace('/functions/v1',''),{method:'POST',headers}),b),/^[a-f0-9]{64}$/);
 for(const pathname of ['/api','/maintrack-other/api','/functions/v1/maintrack-other/api'])assert.throws(()=>verify(new Request('https://qa.invalid'+pathname,{method:'POST',headers}),b));
});
