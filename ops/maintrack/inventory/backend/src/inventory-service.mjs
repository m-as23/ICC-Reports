// REVIEW ONLY MainTrack 0.4.7 — upstream 07dbac0c2a63cf58336ae8a2df383cbcf9f283be
// XLSX parser intentionally injected so upload cannot run without validated parser;
// no live Supabase session, public endpoint, or Storage write is set up here.
// Framework-neutral inventory action service. No listener, no public URL,
// no credentials, and no trusted user roles taken from client JSON.
import {createHash,timingSafeEqual} from 'node:crypto';
import {authorizeInventoryAction} from './domain.mjs';
const hex=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function receipt(diff){
 return hex({draftId:diff.draftId,base:diff.baseVersionId,sha:diff.fileSha256,
  counts:diff.counts,items:diff.details});
}
function identical(a,b){
 if(typeof a!=='string'||typeof b!=='string'||!/^[0-9a-f]{64}$/i.test(a)||!/^[0-9a-f]{64}$/i.test(b))return false;
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
export function createInventoryService({verifySession,store,parseXlsx}={}){
 if(typeof verifySession!=='function'||!store)throw Error('TRUSTED_SESSION_ADAPTER_REQUIRED');
 return {
  async execute(input={}){
   const action=String(input.action||'');
   // Only trusted server-side verification may supply userId/role.
   const identity=await verifySession(input.session);
   const permission={
    inventoryVersion:'search',inventorySearch:'search',inventoryItem:'details',
    inventoryDraft:'upload',inventoryDiff:'diff',inventoryPublish:'publish',
    inventoryHistory:'versions:list',inventoryRestore:'restore'
   }[action];
   if(!permission)throw Error('UNKNOWN_ACTION');
   const authorized=authorizeInventoryAction(identity,permission);
   const actor=String(authorized.userId||'').trim();
   if(!actor)throw Error('VERIFIED_USER_ID_REQUIRED');
   switch(action){
    case 'inventoryVersion':return store.current();
    case 'inventorySearch':return store.search(input.query,input.limit);
    case 'inventoryItem':return store.item(input.code);
    case 'inventoryDraft':{
      if(typeof parseXlsx!=='function')throw Error('XLSX_PARSER_NOT_CONFIGURED');
      const buffer=input.bytes;
      const parsed=await parseXlsx(buffer,{filename:input.filename});
      const staged=await store.stage({...parsed,buffer:Buffer.from(buffer),actor});
      const diff=await store.diff(staged.draftId);
      return {...staged,summary:{total:diff.total,counts:diff.counts,
        requiresExplicitReview:diff.requiresExplicitReview},reviewReceipt:receipt(diff)};
    }
    case 'inventoryDiff':{
      const diff=await store.diff(input.draftId);
      return {draftId:diff.draftId,baseVersionId:diff.baseVersionId,
        currentVersionId:diff.currentVersionId,isStale:diff.baseVersionId!==diff.currentVersionId,
        filename:diff.filename,counts:diff.counts,total:diff.total,
        requiresExplicitReview:diff.requiresExplicitReview,
        reviewReceipt:receipt(diff),
        details:diff.details.slice(0,Math.min(Math.max(Number(input.limit)||100,1),500)),
        truncated:diff.details.length>(Number(input.limit)||100)};
    }
    case 'inventoryPublish':{
      if(input.confirmReviewed!==true)throw Error('OWNER_REVIEW_REQUIRED');
      const diff=await store.diff(input.draftId);
      if(diff.currentVersionId!==diff.baseVersionId)throw Error('STALE_BASE_RECOMPARE_REQUIRED');
      if(!identical(input.reviewReceipt,receipt(diff)))throw Error('REVIEW_RECEIPT_MISMATCH');
      if(diff.requiresExplicitReview&&input.acknowledgeLargeAbsence!==true)
        throw Error('LARGE_ABSENCE_NEEDS_EXPLICIT_APPROVAL');
      return store.publish(diff.draftId,diff.baseVersionId,actor);
    }
    case 'inventoryHistory':return store.history(input.limit);
    case 'inventoryRestore':{
      const staged=await store.stageRestore(input.sourceVersionId,actor);
      const diff=await store.diff(staged.draftId);
      return {...staged,summary:{total:diff.total,counts:diff.counts},
        reviewReceipt:receipt(diff),requiresSeparatePublish:true};
    }
   }
  }
 };
}
