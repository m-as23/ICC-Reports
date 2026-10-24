// Owner read-only ledger. Transport and credentials remain in the existing MainTrack host.
(function(){
'use strict';
const section=document.getElementById('admin');if(!section)return;
const $=id=>document.getElementById(id),session=()=>typeof S==='undefined'?null:S;
const permitted=()=>session()?.role==='owner'&&!!session()?.token&&section.style.display!=='none';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}),num=x=>x==null?'غير محدد':nf.format(Number(x));
const currentYear=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Africa/Cairo'}).format(new Date()));
$('tlYear').innerHTML=Array.from({length:Math.max(2,currentYear-2019)},(_,i)=>'<option value="'+(currentYear-i)+'">'+(currentYear-i)+'</option>').join('');
let active='accounts',selected=null,kind='annual',offset=0,detailOffset=0,epoch=0,token=null,timer,lastTeam=null,lastDetail=null;
const icons={settings:'<path d="M4 7h16M4 12h16M4 17h16"/>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'};
section.querySelectorAll('[data-icon],[data-svg]').forEach(el=>{const name=el.dataset.icon||el.dataset.svg;if(icons[name])el.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">'+icons[name]+'</svg>';});
function status(text,error=false){$('tlStatus').textContent=text;$('tlStatus').classList.toggle('ledger-error',error);}
function clearMetadata(){$('tlStaffCount').textContent='—';$('tlPendingCount').textContent='—';$('tlTableCaption').textContent='';for(const id of ['tlDetailTitle','tlDetailInitial','tlDetailMeta','tlDetailYear'])$(id).textContent='';}
function invalidate(){++epoch;clearMetadata();clearTimeout(timer);$('tlTeamRows').replaceChildren();$('tlDetailBody').replaceChildren();lastTeam=null;lastDetail=null;}
function switchTab(tab){
 if(tab==='balances'&&!permitted())return;
 invalidate();active=tab;selected=null;offset=0;detailOffset=0;
 const team=tab==='balances';$('adminAccountsPanel').hidden=team;$('adminBalancesPanel').hidden=!team;$('tlTeamView').hidden=false;$('tlDetailView').hidden=true;
 for(const [id,on]of [['adminAccountsTab',!team],['adminBalancesTab',team]]){$(id).setAttribute('aria-selected',String(on));$(id).tabIndex=on?0:-1;$(id).classList.toggle('is-selected',on);}
 if(team)load();
}
function context(){return permitted()&&active==='balances'?session().token:null;}
function params(){return selected?{employeeCode:selected,year:Number($('tlYear').value),kind,offset:detailOffset,limit:50}:{year:Number($('tlYear').value),query:$('tlSearch').value.trim(),offset,limit:50};}
async function load(){
 const expected=context();if(!expected)return;const id=++epoch,input=params();clearMetadata();$('tlRetry').hidden=true;status('جارٍ تحميل أرصدة الفريق…');$('tlPrev').disabled=true;$('tlNext').disabled=true;$('tlTeamRows').replaceChildren();$('tlDetailBody').replaceChildren();
 try{
  const data=await api(selected?'teamBalanceDetail':'teamBalances',input);
  if(id!==epoch||context()!==expected)return;
  if(data?.error)throw Error(data.error);
  if(selected){if(!data?.balance||!Array.isArray(data.items))throw Error('INVALID_RESPONSE');lastDetail=data;renderDetail(data);}
  else{if(!Array.isArray(data?.items))throw Error('INVALID_RESPONSE');lastTeam=data;renderTeam(data);}
  status('');
 }catch(e){
  if(id!==epoch||context()!==expected)return;
  status(['FORBIDDEN','AUTH','STALE_SESSION'].includes(e.message)?'انتهت صلاحية الجلسة أو لا تملك صلاحية عرض الفريق.':'تعذر تحميل أرصدة الفريق. تحقق من الاتصال ثم أعد المحاولة.',true);$('tlRetry').hidden=false;
 }
}
function renderTeam(data){
 $('tlStaffCount').textContent=num(data.staffCount);$('tlPendingCount').textContent=num(data.pendingCount);
 $('tlTeamRows').innerHTML=data.items.length?data.items.map(p=>{const b=p.balance,code=esc(p.profile.code);return '<tr><td><span class="person"><span class="person-avatar">'+esc(p.profile.name?.[0]||'؟')+'</span><span><button type="button" class="person-name tl-name-button" data-code="'+code+'">'+esc(p.profile.name)+'</button><span class="person-meta">'+code+' · '+esc(p.profile.jobTitle||'')+(p.active?'':' · غير نشط')+'</span></span></span></td><td><span class="value-strong">'+num(b.annualAvailableDays)+' يوم</span></td><td class="value-muted">'+num(b.substituteAvailableDays)+' يوم</td><td class="value-muted">'+num(p.financialActualDays)+' يوم</td><td><button class="open-link" type="button" data-code="'+code+'">عرض السجل</button></td></tr>';}).join(''):'<tr><td class="no-results" colspan="5">لا توجد نتائج مطابقة للبحث.</td></tr>';
 $('tlTableCaption').textContent='عرض '+num(data.items.length)+' من '+num(data.total)+' موظفًا';$('tlPrev').disabled=offset===0;$('tlNext').disabled=!data.hasMore;
}
const clock=x=>{if(!x)return '';const [h,m]=x.split(':').map(Number);return num(h%12||12)+':'+String(m).padStart(2,'0')+(h<12?' ص':' م');};
const stateLabel={APPROVED:'معتمد',PENDING:'معلق',REJECTED:'مرفوض',CANCELLED:'ملغي'};
function stats(items){return '<div class="stat-grid'+(items.length===2?' two':'')+'">'+items.map((x,i)=>'<div class="stat-card'+(i===items.length-1?' highlight':'')+'"><small>'+esc(x[0])+'</small><strong>'+num(x[1])+' <em>'+esc(x[2]||'يوم')+'</em></strong></div>').join('')+'</div>';}
function renderDetail(data){
 const b=data.balance,p=data.profile;$('tlDetailTitle').textContent=p.name;$('tlDetailInitial').textContent=p.name?.[0]||'؟';$('tlDetailMeta').textContent=(p.jobTitle||'')+' · '+p.code;$('tlDetailYear').textContent=$('tlYear').value;
 for(const id of ['tlTabAnnual','tlTabSub','tlTabCash']){$(id).setAttribute('aria-selected',String($(id).dataset.tab===kind));$(id).tabIndex=$(id).dataset.tab===kind?0:-1;}
 const values=kind==='annual'?[['رصيد الحساب الحالي',b.annualTotalDays],['المستخدم',b.annualUsedDays],['المتبقي',b.annualAvailableDays]]:kind==='sub'?[['المكتسب والتسويات',b.substituteEarnedDays],['المستخدم',b.substituteUsedDays],['المتبقي',b.substituteAvailableDays]]:[['أيام العمل الإضافي',data.attendanceDays],['الساعات المسجلة',data.approvedHours,'ساعة']];
 const headers=['الفترة / التاريخ','نوع الحركة','المدة','الحالة'];let html=stats(values)+'<p class="scope-note">الأرصدة الحالية مطابقة لصفحة «حسابي» وتشمل التسويات السابقة؛ السجل التالي للسنة المختارة فقط.</p><div class="panel history-table"><div class="panel-top"><div><h3 class="detail-table-title">'+({annual:'سجل الإجازات والتسويات السنوية',sub:'سجل الحضور مقابل بدل واستخدامه',cash:'سجل العمل الإضافي المالي'}[kind])+'</h3><p>المعتمد فقط يدخل في الأرصدة النهائية. الطلبات المعلقة والمرفوضة للمتابعة.</p></div></div><div class="table-wrap"><table aria-label="سجل رصيد الموظف"><thead><tr>'+headers.map(x=>'<th scope="col">'+x+'</th>').join('')+'</tr></thead><tbody>';
 html+=data.items.length?data.items.map(r=>{const period=esc(r.date)+(r.endDate&&r.endDate!==r.date?' – '+esc(r.endDate):'')+(r.from?'<br>'+clock(r.from)+' – '+clock(r.to):'');const label=(r.source==='adjustment'?'تسوية إدارية':r.source==='leave'?'إجازة':'حضور إضافي')+(r.reason?' · '+esc(r.reason):'')+(r.approvedBy?'<br>بواسطة '+esc(r.approvedBy):'')+(r.source==='adjustment'&&r.recordedAt?'<br>'+esc(r.recordedAt):'');const duration=r.minutes!=null?num(r.minutes/60)+' ساعة'+(kind==='sub'&&r.source==='overtime'?' / '+num(r.minutes/480)+' يوم بدل':''):num(r.days)+' يوم';return '<tr>'+[period,label,duration,'<span class="kind">'+esc(stateLabel[r.status]||r.status)+'</span>'].map((v,i)=>'<td data-label="'+headers[i]+'">'+v+'</td>').join('')+'</tr>';}).join(''):'<tr><td class="no-results" colspan="4">لا توجد حركات مسجلة لهذه السنة.</td></tr>';
 html+='</tbody></table></div><div class="ledger-paging"><button id="tlDetailPrev" type="button" '+(detailOffset===0?'disabled':'')+'>السابق</button><span>'+num(data.total)+' حركة</span><button id="tlDetailNext" type="button" '+(!data.hasMore?'disabled':'')+'>التالي</button></div></div><div class="note-line">'+(kind==='cash'?'أيام الحضور الفعلية مستقلة عن الساعات؛ الإضافي المالي لا يغير رصيد الإجازات.':'٨ ساعات = يوم بدل، و٤ ساعات = نصف يوم. التسويات الإدارية ظاهرة بسجلها وسببها.')+'</div>';
 $('tlDetailBody').innerHTML=html;$('tlDetailPrev').onclick=()=>{detailOffset=Math.max(0,detailOffset-50);load();};$('tlDetailNext').onclick=()=>{detailOffset+=50;load();};
}
$('adminAccountsTab').onclick=()=>switchTab('accounts');$('adminBalancesTab').onclick=()=>switchTab('balances');
for(const id of ['adminAccountsTab','adminBalancesTab'])$(id).addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const team=e.key==='End'||(e.key!=='Home'&&active==='accounts');switchTab(team?'balances':'accounts');$(team?'adminBalancesTab':'adminAccountsTab').focus();}});
$('tlTeamRows').onclick=e=>{const code=e.target.closest('button[data-code]')?.dataset.code;if(!code)return;selected=code;kind='annual';detailOffset=0;$('tlTeamView').hidden=true;$('tlDetailView').hidden=false;load();$('tlBackBtn').focus();};
$('tlBackBtn').onclick=()=>{selected=null;detailOffset=0;$('tlDetailView').hidden=true;$('tlTeamView').hidden=false;load();};
for(const [id,value]of [['tlTabAnnual','annual'],['tlTabSub','sub'],['tlTabCash','cash']]){$(id).onclick=()=>{kind=value;detailOffset=0;load();};$(id).onkeydown=e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const kinds=['annual','sub','cash'],i=kinds.indexOf(kind),next=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowLeft'?1:2))%3;kind=kinds[next];detailOffset=0;load();$(['tlTabAnnual','tlTabSub','tlTabCash'][next]).focus();}};}
$('tlSearch').addEventListener('input',()=>{++epoch;clearTimeout(timer);$('tlTeamRows').replaceChildren();$('tlClearSearch').hidden=!$('tlSearch').value;offset=0;timer=setTimeout(load,300);});
$('tlSearch').addEventListener('compositionstart',()=>clearTimeout(timer));$('tlSearch').addEventListener('compositionend',()=>{clearTimeout(timer);timer=setTimeout(load,300);});
$('tlClearSearch').onclick=()=>{$('tlSearch').value='';$('tlClearSearch').hidden=true;offset=0;clearTimeout(timer);load();$('tlSearch').focus();};
$('tlYear').onchange=()=>{offset=0;detailOffset=0;load();};$('tlPrev').onclick=()=>{offset=Math.max(0,offset-50);load();};$('tlNext').onclick=()=>{offset+=50;load();};$('tlRefresh').onclick=load;$('tlRetry').onclick=load;
function visibility(){const s=session();if(!permitted()||token!==s?.token){token=s?.token||null;switchTab('accounts');$('tlSearch').value='';$('tlClearSearch').hidden=true;$('tlStaffCount').textContent='—';$('tlPendingCount').textContent='—';$('tlStatus').textContent='';}}
new MutationObserver(visibility).observe(section,{attributes:true,attributeFilter:['style']});window.addEventListener('pagehide',invalidate);window.addEventListener('pageshow',e=>{if(e.persisted&&active==='balances')load();});visibility();
})();
