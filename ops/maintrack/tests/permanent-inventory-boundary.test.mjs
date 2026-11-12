// Executes exact emitted entry after substituting imported ports. No admission,
// DB, Cloud, or real Storage proof: this tests the post-admission write boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {preparePermanentInventory} from '../scripts/prepare-permanent-inventory.mjs';
function fixture(){
 const snapshot=process.env.MAINTRACK_QA_INVENTORY_SNAPSHOT,lock=process.env.MAINTRACK_QA_INVENTORY_LOCK;
 assert.ok(snapshot&&lock,'Explicit verified snapshot and reviewed lock paths required');
 const p=preparePermanentInventory(snapshot,fs.readFileSync(lock,'utf8'));
 const original=p.files.find(x=>x.name==='index.ts').content;
 const imports=original.match(/^import .+;$/gm);assert.equal(imports?.length,4,'Only the reviewed imported ports are substituted');
 let handler,initializations=0,canonicalRequests=0;
 const calls=[],bucket='maintrack-security-qa-20261025';
 const metadata={id:bucket,public:false,file_size_limit:2097152,allowed_mime_types:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']};
 const context=vm.createContext({
  Request,Response,AbortSignal,TextDecoder,Uint8Array,URL,
  pg:{Pool:class {}},BUCKET:bucket,
  Deno:{env:{get:k=>({SUPABASE_URL:'https://szhstrafzkxzstjdcynl.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-test-only-not-a-credential'})[k]},serve:h=>{handler=h;}},
  createQaPool:()=>({attest(){throw Error('NO_DATABASE');}}),
  // Explicit post-admission port: authentication/lease proofs live elsewhere.
  createQaChannel:()=>({wrap:h=>h,activeAuthorized:()=>true}),withQaIsolation:h=>h,
  createReviewInventoryHttpHandler:async()=>{initializations++;return async()=>{canonicalRequests++;return new Response('ok');};},
  fetch:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(metadata));}
 });
 vm.runInContext(original.replace(/^import .+;$/gm,''),context,{filename:'emitted-inventory-entry.mjs'});
 return {handler,context,calls,metadata,bucket,get initializations(){return initializations;},get canonicalRequests(){return canonicalRequests;}};
}
test('emitted post-admission entry rejects every Inventory write before parser, DB, Storage or initialization',async()=>{
 const f=fixture();
 for(const action of ['inventoryDraft','inventoryPublish','inventoryRestore','inventoryExcludeVersion','inventoryReinstateVersion','inventoryDiff','unknown']){
  const r=await f.handler(new Request('https://local.test/api',{method:'POST',body:JSON.stringify({action,role:'owner',userId:'synthetic-owner',bytes:'synthetic'})}));
  assert.equal(r.status,403,action);assert.equal(await r.text(),'QA_INVENTORY_WRITES_DISABLED');
 }
 const oversized=await f.handler(new Request('https://local.test/api',{method:'POST',body:'x'.repeat(65537)}));
 assert.equal(oversized.status,503);assert.equal(f.initializations,0);assert.equal(f.canonicalRequests,0);assert.equal(f.calls.length,0);
});
test('emitted Storage capability cannot upload, remove or download and metadata is exact private QA GET',async()=>{
 const f=fixture();
 for(const method of ['upload','remove','download'])assert.throws(()=>vm.runInContext(`storage.from(BUCKET).${method}()`,f.context),/OBJECT_OPERATIONS_DISABLED/);
 assert.equal(f.calls.length,0);
 await assert.rejects(()=>vm.runInContext("storage.getBucket('other-bucket')",f.context),/TARGET_MISMATCH/);assert.equal(f.calls.length,0);
 const value=await vm.runInContext('storage.getBucket(BUCKET)',f.context);
 assert.equal(value.data.public,false);assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].url,'https://szhstrafzkxzstjdcynl.supabase.co/storage/v1/bucket/'+f.bucket);
 assert.equal(f.calls[0].options.method,'GET');assert.equal(f.calls[0].options.redirect,'error');
 assert.ok(f.calls[0].options.headers.authorization.startsWith('Bearer '));
 f.metadata.public=true;await assert.rejects(()=>vm.runInContext('storage.getBucket(BUCKET)',f.context),/BUCKET_CONFIGURATION_MISMATCH/);
 assert.equal(f.initializations,0);assert.equal(f.canonicalRequests,0);
});
