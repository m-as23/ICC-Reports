// MainTrack MT-01 / v0.4.7 EXPERIMENTAL — deterministic, conservative bilingual
// inventory search over confirmed records ONLY. No network, no DB, no AI guesses.
// This module is NOT connected to MainTrack or the real Supabase inventory API yet.
const arabicDigit = c => {
 const eastern='٠١٢٣٤٥٦٧٨٩',persian='۰۱۲۳۴۵۶۷۸۹';
 const e=eastern.indexOf(c),p=persian.indexOf(c);
 return e>=0?String(e):p>=0?String(p):c;
};
const synonyms=new Map([
 ['باركر','parker'],['باركير','parker'],
 ['انفرتر','inverter'],['انفرتير','inverter'],['انفيرتر','inverter'],
 ['vfd','inverter'],['inverters','inverter']
]);
export function inventoryTerms(input){
 if(typeof input!=='string'||input.length>120)throw Error('INVALID_QUERY');
 let s=input.normalize('NFKC').toLowerCase().replace(/[٠-٩۰-۹]/g,arabicDigit)
   .replace(/[\u064B-\u065F\u0670\u0640]/g,'')
   .replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي');
 // Treat numeric specifications as indivisible terms: 65amp != 165amp,
 // "A" alone is NOT ampere; it remains a regular identifier token.
 s=s.replace(/(\d+(?:\.\d+)?)\s*(?:امبير|amperes?|amps?|a)(?=$|[^\p{L}\p{N}])/gu,(_,n)=>' '+n+'amp ');
 s=s.replace(/(\d+(?:\.\d+)?)\s*(?:litres?|liters?|l)(?=$|[^\p{L}\p{N}])/gu,(_,n)=>' '+n+'l ');
 // Accept separated alphanumeric model codes: M-700, M 700, M700.
 s=s.replace(/(^|[^\p{L}\p{N}])m[\s-]+(\d+)(?=$|[^\p{L}\p{N}])/gu,(_,prefix,n)=>prefix+'m'+n);
 const terms=s.replace(/[^\p{L}\p{N}.]+/gu,' ').trim().split(/\s+/).filter(Boolean);
 return terms.map(x=>synonyms.get(x)||x);
}
export function matchesInventoryItem(item,query){
 if(!item||typeof item!=='object')return false;
 const terms=Array.isArray(query)?query:inventoryTerms(query);
 if(!terms.length)return false;
 // Search ONLY the fields actually present on the approved inventory row.
 // Never introduce synthesized part numbers, counts or descriptions.
 const fields=[item.code,item.description,item.location,item.extra?.iccCode,item.extra?.brand,
  item.extra?.model].filter(x=>typeof x==='string');
 const available=new Set(fields.flatMap(x=>inventoryTerms(x.slice(0,120))));
 return terms.every(term=>available.has(term));
}
export function filterConfirmedInventoryItems(items,query,{limit=50}={}){
 if(!Array.isArray(items))throw Error('CONFIRMED_ITEMS_REQUIRED');
 const terms=inventoryTerms(query);
 if(!terms.length)return [];
 const n=Number(limit);
 if(!Number.isInteger(n)||n<1||n>100)throw Error('INVALID_LIMIT');
 const result=[];
 for(const item of items)if(matchesInventoryItem(item,terms)){
   result.push(item); // use original row with verified code/quantity/location unchanged
   if(result.length===n)break;
 }
 return result;
}
