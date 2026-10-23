'use strict';
// The uploaded page's visual/search code is kept in inventory-reference.js.
// Only the original local import lab is replaced here by MainTrack's approved data service.
const inventoryHost=window.parent!==window?window.parent.MainTrackInventoryHost:null;
let currentVersion=null,pendingImport=null,importBusy=false,diffPage=0,historyRows=[],loadEpoch=0;
const pageSize=50;
const importMessages={UNAUTHENTICATED:'انتهت الجلسة. سجّل الدخول مجددًا.',SESSION_CHANGED:'تغير الحساب أثناء العملية. أعد المحاولة.',VERSION_CHANGED_RELOAD_REQUIRED:'اعتُمد ملف أحدث. حدّث قائمة النسخ ثم أعد المحاولة.',CURRENT_VERSION_CANNOT_BE_EXCLUDED:'لا يمكن استبعاد النسخة الحالية. اعتمد نسخة أخرى أولًا.',VERSION_IS_EXCLUDED:'أعد النسخة إلى قائمة الاختيارات أولًا.',FORBIDDEN:'تحديث البيانات متاح لحساب Owner فقط.',ONLY_XLSX_ALLOWED:'اختر ملف Excel بصيغة xlsx.',XLSX_DIRECT_UPLOAD_REQUIRED:'الحد الحالي لحجم الملف 2 ميجابايت.',STALE_BASE_RECOMPARE_REQUIRED:'اعتُمد ملف أحدث أثناء المراجعة؛ أعد المقارنة قبل الاعتماد.',INVENTORY_VERSION_CHANGED_RESTART_SEARCH:'تغيرت نسخة المخزن أثناء التحميل؛ أعد المحاولة.',DIFF_STALE_OR_INVALID:'تغيرت نسخة المخزن؛ أعد رفع الملف للمقارنة.',REQUIRED_SHEETS_MISSING:'الملف لا يحتوي شيت الأصناف وشيت المواقع المطلوبين.',DUPLICATE_LOCATION_CODE:'يوجد كود مكرر في شيت المواقع.',DUPLICATE_ITEM_CODE:'يوجد كود مكرر في شيت الأصناف.'};
function inventoryError(e){return importMessages[e?.message]||(e?.name==='AbortError'?'انتهت مهلة الاتصال بخدمة المخزن. أعد المحاولة.':'تعذر الاتصال بخدمة المخزن أو قراءة الملف. تحقق من الاتصال ثم أعد المحاولة.');}
function ownerOnly(){if(!inventoryHost||inventoryHost.role()!=='owner')throw Error('FORBIDDEN');}
function toReferenceItem(x){return {c:x.code,d:x.description||'',q:x.quantity===null||x.quantity===undefined?null:Number(x.quantity),l:x.location||'',n:x.extra?.newCard||null,o:x.extra?.oldCard||null,r:x.extra?.drawer||null,i:x.extra?.iccCode||'',s:x.extra?.sourceSheet==='locations'?1:2};}
function formattedStamp(ts){return ts?new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Cairo'}).format(new Date(ts)):'غير محدد';}
function setProgress(message){$('importProgress').textContent=message;}
function setImportError(message){$('importError').textContent=message;$('importError').hidden=!message;}
function setImportBusy(value){importBusy=value;document.querySelectorAll('[data-version-action]').forEach(b=>b.disabled=value);$('inventoryFile').disabled=value;$('cancelImport').disabled=value;updateApproval();}
function updateApproval(){$('approveImport').disabled=importBusy||!pendingImport?.complete||!$('reviewConfirm').checked||(pendingImport?.requiresExplicitReview&&!$('largeAbsenceConfirm').checked);}
async function loadInventory(){
 const epoch=++loadEpoch;closeDetail();closeFilters();$('retryInventory').hidden=true;$('query').disabled=true;$('searchButton').disabled=true;
 try{
  if(!inventoryHost)throw Error('UNAUTHENTICATED');
  const data=await inventoryHost.snapshot();if(epoch!==loadEpoch)return;
  currentVersion=data;mt6SetData(data.items.map(toReferenceItem));$('totalCount').textContent=nf.format(INDEX.length);
  $('inventoryFreshness').textContent=formattedStamp(data.approvedAt);
  $('inventoryMeta').textContent=data.versionId?'':'لم تُعتمد نسخة جرد بعد';$('inventoryMeta').hidden=!!data.versionId;

  $('query').disabled=false;$('searchButton').disabled=false;
  search();
  if(!data.versionId)mt6Status('لم تُعتمد بيانات بعد. يرفع المسؤول ملف الجرد ويعتمده.');
  updateCloudMessage();
 }catch(e){
  if(epoch!==loadEpoch)return;
  INDEX=[];currentVersion=null;$('results').replaceChildren();$('resultSection').hidden=true;
  $('inventoryFreshness').textContent='تعذر التحميل';$('inventoryMeta').textContent=inventoryError(e);$('inventoryMeta').hidden=false;mt6Status(inventoryError(e));
  $('retryInventory').hidden=false;
 }
}
function metric(title,count){return '<div class="import-metric"><span>'+title+'</span><b>'+nf.format(count||0)+'</b></div>';}
function renderImportPreview(){
 const p=pendingImport;if(!p)return;const c=p.counts||{};
 $('importMetrics').innerHTML=metric('داخل الملف',p.total)+metric('جديدة',c.NEW)+metric('بيانات متغيرة',c.CHANGED)+metric('لم تظهر بالملف',c.ABSENT)+metric('بدون تغيير',c.UNCHANGED);
 $('importWarnings').hidden=!p.requiresExplicitReview;
 $('importWarnings').textContent='أكثر من 10% من الأصناف الحالية غائبة من الملف الجديد. تأكد من رفع ملف الجرد الكامل.';
 $('largeAbsenceLabel').hidden=!p.requiresExplicitReview;$('largeAbsenceConfirm').checked=false;
 $('reviewConfirm').checked=false;$('importPreview').hidden=false;diffPage=0;renderDiff();updateApproval();
}
function renderDiff(){
 if(!pendingImport)return;const kind=$('diffKind').value.toUpperCase();
 const rows=pendingImport.details.filter(x=>x.type!=='UNCHANGED'&&(kind==='ALL'||x.type===kind));
 diffPage=Math.min(diffPage,Math.max(0,Math.ceil(rows.length/pageSize)-1));
 const first=diffPage*pageSize,labels={NEW:'جديد',CHANGED:'تعديل',ABSENT:'غائب'};
 $('diffCount').textContent=nf.format(rows.length)+' حالة · '+(rows.length?first+1:0)+'–'+Math.min(first+pageSize,rows.length);
 // All reviewed rows remain available; unlike the prototype this does not hide changes beyond row 50.
 $('diffBody').innerHTML=rows.slice(first,first+pageSize).map(x=>'<tr><td><span class="import-badge">'+labels[x.type]+'</span></td><td class="mono">'+esc(x.code)+'</td><td class="desc">'+esc(x.after?.description||x.before?.description||'وصف غير مسجل')+'</td><td>الرصيد: '+esc(x.before?.quantity??'غير مسجل')+' → '+esc(x.after?.quantity??'غير مسجل')+'<br>الموقع: '+esc(x.before?.location||'غير مدون')+' → '+esc(x.after?.location||'غير مدون')+'</td></tr>').join('')||'<tr><td colspan="4">لا توجد تغييرات من هذا النوع</td></tr>';
 $('diffPrev').disabled=diffPage===0;$('diffNext').disabled=first+pageSize>=rows.length;
}
async function reviewDraft(id){pendingImport=await inventoryHost.review(id);renderImportPreview();setProgress('اكتملت مقارنة الملف بالنسخة المعتمدة. جميع بنود المقارنة متاحة للمراجعة قبل الاعتماد.');}
async function importExcelInput(file){
 if(!file||importBusy)return;ownerOnly();pendingImport=null;$('importPreview').hidden=true;setImportError('');setImportBusy(true);setProgress('جارٍ رفع Excel وفحص الشيتين ومقارنة الأكواد…');
 try{const draft=await inventoryHost.upload(file);await reviewDraft(draft.draftId);}
 catch(e){pendingImport=null;setImportError(inventoryError(e));setProgress('لم تتغير بيانات البحث.');}
 finally{setImportBusy(false);}
}
async function approveInventory(){
 ownerOnly();if(importBusy||$('approveImport').disabled)return;
 if(!confirm('اعتماد ملف '+pendingImport.filename+' لجميع مستخدمي MainTrack؟'))return;
 setImportBusy(true);setImportError('');
 try{
  await inventoryHost.publish({confirmReviewed:$('reviewConfirm').checked,acknowledgeLargeAbsence:$('largeAbsenceConfirm').checked});
  pendingImport=null;$('importPreview').hidden=true;$('inventoryFile').value='';
  await loadInventory();await refreshHistory();setProgress('تم اعتماد النسخة الجديدة. تم حفظ النسخة السابقة في الأرشيف.');toast('تم تحديث بيانات المخزن');
 }catch(e){pendingImport=null;$('importPreview').hidden=true;setImportError(inventoryError(e));}
 finally{setImportBusy(false);}
}
let archiveOffset=0,activityOffset=0,archiveBusy=false,activityBusy=false,archiveResetPending=false;
function versionCards(rows){
 return rows.map(x=>'<div class="version-card '+(x.status==='current'?'current':'')+(x.excludedAt?' excluded':'')+'"><div class="version-title"><b>'+esc(x.filename)+'</b><span class="version-badge">'+(x.status==='current'?'المعتمدة الحالية':x.excludedAt?'مستبعدة':'نسخة سابقة')+'</span></div><div class="version-meta">'+formattedStamp(x.approvedAt)+' · '+nf.format(x.itemCount)+' صنف<br>اعتمدها: '+esc(x.approvedBy||'المسؤول')+'</div>'+(x.status==='archived'?'<div class="version-actions">'+(x.excludedAt?'<button class="owner-action ghost" data-version-action="reinstate" data-id="'+esc(x.id)+'">إعادة للقائمة</button>':'<button class="owner-action" data-version-action="restore" data-id="'+esc(x.id)+'">مراجعة واعتماد هذه النسخة</button><button class="owner-action ghost" data-version-action="exclude" data-id="'+esc(x.id)+'">استبعاد النسخة</button>')+'</div>':'')+'</div>').join('');
}
function bindVersionActions(container){container.querySelectorAll('[data-version-action]').forEach(button=>button.onclick=()=>{if(button.dataset.versionAction==='restore')restoreVersion(button.dataset.id);else changeVersionVisibility(button.dataset.id,button.dataset.versionAction);});}
async function refreshHistory(){
 try{ownerOnly();const page=await inventoryHost.versions({limit:3,offset:0});$('importHistory').innerHTML=versionCards(page.items)||'لا توجد نسخ معتمدة بعد.';bindVersionActions($('importHistory'));}
 catch(e){$('importHistory').textContent=inventoryError(e);}
}
async function loadArchive(reset=false){
 if(archiveBusy){if(reset)archiveResetPending=true;return;}ownerOnly();archiveBusy=true;$('archiveMore').disabled=true;$('showExcluded').disabled=true;
 try{if(reset){archiveOffset=0;$('archiveRows').replaceChildren();}const page=await inventoryHost.versions({limit:20,offset:archiveOffset,includeExcluded:$('showExcluded').checked});$('archiveRows').insertAdjacentHTML('beforeend',versionCards(page.items));bindVersionActions($('archiveRows'));archiveOffset=page.nextOffset;$('archiveMore').hidden=!page.hasMore;}
 catch(e){setImportError(inventoryError(e));}finally{archiveBusy=false;$('archiveMore').disabled=false;$('showExcluded').disabled=false;if(archiveResetPending){archiveResetPending=false;loadArchive(true);}}
}
const eventLabels={STAGED:'رفع ملف للمراجعة',SEALED:'اكتمال فحص الملف',PUBLISHED:'اعتماد نسخة المخزن',REJECTED:'رفض نسخة',RESTORE_REQUESTED:'تجهيز نسخة سابقة للمراجعة',VERSION_EXCLUDED:'استبعاد نسخة من الاختيارات',VERSION_REINSTATED:'إعادة نسخة للاختيارات'};
async function loadActivity(reset=false){
 if(activityBusy)return;ownerOnly();activityBusy=true;
 try{if(reset){activityOffset=0;$('activityRows').replaceChildren();}const page=await inventoryHost.activity({limit:30,offset:activityOffset});$('activityRows').insertAdjacentHTML('beforeend',page.items.map(x=>'<div class="activity-entry"><b>'+esc(eventLabels[x.event]||x.event)+'</b><span> · '+esc(x.actorName||'المسؤول')+'</span><small>'+formattedStamp(x.occurredAt)+' · '+esc(x.filename||'نسخة مخزن')+'</small></div>').join(''));activityOffset=page.nextOffset;$('activityMore').hidden=!page.hasMore;if(!page.items.length&&reset)$('activityRows').textContent='لا توجد عمليات مسجلة بعد.';}
 catch(e){setImportError(inventoryError(e));}finally{activityBusy=false;}
}
async function changeVersionVisibility(id,action){
 ownerOnly();if(importBusy||!currentVersion?.versionId)return;
 const message=action==='exclude'?'استبعاد النسخة من الاختيارات؟ ستظل محفوظة في الأرشيف وسجل العمليات.':'إعادة النسخة إلى قائمة الاختيارات؟';
 if(!confirm(message))return;setImportBusy(true);setImportError('');
 try{await inventoryHost[action]({versionId:id,expectedCurrentId:currentVersion.versionId,confirm:true});await refreshHistory();if(!$('versionArchive').hidden)await loadArchive(true);if(!$('versionActivity').hidden)await loadActivity(true);toast(action==='exclude'?'تم استبعاد النسخة':'تمت إعادة النسخة للقائمة');}
 catch(e){setImportError(inventoryError(e));}finally{setImportBusy(false);}
}
async function restoreVersion(id){
 ownerOnly();if(importBusy||!confirm('تجهيز نسخة سابقة للمراجعة؟ لن تتغير البيانات قبل اعتماد الفروقات.'))return;
 setImportBusy(true);setImportError('');pendingImport=null;$('importPreview').hidden=true;
 try{const draft=await inventoryHost.restore(id);await reviewDraft(draft.draftId);}catch(e){setImportError(inventoryError(e));}finally{setImportBusy(false);}
}
function exportCurrentSnapshot(){ownerOnly();if(!currentVersion)return;const payload={versionId:currentVersion.versionId,approvedAt:currentVersion.approvedAt,source:currentVersion.filename,items:currentVersion.items};const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='MainTrack_inventory_'+currentVersion.versionId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
// Existing layout/classes are reused for review pagination, explicit absence acknowledgement and retry.
const pager=document.createElement('div');pager.className='btn-row';pager.innerHTML='<button type="button" class="owner-action ghost" id="diffPrev">السابق</button><button type="button" class="owner-action ghost" id="diffNext">التالي</button>';$('diffBody').closest('.import-table-wrap').after(pager);
const absence=document.createElement('label');absence.id='largeAbsenceLabel';absence.className='import-check';absence.hidden=true;absence.innerHTML='<input id="largeAbsenceConfirm" type="checkbox"><span>أؤكد مراجعة الأصناف الغائبة من الملف الجديد.</span>';$('reviewConfirm').closest('label').after(absence);
const retry=document.createElement('button');retry.id='retryInventory';retry.className='owner-guide-link';retry.hidden=true;retry.textContent='إعادة المحاولة';$('inventoryMeta').after(retry);retry.onclick=()=>{retry.hidden=true;loadInventory();};
$('ownerImportOpen').onclick=()=>{ownerOnly();$('ownerImport').showModal();refreshHistory();};
$('ownerImportClose').onclick=$('ownerImportDone').onclick=()=>$('ownerImport').close();
$('ownerImport').addEventListener('click',e=>{if(e.target===$('ownerImport'))$('ownerImport').close();});
$('inventoryFile').addEventListener('change',e=>importExcelInput(e.target.files[0]));
$('diffKind').onchange=()=>{diffPage=0;renderDiff();};$('diffPrev').onclick=()=>{diffPage--;renderDiff();};$('diffNext').onclick=()=>{diffPage++;renderDiff();};
$('reviewConfirm').onchange=$('largeAbsenceConfirm').onchange=updateApproval;$('approveImport').onclick=approveInventory;
$('cancelImport').onclick=()=>{pendingImport=null;$('importPreview').hidden=true;$('inventoryFile').value='';setProgress('تم إلغاء المعاينة؛ بيانات البحث لم تتغير.');updateApproval();};
$('exportSnapshot').onclick=exportCurrentSnapshot;$('restoreBaseline').onclick=async()=>{await loadInventory();await refreshHistory();};
$('archiveOpen').onclick=()=>{$('versionArchive').hidden=!$('versionArchive').hidden;if(!$('versionArchive').hidden)loadArchive(true);};
$('activityOpen').onclick=()=>{$('versionActivity').hidden=!$('versionActivity').hidden;if(!$('versionActivity').hidden)loadActivity(true);};
$('showExcluded').onchange=()=>loadArchive(true);$('archiveMore').onclick=()=>loadArchive();$('activityMore').onclick=()=>loadActivity();
let canManage=false;try{canManage=inventoryHost?.role()==='owner';}catch{}
$('ownerActions').hidden=!canManage;$('ownerImportOpen').hidden=!canManage;
$('ownerGuideOpen').hidden=!canManage;
// Reload only when a newer approved snapshot exists; no browser-local approval or embedded fallback.
window.addEventListener('focus',async()=>{try{if(currentVersion&&!importBusy){const v=await inventoryHost.version();if(v.versionId!==currentVersion.versionId)await loadInventory();}}catch{}});
loadInventory();

let cloudConfigured=false;
function updateCloudMessage(){$('storageStatus').textContent='متصل بخدمة المخزن. الاعتماد يحدّث النسخة لجميع المستخدمين.'+(canManage&&!cloudConfigured?' البحث السحابي غير مفعّل؛ يلزم إعداد مفتاح الخدمة على السيرفر.':'');}
function showSearchMode(){const mode=$('mt6Explain').dataset.mode;const badge=$('searchMode');badge.dataset.mode=!navigator.onLine?'offline':mode||'local';badge.textContent=!navigator.onLine?'بحث فني محلي':mode==='pending'?'تحسين البحث…':mode==='augmented'?'بحث سحابي مساعد':cloudConfigured?'بحث تلقائي':'بحث فني';}
new MutationObserver(showSearchMode).observe($('mt6Explain'),{attributes:true,childList:true,subtree:true});
window.addEventListener('online',showSearchMode);window.addEventListener('offline',showSearchMode);
(async()=>{try{const c=await inventoryHost.capabilities();cloudConfigured=c.cloud===true;if(cloudConfigured)window.MainTrackAI={search:async({query,signal})=>{const versionId=currentVersion?.versionId;const result=await inventoryHost.assist({query,versionId});if(signal.aborted||versionId!==currentVersion?.versionId)throw Error('SEARCH_SUPERSEDED');return result.mode==='cloud'?{codes:result.codes}:{codes:[]};}};updateCloudMessage();showSearchMode();}catch{showSearchMode();}})();
