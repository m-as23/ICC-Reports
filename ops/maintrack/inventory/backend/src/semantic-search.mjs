import {createHash} from 'node:crypto';
import {inventoryTerms,matchesInventoryItem} from './search-normalizer.mjs';
import {normalizedVector} from './embedding-provider.mjs';
export function documentForItem(item){
 const text=[item.code,item.description,item.extra?.brand,item.extra?.model,item.extra?.iccCode].filter(x=>typeof x==='string'&&x.trim()).join('\n').slice(0,4000);
 return {code:item.code,text,hash:createHash('sha256').update(text).digest('hex')};
}
export function allowsSemanticItem(item,query){
 const constraints=inventoryTerms(query).filter(t=>/\d/.test(t)||/^(?:pnp|npn|nc|no)$/.test(t));
 if(constraints.length&&!matchesInventoryItem(item,constraints))return false;
 const type=query.normalize('NFKC').match(/(?:\btype|تايب|طيب|نوع)\s*[:\-]?\s*([a-z])\b/i);
 if(type&&!new RegExp('\\btype[\\s:\\-]*'+type[1]+'\\b','i').test(item.description||''))return false;
 return true;
}
export function createSemanticSearch({store,index,embed,schedule=p=>{void p.catch(()=>{});},claim=async()=>true,now=Date.now}={}){
 const configured=typeof embed==='function'&&!!index;
 const model=embed?.model;
 let warming=null;
 const api={
  capabilities:()=>({cloud:configured,semantic:configured}),
  warm(){
   if(!configured)return Promise.resolve(false);
   if(warming)return warming;
   warming=(async()=>{
    let token,versionId;
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
     return false;
    }catch{return false;}
    finally{if(token)await index.release(versionId,model,token).catch(()=>{});}
   })().finally(()=>{warming=null;});
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
    if(!status.ready){api.kick();return {...local('INDEXING'),indexed:status.indexed,total:status.total};}
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
