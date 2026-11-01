import test from 'node:test';import assert from 'node:assert/strict';
import {createGatewaySigner,createGatewayVerifier,createVercelLoginGateway,createGatewayAdmissionLogin} from '../../../supabase/functions/maintrack-final-047/login-gateway.mjs';
const secret='synthetic-gateway-target-tests-only-32bytes';
const qa={projectRef:'szhstrafzkxzstjdcynl',functionSlug:'maintrack-security-qa-final'};
const prod={projectRef:'tdnkeskczcsukcujwinu',functionSlug:'maintrack-final-047'};
const body={action:'login',code:'90000001',pw:'SyntheticOnly7'};
const path=target=>'/functions/v1/'+target.functionSlug+'/api';
const request=(target,proof,method='POST')=>new Request('https://'+target.projectRef+'.supabase.co'+path(target),{method,headers:{'x-maintrack-admission':proof}});

test('exact server target profiles bind audience path method and body and reject cross-environment replay',()=>{
 for(const target of [qa,prod]){
  const proof=createGatewaySigner({secret,targetProfile:target})(body,'192.0.2.1');
  const verify=createGatewayVerifier({secret,targetProfile:target});assert.match(verify(request(target,proof),body),/^[a-f0-9]{64}$/);
  const other=target===qa?prod:qa;
  assert.throws(()=>createGatewayVerifier({secret,targetProfile:other})(request(other,proof),body),/PROOF_REJECTED/);
  assert.throws(()=>verify(request(other,proof),body),/PROOF_REJECTED/);
  assert.throws(()=>verify(request(target,proof,'GET'),body),/PROOF_REJECTED/);
  assert.throws(()=>verify(request(target,proof),{...body,code:'90000002'}),/PROOF_REJECTED/);
 }
});

test('all factories reject arbitrary hosts mixed tuples and unknown target configuration',()=>{
 for(const targetProfile of [{projectRef:prod.projectRef,functionSlug:qa.functionSlug},{projectRef:'evil.example',functionSlug:prod.functionSlug},{projectRef:prod.projectRef,functionSlug:'other'},{...prod,hostname:'evil.example'},null]){
  for(const make of [opts=>createGatewaySigner(opts),opts=>createGatewayVerifier(opts),opts=>createVercelLoginGateway({...opts,gatewayHostname:'gw.example',vercel:'1',ingressContractApproved:true}),opts=>createGatewayAdmissionLogin({...opts,admissionLogin:async()=>true})])assert.throws(()=>make({secret,targetProfile}),/GATEWAY_TARGET_REQUIRED/);
 }
 assert.throws(()=>createGatewayVerifier({secret,targetProfile:prod,expectedPath:path(qa)}),/PATH_ATTESTATION/);
 assert.throws(()=>createGatewaySigner({secret,targetProfile:prod})(body,'192.0.2.1',path(qa)),/LOGIN_SCOPE/);
});

test('configured gateway target is immutable and client target fields and headers cannot redirect upstream',async()=>{
 for(const configured of [qa,prod]){
  const targetProfile={...configured};let forwarded;
  const gateway=createVercelLoginGateway({secret,targetProfile,gatewayHostname:'gw.example',vercel:'1',ingressContractApproved:true,fetchImpl:async(url,options)=>{forwarded={url,options};return Response.json({ok:true});}});
  Object.assign(targetProfile,configured===qa?prod:qa);
  const clientBody={...body,targetProfile:configured===qa?prod:qa,targetUrl:'https://evil.example/api'};
  const req=new Request('https://gw.example/api/login',{method:'POST',headers:{'x-vercel-forwarded-for':'192.0.2.1','x-forwarded-for':'192.0.2.1','x-maintrack-target':'https://evil.example','x-maintrack-admission':'forged'},body:JSON.stringify(clientBody)});
  assert.equal((await gateway(req)).status,200);assert.equal(forwarded.url,'https://'+configured.projectRef+'.supabase.co'+path(configured));
  assert.equal(forwarded.options.headers['x-maintrack-target'],undefined);
  assert.match(createGatewayVerifier({secret,targetProfile:configured})(new Request(forwarded.url,{method:'POST',headers:forwarded.options.headers}),clientBody),/^[a-f0-9]{64}$/);
 }
});

test('admission adapter checks selected target before invoking provider and default stays QA',async()=>{
 let calls=0;const admissionLogin=async()=>{calls++;return true;};
 const admission=createGatewayAdmissionLogin({secret,targetProfile:prod,admissionLogin});
 const qaProof=createGatewaySigner({secret})(body,'192.0.2.1');
 await assert.rejects(()=>admission(request(prod,qaProof),body),/LOGIN_GATEWAY_PROOF_REQUIRED/);assert.equal(calls,0);
 const prodProof=createGatewaySigner({secret,targetProfile:prod})(body,'192.0.2.1');assert.equal(await admission(request(prod,prodProof),body),true);assert.equal(calls,1);
 assert.match(createGatewayVerifier({secret})(request(qa,qaProof),body),/^[a-f0-9]{64}$/);
 assert.throws(()=>createVercelLoginGateway({secret,targetProfile:prod,gatewayHostname:'gw.example',vercel:'1'}),/INGRESS_NOT_ATTESTED/);
});
