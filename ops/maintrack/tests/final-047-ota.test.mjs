import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {finalBaseline} from '../scripts/sign-final-047-ota.mjs';
import {canonicalJson} from '../../../android/maintrack-app/update-system/policy.mjs';
import {verifyLabRelease} from '../../../android/maintrack-app/update-system/ota-lab.mjs';
test('credential update advances OTA version while retaining the compatible 047 native floor',()=>{
 const policy={bundleVersion:'0.4.10',bundleUrl:'https://raw.githubusercontent.com/m-as23/ICC-Reports/'+'a'.repeat(40)+'/updates/android/maintrack-0.4.10-final.zip',sha256:'b'.repeat(64),bytes:191000};
 const payload=finalBaseline(policy,'c'.repeat(40),Date.now());assert.equal(payload.bundleVersion,'0.4.10');assert.equal(payload.nativeMinimum,'0.4.7');
 assert.throws(()=>finalBaseline({...policy,bundleVersion:'0.4.7'},'c'.repeat(40),Date.now()));
});
test('Final signed baseline accepts 047, rejects older native and tampering, and preserves queue contract',async()=>{
 const now=Date.now();const keys=generateKeyPairSync('ed25519');
 const payload=finalBaseline({bundleUrl:'https://raw.githubusercontent.com/m-as23/ICC-Reports/'+'a'.repeat(40)+'/updates/android/maintrack-0.4.7-final.zip',sha256:'b'.repeat(64),bytes:190832},'c'.repeat(40),now);
 const envelope={payload,signature:sign(null,Buffer.from(canonicalJson(payload)),keys.privateKey).toString('base64url')};
 const options={publicKeyBase64:keys.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64url'),allowedOrigins:['https://raw.githubusercontent.com'],now,currentNative:'0.4.7'};
 assert.ok(await verifyLabRelease(envelope,options));assert.equal(await verifyLabRelease(envelope,{...options,currentNative:'0.4.6'}),null);
 assert.equal(await verifyLabRelease({...envelope,payload:{...payload,sha256:'d'.repeat(64)}},options),null);
 assert.equal(await verifyLabRelease(envelope,{...options,now:payload.expiresAt+1}),null);
 assert.equal(payload.localData.migration,'none');assert.equal(payload.localData.reportQueue,1);
});
