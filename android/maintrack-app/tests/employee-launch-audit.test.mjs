import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {auditLaunch,actualAudit} from '../../../ops/maintrack/scripts/employee-launch-readiness-audit.mjs';
const root=path.resolve(import.meta.dirname,'../../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const j=p=>JSON.parse(read(p));
const base=()=>({
 html:read('web/maintrack/public/index.html'),
 css:read('web/maintrack/public/v6-core.css'),
 uiJs:read('web/maintrack/public/secure-assets/index-inline-1.js'),
 backend:read('supabase/functions/maintrack-stage9-security-api/index.ts'),
 workflow:read('.github/workflows/maintrack-change-qa.yml'),
 release:j('ops/maintrack/employee-release-gates.json'),
 contract:j('ops/maintrack/production-api-contract.json')
});
test('read-only audit detects residual Pilot labels, legacy Web API, and missing main trigger',()=>{
 const a=actualAudit();
 assert.equal(a.decision,'NO_GO_RELEASE');
 const blocked=new Set(a.releaseBlockers.map(c=>c.id));
 for(const required of ['page-title-pilot','login-showcase-pilot','login-placeholder-pilot',
 'source-filter-trial-text','canonical-web-32-action-api','qa-on-main-branch','all-employee-release-checks'])
   assert.ok(blocked.has(required),'MISSING_LAUNCH_BLOCKER:'+required);
 assert.equal(a.checks.find(c=>c.id==='source-api-32').pass,true);
 assert.equal(a.checks.find(c=>c.id==='qa-on-feature-and-ops').pass,true);
 assert.equal(a.safeReadOnly,true);
});
test('offline text-only candidate cleanup still cannot bypass protected release gates',()=>{
 const o=base();
 o.html=o.html.replace('MainTrack Pilot •','MainTrack •')
 .replace('MAINTENANCE MADE SIMPLE · PILOT','MAINTENANCE MADE SIMPLE')
 .replace('مثال: PILOT01','مثال: EMP001')
 .replace('البلاغات التجريبية','بلاغات المرحلة السابقة');
 const a=auditLaunch(o);
 assert.ok(a.checks.filter(x=>x.id.includes('pilot')||x.id==='source-filter-trial-text').every(x=>x.pass));
 assert.equal(a.decision,'NO_GO_RELEASE');
 assert.ok(a.releaseBlockers.some(x=>x.id==='canonical-web-32-action-api'));
 assert.ok(a.releaseBlockers.some(x=>x.id==='all-employee-release-checks'));
});
test('removing one API dispatch action triggers source compatibility failure',()=>{
 const o=base();
 o.backend=o.backend.replace("case 'overtimeInbox':","case 'overtimeInbox_DISABLED':");
 const a=auditLaunch(o);
 assert.equal(a.checks.find(x=>x.id==='source-api-32').pass,false);
});
test('workflow branch coverage reports main separately from protected ops',()=>{
 const o=base();
 let a=auditLaunch(o);
 assert.equal(a.checks.find(x=>x.id==='qa-on-main-branch').pass,false);
 o.workflow=o.workflow.replace("      - 'feature/**'","      - 'feature/**'\n      - main");
 a=auditLaunch(o);
 assert.equal(a.checks.find(x=>x.id==='qa-on-main-branch').pass,true);
 assert.equal(a.decision,'NO_GO_RELEASE');
});
