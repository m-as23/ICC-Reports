// Always produces a machine-readable QA gate summary, even if an earlier step fails.
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('qa-results');
fs.mkdirSync(root,{recursive:true});
const steps=[
  ['Source and unit tests',process.env.QA_UNIT_OUTCOME],
  ['Playwright browser acceptance',process.env.QA_BROWSER_OUTCOME],
  ['Live QA API (read-only)',process.env.QA_API_OUTCOME],
  ['Android Debug APK compilation',process.env.QA_ANDROID_OUTCOME],
  ['APK identity and cross-channel integrity',process.env.QA_PACKAGE_OUTCOME],
];
const allowed=new Set(['success','failure','skipped','cancelled']);
for(const [name,outcome] of steps){
  if(!allowed.has(outcome))throw new Error(`Missing or unexpected QA outcome for ${name}: ${outcome}`);
}
const allPass=steps.every(([,outcome])=>outcome==='success');
const sha=process.env.GITHUB_SHA||'local';
const runId=process.env.GITHUB_RUN_ID||'';
const report={
  schema:1,project:'MainTrack',channel:'qa-only',production:false,otaPublished:false,
  sourceCommit:sha,workflowRunId:runId,status:allPass?'PASS':'FAIL',
  generatedAt:new Date().toISOString(),
  liveApiScope:'health, readiness, CORS and missing-session rejection; no writes',
  browserScope:'synthetic backend; no real employee accounts or database writes',
  androidScope:'Debug APK build + static/signature verification; NOT emulator or in-place OTA validation',
  androidInstallUpgradeCompatible:false,
  steps:steps.map(([name,outcome])=>({name,outcome})),
};
fs.writeFileSync(path.join(root,'qa-summary.json'),JSON.stringify(report,null,2)+'\n');
const mark=x=>x==='success'?'PASS':x.toUpperCase();
const markdown=[
  '## MainTrack Stage22 QA — '+report.status,
  '',
  '| Check | Result |','|---|---|',
  ...steps.map(([name,outcome])=>`| ${name} | ${mark(outcome)} |`),
  '',
  'Source commit: `'+sha+'`',
  '',
  '**Scope:** QA branch only. Browser accounts are synthetic; live API checks are read-only.',
  '**Android:** Separate Debug QA app; this run does not authorize production OTA or APK replacement.',
  '',
  'Any failed or skipped gate means **no production release approval**.',
  ''
].join('\n');
fs.writeFileSync(path.join(root,'qa-summary.md'),markdown);
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,markdown);
console.log('MAINTRACK_QA_GATE_'+report.status);
