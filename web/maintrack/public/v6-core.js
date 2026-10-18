
(function(){
'use strict';
if(window.__MainTrackV6Integrated)return;window.__MainTrackV6Integrated=true;
const $id=id=>document.getElementById(id);
const icons={
tabDash:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
tabForm:'<path d="M12 5v14M5 12h14"/>',tabCmms:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h6"/>',
tabCatalog:'<path d="M3 6h18M3 12h18M3 18h18M8 3v18"/>',tabProfile:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
tabLeave:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
tabApprove:'<path d="M4 3h16v18H4zM8 12l3 3 5-6"/>',tabAdmin:'<path d="M4 7h16M4 12h16M4 17h16"/>',
bellBtn:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'};
const svg=id=>{const e=document.createElementNS('http://www.w3.org/2000/svg','svg');e.setAttribute('viewBox','0 0 24 24');e.setAttribute('aria-hidden','true');e.classList.add('v6Icon');e.innerHTML=icons[id];return e;};
const owner=()=>Boolean(typeof S!=='undefined'&&S&&S.role==='owner');
const val=id=>String($id(id).value||'').trim();
const opt=(name,value)=>new Option(name,value);
const msg=(id,t,ok=true)=>{const n=$id(id);n.textContent=t;n.style.color=ok?'#14775d':'#b3261e';};
function boot(){
const tabs=$id('tabs'),bar=$id('bar');if(!tabs||!bar)return;
const logo=document.createElement('div');logo.className='v6Logo';logo.innerHTML='<img src="bd-192.png" alt="MainTrack"><div><strong>MainTrack</strong><small>MAINTENANCE WORKSPACE</small></div>';
const close=document.createElement('button');close.type='button';close.className='v6Close';close.textContent='×';close.setAttribute('aria-label','إغلاق القائمة');logo.append(close);tabs.prepend(logo);
for(const id of Object.keys(icons).filter(k=>k!=='bellBtn')){const b=$id(id);if(b&&tabs.contains(b))b.prepend(svg(id));}
const avatar=document.createElement('div');avatar.className='v6User';avatar.setAttribute('role','button');avatar.tabIndex=0;avatar.setAttribute('aria-label','فتح حسابي');avatar.innerHTML='<span class="v6UserAvatar" id="v6Initial">◉</span><span><strong class="v6UserName" id="v6Identity">—</strong><small class="v6UserRole" id="v6Role">—</small></span>';
avatar.addEventListener('click',()=>$id('tabProfile').click());avatar.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();avatar.click()}});tabs.append(avatar);
const toggle=document.createElement('button');toggle.type='button';toggle.id='v6Toggle';toggle.textContent='☰';toggle.setAttribute('aria-label','فتح القائمة');toggle.setAttribute('aria-expanded','false');bar.prepend(toggle);
const shade=document.createElement('div');shade.id='v6Shade';document.body.append(shade);

const hide=()=>{document.body.classList.remove('v6Drawer');toggle.setAttribute('aria-expanded','false');};
toggle.onclick=()=>{if(document.body.classList.contains('v6Drawer'))hide();else{document.body.classList.add('v6Drawer');toggle.setAttribute('aria-expanded','true');close.focus();}};
close.onclick=()=>{hide();toggle.focus()};shade.onclick=hide;tabs.addEventListener('click',e=>{if(e.target.closest('button[id^="tab"]'))hide()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('v6Drawer')){hide();toggle.focus()}});
function sync(){
const active=tabs.style.display!=='none'&&!document.body.classList.contains('auth-screen');
if(document.body.classList.contains('v6On')!==active)document.body.classList.toggle('v6On',active);
if(!active)hide();
if(active&&typeof S!=='undefined'&&S){
const name=S.displayName||S.name||'مستخدم';
if($id('v6Identity').textContent!==name)$id('v6Identity').textContent=name;
const role=S.role==='owner'?'Owner / المسؤول':S.role==='engineer'?'Engineer / مهندس':'Technician / فني';
if($id('v6Role').textContent!==role)$id('v6Role').textContent=role;
const init=Array.from(name.trim())[0]||'◉';if($id('v6Initial').textContent!==init)$id('v6Initial').textContent=init;
}

}
let pending=false;const schedule=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;sync();})};
new MutationObserver(schedule).observe(tabs,{subtree:true,attributes:true,attributeFilter:['style','class','hidden']});
const who=$id('who');if(who)new MutationObserver(schedule).observe(who,{subtree:true,childList:true,characterData:true});
sync();
initCatalog();
initWO();
initEmployees();
}
let catRows=[],catBusy=false;
async function loadCatalog(){
if(!owner())return;const kind=val('v6Kind'),scope=kind==='machines'||kind==='parts';$id('v6Scope').hidden=!scope;$id('v6CatRows').textContent='جارٍ التحميل…';
try{const d=await Promise.all(scope?[api('adminCatalog',{kind}),api('adminCatalog',{kind:'sections'})]:[api('adminCatalog',{kind})]);for(const x of d)if(x.error)throw Error(x.error);if(val('v6Kind')!==kind)return;
catRows=d[0].items||[];if(scope){const s=$id('v6Parent');s.replaceChildren();(d[1].items||[]).filter(x=>x.active).forEach(x=>s.add(opt(x.name,x.name)));}
drawCatalog();
}catch(e){msg('v6CatMsg','فشل التحميل: '+e.message,false);$id('v6CatRows').textContent='تعذر قراءة السجلات.';}
}
function drawCatalog(){
const target=$id('v6CatRows');target.replaceChildren();const q=val('v6Search').toLocaleLowerCase();
const subset=catRows.filter(x=>(x.name+' '+(x.section||'')).toLocaleLowerCase().includes(q));$id('v6CatCount').textContent='('+subset.length+' / '+catRows.length+')';
if(!subset.length){target.textContent='لا توجد عناصر.';return;}
for(const item of subset){
const row=document.createElement('div');row.className='v6-catrow';const info=document.createElement('div'),name=document.createElement('strong'),state=document.createElement('small');name.textContent=item.name;state.textContent=(item.section?item.section+' • ':'')+(item.active?'نشط':'مخفي');info.append(name,state);
const actions=document.createElement('div');actions.className='v6-cat-actions';
const rename=document.createElement('button');rename.type='button';rename.textContent='تعديل الاسم';rename.onclick=async()=>{const next=prompt('الاسم الجديد:',item.name);if(next===null)return;const n=next.trim();if(n===item.name)return;if(!n||n.length>100||/[<>]/.test(n))return msg('v6CatMsg','الاسم غير صالح.',false);if(!confirm('تعديل '+item.name+'؟'))return;await saveCatalog({kind:val('v6Kind'),operation:'rename',id:item.id,name:n})};
const stateButton=document.createElement('button');stateButton.type='button';stateButton.textContent=item.active?'إخفاء':'تفعيل';stateButton.onclick=async()=>{if(!confirm((item.active?'إخفاء ':'تفعيل ')+item.name+'؟'))return;await saveCatalog({kind:val('v6Kind'),operation:'toggle',id:item.id,active:!item.active})};
actions.append(rename,stateButton);row.append(info,actions);target.append(row);
}
}
async function saveCatalog(payload){
if(catBusy||!owner())return;catBusy=true;$id('v6CatAdd').disabled=true;
try{const d=await api('adminCatalogSave',payload);if(d.error)throw Error(d.error);msg('v6CatMsg','تم الحفظ بنجاح.');$id('v6CatName').value='';await loadCatalog();D=null;}catch(e){msg('v6CatMsg','فشل الحفظ: '+e.message,false)}finally{catBusy=false;$id('v6CatAdd').disabled=false;}
}
function initCatalog(){
$id('tabCatalog').onclick=()=>{if(!owner())return;show('catalog');msg('v6CatMsg','');loadCatalog();};
$id('v6Kind').onchange=()=>{$id('v6Search').value='';loadCatalog()};
$id('v6Search').oninput=drawCatalog;$id('v6CatReload').onclick=loadCatalog;
$id('v6CatForm').onsubmit=async e=>{e.preventDefault();const name=val('v6CatName'),kind=val('v6Kind');if(!name||name.length>100||/[<>]/.test(name))return msg('v6CatMsg','الاسم غير صالح.',false);const p={kind,operation:'create',name};if(['machines','parts'].includes(kind)){if(!val('v6Parent'))return msg('v6CatMsg','اختار القسم.',false);p.section=val('v6Parent');}if(!confirm('إضافة '+name+'؟'))return;await saveCatalog(p);};
}
let woOffset=0,woTotal=0,woDetail=null,woBusy=false;
async function loadWO(preserve=false){
if(!owner()||woBusy)return;woBusy=true;
if(!preserve)$id('v6Detail').hidden=true;
try{const d=await api('cmms',{mode:'list',limit:25,offset:woOffset,q:val('v6Query'),section:val('v6Section'),source:val('v6Source')});if(d.error)throw Error(d.error);
woTotal=d.total||0;$id('v6Total').textContent='('+woTotal+')';const target=$id('v6WORows');target.replaceChildren();
for(const row of d.items||[]){const tr=document.createElement('tr');for(const s of [row.woId,row.date,row.section,row.machine,row.workflowState||row.status]){const cell=document.createElement('td');cell.textContent=String(s??'—');tr.append(cell);}const t=document.createElement('td'),b=document.createElement('button');b.type='button';b.textContent='عرض / تعديل';b.onclick=()=>showWO(row.woNumber);t.append(b);tr.append(t);target.append(tr);}
if(!target.children.length)target.textContent='لا توجد بلاغات.';$id('v6Paging').textContent=(woTotal?woOffset+1:0)+'–'+Math.min(woTotal,woOffset+25)+' / '+woTotal;$id('v6Prev').disabled=woOffset===0;$id('v6Next').disabled=woOffset+25>=woTotal;
}catch(e){$id('v6WORows').textContent='فشل تحميل البلاغات: '+e.message;}finally{woBusy=false;}
}
async function showWO(woNumber){
const box=$id('v6Detail');box.hidden=false;$id('v6Editor').hidden=true;$id('v6AuditList').hidden=true;$id('v6DetailFields').textContent='جارٍ تحميل التفاصيل…';
try{const d=await api('cmms',{mode:'detail',woNumber});if(d.error)throw Error(d.error);woDetail=d.item;$id('v6DetailTitle').textContent='تفاصيل '+(woDetail.woId||'WO-'+woNumber)+' — Revision '+woDetail.revision;
const fields=$id('v6DetailFields');fields.replaceChildren();
for(const [label,value] of [['رقم WO',woDetail.woId],['التاريخ',woDetail.date],['القسم',woDetail.section],['الماكينة',woDetail.machine],['المكون',woDetail.component],['وصف العطل',woDetail.description],['الحل',woDetail.solution],['قطع الغيار',woDetail.spareParts],['الفني',woDetail.technician],['الحالة',woDetail.status],['التصنيف',woDetail.category],['حالة أمر الشغل',woDetail.workflowState],['ساعات الإصلاح',woDetail.repairHours]]){const cell=document.createElement('div'),c=document.createElement('small'),v=document.createElement('strong');cell.className='v6-detail-field';c.textContent=label;v.textContent=String(value??'—');cell.append(c,v);fields.append(cell);}
const closed=woDetail.workflowState==='CLOSED';$id('v6Edit').disabled=closed;$id('v6Edit').title=closed?'افتح أمر الشغل أولًا':'';$id('v6Close').hidden=closed;$id('v6Reopen').hidden=!closed;msg('v6WOMsg','');box.scrollIntoView({block:'nearest',behavior:'smooth'});
}catch(e){msg('v6WOMsg','تعذر فتح التفاصيل: '+e.message,false);$id('v6DetailFields').textContent='';}
}
const fill=(id,values,selected)=>{const el=$id(id);el.replaceChildren();[...new Set([...(values||[]).filter(Boolean),selected].filter(Boolean))].forEach(x=>el.add(opt(x,x)));el.value=selected||'';};
function initWO(){
$id('tabCmms').onclick=async()=>{if(!owner())return;show('cmms');if($id('v6Section').options.length===1){try{const d=await api('adminCatalog',{kind:'sections'});if(!d.error){const sel=$id('v6Section');sel.replaceChildren(opt('جميع الأقسام',''));(d.items||[]).forEach(x=>sel.add(opt(x.name,x.name)));}}catch(e){}}woOffset=0;await loadWO();};
$id('v6Find').onclick=()=>{woOffset=0;loadWO()};$id('v6Refresh').onclick=()=>loadWO();$id('v6Prev').onclick=()=>{woOffset=Math.max(0,woOffset-25);loadWO()};$id('v6Next').onclick=()=>{if(woOffset+25<woTotal){woOffset+=25;loadWO()}};
$id('v6HideDetail').onclick=()=>$id('v6Detail').hidden=true;
$id('v6Edit').onclick=async()=>{
if(!woDetail||woDetail.workflowState==='CLOSED')return;
$id('v6Desc').value=woDetail.description||'';$id('v6Solution').value=woDetail.solution||'';$id('v6Spare').value=woDetail.spareParts||'';
if(!D){try{const d=await api('init');if(!d.error)D=d;}catch(e){}}
fill('v6Status',D?.status||[],woDetail.status);fill('v6Category',D?.cats||[],woDetail.category);
$id('v6Reason').value='';$id('v6Editor').hidden=false;$id('v6Reason').focus();
};
$id('v6Cancel').onclick=()=>$id('v6Editor').hidden=true;
$id('v6Editor').onsubmit=async e=>{e.preventDefault();await writeWO('edit',{description:val('v6Desc'),solution:val('v6Solution'),spareParts:val('v6Spare'),status:val('v6Status'),category:val('v6Category'),reason:val('v6Reason')});};
$id('v6Close').onclick=()=>writeWO('close',{});$id('v6Reopen').onclick=()=>writeWO('reopen',{});
$id('v6Audit').onclick=async()=>{if(!woDetail)return;const target=$id('v6AuditList');target.hidden=false;target.textContent='جارٍ تحميل سجل التغييرات…';
try{const d=await api('cmmsAudit',{woNumber:woDetail.woNumber});if(d.error)throw Error(d.error);target.replaceChildren();
if(!(d.items||[]).length){target.textContent='لا يوجد تاريخ تعديل حتى الآن.';return;}
for(const row of d.items){const p=document.createElement('div');p.className='v6-auditrow';const s=document.createElement('strong'),sub=document.createElement('small');s.textContent=(row.action||'Edit')+' — '+(row.actorName||'System');sub.textContent=(row.createdAt||'')+' • '+(row.details?.reason||'');p.append(s,sub);target.append(p);}
}catch(e){target.textContent='تعذر تحميل سجل التعديلات: '+e.message;}}
}
async function writeWO(operation,body){
if(!woDetail||!owner())return;
let reason=operation==='edit'?body.reason:prompt(operation==='close'?'سبب إغلاق أمر الشغل:':'سبب إعادة فتح أمر الشغل:');
if(reason===null)return;reason=String(reason||'').trim();
if(reason.length<3||reason.length>500)return msg('v6WOMsg','اكتب سببًا بين 3 و500 حرف.',false);
if(!confirm('تأكيد '+(operation==='edit'?'تعديل':operation==='close'?'إغلاق':'إعادة فتح')+' '+woDetail.woId+'؟'))return;
const id=woDetail.woNumber,rev=Number(woDetail.revision);$id('v6Save').disabled=true;
try{const p={action:'cmmsWrite',operation,woNumber:id,revision:rev,reason,...body};p.reason=reason;delete p.action;
const d=await api('cmmsWrite',p);if(d.error)throw Error(d.error);
await loadWO(true);await showWO(id);msg('v6WOMsg','تم حفظ العملية بنجاح في سجل التعديلات.');
}catch(e){msg('v6WOMsg','تعذر التنفيذ: '+e.message,false);}
finally{$id('v6Save').disabled=false;}
}
function initEmployees(){
$id('v6UsersTools').hidden=false;
const run=async action=>{if(!owner())return;const code=val('v6EmpCode').toUpperCase(),name=val('v6EmpName');if(!/^[A-Z0-9_-]{2,32}$/.test(code))return msg('v6EmpMsg','كود الموظف غير صالح.',false);
if(action==='adminCreateEmployee'&&(name.length<2||name.length>100))return msg('v6EmpMsg','اكتب اسم الموظف.',false);
if(!confirm((action==='adminCreateEmployee'?'إنشاء موظف ':'تغيير كلمة مرور ')+code+'؟'))return;
$id('v6Temp').hidden=true;
try{const args=action==='adminCreateEmployee'?{code,name,role:val('v6EmpRole')}:{code};const d=await api(action,args);if(d.error)throw Error(d.error);$id('v6TempPw').textContent=d.temporaryPassword||'غير متاح';$id('v6Temp').hidden=false;msg('v6EmpMsg','تمت العملية؛ انسخ كلمة المرور المؤقتة الآن.');}
catch(e){msg('v6EmpMsg','تعذر العملية: '+e.message,false);}};
$id('v6CreateEmp').onclick=()=>run('adminCreateEmployee');$id('v6ResetEmp').onclick=()=>run('adminResetEmployeePassword');
$id('v6CopyPw').onclick=async()=>{try{await navigator.clipboard.writeText($id('v6TempPw').textContent);msg('v6EmpMsg','تم النسخ.')}catch(e){msg('v6EmpMsg','انسخ القيمة يدويًا.',false)}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
