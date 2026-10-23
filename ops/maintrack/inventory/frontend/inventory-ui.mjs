import {createInventoryClient} from './inventory-client.mjs';
import {CATEGORIES,describeItem,filterItems,sortItems,collectSearchResults} from './inventory-presentation.mjs';
import {icon} from './inventory-icons.mjs';
const $=id=>document.getElementById(id),section=$('inventory');
const readSession=()=>typeof S==='undefined'?null:S;
const client=createInventoryClient({endpoint:'https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-inventory-047-qa',readSession});
let busy=false,currentQuery='',nextOffset=null,review=null,reviewPage=0,lastToken=null,allItems=[],visibleItems=12,searchEpoch=0,detailTrigger=null;
const messages={UNAUTHENTICATED:'انتهت الجلسة. سجّل الدخول مجددًا.',FORBIDDEN:'هذه العملية متاحة للمسؤول فقط.',INVENTORY_NOT_READY:'خدمة المخزن غير جاهزة بعد. حاول لاحقًا.',INTERNAL_ERROR:'تعذر إكمال طلب المخزن. حاول مجددًا.',INVENTORY_VERSION_CHANGED_RESTART_SEARCH:'تم اعتماد رصيد أحدث. ابدأ البحث مجددًا.',RESTART_SEARCH_REQUIRED:'ابدأ البحث من الصفحة الأولى.',STALE_BASE_RECOMPARE_REQUIRED:'تم اعتماد ملف أحدث أثناء المراجعة. أعد رفع الملف لمقارنته بأحدث رصيد.',DIFF_STALE_OR_INVALID:'تغيرت نسخة الرصيد. أعد رفع الملف للمقارنة من جديد.',ONLY_XLSX_ALLOWED:'اختر ملف Excel بصيغة xlsx.',XLSX_DIRECT_UPLOAD_REQUIRED:'حد الرفع الحالي 2 ميجابايت. لم يُرفع الملف.',OWNER_REVIEW_REQUIRED:'أكد مراجعة الفروق قبل الاعتماد.',LARGE_ABSENCE_NEEDS_EXPLICIT_APPROVAL:'أكد مراجعة الأصناف الغائبة من الملف الجديد.',SESSION_CHANGED:'تغير الحساب أثناء العملية. أعد المحاولة.'};
const state=text=>{$('inv47State').textContent=text;};
const empty=node=>node.replaceChildren();
function cell(row,value){const c=document.createElement('td');c.textContent=value===null||value===undefined||value===''?'—':String(value);row.append(c);return c;}
function table(container,headings,rows){
 empty(container);const wrap=document.createElement('div');wrap.className='inv47-table-wrap';const t=document.createElement('table'),thead=document.createElement('thead'),hr=document.createElement('tr');
 for(const label of headings){const h=document.createElement('th');h.scope='col';h.textContent=label;hr.append(h);}thead.append(hr);t.append(thead);const body=document.createElement('tbody');
 for(const values of rows){const r=document.createElement('tr');for(const value of values)cell(r,value);body.append(r);}t.append(body);wrap.append(t);container.append(wrap);
}
function controls(){
 $('inv47Clear').hidden=!$('inv47Query').value;$('inv47Clear').classList.toggle('show',Boolean($('inv47Query').value));
 for(const id of ['inv47Category','inv47Location','inv47Stock','inv47Sort'])$(id).disabled=busy;
 for(const id of ['inv47Query','inv47Find','inv47File','inv47Upload','inv47HistoryButton','inv47ReviewPrev','inv47ReviewNext'])$(id).disabled=busy;
 $('inv47More').disabled=busy||nextOffset===null;
 $('inv47ReviewPrev').disabled=busy||!review||reviewPage===0;
 $('inv47ReviewNext').disabled=busy||!review||(reviewPage+1)*100>=review.details.length;
 $('inv47Confirm').disabled=busy||!review?.complete;
 $('inv47Publish').disabled=busy||!review?.complete||!$('inv47Confirm').checked||(review.requiresExplicitReview&&!$('inv47Absence').checked);
}
async function run(task){if(busy)return;busy=true;controls();try{await task();}catch(e){if(e.message==='SEARCH_SUPERSEDED')return;state(messages[e.message]||(e.name==='AbortError'?'انتهت مهلة طلب المخزن. تحقق من النتيجة قبل إعادة المحاولة.':'تعذر إكمال طلب المخزن أو قراءة الملف. راجع النتيجة قبل إعادة المحاولة.'));}finally{busy=false;controls();}}
function resetReview(){review=null;reviewPage=0;$('inv47Review').hidden=true;$('inv47Confirm').checked=false;$('inv47Absence').checked=false;empty($('inv47Diff'));controls();}
async function refreshVersion(){
 const data=await client.version();
 $('inv47Version').textContent=data.versionId?'النسخة المعتمدة: '+data.versionId+' • '+String(data.filename||''):'لا توجد نسخة رصيد معتمدة بعد؛ يرفع المسؤول أول ملف Excel ويعتمده لبدء البحث.';
 return data;
}
const nf=new Intl.NumberFormat('en-US',{maximumFractionDigits:4});
function el(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
function action(label,kind,handler){const b=el('button',kind,label);b.type='button';b.onclick=handler;return b;}
function labeledIcon(name,text){const n=el('span','loc-pill');n.append(icon(name),el('span','',text));return n;}
async function copyCode(code){try{await navigator.clipboard.writeText(code);state('تم نسخ كود الصنف: '+code);}catch{state('تعذر النسخ التلقائي. يمكنك تحديد الكود ونسخه يدويًا.');}}
function resetResults(){searchEpoch++;allItems=[];visibleItems=12;nextOffset=null;empty($('inv47Results'));$('inv47SearchArea').hidden=true;$('inv47Welcome').hidden=false;if($('inv47Detail').open)$('inv47Detail').close();if($('inv47FilterDialog').open)$('inv47FilterDialog').close();}
function fillOptions(id,values,label){const select=$(id);empty(select);select.append(new Option(label,''));for(const [value,text] of values)select.append(new Option(text,value));}
function prepareFilters(){
 fillOptions('inv47Category',Object.entries(CATEGORIES).filter(([k])=>allItems.some(x=>describeItem(x).category===k)),'كل الأنواع');
 fillOptions('inv47Location',[...new Set(allItems.map(x=>x.location).filter(Boolean))].sort().map(x=>[x,x]),'كل المواقع');
 $('inv47Stock').value='';
}
function showDetails(item,trigger){
 detailTrigger=trigger;const body=$('inv47DetailBody');empty(body);$('inv47DetailTitle').textContent=describeItem(item).label;
 const qty=el('div','detail-qty');qty.append(el('span','','الرصيد حسب ملف الجرد'),el('strong','',item.quantity===null?'غير متاحة':nf.format(Number(item.quantity))));body.append(qty);
 const section=el('div','detail-section');section.append(el('h3','','الكود الأصلي'));const code=el('div','detail-code');const copy=action('نسخ الكود','soft-btn',()=>copyCode(item.code));copy.prepend(icon('copy'));code.append(el('code','',item.code),copy);section.append(code,el('h3','','الوصف الأصلي كما ورد في Excel'),el('div','detail-desc',item.description||'غير متاح في ملف المخزن'));body.append(section);
 const grid=el('div','detail-grid');for(const [label,value] of [['الموقع',item.location],['الكارت الجديد',item.extra?.newCard],['الكارت القديم',item.extra?.oldCard],['رقم الدرج',item.extra?.drawer],['كود ICC',item.extra?.iccCode]]){const c=el('div','detail-cell');c.append(el('small','',label),el('strong','',value===null||value===undefined||value===''?'غير مدون':String(value)));grid.append(c);}body.append(el('h3','','بيانات التخزين'),grid,el('p','detail-footer','البيانات من نسخة الجرد التي ظهرت في البحث، وليست رصيدًا لحظيًا من Oracle.'));
 $('inv47Detail').showModal();$('inv47DetailClose').focus();
}
function renderResults(){
 const rows=sortItems(filterItems(allItems,{category:$('inv47Category').value,location:$('inv47Location').value,stock:$('inv47Stock').value}),$('inv47Sort').value);empty($('inv47Results'));
 for(const item of rows.slice(0,visibleItems)){
  const meta=describeItem(item),card=el('article','part-card'),head=el('div','item-header'),heading=el('div','item-heading'),label=el('div','item-label');
  label.append(icon(meta.category),el('span','item-category',meta.label));heading.append(label,el('h3','',item.description?item.description.slice(0,100):'وصف غير متاح'),el('span','item-id',item.code));
  const qty=el('div','qty-stack'+(item.quantity===null?' na':Number(item.quantity)===0?' zero':''));qty.append(el('span','big',item.quantity===null?'غير متاحة':nf.format(Number(item.quantity))),el('span','unit','الرصيد حسب الملف'));head.append(heading,qty);
  const bottom=el('div','part-bottom'),locs=el('div','loc-pills');locs.append(labeledIcon('pin','الموقع: '+(item.location||'غير مدون')));if(item.extra?.newCard)locs.append(labeledIcon('id','الكارت: '+item.extra.newCard));if(item.extra?.drawer)locs.append(labeledIcon('box','الدرج: '+item.extra.drawer));
  const actions=el('div','code-actions'),copy=action('نسخ الكود','soft-btn',()=>copyCode(item.code));copy.prepend(icon('copy'));const detail=action('التفاصيل','soft-btn detail-btn',()=>showDetails(item,detail));detail.append(icon('arrow'));actions.append(copy,detail);bottom.append(locs,actions);card.append(head,el('p','item-desc',item.description||'الوصف غير متاح في ملف المخزن'),bottom);$('inv47Results').append(card);
 }
 if(!rows.length)$('inv47Results').append(el('div','no-match','لا توجد أصناف مطابقة للبحث والفلاتر الحالية.'));
 $('inv47Counter').textContent=nf.format(rows.length)+' صنف';nextOffset=visibleItems<rows.length?visibleItems:null;$('inv47More').hidden=nextOffset===null;controls();
 state('نتائج «'+currentQuery+'»: '+nf.format(rows.length)+' صنف من '+nf.format(allItems.length)+' نتيجة • المعروض '+Math.min(visibleItems,rows.length));
}
async function search(){
 const query=$('inv47Query').value.trim();if(!query){resetResults();state('اكتب اسم القطعة أو الكود أو الموديل للبحث.');return;}
 resetResults();currentQuery=query;const epoch=searchEpoch;const token=readSession()?.token;state('جارٍ البحث في الرصيد المعتمد…');
 const snapshot=await collectSearchResults((q,args)=>client.search(q,args),query,{isCurrent:()=>epoch===searchEpoch&&readSession()?.token===token,onProgress:(n,total)=>state('جارٍ تجميع نتائج البحث: '+nf.format(n)+' من '+nf.format(total))});
 allItems=snapshot.items;$('inv47Version').textContent='نسخة نتائج البحث المعتمدة: '+(snapshot.versionId||'لا يوجد رصيد معتمد');
 prepareFilters();$('inv47Welcome').hidden=true;$('inv47SearchArea').hidden=false;renderResults();
}
function renderReview(){
 if(!review)return;
 const counts=review.counts||{};
 $('inv47ReviewSummary').textContent='مقارنة مع آخر نسخة معتمدة '+(review.baseVersionId||'(أول رفع)')+' • جديد '+(counts.NEW||0)+' • متغير '+(counts.CHANGED||0)+' • غائب '+(counts.ABSENT||0)+' • دون تغيير '+(counts.UNCHANGED||0);
 const types={NEW:'جديد',CHANGED:'متغير',ABSENT:'غائب من الملف',UNCHANGED:'دون تغيير'};
 const details=review.details.slice(reviewPage*100,(reviewPage+1)*100);
 table($('inv47Diff'),['الكود / الحالة','الرصيد السابق','الرصيد الجديد'],details.map(x=>[x.code+' — '+(types[x.type]||x.type),x.before?x.before.description+' | '+(x.before.quantity??'غير متاحة')+' | '+(x.before.location||'—'):'—',x.after?x.after.description+' | '+(x.after.quantity??'غير متاحة')+' | '+(x.after.location||'—'):'—']));
 $('inv47ReviewPage').textContent='الصفحة '+(reviewPage+1)+' من '+Math.max(1,Math.ceil(review.details.length/100))+' • جميع '+review.details.length+' بند متاحة للمراجعة';
 $('inv47AbsenceLabel').hidden=!review.requiresExplicitReview;$('inv47Review').hidden=false;controls();
}
$('inv47Find').onclick=()=>run(()=>search());
$('inv47Query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run(()=>search());}});
$('inv47More').onclick=()=>{visibleItems+=12;renderResults();};
$('inv47Clear').onclick=()=>{$('inv47Query').value='';resetResults();state('اكتب اسم القطعة أو الكود أو الموديل للبحث.');controls();$('inv47Query').focus();};
$('inv47Query').addEventListener('input',controls);
for(const id of ['inv47Category','inv47Location','inv47Stock','inv47Sort'])$(id).onchange=()=>{visibleItems=12;renderResults();};
$('inv47ResetFilters').onclick=()=>{$('inv47Category').value='';$('inv47Location').value='';$('inv47Stock').value='';visibleItems=12;renderResults();};
const narrow=window.matchMedia('(max-width:760px)');
function placeFilters(){
 const filters=$('inv47Filters'),dialog=$('inv47FilterDialog');
 if(narrow.matches){$('inv47FilterBody').append(filters);filters.hidden=false;$('inv47FilterToggle').setAttribute('aria-haspopup','dialog');}
 else{if(dialog.open)dialog.close();section.querySelector('.workarea').append(filters);filters.hidden=false;$('inv47FilterToggle').removeAttribute('aria-haspopup');}
 $('inv47FilterToggle').setAttribute('aria-expanded',String(!narrow.matches));
}
placeFilters();narrow.addEventListener('change',placeFilters);
$('inv47FilterToggle').onclick=()=>{if(narrow.matches){$('inv47Filters').hidden=false;$('inv47FilterDialog').showModal();$('inv47FilterToggle').setAttribute('aria-expanded','true');}else{const hidden=!$('inv47Filters').hidden;$('inv47Filters').hidden=hidden;$('inv47FilterToggle').setAttribute('aria-expanded',String(!hidden));}};
$('inv47FilterClose').onclick=()=>$('inv47FilterDialog').close();
$('inv47FilterDialog').addEventListener('close',()=>{$('inv47FilterToggle').setAttribute('aria-expanded','false');});
$('inv47DetailClose').onclick=()=>$('inv47Detail').close();
$('inv47Detail').addEventListener('close',()=>{if(detailTrigger?.isConnected)detailTrigger.focus();});
for(const b of section.querySelectorAll('[data-inv-query]'))b.onclick=()=>{if(busy)return;$('inv47Query').value=b.dataset.invQuery;run(()=>search());};
for(const slot of section.querySelectorAll('[data-inv-icon]'))slot.append(icon(slot.dataset.invIcon));
$('inv47Upload').onclick=()=>run(async()=>{
 resetReview();const file=$('inv47File').files?.[0];if(!file){state('اختر ملف Excel أولًا.');return;}
 state('جارٍ التحقق من Excel وتجهيز الفروقات؛ لا يتغير الرصيد قبل اعتمادك.');
 const draft=await client.upload(file);review=await client.review(draft.draftId);renderReview();state('اكتملت قراءة الفروقات. راجع الصفحات ثم أكد المراجعة للاعتماد.');
});
$('inv47ReviewPrev').onclick=()=>{if(review&&reviewPage>0){reviewPage--;renderReview();}};
$('inv47ReviewNext').onclick=()=>{if(review&&(reviewPage+1)*100<review.details.length){reviewPage++;renderReview();}};
$('inv47Confirm').onchange=controls;$('inv47Absence').onchange=controls;
$('inv47Publish').onclick=()=>run(async()=>{
 try{await client.publish({confirmReviewed:$('inv47Confirm').checked,acknowledgeLargeAbsence:$('inv47Absence').checked});}catch(e){resetReview();throw e;}
 resetReview();resetResults();await refreshVersion();state('تم اعتماد الرصيد الجديد وحفظ النسخ المعتمدة السابقة في الأرشيف.');
});
$('inv47HistoryButton').onclick=()=>run(async()=>{
 const rows=await client.history();table($('inv47History'),['النسخة','الملف','عدد الأصناف','الحالة'],rows.map(x=>[x.id,x.filename,x.itemCount,x.status==='current'?'المعتمدة الحالية':'أرشيف']));state('سجل آخر '+rows.length+' نسخة معتمدة؛ الرفع الجديد يُقارن بآخر نسخة معتمدة فقط.');
});
function visibility(){
 const s=readSession();if(!s||s.token!==lastToken){lastToken=s?.token||null;client.reset();resetReview();resetResults();empty($('inv47History'));}
 if(section.style.display==='block'&&s){client.reset();resetReview();resetResults();$('inv47Owner').hidden=s.role!=='owner';run(async()=>{await refreshVersion();state('ابحث بالعربي أو الإنجليزي؛ تُعرض نتائج النسخة المعتمدة فقط.');});}
}
new MutationObserver(visibility).observe(section,{attributes:true,attributeFilter:['style']});
controls();visibility();
