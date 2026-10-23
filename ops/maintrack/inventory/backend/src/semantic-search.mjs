import {createHash} from 'node:crypto';
import {inventoryTerms,matchesInventoryItem} from './search-normalizer.mjs';
import {normalizedVector} from './embedding-provider.mjs';
export function documentForItem(item){
 const text=[item.code,item.description,item.extra?.brand,item.extra?.model,item.extra?.iccCode].filter(x=>typeof x==='string'&&x.trim()).join('\n').slice(0,4000);
 return {code:item.code,text,hash:createHash('sha256').update(text).digest('hex')};
}
export function allowsSemanticItem(item,query){
 const q=query.normalize('NFKC').toLowerCase();
 const text=[item.code,item.description,item.extra?.model,item.extra?.iccCode].filter(Boolean).join(' ').toLowerCase();
 const compact=x=>x.replace(/[^a-z0-9]/g,'');
 const generic=new Set(['type','model','drive','motor','sensor','switch','inverter','relay','amp','amps','mm','kw']);
 for(const match of q.matchAll(/\b([a-z]{1,8})[\s-]+(\d[\w.-]*)\b/g))if(!generic.has(match[1])&&!compact(text).includes(compact(match[1]+match[2])))return false;
 const requiredContact=/normally\s*open|نورمال\s*اوبن|طبيعي\s*مفتوح/.test(q)?'no':/normally\s*closed|نورمال\s*كلوز|طبيعي\s*مغلق/.test(q)?'nc':null;
 if(requiredContact&&!new RegExp('\\b'+requiredContact+'\\b|normally\\s*'+(requiredContact==='no'?'open':'closed')).test(text))return false;
 const constraints=inventoryTerms(query).filter(t=>/\d/.test(t)||/^(?:pnp|npn|nc|no)$/.test(t));
 if(constraints.length&&!matchesInventoryItem(item,constraints))return false;
 const type=query.normalize('NFKC').match(/(?:\btype|تايب|طيب|نوع)\s*[:\-]?\s*([a-z])\b/i);
 if(type&&!new RegExp('\\btype[\\s:\\-]*'+type[1]+'\\b','i').test(item.description||''))return false;
 return true;
}
export function createSemanticSearch({store,index,embed,schedule=p=>{void p.catch(()=>{});},claim=async()=>true,now=Date.now,continueIndex}={}){
 const configured=typeof embed==='function'&&!!index;
 const model=embed?.model;
 let warming=null;
 const api={
  capabilities:()=>({cloud:configured,semantic:configured}),
  warm(){
   if(!configured)return Promise.resolve(false);
   if(warming)return warming;
   let followup;
   warming=(async()=>{
    let token,versionId,again=false,delayMs=0;
    try{
     const snapshot=await store.snapshot();versionId=snapshot.versionId;if(!versionId)return false;
     token=await index.claim(versionId,model);if(!token)return false;
     const docs=snapshot.items.map(documentForItem);await index.prepare?.(versionId,model,token,docs);
     const deadline=now()+40000;
     for(let batch=0;batch<512&&now()<deadline;batch++){
      if((await store.current()).versionId!==versionId)return false;
      const pending=await index.pending(versionId,model,docs,64);
      if(!pending.length)return await index.finish(versionId,model,token);
      const vectors=await embed(pending.map(d=>d.text));
      if(!Array.isArray(vectors)||vectors.length!==pending.length)throw Error('INVALID_EMBEDDING');
      await index.save(versionId,model,token,pending.map((d,i)=>({...d,vector:normalizedVector(vectors[i])})));
     }
     again=(await store.current()).versionId===versionId;return false;
    }catch{if(token){const retry=await index.fail?.(versionId,model,token).catch(()=>null);again=!!retry?.retry;delayMs=retry?.delayMs||0;}return false;}
    finally{if(token)await index.release(versionId,model,token).catch(()=>{});if(again&&typeof continueIndex==='function')followup={versionId,delayMs};}
   })().finally(()=>{warming=null;if(followup)schedule(Promise.resolve().then(()=>continueIndex(followup)).catch(()=>index.dispatchFailed?.(followup.versionId,model)));});
   return warming;
  },
  kick(){if(configured)schedule(api.warm());},
  async search({query,versionId,actor}={}){
   if(typeof query!=='string'||!query.trim()||query.length>120)throw Error('INVALID_QUERY');
   const snapshot=await store.snapshot();if(snapshot.versionId!==versionId)throw Error('INVENTORY_VERSION_CHANGED_RESTART_SEARCH');
   const local=reason=>({codes:[],mode:'local',reason,versionId});
   if(!configured)return local('NOT_CONFIGURED');
   try{
    const status=await index.status(versionId,model);
    if(!status.ready){api.kick();return {...local(status.error?'PROVIDER_UNAVAILABLE':'INDEXING'),indexed:status.indexed,total:status.total};}
    if(!await claim(actor))return local('DAILY_LIMIT');
    const vector=normalizedVector((await embed([query]))[0]);
    // Candidate selection is general vector retrieval; hard constraints only remove
    // semantic additions, never existing literal/technical results in the client.
    const candidates=await index.nearest(versionId,model,vector,100);
    if((await store.current()).versionId!==versionId)throw Error('INVENTORY_VERSION_CHANGED_RESTART_SEARCH');
    const rows=new Map(snapshot.items.map(x=>[x.code,x])),seen=new Set(),codes=[];
    for(const hit of candidates){const row=rows.get(hit.code);if(!row||seen.has(row.code)||!Number.isFinite(hit.similarity)||hit.similarity<.35||!allowsSemanticItem(row,query))continue;seen.add(row.code);codes.push(row.code);if(codes.length===50)break;}
    return {codes,mode:'semantic',versionId};
   }catch(e){if(e.message==='INVENTORY_VERSION_CHANGED_RESTART_SEARCH')throw e;return local('PROVIDER_UNAVAILABLE');}
  }
 };
 return api;
}
