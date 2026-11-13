// Local loopback HTTP entry. Real Deno and PostgreSQL; never a cloud connection.
import pg from './pg-loopback.mjs';
const corePort=Number(Deno.env.get('CORE_PORT')),inventoryPort=Number(Deno.env.get('INVENTORY_PORT'));
const nativeServe=Deno.serve;
Deno.serve=handler=>nativeServe({hostname:'127.0.0.1',port:corePort},handler);
await import('./index.ts');
console.log('LOCAL_CORE_READY');
// Local-only composition: canonical Inventory also runs under Deno. The caller
// pins CJS detection for the installed generator-function export condition.
const {createReviewInventoryHttpHandler}=await import(Deno.env.get('INVENTORY_HANDLER'));
const {permanentChannel}=await import(Deno.env.get('PERMANENT_ADAPTER'));
const inventory=new pg.Pool({qaRole:'maintrack_qa_inventory_runtime'});
const bound={connect:()=>inventory.connect(),query:(q,p)=>inventory.query(q.replaceAll('public.mt_sessions','qa_security_final_20261025.mt_sessions').replaceAll('public.mt_users','qa_security_final_20261025.mt_users'),p)};
const denied=()=>{throw Error('NO_STORAGE_OPERATION_ALLOWED')};
const storage={async getBucket(){return {data:{public:false}};},from(){return {upload:denied,remove:denied,download:denied};}};
const handler=permanentChannel(inventory).wrap(await createReviewInventoryHttpHandler({pool:bound,storage,bucket:'maintrack-inventory-local-runtime',allowedOrigins:['https://localhost']}));
nativeServe({hostname:'127.0.0.1',port:inventoryPort},handler);
console.log('LOCAL_INVENTORY_READY');
