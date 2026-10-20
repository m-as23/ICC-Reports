// MainTrack employee-launch readiness audit. Read-only and deterministic.
 // This is separate from functional QA. Passing Node/Chromium tests never implies release approval.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(import.meta.dirname,'../../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
export function auditLaunch({html,css,uiJs,backend,workflow,release,contract}){
 const cases=[];
 const push=(id,pass,detail,phase='release')=>cases.push({id,pass:Boolean(pass),detail,phase});
 const visualMarkers=[
  ['page-title-pilot',/<title>[^<]*\bPilot\b/i.test(html)],
  ['login-showcase-pilot',/MAINTENANCE MADE SIMPLE\s*·\s*PILOT/i.test(html)],
  ['login-placeholder-pilot',/placeholder="[^"]*PILOT\d+/i.test(html)],
  ['source-filter-trial-text',/البلاغات التجريبية/.test(html)]
 ];
 for(const [id,present] of visualMarkers)push(id,!present,present?'visible historical/pilot text remains in canonical HTML':'clear');
 const sidebar=html.includes('id="tabs"')&&css.includes('body.v6On #tabs')&&
    css.includes('@media(max-width:960px)')&&css.includes('body.v6On.v6Drawer #tabs');
 push('sidebar-source-contract',sidebar,'Static source only; mobile browser layout and unsaved-form navigation require final device/browser acceptance','qa');
 const got=[...new Set([...backend.matchAll(/case\s+'([A-Za-z][A-Za-z0-9_]*)'\s*:/g)].map(m=>m[1]))];
 push('source-api-32',got.length===32&&got.every(a=>contract.requiredActions.includes(a)),
      'Versioned backend source must include all 32 required actions','qa');
 const legacy=uiJs.includes('/maintrack-stage9-security-api/api');
 push('canonical-web-32-action-api',!legacy&&uiJs.includes('/maintrack-unified-four-qa/api'),
      legacy?'Canonical Web still targets deployed legacy 26-action Stage9 API':'Canonical URL has changed; still requires live endpoint validation');
 const workflowTargetsOps=workflow.includes('ops/maintrack-044-production-foundation-20261018')&&
    workflow.includes("'fix/**'")&&workflow.includes("'feature/**'");
 push('qa-on-feature-and-ops',workflowTargetsOps,'Pushes on fix/**, feature/**, ops trigger QA; protected ops has required combined status','qa');
 // main is not under this QA workflow. Must be separately protected before treating all future updates as automatically covered.
 const mainCovered=/^\s*-\s*main\s*$/m.test(workflow);
 push('qa-on-main-branch',mainCovered,'main direct pushes/PRs are not presently handled by this workflow');
 push('all-employee-release-checks',release.state!=='PRELAUNCH_BLOCKED'&&
     release.mandatoryGates.every(x=>x.status==='passed'),
     'Ten formal release gates must be independently completed, not manually bypassed');
 push('production-api-cutover',contract.state!=='PRELAUNCH_NO_PRODUCTION_API'&&contract.webSource.productionReady,
     '32-action Production backend independently verified, or explicitly approved restricted-pilot path');
 return {schema:1,kind:'MAINTRACK_LAUNCH_READINESS_AUDIT',safeReadOnly:true,
   decision:cases.every(x=>x.pass)?'READY_FOR_OWNER_RELEASE_REVIEW':'NO_GO_RELEASE',
   functionalSourceChecks:cases.filter(x=>x.phase==='qa'),
   releaseBlockers:cases.filter(x=>x.phase==='release'&&!x.pass),
   checks:cases};
}
export function actualAudit(){
 return auditLaunch({html:read('web/maintrack/public/index.html'),
  css:read('web/maintrack/public/v6-core.css'),
  uiJs:read('web/maintrack/public/secure-assets/index-inline-1.js'),
  backend:read('supabase/functions/maintrack-stage9-security-api/index.ts'),
  workflow:read('.github/workflows/maintrack-change-qa.yml'),
  release:json('ops/maintrack/employee-release-gates.json'),
  contract:json('ops/maintrack/production-api-contract.json')});
}
const thisFile=fileURLToPath(import.meta.url);
if(process.argv[1]&&path.resolve(process.argv[1])===thisFile){
 const mode=process.argv[2]||'--audit';
 assert.ok(['--audit','--assert-ready'].includes(mode),'INVALID_AUDIT_MODE');
 const result=actualAudit();
 console.log(JSON.stringify(result,null,2));
 if(mode==='--assert-ready'&&result.decision!=='READY_FOR_OWNER_RELEASE_REVIEW'){
  console.error('LAUNCH_BLOCKED: functional QA PASS is insufficient for employee deployment');
  process.exitCode=2;
 }
}
