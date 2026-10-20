import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
 TARGET,notificationCalls,calculateBudget,measuredPollingMs,summarizeCheck,runReadOnlyWatch
} from '../../../ops/maintrack/scripts/continuous-readonly-health.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
test('canonical MainTrack notification polling frequency is explicitly cost-modeled',()=>{
 const js=fs.readFileSync(path.join(root,'web/maintrack/public/secure-assets/index-inline-1.js'),'utf8');
 const ms=measuredPollingMs(js);
 assert.equal(ms,20000,'POLLING_WAS_CHANGED_WITHOUT_REVIEW');
 assert.equal(notificationCalls({active:30,intervalSeconds:20}),950400);
 assert.equal(notificationCalls({active:20,intervalSeconds:20}),633600);
 assert.equal(notificationCalls({active:30,intervalSeconds:60}),316800);
 assert.equal(calculateBudget({active:20,intervalSeconds:20}).exceedsReserved,true);
 assert.equal(calculateBudget({active:30,intervalSeconds:60}).exceedsReserved,false);
});
test('monitor makes four GET-only calls against two exact project allowlisted health/readiness paths',async()=>{
 const urls=[];
 const result=await runReadOnlyWatch({request:async(url,opts)=>{
  urls.push(url);
  assert.equal(opts.method,'GET');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.headers.Accept,'application/json');
  assert.ok(url.startsWith(TARGET.staging)||url.startsWith(TARGET.isolated));
  return {status:200,json:async()=>({status:url.endsWith('healthz')?'up':'ready'})};
 }});
 assert.equal(result.status,'PASS');
 assert.equal(result.checks,4);
 assert.equal(result.realAuthenticatedUserWorkflowsTested,false);
 assert.equal(result.readsRealEmployeeRecords,false);
 assert.equal(new Set(urls).size,4);
});
test('monitor reports 503 or invalid responses as failure without hiding them',async()=>{
 const result=await runReadOnlyWatch({request:async(url)=>({
   status:url.endsWith('readyz')?503:200,
   json:async()=>({status:url.endsWith('readyz')?'unavailable':'up'})
 })});
 assert.equal(result.status,'FAIL');
 assert.equal(result.observations.filter(x=>!x.ok).length,2);
});
test('remote monitor cannot be tricked into probing an arbitrary endpoint',async()=>{
 await assert.rejects(()=>runReadOnlyWatch({targets:{unknown:'https://example.com'}}),/UNAPPROVED_REMOTE_TARGET/);
});
test('health check status has to match route, not just any HTTP 200',()=>{
 assert.equal(summarizeCheck({name:'staging/healthz',status:200,ms:20,body:{status:'ready'}}).ok,false);
 assert.equal(summarizeCheck({name:'staging/readyz',status:200,ms:20,body:{status:'ready'}}).ok,true);
});
