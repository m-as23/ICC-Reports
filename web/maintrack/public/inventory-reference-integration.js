'use strict';
// The uploaded page's visual/search code is kept in inventory-reference.js.
// Only the original local import lab is replaced here by MainTrack's approved data service.
const inventoryHost=window.parent!==window?window.parent.MainTrackInventoryHost:null;
let currentVersion=null,pendingImport=null,importBusy=false,diffPage=0,historyRows=[],loadEpoch=0;
const pageSize=50;
const importMessages={UNAUTHENTICATED:'انتهت الجلسة. سجّل الدخول مجددًا.',SESSION_CHANGED:'تغير الحساب أثناء العملية. أعد المحاولة.',FORBIDDEN:'تحديث البيانات متاح لحساب Owner فقط.',ONLY_XLSX_ALLOWED:'اختر ملف Excel بصيغة xlsx.',XLSX_DIRECT_UPLOAD_REQUIRED:'الحد الحالي لحجم الملف 2 ميجابايت.',STALE_BASE_RECOMPARE_REQUIRED:'اعتُمد ملف أحدث أثناء المراجعة؛ أعد المقارنة قبل الاعتماد.',INVENTORY_VERSION_CHANGED_RESTART_SEARCH:'تغيرت نسخة المخزن أثناء التحميل؛ أعد المحاولة.',DIFF_STALE_OR_INVALID:'تغيرت نسخة المخزن؛ أعد رفع الملف للمقارنة.',REQUIRED_SHEETS_MISSING:'الملف لا يحتوي شيت الأصناف وشيت المواقع المطلوبين.',DUPLICATE_LOCATION_CODE:'يوجد كود مكرر في شيت المواقع.',DUPLICATE_ITEM_CODE:'يوجد كود مكرر في شيت الأصناف.'};
function inventoryError(e){return importMessages[e?.message]||(e?.name==='AbortError'?'انتهت مهلة الاتصال بخدمة المخزن. أعد المحاولة.':'تعذر الاتصال بخدمة المخزن أو قراءة الملف. تحقق من الاتصال ثم أعد المحاولة.');}
function ownerOnly(){if(!inventoryHost||inventoryHost.role()!=='owner')throw Error('FORBIDDEN');}
function toReferenceItem(x){return {c:x.code,d:x.description||'',q:x.quantity===null||x.quantity===undefined?null:Number(x.quantity),l:x.location||'',n:x.extra?.newCard||null,o:x.extra?.oldCard||null,r:x.extra?.drawer||null,i:x.extra?.iccCode||'',s:x.extra?.sourceSheet==='locations'?1:2};}
function formattedStamp(ts){return ts?new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Cairo'}).format(new Date(ts)):'غير محدد';}
function setProgress(message){$('importProgress').textContent=message;}
function setImportError(message){$('importError').textContent=message;$('importError').hidden=!message;}
function setImportBusy(value){importBusy=value;$('inventoryFile').disabled=value;$('cancelImport').disabled=value;updateApproval();}
function updateApproval(){$('approveImport').disabled=importBusy||!pendingImport?.complete||!$('reviewConfirm').checked||(pendingImport?.requiresExplicitReview&&!$('largeAbsenceConfirm').checked);}
async function loadInventory(){
 const epoch=++loadEpoch;closeDetail();closeFilters();$('retryInventory').hidden=true;$('query').disabled=true;$('searchButton').disabled=true;
 try{
  if(!inventoryHost)throw Error('UNAUTHENTICATED');
  const data=await inventoryHost.snapshot();if(epoch!==loadEpoch)return;
  currentVersion=data;mt6SetData(data.items.map(toReferenceItem));$('totalCount').textContent=nf.format(INDEX.length);
  $('inventoryFreshness').textContent=formattedStamp(data.approvedAt);
  $('inventoryMeta').textContent=data.versionId?'نسخة معتمدة من '+data.filename:'لم تُعتمد نسخة جرد بعد';
  $('inventorySource').textContent='المصدر: «'+(data.filename||'ملف الجرد المعتمد')+'».';
  $('query').disabled=false;$('searchButton').disabled=false;
  search();
  if(!data.versionId)mt6Status('لم تُعتمد بيانات بعد. يرفع المسؤول ملف الجرد ويعتمده.');
  $('storageStatus').textContent='متصل بخدمة المخزن. الاعتماد يحدّث النسخة لجميع المستخدمين.';
 }catch(e){
  if(epoch!==loadEpoch)return;
  INDEX=[];currentVersion=null;$('results').replaceChildren();$('resultSection').hidden=true;
  $('inventoryFreshness').textContent='تعذر التحميل';$('inventoryMeta').textContent=inventoryError(e);mt6Status(inventoryError(e));
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
async function refreshHistory(){
 try{ownerOnly();historyRows=await inventoryHost.history();$('importHistory').innerHTML=historyRows.length?historyRows.map(x=>'<div class="history-row"><span><b>'+esc(x.filename)+'</b> · '+formattedStamp(x.approvedAt)+' · '+nf.format(x.itemCount)+' كود</span>'+(x.status==='archived'?'<button data-restore="'+esc(x.id)+'">استرجاع النسخة</button>':'<span>المعتمدة الحالية</span>')+'</div>').join(''):'لا توجد نسخ معتمدة بعد.';
  $('importHistory').querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>restoreVersion(b.dataset.restore));
 }catch(e){$('importHistory').textContent=inventoryError(e);}
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
$('exportSnapshot').onclick=exportCurrentSnapshot;$('restoreBaseline').onclick=()=>loadInventory();
let canManage=false;try{canManage=inventoryHost?.role()==='owner';}catch{}
$('ownerImportOpen').hidden=!canManage;
$('ownerGuideOpen').hidden=!canManage;
// Reload only when a newer approved snapshot exists; no browser-local approval or embedded fallback.
window.addEventListener('focus',async()=>{try{if(currentVersion&&!importBusy){const v=await inventoryHost.version();if(v.versionId!==currentVersion.versionId)await loadInventory();}}catch{}});
loadInventory();
