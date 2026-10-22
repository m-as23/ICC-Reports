// REVIEW-ONLY v0.4.7 integration test: pinned upstream SpareParts-Search-Lab @ 07dbac0c2a63cf58336ae8a2df383cbcf9f283be.
// No Supabase / Vercel changes, no inventory database operations executed by this module alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCode,validateAndNormalizeRows,compareToActive,assertBaseIsCurrent,authorizeInventoryAction} from '../src/domain.mjs';
const row=(code,quantity,description='Motor',location='A1')=>({code,quantity,description,location});
const trusted=(role)=>({authenticated:true,active:true,role,userId:'QA-ONLY'});
test('canonical codes and nullable quantity are preserved',()=>{
 assert.equal(normalizeCode(' aa-x5  '),'AA-X5');
 assert.deepEqual(validateAndNormalizeRows([row(' a ',0),row('b',null) ]).map(x=>x.quantity),[0,null]);
});
test('duplicate codes fail across casing',()=>{
 assert.throws(()=>validateAndNormalizeRows([row('ab',1),row('AB',2)]),/DUPLICATE_CODE/);
});
test('negative and non-finite stock fail; missing description is preserved by code',()=>{
 assert.throws(()=>validateAndNormalizeRows([row('x',-1)]),/INVALID_QUANTITY/);
 assert.throws(()=>validateAndNormalizeRows([row('x','Infinity')]),/INVALID_QUANTITY/);
 assert.equal(validateAndNormalizeRows([row('x',1,'')])[0].description,'');
 assert.throws(()=>validateAndNormalizeRows([row('',1,'Motor')]),/INVALID_REQUIRED_FIELD/);
 assert.throws(()=>validateAndNormalizeRows([]),/EMPTY_SNAPSHOT/);
});
test('new Excel file is compared to CURRENT version, not first upload',()=>{
 const v1=[row('A',1),row('B',2)];
 const v2=[row('A',5),row('B',2),row('C',3)];
 const v3=[row('A',5),row('B',7),row('C',3)];
 const delta=compareToActive(v2,v3);
 assert.deepEqual([delta.created,delta.changed,delta.absent,delta.unchanged],[0,1,0,2]);
 assert.equal(delta.details[0].code,'B');
 assert.equal(compareToActive(v1,v3).created,1);
});
test('identical version returns no changes',()=>{
 const v1=[row('X',0),row('Y',10)];
 assert.deepEqual([compareToActive(v1,v1).created,compareToActive(v1,v1).changed,compareToActive(v1,v1).absent],[0,0,0]);
});
test('deleted codes are ABSENT, not silently treated as zero quantity',()=>{
 const delta=compareToActive([row('X',5),row('Y',4)],[row('Y',4)]);
 assert.equal(delta.absent,1);
 assert.equal(delta.details[0].after,null);
 assert.equal(delta.details[0].before.quantity,5);
});
test('more than 10 percent absent needs explicit review',()=>{
 const prev=Array.from({length:20},(_,i)=>row('C'+i,10));
 const delta=compareToActive(prev,prev.slice(0,17));
 assert.equal(delta.absent,3);
 assert.equal(delta.requiresExplicitReview,true);
});
test('stale pending version cannot be published after another active version wins',()=>{
 assert.doesNotThrow(()=>assertBaseIsCurrent(3,3));
 assert.throws(()=>assertBaseIsCurrent(3,4),/STALE_BASE_RECOMPARE_REQUIRED/);
 assert.doesNotThrow(()=>assertBaseIsCurrent(null,null));
 assert.throws(()=>assertBaseIsCurrent(null,1),/STALE_BASE_RECOMPARE_REQUIRED/);
});
test('viewer/engineer/technician can read but never upload, approve or restore',()=>{
 for(const role of ['engineer','technician']){
   assert.equal(authorizeInventoryAction(trusted(role),'search').role,role);
   assert.equal(authorizeInventoryAction(trusted(role),'details').role,role);
   for(const action of ['upload','diff','publish','restore','audit','versions:list'])
     assert.throws(()=>authorizeInventoryAction(trusted(role),action),/FORBIDDEN/);
 }
});
test('only authenticated active owner can mutate',()=>{
 for(const action of ['search','details','versions:list','upload','diff','publish','restore','audit'])
   assert.equal(authorizeInventoryAction(trusted('owner'),action).role,'owner');
 for(const identity of [{authenticated:false,active:true,role:'owner'}, {authenticated:true,active:false,role:'owner'},null])
   assert.throws(()=>authorizeInventoryAction(identity,'publish'),/UNAUTHENTICATED/);
 assert.throws(()=>authorizeInventoryAction(trusted('owner'),'delete-all'),/UNKNOWN_ACTION/);
});
