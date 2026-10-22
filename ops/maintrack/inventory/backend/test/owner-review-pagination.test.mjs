// MainTrack 0.4.7 synthetic-only Owner diff review pagination; NO DB, no API, no publish.
import test from 'node:test';
import assert from 'node:assert/strict';
import {collectOwnerDiff} from '../src/owner-review-pagination.mjs';
const receipt='a'.repeat(64);
const mk=({detailsTotal=1203,mutate=(p)=>p}={})=>{
 const all=Array.from({length:detailsTotal},(_,i)=>({code:'PART-'+String(i+1).padStart(5,'0'),type:'CHANGED',after:{quantity:i}}));
 const calls=[];
 const fetchPage=async({draftId,limit,offset})=>{
  calls.push({draftId,limit,offset});
  const details=all.slice(offset,offset+limit);
  const next=offset+details.length,more=next<detailsTotal;
  return mutate({draftId,baseVersionId:'9',currentVersionId:'9',isStale:false,reviewReceipt:receipt,
   detailsTotal,details,offset,limit,hasMore:more,nextOffset:more?next:null},calls.length);
 };
 return {fetchPage,calls};
};
test('Owner review receives every one of 1203 changes with stable full-diff receipt',async()=>{
 const f=mk();
 const out=await collectOwnerDiff({fetchPage:f.fetchPage,draftId:'10',limit:400});
 assert.equal(out.complete,true);
 assert.equal(out.detailsTotal,1203);
 assert.equal(out.details.length,1203);
 assert.equal(out.reviewReceipt,receipt);
 assert.deepEqual(f.calls.map(p=>p.offset),[0,400,800,1200]);
 assert.equal(new Set(out.details.map(x=>x.code)).size,1203);
 assert.equal('confirmReviewed' in out,false,'Preview completion never implies Owner approval');
 assert.equal('publish' in out,false,'Preview does not publish to server');
});
test('Blocks a receipt that changes midway, even if pages have correct lengths',async()=>{
 const f=mk({mutate:(p,n)=>n===2?{...p,reviewReceipt:'b'.repeat(64)}:p});
 await assert.rejects(()=>collectOwnerDiff({fetchPage:f.fetchPage,draftId:'10',limit:400}),/DIFF_CHANGED_DURING_REVIEW/);
 assert.equal(f.calls.length,2);
});
test('Blocks publication review if Owner base changes between pages',async()=>{
 const f=mk({mutate:(p,n)=>n===2?{...p,currentVersionId:'11'}:p});
 await assert.rejects(()=>collectOwnerDiff({fetchPage:f.fetchPage,draftId:'10',limit:400}),/DIFF_CHANGED_DURING_REVIEW/);
});
test('Refuses short/missing page, fake nextOffset or empty infinite page',async()=>{
 for(const mutate of [
  p=>({...p,details:p.details.slice(0,20)}),
  p=>({...p,nextOffset:999}),
  p=>({...p,details:[],nextOffset:p.offset,hasMore:true})
 ]){
  const f=mk({mutate});
  await assert.rejects(()=>collectOwnerDiff({fetchPage:f.fetchPage,draftId:'10',limit:400}),/DIFF_PAGE_MISSING_OR_OUT_OF_ORDER|DIFF_PAGE_NO_PROGRESS/);
 }
});
test('Duplicate or invalid stock codes across pages must never pass review',async()=>{
 const f=mk({mutate:(p,n)=>n===2?{...p,details:[{...p.details[0],code:'PART-00001'},...p.details.slice(1)]}:p});
 await assert.rejects(()=>collectOwnerDiff({fetchPage:f.fetchPage,draftId:'10',limit:400}),/DIFF_DUPLICATE_OR_INVALID_CODE/);
});
test('Rejects stale response, too many changes, wrong draft or invalid page bounds',async()=>{
 const stale=mk({mutate:p=>({...p,isStale:true})});
 await assert.rejects(()=>collectOwnerDiff({fetchPage:stale.fetchPage,draftId:'10'}),/DIFF_STALE_OR_INVALID/);
 const mismatch=mk({mutate:p=>({...p,draftId:'11'})});
 await assert.rejects(()=>collectOwnerDiff({fetchPage:mismatch.fetchPage,draftId:'10'}),/DIFF_STALE_OR_INVALID/);
 const large=mk({detailsTotal:501});
 await assert.rejects(()=>collectOwnerDiff({fetchPage:large.fetchPage,draftId:'10',maxDetails:500}),/DIFF_SIZE_INVALID/);
 await assert.rejects(()=>collectOwnerDiff({fetchPage:large.fetchPage,draftId:'10',limit:501}),/INVALID_LIMIT/);
});
