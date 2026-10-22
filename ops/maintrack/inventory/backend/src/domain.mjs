// REVIEW-ONLY v0.4.7 integration test: pinned upstream SpareParts-Search-Lab @ 07dbac0c2a63cf58336ae8a2df383cbcf9f283be.
// No Supabase / Vercel changes, no inventory database operations executed by this module alone.
// Pure inventory-domain contract: no network, no secrets, no MainTrack dependencies.
// The authenticated Edge adapter must validate an opaque MainTrack session SERVER-SIDE.
const text=(v)=>String(v??'').trim();
export const normalizeCode=(v)=>text(v).toUpperCase();
export const normalizeDescription=(v)=>text(v).replace(/\s+/g,' ');
export function validateAndNormalizeRows(rows){
  if(!Array.isArray(rows)||!rows.length)throw new Error('EMPTY_SNAPSHOT');
  const codes=new Set(),items=[];
  for(let i=0;i<rows.length;i++){
    const src=rows[i]||{},code=normalizeCode(src.code);
    const description=normalizeDescription(src.description);
    const quantity=src.quantity===null||src.quantity===undefined||src.quantity===''?null:Number(src.quantity);
    if(!code)throw new Error('INVALID_REQUIRED_FIELD:'+String(i+1));
    if(codes.has(code))throw new Error('DUPLICATE_CODE:'+code);
    if(quantity!==null&&(!Number.isFinite(quantity)||quantity<0))throw new Error('INVALID_QUANTITY:'+code);
    if(quantity!==null&&!Number.isSafeInteger(Math.round(quantity*10000)))
      throw new Error('QUANTITY_OVERFLOW:'+code);
    const location=src.location===null||src.location===undefined?null:text(src.location);
    codes.add(code);
    items.push({code,description,quantity,location});
  }
  return items;
}
export function compareToActive(activeItems,candidateItems){
  const active=validateRowsOrEmpty(activeItems),candidate=validateAndNormalizeRows(candidateItems);
  const previous=new Map(active.map(x=>[x.code,x])),incoming=new Map(candidate.map(x=>[x.code,x]));
  const details=[];let created=0,changed=0,absent=0,unchanged=0;
  for(const [code,item] of incoming){
    const old=previous.get(code);
    if(!old){created++;details.push({code,type:'NEW',before:null,after:item});}
    else if(old.description!==item.description||old.quantity!==item.quantity||old.location!==item.location){
      changed++;details.push({code,type:'CHANGED',before:old,after:item});
    } else unchanged++;
  }
  for(const [code,item] of previous)if(!incoming.has(code)){
    absent++;details.push({code,type:'ABSENT',before:item,after:null});
  }
  details.sort((a,b)=>a.code.localeCompare(b.code));
  const absentRatio=active.length?absent/active.length:0;
  return {baseCount:active.length,candidateCount:candidate.length,created,changed,absent,unchanged,
    absentRatio,requiresExplicitReview:absentRatio>0.10,details};
}
function validateRowsOrEmpty(rows){return Array.isArray(rows)&&!rows.length?[]:validateAndNormalizeRows(rows);}
export function assertBaseIsCurrent(expectedBaseId,actualCurrentId){
  if((expectedBaseId??null)!==(actualCurrentId??null))
    throw new Error('STALE_BASE_RECOMPARE_REQUIRED');
}
export function authorizeInventoryAction(identity,action){
  // Identity must be produced by trusted server-side session verification, NEVER by browser input.
  if(!identity||identity.authenticated!==true||identity.active!==true)throw new Error('UNAUTHENTICATED');
  const role=text(identity.role).toLowerCase();
  if(!['owner','engineer','technician'].includes(role))throw new Error('FORBIDDEN');
  if(!['search','details','versions:list','upload','diff','publish','restore','audit'].includes(action))
    throw new Error('UNKNOWN_ACTION');
  if(!['search','details'].includes(action)&&role!=='owner')throw new Error('FORBIDDEN');
  return {role,userId:identity.userId};
}
