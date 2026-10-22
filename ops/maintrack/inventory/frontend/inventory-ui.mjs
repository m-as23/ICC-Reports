import {createInventoryClient} from './inventory-client.mjs';
const $=id=>document.getElementById(id),section=$('inventory');
const readSession=()=>typeof S==='undefined'?null:S;
const client=createInventoryClient({endpoint:'https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-inventory-047-qa',readSession});
let busy=false,currentQuery='',nextOffset=null,review=null,reviewPage=0,lastToken=null;
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
 for(const id of ['inv47Query','inv47Find','inv47File','inv47Upload','inv47HistoryButton','inv47ReviewPrev','inv47ReviewNext'])$(id).disabled=busy;
 $('inv47More').disabled=busy||nextOffset===null;
 $('inv47ReviewPrev').disabled=busy||!review||reviewPage===0;
 $('inv47ReviewNext').disabled=busy||!review||(reviewPage+1)*100>=review.details.length;
 $('inv47Confirm').disabled=busy||!review?.complete;
 $('inv47Publish').disabled=busy||!review?.complete||!$('inv47Confirm').checked||(review.requiresExplicitReview&&!$('inv47Absence').checked);
}
async function run(task){if(busy)return;busy=true;controls();try{await task();}catch(e){state(messages[e.message]||(e.name==='AbortError'?'انتهت مهلة طلب المخزن. تحقق من النتيجة قبل إعادة المحاولة.':'تعذر إكمال طلب المخزن أو قراءة الملف. راجع النتيجة قبل إعادة المحاولة.'));}finally{busy=false;controls();}}
function resetReview(){review=null;reviewPage=0;$('inv47Review').hidden=true;$('inv47Confirm').checked=false;$('inv47Absence').checked=false;empty($('inv47Diff'));controls();}
async function refreshVersion(){
 const data=await client.version();
 $('inv47Version').textContent=data.versionId?'النسخة المعتمدة: '+data.versionId+' • '+String(data.filename||''):'لا توجد نسخة رصيد معتمدة بعد؛ يرفع المسؤول أول ملف Excel ويعتمده لبدء البحث.';
 return data;
}
async function search(more=false){
 const query=more?currentQuery:$('inv47Query').value.trim();if(!query){state('اكتب اسم القطعة أو الكود أو الموديل للبحث.');return;}
 if(!more){currentQuery=query;nextOffset=null;empty($('inv47Results'));}
 const data=await client.search(query,{offset:more?nextOffset:0});
 if(!more)empty($('inv47Results'));
 const holder=document.createElement('div');
 table(holder,['الكود','الكمية','الوصف الكامل','الموقع'],data.items.map(x=>[x.code,x.quantity===null?'غير متاحة':x.quantity,x.description,x.location]));
 $('inv47Results').append(...holder.childNodes);nextOffset=data.nextOffset;
 state(data.totalMatches?'نتائج «'+query+'»: '+data.totalMatches+' صنف • المعروض '+(data.offset+data.items.length):'لا توجد أصناف مطابقة في آخر رصيد معتمد.');
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
$('inv47More').onclick=()=>run(()=>search(true));
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
 resetReview();nextOffset=null;empty($('inv47Results'));await refreshVersion();state('تم اعتماد الرصيد الجديد وحفظ النسخ المعتمدة السابقة في الأرشيف.');
});
$('inv47HistoryButton').onclick=()=>run(async()=>{
 const rows=await client.history();table($('inv47History'),['النسخة','الملف','عدد الأصناف','الحالة'],rows.map(x=>[x.id,x.filename,x.itemCount,x.status==='current'?'المعتمدة الحالية':'أرشيف']));state('سجل آخر '+rows.length+' نسخة معتمدة؛ الرفع الجديد يُقارن بآخر نسخة معتمدة فقط.');
});
function visibility(){
 const s=readSession();if(!s||s.token!==lastToken){lastToken=s?.token||null;client.reset();resetReview();empty($('inv47Results'));empty($('inv47History'));nextOffset=null;}
 if(section.style.display==='block'&&s){client.reset();resetReview();nextOffset=null;empty($('inv47Results'));$('inv47Owner').hidden=s.role!=='owner';run(async()=>{await refreshVersion();state('ابحث بالعربي أو الإنجليزي؛ تُعرض نتائج النسخة المعتمدة فقط.');});}
}
new MutationObserver(visibility).observe(section,{attributes:true,attributeFilter:['style']});
controls();visibility();
