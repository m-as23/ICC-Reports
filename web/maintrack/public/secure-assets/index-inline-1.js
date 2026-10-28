
const API = 'https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api'; // PILOT ONLY
const ADMIN_WA = '';
const $ = id => document.getElementById(id);
const REQ = ['section','machine','comp','desc','solution','date','t1','t2','t3','status','cat'];
const ALL = REQ.concat(['spare']);
let D = null, busy = false, dashBusy = false, S = null;
// Persistent sessions are opt-in only on native builds with Android Keystore.
// Never place bearer tokens in Web localStorage.
const MT_LOGOUT_GUARD = 'mt_native_logout_pending_v1';
const mtSecureSession = () => globalThis.MainTrackSecureSession?.available?.() ? globalThis.MainTrackSecureSession : null;
let mtSessionWrites = Promise.resolve();
function mtQueueNativeWrite(task) {
  mtSessionWrites = mtSessionWrites.catch(() => {}).then(task);
  return mtSessionWrites;
}
try { S = JSON.parse(sessionStorage.getItem('s') || localStorage.getItem('s') || 'null'); } catch(e) { S=null; }
// One-time session migration: stop persisting credentials across browser restarts.
localStorage.removeItem('s');localStorage.removeItem('d');localStorage.removeItem('bd_dashboard_cache'); if (S) sessionStorage.setItem('s',JSON.stringify(S));
let noticeBusy=false, noticeLast=0, initBusy=null, adminItems=[], appAuthenticated=false;
let noticeOpen = false;
let selectedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const getQ = () => {try{return JSON.parse(localStorage.getItem('q')||'[]');}catch(e){return [];}};
function setQ(q) { localStorage.setItem('q', JSON.stringify(q)); pend(); }
function pend() { const n = getQ().filter(q=>S&&q.u===S.code).length; $('pend').style.display = n ? 'flex' : 'none'; $('pn').textContent = n; }
const MAINTRACK_ERROR_MESSAGES=Object.freeze({INVALID_SECTION_MACHINE_COMPONENT:'الجزء المختار غير متاح لهذا القسم أو الماكينة. حدّث القوائم ثم حاول مجددًا.',INVALID_STATUS_OR_CATEGORY:'حالة البلاغ أو تصنيفه لم يعد متاحًا. حدّث القوائم.',IDEMPOTENCY_CONFLICT:'الطلب سبق إرساله ببيانات مختلفة. راجع البيانات قبل المحاولة.',INSUFFICIENT_LEAVE_BALANCE:'الرصيد المتاح غير كافٍ لهذا الطلب.',LEAVE_BALANCE_NOT_SET:'لم يتم تحديد رصيد الإجازات لهذا الموظف بعد.',AUTH_UNCONFIRMED:'تعذر التحقق من الجلسة حاليًا، حاول مجددًا.',HALF_DAY_NOT_ALLOWED:'نصف اليوم مسموح للسنوية والبدلات فقط، ولتاريخ واحد.',LEAVE_POLICY_PENDING:'سياسة تحويل البدلات إلى أيام كاملة لم تُعتمد بعد.',INSUFFICIENT_SUBSTITUTE_BALANCE:'رصيد ساعات البدلات المعتمدة لا يكفي لهذا الطلب.',BALANCE_ADJUSTMENT_REASON_REQUIRED:'اذكر سبب تعديل رصيد الموظف (3 أحرف على الأقل).',INVALID_SUBSTITUTE_HOURS:'ادخل رصيد بدلات صحيح بالساعات.',INVALID_OVERTIME_DURATION:'اختر وقت بداية ونهاية مختلفين وصحيحين.',INVALID_OVERTIME_WORK_KIND:'اختر طبيعة العمل: بعد الوردية أو يوم مستقل.',FUTURE_OVERTIME_NOT_ALLOWED:'لا يمكن تسجيل وقت إضافي قبل انتهاء فترة العمل. اختر تاريخًا ووقت نهاية مضيا بالفعل (بتوقيت مصر).',INVALID_OVERTIME_KIND:'اختر نوع التعويض المالي أو البدلات.',OVERTIME_ALREADY_DECIDED:'تم اتخاذ قرار على طلب الوقت الإضافي بالفعل.',OVERTIME_NOT_FOUND:'طلب الوقت الإضافي غير موجود.',OVERLAPPING_LEAVE_REQUEST:'يوجد طلب إجازة سابق متداخل مع هذه الفترة ولم يُرفض.',OVERLAPPING_OVERTIME_REQUEST:'يوجد طلب وقت إضافي سابق متداخل مع نفس الساعات.',INVALID_LEAVE_DURATION:'مدة الإجازة غير صحيحة.',INTERNAL_ERROR:'حدث خطأ في السيرفر. حاول لاحقًا أو تواصل مع المسؤول.'});
function localizedError(t){return String(t||'').replace(/\b(?:INVALID_[A-Z_]+|INTERNAL_ERROR|IDEMPOTENCY_CONFLICT|INSUFFICIENT_LEAVE_BALANCE|LEAVE_BALANCE_NOT_SET|AUTH_UNCONFIRMED|HALF_DAY_NOT_ALLOWED|LEAVE_POLICY_PENDING|INSUFFICIENT_SUBSTITUTE_BALANCE|BALANCE_ADJUSTMENT_REASON_REQUIRED|INVALID_SUBSTITUTE_HOURS|OVERTIME_ALREADY_DECIDED|OVERTIME_NOT_FOUND|OVERLAPPING_LEAVE_REQUEST|OVERLAPPING_OVERTIME_REQUEST|FUTURE_OVERTIME_NOT_ALLOWED)\b/g,code=>MAINTRACK_ERROR_MESSAGES[code]||'تعذّر إكمال العملية، راجع البيانات وحاول مجددًا.');}
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
 if(v==='leave')v='profile'; // old navigation shortcuts open unified My Account
 if(window.__maintrackActiveView!==v)note('','');
 window.__maintrackActiveView=v;
  document.body.classList.toggle('auth-screen', v === 'login' || v === 'change');
  ['login','change','form','profile','approvals','admin','cmms','catalog'].forEach(x => $(x).style.display = x === v ? 'block' : 'none');
  $('authStage').style.display = v==='login' ? 'grid' : 'none';
  $('dashboard').style.display = v === 'dashboard' ? 'block' : 'none';
  $('send').style.display = v === 'form'&&canReport() ? 'block' : 'none';
  const logged = !!S && v !== 'login' && v !== 'change';
  $('bar').style.display = S && v !== 'login' && v !== 'change' ? 'flex' : 'none';
  $('tabs').style.display = logged ? 'flex' : 'none';
  ['Dash','Form','Profile','Leave','Approve','Admin','Cmms','Catalog'].forEach(tab=>$('tab'+tab).classList.toggle('active',v===({Dash:'dashboard',Form:'form',Profile:'profile',Leave:'leave',Approve:'approvals',Admin:'admin',Cmms:'cmms',Catalog:'catalog'}[tab])));
  $('tabAdmin').style.display=S&&S.role==='owner'?'block':'none';$('tabCmms').style.display=S&&S.role==='owner'?'block':'none';$('tabCatalog').style.display=S&&S.role==='owner'?'block':'none';$('tabApprove').style.display=S&&S.role==='owner'?'block':'none';$('tabLeave').style.display='none';
  $('tabForm').style.display=canReport()?'block':'none';
  $('headTitle').textContent = ({dashboard:'لوحة الأداء',form:'بلاغ عطل جديد',profile:'حسابي',leave:'حسابي',approvals:'اعتماد الإجازات والإضافي',admin:'إدارة المستخدمين',cmms:'سجل أوامر الشغل',catalog:'إدارة بيانات الصيانة',change:'تغيير كلمة المرور'})[v]||'MainTrack';
  if(v==='login'||v==='change'){noticeOpen=false;$('notifications').style.display='none';$('notifications').setAttribute('aria-hidden','true');$('bellBtn').setAttribute('aria-expanded','false');}
  $('who').textContent = S ? '◉  '+(S.displayName||S.name) : '';
  if (v === 'form' || v === 'dashboard') $('wo').style.display = v === 'form' ? 'inline-block' : 'none';
  window.scrollTo(0,0);
}
async function save(d) {
  S = {token:d.token,code:d.code,name:d.name,role:d.role||'technician'};
  sessionStorage.setItem('s',JSON.stringify(S));
  appAuthenticated=true; $('retryConnect').hidden=true;
  const secure=mtSecureSession();
  if(secure) {
    try {
      await mtQueueNativeWrite(() => secure.save(S));
      localStorage.removeItem(MT_LOGOUT_GUARD);
    } catch(e) {
      localStorage.setItem(MT_LOGOUT_GUARD,'1');
      note('تم تسجيل الدخول، لكن تعذر حفظ الجلسة بأمان على الجهاز. قد تحتاج تسجيل الدخول بعد إغلاق التطبيق.','err');
    }
  }
}
function logout() {
  const secure=mtSecureSession();
  if(secure) {
    // Non-secret tombstone prevents restored login even if Android kills the app
    // before the asynchronous encrypted-store delete finishes.
    localStorage.setItem(MT_LOGOUT_GUARD,'1');
    void mtQueueNativeWrite(() => secure.clear())
      .then(() => localStorage.removeItem(MT_LOGOUT_GUARD)).catch(() => {});
  }
  if(S) localStorage.removeItem('bd_dashboard_cache_v3_'+S.code);
  sessionStorage.removeItem('s');localStorage.removeItem('s');localStorage.removeItem('d');
  D=null;appAuthenticated=false;S=null;noticeLast=0;noticeOpen=false;
  $('bellCount').style.display='none';$('notifications').setAttribute('aria-hidden','true');
  $('retryConnect').hidden=true;show('login');
}
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
    // Owner active alerts come from BOTH authoritative approval inboxes;
    // archived requests are derived from persisted server decisions.
    let ownerFeed=null;
    if(S.role==='owner'){try{ownerFeed=await ownerRequestSnapshot(true);}catch(e){/* Keep existing saved notices if requests cannot be loaded. */}}
    const resolved=new Set((ownerFeed?.history||[]).map(r=>String(r.id)));
    const storedItems=Array.isArray(d.storedItems)?d.storedItems:d.items||[];
    const requestNotice=n=>S.role==='owner'&&['leaveApprovals','overtimeApprovals'].includes(n.target);
    const normalizedSaved=storedItems.map(n=>{
      const decided=requestNotice(n)&&resolved.has(String(n.sourceId||n.requestId||''));
      return decided?{...n,read:true,target:'ownerArchive',requestId:n.sourceId||n.requestId}:n;
    });
    noticeLast=Date.now();
    const pendingCount=ownerFeed?ownerFeed.pending.length:(S.role==='owner'?Number(d.pendingCount||0):0);
    const unreadSaved=normalizedSaved.filter(n=>!n.read).length,unread=unreadSaved+pendingCount;
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
const archived=(ownerFeed?.history||[]).slice(0,8).map(r=>({
 id:'ARCH-'+r.requestKind+'-'+r.id,requestId:r.id,read:true,target:'ownerArchive',
 title:(r.status==='APPROVED'?'تم اعتماد: ':'تم رفض: ')+ownerRequestTitle(r),
 description:(r.name||'الموظف')+' • '+r.id,
 createdAt:r.decidedAt||r.createdAt
}));
const saved=normalizedSaved.concat(archived)
 .filter((n,i,a)=>!n.requestId || a.findIndex(m=>m.requestId===n.requestId&&m.target==='ownerArchive')===i || n.target!=='ownerArchive')
 .filter(n=>noticeModeV2==='all'||!n.read)
 .sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)).slice(0,5);
const pending=ownerFeed?ownerFeed.pending.slice(0,5).map(r=>({
 id:'REQ-'+r.id,title:(r.name||'الموظف')+' طلب اعتماد',
 description:ownerRequestTitle(r)+' • '+r.id,createdAt:r.createdAt,
 read:false,target:'ownerRequest',request:r
})):(d.pendingItems||[]).slice(0,5);
const items=pending.concat(saved);
    if(!saved.length&&!pending.length){list.className='notice-v2-list';const empty=document.createElement('p');empty.className='notice-v2-empty';empty.textContent=noticeModeV2==='unread'?'لا توجد إشعارات غير مقروءة.':'لا توجد إشعارات محفوظة حتى الآن.';list.append(empty);}
    list.className='notice-v2-list'; items.forEach(n=>{
      const host=['ownerRequest','leaveDecision'].includes(n.target)?$('noticePendingList'):list;
      if(n.target==='ownerRequest'&&S.role==='owner'&&n.request){
        const card=document.createElement('article');card.className='notice-leave-card';
        card.append(approvalNode('strong','',n.title),approvalNode('div','notice-detail',n.description));
        const btn=approvalNode('button','refresh','فتح الطلب واتخاذ القرار');btn.type='button';
        btn.onclick=async()=>{closeNoticesV2();await ownerGoToRequest(n.request.id);};
        card.append(btn);host.append(card);return;
      }
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
      card.append(titleLine,detail,date); card.onclick=async()=>{
        if(n.target==='ownerArchive'&&S?.role==='owner'){closeNoticesV2();await ownerGoToRequest(n.requestId);return;}
        await markNoticeRead(n.id,card);
        if(n.target==='leaveApprovals'&&S&&S.role==='owner')showApprovals();
        else if(n.target==='leave')showLeave();
      }; host.appendChild(card);
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
$('lgo').onclick=async()=>{if($('lgo').disabled)return;const code=norm($('lcode').value.trim()),pw=$('lpw').value;if(!code){note('اكتب كود الموظف','err');$('lcode').focus();return;}if(!pw){note('اكتب الباسورد','err');$('lpw').focus();return;}$('lgo').disabled=true;note('جاري الدخول...','ok');try{const d=await post({action:'login',code:code,pw:pw});if(d.error){if(HELP[d.error]){note(HELP[d.error].m,'err');return help(d.error);}return note(d.error,'err');}await save(d);$('lpw').value='';helpKind=null;$('fbox').style.display='none';note('');if(d.must)return showChange(true);start(true);}catch(e){note(netMsg(e),'err');}finally{$('lgo').disabled=false;}};
$('cgo').onclick=async()=>{if($('np').value!==$('np2').value)return note('الباسورد الجديد غير متطابق','err');try{const d=await post({action:'change',token:S.token,old:$('op').value,pw:$('np').value});if(d.error==='AUTH')return logout();if(d.error)return note(d.error,'err');await save(d);['op','np','np2'].forEach(k=>$(k).value='');await start(true);note('تم حفظ الباسورد','ok');}catch(e){note(netMsg(e),'err');}};
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

const leaveTypeNames={annual:'سنوية',compensatory:'بدلات',casual:'عارضة',sick:'مرضية',other:'أخرى'};
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
 makeTable(hostId,['رقم الطلب','النوع','الفترة','الأيام','الحالة'],items.map(r=>[r.id,leaveTypeNames[r.type]||r.type,r.start+' ← '+r.end,(r.durationKind==='HALF_DAY'?'نصف يوم (4 ساعات)':r.days),leaveStateNames[r.status]||r.status]));
}
async function refreshLeave(){
 if(!S||!canReport())return;
 try{
  const d=await api('leaveMine');if(d.error==='AUTH')return logout();
  if(d.error)throw new Error(d.error);
  $('leavePending').textContent='الطلبات قيد المراجعة: '+(d.items||[]).filter(x=>x.status==='PENDING').length;
  drawLeaveList('myLeaves',d.items||[]);
 }catch(e){$('myLeaves').textContent='تعذر تحميل طلبات الإجازة: '+localizedError(e.message||'');}
}
async function showLeave(){return showProfile();} // retained for notification deep-links
$('sendLeave').onclick=async()=>{
 if(!S||!canReport())return;
 const start=$('leaveStart').value,end=$('leaveEnd').value,type=$('leaveType').value,reason=$('leaveReason').value;
 if(!start||!end||end<start){$('leaveFeedback').textContent='اختار فترة صحيحة للإجازة';return;}
 const durationKind=$('leaveDuration').value;
 if(durationKind==='HALF_DAY'&&(start!==end||!['annual','compensatory'].includes(type))){$('leaveFeedback').textContent='نصف اليوم متاح فقط للسنوية والبدلات، بتاريخ واحد.';return;}
 if(type==='compensatory'&&start!==end){$('leaveFeedback').textContent='إجازة البدل متاحة ليوم واحد: نصف يوم 4 ساعات أو يوم كامل 8 ساعات.';return;}
 if(!confirm('تأكيد إرسال طلب الإجازة إلى Owner؟'))return;
 const btn=$('sendLeave');btn.disabled=true;btn.textContent='جارٍ إرسال الطلب…';
 try{const fingerprint=[start,end,type,reason,...(durationKind==='HALF_DAY'?[durationKind]:[])].join('|');let pending={};try{pending=JSON.parse(sessionStorage.getItem('pendingLeave')||'{}');}catch(e){}const cid=pending.fingerprint===fingerprint?pending.cid:(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random());sessionStorage.setItem('pendingLeave',JSON.stringify({cid,fingerprint}));const d=await api('leaveRequest',{start,end,type,reason,cid,...(durationKind==='HALF_DAY'?{durationKind}:{})});if(d.error==='AUTH')return logout();if(d.error)throw new Error(d.error);$('leaveFeedback').textContent='تم إرسال طلب الإجازة للمالك • '+d.id+' • في انتظار القرار';sessionStorage.removeItem('pendingLeave');$('leaveReason').value='';await showProfile();setAccountHistoryFilter('leave');loadNotices(true);}
 catch(e){$('leaveFeedback').textContent='لم يتم تسجيل الطلب: '+(e.message||'خطأ اتصال');}
 finally{btn.disabled=false;btn.textContent='إرسال طلب الإجازة';}
};


// A shared, unfiltered snapshot powers the Owner inbox, archived decisions,
// and active notification counts. History controls must never affect pending.
let ownerSnapshotCache=null,ownerSnapshotAt=0,ownerSnapshotFlight=null;
function invalidateOwnerSnapshot(){ownerSnapshotCache=null;ownerSnapshotAt=0;}
async function ownerGoToRequest(id){
 if(!S||S.role!=='owner')return;
 // Filters never hide a pending request; reset archive-only filters when following
 // an archived notification to its resolved card.
 $('otOwnerYear').value='0';$('otOwnerMonth').value='0';
 $('otOwnerEmployee').value='';$('ownerHistoryType').value='';
 $('ownerHistoryStatus').value='';
 await showApprovals();
 const card=[...document.querySelectorAll('#ownerPendingRows .approval-card,#ownerHistoryRows .approval-card')]
  .find(el=>el.dataset.requestId===String(id));
 if(card)card.scrollIntoView({block:'center',behavior:'smooth'});
}
async function ownerRequestSnapshot(force=false){
 if(!S||S.role!=='owner')return {items:[],pending:[],history:[],partial:false};
 if(!force&&ownerSnapshotCache&&Date.now()-ownerSnapshotAt<8000)return ownerSnapshotCache;
 if(ownerSnapshotFlight)return ownerSnapshotFlight;
 ownerSnapshotFlight=(async()=>{
  const [leaveResult,otResult]=await Promise.all([api('leaveInbox'),api('overtimeInbox')]);
  if(leaveResult.error)throw Error('LEAVE_INBOX: '+leaveResult.error);
  if(otResult.error)throw Error('OVERTIME_INBOX: '+otResult.error);
  const leaves=(leaveResult.items||[]).map(r=>({...r,requestKind:'leave'}));
  const overtime=(otResult.items||[]).map(r=>({...r,requestKind:'overtime'}));
  // The legacy leave endpoint paginates at 100. Continue until complete, bounded
  // to protect the device; when truncated we display a clear warning.
  let offset=leaves.length,hasMore=!!leaveResult.hasMore,pages=0;
  while(hasMore&&pages<5){
   const page=await api('leaveInbox',{offset});
   if(page.error)throw Error('LEAVE_PAGE: '+page.error);
   const extra=(page.items||[]).map(r=>({...r,requestKind:'leave'}));
   if(!extra.length)break;
   leaves.push(...extra);offset+=extra.length;hasMore=!!page.hasMore;pages++;
  }
  const items=[...leaves,...overtime],known=new Set();
  const unique=items.filter(r=>{
   const key=r.requestKind+':'+r.id;
   if(!r.id||known.has(key))return false;
   known.add(key);return true;
  });
  const order=(r,status)=>Date.parse(status==='history'?(r.decidedAt||r.createdAt||r.date||r.start):(r.createdAt||r.date||r.start))||0;
  const pending=unique.filter(r=>r.status==='PENDING').sort((a,b)=>order(b,'pending')-order(a,'pending'));
  const history=unique.filter(r=>r.status==='APPROVED'||r.status==='REJECTED')
   .sort((a,b)=>order(b,'history')-order(a,'history'));
  const snapshot={items:unique,pending,history,partial:hasMore||overtime.length===150};
  ownerSnapshotCache=snapshot;ownerSnapshotAt=Date.now();
  return snapshot;
 })();
 try{return await ownerSnapshotFlight;}finally{ownerSnapshotFlight=null;}
}
function ownerRequestTitle(r){
 if(r.requestKind==='leave')return 'طلب إجازة • '+(leaveTypeNames[r.type]||r.type);
 return r.compensation==='SUBSTITUTE'?'وقت إضافي • مقابل بدل':'وقت إضافي • مقابل مالي';
}
function ownerRequestCard(r,refresh){
 const isLeave=r.requestKind==='leave';
 const card=approvalCardBase(r,ownerRequestTitle(r),r.requestKind);
 card.dataset.requestId=r.id;
 if(isLeave){
  const duration=r.durationKind==='HALF_DAY'?'نصف يوم (4 ساعات)':fmt(r.days,2)+' يوم';
  const details=[['نوع الإجازة',leaveTypeNames[r.type]||r.type],['تاريخ البداية',r.start],
   ['تاريخ النهاية',r.end],['المدة المطلوبة',duration]];
  if(r.status==='PENDING'){
   approvalDetails(card,details);approvalRemarks(card,'ملاحظة مقدم الطلب',r.reason);
   approvalActions(card,r,'leave',refresh);
  }else{
   const dates=r.start===r.end?r.start:r.start+' — '+r.end;
   approvalCompleted(card,r,[['الفترة',dates],['المدة',duration]],details);
  }
 }else{
  const kind=overtimeKinds[r.compensation]||r.compensation;
  const nature=({AFTER_SHIFT:'بعد الوردية',INDEPENDENT_DAY:'يوم مستقل',UNSPECIFIED:'غير محدد'})[r.workKind]||'غير محدد';
  const minutes=Number(r.minutes??Math.round(Number(r.hours)*60));
  const hours=fmt(minutes/60,2)+' ساعة';
  const end=showOvertimeClock(r.to)+(r.to<=r.from?' (اليوم التالي)':'');
  const details=[['تاريخ العمل',r.date],['بداية الإضافي',showOvertimeClock(r.from)],
   ['نهاية الإضافي',end],['المدة',compactDays(minutes/480)+' يوم مكافئ · '+hours],
   ['طبيعة العمل',nature],['نوع التعويض',kind]];
  if(r.status==='PENDING'){
   approvalDetails(card,details);approvalRemarks(card,'ملاحظة مقدم الطلب',r.reason);
   approvalActions(card,r,'overtime',refresh);
  }else{
   approvalCompleted(card,r,[['التاريخ',r.date],['الوقت',showOvertimeClock(r.from)+'–'+end],
    ['المدة',hours],['التعويض',kind]],details);
  }
 }
 return card;
}
function ownerHistoryMatches(r){
 const year=Number($('otOwnerYear').value||0),month=Number($('otOwnerMonth').value||0);
 const employee=$('otOwnerEmployee').value,type=$('ownerHistoryType').value,status=$('ownerHistoryStatus').value;
 const when=String(r.decidedAt||r.createdAt||r.date||r.start||'').slice(0,10);
 const date=/^\d{4}-\d{2}-\d{2}$/.test(when)?when:'';
 if(year && Number(date.slice(0,4))!==year)return false;
 if(month && Number(date.slice(5,7))!==month)return false;
 if(employee&&r.code!==employee)return false;
 if(status&&r.status!==status)return false;
 if(type==='leave'&&r.requestKind!=='leave')return false;
 if(type==='financial'&&(r.requestKind!=='overtime'||r.compensation!=='FINANCIAL'))return false;
 if(type==='substitute'&&(r.requestKind!=='overtime'||r.compensation!=='SUBSTITUTE'))return false;
 return true;
}
function renderOwnerHistory(){
 if(!ownerSnapshotCache)return;
 const host=$('ownerHistoryRows'),results=ownerSnapshotCache.history.filter(ownerHistoryMatches);
 host.replaceChildren();
 $('ownerHistoryCount').textContent=String(results.length);
 if(!results.length)host.textContent='لا توجد طلبات معتمدة أو مرفوضة مطابقة للفلاتر.';
 for(const r of results)host.append(ownerRequestCard(r,showApprovals));
 $('ownerHistoryState').textContent=ownerSnapshotCache.partial
  ?'تنبيه: السجل كبير وقد لا يتضمن جميع الطلبات القديمة؛ يمكن تضييق الفلاتر أو مراجعة سجل السيرفر.':'';
}
function syncOwnerHistoryEmployees(snapshot){
 const select=$('otOwnerEmployee'),old=select.value;
 const values=[...new Map(snapshot.items.map(r=>[r.code,{code:r.code,name:r.name}])
  .filter(([code])=>!!code)).values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ar'));
 select.length=1;
 for(const user of values)select.add(new Option(user.name+' — '+user.code,user.code));
 select.value=old;if(select.selectedIndex<0)select.value='';
}
async function refreshOwnerHub(force=true){
 if(!S||S.role!=='owner')return;
 const host=$('ownerPendingRows');
 host.textContent='جارٍ تحميل صندوق الطلبات…';
 try{
  const snapshot=await ownerRequestSnapshot(force);
  if(!S||S.role!=='owner')return;
  host.replaceChildren();
  $('ownerPendingCount').textContent=String(snapshot.pending.length);
  $('pendingBadge').hidden=!snapshot.pending.length;
  $('pendingBadge').textContent=String(snapshot.pending.length);
  if(!snapshot.pending.length)host.textContent='لا توجد طلبات جديدة تحتاج اعتمادك حاليًا.';
  for(const r of snapshot.pending)host.append(ownerRequestCard(r,async()=>{
   await refreshOwnerHub(true);void loadOvertimeSummary();
  }));
  syncOwnerHistoryEmployees(snapshot);
  renderOwnerHistory();
 }catch(e){
  host.textContent='تعذّر تحميل صندوق الطلبات: '+localizedError(e.message||'');
  $('ownerHistoryRows').textContent='تعذّر التحقق من سجل الاعتمادات.';
  $('ownerPendingCount').textContent='—';
 }
}

const approvalNode=(tag,className,value)=>{
 const el=document.createElement(tag);
 if(className)el.className=className;
 if(value!==undefined&&value!==null)el.textContent=String(value);
 return el;
};
const approvalStatus=(status)=>leaveStateNames[status]||String(status||'—');
function approvalCardBase(r,title,category){
 const compact=r.status==='APPROVED'||r.status==='REJECTED';
 const card=approvalNode('article','approval-card '+(compact?'approval-card--compact':'approval-card--detailed'));

 const top=approvalNode('div','request-card-top');
 const titleCol=approvalNode('div','request-card-heading');
 const label=approvalNode('span','request-card-type',title);
 const name=approvalNode('strong','request-card-name',r.name||'الموظف');
 const identity=approvalNode('div','request-card-identity','كود الموظف: '+(r.code||'—')+'  •  رقم الطلب: '+(r.id||'—'));
 titleCol.append(label,name,identity);
 const status=approvalNode('span','request-status request-status--'+String(r.status||'PENDING').toLowerCase(),approvalStatus(r.status));
 top.append(titleCol,status);card.append(top);
 card.dataset.requestCategory=category;card.dataset.requestStatus=String(r.status||'');
 return card;
}
function approvalField(card,label,value){
 const field=approvalNode('div','request-detail-field');
 field.append(approvalNode('dt','',label),approvalNode('dd','',value==null||value===''?'—':value));
 card.append(field);
}
function approvalDetails(card,pairs){
 const list=approvalNode('dl','request-details-grid');
 for(const [label,value] of pairs)approvalField(list,label,value);
 card.append(list);
}
// Completed requests stay condensed by default; details remain accessible for audit.
function approvalCompleted(card,request,facts,details){
 const summary=approvalNode('div','request-compact-facts');
 for(const [label,value] of facts){
  const item=approvalNode('span','request-compact-fact');
  item.append(approvalNode('strong','',label+': '),document.createTextNode(String(value??'—')));
  summary.append(item);
 }
 card.append(summary);
 if(request.status==='REJECTED'&&request.decisionReason){
  card.append(approvalNode('p','request-compact-reason','سبب الرفض: '+request.decisionReason));
 }
 const expandable=approvalNode('details','request-optional-details');
 expandable.append(approvalNode('summary','','عرض التفاصيل'));
 approvalDetails(expandable,details);
 approvalRemarks(expandable,'ملاحظة مقدم الطلب',request.reason);
 approvalRemarks(expandable,'سبب القرار',request.decisionReason);
 card.append(expandable);
}
function approvalRemarks(card,heading,note){
 if(!note)return;
 const box=approvalNode('div','request-notes');
 box.append(approvalNode('span','request-notes-label',heading),approvalNode('p','',note));
 card.append(box);
}
function approvalActions(card,request,kind,refresh){
 if(request.status!=='PENDING')return;
 const wrap=approvalNode('div','approval-actions request-actions');
 const feedback=approvalNode('p','request-action-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const buttons=[];
 for(const [decision,label] of [['APPROVED','اعتماد الطلب'],['REJECTED','رفض الطلب']]){
  const btn=approvalNode('button',decision==='APPROVED'?'btn':'refresh',label);
  btn.type='button';buttons.push(btn);
  btn.onclick=async()=>{
   const reason=decision==='REJECTED'?prompt('سبب الرفض (اختياري):'):'';if(reason===null)return;
   if(!confirm((decision==='APPROVED'?'اعتماد':'رفض')+' الطلب '+request.id+'؟'))return;
   buttons.forEach(b=>b.disabled=true);
   feedback.textContent='جارٍ حفظ قرار الـOwner…';feedback.dataset.state='pending';
   try{
    const result=await api(kind==='overtime'?'overtimeDecision':'leaveDecision',{id:request.id,decision,reason:reason||''});
    if(result.error)throw new Error(result.error);
    feedback.textContent='تم حفظ القرار بنجاح.';feedback.dataset.state='success';
    invalidateOwnerSnapshot();noticeLast=0;
    await refresh();void loadNotices(true);
   }catch(e){
    feedback.textContent='تعذّر الاعتماد: '+localizedError(e.message||'');
    feedback.dataset.state='error';buttons.forEach(b=>b.disabled=false);
   }
  };
  wrap.append(btn);
 }
 card.append(wrap,feedback);
}
async function showApprovals(){
 if(!S||S.role!=='owner')return;
 show('approvals');
 await refreshOwnerHub(true);
 void loadOvertimeSummary();
}
$('refreshApprovals').onclick=()=>{void refreshOwnerHub(true);void loadNotices(true);};
$('otRefreshApprovals').onclick=()=>{void refreshOwnerHub(true);void loadOvertimeSummary();};

function renderProfile(p){
 $('profileAvatar').textContent=(p.preferredName||p.name||'M').trim().charAt(0);
 $('profileName').textContent=p.preferredName||p.name||'الموظف';
 if(S){S.displayName=p.preferredName||p.name;sessionStorage.setItem('s',JSON.stringify(S));$('who').textContent='◉  '+S.displayName;}
 $('profileRole').textContent=p.jobTitle||'المسمى الوظيفي غير محدد';
 $('profileAccess').textContent=roles[p.role]||p.role;
 $('profileCode').textContent=p.code;
 $('profileDepartment').textContent=p.department||'غير محدد';
 $('profileJob').textContent=p.jobTitle||'غير محدد';
}
// Show whole and half days without unnecessary trailing zeros; minute precision stays in the API.
const compactDays=value=>String(Number(Number(value).toFixed(2)));
const displayDays=value=>value==null?'غير محدد':compactDays(value);
const formatAccountPart=value=>value==null?'غير محدد':displayDays(value)+' يوم';
async function refreshAccountSummary(){
 if(!S||!canReport())return;
 try{
  const d=await api('accountSummary');if(d.error==='AUTH')return logout();
  if(d.error)throw new Error(d.error);
  renderProfile(d.profile);
  $('leaveBalance').textContent=displayDays(d.annualAvailableDays);
  $('annualTotal').textContent=formatAccountPart(d.annualTotalDays);
  $('annualUsed').textContent=formatAccountPart(d.annualUsedDays);
  $('substituteBalance').textContent=displayDays(d.substituteAvailableDays);
  $('substituteEarned').textContent=formatAccountPart(d.substituteEarnedDays);
  $('substituteUsed').textContent=formatAccountPart(d.substituteUsedDays);
  $('otFinancial').textContent=displayDays(d.financialApprovedDays);
 }catch(e){note('تعذر تحميل أرصدة الحساب: '+localizedError(e.message||''),'err');}
}
async function showProfile(){
 if(!S)return;show('profile');$('profileName').textContent='جارٍ تحميل ملفك...';
 overtimeDateLimit();
 await Promise.all([refreshAccountSummary(),refreshLeave(),refreshOvertime()]);
}

const overtimeKinds={FINANCIAL:'مالي',SUBSTITUTE:'بدل'};
const showOvertimeClock=value=>{
 const match=/^(\d{1,2}):([0-5]\d)/.exec(String(value||''));if(!match)return '—';
 const hour=Number(match[1]);if(hour>23)return '—';
 return String(hour%12||12)+':'+match[2]+' '+(hour<12?'صباحًا':'مساءً');
};
// Use explicit 12-hour controls: native time inputs can display 24h depending on device locale.
for(const prefix of ['otFrom','otTo']){
 const hours=$(prefix+'Hour'),minutes=$(prefix+'Minute');
 for(let i=1;i<=12;i++)hours.add(new Option(String(i),String(i)));
 for(let i=0;i<60;i++){const v=String(i).padStart(2,'0');minutes.add(new Option(v,v));}
}
const readOvertimeClock=prefix=>{
 const hours=Number($(prefix+'Hour').value),minutes=$(prefix+'Minute').value,period=$(prefix+'Period').value;
 if(!(hours>=1&&hours<=12)||!/^\d{2}$/.test(minutes)||!['AM','PM'].includes(period))return '';
 return String((hours%12)+(period==='PM'?12:0)).padStart(2,'0')+':'+minutes;
};
// Same local calendar rule as the API: calculate overtime completion in Africa/Cairo.
// Work may span midnight; store/compare sortable YYYY-MM-DDTHH:mm strings internally.
const cairoLocalMinute=(instant=new Date())=>{
 const fields=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(instant).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return fields.year+'-'+fields.month+'-'+fields.day+'T'+fields.hour+':'+fields.minute;
};
const overtimeEndLocal=(workDate,from,to)=>{
 const pastMidnight=to<=from;
 const endDate=pastMidnight?new Date(Date.parse(workDate+'T00:00:00Z')+86400000).toISOString().slice(0,10):workDate;
 return endDate+'T'+to;
};
const overtimeHasEnded=(workDate,from,to,instant=new Date())=>
 overtimeEndLocal(workDate,from,to)<=cairoLocalMinute(instant);
const overtimeDateLimit=()=>{$('otDate').max=cairoLocalMinute().slice(0,10);};
overtimeDateLimit();
let overtimeHistory=[];
let accountHistoryFilter='leave';
function setAccountHistoryFilter(filter){
 if(!['leave','financial','substitute'].includes(filter))return;
 accountHistoryFilter=filter;
 const labels={leave:'historyFilterLeave',financial:'historyFilterFinancial',substitute:'historyFilterSubstitute'};
 for(const [name,id] of Object.entries(labels))$(id).setAttribute('aria-pressed',String(name===filter));
 $('myLeaves').style.display=filter==='leave'?'block':'none';
 $('otMine').style.display=filter==='leave'?'none':'block';
 $('leavePending').style.display=filter==='leave'?'block':'none';
 showOvertimeHistory();
}
for(const [filter,id] of [['leave','historyFilterLeave'],['financial','historyFilterFinancial'],['substitute','historyFilterSubstitute']])
 $(id).onclick=()=>setAccountHistoryFilter(filter);
const showOvertimeHistory=()=>{
 const kind=accountHistoryFilter==='financial'?'FINANCIAL':'SUBSTITUTE';
 if(accountHistoryFilter!=='leave')overtimeRows('otMine',overtimeHistory.filter(x=>x.compensation===kind));
};
function overtimeRows(hostId,items){
 makeTable(hostId,['رقم الطلب','التاريخ','الفترة','أيام مكافئة','طبيعة الإضافي','الحالة'],(items||[]).map(r=>[r.id,r.date,showOvertimeClock(r.from)+'–'+showOvertimeClock(r.to)+(r.to<=r.from?' (اليوم التالي)':''),compactDays(Number(r.minutes??Math.round(r.hours*60))/480),({AFTER_SHIFT:'بعد الوردية',INDEPENDENT_DAY:'يوم مستقل',UNSPECIFIED:'غير محدد'}[r.workKind]||'غير محدد')+' · '+(overtimeKinds[r.compensation]||r.compensation),leaveStateNames[r.status]||r.status]));
}
async function refreshOvertime(){
 if(!S||!canReport())return;
 try{
  const d=await api('overtimeMine');if(d.error)throw new Error(d.error);
  overtimeHistory=d.items||[];showOvertimeHistory();
 }catch(e){$('otMine').textContent='تعذر تحميل سجل الوقت الإضافي: '+localizedError(e.message||'');}
}
$('otRefreshMine').onclick=()=>{void refreshOvertime();void refreshAccountSummary();};
$('otSend').onclick=async()=>{
 if(!S||!canReport())return;
 const workDate=$('otDate').value,from=readOvertimeClock('otFrom'),to=readOvertimeClock('otTo'),compensation=$('otKind').value,workKind=$('otWorkKind').value,reason=$('otReason').value;
 if(!['FINANCIAL','SUBSTITUTE'].includes(compensation)){
  $('otFeedback').textContent='اختر نوع التعويض أولاً: مالي أو بدل / رصيد ساعات.';
  $('otFeedback').dataset.state='error';$('otKind').focus();return;
 }
 if(!workDate||!from||!to||from===to||!workKind){$('otFeedback').textContent='حدد تاريخ العمل ووقت البداية والنهاية وطبيعة الإضافي.';$('otFeedback').dataset.state='error';return;}
 // Prevent a server round-trip for a future or unfinished work period.
 // Server-side validation remains authoritative even if the browser clock is wrong.
 if(!overtimeHasEnded(workDate,from,to)){
  $('otFeedback').textContent=localizedError('FUTURE_OVERTIME_NOT_ALLOWED');
  $('otFeedback').dataset.state='error';
  $('otDate').focus();
  return;
 }
 if(!confirm('تأكيد إرسال ساعات الوقت الإضافي للـOwner؟'))return;
 const btn=$('otSend');btn.disabled=true;
 try{
  const fingerprint=[workDate,from,to,compensation,workKind,reason].join('|');
  let pending={};try{pending=JSON.parse(sessionStorage.getItem('pendingOvertime')||'{}');}catch(e){}
  const cid=pending.fingerprint===fingerprint?pending.cid:crypto.randomUUID();
  sessionStorage.setItem('pendingOvertime',JSON.stringify({cid,fingerprint}));
  const d=await api('overtimeRequest',{workDate,from,to,compensation,workKind,reason,cid});
  if(d.error)throw new Error(d.error);
  sessionStorage.removeItem('pendingOvertime');
  $('otFeedback').textContent='تم إرسال '+d.id+'، في انتظار اعتماد الـOwner.';$('otFeedback').dataset.state='success';
  $('otReason').value='';$('otKind').value='';$('otWorkKind').value='';await Promise.all([refreshOvertime(),refreshAccountSummary()]);setAccountHistoryFilter(compensation==='FINANCIAL'?'financial':'substitute');loadNotices(true);
 }catch(e){$('otFeedback').textContent='تعذر إرسال الطلب: '+localizedError(e.message||'');$('otFeedback').dataset.state='error';}
 finally{btn.disabled=false;}
};
// Owner-only summary: distinct approved (employee, work_date) pairs differ from hours.
const ownerYear=$('otOwnerYear'),ownerMonth=$('otOwnerMonth');
for(let y=new Date().getFullYear()+1;y>=new Date().getFullYear()-7;y--)ownerYear.add(new Option(String(y),String(y)));
for(let m=1;m<=12;m++)ownerMonth.add(new Option(new Intl.DateTimeFormat('ar-EG',{month:'long'}).format(new Date(2026,m-1,1)),String(m)));
const ownerOvertimeFilters=()=>({
 year:Number(ownerYear.value||0),month:Number(ownerMonth.value||0),
 employeeCode:$('otOwnerEmployee').value,compensation:$('ownerHistoryType').value==='financial'?'FINANCIAL':$('ownerHistoryType').value==='substitute'?'SUBSTITUTE':''
});
let ownerSummarySequence=0,ownerInboxSequence=0;
async function loadOvertimeSummary(){
 if(!S||S.role!=='owner')return;
 const seq=++ownerSummarySequence;
 $('otOwnerSummaryState').textContent='جارٍ تحديث مؤشرات العمل الإضافي…';
 try{
  const d=await api('overtimeSummary',ownerOvertimeFilters());
  if(seq!==ownerSummarySequence)return;
  if(d.error)throw new Error(d.error);
  $('otOwnerApprovedHours').textContent=fmt(d.approvedHours,2)+' ساعة';
  $('otOwnerDistinctDays').textContent=String(d.distinctDays||0)+' يوم';
  $('otOwnerFinancialHours').textContent=fmt(d.financialHours,2)+' ساعة';
  $('otOwnerSubstituteHours').textContent=fmt(d.substituteHours,2)+' ساعة';
  $('otOwnerPending').textContent=String(d.pendingCount||0);
  $('otOwnerSummaryState').textContent='أيام الحضور الفريدة محسوبة لكل موظف وتاريخ بداية الإضافي، للطلبات المعتمدة فقط.';
 }catch(e){if(seq===ownerSummarySequence)$('otOwnerSummaryState').textContent='تعذر تحميل الملخص: '+localizedError(e.message||'');}
}
for(const id of ['otOwnerYear','otOwnerMonth','otOwnerEmployee','ownerHistoryType','ownerHistoryStatus']){
 $(id).addEventListener('change',()=>{
  renderOwnerHistory();
  void loadOvertimeSummary();
 });
}

$('otRefreshMine').onclick=refreshOvertime;

function renderAdminSelection(){
 const code=$('adminUser').value,u=adminItems.find(x=>x.code===code);if(!u)return;
 $('adminRole').value=u.role;$('adminActive').checked=!!u.active;$('adminLeave').value=u.leaveBalance==null?'':u.leaveBalance;$('adminSubHours').value=u.substituteAvailableHours==null?'0':u.substituteAvailableHours;$('adminBalanceReason').value='';$('adminDepartment').value=u.department||'';$('adminJob').value=u.jobTitle||'';
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
 const current=adminItems.find(x=>x.code===code);
 const annual=$('adminLeave').value,sub=$('adminSubHours').value,reason=$('adminBalanceReason').value.trim();
 if(sub===''||Number(sub)<0||!Number.isFinite(Number(sub))){note('ادخل عدد ساعات البدلات الصحيح','err');return;}
 const annualChanged=current&&String(current.leaveBalance??'')!==annual;
 const subChanged=current&&Math.abs(Number(current.substituteAvailableHours||0)-Number(sub))>0.00001;
 if((annualChanged||subChanged)&&reason.length<3){note('اكتب سبب تعديل الرصيد (3 أحرف على الأقل).','err');$('adminBalanceReason').focus();return;}
 if(!confirm('تأكيد حفظ صلاحيات ورصيدي الإجازات السنوية والبدلات للموظف المختار؟'))return;
 const btn=$('saveAdmin');btn.disabled=true;
 try{const d=await api('adminSaveUser',{code,role:$('adminRole').value,active:$('adminActive').checked,leaveBalance:$('adminLeave').value,substituteHours:$('adminSubHours').value,adjustmentReason:$('adminBalanceReason').value.trim(),department:$('adminDepartment').value,jobTitle:$('adminJob').value});if(d.error==='AUTH')return logout();if(d.error)throw new Error(d.error);note('تم تحديث الحساب على السيرفر','ok');await showAdmin();}
 catch(e){note('تعذر حفظ الصلاحيات: '+(e.message||'خطأ اتصال'),'err');}finally{btn.disabled=false;}
};
$('tabProfile').onclick=showProfile;$('tabLeave').onclick=showProfile;$('tabApprove').onclick=showApprovals;$('tabAdmin').onclick=showAdmin;$('who').onclick=showProfile;
$('tabDash').onclick=()=>showDashboard(false);$('tabForm').onclick=()=>{if(!canReport())return note('ليس لديك صلاحية تسجيل بلاغات','err');show('form');if(!D)load();refreshWorkOrder();};$('prevMonth').onclick=()=>{selectedMonth=new Date(selectedMonth.getFullYear(),selectedMonth.getMonth()-1,1);showDashboard(false);};$('nextMonth').onclick=()=>{const n=new Date(selectedMonth.getFullYear(),selectedMonth.getMonth()+1,1);if(n<=new Date(new Date().getFullYear(),new Date().getMonth(),1)){selectedMonth=n;showDashboard(false);}};$('refreshDash').onclick=()=>showDashboard(true);
window.addEventListener('online',()=>{if(!S)return;flush();loadNotices(true);if($('dashboard').style.display!=='none')showDashboard(true);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S){flush();loadNotices();if($('dashboard').style.display!=='none')showDashboard(false);}});
// Only visible sessions poll once per minute; WO is refreshed on form entry/save, not every 20s.
setInterval(()=>{if(S&&appAuthenticated&&!document.hidden)loadNotices();},20000);
if('serviceWorker'in navigator)Promise.resolve() /* Preview runs without service-worker cache */;pend();
void (async()=>{
  const secure=mtSecureSession();
  if(localStorage.getItem(MT_LOGOUT_GUARD)==='1'){
    S=null;sessionStorage.removeItem('s');
    if(secure) {
      try {await mtQueueNativeWrite(() => secure.clear());localStorage.removeItem(MT_LOGOUT_GUARD);}
      catch(e) {/* Fail closed. Do not restore credentials after explicit logout. */}
    }
    show('login');return;
  }
  if(!S && secure){
    try {
      const restored=await secure.read();
      if(restored && /^[a-f0-9]{64}$/.test(restored.token)
         && typeof restored.code==='string' && restored.code.length>0 && restored.code.length<=64
         && typeof restored.name==='string' && typeof restored.role==='string') {
        S=restored;sessionStorage.setItem('s',JSON.stringify(S));
      }
    }catch(e){/* Missing/invalid keystore credentials require login, not plaintext fallback. */}
  }
  if(S)await start();else show('login');
})();
