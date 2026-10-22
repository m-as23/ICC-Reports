// Fully synthetic integration: actual XLSX parser + private storage adapter +
// Postgres-store SQL call contract + Owner review service, no cloud endpoints.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createReviewInventoryRuntime} from '../src/create-review-runtime.mjs';
import {fixture} from './import-xlsx.test.mjs';

function environment(){
 const files=new Map(),events=[];
 const storage={
  async getBucket(name){events.push('checked-private:'+name);return {data:{public:false}};},
  from(){return {
   async upload(key,value,{upsert}){assert.equal(upsert,false);events.push('uploaded');files.set(key,Buffer.from(value));return {data:{path:key}};},
   async remove(keys){events.push('removed');keys.forEach(k=>files.delete(k));return {data:keys};},
   async download(key){const bytes=files.get(key);return bytes?{data:{arrayBuffer:async()=>Uint8Array.from(bytes).buffer}}:{error:new Error('missing')};}
  }}
 };
 const db={async query(sql,params){
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
  if(sql.includes('FROM inv_lab.active WHERE singleton=true'))return {rows:[{id:'9'}]};
  if(sql.includes('INSERT INTO inv_lab.versions')){events.push('created-pending');return {rows:[{id:'10'}]};}
  if(sql.includes('INSERT INTO inv_lab.items')){events.push('staged-items:'+String(params.length/6));return {rows:[]};}
  if(sql.includes('inv_lab.seal_version'))return {rows:[]};
  if(sql.includes('INSERT INTO inv_lab.audit'))return {rows:[]};
  throw Error('UNEXPECTED_TRANSACTION_QUERY');
 },release(){}};
 const pool={
  async connect(){return db;},
  async query(sql,params){
   if(sql.includes('FROM inv_lab.versions WHERE id=$1'))return {rows:[{id:'10',baseVersionId:'9',fileSha256:currentSha,filename:'sample.xlsx',status:'pending',itemCount:120}]};
   if(sql.includes('FROM inv_lab.active a LEFT JOIN inv_lab.versions'))return {rows:[{versionId:'9',generation:'3',approvedAt:null,filename:'older.xlsx'}]};
   if(sql.includes('FROM inv_lab.compare_version'))return {rows:[{code:'PART-00001',change_type:'NEW',old_description:null,old_quantity:null,old_location:null,new_description:'Parker M700 inverter 65A 90L',new_quantity:0,new_location:'R-1'}]};
   if(sql.includes('inv_lab.publish_version')){events.push('published');return {rows:[{id:'10'}]};}
   throw Error('UNEXPECTED_POOL_QUERY:'+sql.slice(0,80));
  }
 };
 let currentSha='';
 return {storage,pool,events,files,setSha(v){currentSha=v;}};
}
const session='a'.repeat(64);
test('Server-only runtime reads private bucket, real XLSX remains pending until Owner receipt publication',async()=>{
 const f=environment(),owner={authenticated:true,active:true,role:'owner',userId:'owner-qa'};
 const runtime=await createReviewInventoryRuntime({verifySession:async()=>owner,pool:f.pool,storage:f.storage,bucket:'maintrack-inventory-archive-staging'});
 assert.equal(f.events.length,1,'Initialization only validates private bucket');
 assert.equal(Object.keys(runtime).join(','),'service');
 const bytes=await fixture();
 const {createHash}=await import('node:crypto');
 f.setSha(createHash('sha256').update(bytes).digest('hex'));
 const draft=await runtime.service.execute({action:'inventoryDraft',session,bytes,filename:'sample.xlsx'});
 assert.equal(draft.draftId,'10');
 assert.equal(draft.summary.total,120);
 assert.equal(f.files.size,1);
 assert.equal(f.events.includes('published'),false);
 await assert.rejects(runtime.service.execute({action:'inventoryPublish',session,draftId:'10',reviewReceipt:draft.reviewReceipt}),/OWNER_REVIEW_REQUIRED/);
 await assert.rejects(runtime.service.execute({action:'inventoryPublish',session,draftId:'10',confirmReviewed:true,reviewReceipt:'f'.repeat(64)}),/REVIEW_RECEIPT_MISMATCH/);
 assert.deepEqual(await runtime.service.execute({action:'inventoryPublish',session,draftId:'10',confirmReviewed:true,reviewReceipt:draft.reviewReceipt}),{versionId:'10'});
 assert.equal(f.events.filter(x=>x==='published').length,1);
});
test('Non-Owner cannot parse or upload even if client submits forged owner role',async()=>{
 const f=environment(),user={authenticated:true,active:true,role:'technician',userId:'tech-qa'};
 const runtime=await createReviewInventoryRuntime({verifySession:async()=>user,pool:f.pool,storage:f.storage,bucket:'maintrack-inventory-archive-staging'});
 await assert.rejects(runtime.service.execute({action:'inventoryDraft',session,role:'owner',bytes:await fixture(),filename:'sample.xlsx'}),/FORBIDDEN/);
 assert.equal(f.files.size,0);
 assert(!f.events.includes('uploaded'));
});
