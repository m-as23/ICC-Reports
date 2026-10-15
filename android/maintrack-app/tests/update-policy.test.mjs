import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,generateKeyPairSync,sign as cryptoSign} from 'node:crypto';
import {compareVersions,canonicalJson,validUpdatePayload,verifySignedPolicy,shouldCheck,activationBlockers,decide,fetchVerifiedPolicy} from '../update-system/policy.mjs';
const now=1792056000000;
const payload={schema:1,channel:'pilot',issuedAt:now-1000,expiresAt:now+86400000,mode:'optional',minNative:'0.2.0',latestNative:'0.3.0',minUi:'0.2.0',latestUi:'0.2.1'};
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const pub=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url');
const signed=(p=payload)=>({payload:p,signature:cryptoSign(null,Buffer.from(canonicalJson(p)),privateKey).toString('base64url')});
test('semantic version ordering and malformed versions',()=>{assert.equal(compareVersions('1.2.10','1.2.9'),1);assert.equal(compareVersions('1.0.0','1.0.0'),0);assert.throws(()=>compareVersions('1.0','1.0.0'))});
test('canonical serialization stable across property orders',()=>assert.equal(canonicalJson({z:1,a:{b:2,a:3}}),canonicalJson({a:{a:3,b:2},z:1})));
test('valid signed and expiring policies accepted only in matching channel',async()=>{
  assert.equal((await verifySignedPolicy(signed(),{publicKeyBase64:pub,cryptoSubtle:webcrypto.subtle,now}))?.latestUi,'0.2.1');
  assert.equal(await verifySignedPolicy(signed(),{publicKeyBase64:pub,cryptoSubtle:webcrypto.subtle,now,channel:'production'}),null);
  assert.equal(await verifySignedPolicy(signed(),{publicKeyBase64:pub,cryptoSubtle:webcrypto.subtle,now:now+90000000}),null);
});
test('tampered or unsigned update metadata cannot force update',async()=>{
 const e=signed({...payload,mode:'required'});
 e.payload.latestUi='88.0.0';
 assert.equal(await verifySignedPolicy(e,{publicKeyBase64:pub,cryptoSubtle:webcrypto.subtle,now}),null);
 assert.equal(await verifySignedPolicy({...e,signature:''},{publicKeyBase64:pub,cryptoSubtle:webcrypto.subtle,now}),null);
});
test('update metadata cannot contain install URL before native verifier integration',()=>{
 assert.equal(validUpdatePayload({...payload,bundleUrl:'https://example.com/ota.zip'},now),false);
 assert.equal(validUpdatePayload({...payload,mode:'forced'},now),false);
});
test('no online check on every launch, 24h interval',()=>{assert.equal(shouldCheck({now,lastCheck:now-3000}),false);assert.equal(shouldCheck({now,lastCheck:now-86400000}),true)});
test('local work is never interrupted by UI bundle activation',()=>{
 const blockers=activationBlockers({dirtyForm:true,unsentReports:1,submitting:true});
 assert.deepEqual(blockers,['UNSAVED_FORM','UNSENT_REPORTS','SUBMITTING']);
 assert.equal(decide({policy:{...payload,mode:'required'},currentNative:'0.2.0',currentUi:'0.2.0',blockers}).action,'defer');
});
test('native changes require a signed APK, not web bundle',()=>{
 assert.equal(decide({policy:{...payload,minNative:'0.3.0'},currentNative:'0.2.0',currentUi:'0.2.0'}).action,'native-required');
});
test('policy retrieval disabled unless trusted endpoint and key explicitly configured',async()=>{
 let called=false;
 const r=await fetchVerifiedPolicy({fetchImpl:async()=>{called=true;throw Error('should not fetch')}});
 assert.equal(r.status,'disabled');assert.equal(called,false);
});
test('network failure never prevents use of existing application',async()=>{
 const r=await fetchVerifiedPolicy({url:'https://example.org/policy.json',publicKeyBase64:pub,fetchImpl:async()=>{throw Error('OFFLINE')},cryptoSubtle:webcrypto.subtle,now});
 assert.deepEqual(r,{status:'network-failed',policy:null});
});
test('verified update server result is allowed with valid signed JSON only',async()=>{
 const ok=await fetchVerifiedPolicy({url:'https://example.org/policy.json',publicKeyBase64:pub,cryptoSubtle:webcrypto.subtle,now,fetchImpl:async()=>({ok:true,headers:new Map([['content-type','application/json']]),text:async()=>JSON.stringify(signed())})});
 assert.equal(ok.status,'verified');
});

test('mandatory policy never loops once UI and native versions are current',()=>{
 const p={...payload,mode:'required',latestNative:'0.2.0',latestUi:'0.2.0'};
 assert.equal(decide({policy:p,currentNative:'0.2.0',currentUi:'0.2.0'}).action,'continue');
});
test('native and UI release types are handled independently',()=>{
 const p={...payload,latestNative:'0.3.0',latestUi:'0.2.1',mode:'required'};
 assert.equal(decide({policy:p,currentNative:'0.2.0',currentUi:'0.2.0'}).action,'native-required');
 assert.equal(decide({policy:{...payload,latestNative:'0.2.0'},currentNative:'0.2.0',currentUi:'0.2.0'}).action,'ui-optional');
 assert.equal(decide({policy:{...payload,latestUi:'0.2.0'},currentNative:'0.2.0',currentUi:'0.2.0'}).action,'native-optional');
});
