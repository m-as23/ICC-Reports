'use strict';
// Additive coordinator around the locked reference engine. Local rows are never
// removed by an inferred family or a remote answer; Owner filters still apply.
(()=>{
 const norm=x=>String(x||'').normalize('NFKC').toLowerCase().replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي');
 const key=x=>norm(x).replace(/[^\p{L}\p{N}]/gu,'');
 function literal(row,raw){const q=norm(raw).trim(),text=norm(row.c+' '+(row.d||'')+' '+(row.i||'')),tokens=q.split(/[^\p{L}\p{N}.]+/u).filter(Boolean);return tokens.length>0&&tokens.every(t=>text.includes(t));}
 function allowed(row,raw,p){
  if(!(p.measures||[]).every(m=>mt6MeasurementMatch(row,m))||!(p.genericUnits||[]).every(k=>mt7HasConcept(row,k)))return false;
  const text=norm(row.d),type=norm(raw).match(/(?:\btype|تايب|طيب|نوع)\s*[:\-]?\s*([a-z])\b/i);
  if(type&&!new RegExp('\\btype[\\s:\\-]*'+type[1]+'\\b','i').test(text))return false;
  const models=norm(raw).match(/\b[a-z]+[\w.-]*\d[\w.-]*\b/g)||[];
  const rowTokens=new Set(norm(row.c+' '+row.d+' '+(row.i||'')).split(/[^\p{L}\p{N}.\/-]+/u));
  if(models.some(m=>!rowTokens.has(m)))return false;
  for(const signal of ['pnp','npn','nc','no'])if(new RegExp('\\b'+signal+'\\b').test(norm(raw))&&!new RegExp('\\b'+signal+'\\b').test(text))return false;
  return true;
 }
 function merge({raw,index,local,codes=[],parsed={}}){
  const rows=new Map(),q=key(raw);
  for(const x of local)rows.set(x.c,{...x,_mt6AI:false,_score:100000+Math.min(Math.max(x._score||0,0),9999)});
  for(const x of index){const code=key(x.c);if(q&&code===q)rows.set(x.c,{...x,_mt6AI:false,_score:1000000});else if(literal(x,raw)||(q.length>=3&&code.includes(q)))rows.set(x.c,{...x,_mt6AI:false,_score:500000+(code.includes(q)?1000:0)});}
  const byCode=new Map(index.map(x=>[x.c,x]));
  for(const [position,code] of codes.slice(0,50).entries()){const x=byCode.get(code);if(!x||rows.has(code)||!allowed(x,raw,parsed))continue;rows.set(code,{...x,_mt6AI:true,_score:1000-position});}
  return [...rows.values()].sort((a,b)=>b._score-a._score||a.c.localeCompare(b.c));
 }
 window.MainTrackHybrid=Object.freeze({merge});
 if(typeof mt6EnrichAsync!=='function')return;
 mt6EnrichAsync=async function(raw,p,localRows,generation){
  state.base=merge({raw,index:INDEX,local:localRows,parsed:p});renderAll();
  const adapter=window.MainTrackAI?.search;if(typeof adapter!=='function'||!navigator.onLine)return;
  const controller=new AbortController();mt6Pending=controller;
  const active=()=>generation===mt6Generation&&!controller.signal.aborted;
  let timer;
  try{
   mt6Status('نتائج النص متاحة · جارٍ البحث بالمعنى…','pending');
   const answer=await Promise.race([adapter({query:raw,signal:controller.signal}),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('SEARCH_TIMEOUT'));},11000);})]);
   if(!active())return;
   state.base=merge({raw,index:INDEX,local:localRows,codes:answer?.mode==='semantic'?answer.codes:[],parsed:p});renderAll();
   if(answer?.mode==='semantic')mt6Status('التطابقات أولًا · النتائج الإضافية مميزة بمرتبط بالمعنى','augmented');
   else mt6Status(answer?.reason==='INDEXING'?'نتائج النص متاحة · جارٍ تجهيز فهرس المعنى للنسخة المعتمدة':answer?.reason==='DAILY_LIMIT'?'نتائج النص متاحة · تم بلوغ حد البحث بالمعنى اليوم':'نتائج النص متاحة · البحث بالمعنى غير متاح حاليًا','local');
  }catch{if(generation===mt6Generation)mt6Status('نتائج النص متاحة · تعذر إكمال البحث بالمعنى','local');}
  finally{clearTimeout(timer);if(generation===mt6Generation)mt6Pending=null;}
 };
})();
