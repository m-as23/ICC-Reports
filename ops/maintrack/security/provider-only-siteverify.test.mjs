import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaSiteverifyVerifier} from './provider-only-siteverify.mjs';
const secret='synthetic-test-secret-not-real';
const token='synthetic-token';
const admission={token,requestId:'a'.repeat(32)};
const verdict={success:true,hostname:'maintrack-registered-isolated-qa.vercel.app',action:'maintrack_login',cdata:'b'.repeat(64),challenge_ts:'2026-11-02T17:00:00Z'};
const respond=(value,status=200)=>new Response(typeof value==='string'?value:JSON.stringify(value),{status});
test('calls official Siteverify with server secret and returns bounded identity',async()=>{
 let calls=0;
 const verify=createQaSiteverifyVerifier({secret,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
  assert.equal(options.body.get('secret'),secret);assert.equal(options.body.get('response'),token);
  assert.equal(options.signal.aborted,false);
  return respond({...verdict,extraPrivate:'must-not-be-echoed'});
 }});
 const outcome=await verify({admission});assert.deepEqual(outcome,verdict);assert.equal(calls,1);
 assert.doesNotMatch(JSON.stringify(outcome),/synthetic/);
});
test('invalid proof is rejected before outbound request',async()=>{
 let calls=0;const verify=createQaSiteverifyVerifier({secret,fetchImpl:async()=>{calls++;return respond(verdict);}});
 for(const proof of ['', 'a'.repeat(2049),'token with spaces'])await assert.rejects(verify({admission:{token:proof}}));
 assert.equal(calls,0);
});
test('provider negative verdict is not promoted into success',async()=>{
 const verify=createQaSiteverifyVerifier({secret,fetchImpl:async()=>respond({...verdict,success:false})});
 assert.equal((await verify({admission})).success,false);
});
test('bad status, oversized response and malformed JSON fail closed',async()=>{
 for(const response of [respond(verdict,403),respond('x'.repeat(8193)),respond('{broken')]){
  const verify=createQaSiteverifyVerifier({secret,fetchImpl:async()=>response});
  await assert.rejects(verify({admission}),/QA_SITEVERIFY_UNAVAILABLE/);
 }
});
test('rejects missing or invalid secret and timeout settings',()=>{
 for(const options of [{secret:'short'},{secret,timeoutMs:0},{secret,timeoutMs:10001}])assert.throws(()=>createQaSiteverifyVerifier(options),/QA_SITEVERIFY_CONFIGURATION/);
});
test('provider verdict is accepted only through the QA probe with matching cData',async()=>{
 const {createHash,createHmac}=await import('node:crypto');
 const {createProviderOnlyProbe}=await import('./provider-only-probe.mjs');
 const {loginProofBinding}=await import('../../../supabase/functions/maintrack-final-047/login-proof.mjs');
 const now=Date.parse('2026-11-02T17:00:00Z'),code='90000001',requestId='a'.repeat(32),operatorKey='synthetic-operator-key-for-unit-tests';
 const body=JSON.stringify({action:'login',code,admission});
 const expected=await loginProofBinding(code,requestId);
 const verifiedVerdict={...verdict,cdata:expected,challenge_ts:new Date(now-1000).toISOString()};
 let outbound=0;
 const handler=createProviderOnlyProbe({projectRef:'szhstrafzkxzstjdcynl',operatorKey,
  bodySha256:createHash('sha256').update(body).digest('hex'),expires:now+60000,now:()=>now,
  verify:createQaSiteverifyVerifier({secret,fetchImpl:async()=>{outbound++;return respond(verifiedVerdict);}})});
 const request=new Request('https://maintrack-registered-isolated-qa.vercel.app/probe',{method:'POST',headers:{origin:'https://maintrack-registered-isolated-qa.vercel.app','x-probe-time':String(now),'x-probe-signature':createHmac('sha256',operatorKey).update('maintrack-provider-probe-v1\n'+now+'\n'+body).digest('hex')},body});
 const response=await handler(request);assert.equal(response.status,200);assert.equal((await response.json()).sessionsIssued,0);assert.equal(outbound,1);
});
