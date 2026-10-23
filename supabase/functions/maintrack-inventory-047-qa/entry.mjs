// MainTrack inventory only. Existing MainTrack functions and data are untouched.
import pg from 'npm:pg@8.13.3';
import {Buffer} from 'node:buffer';
import {createReviewInventoryHttpHandler} from '../../../ops/maintrack/inventory/backend/src/create-review-http-handler.mjs';
globalThis.Buffer??=Buffer;
const url=Deno.env.get('SUPABASE_URL');
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const pool=new pg.Pool({connectionString:Deno.env.get('SUPABASE_DB_URL'),max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:7000});
const bucket='maintrack-inventory-archive-staging';
const allowedOrigins=['https://maintrack-final-security-jb82mdyun-mohamedashrefsrag-5918.vercel.app','https://maintrack-final-security-6oskca75z-mohamedashrefsrag-5918.vercel.app','https://maintrack-final-security-5c2j4jzn0-mohamedashrefsrag-5918.vercel.app','https://localhost','https://maintrack-final-security-km1nq1386-mohamedashrefsrag-5918.vercel.app','https://maintrack-final-security-b0ib33obd-mohamedashrefsrag-5918.vercel.app'];
async function storageRequest(path,{method='GET',body,headers={}}={}){
 const response=await fetch(url+'/storage/v1/'+path,{method,headers:{Authorization:'Bearer '+key,apikey:key,...headers},body,signal:AbortSignal.timeout(30000)});
 if(!response.ok)return {error:{code:'PRIVATE_STORAGE_REQUEST_FAILED'}};
 return {response};
}
const storage={
 async getBucket(id){const result=await storageRequest('bucket/'+encodeURIComponent(id));return result.error?result:{data:await result.response.json()};},
 from(id){const object=key=>'object/'+encodeURIComponent(id)+'/'+key.split('/').map(encodeURIComponent).join('/');return {
  async upload(key,bytes,options){const r=await storageRequest(object(key),{method:'POST',headers:{'Content-Type':options.contentType,'x-upsert':'false'},body:bytes});return r.error?r:{data:{path:key}};},
  async download(key){const r=await storageRequest(object(key));return r.error?r:{data:await r.response.blob()};},
  async remove(keys){const r=await storageRequest('object/'+encodeURIComponent(id),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:keys})});return r.error?r:{data:true};}
 };}
};
let ready;
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async request=>{
 const path=new URL(request.url).pathname;
 if(request.method==='GET'&&path.endsWith('/healthz'))return response({service:'maintrack-inventory-047-qa',status:'up'});
 if(!['POST','OPTIONS'].includes(request.method))return response({ok:false,error:'METHOD_NOT_ALLOWED'},405);
 try{
  if(!url||!key||!Deno.env.get('SUPABASE_DB_URL'))throw Error('INVENTORY_NOT_CONFIGURED');
  ready??=createReviewInventoryHttpHandler({pool,storage,bucket,allowedOrigins}).catch(e=>{ready=null;throw e;});
  return await (await ready)(request);
 }catch{
  const origin=request.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(allowedOrigins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
  return new Response(JSON.stringify({ok:false,error:'INVENTORY_NOT_READY'}),{status:503,headers});
 }
});
