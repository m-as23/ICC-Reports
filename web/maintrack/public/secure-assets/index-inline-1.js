
const API = 'https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api'; // PILOT ONLY
const ADMIN_WA = '';
const $ = id => document.getElementById(id);
const REQ = ['section','machine','comp','desc','solution','date','t1','t2','t3','status','cat'];
const ALL = REQ.concat(['spare']);
let D = null, busy = false, dashBusy = false, S = null;
try { S = JSON.parse(sessionStorage.getItem('s') || localStorage.getItem('s') || 'null'); } catch(e) { S=null; }
// One-time session migration: stop persisting credentials across browser restarts.
localStorage.removeItem('s');localStorage.removeItem('d');localStorage.removeItem('bd_dashboard_cache'); if (S) sessionStorage.setItem('s',JSON.stringify(S));
let noticeBusy=false, noticeLast=0, initBusy=null, adminItems=[], appAuthenticated=false;
let noticeOpen = false;
let selectedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const getQ = () => {try{return JSON.parse(localStorage.getItem('q')||'[]');}catch(e){return [];}};
function setQ(q) { localStorage.setItem('q', JSON.stringify(q)); pend(); }
function pend() { const n = getQ().filter(q=>S&&q.u===S.code).length; $('pend').style.display = n ? 'flex' : 'none'; $('pn').textContent = n; }
const MAINTRACK_ERROR_MESSAGES=Object.freeze({INVALID_SECTION_MACHINE_COMPONENT:'الجزء المختار غير متاح لهذا القسم أو الماكينة. حدّث القوائم ثم حاول مجددًا.',INVALID_STATUS_OR_CATEGORY:'حالة البلاغ أو تصنيفه لم يعد متاحًا. حدّث القوائم.',IDEMPOTENCY_CONFLICT:'الطلب سبق إرساله ببيانات مختلفة. راجع البيانات قبل المحاولة.',INSUFFICIENT_LEAVE_BALANCE:'الرصيد المتاح غير كافٍ لهذا الطلب.',LEAVE_BALANCE_NOT_SET:'لم يتم تحديد رصيد الإجازات لهذا الموظف بعد.',AUTH_UNCONFIRMED:'تعذر التحقق من الجلسة حاليًا، حاول مجددًا.',INTERNAL_ERROR:'حدث خطأ في السيرفر. حاول لاحقًا أو تواصل مع المسؤول.'});
function localizedError(t){return String(t||'').replace(/\b(?:INVALID_[A-Z_]+|INTERNAL_ERROR|IDEMPOTENCY_CONFLICT|INSUFFICIENT_LEAVE_BALANCE|LEAVE_BALANCE_NOT_SET|AUTH_UNCONFIRMED)\b/g,code=>MAINTRACK_ERROR_MESSAGES[code]||'تعذّر إكمال العملية، راجع البيانات وحاول مجددًا.');}
function note(t, c) { const m = $('msg'); m.textContent = localizedError(t); m.className = t ? c : ''; }
function fill(sel, arr, ph) { sel.length = 0; if (ph) sel.add(new Option(ph, '')); arr.forEach(x => sel.add(new Option(x, x))); }
function today() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
// Read operations should fail quickly and recover from the UI; a possibly committed
// write must NOT be silently retried after an HTTP timeout.
const API_TIMEOUT_MS = Object.freeze({
  login:30000, change:45000, session:15000, init:20000,
  dashboard:20000, notifications:15000, nextId:15000,
  profile:20000, leaveMine:20000, leaveInbox:20000,
  adminUsers:20000, submit:45000, leaveRequest:45000,
  leaveDecision:45000, markNotificationRead:30000,
  updateProfile:45000, adminSaveUser:45000
});
const API_DEFAULT_TIMEOUT_MS=25000;
// Safe metrics in the device console: no employee code, passwords, payload, or token.
function requestMetric(action,ms,status){
  try { console.info('[MainTrack API]',JSON.stringify({action,ms:Math.round(ms),status})); }catch(e){}
}
async function post(b){
  const action=String(b.action||'unknown');
  const timeout=API_TIMEOUT_MS[action]||API_DEFAULT_TIMEOUT_MS;
  const controller=new AbortController();
  const begun=Date.now();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetch(API,{
      method:'POST',signal:controller.signal,cache:'no-store',
      headers:Object.assign({'Content-Type':'application/json','X-Request-Id':crypto.randomUUID()},b.token?{'Authorization':'Bearer '+b.token}:{}),body:JSON.stringify(Object.fromEntries(Object.entries(b).filter(([key])=>key!=='token')))
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok&&!data?.error)throw new Error('HTTP '+response.status);
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('INVALID_RESPONSE');
    requestMetric(action,Date.now()-begun,data.error?'server_error':'ok');
    return data;
  }catch(e){
    if(controller.signal.aborted){
      requestMetric(action,Date.now()-begun,'timeout');
      const timeoutError=new Error('TIMEOUT '+timeout+'ms');timeoutError.name='AbortError';timeoutError.timeoutMs=timeout;
      throw timeoutError;
    }
    requestMetric(action,Date.now()-begun,'network_error');throw e;
  }finally{clearTimeout(timer);}
}
async function confirmInvalidSession(token){
  try {
    const response=await post({action:'session',token});
    if(response.error==='AUTH')return 'invalid';
    if(response.ok===true)return 'valid';
  }catch(e){/* A failed verification is NOT proof of an expired session. */}
  return 'unknown';
}
// A stale response from an earlier token must never sign out a newer login.
// A single AUTH from a secondary endpoint is confirmed before logging out.
async function api(action,params={}){
  const token=S&&S.token;
  if(!token)return {error:'AUTH'};
  const result=await post(Object.assign({},params,{action,token}));
  if(!S||S.token!==token)return {error:'STALE_SESSION'};
  if(result.error!=='AUTH'||action==='session')return result;
  const verdict=await confirmInvalidSession(token);
  if(!S||S.token!==token)return {error:'STALE_SESSION'};
  return verdict==='invalid'?result:{error:'AUTH_UNCONFIRMED'};
}
const roles = {owner:'Owner',engineer:'Engineer',technician:'Technician',legacy_viewer:'صلاحية قديمة موقوفة',unassigned:'غير معيّن'};
const canReport = () => S&&['owner','engineer','technician'].includes(S.role);
function setSync(text,state){ const el=$('syncStatus'); if(!el)return; el.innerHTML='';const dot=document.createElement('i');el.append(dot,document.createTextNode(' '+text));el.dataset.state=state||'ok'; }

const netMsg = e => !navigator.onLine ? 'لا يوجد اتصال بالإنترنت. تسجيل الدخول يحتاج نت' : (e && e.name === 'AbortError' ? 'انتهت مهلة الاتصال بعد '+Math.round((e.timeoutMs||API_DEFAULT_TIMEOUT_MS)/1000)+' ثانية. الطلب لم يكتمل على جهازك؛ حاول مجددًا.' : 'تعذر الوصول للسيرفر. تحقق من الاتصال ثم أعد المحاولة.');
const norm = s => s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
function show(v) {
 if(window.__maintrackActiveView!==v)note('','');
 window.__maintrackActiveView=v;
  document.body.classList.toggle('auth-screen', v === 'login' || v === 'change');
  ['login','change','form','profile','leave','approvals','admin','cmms','catalog'].forEach(x => $(x).style.display = x === v ? 'block' : 'none');
  $('authStage').style.display = v==='login' ? 'grid' : 'none';
  $('dashboard').style.display = v === 'dashboard' ? 'block' : 'none';
  $('send').style.display = v === 'form'&&canReport() ? 'block' : 'none';
  const logged = !!S && v !== 'login' && v !== 'change';
  $('bar').style.display = S && v !== 'login' && v !== 'change' ? 'flex' : 'none';
  $('tabs').style.display = logged ? 'flex' : 'none';
  ['Dash','Form','Profile','Leave','Approve','Admin','Cmms','Catalog'].forEach(tab=>$('tab'+tab).classList.toggle('active',v===({Dash:'dashboard',Form:'form',Profile:'profile',Leave:'leave',Approve:'approvals',Admin:'admin',Cmms:'cmms',Catalog:'catalog'}[tab])));
  $('tabAdmin').style.display=S&&S.role==='owner'?'block':'none';$('tabCmms').style.display=S&&S.role==='owner'?'block':'none';$('tabCatalog').style.display=S&&S.role==='owner'?'block':'none';$('tabApprove').style.display=S&&S.role==='owner'?'block':'none';$('tabLeave').style.display=S&&['owner','engineer','technician'].includes(S.role)?'block':'none';
  $('tabForm').style.display=canReport()?'block':'none';
  $('headTitle').textContent = ({dashboard:'لوحة الأداء',form:'بلاغ عطل جديد',profile:'حسابي',leave:'إجازاتي',approvals:'اعتماد الإجازات',admin:'إدارة المستخدمين',cmms:'سجل أوامر الشغل',catalog:'إدارة بيانات الصيانة',change:'تغيير كلمة المرور'})[v]||'MainTrack';
  if(v==='login'||v==='change'){noticeOpen=false;$('notifications').style.display='none';$('notifications').setAttribute('aria-hidden','true');$('bellBtn').setAttribute('aria-expanded','false');}
  $('who').textContent = S ? '◉  '+(S.displayName||S.name) : '';
  if (v === 'form' || v === 'dashboard') $('wo').style.display = v === 'form' ? 'inline-block' : 'none';
  window.scrollTo(0,0);
}
function save(d) { S = {token:d.token,code:d.code,name:d.name,role:d.role||'technician'}; sessionStorage.setItem('s',JSON.stringify(S)); appAuthenticated=true; $('retryConnect').hidden=true; }
function logout() { if(S) localStorage.removeItem('bd_dashboard_cache_v3_'+S.code); sessionStorage.removeItem('s'); localStorage.removeItem('s');localStorage.removeItem('d'); D=null;appAuthenticated=false;S=null;noticeLast=0;noticeOpen=false;$('bellCount').style.display='none';$('notifications').setAttribute('aria-hidden','true');$('retryConnect').hidden=true;show('login'); }
function showChange(forced) { $('oldBox').style.display = forced ? 'none' : 'block'; $('cback').style.display = forced ? 'none' : 'inline'; show('change'); }
function init(d) { D=d; $('wo').textContent=navigator.onLine?d.id:'—'; fill($('section'),d.sections,'اختر القسم'); fill($('machine'),[],'اختر القسم أولا'); fill($('comp'),[],'اختر القسم أولا'); fill($('status'),d.status); fill($('cat'),d.cats); if(d.cats.indexOf('كهربائي')>-1)$('cat').value='كهربائي'; $('date').value=today(); applyMachineDeepLink(); }
async function load() {
  if(initBusy)return initBusy;
  initBusy=(async()=>{try{
    const d=await api('init');
    if(d.error==='AUTH'){logout();return false;} if(d.error==='CHANGE_REQUIRED'){showChange(true);return false;}
    if(d.error)throw new Error(d.error);
    S.role=d.role||'technician';sessionStorage.setItem('s',JSON.stringify(S));appAuthenticated=true;
    localStorage.setItem('d_'+S.code,JSON.stringify(d)); init(d); return true;
  }catch(e){const cached=localStorage.getItem('d_'+S.code);if(cached&&!navigator.onLine){init(JSON.parse(cached));return true;}
    note('تعذر التحقق من الجلسة وتحميل القوائم. تحقّق من اتصال الإنترنت.','err');return false;
  }finally{initBusy=null;}})();return initBusy;
}
function applyMachineDeepLink(){
  if(!D)return; const q=new URLSearchParams(location.search); const sec=q.get('section'), mach=q.get('machine');
  if(!sec&&!mach)return;
  const validSection=D.sections.includes(sec||'');
  const machineRows=D.machines.filter(r=>r[0]===sec&&r[1]===mach);
  if(!validSection||!machineRows.length){note('رابط QR غير صحيح أو أن القسم/الماكينة غير موجودين. اختر القسم والماكينة يدويًا.','err');return;}
  $('section').value=sec; $('section').dispatchEvent(new Event('change'));
  $('machine').value=mach; note('تم تحديد القسم والماكينة من QR. أكمل بيانات البلاغ.','ok'); show('form');
}
async function loadNotices(force){
  if(!S||noticeBusy||!appAuthenticated)return;
  const list=$('noticeList');
  if(!navigator.onLine){if(!list.textContent.trim())list.textContent='يلزم الاتصال بالإنترنت لتحديث الإشعارات المحفوظة.';return;}
  if(!force && Date.now()-noticeLast<15000)return;
  noticeBusy=true;
  try{
    const d=await api('notifications');
    if(d.error==='AUTH')return logout(); if(d.error)throw new Error(d.error);
    noticeLast=Date.now();const pendingCount=S.role==='owner'?Number(d.pendingCount||0):0, unreadSaved=Number(d.savedUnreadCount||0),unread=unreadSaved+pendingCount;
$('pendingBadge').hidden=!pendingCount;$('pendingBadge').textContent=pendingCount;
$('bellCount').textContent=unread>99?'99+':String(unread);$('bellCount').style.display=unread?'block':'none';
$('bellBtn').classList.toggle('has-unread',unread>0);$('bellBtn').setAttribute('aria-label',unread?'الإشعارات: '+unread+' جديد':'الإشعارات: لا يوجد جديد');
$('noticeV2Count').textContent=unread?unread+' جديد':'كل شيء محدث';
$('noticeV2Summary').textContent=(unreadSaved?unreadSaved+' غير مقروءة':'كل الإشعارات مقروءة')+(pendingCount?' • '+pendingCount+' طلب يحتاج قرار':'');
$('noticeV2ReadAll').hidden=!unreadSaved;$('noticeV2Pending').hidden=!pendingCount;
$('noticeV2PendingCount').textContent=pendingCount+' قيد القرار';
$('noticePendingList').textContent='';
$('noticeV2Sync').textContent='آخر تحديث '+new Date().toLocaleTimeString('ar-EG',{hour:'numeric',minute:'2-digit'});
$('noticeV2All').setAttribute('aria-pressed',noticeModeV2==='all'?'true':'false');$('noticeV2Unread').setAttribute('aria-pressed',noticeModeV2==='unread'?'true':'false');
list.textContent='';
const saved=(Array.isArray(d.storedItems)?d.storedItems:d.items||[]).filter(n=>noticeModeV2==='all'||!n.read).slice(0,5);
const pending=(d.pendingItems||[]).slice(0,3);
const items=pending.concat(saved);
    if(!saved.length){list.className='notice-v2-list';const empty=document.createElement('p');empty.className='notice-v2-empty';empty.textContent=noticeModeV2==='unread'?'لا توجد إشعارات غير مقروءة.':'لا توجد إشعارات محفوظة حتى الآن.';list.append(empty);}
    list.className='notice-v2-list'; items.forEach(n=>{const host=n.target==='leaveDecision'&&n.leave?$('noticePendingList'):list;
      if(n.target==='leaveDecision'&&S.role==='owner'&&n.leave){
        const r=n.leave,card=document.createElement('article');card.className='notice-leave-card';
        const head=document.createElement('strong');head.textContent=r.name+' طلب إجازة';
        const meta=document.createElement('div');meta.className='notice-detail';meta.textContent='من '+r.start+' إلى '+r.end+' • '+r.days+' يوم • '+(leaveTypeNames[r.type]||r.type);
        card.append(head,meta);
        if(r.reason){const reason=document.createElement('div');reason.className='notice-date';reason.textContent='السبب: '+r.reason;card.append(reason);}
        const actions=document.createElement('div');actions.className='notice-approval-actions';
        for(const [decision,label] of [['APPROVED','موافقة'],['REJECTED','رفض']]){
          const button=document.createElement('button');button.type='button';button.className=decision==='APPROVED'?'notice-accept':'notice-reject';button.textContent=label;
          button.onclick=async()=>{
            let reason='';if(decision==='REJECTED'){const entry=prompt('سبب رفض طلب '+r.name+' (اختياري):','');if(entry===null)return;reason=entry;}
            if(!confirm((decision==='APPROVED'?'الموافقة على':'رفض')+' طلب إجازة '+r.name+' من '+r.start+' إلى '+r.end+'؟'))return;
            Array.from(actions.querySelectorAll('button')).forEach(x=>x.disabled=true);
            try{const result=await api('leaveDecision',{id:r.id,decision,reason});if(result.error==='AUTH')return logout();if(result.error)throw new Error(result.error);note('تم '+(decision==='APPROVED'?'اعتماد':'رفض')+' طلب '+r.name,'ok');noticeLast=0;await loadNotices(true);if($('approvals').style.display!=='none')showApprovals();}
            catch(e){note('تعذر تنفيذ القرار: '+(e.message||'خطأ اتصال'),'err');Array.from(actions.querySelectorAll('button')).forEach(x=>x.disabled=false);}
          };actions.append(button);
        }
        card.append(actions);host.append(card);return;
      }
      const card=document.createElement('button'); card.type='button'; card.className='notice-item '+(n.read?'read':'unread'); card.setAttribute('aria-label',(n.read?'إشعار مقروء: ':'إشعار غير مقروء: ')+(n.title||n.id));
      const titleLine=document.createElement('div'); titleLine.className='notice-title-line'; const dot=document.createElement('span'); dot.className='notice-dot'; const title=document.createElement('span'); title.textContent=n.title||'تم تسجيل البلاغ '+n.id; titleLine.append(dot,title);
      const detail=document.createElement('div'); detail.className='notice-detail'; detail.textContent=n.description||(n.section||'')+' • '+(n.machine||'');
      const date=document.createElement('div'); date.className='notice-date'; date.textContent=n.createdAt?new Date(n.createdAt).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'';
      card.append(titleLine,detail,date); card.onclick=async()=>{await markNoticeRead(n.id,card);if(n.target==='leaveApprovals'&&S&&S.role==='owner')showApprovals();else if(n.target==='leave')showLeave();}; host.appendChild(card);
    });
  }catch(e){$('noticeV2Sync').textContent='تعذر المزامنة — اضغط ↻';if(!list.textContent.trim())list.textContent='تعذر التحديث مؤقتًا.';}
  finally{noticeBusy=false;}
}
async function markNoticeRead(id,card){
  if(!S||!navigator.onLine){note('يلزم الاتصال بالإنترنت لحفظ حالة قراءة الإشعار على جميع الأجهزة.','err');return;}
  if(card&&card.classList.contains('read'))return;
  if(card){card.disabled=true;card.style.opacity='.7';}
  try{
    const d=await api('markNotificationRead',{id:String(id)});
    if(d.error==='AUTH')return logout(); if(d.error)throw new Error(d.error);
    noticeLast=0;noticeSignalV2();await loadNotices(true);
  }catch(e){note('لم يتم حفظ القراءة على السيرفر. تحقق من الاتصال ثم اضغط على الإشعار مرة أخرى.','err');if(card){card.disabled=false;card.style.opacity='1';}}
}
async function refreshWorkOrder(){
  if(!S||!canReport()||!appAuthenticated||!navigator.onLine||getQ().some(q=>q.u===S.code))return;
  try{
    const data=await api('nextId');
    if(data.error==='AUTH')return logout();
    if(data.error==='CHANGE_REQUIRED')return;
    if(data.id&&$('wo'))$('wo').textContent=data.id;
  }catch(e){/* Keep the last known WO number when a brief network request fails. */}
}
// A successful login or password change already validated identity server-side.
// Only a restored browser session requires the additional `session` request.
let startPending=false;
async function start(verifiedByLogin=false) {
  if(startPending)return;
  if(!S)return show('login');
  startPending=true;
  try {
  $('retryConnect').hidden=true;
  const launchedToken=S.token;
  show('dashboard');setSync(verifiedByLogin?'جارٍ تحميل لوحة الأداء…':'التحقق من الحساب…','loading');
  if(!verifiedByLogin){
    let auth;
    try{auth=await api('session');}
    catch(e){
      // A network timeout is not proof that credentials expired: keep the session.
      setSync('تعذر التحقق من الاتصال — اضغط إعادة الاتصال','offline');
      note(netMsg(e),'err');$('retryConnect').hidden=false;return;
    }
    if(!S||S.token!==launchedToken)return;
    if(auth.error==='AUTH'){
      const verdict=await confirmInvalidSession(launchedToken);
      if(!S||S.token!==launchedToken)return;
      if(verdict==='invalid'){logout();return;}
      if(verdict==='valid')auth={ok:true,role:S.role,name:S.name};
      else {setSync('تعذر تأكيد الجلسة مؤقتًا','offline');$('retryConnect').hidden=false;return;}
    }
    if(auth.error==='CHANGE_REQUIRED'||auth.must){showChange(true);return;}
    if(auth.error){note('فشل التحقق من الحساب: '+auth.error,'err');setSync('تعذر الدخول','offline');$('retryConnect').hidden=false;return;}
    S.role=auth.role;S.name=auth.name||S.name;
    sessionStorage.setItem('s',JSON.stringify(S));
  }
  appAuthenticated=true;$('retryConnect').hidden=true;
  const deepQ=new URLSearchParams(location.search);
  let firstView;
  if((deepQ.has('section')||deepQ.has('machine'))&&canReport()){
    show('form');firstView=load();
  }else{firstView=showDashboard(false);}
  pend();
  // Do not fight the initial dashboard request for Apps Script resources.
  // Opening the bell still triggers immediate notifications on demand.
  Promise.resolve(firstView).finally(()=>{
    if(S&&S.token===launchedToken&&appAuthenticated)
      setTimeout(()=>{if(S&&S.token===launchedToken&&appAuthenticated)loadNotices();},350);
  });
  // Pending reports are more important than analytics: do not block their
  // delivery behind a slow dashboard on reconnection.
  if(getQ().some(f=>!f.err&&f.u===S.code))
    setTimeout(()=>{if(S&&S.token===launchedToken&&appAuthenticated)flush();},1200);
  } finally {startPending=false;}
}
$('retryConnect').onclick=()=>{if(S&&!startPending)start(false);};
window.addEventListener('online',()=>{if(S&&!appAuthenticated&&!startPending)start(false);});
async function flush() { if(busy||!S||!appAuthenticated)return; const queued=getQ().filter(f=>!f.err&&f.u===S.code); if(!queued.length)return; busy=true; const ok=[]; try { for(const f of queued) { if(f.err||f.u!==S.code)continue; let d; try{d=await api('submit',f);}catch(e){break;} if(d.error==='AUTH'){logout();break;} if(d.error==='AUTH_UNCONFIRMED'||d.error==='STALE_SESSION'){note('تعذر تأكيد الجلسة مؤقتًا. البلاغ محفوظ في الانتظار ويمكن إعادة الإرسال بعد عودة الاتصال.','err');break;} const q=getQ(),it=q.find(x=>x.cid===f.cid); if(d.error){if(it)it.err=d.error;note('بلاغ مرفوض: '+d.error,'err');}else{if(it)q.splice(q.indexOf(it),1);ok.push(d.id);} setQ(q); } if(ok.length){localStorage.removeItem(dashStoreKey());note('تم حفظ: '+ok.join('، '),'ok');loadNotices(true);if($('dashboard').style.display!=='none')showDashboard(true);} if(ok.length)await refreshWorkOrder(); }finally{busy=false;} }
const HELP={BAD_PW:{m:'الباسورد غلط.',t:'لو نسيت الباسورد، اطلب من المسؤول إعادة تعيينه. هيديك باسورد مؤقت جديد، وتختار منه باسورد جديد أول ما تدخل.',w:'نسيت الباسورد بتاعي. كودي: '},NO_USER:{m:'الكود ده مش مسجل في النظام. اتأكد منه تاني.',t:'لو متأكد إن الكود صح، اطلب من المسؤول يتأكد إنه مسجل.',w:'الكود مش شغال معايا. كودي: '},INACTIVE:{m:'الحساب ده متوقف.',t:'كلّم المسؤول لتفعيله.',w:'حسابي متوقف. كودي: '},LOCKED:{m:'محاولات كتير غلط.',t:'الحساب اتقفل مؤقتا. استنى 5 دقايق أو كلّم المسؤول.',w:'الحساب اتقفل معايا. كودي: '}};
let helpKind=null;
function help(k){helpKind=k;$('ftxt').textContent=HELP[k].t;$('fbox').style.display='block';if(ADMIN_WA){const w=$('wa');w.style.display='inline-block';w.href='https://wa.me/'+ADMIN_WA+'?text='+encodeURIComponent(HELP[k].w+norm($('lcode').value.trim()));}}
$('lcode').oninput=()=>{if(helpKind)help(helpKind);};
$('lgo').onclick=async()=>{if($('lgo').disabled)return;const code=norm($('lcode').value.trim()),pw=$('lpw').value;if(!code){note('اكتب كود الموظف','err');$('lcode').focus();return;}if(!pw){note('اكتب الباسورد','err');$('lpw').focus();return;}$('lgo').disabled=true;note('جاري الدخول...','ok');try{const d=await post({action:'login',code:code,pw:pw});if(d.error){if(HELP[d.error]){note(HELP[d.error].m,'err');return help(d.error);}return note(d.error,'err');}save(d);$('lpw').value='';helpKind=null;$('fbox').style.display='none';note('');if(d.must)return showChange(true);start(true);}catch(e){note(netMsg(e),'err');}finally{$('lgo').disabled=false;}};
$('cgo').onclick=async()=>{if($('np').value!==$('np2').value)return note('الباسورد الجديد غير متطابق','err');try{const d=await post({action:'change',token:S.token,old:$('op').value,pw:$('np').value});if(d.error==='AUTH')return logout();if(d.error)return note(d.error,'err');save(d);['op','np','np2'].forEach(k=>$(k).value='');await start(true);note('تم حفظ الباسورد','ok');}catch(e){note(netMsg(e),'err');}};
$('cback').onclick=()=>{note('');show('form');};
$('out').onclick=()=>{if(getQ().length&&!confirm('فيه بلاغات في الانتظار لم تُرسل. هتفضل محفوظة لحد ما تدخل بنفس الكود. تكمل؟'))return;logout();};
$('section').onchange=()=>{const s=$('section').value;fill($('machine'),D.machines.filter(r=>r[0]===s).map(r=>r[1]),'اختر الماكينة');fill($('comp'),D.parts.filter(r=>r[0]===s).map(r=>r[1]),'اختر الجزء');};
$('send').onclick=()=>{if(!canReport())return note('غير مسموح لك بتسجيل بلاغات','err');const f={};ALL.forEach(k=>f[k]=$(k).value.trim());let bad=0;REQ.forEach(k=>{const miss=!f[k];$(k).classList.toggle('bad',miss);if(miss)bad++;});if(bad){note('كمّل الخانات المعلّمة بالأحمر','err');window.scrollTo(0,0);return;}f.u=S.code;f.cid=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random());setQ(getQ().concat([f]));ALL.forEach(k=>{if(k!=='date')$(k).value='';});fill($('machine'),[],'اختر القسم أولا');fill($('comp'),[],'اختر القسم أولا');note('تم تسجيل البلاغ على الجهاز، جاري الإرسال...','ok');window.scrollTo(0,0);flush().then(load);};
$('now').onclick=()=>{setQ(getQ().map(x=>{delete x.err;return x;}));flush();};
function monthKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function monthTitle(d){return new Intl.DateTimeFormat('ar-EG',{month:'long',year:'numeric'}).format(d);}
function fmt(n,dec=1){return Number(n||0).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec});}
function dashStoreKey(){return 'bd_dashboard_cache_v3_'+(S?S.code:'none');}
function cachedDashboard(key){try{const c=JSON.parse(localStorage.getItem(dashStoreKey())||'{}');return c[key]||null;}catch(e){return null;}}
function cacheDashboard(key,data){let c={};try{c=JSON.parse(localStorage.getItem(dashStoreKey())||'{}');}catch(e){}c[key]={data:data,savedAt:Date.now()};localStorage.setItem(dashStoreKey(),JSON.stringify(c));}
function renderSectionHoursChart(items){
  const host=$('sectionHoursChart'); host.textContent='';
  const rows=(items||[]).filter(x=>x&&Number(x.hours)>0).sort((a,b)=>Number(b.hours)-Number(a.hours));
  if(!rows.length){host.className='section-chart empty';host.textContent='لا توجد ساعات توقف مكتملة لهذا الشهر.';return;}
  host.className='section-chart'; const max=Math.max(...rows.map(x=>Number(x.hours)||0),0.01);
  rows.forEach(x=>{const row=document.createElement('div');row.className='section-chart-row';const name=document.createElement('div');name.className='section-chart-name';name.textContent=x.section||'غير محدد';const track=document.createElement('div');track.className='section-chart-track';track.setAttribute('role','img');track.setAttribute('aria-label',(x.section||'غير محدد')+': '+fmt(x.hours,2)+' ساعة');const bar=document.createElement('div');bar.className='section-chart-bar';bar.style.width=Math.max(1,(Number(x.hours)/max)*100)+'%';track.appendChild(bar);const value=document.createElement('div');value.className='section-chart-value';value.textContent=fmt(x.hours,2)+' س';row.append(name,track,value);host.appendChild(row);});
}
function setDashboardRoleView(){
 const limited=!!S&&S.role==='technician';
 for(const id of ['mMttr','mMachines','mResponse','mElapsed','sectionHoursChart','topMachines','dailyTrend','qualityInfo','machineAnalysis','sectionAnalysis','recentReports']){
  const el=$(id),card=el&&el.closest('.metric, .section-card');if(card)card.style.display=limited?'none':'';
 }
 for(const group of $('dashboard').querySelectorAll('.analytics-pair')){
  const cards=[...group.children].filter(e=>e.classList.contains('section-card'));
  group.style.display=limited&&cards.every(e=>e.style.display==='none')?'none':'';
 }
}
function renderDashboard(data,savedAt,isOffline){setDashboardRoleView();$('mCount').textContent=Number(data.count||0).toLocaleString('en-US');
 if(S&&S.role==='technician'){
  $('mDowntime').textContent=fmt(data.totalDowntime,2);
  makeTable('categoryAnalysis',['التصنيف','عدد الأعطال','ساعات الإصلاح'],(data.categoryTable||[]).map(r=>[r.name,String(r.count||0),fmt(r.hours,2)+' س']));
  const dt=savedAt?new Date(savedAt):new Date();
  $('dashUpdated').textContent=(isOffline?'عرض محفوظ دون اتصال • ':'آخر تحديث: ')+dt.toLocaleString('ar-EG');return;
 }$('mDowntime').textContent=fmt(data.totalDowntime,2);$('mMttr').textContent=data.mttr==null?'—':fmt(data.mttr,2);$('mMachines').textContent=Number(data.machineCount||0).toLocaleString('en-US');$('mResponse').textContent=data.avgResponse==null?'—':fmt(data.avgResponse,2);$('mElapsed').textContent=fmt(data.totalElapsed,2);renderSectionHoursChart(data.sectionHours||[]);
const top=$('topMachines');top.textContent='';if(!data.topMachines||!data.topMachines.length){top.className='empty';top.textContent='لا توجد بيانات لهذا الشهر.';}else{top.className='';data.topMachines.slice(0,5).forEach((m,i)=>{const row=document.createElement('div');row.className='rank-row';const name=document.createElement('div');name.className='rank-name';name.textContent=(i+1)+'. '+m.machine;const val=document.createElement('div');val.className='rank-value';val.textContent=fmt(m.hours,2)+' ساعة';row.append(name,val);top.appendChild(row);});}
const recent=$('recentReports');recent.textContent='';if(!data.recent||!data.recent.length){recent.className='recent empty';recent.textContent='لا توجد بلاغات لهذا الشهر.';}else{recent.className='recent';const table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr');['رقم البلاغ','الماكينة','مدة التوقف','التاريخ'].forEach(t=>{const th=document.createElement('th');th.textContent=t;tr.appendChild(th);});thead.appendChild(tr);table.appendChild(thead);const tb=document.createElement('tbody');data.recent.forEach(r=>{const row=document.createElement('tr');[r.id,r.machine,r.hours==null?'غير مكتملة':fmt(r.hours,2)+' ساعة',r.date].forEach(v=>{const td=document.createElement('td');td.textContent=v==null?'—':String(v);row.appendChild(td);});tb.appendChild(row);});table.appendChild(tb);recent.appendChild(table);}
renderDetailedAnalytics(data);const dt=savedAt?new Date(savedAt):new Date();$('dashUpdated').textContent=(isOffline?'عرض محفوظ دون اتصال • ':'آخر تحديث: ')+dt.toLocaleString('ar-EG');}
async function showDashboard(refresh){show('dashboard');if(!S)return;setDashboardRoleView();const key=monthKey(selectedMonth);$('monthLabel').textContent=monthTitle(selectedMonth);$('nextMonth').disabled=key>=monthKey(new Date());if(dashBusy)return;const cache=cachedDashboard(key);if(cache&&!refresh){renderDashboard(cache.data,cache.savedAt,!navigator.onLine);setSync('بيانات محفوظة — آخر تحديث '+new Date(cache.savedAt).toLocaleTimeString('ar-EG'),'loading');}else if(!cache){$('topMachines').textContent='جارٍ تحميل البيانات…';$('recentReports').textContent='جارٍ تحميل البيانات…';}
if(!navigator.onLine){setSync('بدون اتصال — بيانات محفوظة','offline');if(cache)renderDashboard(cache.data,cache.savedAt,true);else{$('topMachines').textContent='لا توجد بيانات محفوظة لهذا الشهر. اتصل بالإنترنت للتحديث.';$('recentReports').textContent='لا توجد بيانات محفوظة لهذا الشهر.';}return;}
if(!refresh&&cache&&Date.now()-cache.savedAt<5*60*1000)return;
dashBusy=true;setSync('جارٍ تحديث البيانات…','loading');try{const requestMonth=new Date(selectedMonth.getFullYear(),selectedMonth.getMonth(),1);const data=await api('dashboard',{year:requestMonth.getFullYear(),month:requestMonth.getMonth()+1});if(data.error==='AUTH')return logout();if(data.error)throw new Error(data.error);cacheDashboard(key,data);setSync('تم تحديث البيانات','ok');if(key===monthKey(selectedMonth))renderDashboard(data,Date.now(),false);}catch(e){setSync('تعذر التحديث — تحقق من الاتصال','offline');if(key===monthKey(selectedMonth)){if(cache)renderDashboard(cache.data,cache.savedAt,true);else{$('topMachines').textContent='تعذر تحميل بيانات المؤشرات. تحقق من الاتصال ونشر كود Apps Script المحدّث.';$('recentReports').textContent='لا توجد بيانات متاحة.';note(netMsg(e),'err');}}}finally{dashBusy=false;if(key!==monthKey(selectedMonth))showDashboard(false);}}

let noticeModeV2='all';
const noticeChannelV2=typeof BroadcastChannel==='function'?new BroadcastChannel('maintrack-notice-v2'):null;
if(noticeChannelV2)noticeChannelV2.onmessage=e=>{if(e.data&&e.data.kind==='sync'&&S&&appAuthenticated&&!document.hidden){noticeLast=0;loadNotices(true);}};
function noticeSignalV2(){if(noticeChannelV2)try{noticeChannelV2.postMessage({kind:'sync'});}catch(e){}}
function positionNoticePopup(){
 const r=$('bellBtn').getBoundingClientRect(),p=$('notifications'),w=Math.min(440,window.innerWidth-16);
 p.style.left=(window.innerWidth<=550?8:Math.max(8,Math.min(r.right-w,window.innerWidth-w-8)))+'px';
 p.style.right='auto';const top=Math.min(r.bottom+8,Math.max(8,window.innerHeight-220));
 p.style.top=top+'px';p.style.maxHeight=Math.max(220,window.innerHeight-top-12)+'px';
}
function closeNoticesV2(){noticeOpen=false;$('notifications').style.display='none';$('notifications').setAttribute('aria-hidden','true');$('bellBtn').setAttribute('aria-expanded','false');}
$('bellBtn').setAttribute('aria-controls','notifications');$('bellBtn').setAttribute('aria-expanded','false');
$('bellBtn').onclick=()=>{if(noticeOpen)return closeNoticesV2();noticeOpen=true;$('notifications').style.display='block';$('notifications').setAttribute('aria-hidden','false');$('bellBtn').setAttribute('aria-expanded','true');positionNoticePopup();noticeLast=0;loadNotices(true);};
$('closeNotices').onclick=()=>{closeNoticesV2();$('bellBtn').focus();};
$('noticeV2Refresh').onclick=()=>{noticeLast=0;loadNotices(true);};
$('noticeV2All').onclick=()=>{noticeModeV2='all';noticeLast=0;loadNotices(true);};
$('noticeV2Unread').onclick=()=>{noticeModeV2='unread';noticeLast=0;loadNotices(true);};
$('noticeV2ViewApprovals').onclick=()=>{closeNoticesV2();showApprovals();};
$('noticeV2ReadAll').onclick=async()=>{
 if(!S||!navigator.onLine)return note('يلزم اتصال بالإنترنت لحفظ القراءة','err');
 const btn=$('noticeV2ReadAll');if(btn.disabled)return;btn.disabled=true;
 try{const d=await api('markAllNotificationsRead');if(d.error==='AUTH')return logout();if(d.error)throw new Error(d.error);noticeLast=0;noticeSignalV2();await loadNotices(true);}
 catch(e){note('تعذر تحديد الإشعارات كمقروءة، حاول مجددًا.','err');}
 finally{btn.disabled=false;}
};
document.addEventListener('click',e=>{if(noticeOpen&&!$('notifications').contains(e.target)&&!$('bellBtn').contains(e.target))closeNoticesV2();});
document.addEventListener('keydown',e=>{if(noticeOpen&&e.key==='Escape'){closeNoticesV2();$('bellBtn').focus();}});
window.addEventListener('resize',()=>{if(noticeOpen)positionNoticePopup();});
window.addEventListener('scroll',()=>{if(noticeOpen)positionNoticePopup();},{passive:true});
window.addEventListener('focus',()=>{if(S&&appAuthenticated)loadNotices(true);});
window.addEventListener('online',()=>{if(S&&appAuthenticated)loadNotices(true);});

const leaveTypeNames={annual:'سنوية',casual:'عارضة',sick:'مرضية',other:'أخرى'};
const leaveStateNames={PENDING:'قيد المراجعة',APPROVED:'تم الاعتماد',REJECTED:'مرفوض'};
function makeTable(hostId,headers,rows){
 const host=$(hostId);host.textContent='';if(!rows||!rows.length){host.className='recent empty';host.textContent='لا توجد بيانات.';return;}
 host.className='recent';const table=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr');headers.forEach(h=>{const x=document.createElement('th');x.textContent=h;tr.appendChild(x);});head.appendChild(tr);table.appendChild(head);const body=document.createElement('tbody');rows.forEach(cols=>{const r=document.createElement('tr');cols.forEach(v=>{const td=document.createElement('td');td.textContent=String(v??'—');r.appendChild(td);});body.appendChild(r);});table.appendChild(body);host.append(table);
}
function renderDetailedAnalytics(data){
 const mapped=arr=>(arr||[]).map(r=>[r.name,String(r.count||0),fmt(r.hours,2)+' س']);
 makeTable('machineAnalysis',['الماكينة','عدد الأعطال','ساعات الإصلاح'],mapped(data.machineTable));
 makeTable('sectionAnalysis',['القسم','عدد الأعطال','ساعات الإصلاح'],mapped(data.sectionTable));
 makeTable('categoryAnalysis',['التصنيف','عدد الأعطال','ساعات الإصلاح'],mapped(data.categoryTable));
 const q=data.dataQuality||{},complete=Number(q.complete||0),incomplete=Number(q.incomplete||0);
 $('qualityInfo').textContent='مدة إصلاح مكتملة: '+complete+' | مدة ناقصة: '+incomplete+' | نسبة الاكتمال: '+(complete+incomplete?Math.round(100*complete/(complete+incomplete)):0)+'%';
 const host=$('dailyTrend');host.textContent='';const rows=(data.daily||[]).slice().sort((a,b)=>a.name.localeCompare(b.name)),max=Math.max(...rows.map(x=>Number(x.hours)||0),1);
 if(!rows.length){host.textContent='لا توجد بيانات';return;}rows.forEach(x=>{const row=document.createElement('div');row.className='daily-row';const label=document.createElement('span');label.textContent=x.name.slice(8);const bar=document.createElement('div');bar.className='daily-track';const fill=document.createElement('span');fill.style.width=Math.max(1,(Number(x.hours||0)/max)*100)+'%';bar.appendChild(fill);const val=document.createElement('span');val.textContent=fmt(x.hours,1)+' س';row.append(label,bar,val);host.appendChild(row);});
}
function drawLeaveList(hostId,items){
 const host=$(hostId);host.textContent='';if(!items.length){host.textContent='لا توجد طلبات حتى الآن.';return;}
 makeTable(hostId,['رقم الطلب','النوع','الفترة','الأيام','الحالة'],items.map(r=>[r.id,leaveTypeNames[r.type]||r.type,r.start+' ← '+r.end,r.days,leaveStateNames[r.status]||r.status]));
}
async function showLeave(){
 if(!S||!canReport())return;show('leave');$('myLeaves').textContent='جارٍ التحميل…';
 try{const d=await api('leaveMine');if(d.error==='AUTH')return logout();if(d.error)throw new Error(d.error);$('leaveBalance').textContent=d.profile.leaveBalance==null?'غير محدد':fmt(d.profile.leaveBalance,1)+' يوم';$('leavePending').textContent=(d.items||[]).filter(x=>x.status==='PENDING').length;drawLeaveList('myLeaves',d.items||[]);}catch(e){$('myLeaves').textContent='تعذر تحميل الطلبات: '+(e.message||'');}
}
$('sendLeave').onclick=async()=>{
 if(!S||!canReport())return;
 const start=$('leaveStart').value,end=$('leaveEnd').value,type=$('leaveType').value,reason=$('leaveReason').value;
 if(!start||!end||end<start){$('leaveFeedback').textContent='اختار فترة صحيحة للإجازة';return;}
 if(!confirm('تأكيد إرسال طلب الإجازة إلى Owner؟'))return;
 const btn=$('sendLeave');btn.disabled=true;btn.textContent='جارٍ إرسال الطلب…';
 try{const fingerprint=[start,end,type,reason].join('|');let pending={};try{pending=JSON.parse(sessionStorage.getItem('pendingLeave')||'{}');}catch(e){}const cid=pending.fingerprint===fingerprint?pending.cid:(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random());sessionStorage.setItem('pendingLeave',JSON.stringify({cid,fingerprint}));const d=await api('leaveRequest',{start,end,type,reason,cid});if(d.error==='AUTH')return logout();if(d.error)throw new Error(d.error);$('leaveFeedback').textContent='تم إرسال طلب الإجازة للمالك • '+d.id+' • في انتظار القرار';sessionStorage.removeItem('pendingLeave');$('leaveReason').value='';await showLeave();loadNotices(true);}
 catch(e){$('leaveFeedback').textContent='لم يتم تسجيل الطلب: '+(e.message||'خطأ اتصال');}
 finally{btn.disabled=false;btn.textContent='إرسال طلب الإجازة';}
};
async function showApprovals(){
 if(!S||S.role!=='owner')return;show('approvals');const host=$('approvalRows');host.textContent='جارٍ التحميل…';
 try{const d=await api('leaveInbox');if(d.error==='AUTH')return logout();if(d.error)throw new Error(d.error);host.textContent='';const rows=d.items||[],pending=Number(d.pendingCount||0);$('pendingBadge').hidden=!pending;$('pendingBadge').textContent=pending;if(!rows.length){host.textContent='لا توجد طلبات.';return;}
 rows.forEach(r=>{const card=document.createElement('article');card.className='approval-card';const head=document.createElement('strong');head.textContent=r.name+' • '+r.code+' • '+r.id;const meta=document.createElement('p');meta.textContent=(leaveTypeNames[r.type]||r.type)+' | '+r.start+' إلى '+r.end+' | '+r.days+' يوم | '+(leaveStateNames[r.status]||r.status);card.append(head,meta);if(r.reason){const why=document.createElement('p');why.textContent='ملاحظة: '+r.reason;card.append(why);}if(r.status==='PENDING'){const actions=document.createElement('div');actions.className='approval-actions';for(const [state,title] of [['APPROVED','اعتماد'],['REJECTED','رفض']]){const b=document.createElement('button');b.type='button';b.className=state==='APPROVED'?'btn':'refresh';b.textContent=title;b.onclick=async()=>{const reason=state==='REJECTED'?prompt('سبب الرفض (اختياري):')||'':'';if(!confirm(title+' طلب '+r.id+' ؟'))return;b.disabled=true;try{const d=await api('leaveDecision',{id:r.id,decision:state,reason});if(d.error==='AUTH')return logout();if(d.error)throw new Error(d.error);note('تم حفظ القرار '+r.id,'ok');await showApprovals();loadNotices(true);}catch(e){note('تعذر حفظ القرار: '+(e.message||''),'err');b.disabled=false;}};actions.append(b);}card.append(actions);}host.append(card);});
 }catch(e){host.textContent='تعذر تحميل الاعتمادات: '+(e.message||'');}
}
$('refreshApprovals').onclick=showApprovals;

function renderProfile(p){
  $('profileAvatar').textContent=(p.preferredName||p.name||'M').trim().charAt(0);$('profileName').textContent=p.preferredName||p.name||'الموظف';
  if(S){S.displayName=p.preferredName||p.name;sessionStorage.setItem('s',JSON.stringify(S));$('who').textContent='◉  '+S.displayName;}
  $('profileRole').textContent=p.jobTitle||'المسمى الوظيفي غير محدد';$('profileAccess').textContent=roles[p.role]||p.role; $('profileCode').textContent=p.code;
  $('profileDepartment').textContent=p.department||'غير محدد';$('profileJob').textContent=p.jobTitle||'غير محدد';
  $('profileLeave').textContent=p.leaveBalance===null?'غير محدد':fmt(p.leaveBalance,1)+' يوم';
  
}
async function showProfile(){
  if(!S)return;show('profile');$('profileName').textContent='جارٍ تحميل ملفك...';
  try{const d=await api('profile');if(d.error==='AUTH')return logout();if(d.error)throw new Error(d.error);renderProfile(d.profile);}catch(e){note('تعذر تحميل الملف الشخصي. تحقق من الاتصال.','err');}
}
function renderAdminSelection(){
 const code=$('adminUser').value,u=adminItems.find(x=>x.code===code);if(!u)return;
 $('adminRole').value=u.role;$('adminActive').checked=!!u.active;$('adminLeave').value=u.leaveBalance==null?'':u.leaveBalance;$('adminDepartment').value=u.department||'';$('adminJob').value=u.jobTitle||'';
 $('saveAdmin').disabled=!!S&&code===S.code;
}
$('adminUser').onchange=renderAdminSelection;
async function showAdmin(){
 if(!S||S.role!=='owner')return note('غير مصرح بالدخول لهذه الصفحة','err');
 show('admin');try{const d=await api('adminUsers');if(d.error==='AUTH')return logout();if(d.error)throw new Error(d.error);
  adminItems=d.items||[];const sel=$('adminUser');sel.length=0;adminItems.forEach(u=>sel.add(new Option(u.name+' — '+u.code+(u.code===S.code?' (حسابك)':''),u.code)));
  const other=adminItems.find(u=>u.code!==S.code);if(other)sel.value=other.code;renderAdminSelection();
 }catch(e){note('تعذر عرض قائمة المستخدمين: '+(e.message||'خطأ اتصال'),'err');}
}
$('saveAdmin').onclick=async()=>{
 const code=$('adminUser').value;if(code===S.code)return note('لا يمكنك تعديل صلاحيات حسابك من الواجهة','err');
 if(!confirm('تأكيد حفظ صلاحيات ورصيد الموظف المختار؟'))return;
 const btn=$('saveAdmin');btn.disabled=true;
 try{const d=await api('adminSaveUser',{code,role:$('adminRole').value,active:$('adminActive').checked,leaveBalance:$('adminLeave').value,department:$('adminDepartment').value,jobTitle:$('adminJob').value});if(d.error==='AUTH')return logout();if(d.error)throw new Error(d.error);note('تم تحديث الحساب على السيرفر','ok');await showAdmin();}
 catch(e){note('تعذر حفظ الصلاحيات: '+(e.message||'خطأ اتصال'),'err');}finally{btn.disabled=false;}
};
$('tabProfile').onclick=showProfile;$('tabLeave').onclick=showLeave;$('tabApprove').onclick=showApprovals;$('tabAdmin').onclick=showAdmin;$('who').onclick=showProfile;
$('tabDash').onclick=()=>showDashboard(false);$('tabForm').onclick=()=>{if(!canReport())return note('ليس لديك صلاحية تسجيل بلاغات','err');show('form');if(!D)load();refreshWorkOrder();};$('prevMonth').onclick=()=>{selectedMonth=new Date(selectedMonth.getFullYear(),selectedMonth.getMonth()-1,1);showDashboard(false);};$('nextMonth').onclick=()=>{const n=new Date(selectedMonth.getFullYear(),selectedMonth.getMonth()+1,1);if(n<=new Date(new Date().getFullYear(),new Date().getMonth(),1)){selectedMonth=n;showDashboard(false);}};$('refreshDash').onclick=()=>showDashboard(true);
window.addEventListener('online',()=>{if(!S)return;flush();loadNotices(true);if($('dashboard').style.display!=='none')showDashboard(true);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S){flush();loadNotices();if($('dashboard').style.display!=='none')showDashboard(false);}});
// Only visible sessions poll once per minute; WO is refreshed on form entry/save, not every 20s.
setInterval(()=>{if(S&&appAuthenticated&&!document.hidden)loadNotices();},20000);
if('serviceWorker'in navigator)Promise.resolve() /* Preview runs without service-worker cache */;pend();if(S)start();else show('login');
