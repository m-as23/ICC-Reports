import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {reconcileUpload} from '../src/reconcile-upload.mjs';
const bytes=Buffer.from('synthetic-owned-workbook'),scope={storageKey:'inventory/imports/00000000-0000-4000-8000-000000000001.xlsx',fileSha256:createHash('sha256').update(bytes).digest('hex'),actor:'SYNTHETIC-OWNER'};
test('quarantined object remains retained and blocked, never called cleanup PASS',async()=>{
 let gets=0;const r=await reconcileUpload({scope,store:{quarantineUpload:async s=>{assert.equal(s,scope);return {state:'QUARANTINED',referenced:false};}},privateFiles:{getObject:async()=>{gets++;return bytes;},deleteObject:()=>{throw Error('DELETE_FORBIDDEN');}}});assert.equal(r.status,'QUARANTINED_OBJECT_RETAINED');assert.equal(r.cleanupVerified,false);assert.equal(r.journalBlocksNewReservations,true);assert.equal(r.operatorHoldRequired,true);assert.equal(gets,1);
});
test('unverified object read and hash mismatch cannot clear ownership or claim cleanup',async()=>{
 for(const getObject of [async()=>{throw Error('ambiguous/not-found');},async()=>Buffer.from('changed')]){const r=await reconcileUpload({scope,store:{quarantineUpload:async()=>({state:'QUARANTINED',referenced:false})},privateFiles:{getObject}});assert.equal(r.cleanupVerified,false);assert.equal(r.journalBlocksNewReservations,true);assert.equal(r.operatorHoldRequired,true);assert.ok(['OBJECT_OUTCOME_UNVERIFIED','OBJECT_HASH_MISMATCH'].includes(r.status));}
});
test('uncertain attached object requires operator hold without claiming a DB quota fence',async()=>{
 const r=await reconcileUpload({scope,store:{quarantineUpload:async()=>({state:'ATTACHED',referenced:true})},privateFiles:{getObject:async()=>{throw Error('NETWORK_UNCERTAIN');}}});assert.equal(r.operatorHoldRequired,true);assert.equal(r.journalBlocksNewReservations,false);assert.equal(r.cleanupVerified,false);
});
test('attached referenced object is preserved and wrong scope stops before Storage',async()=>{
 const r=await reconcileUpload({scope,store:{quarantineUpload:async()=>({state:'ATTACHED',referenced:true})},privateFiles:{getObject:async()=>bytes}});assert.equal(r.status,'CONSISTENT_ATTACHED');assert.equal(r.cleanupVerified,false);
 await assert.rejects(()=>reconcileUpload({scope,store:{quarantineUpload:async()=>{throw Error('UPLOAD_SCOPE_MISMATCH');}},privateFiles:{getObject:()=>{throw Error('STORAGE_FORBIDDEN');}}}),/UPLOAD_SCOPE_MISMATCH/);
});
