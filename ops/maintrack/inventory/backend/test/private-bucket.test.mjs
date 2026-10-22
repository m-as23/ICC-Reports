import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createPrivateBucketArchive} from '../src/private-bucket.mjs';
function storageFixture({publicBucket=false}={}){
 const objects=new Map(),calls=[];
 const storage={
  async getBucket(bucket){calls.push(['getBucket',bucket]);return {data:{public:publicBucket}};},
  from(bucket){calls.push(['from',bucket]);return {
   async upload(key,bytes,options){calls.push(['upload',key,options]);if(objects.has(key))return {error:new Error('exists')};objects.set(key,Buffer.from(bytes));return {data:{path:key}};},
   async remove(keys){calls.push(['remove',keys]);for(const key of keys)objects.delete(key);return {data:keys};},
   async download(key){calls.push(['download',key]);if(!objects.has(key))return {error:new Error('not found')};const copy=Buffer.from(objects.get(key));return {data:{arrayBuffer:async()=>Uint8Array.from(copy).buffer}};}
  }}
 };
 return {storage,objects,calls};
}
test('Refuses public storage and invalid bucket before any upload',async()=>{
 const f=storageFixture({publicBucket:true});
 await assert.rejects(createPrivateBucketArchive({storage:f.storage,bucket:'maintrack-inventory-archive-staging'}),/PUBLIC_OR_UNAVAILABLE_BUCKET_DENIED/);
 assert.equal(f.calls.some(x=>x[0]==='from'),false);
 await assert.rejects(createPrivateBucketArchive({storage:f.storage,bucket:'BAD/URL'}),/STORAGE_CLIENT_AND_BUCKET_REQUIRED/);
});
test('Private archive stores exact bytes, never upserts, checks digest and key',async()=>{
 const f=storageFixture(),files=await createPrivateBucketArchive({storage:f.storage,bucket:'maintrack-inventory-archive-staging'});
 const key='inventory/imports/'+randomUUID()+'.xlsx',bytes=Buffer.from('synthetic non-secret file');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 await assert.rejects(files.putObject({key:'../escape.xlsx',bytes,sha256}),/INVALID_PRIVATE_OBJECT_KEY/);
 await assert.rejects(files.putObject({key,bytes,sha256:'f'.repeat(64)}),/UPLOAD_SHA_MISMATCH/);
 await files.putObject({key,bytes,sha256});
 assert.deepEqual(await files.getObject({key}),bytes);
 assert.equal(f.calls.find(x=>x[0]==='upload')[2].upsert,false);
 await assert.rejects(files.putObject({key,bytes,sha256}),/PRIVATE_UPLOAD_FAILED/);
 assert.equal(typeof files.createSignedUrl,'undefined');
 await files.deleteObject({key});
 await assert.rejects(files.getObject({key}),/PRIVATE_OBJECT_NOT_FOUND/);
});
