import pg from 'npm:pg@8.13.3';
import {createQaPool,withQaIsolation} from './inventory-guard.mjs';
import {createQaChannel,BUCKET} from './channel.mjs';
import {createReviewInventoryHttpHandler} from './backend/create-review-http-handler.mjs';
const pool=createQaPool({Pool:pg.Pool,envGet:(k:string)=>Deno.env.get(k)});
const channel=createQaChannel(pool);
const denied=()=>{throw Error('QA_STORAGE_OBJECT_OPERATIONS_DISABLED');};
const storage={async getBucket(bucket:string){
 if(bucket!==BUCKET||Deno.env.get('SUPABASE_URL')!=='https://szhstrafzkxzstjdcynl.supabase.co')throw Error('QA_STORAGE_TARGET_MISMATCH');
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!key)throw Error('QA_STORAGE_METADATA_CREDENTIAL_REQUIRED');
 const r=await fetch('https://szhstrafzkxzstjdcynl.supabase.co/storage/v1/bucket/'+BUCKET,{method:'GET',redirect:'error',headers:{authorization:'Bearer '+key,apikey:key},signal:AbortSignal.timeout(5000)});
 if(!r.ok)throw Error('QA_STORAGE_METADATA_UNAVAILABLE');const data=await r.json();
 if(data.id!==BUCKET||data.public!==false||Number(data.file_size_limit)!==2097152||!data.allowed_mime_types?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))throw Error('QA_BUCKET_CONFIGURATION_MISMATCH');
 return {data};
},from(bucket:string){if(bucket!==BUCKET)throw Error('QA_STORAGE_TARGET_MISMATCH');return {upload:denied,remove:denied,download:denied};}};
let initialized;
const initialize=()=>initialized??=createReviewInventoryHttpHandler({pool,storage,bucket:BUCKET,allowedOrigins:['https://localhost']}).catch(e=>{initialized=undefined;throw e;});
const readonlyActions=new Set(['inventorySnapshot','inventoryVersion','inventorySearch','inventorySearchPage','inventoryItem','inventoryHistory','inventoryVersions','inventoryActivity','inventorySearchCapabilities']);
async function boundedBody(req:Request){
 const reader=req.body?.getReader();if(!reader)throw Error('INVALID_BODY');const parts=[];let length=0;
 try{while(true){const x=await reader.read();if(x.done)break;length+=x.value.length;if(length>65536)throw Error('BODY_LIMIT');parts.push(x.value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let i=0;for(const p of parts){bytes.set(p,i);i+=p.length;}return bytes;
}
const handler=async (req:Request)=>{
 try{const bytes=await boundedBody(req);const b=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!readonlyActions.has(b?.action))return new Response('QA_INVENTORY_WRITES_DISABLED',{status:403});
  return await (await initialize())(new Request(req.url,{method:'POST',headers:req.headers,body:bytes}));
 }catch{return new Response('QA_INVENTORY_UNAVAILABLE',{status:503});}
};
Deno.serve(channel.wrap(withQaIsolation(handler,{attest:()=>pool.attest(),activeAuthorized:()=>channel.activeAuthorized()})));
