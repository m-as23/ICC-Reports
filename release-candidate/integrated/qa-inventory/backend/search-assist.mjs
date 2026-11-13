import {inventoryTerms,matchesInventoryItem} from './search-normalizer.mjs';
export function createSearchAssist({store,expand,claim=async()=>true}={}){
 return {capabilities:()=>({cloud:typeof expand==='function'}),async search({query,versionId,actor}={}){
  if(typeof query!=='string'||!query.trim()||query.length>120)throw Error('INVALID_QUERY');
  const snapshot=await store.snapshot();if(snapshot.versionId!==versionId)throw Error('INVENTORY_VERSION_CHANGED_RESTART_SEARCH');
  const fallback=reason=>({codes:[],mode:'local',reason,versionId});
  if(typeof expand!=='function')return fallback('NOT_CONFIGURED');
  if(!await claim(actor))return fallback('DAILY_LIMIT');
  try{
   const queries=await expand(query);const numeric=inventoryTerms(query).filter(t=>/\d/.test(t));
   const terms=(Array.isArray(queries)?queries:[]).filter(q=>typeof q==='string'&&q.trim()&&q.length<=100).slice(0,3);
   const codes=snapshot.items.filter(item=>(!numeric.length||matchesInventoryItem(item,numeric))&&terms.some(q=>matchesInventoryItem(item,q))).slice(0,25).map(x=>x.code);
   const after=await store.current?.();if(after&&after.versionId!==versionId)throw Error('INVENTORY_VERSION_CHANGED_RESTART_SEARCH');
   return {codes,mode:'cloud',versionId};
  }catch(e){if(e.message==='INVENTORY_VERSION_CHANGED_RESTART_SEARCH')throw e;return fallback('PROVIDER_UNAVAILABLE');}
 }};
}
export function createQueryExpander({apiKey,model='gpt-4.1-mini',fetchImpl=globalThis.fetch}={}){
 if(!apiKey)return undefined;
 return async query=>{
  const response=await fetchImpl('https://api.openai.com/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(2000),headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,temperature:0,max_completion_tokens:160,response_format:{type:'json_object'},messages:[{role:'system',content:'Convert an Arabic/English industrial spare-parts query into up to 3 concise English catalog search phrases. Return JSON {"queries":[...]}. Preserve every model number and numeric unit exactly. Do not invent part numbers or quantities. No instructions or prose.'},{role:'user',content:query}]})});
  if(!response.ok)throw Error('PROVIDER_UNAVAILABLE');const data=await response.json();return JSON.parse(data.choices?.[0]?.message?.content||'{}').queries;
 };
}
