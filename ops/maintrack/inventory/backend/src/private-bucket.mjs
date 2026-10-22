// MainTrack 0.4.7 REVIEW-ONLY; immutable upstream 07dbac0c2a63cf58336ae8a2df383cbcf9f283be; no live credentials/deployments.
// Supabase Storage PRIVATE bucket adapter (not deployed or configured).
// Construct only from trusted server-side Supabase client; never browser, never service key in APK.
// No createSignedUrl or public URL methods are exposed.
import {createHash} from 'node:crypto';
const safeKey=key=>typeof key==='string'&&/^inventory\/imports\/[0-9a-f-]{36}\.xlsx$/.test(key);
const bufferOf=v=>Buffer.isBuffer(v)?v:Buffer.from(v);
export async function createPrivateBucketArchive({storage,bucket}={}){
 if(!storage?.getBucket||!storage?.from||typeof bucket!=='string'||!/^[-a-z0-9_]{3,60}$/.test(bucket))
  throw Error('STORAGE_CLIENT_AND_BUCKET_REQUIRED');
 const status=await storage.getBucket(bucket);
 if(status.error||!status.data||status.data.public!==false)
  throw Error('PUBLIC_OR_UNAVAILABLE_BUCKET_DENIED');
 const privateBucket=storage.from(bucket);
 if(!privateBucket?.upload||!privateBucket?.remove||!privateBucket?.download)
  throw Error('PRIVATE_BUCKET_OPERATIONS_REQUIRED');
 return Object.freeze({
  async putObject({key,bytes,sha256}){
   if(!safeKey(key)||!/^[a-f0-9]{64}$/.test(sha256||''))throw Error('INVALID_PRIVATE_OBJECT_KEY');
   const data=bufferOf(bytes);
   if(createHash('sha256').update(data).digest('hex')!==sha256)throw Error('UPLOAD_SHA_MISMATCH');
   const response=await privateBucket.upload(key,data,{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',cacheControl:'0',upsert:false});
   if(response.error)throw Error('PRIVATE_UPLOAD_FAILED');
  },
  async getObject({key}){
   if(!safeKey(key))throw Error('INVALID_PRIVATE_OBJECT_KEY');
   const response=await privateBucket.download(key);
   if(response.error||!response.data)throw Error('PRIVATE_OBJECT_NOT_FOUND');
   return Buffer.from(await response.data.arrayBuffer());
  },
  async deleteObject({key}){
   // Intended ONLY for fresh transaction rollback (not approved/archive versions).
   if(!safeKey(key))throw Error('INVALID_PRIVATE_OBJECT_KEY');
   const response=await privateBucket.remove([key]);
   if(response.error)throw Error('PRIVATE_REMOVE_FAILED');
  }
 });
}
