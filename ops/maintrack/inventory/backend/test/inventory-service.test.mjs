// Synthetic service-level QA only; no XLSX parser, database, HTTP server or mail.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createInventoryService} from '../src/inventory-service.mjs';
const session='a'.repeat(64);
const owner={authenticated:true,active:true,role:'owner',userId:'owner-1'};
const technician={authenticated:true,active:true,role:'technician',userId:'tech-1'};
const baseDiff={draftId:'10',baseVersionId:'9',currentVersionId:'9',
 fileSha256:'f'.repeat(64),counts:{NEW:1,CHANGED:0,ABSENT:11,UNCHANGED:0},
 total:1,requiresExplicitReview:true,details:[{code:'ABC',type:'NEW',after:{description:'Cable'}}]};
function fixture(user=owner){
 const seen=[],diff={...baseDiff};
 const store={
 current:async()=>({versionId:'9'}),search:async(q,limit)=>{seen.push(['search',q,limit]);return [];},
 item:async code=>({code}),searchPage:async(q,o)=>{seen.push(['searchPage',q,o]);return {versionId:'9',items:[]};},stage:async input=>{seen.push(['stage',input]);return {draftId:'10',baseVersionId:'9'};},
 diff:async()=>diff,
 publish:async (...args)=>{seen.push(['publish',args]);return {versionId:'10'};},
 history:async()=>[],stageRestore:async()=>({draftId:'10',baseVersionId:'9'})
 };
 const parser=async(bytes)=>{seen.push(['parse',bytes]);return {filename:'demo.xlsx',fileSha256:'f'.repeat(64),items:[{code:'ABC',quantity:1}]};};
 return {seen,diff,store,parser,make:(options={})=>createInventoryService({verifySession:async()=>user,store,parseXlsx:parser,...options})};
}
test('Technician reads confirmed inventory only; spoofing body role never grants upload/history/publish',async()=>{
 const f=fixture(technician),service=f.make();
 assert.deepEqual(await service.execute({action:'inventorySearch',query:'Parker 65A',role:'owner',session}),[]);
 assert.deepEqual(f.seen,[['search','Parker 65A',undefined]]);
 for(const action of ['inventoryDraft','inventoryPublish','inventoryHistory','inventoryDiff','inventoryRestore']){
  await assert.rejects(()=>service.execute({action,role:'owner',userId:'fake-owner',session}),/FORBIDDEN/);
 }
 assert.equal(f.seen.length,1);
});
test('Paged query forwards pinned approved version to store, not caller role',async()=>{
 const f=fixture(technician),service=f.make();
 assert.deepEqual(await service.execute({action:'inventorySearchPage',query:'Parker',offset:50,limit:25,versionId:'9',role:'owner',session}),{versionId:'9',items:[]});
 assert.deepEqual(f.seen,[['searchPage','Parker',{limit:25,offset:50,versionId:'9'}]]);
});
test('Owner upload stays pending, receipt binds complete current diff and requires explicit review',async()=>{
 const f=fixture(),service=f.make();
 const drafted=await service.execute({action:'inventoryDraft',bytes:Buffer.from('synthetic'),filename:'demo.xlsx',session});
 assert.equal(drafted.draftId,'10');
 assert.match(drafted.reviewReceipt,/^[a-f0-9]{64}$/);
 assert.equal(f.seen.some(x=>x[0]==='publish'),false,'Upload never publishes');
 await assert.rejects(()=>service.execute({action:'inventoryPublish',draftId:'10',reviewReceipt:drafted.reviewReceipt,session}),/OWNER_REVIEW_REQUIRED/);
 await assert.rejects(()=>service.execute({action:'inventoryPublish',draftId:'10',confirmReviewed:true,reviewReceipt:'0'.repeat(64),session}),/REVIEW_RECEIPT_MISMATCH/);
 await assert.rejects(()=>service.execute({action:'inventoryPublish',draftId:'10',confirmReviewed:true,reviewReceipt:drafted.reviewReceipt,session}),/LARGE_ABSENCE_NEEDS_EXPLICIT_APPROVAL/);
 const approved=await service.execute({action:'inventoryPublish',draftId:'10',confirmReviewed:true,acknowledgeLargeAbsence:true,reviewReceipt:drafted.reviewReceipt,session});
 assert.deepEqual(approved,{versionId:'10'});
 assert.deepEqual(f.seen.filter(x=>x[0]==='publish'),[['publish',['10','9','owner-1']]]);
});
test('Stale base or modified diff rejects old receipt before any publish write',async()=>{
 const f=fixture(),service=f.make();
 const read=await service.execute({action:'inventoryDiff',draftId:'10',session});
 f.diff.currentVersionId='11';
 await assert.rejects(()=>service.execute({action:'inventoryPublish',draftId:'10',confirmReviewed:true,reviewReceipt:read.reviewReceipt,acknowledgeLargeAbsence:true,session}),/STALE_BASE_RECOMPARE_REQUIRED/);
 f.diff.currentVersionId='9';
 f.diff.details.push({code:'UNREVIEWED',type:'NEW'});
 await assert.rejects(()=>service.execute({action:'inventoryPublish',draftId:'10',confirmReviewed:true,reviewReceipt:read.reviewReceipt,acknowledgeLargeAbsence:true,session}),/REVIEW_RECEIPT_MISMATCH/);
 assert.equal(f.seen.some(x=>x[0]==='publish'),false);
});
test('Upload fails closed if parser not configured or session revoked',async()=>{
 const f=fixture();const missing=f.make({parseXlsx:null});
 await assert.rejects(()=>missing.execute({action:'inventoryDraft',session,bytes:Buffer.from('synthetic')}),/XLSX_PARSER_NOT_CONFIGURED/);
 const revoked=createInventoryService({verifySession:async()=>null,store:f.store,parseXlsx:f.parser});
 await assert.rejects(()=>revoked.execute({action:'inventorySearch',session}),/UNAUTHENTICATED/);
 assert.equal(f.seen.length,0);
});


test('Complete diffs are paged with stable full-diff receipt, no unseen rows omitted',async()=>{
 const f=fixture();f.diff.details=Array.from({length:1203},(_,i)=>({code:'P-'+i,type:'CHANGED',after:{quantity:i}}));
 const service=f.make(),all=[],receipts=new Set();let offset=0;
 for(let i=0;i<4;i++){
  const p=await service.execute({action:'inventoryDiff',session,draftId:'10',limit:400,offset});
  assert.equal(p.detailsTotal,1203);
  assert.equal(p.offset,offset);
  all.push(...p.details);receipts.add(p.reviewReceipt);
  if(!p.hasMore){assert.equal(p.nextOffset,null);break;}
  assert.equal(p.truncated,true);
  offset=p.nextOffset;
 }
 assert.equal(all.length,1203);
 assert.equal(new Set(all.map(x=>x.code)).size,1203);
 assert.equal(receipts.size,1,'Every page is tied to identical complete diff');
 await assert.rejects(()=>service.execute({action:'inventoryDiff',session,draftId:'10',limit:501}),/INVALID_LIMIT/);
 await assert.rejects(()=>service.execute({action:'inventoryDiff',session,draftId:'10',offset:-1}),/INVALID_OFFSET/);
});
