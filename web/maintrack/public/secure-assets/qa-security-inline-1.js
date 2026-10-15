
(()=>{'use strict';
const API='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api';
const $=id=>document.getElementById(id);
const allowedRoles=['engineer','technician'];
let session=null, report=null, running=false;
const tests=[
 ['إدارة المستخدمين',{action:'adminUsers',role:'owner'}],
 ['عرض بيانات الصيانة الإدارية',{action:'adminCatalog',kind:'sections'}],
 ['تعديل بيانات الصيانة (بيانات غير صالحة)',{action:'adminCatalogSave',kind:'__INVALID_QA_KIND__',operation:'rename',id:999999999,name:'QA_INVALID'}],
 ['إنشاء موظف (كود غير صالح)',{action:'adminCreateEmployee',code:'!',name:'',role:'technician'}],
 ['صندوق طلبات الإجازات',{action:'leaveInbox'}],
 ['قرار الإجازة (طلب غير موجود)',{action:'leaveDecision',id:'LV-SECURITY-NEVER-REAL-20261015',decision:'REJECTED',reason:'security test; nonexistent request'}],
 ['إدارة أوامر الشغل',{action:'cmms',mode:'list'}],
 ['سجل تعديل أمر شغل (غير موجود)',{action:'cmmsAudit',woNumber:999999999}],
 ['إغلاق أمر شغل (غير موجود)',{action:'cmmsWrite',operation:'close',woNumber:999999999,revision:1,reason:'Stage 8 security test - nonexistent work order'}],
 ['حذف أمر شغل (غير موجود)',{action:'cmmsDelete',woNumber:999999999,revision:1,reason:'Stage 8 security test - nonexistent work order'}]
];
function safeSession(){try{const a=JSON.parse(sessionStorage.getItem('s')||'null');return a&&/^[a-f0-9]{64}$/i.test(a.token||'')?a:null;}catch(_){return null;}}
async function request(body,token){
 const controller=new AbortController(),t=setTimeout(()=>controller.abort(),15000);
 try{
   const r=await fetch(API,{method:'POST',mode:'cors',cache:'no-store',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(body),signal:controller.signal});
   const reply=await r.json().catch(()=>({}));return {status:r.status,error:String(reply.error||''),role:String(reply.role||'')};
 }finally{clearTimeout(t);}
}
function mark(name,value,pass){const line=document.createElement('div');line.className='result';const a=document.createElement('span');a.textContent=name;const b=document.createElement('span');b.className='status '+(pass?'pass':'fail');b.textContent=value;line.append(a,b);$('results').append(line);}
async function bootstrap(){
 session=safeSession();
 if(!session){$('session').className='warn';$('session').textContent='لم يتم العثور على جلسة في هذا التبويب. افتح MainTrack أولًا، ادخل بالحساب، ثم انتقل لهذه الصفحة من شريط العنوان في نفس التبويب.';return;}
 if(!allowedRoles.includes(session.role)){$('session').className='warn';$('session').textContent='الجلسة الحالية ليست Engineer أو Technician. سجّل الدخول بأحد هذين الحسابين أولًا. لا يتم إجراء اختبارات الرفض بحساب Owner.';return;}
 try{
   const res=await request({action:'session'},session.token);
   if(res.status!==200||res.role!==session.role){$('session').className='warn';$('session').textContent='لم يتم توثيق الجلسة على السيرفر. تأكد من تسجيل الدخول مرة أخرى.';return;}
   $('session').textContent='جلسة صالحة، الصلاحية: '+session.role.toUpperCase()+' · جاهز لاختبار منع الوصول الإداري.';
   $('run').disabled=false;
 }catch(err){$('session').className='warn';$('session').textContent='تعذر الاتصال بالـAPI: '+(err.name==='AbortError'?'انتهت مهلة الاتصال':'تحقق من الاتصال.');}
}
async function run(){
 if(running||!session)return;running=true;$('run').disabled=true;$('copy').disabled=true;$('results').textContent='';report={role:session.role,records:[],time:new Date().toISOString()};
 $('summary').textContent='جارٍ تنفيذ الاختبارات الآمنة…';
 for(const [label,body] of tests){
  try{
    const data=await request(body,session.token);
    const pass=data.status===403 && data.error==='FORBIDDEN';
    mark(label,data.status+' '+(data.error||''),pass);
    report.records.push({name:label,status:data.status,error:data.error,pass});
  }catch(e){mark(label,e.name==='AbortError'?'TIMEOUT':'NETWORK ERROR',false);report.records.push({name:label,status:null,error:e.name==='AbortError'?'TIMEOUT':'NETWORK_ERROR',pass:false});}
 }
 const passed=report.records.filter(x=>x.pass).length;
 $('summary').textContent='النتيجة: '+passed+' من '+tests.length+' · الدور: '+session.role+' · '+(passed===tests.length?'كل المحاولات الإدارية مرفوضة HTTP 403 ✓':'توجد نتائج غير متوقعة؛ راجعها قبل اعتماد الأمان.');
 $('summary').className=passed===tests.length?'ok':'bad';$('copy').disabled=false;$('run').disabled=false;running=false;
}
$('run').addEventListener('click',run);
$('copy').addEventListener('click',async()=>{
 if(!report)return;
 const count=report.records.filter(x=>x.pass).length;
 const text=['MainTrack Stage 8 - API Authorization Security Test','Role: '+report.role,'Date: '+report.time,'Results: '+count+'/'+report.records.length+' expected 403',...report.records.map(x=>(x.pass?'PASS':'FAIL')+' | '+x.name+' | '+String(x.status)+' '+x.error),'No credentials, session tokens, or passwords included.'].join('\n');
 try{await navigator.clipboard.writeText(text);$('copy').textContent='تم نسخ ملخص الاختبار';}catch(_){$('copy').textContent='النسخ غير متاح في هذا المتصفح';}
});
$('back').addEventListener('click',()=>{location.assign('/');});
bootstrap();
})();
