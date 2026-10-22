// End-to-end HTTP boundary with synthetic MainTrack sessions + repository.
// No real accounts, PostgreSQL instance, mail, Vercel, Supabase or uploads.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReviewInventoryHttpHandler} from '../src/create-review-http-handler.mjs';
const token='e'.repeat(64),origin='https://maintrack-staging-qa.invalid';
function sandbox(role='technician'){
 const calls=[];
 const storage={
  async getBucket(bucket){calls.push(['bucket',bucket]);return {data:{public:false}};},
  from(){return {upload(){throw Error('NO_STORAGE_UPLOAD_EXPECTED')},remove(){throw Error('NO_STORAGE_REMOVE_EXPECTED')},download(){throw Error('NO_STORAGE_DOWNLOAD_EXPECTED')}}}
 };
 const pool={
  async connect(){throw Error('NO_DB_WRITES_EXPECTED')},
  async query(sql,args){
   if(sql.includes('FROM public.mt_sessions')){
    calls.push(['verified-session',args[0]]);
    if(role===null)return {rows:[]};
    return {rows:[{userId:'synthetic-user',active:true,mustChange:false,role}]};
   }
   if(sql.includes('FROM inv_lab.active a LEFT JOIN inv_lab.versions')){
    calls.push(['approved-pointer']);return {rows:[{versionId:'1',generation:'2',approvedAt:null,filename:'approved.xlsx'}]};
   }
   throw Error('UNEXPECTED_QUERY');
  }
 };
 return {pool,storage,calls};
}
const post=(action,extras={})=>new Request(origin+'/api/inventory',{method:'POST',headers:{
 Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'
},body:JSON.stringify({action,role:'owner',userId:'forged-owner',session:'fake-token',...extras})});
test('Composition binds actual opaque MainTrack session, ignores forged owner fields, and returns approved version',async()=>{
 const f=sandbox('technician');
 const handler=await createReviewInventoryHttpHandler({pool:f.pool,storage:f.storage,bucket:'maintrack-inventory-archive-staging',allowedOrigins:[origin]});
 const response=await handler(post('inventoryVersion'));
 assert.equal(response.status,200);
 const json=await response.json();
 assert.deepEqual(json,{ok:true,data:{versionId:'1',generation:2,approvedAt:null,filename:'approved.xlsx'}});
 assert.deepEqual(f.calls,[['bucket','maintrack-inventory-archive-staging'],['verified-session',createHash('sha256').update(token).digest('hex')],['approved-pointer']]);
});
test('Technician and Engineer denied Owner audit and publication; spoof cannot elevate permissions',async()=>{
 for(const role of ['technician','engineer']){
  const f=sandbox(role),handler=await createReviewInventoryHttpHandler({pool:f.pool,storage:f.storage,bucket:'maintrack-inventory-archive-staging',allowedOrigins:[origin]});
  for(const action of ['inventoryHistory','inventoryDraft','inventoryPublish','inventoryRestore']){
   const response=await handler(post(action,{confirmReviewed:true,draftId:'9',fileBase64:Buffer.alloc(120,0x41).toString('base64')}));
   assert.equal(response.status,403,role+' '+action);
  }
  assert.equal(f.calls.filter(c=>c[0]==='verified-session').length,4);
 }
});
test('Revoked/missing MainTrack session rejected even with syntactically valid token',async()=>{
 const f=sandbox(null);
 const handler=await createReviewInventoryHttpHandler({pool:f.pool,storage:f.storage,bucket:'maintrack-inventory-archive-staging',allowedOrigins:[origin]});
 assert.equal((await handler(post('inventoryVersion'))).status,401);
 assert.equal(f.calls.some(x=>x[0]==='approved-pointer'),false);
});
test('Rejects incomplete bindings and unsafe origins BEFORE accepting requests',async()=>{
 const f=sandbox();
 await assert.rejects(createReviewInventoryHttpHandler({pool:f.pool,storage:f.storage,bucket:'maintrack-inventory-archive-staging',allowedOrigins:[]}),/EXPLICIT_HTTPS/);
 await assert.rejects(createReviewInventoryHttpHandler({pool:null,storage:f.storage,bucket:'maintrack-inventory-archive-staging',allowedOrigins:[origin]}),/PRIVATE_POSTGRES_POOL/);
});
