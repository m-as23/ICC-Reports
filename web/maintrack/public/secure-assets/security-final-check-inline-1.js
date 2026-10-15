
(()=>{'use strict';
const $=id=>document.getElementById(id),api='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api';let busy=false,report;
function add(section,label,ok,detail){const el=document.createElement('div');el.className='row';const left=document.createElement('div'),name=document.createElement('strong'),txt=document.createElement('small'),res=document.createElement('strong');name.textContent=section+' — '+label;txt.textContent=detail;left.append(name,txt);res.textContent=ok===null?'SKIP':(ok?'PASS':'FAIL');res.className=ok===null?'skip':(ok?'pass':'fail');el.append(left,res);$('results').append(el);report.results.push({section,label,result:res.textContent,detail});}
async function post(action,token,params){const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),13000);const headers={'content-type':'application/json'};if(token)headers.authorization='Bearer '+token;try{const r=await fetch(api,{method:'POST',headers,cache:'no-store',body:JSON.stringify({action,...params}),signal:ac.signal});const j=await r.json().catch(()=>({}));return {status:r.status,error:typeof j.error==='string'?j.error:'',role:typeof j.role==='string'?j.role:''};}catch(e){return {status:0,error:e.name==='AbortError'?'TIMEOUT':'NETWORK_ERROR',role:''}}finally{clearTimeout(timer)}}
async function run(){if(busy)return;busy=true;$('run').disabled=true;$('copy').disabled=true;$('results').replaceChildren();report={suite:'maintrack-stage9-acceptance',time:new Date().toISOString(),role:'unknown',results:[]};
try{
const h=await fetch(location.pathname,{cache:'no-store'});const headers=h.headers,csp=headers.get('Content-Security-Policy')||'';
add('Browser','CSP enforced, scripts external',csp.includes("script-src 'self'")&&!csp.includes("script-src 'self' 'unsafe-inline'"),'Enforced script-src has no unsafe-inline');
add('Browser','Inline event handlers blocked',csp.includes("script-src-attr 'none'"),'script-src-attr none');
add('Browser','Clickjacking protection',(headers.get('X-Frame-Options')||'').toUpperCase()==='DENY'&&csp.includes("frame-ancestors 'none'"),'Frame deny and frame-ancestors');
add('Browser','Object embedding denied',csp.includes("object-src 'none'"),'object-src none');
add('Browser','Strict MIME checking',(headers.get('X-Content-Type-Options')||'')==='nosniff','nosniff');
add('Browser','Referrer restrictions',(headers.get('Referrer-Policy')||'')==='strict-origin-when-cross-origin','Referrer-Policy');
const reportRes=await fetch('security-build-report.json',{cache:'no-store'});const build=await reportRes.json();const pages=Object.values(build.pages||{});add('Bundle','No inline executable scripts',build.issues?.length===0&&pages.length>=2&&pages.every(x=>x.remainingInlineScripts===0&&x.inlineEventHandlers===0&&x.javascriptURLs===0),'Build static HTML audit');
add('Bundle','Scripts extracted and API redirected',build.rewrittenApiReferences>=1&&build.strictScriptCSP===true,'Isolated Stage9 API');
let evalBlocked=false,funBlocked=false;try{(0,eval)('1+1')}catch(e){evalBlocked=e.name==='EvalError'||e.name==='TypeError'}try{new Function('return 1')()}catch(e){funBlocked=e.name==='EvalError'||e.name==='TypeError'}
add('Browser','Dynamic eval blocked',evalBlocked&&!csp.includes("'unsafe-eval'"),'eval / unsafe-eval denied');add('Browser','Dynamic Function blocked',funBlocked,'new Function denied');
let exec=0;window.__mtQaSignal=()=>{exec++};const b=document.createElement('button');b.type='button';b.hidden=true;b.setAttribute('onclick','window.__mtQaSignal()');document.body.append(b);b.click();b.remove();delete window.__mtQaSignal;add('Browser','Injected onclick blocked',exec===0,'DOM event handler test');
const u=await post('adminUsers',null,{}),v=await post('adminUsers','0'.repeat(64),{});
add('Auth','No token denied',u.status===401,'HTTP '+u.status);add('Auth','Invalid token denied',v.status===401,'HTTP '+v.status);
let s=null;try{s=JSON.parse(sessionStorage.getItem('s')||'null')}catch{}
if(!s||typeof s.token!=='string'||!(/^[0-9a-f]{64}$/).test(s.token)){add('Role','Authenticated session',false,'Login from MainTrack in the same browser tab first');}
else{
 const me=await post('session',s.token,{});report.role=me.role||'unverified';
 const valid=me.status===200&&['technician','engineer'].includes(me.role);
 add('Role','Engineer/Technician session',valid,'Role '+report.role+', HTTP '+me.status);
 if(valid){const checks=[['adminUsers',{},'Users admin'],['adminCatalog',{kind:'sections'},'Maintenance catalog'],['adminCatalogSave',{kind:'sections',operation:'invalid',id:0},'Catalog update'],['adminCreateEmployee',{code:'',name:''},'Create employee'],['leaveInbox',{},'Leave approvals'],['leaveDecision',{id:'',decision:'APPROVED'},'Leave decision'],['cmms',{mode:'list',limit:1},'Work Orders list'],['cmmsAudit',{woNumber:0},'Work Order audit'],['cmmsWrite',{operation:'close',woNumber:0,revision:0,reason:''},'Work Order close'],['cmmsDelete',{woNumber:0,revision:0,reason:''},'Work Order archive']];
 for(const [act,data,label] of checks){const out=await post(act,s.token,data);add('RBAC',label,out.status===403,'HTTP '+out.status);}
 }}
}catch(e){add('Harness','Suite runtime',false,String(e.message||e))}
const passed=report.results.filter(x=>x.result==='PASS').length,total=report.results.length,failed=report.results.filter(x=>x.result==='FAIL').length;
report.summary={passed,total,failed};$('summary').textContent='النتيجة: '+passed+'/'+total+' | فشل: '+failed+' | الدور: '+report.role;
$('summary').className=failed===0?'pass':'fail';$('report').textContent=JSON.stringify(report,null,2);$('copy').disabled=false;$('run').disabled=false;busy=false;
}
$('run').addEventListener('click',run);$('copy').addEventListener('click',async()=>{if(!report)return;const obj={suite:report.suite,role:report.role,time:report.time,summary:report.summary,results:report.results.map(x=>({section:x.section,label:x.label,result:x.result,detail:x.detail}))};const v=JSON.stringify(obj,null,2);try{await navigator.clipboard.writeText(v);$('summary').textContent+=' — تم النسخ'}catch{$('report').textContent=v;$('report').select?.()}});
})();
