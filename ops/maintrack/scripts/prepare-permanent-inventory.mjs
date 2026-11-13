// Offline, review-only package builder. No network, credentials, or deployment.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(import.meta.dirname,'../../..');
const hash=x=>createHash('sha256').update(x).digest('hex');
const pinned=Object.freeze({
 'index.ts':'5b4e52eb0062d0111758d9a09ea6e148a871ff9d59f6ccbdddf3b8b55c1f53af',
 'deno.json':'eafe82a6e4947ab0f26fb00fe1c31e6a3d64f6c93439b96c6476e0f16178cdf5',
 'inventory-guard.mjs':'fe3e30e47a88976ce17458d2a009b127213e426a0db4a2320b3303cb1fcf4593',
 'channel.mjs':'68e0574a0a0c459259a7bfac1241600b100d776b9f898152f7c39762276d57fc'
});
export function preparePermanentInventory(snapshotDirectory,runtimeLock){
 const baseline=Object.entries(pinned).map(([name,sha256])=>{
  const bytes=fs.readFileSync(path.join(snapshotDirectory,name));
  if(hash(bytes)!==sha256)throw Error('QA_INVENTORY_V9_SNAPSHOT_MISMATCH:'+name);
  return {name,content:bytes.toString('utf8'),sha256};
 });
 const files=baseline.filter(x=>!['index.ts','channel.mjs','deno.json'].includes(x.name)).map(({name,content})=>({name,content}));
 const lock=JSON.parse(runtimeLock||'null');
 if(lock?.version!=='5'||Object.keys(lock.specifiers||{}).length!==3||['pg@8.13.3','exceljs@4.4.0','yauzl@3.2.1'].some(s=>lock.specifiers['npm:'+s]!==s.slice(s.lastIndexOf('@')+1))||!Object.values(lock.npm||{}).length||Object.values(lock.npm).some(x=>!/^sha512-/.test(x.integrity||'')))throw Error('REVIEWED_RUNTIME_LOCK_REQUIRED');
 files.push({name:'deno.lock',content:runtimeLock});
 const guard=files.find(x=>x.name==='inventory-guard.mjs');
 if(guard.content.split('activeAuthorized=()=>false}').length!==2)throw Error('INVENTORY_ORIGIN_GUARD_CHANGED');
 guard.content=guard.content.replace('activeAuthorized=()=>false}',"activeAuthorized=()=>false,registeredOrigin=''}").replace("origin&&origin!=='https://localhost'","origin&&origin!=='https://localhost'&&origin!==registeredOrigin");
 for(const field of ['accounts','active_accounts','synthetic_accounts']){
  const before=`x.${field}===4`;if(!guard.content.includes(before))throw Error('QA_ATTESTATION_CONTRACT');
  guard.content=guard.content.replace(before,`x.${field}===2`);
 }
 const config=JSON.parse(baseline.find(x=>x.name==='deno.json').content);
 config.imports={...config.imports,exceljs:'npm:exceljs@4.4.0',yauzl:'npm:yauzl@3.2.1'};
 config.unstable=[...new Set([...(config.unstable||[]),'detect-cjs'])];config.lock={path:'./deno.lock',frozen:true};config.nodeModulesDir='none';
 files.push({name:'deno.json',content:JSON.stringify(config,null,2)+'\n'});
 const canonical=[];
 const source=path.join(root,'ops/maintrack/inventory/backend/src');
 for(const name of fs.readdirSync(source).filter(x=>x.endsWith('.mjs')).sort()){
  const original=fs.readFileSync(path.join(source,name),'utf8');
  const content=original.replaceAll('inv_lab.','qa_security_inventory_20261025.').replaceAll('public.mt_users','qa_security_final_20261025.mt_users').replaceAll('public.mt_sessions','qa_security_final_20261025.mt_sessions');
  files.push({name:'backend/'+name,content});canonical.push({path:'ops/maintrack/inventory/backend/src/'+name,sha256:hash(original),emittedSha256:hash(content)});
 }
 const adapter=fs.readFileSync(path.join(root,'ops/maintrack/security/qa-permanent-adapter.mjs'),'utf8');
 files.push({name:'permanent-adapter.mjs',content:adapter});
 files.push({name:'channel.mjs',content:"export {permanentChannel as createQaChannel} from './permanent-adapter.mjs';\nexport const BUCKET='maintrack-security-qa-20261025';\nexport function guardStorageRequest(){throw Error('QA_STORAGE_OPERATIONS_DISABLED');}\n"});
 files.push({name:'index.ts',content:entry});
 for(const file of files){
  if(/(?:file:\/\/\/|[A-Z]:[\\/]|\/Users\/|\/home\/)/.test(file.content))throw Error('ABSOLUTE_LOCAL_PATH_FORBIDDEN:'+file.name);
  for(const m of file.content.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
   const target=path.posix.normalize(path.posix.join(path.posix.dirname(file.name),m[1]));
   if(target.startsWith('../')||!files.some(x=>x.name===target))throw Error('PACKAGE_IMPORT_MISSING:'+target);
  }
 }
 return {deploy:false,projectRef:'szhstrafzkxzstjdcynl',slug:'maintrack-security-qa-inventory',baselineVersion:9,
  status:'REVIEW_ONLY_NOT_CLOUD_VERIFIED',baselineFiles:baseline.map(({name,sha256})=>({name,sha256})),canonical,
  sqlPrerequisite:'Atomic Core permanent SQL + restrictive Inventory lease RLS; verified role ancestry and schema identities',
  storageMode:'AUTHENTICATED_QA_METADATA_READ_ONLY_NO_OBJECT_OPERATIONS',writesEnabled:false,
  runtimeCompatibility:'Deno2.9.8 detect-cjs local PASS; Supabase Edge Runtime config support UNVERIFIED',
  files,sha256:Object.fromEntries(files.map(x=>[x.name,hash(x.content)]))};
}
const entry=`import pg from 'npm:pg@8.13.3';
import {createQaPool,withQaIsolation} from './inventory-guard.mjs';
import {createQaChannel,BUCKET} from './channel.mjs';
import {createReviewInventoryHttpHandler} from './backend/create-review-http-handler.mjs';
const pool=createQaPool({Pool:pg.Pool,envGet:k=>Deno.env.get(k)});
const registeredOrigin=Deno.env.get('MT_REGISTERED_ORIGIN');
const allowedOrigins=registeredOrigin?['https://localhost',registeredOrigin]:['https://localhost'];
const channel=createQaChannel(pool,{allowedOrigins});
const denied=()=>{throw Error('QA_STORAGE_OBJECT_OPERATIONS_DISABLED');};
const storage={async getBucket(bucket){
 if(bucket!==BUCKET||Deno.env.get('SUPABASE_URL')!=='https://szhstrafzkxzstjdcynl.supabase.co')throw Error('QA_STORAGE_TARGET_MISMATCH');
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!key)throw Error('QA_STORAGE_METADATA_CREDENTIAL_REQUIRED');
 const r=await fetch('https://szhstrafzkxzstjdcynl.supabase.co/storage/v1/bucket/'+BUCKET,{method:'GET',redirect:'error',headers:{authorization:'Bearer '+key,apikey:key},signal:AbortSignal.timeout(5000)});
 if(!r.ok)throw Error('QA_STORAGE_METADATA_UNAVAILABLE');const data=await r.json();
 if(data.id!==BUCKET||data.public!==false||Number(data.file_size_limit)!==2097152||!data.allowed_mime_types?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))throw Error('QA_BUCKET_CONFIGURATION_MISMATCH');
 return {data};
},from(bucket){if(bucket!==BUCKET)throw Error('QA_STORAGE_TARGET_MISMATCH');return {upload:denied,remove:denied,download:denied};}};
let initialized;
const initialize=()=>initialized??=createReviewInventoryHttpHandler({pool,storage,bucket:BUCKET,allowedOrigins}).catch(e=>{initialized=undefined;throw e;});
const readonlyActions=new Set(['inventorySnapshot','inventoryVersion','inventorySearch','inventorySearchPage','inventoryItem','inventoryHistory','inventoryVersions','inventoryActivity','inventorySearchCapabilities']);
async function boundedBody(req){
 const reader=req.body?.getReader();if(!reader)throw Error('INVALID_BODY');const parts=[];let length=0;
 try{while(true){const x=await reader.read();if(x.done)break;length+=x.value.length;if(length>65536)throw Error('BODY_LIMIT');parts.push(x.value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let i=0;for(const p of parts){bytes.set(p,i);i+=p.length;}return bytes;
}
const handler=async req=>{
 try{const bytes=await boundedBody(req);const b=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!readonlyActions.has(b?.action))return new Response('QA_INVENTORY_WRITES_DISABLED',{status:403});
  return await (await initialize())(new Request(req.url,{method:'POST',headers:req.headers,body:bytes}));
 }catch{return new Response('QA_INVENTORY_UNAVAILABLE',{status:503});}
};
Deno.serve(channel.wrap(withQaIsolation(handler,{attest:()=>pool.attest(),activeAuthorized:()=>channel.activeAuthorized(),registeredOrigin})));
`;
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [snapshot,out,lock]=process.argv.slice(2);if(!snapshot||!out||!lock)throw Error('SNAPSHOT_OUTPUT_AND_REVIEWED_DENO_LOCK_REQUIRED');
 fs.writeFileSync(out,JSON.stringify(preparePermanentInventory(snapshot,fs.readFileSync(lock,'utf8')),null,2)+'\n');console.log('INVENTORY_REVIEW_PACKAGE_ONLY');
}
