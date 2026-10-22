// REVIEW-ONLY v0.4.7 integration test: pinned upstream SpareParts-Search-Lab @ 07dbac0c2a63cf58336ae8a2df383cbcf9f283be.
// No Supabase / Vercel changes, no inventory database operations executed by this module alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createInventoryHttpHandler} from '../src/http-adapter.mjs';
const url='https://spare-parts.test.invalid/api';
const origin='https://qa-maintrack.invalid';
const valid='a'.repeat(64);
const recorded=[];
const service={async execute(input){
 recorded.push(input);
 if(input.session!==valid)throw Error('UNAUTHENTICATED');
 if(input.action==='inventoryPublish')throw Error('STALE_BASE_RECOMPARE_REQUIRED');
 if(input.action==='inventoryDraft')return {count:input.bytes.length};
 return {action:input.action};
}};
const route=createInventoryHttpHandler({service,allowedOrigins:[origin]});
const request=(body,{method='POST',session=valid,requestOrigin=origin,contentType='application/json'}={})=>
 new Request(url,{method,headers:{Authorization:'Bearer '+session,Origin:requestOrigin,'Content-Type':contentType},
 body:method==='POST'?JSON.stringify(body):undefined});
test('CORS allows only explicit origin, no access-control wildcard or cookies',async()=>{
 const p=await route(new Request(url,{method:'OPTIONS',headers:{origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}}));
 assert.equal(p.status,204);
 assert.equal(p.headers.get('access-control-allow-origin'),origin);
 assert(!p.headers.get('access-control-allow-credentials'));
 const denied=await route(request({action:'inventoryVersion'},{requestOrigin:'https://evil.invalid'}));
 assert.equal(denied.status,403);
 assert.equal(denied.headers.get('access-control-allow-origin'),null);
 assert.equal(recorded.length,0);
});
test('Requires Bearer authorization even with forged body role/session and rejects untrusted origins',async()=>{
 const deny=await route(request({action:'inventoryPublish',role:'owner',session:valid},{session:'x'}));
 assert.equal(deny.status,401);
 assert.equal(recorded.length,0);
 const spoof=await route(request({action:'inventoryVersion',role:'owner',userId:'admin',session:'forged'}));
 assert.equal(spoof.status,200);
 assert.equal(recorded.length,1);
 assert.equal(recorded[0].session,valid);
 assert.equal(Object.hasOwn(recorded[0],'role'),false);
 assert.equal(Object.hasOwn(recorded[0],'userId'),false);
});
test('Does not accept arbitrary methods or form/content-type requests',async()=>{
 assert.equal((await route(new Request(url,{method:'GET',headers:{Origin:origin}}))).status,405);
 assert.equal((await route(request({action:'inventoryVersion'},{contentType:'text/plain'}))).status,415);
});
test('Maps stale conflicts to HTTP409 and suppresses backend stack/internal SQL',async()=>{
 const out=await route(request({action:'inventoryPublish',confirmReviewed:true,reviewReceipt:'x'.repeat(64)}));
 assert.equal(out.status,409);
 assert.deepEqual(await out.json(),{ok:false,error:'STALE_BASE_RECOMPARE_REQUIRED'});
});
test('Upload must be exact bounded base64, not a path or an oversized request',async()=>{
 const n=recorded.length;
 const bad=await route(request({action:'inventoryDraft',filename:'inventory.xlsx',fileBase64:'%%%'}));
 assert.equal(bad.status,422);
 assert.equal(recorded.length,n);
 const payload=Buffer.from('This is an isolated test file, not a real workbook.').toString('base64');
 const ok=await route(request({action:'inventoryDraft',filename:'inventory.xlsx',fileBase64:payload}));
 assert.equal(ok.status,422); // fewer than 100 base64 characters: rejected as suspicious
});
test('HTTP constructor fails closed if HTTPS allowed origins are not configured',()=>{
 assert.throws(()=>createInventoryHttpHandler({service,allowedOrigins:[]}),/EXPLICIT_HTTPS/);
 assert.throws(()=>createInventoryHttpHandler({service,allowedOrigins:['http://site.invalid']}),/EXPLICIT_HTTPS/);
});


test('Vercel-safe small-XLSX boundary returns 413 for oversized upload BEFORE touching storage',async()=>{
 const n=recorded.length;
 const oversized=Buffer.alloc(2*1024*1024+64,0x41).toString('base64');
 const response=await route(request({action:'inventoryDraft',filename:'large.xlsx',fileBase64:oversized}));
 assert.equal(response.status,413);
 assert.deepEqual(await response.json(),{ok:false,error:'XLSX_DIRECT_UPLOAD_REQUIRED'});
 assert.equal(recorded.length,n,'Oversized upload must not reach service, database or bucket');
});
test('Rejects oversized JSON request with HTTP413, no backend call',async()=>{
 const n=recorded.length;
 const response=await route(request({action:'inventoryVersion',junk:'x'.repeat(4*1024*1024)}));
 assert.equal(response.status,413);
 assert.equal(recorded.length,n);
});
