/* Drive Fault Engine 1.0 — no manufacturer or M700-specific conditions. */
(function(scope){
'use strict';
const digitMap={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
function normalize(v){return String(v??'').normalize('NFKC').toLowerCase().replace(/[٠-٩۰-۹]/g,x=>digitMap[x]).replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[\\/_–—-]/g,' ').replace(/[^\p{L}\p{N}.]+/gu,' ').trim().replace(/\s+/g,' ');}
function textOf(r){const d=r.fullDetail||{};return [r.code,r.tripNumber,r.titleEn,r.titleAr,...(r.aliases||[]),d.englishEditorial?.description,d.englishOriginal?.description,...(d.englishOriginal?.recommendedActions||[]),...(d.englishEditorial?.recommendedActions||[]),...(d.arabicExplanation?.recommendedActions||[]),d.arabicExplanation?.description,...(d.parameterRefs||[]),...(d.subcodes||[]).flatMap(s=>[s.descriptionEn,s.descriptionAr,s.source,s.subtrip])].map(normalize).filter(Boolean);}
function near(a,b){if(Math.abs(a.length-b.length)>1)return false;let p=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let c=[i];for(let j=1;j<=b.length;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]!==b[j-1]));p=c;}return p[b.length]<=1;}
function eligible(r){return !['RESERVED','RESERVED_RANGE','UNDEFINED'].includes(r.recordType);}
function findRecord(catalogs,id){for(const c of catalogs){const r=c.records.find(r=>r.id===id);if(r)return {catalog:c,record:r};}return null;}
function parseComposite(catalogs,input){let q=normalize(input);if(/^\d{2}\.\d{3}$/.test(q))return {status:'PARAMETER_NOT_SUBTRIP'};
 const m=/^(.+?)\.(\d{1,5})$/.exec(q);if(!m)return {status:'NOT_COMPOSITE'};
 const prefix=m[1],suffix=m[2];if(/^0\d/.test(prefix))return {status:'PARAMETER_NOT_SUBTRIP'};
 for(const c of catalogs){const r=c.records.find(r=>r.recordType==='NAMED_TRIP'&&(String(r.tripNumber)===prefix||normalize(r.code)===prefix||normalize(r.titleEn)===prefix));if(r)return {status:'COMPOSITE',catalog:c,record:r,subtrip:suffix,resolution:lookupSubtrip(r,suffix)};}
 return {status:'NOT_COMPOSITE'};
}
function lookupSubtrip(record,value){const d=record?.fullDetail;if(!d)return {status:'NO_DETAILS',matches:[]};const q=normalize(value).replace(/^\./,'');if(!/^\d{1,5}$/.test(q))return {status:'INVALID_INPUT',matches:[]};const rows=d.subcodes||[];
 const matching=rows.filter(s=>s.matchPolicy==='exact'&&s.subtrip!=null&&/^\d{1,5}$/.test(String(s.subtrip))&&Number(s.subtrip)===Number(q));
 return {status:matching.length?'MATCH_DRAFT':rows.some(s=>s.matchPolicy!=='exact')?'CONTEXT_REQUIRED':'NOT_FOUND',matches:matching,warning:matching.length?'مطابقة رقمية في مكتبة Draft، وليست اعتمادًا هندسيًا أو تحديدًا مؤكدًا للوحدة المادية.':null};}
function search(catalogs,query,{manufacturer='',model='',onlyDetailed=false,limit=40}={}){
 const q=normalize(query),numeric=/^\d+$/.test(q),num=numeric?Number(q):null;
 const matchingCatalogs=catalogs.filter(({meta})=>
  (!manufacturer||normalize(meta.manufacturer)===normalize(manufacturer))&&
  (!model||meta.models?.includes(model)));
 const comp=parseComposite(matchingCatalogs,q);
 if(comp.status==='COMPOSITE')return [{catalog:comp.catalog,record:comp.record,score:2000,reason:'COMPOSITE_SUBTRIP',resolution:comp.resolution,inputSubtrip:comp.subtrip}];
 const hits=[];for(const c of matchingCatalogs){
 for(const r of c.records){if(!eligible(r)||onlyDetailed&&!r.fullDetail)continue;let score=0,reason='';const put=(s,t)=>{if(s>score){score=s;reason=t;}};
 if(q){if(numeric&&Number.isSafeInteger(num)&&r.tripNumber===num)put(1200,'TRIP_EXACT');if(numeric&&r.tripNumberRange&&r.tripNumberRange[0]<=num&&num<=r.tripNumberRange[1])put(900,'TRIP_RANGE');
 if(normalize(r.code)===q)put(1100,'CODE_EXACT');if(normalize(r.titleEn)===q||normalize(r.titleAr)===q)put(1040,'NAME_EXACT');if((r.aliases||[]).some(s=>normalize(s)===q))put(980,'ALIAS_EXACT');
 if(!numeric){if(normalize(r.code).startsWith(q))put(700,'CODE_PREFIX');if([r.titleEn,r.titleAr].some(t=>normalize(t).includes(q)))put(650,'TITLE_CONTAINS');const f=textOf(r);if(f.some(t=>t.includes(q)))put(400,'DETAIL_MATCH');const words=q.split(' ');if(words.length>1&&words.every(w=>f.some(t=>t.includes(w))))put(430,'MULTI_TERM');if(!score&&q.length>=5&&[r.code,r.titleEn].flatMap(v=>normalize(v).split(' ')).some(t=>t.length>=5&&near(q,t)))put(100,'TYPO_SUGGESTION');}
 }else{score=r.fullDetail?2:1;reason='BROWSE';}
 if(score>0)hits.push({catalog:c,record:r,score,reason});
 }}hits.sort((a,b)=>b.score-a.score||(!!b.record.fullDetail)-(!!a.record.fullDetail)||(a.record.tripNumber??9999)-(b.record.tripNumber??9999));return hits.slice(0,Math.min(Math.max(1,limit),200));
}
function validateCatalog(c){const errors=[];if(!c?.meta?.catalogId||!Array.isArray(c.records))return ['BAD_CATALOG'];const ids=new Set(),nums=new Set();for(const r of c.records){if(!r.id||ids.has(r.id))errors.push('DUPLICATE_ID');ids.add(r.id);if(r.tripNumber!=null){if(!Number.isSafeInteger(r.tripNumber)||nums.has(r.tripNumber))errors.push('DUPLICATE_TRIP');nums.add(r.tripNumber);}if(r.fullDetail&&r.detailStatus==='INDEX_ONLY')errors.push('DETAIL_STATUS');if(r.fullDetail&&r.fullDetail.tripNumber!==r.tripNumber)errors.push('DETAIL_TRIP_MISMATCH');}
 return [...new Set(errors)];}
const API={normalize,textOf,search,parseComposite,lookupSubtrip,validateCatalog,findRecord};if(typeof module==='object'&&module.exports)module.exports=API;scope.DriveFaultEngine=API;
})(typeof window!=='undefined'?window:globalThis);
