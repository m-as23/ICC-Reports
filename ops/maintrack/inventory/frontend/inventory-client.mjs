import {collectOwnerDiff} from '../backend/src/owner-review-pagination.mjs';
export function createInventoryClient({endpoint,readSession,fetchImpl=globalThis.fetch,onAuthFailure=()=>{}}={}){
 if(!/^https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/maintrack-inventory-047-qa$/.test(endpoint||''))throw Error('UNREVIEWED_INVENTORY_ENDPOINT');
 let searchPin=null,reviewed=null,reviewSession=null;const pending=new Set();
 const session=()=>{const s=readSession?.();if(!s||!/^[a-f0-9]{64}$/i.test(s.token||''))throw Error('UNAUTHENTICATED');return s;};
 const owner=()=>{if(session().role!=='owner')throw Error('FORBIDDEN');};
 async function call(action,input={},options={}){
  const s=session(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  const abort=()=>controller.abort();pending.add(controller);options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
  try{
   const response=await fetchImpl(endpoint,{method:'POST',signal:controller.signal,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.token},body:JSON.stringify({...input,action})});
   const result=await response.json();
   if(session().token!==s.token)throw Error('SESSION_CHANGED');
   if(!response.ok||result.ok!==true){const error=Error(result.error||'INVENTORY_UNAVAILABLE');if(['AUTH','UNAUTHENTICATED','STALE_SESSION','FORBIDDEN'].includes(error.message))onAuthFailure(error);throw error;}
   return result.data;
  }finally{clearTimeout(timer);pending.delete(controller);options.signal?.removeEventListener('abort',abort);}
 }
 return Object.freeze({
  version:options=>call('inventoryVersion',{},options),
  snapshot:options=>call('inventorySnapshot',{},options),
  capabilities:()=>call('inventorySearchCapabilities'),
  assist:(input,options)=>call('inventorySearchAssist',input,options),
  restore:sourceVersionId=>{owner();reviewed=null;return call('inventoryRestore',{sourceVersionId});},
  async search(query,{offset=0,limit=50}={}){
   const q=String(query||'').trim();if(!q)throw Error('INVALID_QUERY');
   const token=session().token;
   if(offset===0)searchPin=null;
   else if(!searchPin||searchPin.query!==q||searchPin.token!==token)throw Error('RESTART_SEARCH_REQUIRED');
   try{
    const data=await call('inventorySearchPage',{query:q,offset,limit,...(searchPin?{versionId:searchPin.versionId}:{})});
    searchPin={query:q,token,versionId:data.versionId};return data;
   }catch(e){searchPin=null;throw e;}
  },
  item:code=>call('inventoryItem',{code}),
  async upload(file){
   owner();reviewed=null;
   if(!file||!/^.*\.xlsx$/i.test(file.name||''))throw Error('ONLY_XLSX_ALLOWED');
   if(file.size>2*1024*1024)throw Error('XLSX_DIRECT_UPLOAD_REQUIRED');
   const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
   for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
   return call('inventoryDraft',{filename:file.name,fileBase64:btoa(binary)});
  },
  async review(draftId){
   owner();reviewed=null;const token=session().token;let summary;
   const result=await collectOwnerDiff({draftId,fetchPage:async args=>{const page=await call('inventoryDiff',args);summary??=page;return page;}});
   if(session().token!==token)throw Error('SESSION_CHANGED');
   reviewed={...result,total:summary.total,counts:summary.counts,filename:summary.filename,requiresExplicitReview:summary.requiresExplicitReview};reviewSession=token;
   return reviewed;
  },
  async publish({confirmReviewed,acknowledgeLargeAbsence=false}={}){
   owner();if(!reviewed?.complete||reviewSession!==session().token)throw Error('COMPLETE_REVIEW_REQUIRED');
   if(confirmReviewed!==true)throw Error('OWNER_REVIEW_REQUIRED');
   if(reviewed.requiresExplicitReview&&!acknowledgeLargeAbsence)throw Error('LARGE_ABSENCE_NEEDS_EXPLICIT_APPROVAL');
   const active=reviewed;reviewed=null;
   return call('inventoryPublish',{draftId:active.draftId,reviewReceipt:active.reviewReceipt,confirmReviewed:true,acknowledgeLargeAbsence});
  },
  history:()=>{owner();return call('inventoryHistory',{limit:100});},
  versions:options=>{owner();return call('inventoryVersions',options);},
  activity:options=>{owner();return call('inventoryActivity',options);},
  exclude:input=>{owner();return call('inventoryExcludeVersion',input);},
  reinstate:input=>{owner();return call('inventoryReinstateVersion',input);},
  reset(){for(const controller of pending)controller.abort();pending.clear();searchPin=null;reviewed=null;reviewSession=null;}
 });
}
