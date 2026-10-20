// Live integration smoke: dedicated isolated QA project; no auth tokens, logins,
// employee records, report creation, approvals, deployments or database writes.
// Every rejected action is checked before it can reach its DB handler.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'../../..');
const contract=JSON.parse(fs.readFileSync(path.join(root,'ops/maintrack/production-api-contract.json'),'utf8'));
const project='szhstrafzkxzstjdcynl';
const api='https://'+project+'.supabase.co/functions/v1/maintrack-rbac-readonly-qa';
const allowed=new Set(['session','profile','adminCatalog','adminUsers','leaveInbox','overtimeInbox','cmms']);
let assertions=0;
async function call(url,init={}){
 const res=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});
 assert.equal(res.headers.get('x-content-type-options'),'nosniff','Must protect browser against MIME sniffing');
 const body=await res.json();
 return {status:res.status,body,headers:res.headers};
}
const check=(ok,label)=>{assert.ok(ok,label);assertions++;console.log('PASS '+label)};
const health=await call(api+'/healthz');
check(health.status===200&&health.body.status==='up','isolated Edge health');
const ready=await call(api+'/readyz');
check(ready.status===200&&ready.body.status==='ready'
 &&JSON.stringify(ready.body.migrations)==='["20261020"]','isolated DB marker');
const unknownOrigin=await call(api+'/healthz',{headers:{Origin:'https://untrusted.invalid'}});
check(unknownOrigin.status===403&&unknownOrigin.body.error==='ORIGIN_FORBIDDEN'
 &&unknownOrigin.headers.get('access-control-allow-origin')===null,'untrusted browser Origin denied');
const browserOptions=await call(api+'/api',{method:'OPTIONS',headers:{Origin:'https://untrusted.invalid'}});
check(browserOptions.status===403,'untrusted preflight blocked');
const sameCodeBefore=new Set(contract.requiredActions);
check(contract.requiredActions.length===32&&sameCodeBefore.size===32,'32 unique API operations');
for(const action of contract.requiredActions){
 const b={action};
 if(action==='adminCatalog')b.kind='sections';
 if(action==='cmms')b.mode='machines';
 const res=await call(api+'/api',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify(b)});
 const expected=allowed.has(action)?401:403;
 const error=allowed.has(action)?'AUTH':'QA_ACTION_DISABLED';
 check(res.status===expected&&res.body.error===error,
  action+' is securely rejected for unauthenticated callers');
}
const nonQa=await call(api+'/api',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({action:'login',code:'PILOT01',pw:'not-a-real-password'})});
check(nonQa.status===403&&nonQa.body.error==='QA_ONLY',
 'non-synthetic account login is blocked BEFORE authentication');
const badJwt=await call(api+'/api',{method:'POST',headers:{
 'content-type':'application/json',Authorization:'Bearer '+'a'.repeat(64)
},body:JSON.stringify({action:'session'})});
check(badJwt.status===401&&badJwt.body.error==='AUTH','forged bearer session cannot authorize');
console.log('MAINTRACK_ISOLATED_API_LIVE_DENY_SMOKE_PASS checks='+assertions);
