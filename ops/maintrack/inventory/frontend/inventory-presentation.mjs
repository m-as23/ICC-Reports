export const CATEGORIES={sensors:'حساسات وسويتشات',drives:'إنفرترات ودرايفات',buttons:'أزرار ومفاتيح تشغيل',bearings:'رولمان بلي',chemicals:'مواد كيماوية ولاصقة',contactors:'كونتاكتورات',heaters:'سخانات',motors:'مواتير',other:'أصناف أخرى'};
export function describeItem(item){
 const text=String(item.description||'').toLowerCase(),code=String(item.code||'').toUpperCase();let category='other';
 if(/^SE-(SNS|PRX)-/.test(code)||/\b(sensor|proximity|photoelectric|transducer)\b|حساس/.test(text))category='sensors';
 else if(/^SE-PBT-/.test(code)||/push[ -]*button|emergency stop/.test(text))category='buttons';
 else if(/^SE-DRV-/.test(code)||/\b(inverter|unidrive|vfd)\b|\b(ac|servo) drive\b|انفرتر/.test(text))category='drives';
 else if(/^SM-(BER|BBR)-/.test(code)||/\bbearing\b|رولمان/.test(text))category='bearings';
 else if(/\b(loctite|adhesive|threadlocker)\b/.test(text))category='chemicals';
 else if(/^SE-CON-/.test(code)||/\bcontactor\b|كونتاكتور/.test(text))category='contactors';
 else if(/\bheater\b|سخان|هيتر/.test(text))category='heaters';
 else if(/\bmotor\b|موتور|ماتور/.test(text))category='motors';
 return {category,label:CATEGORIES[category]};
}
export function filterItems(rows,{category='',location='',stock=''}={}){return rows.filter(x=>(!category||describeItem(x).category===category)&&(!location||x.location===location)&&(!stock||(stock==='unknown'?x.quantity===null:stock==='zero'?x.quantity!==null&&Number(x.quantity)===0:x.quantity!==null&&Number(x.quantity)>0)));}
export function sortItems(rows,kind='code'){return [...rows].sort((a,b)=>kind==='quantity'?(a.quantity===null?1:b.quantity===null?-1:Number(b.quantity)-Number(a.quantity)||String(a.code).localeCompare(String(b.code))):String(a.code).localeCompare(String(b.code),'en',{numeric:true}));}
export async function collectSearchResults(search,query,{onProgress=()=>{},isCurrent=()=>true,maxItems=30000}={}){
 let offset=0,version,total;const rows=[],codes=new Set();
 for(let page=0;page<=maxItems;page++){
  if(!isCurrent())throw Error('SEARCH_SUPERSEDED');
  const data=await search(query,{offset,limit:100});
  if(!isCurrent())throw Error('SEARCH_SUPERSEDED');
  if(page===0){version=data.versionId;total=data.totalMatches;}
  if(data.versionId!==version)throw Error('INVENTORY_VERSION_CHANGED_RESTART_SEARCH');
  if(!Number.isInteger(total)||total<0||total>maxItems||data.totalMatches!==total||data.offset!==offset||!Array.isArray(data.items))throw Error('INCOMPLETE_SEARCH');
  for(const item of data.items){if(!item||!item.code||codes.has(item.code))throw Error('INCOMPLETE_SEARCH');codes.add(item.code);rows.push(item);}
  if(rows.length>total)throw Error('INCOMPLETE_SEARCH');onProgress(rows.length,total);
  if(data.nextOffset===null){if(rows.length!==total)throw Error('INCOMPLETE_SEARCH');return {items:rows,versionId:version};}
  if(data.nextOffset!==offset+data.items.length||data.nextOffset<=offset)throw Error('INCOMPLETE_SEARCH');
  offset=data.nextOffset;
 }
 throw Error('INCOMPLETE_SEARCH');
}
