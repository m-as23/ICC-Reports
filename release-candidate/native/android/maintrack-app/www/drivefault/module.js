'use strict';
const $ = id => document.getElementById(id);
const host = window.parent.MainTrackDriveFaultHost;
const cSel = $('catalog'), query = $('query'), clear = $('clear');
const welcome = $('welcome'), area = $('resultArea'), items = $('results');
const detail = $('details'), dPanel = $('detailPanel'), download = $('download');
const state = {matches: [], chosen: null, visible: 7};
const options = new Map();
let pack = null, cachedPack = null, selection = 0, searchTimer;
let scope;
function status(text = '') {
 const node = $('status');
 node.textContent = text;
 node.hidden = !text;
}
function api(action, data = {}) {
 return host.request(action, {library: 10, ...data});
}
async function database(){
 return new Promise((resolve,reject)=>{const r=indexedDB.open('df-v151-local',1);r.onupgradeneeded=()=>r.result.createObjectStore('packs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Cache unavailable'));});
}
async function cached(cacheKey,mode,value){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{
 const tx=db.transaction('packs',mode==='read'?'readonly':'readwrite'),s=tx.objectStore('packs');
 let found;const r=mode==='read'?s.get(cacheKey):s.put(value,cacheKey);
 r.onsuccess=()=>found=r.result;tx.oncomplete=()=>resolve(found);tx.onerror=()=>reject(Error('Cache transaction failed'));
 });}finally{db.close();}
}
async function decode(manifest){
 const raw=Uint8Array.from(atob(manifest.data),c=>c.charCodeAt(0));
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw))).map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==manifest.sha256)throw Error('Package digest mismatch');
 const c=JSON.parse(new TextDecoder().decode(raw));
 if(DriveFaultEngine.validateCatalog(c).length||!c.meta.models?.length)throw Error('Invalid catalog');
 return c;
}
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined&&txt!==null)n.textContent=String(txt);return n;}
function append(p,tag,cls,txt){return p.appendChild(el(tag,cls,txt));}
function typeLabel(r){return ({FAULT:'Fault',ALARM:'Alarm',WARNING:'Warning',EVENT:'Event',NAMED_TRIP:'Trip',HARDWARE_TRIP:'Hardware trip'})[r.faultKind||r.recordType]||'غير محدد';}
function modelShort(c){return(c.meta.models||[]).join(' / ')||c.meta.family||'';}
function issue(c){return c.meta.firmwareScope||('Issue '+(c.meta.document?.issue||''));}
function key(h){return h.catalog.meta.catalogId+'|'+h.record.id+'|'+(h.inputSubtrip||'');}
function resetView(){state.matches=[];state.chosen=null;state.visible=7;area.hidden=true;dPanel.hidden=true;items.replaceChildren();detail.replaceChildren();}
function renderList(){items.replaceChildren();const n=state.matches.length;$('resultCount').textContent=n?`${Math.min(n,150)} نتيجة${n>=150?' (حد البحث)':''}`:'لا توجد نتائج';if(!n){append(items,'div','empty-result','لم يتم العثور على عطل مطابق في هذا الموديل. راجع الكود، أو جرّب الاسم بالعربي أو بالإنجليزي.');$('more').hidden=true;return;}
 for(const h of state.matches.slice(0,state.visible)){const r=h.record,btn=append(items,'button','hit-card'+(key(h)===state.chosen?' active':''));btn.type='button';btn.setAttribute('aria-pressed',String(key(h)===state.chosen));btn.addEventListener('click',()=>{state.chosen=key(h);renderList();renderDetails();items.querySelector('.active')?.focus({preventScroll:true});dPanel.scrollIntoView({block:'nearest',behavior:'smooth'});});append(btn,'span','hit-code',r.tripNumber!=null?'Trip '+r.tripNumber:r.code);const txt=append(btn,'span','hit-title');append(txt,'b','',r.titleAr||r.titleEn||r.code);append(txt,'small','',r.titleEn||'');append(btn,'span','hit-arrow','‹');}
 $('more').hidden=state.visible>=n;$('more').textContent=`عرض ${Math.min(7,n-state.visible)} نتائج أخرى`;}
function section(parent,heading,body,dir){if(!body)return;const s=append(parent,'section','section');append(s,'h3','',heading);const p=append(s,'p','',body);p.dir=dir||'rtl';return s;}
function bulletList(parent,heading,arr,dir){if(!Array.isArray(arr)||!arr.length)return;const s=append(parent,'section','section');append(s,'h3','',heading);const ul=append(s,'ul');ul.dir=dir||'rtl';for(const x of arr)append(ul,'li','',x);}
function getRef(r,c){const a=r.reference||{},b=r.fullDetail?.reference||{},doc=c.meta.document||{};return {number:a.documentNumber||b.documentNumber||doc.partNumber||'—',issue:a.issue||b.issue||doc.issue||'—',page:a.printedPage??b.printedPage??a.pdfPage??'—',section:a.section||b.section||doc.diagnosticsChapter||'—',url:a.sourceUrl||doc.url||''};}
function renderDetails(){detail.replaceChildren();const h=state.matches.find(x=>key(x)===state.chosen);dPanel.hidden=!h;if(!h)return;const r=h.record,c=h.catalog,d=r.fullDetail||{},ar=d.arabicExplanation||{},en=d.englishEditorial||d.englishOriginal||{};
 const head=append(detail,'div','detail-head');const chips=append(head,'div','detail-id');append(chips,'strong','detail-code',r.tripNumber!=null?('Trip '+r.tripNumber+' · '+r.code):r.code);append(chips,'span','pill',typeLabel(r));append(chips,'span','pill '+(r.fullDetail?'technical':'warn'),r.fullDetail?'تفاصيل فنية':'فهرس فقط');append(head,'h2','',r.titleAr||r.titleEn||r.code);append(head,'div','detail-en',r.titleEn||r.code);append(head,'p','detail-context',`${modelShort(c)} · ${issue(c)}`);
 const body=append(detail,'div','detail-body');if(!!r.fullDetail?.blockedSubtripCount){const w=append(body,'div','notice');append(w,'span','','⚠');append(w,'div','','بعض الأكواد الفرعية لهذا العطل محجوبة لحين التحقق من ارتباطها بالمصدر. لا يوجد تفسير فرعي معتمد.');}
 if(r.fullDetail){section(body,'شرح العطل',ar.description,'rtl');section(body,'Technical description',en.description,'ltr');bulletList(body,'خطوات الفحص',ar.recommendedActions,'rtl');bulletList(body,'Recommended checks',en.recommendedActions,'ltr');if(d.parameterRefs?.length){const s=append(body,'section','section');append(s,'h3','','الـParameters المرتبطة');const line=append(s,'div','param-list');d.parameterRefs.forEach(x=>append(line,'code','',x));}
 if(!r.fullDetail?.blockedSubtripCount&&d.subcodes?.length){const exactRows=d.subcodes.filter(s=>s.matchPolicy==='exact');const rows=h.inputSubtrip?exactRows.filter(s=>Number(s.subtrip)===Number(h.inputSubtrip)):exactRows.slice(0,5);if(rows.length){const s=append(body,'section','section');append(s,'h3','','الأكواد الفرعية المسجلة');for(const sr of rows){const p=append(s,'p','',`${sr.subtrip} — ${sr.descriptionAr||sr.descriptionEn||'لا يتوفر وصف'}`);p.style.marginBottom='9px';}}}
 if(!ar.description&&!en.description)section(body,'تفاصيل غير مكتملة','لا يتوفر شرح إضافي في الحزمة المعتمدة.','rtl');
 }else{append(body,'div','notice','هذا العطل مفهرس فقط؛ لا توجد له تفاصيل تشخيصية مكتملة حتى الآن.');}
 const ref=getRef(r,c),src=append(body,'section','section');append(src,'h3','','المرجع الفني');const grid=append(src,'div','source-info');[['رقم الدليل',ref.number],['الإصدار',ref.issue],['الصفحة',ref.page],['القسم',ref.section]].forEach(([k,v])=>{const cell=append(grid,'div');append(cell,'span','',k);append(cell,'b','',v);});if(/^https:\/\//.test(ref.url)){const a=append(src,'a','source-link','فتح دليل الشركة');a.href=ref.url;a.target='_blank';a.rel='noopener noreferrer';}
}

function startSearch() {
 clear.hidden = !query.value;
 const text = query.value.trim();
 if (!pack || !text) {
  resetView();
  welcome.hidden = false;
  $('welcomeTitle').textContent = !cSel.value && text ? 'اختار موديل الدرايف أولًا' : 'ابحث عن العطل اللي محتاجه';
  $('welcomeSub').textContent = cSel.value ? 'اكتب الكود أو اسم العطل بالعربي أو بالإنجليزي، وهتظهر النتائج هنا.' :
   'اختار الموديل أولًا، ثم اكتب كود العطل أو كلمة من اسمه.';
  return;
 }
 welcome.hidden = true;
 area.hidden = false;
 state.matches = DriveFaultEngine.search([pack], text, {model: options.get(cSel.value).model, limit: 150});
 state.visible = 7;
 const exact = state.matches.find(hit => ['CODE_EXACT','TRIP_EXACT','COMPOSITE_SUBTRIP','NAME_EXACT'].includes(hit.reason));
 state.chosen = exact ? key(exact) : state.matches.length === 1 ? key(state.matches[0]) : null;
 renderList();
 renderDetails();
}

function optionFor(meta, version) {
 const {manufacturer, model, firmware} = meta;
 if (![manufacturer, model, firmware, version].every(value => typeof value === 'string' && value)) return;
 const id = JSON.stringify([manufacturer, model, firmware]);
 if (options.has(id)) return;
 options.set(id, {manufacturer, model, firmware, version});
 cSel.add(new Option(model + ' — ' + manufacturer + (firmware ? ' · ' + firmware : ''), id));
}

async function denied(error) {
 if (![401, 403].includes(error.status)) return false;
 ++selection;
 pack = cachedPack = null;
 options.clear();
 cSel.length = 1;
 cSel.disabled = query.disabled = download.disabled = true;
 query.value = '';
 startSearch();
 status('انتهت الجلسة. سجّل الدخول مجددًا.');
 await cached(scope, 'write', null).catch(() => {});
 return true;
}

async function selectPack(save = false) {
 const request = ++selection;
 const selected = options.get(cSel.value);
 pack = null;
 download.disabled = true;
 status();
 startSearch();
 if (!selected) return;
 const matches = candidate => candidate?.meta.manufacturer === selected.manufacturer &&
  candidate.meta.models.includes(selected.model) && candidate.meta.firmwareScope === selected.firmware;
 try {
  const manifest = await api('download', {version: selected.version});
  if (manifest.version !== selected.version) throw Error('Unexpected version');
  const candidate = await decode(manifest);
  if (!matches(candidate)) throw Error('Unexpected model');
  if (request !== selection) return;
  if (save) {
   await cached(scope, 'write', {manifest});
   cachedPack = {candidate, version: manifest.version};
  }
  if (request !== selection) return;
  pack = candidate;
  if (save) status('تم حفظ الحزمة المعتمدة للاستخدام بدون إنترنت.');
 } catch (error) {
  if (request !== selection || await denied(error)) return;
  if (error?.name === 'TypeError' && cachedPack?.version === selected.version && matches(cachedPack.candidate)) {
   pack = cachedPack.candidate;
   status('عرض الحزمة المعتمدة المحفوظة بدون إنترنت.');
  } else status('تعذّر تحميل الحزمة المعتمدة لهذا الموديل.');
 } finally {
  if (request === selection) {
   download.disabled = !pack;
   startSearch();
  }
 }
}

async function init() {
 if (host?.downloadsEnabled !== true) {
  cSel.disabled = query.disabled = download.disabled = true;
  $('welcomeTitle').textContent = 'لا توجد حزم أعطال معتمدة متاحة';
  $('welcomeSub').textContent = 'سيتاح البحث والتنزيل بعد نشر حزمة معتمدة.';
  return;
 }
 try {
  scope = host.context();
  try {
   const stored = await cached(scope, 'read');
   if (stored) cachedPack = {candidate: await decode(stored.manifest), version: stored.manifest.version};
  } catch { /* A missing or invalid cache cannot supply records. */ }
  try {
   await api('context');
   const versions = await api('versions');
   for (const version of versions) {
    if (version.active === true && version.metadata) optionFor(version.metadata, version.version);
   }
  } catch (error) {
   if (await denied(error)) return;
   if (error?.name !== 'TypeError' || !cachedPack) throw error;
   const meta = cachedPack.candidate.meta;
   for (const model of meta.models) optionFor({model, manufacturer: meta.manufacturer, firmware: meta.firmwareScope}, cachedPack.version);
  }
  if (!options.size) status('لا توجد حزم منشورة متاحة.');
 } catch {
  status('تعذّر فتح مكتبة الأعطال.');
 }
}

cSel.addEventListener('change', () => {
 clearTimeout(searchTimer);
 query.value = '';
 void selectPack();
 query.focus();
});
query.addEventListener('input', event => {
 clear.hidden = !query.value;
 clearTimeout(searchTimer);
 if (!event.isComposing) searchTimer = setTimeout(startSearch, 120);
});
query.addEventListener('compositionend', startSearch);
query.addEventListener('keydown', event => {
 if (event.isComposing || !['Enter', 'Escape'].includes(event.key)) return;
 event.preventDefault();
 clearTimeout(searchTimer);
 if (event.key === 'Escape') query.value = '';
 startSearch();
});
clear.addEventListener('click', () => {
 query.value = '';
 clearTimeout(searchTimer);
 startSearch();
 query.focus();
});
$('more').addEventListener('click', () => {
 state.visible = Math.min(state.visible + 7, state.matches.length);
 renderList();
});
download.addEventListener('click', () => void selectPack(true));
void init();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
