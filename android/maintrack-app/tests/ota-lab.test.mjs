import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,generateKeyPairSync,sign} from 'node:crypto';
import {canonicalJson} from '../update-system/policy.mjs';
import {verifyLabRelease,validateLabRelease,canActivate,stageVerifiedBundle,simulatedRollback} from '../update-system/ota-lab.mjs';
const now=1792056000000;
const origin='https://updates-lab.example.org';
const m={schema:1,channel:'lab',kind:'web-ota',appId:'com.icc.maintrack',issuedAt:now-1000,expiresAt:now+86400000,nativeMinimum:'0.2.0',nativeMaximum:'0.3.0',bundleVersion:'0.3.1',bundleUrl:origin+'/bundle.zip',sha256:'a'.repeat(64),bytes:1024};
const pair=generateKeyPairSync('ed25519');
const pub=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url');
const envelope=p=>({payload:p,signature:sign(null,Buffer.from(canonicalJson(p)),pair.privateKey).toString('base64url')});
const opts={publicKeyBase64:pub,cryptoSubtle:webcrypto.subtle,now,allowedOrigins:[origin],currentNative:'0.2.0'};
test('valid update release requires signed version, allowed HTTPS origin and ZIP hash',async()=>assert.ok(await verifyLabRelease(envelope(m),opts)));
test('tampered release is rejected even if claimed checksum looks valid',async()=>{const e=envelope(m);e.payload.bundleVersion='0.3.2';assert.equal(await verifyLabRelease(e,opts),null)});
test('malicious URL and incompatible native version are blocked',()=>{
 for(const url of ['http://updates-lab.example.org/bundle.zip','https://evil.example.org/bundle.zip','https://updates-lab.example.org@evil.example.org/bundle.zip','https://updates-lab.example.org/bundle.zip#fragment']){
  assert.equal(validateLabRelease({...m,bundleUrl:url},opts),false,url);
 }
 assert.equal(validateLabRelease({...m,nativeMinimum:'9.0.0'},opts),false);
});
test('expired or cross-channel releases are refused',async()=>{
 assert.equal(await verifyLabRelease(envelope({...m,channel:'production'}),opts),null);
 assert.equal(await verifyLabRelease(envelope(m),{...opts,now:now+90000000}),null);
});
test('report queue blocks download and activation',async()=>{
 let used=false;
 const updater={download:async()=>{used=true;return {id:'demo'}}};
 const r=await stageVerifiedBundle({verifiedRelease:m,updater,getLocalState:()=>({unsentReports:1})});
 assert.equal(r.status,'deferred');assert.equal(used,false);
 assert.equal(canActivate({dirtyForm:true}),false);
});
test('report created during download defers activation',async()=>{
 let calls=0,activated=false;
 const updater={download:async()=>({id:'safe'}),next:async()=>{activated=true}};
 const result=await stageVerifiedBundle({verifiedRelease:m,updater,getLocalState:()=>({unsentReports:++calls===1?0:1})});
 assert.equal(result.status,'deferred');assert.equal(activated,false);
});
test('native updater receives signed checksum, schedules only (no automatic reload)',async()=>{
 const calls=[];const updater={
  download:async args=>{calls.push(['download',args]);return{id:'abc'}},
  next:async args=>{calls.push(['next',args])},
  reload:async()=>{throw Error('unexpected reload')}
 };
 const result=await stageVerifiedBundle({verifiedRelease:m,updater,getLocalState:()=>({})});
 assert.equal(result.status,'scheduled');assert.equal(calls[0][1].checksum,m.sha256);assert.equal(calls[1][0],'next');
});
test('failed download never switches current bundle',async()=>{
 let activated=false;
 const result=await stageVerifiedBundle({verifiedRelease:m,updater:{download:async()=>{throw Error('timeout')},next:async()=>{activated=true}},getLocalState:()=>({})});
 assert.equal(result.status,'failed');assert.equal(activated,false);
});
test('rollback fault injection resets to previous working bundle in mock',async()=>{
 let reverted=0;const updater={reset:async()=>{reverted++}};
 assert.equal(await simulatedRollback({updater,bootstrapCompleted:false}),'reverted');
 assert.equal(reverted,1);
 assert.equal(await simulatedRollback({updater,bootstrapCompleted:true}),'kept');
 assert.equal(reverted,1);
});
