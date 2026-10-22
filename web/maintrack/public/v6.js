
/* MainTrack v7 navigation + report form reliability + owner archival UI.
   This module runs after unchanged v6-core.js. */
(function(){
'use strict';
function boot(){
if(window.__MainTrackV7Fix)return;window.__MainTrackV7Fix=true;
const $=id=>document.getElementById(id),tabs=$('tabs'),formTab=$('tabForm'),form=$('form'),section=$('section');
if(!tabs||!formTab||!form||!section){console.warn('MainTrack v7: required elements not found');return;}
// Exact, consistent RTL menu order for all roles; permission visibility stays in original show().
const order=['tabDash','tabForm','tabCmms','tabCatalog','tabProfile','tabLeave','tabApprove','tabAdmin','tabInventory'];
const userCard=tabs.querySelector('.v6User'),frag=document.createDocumentFragment();
order.forEach(id=>{const b=$(id);if(b&&tabs.contains(b))frag.append(b);});
tabs.insertBefore(frag,userCard||null);
const status=document.createElement('div');status.id='v7FormStatus';status.className='v7-form-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;
const message=document.createElement('span');const retry=document.createElement('button');retry.type='button';retry.textContent='إعادة تحميل القوائم';retry.hidden=true;status.append(message,retry);form.prepend(status);
const refresh=document.createElement('button');refresh.type='button';refresh.id='v7RefreshLists';refresh.textContent='↻ تحديث قوائم الأقسام والماكينات';form.insertBefore(refresh,status.nextSibling);
let loading=false;
function showState(text,error){status.hidden=false;status.dataset.error=error?'true':'false';message.textContent=text;retry.hidden=!error;}
const fields=['section','machine','comp','status','cat','desc','solution','date','t1','t2','t3','spare'];
async function openForm(forceRefresh=false){
if(loading)return;loading=true;
try{
 if(typeof S==='undefined'||!S||!canReport())return;
 show('form');document.body.classList.remove('v6Drawer');
 const snapshot={};for(const id of fields){const el=$(id);if(el)snapshot[id]=el.value;}
 const current=typeof D!=='undefined'&&D&&Array.isArray(D.sections)&&D.sections.length>0&&section.options.length>1;
 const reload=forceRefresh||!current;
 const locked=['section','machine','comp','status','cat'];
 if(reload){
  locked.forEach(id=>{const el=$(id);if(el)el.disabled=true;});
  showState('جارٍ تحميل الأقسام والماكينات من Supabase…',false);
  try{
   // Do not destroy the current catalog before the server response arrives.
   const data=await api('init');
   if(data.error)throw new Error(data.error);
   if(!Array.isArray(data.sections)||!data.sections.length)throw new Error('EMPTY_CATALOG');
   init(data);
   if(snapshot.section&&Array.from(section.options).some(x=>x.value===snapshot.section)){
    section.value=snapshot.section;section.dispatchEvent(new Event('change'));
    for(const id of ['machine','comp']){const el=$(id);if(snapshot[id]&&Array.from(el.options).some(x=>x.value===snapshot[id]))el.value=snapshot[id];}
   }
   for(const id of fields.filter(x=>!['section','machine','comp'].includes(x))){const el=$(id);if(!el||!snapshot[id])continue;
    if(el.tagName==='SELECT'&&!Array.from(el.options).some(x=>x.value===snapshot[id]))continue;el.value=snapshot[id];}
   sessionStorage.setItem('maintrack_catalog_refreshed_at',String(Date.now()));
   status.hidden=true;
  }catch(e){showState('القوائم غير متاحة الآن. اضغط إعادة التحميل؛ لا تحتاج لإغلاق التطبيق.',true);}
  finally{locked.forEach(id=>{const el=$(id);if(el)el.disabled=false;});}
 }else status.hidden=true;
 if(typeof refreshWorkOrder==='function')refreshWorkOrder();
}finally{loading=false;}
}
formTab.addEventListener('click',e=>{
const needsLoad=typeof D==='undefined'||!D||!Array.isArray(D.sections)||!D.sections.length||section.options.length<=1;
if(loading||needsLoad){e.preventDefault();e.stopImmediatePropagation();openForm(false);}
},true);
refresh.addEventListener('click',()=>openForm(true));
retry.addEventListener('click',()=>openForm(true));
// Owner-only work order archive button; soft delete preserves report and audit trail.
const detail=$('v6Detail'),audit=$('v6Audit');
if(detail&&audit){
const button=document.createElement('button');button.id='v7DeleteWO';button.type='button';button.textContent='حذف البلاغ';button.className='v7-delete';button.title='أرشفة البلاغ وإخفاؤه من المؤشرات والسجل، مع الاحتفاظ بالأصل وسجل التدقيق';
audit.insertAdjacentElement('afterend',button);
const visible=()=>{button.hidden=detail.hidden||typeof S==='undefined'||S?.role!=='owner';};
new MutationObserver(visible).observe(detail,{attributes:true,attributeFilter:['hidden']});visible();
let deleting=false;
button.addEventListener('click',async()=>{
 if(deleting||typeof S==='undefined'||S?.role!=='owner')return;
 const title=$('v6DetailTitle')?.textContent||'';
 const label=title.match(/WO[-–]?\d+/i)?.[0];
 const revision=Number(title.match(/Revision\s*(\d+)/i)?.[1]);
 if(!label||!Number.isSafeInteger(revision)||revision<1){alert('تعذر قراءة رقم البلاغ أو نسخته. أعد فتح التفاصيل.');return;}
 const answer=prompt('أدخل سبب حذف '+label+' (3 إلى 500 حرف). الحذف عبارة عن أرشفة قابلة للاسترجاع:');
 if(answer===null)return;
 const reason=answer.trim();if(reason.length<3||reason.length>500){alert('سبب الحذف لازم يكون بين 3 و500 حرف.');return;}
 const typed=prompt('للتأكيد، اكتب رقم البلاغ كما هو: '+label);
 if(typed===null||typed.trim().toUpperCase()!==label.toUpperCase()){alert('الرقم غير مطابق. تم إلغاء العملية.');return;}
 if(!confirm('تأكيد أرشفة '+label+' واستبعاده من السجل والمؤشرات؟ لن تُحذف البيانات نهائيًا.'))return;
 deleting=true;button.disabled=true;
 try{
  const list=await api('cmms',{mode:'list',q:label,source:'all',limit:100,offset:0});
  if(list.error)throw new Error(list.error);
  const found=(list.items||[]).find(x=>String(x.woId||'').toUpperCase()===label.toUpperCase());
  if(!found)throw new Error('REPORT_NOT_FOUND');
  if(Number(found.revision)!==revision)throw new Error('WO_VERSION_CONFLICT');
  const result=await api('cmmsDelete',{woNumber:found.woNumber,revision,reason});
  if(result.error)throw new Error(result.error);
  detail.hidden=true;
  localStorage.removeItem('bd_dashboard_cache_v3_'+S.code);
  $('v6Refresh')?.click();
  alert('تمت أرشفة '+label+' مع الاحتفاظ بسجل التدقيق.');
 }catch(e){alert('لم يتم الحذف: '+(e.message||'خطأ اتصال'));}
 finally{deleting=false;button.disabled=false;}
});
}
}
function ready(){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();}
const original=document.createElement('script');original.src='v6-core.js';original.onload=ready;
original.onerror=()=>{const w=document.createElement('div');w.setAttribute('role','alert');w.textContent='تعذر تحميل واجهة MainTrack. حدث الصفحة للتحقق من الاتصال.';w.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:15px;text-align:center;background:#fff2ed;color:#a12317';document.body.append(w);};
document.head.append(original);
})();
