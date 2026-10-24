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
// Explicitly reviewed new Owner-only QA signer: signing secrets are restricted
// to the exact protected ops branch/environment. No repository write or rollout.
const signer=read('maintrack-owner-qa-apk-045.yml');
assert.equal(conf.ownerApprovedQASigningWorkflow?.path,
 '.github/workflows/maintrack-owner-qa-apk-045.yml',
 'UNREGISTERED_OWNER_QA_SIGNER');
assert(signer.includes('branches: [ops/maintrack-044-production-foundation-20261018]') &&
 signer.includes("      - '.github/workflows/maintrack-owner-qa-apk-045.yml'") &&
 signer.includes('environment: maintrack-android-release'),
 'OWNER_SIGNER_BRANCH_ENVIRONMENT_GATE_MISSING');
assert(/permissions:\s*\n\s*contents:\s*read\s*\n\s*checks:\s*read/.test(signer) &&
 !/contents:\s*write/.test(signer),
 'OWNER_SIGNER_MUST_NOT_HAVE_REPOSITORY_WRITE_ACCESS');
assert(signer.includes('node ../../ops/maintrack/scripts/employee-release-gate.mjs --assert-blocked') &&
 signer.includes('native-release-floor.mjs --candidate') &&
 signer.includes('verify-native-405-build.py --mode candidate') &&
 signer.includes('--mode signed') &&
 signer.includes('MainTrack-0.4.5-405-SIGNED-OWNER-QA-NOT-FOR-EMPLOYEES'),
 'OWNER_SIGNER_RELEASE_CHECKS_INCOMPLETE');
assert(!/(?:gh release create|vercel deploy|supabase functions deploy|git push)/.test(signer),
 'OWNER_SIGNER_MUST_NOT_PUBLISH');
// Next signed owner-only UI correction is isolated from the 0.4.5 signer.
const signer046=read('maintrack-owner-qa-apk-046.yml');
assert.equal(conf.ownerApprovedNextQASigningWorkflow?.path,
 '.github/workflows/maintrack-owner-qa-apk-046.yml','UNREGISTERED_046_SIGNER');
assert(signer046.includes('branches: [ops/maintrack-044-production-foundation-20261018]') &&
 signer046.includes("      - '.github/workflows/maintrack-owner-qa-apk-046.yml'") &&
 signer046.includes('environment: maintrack-android-release'),
 'OWNER_046_SIGNER_BRANCH_ENVIRONMENT_GATE_MISSING');
assert(/permissions:\s*\n\s*contents:\s*read\s*\n\s*checks:\s*read/.test(signer046) &&
 !/contents:\s*write/.test(signer046),
 'OWNER_046_SIGNER_MUST_BE_READ_ONLY');
assert(signer046.includes('employee-release-gate.mjs --assert-blocked') &&
 signer046.includes('native-release-floor.mjs --candidate') &&
 signer046.includes('verify-native-406-build.py') &&
 signer046.includes('MainTrack-0.4.6-406-SIGNED-OWNER-QA-NOT-FOR-EMPLOYEES') &&
 signer046.includes('MainTrack Staging-only QA — required combined result'),
 'OWNER_046_SIGNER_RELEASE_PROOFS_INCOMPLETE');
assert(!/(?:gh release create|vercel deploy|supabase functions deploy|git push)/.test(signer046),
 'OWNER_046_SIGNER_MUST_NOT_PUBLISH');
const qa=read('maintrack-change-qa.yml');
// Owner authorized preparing 047 Final. This new signer may only produce artifacts;
// it cannot deploy/reset services or bypass the protected signing environment.
const finalSigner=read('maintrack-final-apk-047.yml');
assert.equal(conf.ownerApproved047FinalSigningWorkflow?.sourceBranch,'release/maintrack-047-final-20261024');
assert(finalSigner.includes('branches: [release/maintrack-047-final-20261024]') &&
 finalSigner.includes("github.ref == 'refs/heads/release/maintrack-047-final-20261024'") &&
 finalSigner.includes('environment: maintrack-android-release'),'047_FINAL_BRANCH_ENVIRONMENT_REQUIRED');
assert(/permissions:\s*\n\s*contents:\s*read\s*\n\s*checks:\s*read/.test(finalSigner) && !/contents:\s*write/.test(finalSigner),'047_FINAL_READ_ONLY_REQUIRED');
assert(finalSigner.includes('prepare-final-047.mjs --verify') &&
 finalSigner.includes('verify-native-final-407-build.py --mode signed') &&
 finalSigner.includes('Actual candidate Chromium — cache, account isolation, numerals') &&
 finalSigner.includes('MainTrack Staging-only QA — required combined result'),'047_FINAL_PROOFS_REQUIRED');
assert(!/(?:gh release create|vercel deploy|supabase functions deploy|git push)/.test(finalSigner),'047_FINAL_ARTIFACT_ONLY_REQUIRED');
// Owner explicitly requested an installable 047 preview and matching Web.
const signer047=read('maintrack-owner-qa-apk-047.yml');
assert.equal(conf.ownerApproved047PreviewSigningWorkflow?.sourceBranch,'feature/maintrack-047-integration-20261022','047_PREVIEW_BRANCH_NOT_REGISTERED');
assert(signer047.includes('branches: [feature/maintrack-047-integration-20261022]') &&
 signer047.includes("github.ref == 'refs/heads/feature/maintrack-047-integration-20261022'") &&
 signer047.includes('environment: maintrack-android-release'),'047_PREVIEW_BRANCH_ENVIRONMENT_REQUIRED');
assert(/permissions:\s*\n\s*contents:\s*read\s*\n\s*checks:\s*read/.test(signer047) && !/contents:\s*write/.test(signer047),'047_SIGNER_READ_ONLY_REQUIRED');
assert(signer047.includes('MainTrack Staging-only QA — required combined result') &&
 signer047.includes('verify-native-407-build.py --mode signed') &&
 signer047.includes('MainTrack-0.4.7-407-SIGNED-OWNER-PREVIEW'),'047_SIGNER_PROOFS_REQUIRED');
assert(!/(?:gh release create|vercel deploy|supabase functions deploy|git push)/.test(signer047),'047_NO_AUTOMATIC_ROLLOUT');
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
