import test from 'node:test';import assert from 'node:assert/strict';import {PostgresInventoryStore} from '../src/postgres-store.mjs';
function fixture({missingJournal=false,uploadLost=false,commitLost=false,dbFailure=false}={}){
 const intents=new Map(),objects=new Map(),versions=new Map(),calls=[];let key;
 const db={release(){},async query(q,p=[]){
  if(q==='BEGIN'||q==='ROLLBACK')return {rows:[]};
  if(q==='COMMIT'){if(commitLost)throw Object.assign(Error('lost commit reply'),{code:'ECONNRESET'});return {rows:[]};}
  if(q.includes('FROM inv_lab.active'))return {rows:[{id:'9'}]};
  if(q.includes('INSERT INTO inv_lab.versions')){if(dbFailure)throw Error('synthetic stage failure');versions.set('10',p[3]);return {rows:[{id:'10'}]};}
  if(q.includes('UPDATE inv_lab.upload_intents')){intents.set(p[0],{...intents.get(p[0]),state:'ATTACHED',version_id:p[1]});return {rows:[]};}
  if(q.includes('inv_lab.items')||q.includes('inv_lab.audit')||q.includes('seal_version'))return {rows:[]};
  throw Error('UNEXPECTED_SQL');
 }};
 const pool={connect:async()=>db,async query(q,p=[]){if(q.includes('INSERT INTO inv_lab.upload_intents')){calls.push('reserve');if(missingJournal)throw Error('journal unavailable');if([...intents.values()].some(x=>x.state==='RESERVED'))throw Error('unresolved upload gate');key=p[0];intents.set(key,{storage_key:key,file_sha256:p[1],state:'RESERVED'});return {rows:[]};}if(q.includes('FROM inv_lab.upload_intents'))return {rows:intents.has(p[0])?[{...intents.get(p[0]),referenced:[...versions.values()].includes(p[0])}]:[]};throw Error('UNEXPECTED_POOL_SQL');}};
 const files={async putObject(x){assert.ok(intents.has(x.key),'ownership durable before external write');calls.push('put');objects.set(x.key,x.bytes);if(uploadLost)throw Error('lost upload response');},async deleteObject(){calls.push('delete');throw Error('must never blindly delete');}};
 return {store:new PostgresInventoryStore({pool,privateFiles:files}),calls,objects,intents,get key(){return key;}};
}
const input={items:[{code:'SYNTH-NEW',description:'new synthetic part',quantity:0,location:'QA-RACK',extra:{formula:{formula:'1+2',result:3}}}],filename:'synthetic.xlsx',fileSha256:'a'.repeat(64),buffer:Buffer.from('synthetic'),actor:'synthetic-owner'};
test('unavailable durable ownership journal fails before Storage',async()=>{const f=fixture({missingJournal:true});await assert.rejects(()=>f.store.stage(input),/journal unavailable/);assert.deepEqual(f.calls,['reserve']);});
test('lost upload response remains owned, bounded and inspectable without retry',async()=>{const f=fixture({uploadLost:true});await assert.rejects(()=>f.store.stage(input),/RECONCILIATION_REQUIRED/);assert.equal(f.objects.size,1);assert.equal((await f.store.inspectUpload(f.key)).state,'RESERVED');await assert.rejects(()=>f.store.stage(input),/unresolved upload gate/);assert.equal(f.calls.filter(x=>x==='put').length,1);assert.equal(f.calls.includes('delete'),false);});
test('DB failure preserves the owned object for explicit reconciliation',async()=>{const f=fixture({dbFailure:true});await assert.rejects(()=>f.store.stage(input),/RECONCILIATION_REQUIRED/);assert.equal((await f.store.inspectUpload(f.key)).referenced,false);assert.equal(f.objects.size,1);assert.equal(f.calls.includes('delete'),false);});
test('lost COMMIT reply never deletes a version-referenced file',async()=>{const f=fixture({commitLost:true});await assert.rejects(()=>f.store.stage(input),/RECONCILIATION_REQUIRED/);const proof=await f.store.inspectUpload(f.key);assert.equal(proof.referenced,true);assert.equal(proof.state,'ATTACHED');assert.equal(f.objects.size,1);assert.equal(f.calls.includes('delete'),false);});
test('successful staging links the durable reservation to its draft',async()=>{const f=fixture();assert.deepEqual(await f.store.stage(input),{draftId:'10',baseVersionId:'9'});assert.equal((await f.store.inspectUpload(f.key)).state,'ATTACHED');await assert.rejects(()=>f.store.inspectUpload('inventory/imports/'+ '0'.repeat(36)+'.xlsx'),/OWNED_UPLOAD/);});
