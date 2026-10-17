import {calculateOvertime,getShiftEnd,formatLocalDateTime,formatQuantity} from './account-math.mjs';
/**
 * MainTrack My Account v2: opt-in additive UI layer on top of locked common assets.
 * No backend schema modifications, invented balances, or local-only "approved" entries.
 * Existing leave endpoint remains functional; overtime submission is explicitly gated.
 */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const template=$('mt-account-v2-template'),profile=$('profile');
 if(!template||!profile||$('mtav2'))return;
 profile.appendChild(template.content.cloneNode(true));
 profile.classList.add('mt-account-ready');
 document.body.classList.add('mt-account-v2-on');
 const current=()=>typeof S!=='undefined'&&S&&S.token?S:null;
 const words={annual:'سنوية',casual:'عارضة',sick:'مرضية',other:'أخرى',compensatory:'بدل'};
 const states={PENDING:'قيد المراجعة',APPROVED:'معتمد',REJECTED:'مرفوض'};
 const text=(id,value)=>{const el=$(id);if(el)el.textContent=value==null?'—':String(value);};
 const none='—';
 let items=[],currentHistory='leave',generation=0,available=false;
 const dateToday=()=>formatLocalDateTime(new Date()).slice(0,10);
 const setMessage=(id,msg,kind)=>{const el=$(id);if(!el)return;el.className='mtav2-feedback'+(kind?' '+kind:'');el.textContent=msg;};
 function clearNumbers(){
  for(const id of ['mtav2AnnualAvailable','mtav2AnnualTotal','mtav2AnnualUsed','mtav2CompAvailable','mtav2CompEarned','mtav2CompUsed','mtav2CompDays','mtav2FinancialDays','mtav2FinancialHours'])text(id,none);
 }
 const number=v=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
 function renderBalances(summary){
  clearNumbers();
  if(!summary||typeof summary!=='object')return false;
  // Backend MUST provide explicitly classified buckets. Never reinterpret a legacy
  // combined leaveBalance as annual entitlement or compensatory leave.
  const annual=summary.annual,comp=summary.compensatory,financial=summary.financial;
  if(!annual||!comp||!financial)return false;
  const aAvailable=number(annual.availableDays),aTotal=number(annual.totalDays),aUsed=number(annual.usedDays);
  const cAvailable=number(comp.availableMinutes),cEarned=number(comp.earnedMinutes),cUsed=number(comp.usedMinutes);
  const fMinutes=number(financial.approvedMinutes);
  if([aAvailable,aTotal,aUsed,cAvailable,cEarned,cUsed,fMinutes].some(v=>v===null||v<0))return false;
  text('mtav2AnnualAvailable',formatQuantity(aAvailable,2));
  text('mtav2AnnualTotal',formatQuantity(aTotal,2));
  text('mtav2AnnualUsed',formatQuantity(aUsed,2));
  text('mtav2CompAvailable',formatQuantity(cAvailable/60,2));
  text('mtav2CompDays',formatQuantity(cAvailable/480));
  text('mtav2CompEarned',formatQuantity(cEarned/60,2));
  text('mtav2CompUsed',formatQuantity(cUsed/60,2));
  text('mtav2FinancialHours',formatQuantity(fMinutes/60,2));
  text('mtav2FinancialDays',formatQuantity(fMinutes/480));
  return true;
 }
 function renderIdentity(p){
  const name=(p.preferredName||p.name||'الموظف').trim();
  text('mtav2Name',name);
  text('mtav2Avatar',name.charAt(0)||'M');
  text('mtav2Job',p.jobTitle||'المسمى الوظيفي غير محدد');
  text('mtav2Code',p.code||current()?.code);
  text('mtav2Department',p.department||'غير محدد');
  text('mtav2Title',p.jobTitle||'غير محدد');
  text('mtav2Role',({'owner':'Owner','engineer':'Engineer','technician':'Technician'})[p.role]||p.role||none);
  // Retain the established profile hydration because other existing UI reads it.
  if(typeof renderProfile==='function')renderProfile(p);
  const legacy=$('mtav2Legacy');
  legacy.hidden=p.leaveBalance==null;
  legacy.textContent=p.leaveBalance==null?'':'معلومة من النظام السابق: رصيد الإجازات غير المصنّف = '+formatQuantity(Number(p.leaveBalance),2)+' يوم. لن نعتبره رصيدًا سنويًا أو بدلًا قبل الفصل الرسمي للأرصدة.';
 }
 function listHistory(){
  const host=$('mtav2History');host.replaceChildren();
  if(currentHistory!=='leave'){
    const el=document.createElement('p');el.className='mtav2-empty';
    el.textContent='سجل الإضافي '+(currentHistory==='financial'?'المالي':'البدل')+' سيُعرض هنا بعد تفعيل طلبات الإضافي واعتمادها من المالك. لا توجد أرقام افتراضية.';host.append(el);return;
  }
  if(!available){const e=document.createElement('p');e.className='mtav2-empty';e.textContent='سجل الإجازات غير متاح حاليًا. أعد المحاولة عند عودة الاتصال.';host.append(e);return;}
  if(!items.length){const e=document.createElement('p');e.className='mtav2-empty';e.textContent='لا توجد طلبات إجازة حتى الآن.';host.append(e);return;}
  items.forEach(r=>{
    const card=document.createElement('article');card.className='mtav2-entry';
    const info=document.createElement('div'),strong=document.createElement('strong'),caption=document.createElement('small'),badge=document.createElement('span');
    strong.textContent=(words[r.type]||r.type||'إجازة')+' • '+(r.id||'طلب');
    caption.textContent=(r.start||none)+' ← '+(r.end||none)+' • '+(r.days??none)+' يوم';
    badge.textContent=states[r.status]||r.status||none;
    badge.className=r.status==='APPROVED'?'approved':r.status==='REJECTED'?'rejected':'pending';
    info.append(strong,caption);card.append(info,badge);host.append(card);
  });
 }
 async function openAccount(){
  if(!current())return;
  show('profile');
  if($('msg'))$('msg').textContent=''; // Old banners never persist to a different page.
  const v=++generation,token=current().token;
  text('mtav2State','جارٍ تحميل بيانات الحساب من السيرفر…');
  text('mtav2Pending',none+' طلب قيد المراجعة');
  clearNumbers();available=false;items=[];listHistory();
  $('mtav2Owner').hidden=current().role!=='owner';
  const [p,l]=await Promise.allSettled([api('profile'),api('leaveMine')]);
  if(!current()||current().token!==token||v!==generation)return;
  if(p.status==='fulfilled'&&p.value.error==='AUTH'){logout();return;}
  if(l.status==='fulfilled'&&l.value.error==='AUTH'){logout();return;}
  const profileResult=p.status==='fulfilled'&&!p.value.error?p.value:null;
  const leaveResult=l.status==='fulfilled'&&!l.value.error?l.value:null;
  if(profileResult&&profileResult.profile)renderIdentity(profileResult.profile);
  if(leaveResult){
    available=true;items=Array.isArray(leaveResult.items)?leaveResult.items:[];
    text('mtav2Pending',items.filter(r=>r.status==='PENDING').length+' طلب قيد المراجعة');
    if(!profileResult&&leaveResult.profile)renderIdentity(leaveResult.profile);
  }
  listHistory();
  const explicitSummary=(profileResult&&profileResult.accountSummaryV2)||(leaveResult&&leaveResult.accountSummaryV2);
  const connected=renderBalances(explicitSummary);
  text('mtav2State',connected?'الأرصدة المعتمدة مأخوذة مباشرة من النظام.':'تصميم الأرصدة جاهز. ما زال يلزم ربط السجل المنفصل للسنوي والبدل والإضافي؛ لن نعرض أرصدة تقديرية.');
  if(!profileResult&&!leaveResult)text('mtav2State','تعذر تحميل بيانات الحساب. تأكد من الاتصال ثم افتح حسابي مجددًا.');
 }
 async function sendLeave(e){
  e.preventDefault();
  const user=current();if(!user){setMessage('mtav2LeaveStatus','يجب تسجيل الدخول أولًا.','error');return;}
  const start=$('mtav2LeaveStart').value,end=$('mtav2LeaveEnd').value,type=$('mtav2LeaveType').value,reason=$('mtav2LeaveReason').value;
  if(!start||!end||end<start){setMessage('mtav2LeaveStatus','حدد فترة الإجازة بالترتيب الصحيح.','error');return;}
  if(type==='compensatory'){setMessage('mtav2LeaveStatus','إجازات البدل تحتاج تفعيل الرصيد المنفصل أولًا.','error');return;}
  if(!confirm('هل تريد إرسال طلب الإجازة للمراجعة؟'))return;
  const submit=$('mtav2LeaveSubmit');submit.disabled=true;
  const fingerprint=[user.code,start,end,type,reason].join('|');
  let old={};try{old=JSON.parse(sessionStorage.getItem('pendingLeaveV2')||'{}');}catch(_){}
  const cid=old.fingerprint===fingerprint?old.cid:(typeof crypto.randomUUID==='function'?crypto.randomUUID():null);
  if(!cid){setMessage('mtav2LeaveStatus','تعذّر إنشاء رقم طلب آمن. جرّب متصفحًا أحدث.','error');submit.disabled=false;return;}
  sessionStorage.setItem('pendingLeaveV2',JSON.stringify({fingerprint,cid}));
  try{
    const d=await api('leaveRequest',{start,end,type,reason,cid});
    if(d.error==='AUTH'){logout();return;}
    if(d.error)throw new Error(d.error);
    sessionStorage.removeItem('pendingLeaveV2');
    setMessage('mtav2LeaveStatus','تم إرسال الطلب رقم '+(d.id||'—')+' بنجاح. في انتظار قرار المالك.','success');
    $('mtav2LeaveReason').value='';
    await openAccount();
    if(typeof loadNotices==='function')loadNotices(true);
  }catch(err){setMessage('mtav2LeaveStatus','لم يتم تأكيد إرسال الطلب: '+(err.message||'خطأ اتصال')+'. لا تكرر الطلب قبل التحقق من السجل.','error');}
  finally{submit.disabled=false;}
 }
 function shiftDefaults(){
  const mode=$('mtav2WorkMode').value,date=$('mtav2WorkDate').value||dateToday();
  $('mtav2ShiftRow').hidden=mode!=='extension';
  try {
    const from=mode==='extension'?getShiftEnd(date,$('mtav2Shift').value):date+'T07:00';
    $('mtav2WorkStart').value=from;
    const d=new Date(from);d.setHours(d.getHours()+(mode==='extension'?4:8));
    $('mtav2WorkEnd').value=formatLocalDateTime(d);
  }catch(_){$('mtav2WorkStart').value='';$('mtav2WorkEnd').value='';}
  calculate();
 }
 function calculate(){
  try{
    const result=calculateOvertime({mode:$('mtav2WorkMode').value,date:$('mtav2WorkDate').value,shift:$('mtav2Shift').value,start:$('mtav2WorkStart').value,end:$('mtav2WorkEnd').value});
    text('mtav2CalcHours',formatQuantity(result.hours,2)+' ساعة');
    text('mtav2CalcDays',formatQuantity(result.equivalentDays)+' يوم');
    return result;
  }catch(_){text('mtav2CalcHours',none);text('mtav2CalcDays',none);return null;}
 }
 function previewOvertime(e){
  e.preventDefault();
  try{
    const d=calculateOvertime({mode:$('mtav2WorkMode').value,date:$('mtav2WorkDate').value,shift:$('mtav2Shift').value,start:$('mtav2WorkStart').value,end:$('mtav2WorkEnd').value});
    const kind=$('mtav2Compensation').value==='financial'?'مالي':'بدل';
    setMessage('mtav2OvertimeStatus','معاينة فقط: '+formatQuantity(d.hours,2)+' ساعة فعلية = '+formatQuantity(d.equivalentDays)+' يوم مكافئ، نوع المقابل: '+kind+'. لم يتم إرسال الطلب أو إضافته لأي رصيد.','success');
  }catch(e){
    setMessage('mtav2OvertimeStatus',e.message==='BEFORE_SHIFT_END'?'ساعات الإضافي بعد الوردية يجب أن تبدأ بعد انتهاء الوردية الرسمية.':'تحقق من وقت البداية والنهاية؛ يلزم فرق موجب لا يتجاوز 24 ساعة لكل طلب.','error');
  }
 }
 $('mtav2LeaveForm').addEventListener('submit',sendLeave);
 $('mtav2OvertimeForm').addEventListener('submit',previewOvertime);
 $('mtav2WorkDate').value=dateToday();
 for(const id of ['mtav2WorkMode','mtav2WorkDate','mtav2Shift'])$(id).addEventListener('change',shiftDefaults);
 for(const id of ['mtav2WorkStart','mtav2WorkEnd'])$(id).addEventListener('input',calculate);
 shiftDefaults();$('mtav2OwnerYear').value=String(new Date().getFullYear());
 $('mtav2History').closest('.mtav2-history').querySelectorAll('[data-history]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    currentHistory=btn.dataset.history;
    $('mtav2History').closest('.mtav2-history').querySelectorAll('[data-history]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));
    listHistory();
  });
 });
 $('tabProfile').onclick=openAccount;$('who').onclick=openAccount;
 // Notification and legacy leave-page navigation should land in unified account.
 try{if(typeof showLeave==='function')showLeave=openAccount;if(typeof showProfile==='function')showProfile=openAccount;}catch(_){}
 window.MainTrackAccountV2=Object.freeze({open:openAccount,formula:'approved overtime minutes / 480',mode:'design-preview'});
})();
