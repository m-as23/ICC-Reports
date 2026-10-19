import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {configFromEnv,runReadOnlyRbac,QA_API,STAGING_PROJECT_REF,OPT_IN}
  from '../scripts/qa-authenticated-rbac-readonly.mjs';

const values={
  MAINTRACK_RBAC_QA_PROJECT_REF:STAGING_PROJECT_REF,
  MAINTRACK_RBAC_QA_CONFIRMATION:OPT_IN,
  MAINTRACK_RBAC_QA_OWNER_TOKEN:'a'.repeat(64),
  MAINTRACK_RBAC_QA_ENGINEER_TOKEN:'b'.repeat(64),
  MAINTRACK_RBAC_QA_TECHNICIAN_TOKEN:'c'.repeat(64)
};
function mockApi({unexpectedAllow=false,wrongIdentity=false}={}){
  const events=[],accounts=Object.fromEntries([
    ['a'.repeat(64),'owner'],['b'.repeat(64),'engineer'],['c'.repeat(64),'technician']]);
  return {events,request:async(url,options)=>{
    assert.equal(url,QA_API,'test must never target arbitrary backends');
    assert.equal(options.method,'POST');
    assert.equal(options.redirect,'error');
    const token=options.headers.Authorization.replace('Bearer ','');
    const role=accounts[token];
    assert.ok(role);
    const b=JSON.parse(options.body);
    events.push({role,action:b.action,body:b});
    const ownerOnly=['adminCatalog','adminUsers','leaveInbox','overtimeInbox','cmms'];
    const denied=ownerOnly.includes(b.action)&&role!=='owner'&&!unexpectedAllow;
    let data;
    if(b.action==='session')data={ok:true,role};
    else if(b.action==='profile')data={profile:{code:wrongIdentity?'NOT_A_QA_USER':'QA_RBAC_'+role.toUpperCase(),role}};
    else if(denied)data={error:'FORBIDDEN'};
    else data={items:[]};
    return new Response(JSON.stringify(data),{status:denied?403:200,headers:{'Content-Type':'application/json'}});
  }};
}
test('configuration refuses non-staging projects, missing consent and reused tokens',()=>{
  assert.throws(()=>configFromEnv({...values,MAINTRACK_RBAC_QA_PROJECT_REF:'other-project'}));
  assert.throws(()=>configFromEnv({...values,MAINTRACK_RBAC_QA_CONFIRMATION:''}));
  assert.throws(()=>configFromEnv({...values,MAINTRACK_RBAC_QA_OWNER_TOKEN:''}));
  assert.throws(()=>configFromEnv({...values,MAINTRACK_RBAC_QA_OWNER_TOKEN:'b'.repeat(64)}));
});
test('18 authenticated synthetic role probes contain only safe read operations',async()=>{
  const m=mockApi();
  const summary=await runReadOnlyRbac(configFromEnv(values),{request:m.request});
  assert.deepEqual(summary,{status:'PASS',checks:18,roles:3,
    unauthorizedBlocks:10,ownerReadChecks:2,safeOnly:true,project:'MainTrack-Staging'});
  assert.equal(m.events.length,18);
  assert.ok(m.events.every(e=>!['login','submit','leaveDecision','overtimeDecision',
    'adminSaveUser','adminCatalogSave','cmmsWrite','change','leaveRequest'].includes(e.action)));
  assert.deepEqual(m.events.filter(e=>e.role==='owner').map(e=>e.action),
    ['session','profile','adminCatalog','cmms']);
  assert.ok(m.events.filter(e=>e.action==='cmms').every(e=>e.body.mode==='machines'));
  assert.ok(m.events.filter(e=>e.action==='adminCatalog').every(e=>e.body.kind==='sections'));
});
test('privilege escalation causes hard failure',async()=>{
  const m=mockApi({unexpectedAllow:true});
  await assert.rejects(runReadOnlyRbac(configFromEnv(values),{request:m.request}),
    /RBAC_EXPECTED_403/);
});
test('identity mismatch stops before any privileged query',async()=>{
  const m=mockApi({wrongIdentity:true});
  await assert.rejects(runReadOnlyRbac(configFromEnv(values),{request:m.request}),
    /NON_QA_IDENTITY_BLOCKED/);
  assert.deepEqual(m.events.map(e=>e.action),['session','profile']);
});
test('repo backend source declares role boundaries and guards read endpoints',()=>{
  const s=fs.readFileSync(path.resolve(import.meta.dirname,
    '../../../supabase/functions/maintrack-stage9-security-api/index.ts'),'utf8');
  assert.match(s,/const rights=\{owner:\[/);
  assert.match(s,/engineer:\['profile\.view','profile\.update','dashboard\.view','report\.create','leave\.request'\]/);
  assert.match(s,/technician:\['profile\.view','profile\.update','dashboard\.view','report\.create','leave\.request'\]/);
  assert.match(s,/const permit=\(u,p\)=>/);
  assert.match(s,/async function cmms\(u,b\)\{\s*permit\(u,'users\.manage'\)/);
  assert.match(s,/async function catalogAdmin\(u,b\)\{\s*permit\(u,'users\.manage'\)/);
  assert.match(s,/case 'leaveInbox':\{permit\(u,'leave\.approve'\)/);
  assert.match(s,/case 'overtimeInbox':\{permit\(u,'leave\.approve'\)/);
  assert.match(s,/case 'adminUsers':\{\s*permit\(u,'users\.manage'\)/);
});
