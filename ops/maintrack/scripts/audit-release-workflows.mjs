// MainTrack read-only CI scanner. Detects unreviewed write-capable workflows
// or signing-key exposure; DOES NOT enforce settings in historical branches.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'../../..');
const conf=JSON.parse(fs.readFileSync(path.join(root,'ops/maintrack/security/release-surface-register.json'),'utf8'));
const folder=path.join(root,'.github/workflows');
const files=fs.readdirSync(folder).filter(n=>/\.ya?ml$/.test(n)).sort();
const riskWrite=[],riskSign=[],riskPublish=[];
const read=file=>fs.readFileSync(path.join(folder,file),'utf8');
const trim=(arr)=>arr.sort();
for(const file of files){
 const src=read(file);
 if(/^\s*contents:\s*write\s*(?:#.*)?$/m.test(src))riskWrite.push(file);
 if(/\$\{\{\s*secrets\.(?:MT_ANDROID_KEYSTORE_BASE64|MT_ANDROID_KEYSTORE_PASSWORD|MT_ANDROID_KEY_ALIAS|MT_ANDROID_KEY_PASSWORD|MT_OTA_PRIVATE_KEY_PEM|MT_OTA_PRIVATE_KEY_PASSWORD)\s*\}\}/.test(src))riskSign.push(file);
 if(/\b(?:publish-owner-ota|publish-stage22-044-owner-lab|publish-signed-ota|git\s+push|gh\s+api\b|vercel\s+deploy|supabase\s+functions\s+deploy)\b/i.test(src))riskPublish.push(file);
}
assert.equal(conf.schema,1);
assert.equal(conf.policy,'STAGING_ONLY_NO_AUTOMATIC_PUBLISH');
assert.equal(conf.securityBaseline.employeeReleaseAuthorized,false);
assert.equal(conf.securityBaseline.stagingDatabaseWriteAuthorized,false);
assert.deepEqual(trim(riskWrite),trim([...conf.knownWriteWorkflows]),'UNREVIEWED_WORKFLOW_CONTENTS_WRITE_DRIFT');
assert.deepEqual(trim(riskSign),trim([...conf.knownSigningWorkflows]),'UNREVIEWED_WORKFLOW_SIGNING_SECRET_DRIFT');
const qa=read('maintrack-change-qa.yml');
assert(/permissions:\s*\n\s*contents:\s*read/.test(qa),'QA_MUST_USE_READ_ONLY_PERMISSIONS');
assert(!/contents:\s*write/.test(qa),'QA_MUST_NOT_WRITE_REPOSITORY');
assert(!/\$\{\{\s*secrets\./.test(qa),'UNTRUSTED_PR_QA_MUST_NOT_EXPOSE_SECRETS');
assert(!/^\s*environment:\s*maintrack-android-release/m.test(qa),'QA_MUST_NOT_USE_RELEASE_ENVIRONMENT');
assert(qa.includes('overall-qa:') && qa.includes("test \"$UNIT\" = success")
  && qa.includes("test \"$BROWSER\" = success") && qa.includes("test \"$API\" = success"),
  'MISSING_FAIL_CLOSED_COMBINED_QA_RESULT');
const enforcedPath='ops/maintrack/employee-release-gates.json';
const employee=JSON.parse(fs.readFileSync(path.join(root,enforcedPath),'utf8'));
assert.equal(employee.state,'PRELAUNCH_BLOCKED','USER_HAS_NOT_AUTHORIZED_EMPLOYEE_ROLLOUT');
assert.equal(employee.employeeRollout,'DENY_UNTIL_ALL_GATES_INDEPENDENTLY_VERIFIED');
assert.equal(employee.approvedArchitecture.productionWebDeploymentAllowed,false);
assert.equal(employee.approvedArchitecture.employeeAndroidApkReleaseAllowed,false);
const result={
  schema:1,commit:process.env.GITHUB_SHA||null,mode:'READ_ONLY_SECURITY_AUDIT',
  totalWorkflows:files.length,declaredLegacyWriteWorkflows:riskWrite,
  declaredLegacySigningWorkflows:riskSign,potentialPublishWorkflows:riskPublish,
  rulesetsStatus:'NOT_VERIFIED_ENFORCED',employeeReleaseAllowed:false,
  complete:false,reason:'Legacy workflows on other branches and missing GitHub Ruleset/environment restrictions are not enforced by this source-only CI check.'
};
console.log('PASS: no NEW repository-write or signing secret workflows beyond explicitly audited historical paths');
console.log('PASS: MainTrack Change QA still read-only, fail-closed and cannot access release secrets');
console.log('BLOCKED: historical signing/publishing branches remain until GitHub administrator installs Ruleset + environment restrictions');
console.log('Security inventory:',JSON.stringify(result));
if(process.env.GITHUB_STEP_SUMMARY){
 fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,[
  '## MainTrack Security Surface — Read-only Audit','',
  'All QA release checks are source-level safeguards; historical GitHub workflows still require admin controls.',
  '',
  '| Finding | Count |','|---|---:|',
  '| Workflow YAMLs | '+files.length+' |',
  '| Existing repository-write workflows | '+riskWrite.length+' |',
  '| Existing signing-secret workflows | '+riskSign.length+' |',
  '| Release rulesets verified active | NO |',
  '',
  '**Final security authorization: BLOCKED pending owner/admin rule enforcement.**',
  ''
 ].join('\n'));
}
