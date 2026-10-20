// MainTrack: bounded READ-ONLY remote health and deterministic capacity budgeting.
// No login, report creation, writing, bearer tokens, user rows or deployment.
// Safe to schedule after review; only GitHub Actions on the default branch schedules runs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const TARGET={
  staging:'https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa',
  isolated:'https://szhstrafzkxzstjdcynl.supabase.co/functions/v1/maintrack-rbac-readonly-qa'
};
export const MODEL={monthlyIncluded:500000,workingDays:22,hoursPerDay:8,budgetFraction:0.7};

export function notificationCalls({active,intervalSeconds,days=22,hours=8}){
  assert.ok(Number.isSafeInteger(active)&&active>=0&&active<=1000,'ACTIVE_COUNT_INVALID');
  assert.ok(Number.isFinite(intervalSeconds)&&intervalSeconds>=10,'POLLING_INTERVAL_INVALID');
  assert.ok(Number.isFinite(days)&&days>=0&&days<=31,'WORKDAYS_INVALID');
  assert.ok(Number.isFinite(hours)&&hours>=0&&hours<=24,'HOURS_INVALID');
  return Math.ceil(active*days*hours*3600/intervalSeconds);
}
export function calculateBudget({intervalSeconds,active=30}={}){
 const calls=notificationCalls({active,intervalSeconds});
 const reserved=Math.floor(MODEL.monthlyIncluded*MODEL.budgetFraction);
 return {active,intervalSeconds,calls,sharedFreeQuota:MODEL.monthlyIncluded,
   notificationAllowance:reserved,marginAfterNotifications:MODEL.monthlyIncluded-calls,
   exceedsReserved: calls>reserved,estimateOnly:true,
   excludes:'all other app actions, QA calls, background traffic and real billing'};
}
export function measuredPollingMs(js){
 const m=js.match(/setInterval\(\(\)=>\{if\(S&&appAuthenticated&&!document.hidden\)loadNotices\(\);\},(\d+)\)/);
 assert.ok(m,'NOTIFICATION_POLLING_RATE_UNVERIFIED');
 return Number(m[1]);
}
export function summarizeCheck({name,status,ms,body}){
 const expected=name.endsWith('/healthz')?'up':'ready';
 return {name,ok:status===200&&body?.status===expected,status,ms,expected};
}
export async function runReadOnlyWatch({request=fetch,targets=TARGET,timeoutMs=8000}={}){
 const report=[];
 for(const [label,base] of Object.entries(targets)){
   // Prevent accidental credentialized or mutating fetch against a redirected endpoint.
   assert.ok(Object.values(TARGET).includes(base),'UNAPPROVED_REMOTE_TARGET');
   for(const endpoint of ['healthz','readyz']){
    const url=base+'/'+endpoint;
    const started=performance.now();
    let record;
    try{
      const res=await request(url,{method:'GET',redirect:'error',cache:'no-store',
        headers:{Accept:'application/json'},signal:AbortSignal.timeout(timeoutMs)});
      const body=await res.json();
      record=summarizeCheck({name:label+'/'+endpoint,status:res.status,
        ms:Math.round(performance.now()-started),body});
    }catch(e){
      record={name:label+'/'+endpoint,ok:false,status:0,
        ms:Math.round(performance.now()-started),
        error:e?.name==='TimeoutError'?'TIMEOUT':'FETCH_OR_JSON_ERROR'};
    }
    report.push(record);
   }
 }
 return {status:report.every(x=>x.ok)?'PASS':'FAIL',
   observations:report,checks:report.length,
   actions:'GET healthz/readyz ONLY',readsRealEmployeeRecords:false,
   realAuthenticatedUserWorkflowsTested:false};
}

function main(){
 const root=path.resolve(import.meta.dirname,'../../..');
 const js=fs.readFileSync(path.join(root,'web/maintrack/public/secure-assets/index-inline-1.js'),'utf8');
 const ms=measuredPollingMs(js);
 const modeled=[5,10,20,30].map(active=>calculateBudget({active,intervalSeconds:ms/1000}));
 console.log(JSON.stringify({pollingMs:ms,capacityBudget:modelledToBudget(modeled)},null,2));
 return runReadOnlyWatch().then(result=>{
  console.log(JSON.stringify(result,null,2));
  if(result.status!=='PASS')process.exitCode=2;
 });
}
function modelledToBudget(rows){return rows;}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))await main();
