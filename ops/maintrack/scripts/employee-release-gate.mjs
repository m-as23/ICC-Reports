// MainTrack read-only employee release gate. No credentials, deploys or database mutations.
// "Audit succeeded" MUST NOT be interpreted as permission to publish.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'../../..');
const read=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const gates=read('ops/maintrack/employee-release-gates.json');
const registry=read('ops/maintrack/runtime-registry-0.4.4.json');
const trusted=read('android/maintrack-app/release/owner-public.json');
const required=[
 'isolated-production-database','restorable-database-backup',
 'production-api-32-actions-rbac','stable-web-domain-and-versioned-deploy',
 'signed-installable-apk-cert-version','existing-app-upgrade-keeps-login',
 'offline-reports-and-local-data-preserved','owner-engineer-technician-regression',
 'verified-web-ota-native-rollback','owner-acceptance-and-canary'
];
const check=(condition,message)=>assert.ok(condition,message);
const sha=/^[a-f0-9]{64}$/;
const baseline=gates.currentBaseline;

assert.equal(gates.schema,1,'UNEXPECTED_POLICY_SCHEMA');
assert.equal(gates.name,'MainTrack Employee Release Safety Gate');
assert.equal(gates.state,'PRELAUNCH_BLOCKED','POLICY_REQUIRES_EXPLICIT_REVIEW');
assert.equal(baseline.branch,registry.repository.frozenBaselineBranch,'BASELINE_BRANCH_DRIFT');
assert.equal(baseline.commit,registry.repository.frozenBaselineCommit,'BASELINE_SHA_DRIFT');
assert.equal(baseline.appId,registry.android.appId,'APP_ID_DRIFT');
assert.equal(baseline.installedNativeVersion,'0.4.1','NATIVE_INSTALLED_VERSION_DRIFT');
assert.equal(baseline.installedNativeVersionCode,401,'NATIVE_INSTALLED_VERSIONCODE_DRIFT');
check(sha.test(baseline.installedAndroidCertificateSha256),'INVALID_ANDROID_CERT_SHA256');
assert.equal(baseline.installedAndroidCertificateSha256,
 '07a35f17c9a7a17b24b1867e839fab2043d83f998bb604701776f3f64c807d5b',
 'ANDROID_SIGNING_CERT_MISMATCH');
assert.equal(baseline.ownerVerifiedOtaVersion,registry.android.version,'OTA_VERSION_DRIFT');
assert.equal(baseline.ownerOtaChannel,registry.android.channel,'OTA_CHANNEL_DRIFT');
assert.equal(registry.android.localData.reportQueue,1,'REPORT_QUEUE_CONTRACT_DRIFT');
assert.equal(registry.android.localData.writesReportQueue,1,'REPORT_WRITE_CONTRACT_DRIFT');
assert.equal(registry.android.localData.migration,'none','UNAPPROVED_LOCAL_STORAGE_MIGRATION');
assert.equal(trusted.channel,'lab','OTA_CHANNEL_UNEXPECTEDLY_PROMOTED');
assert.equal(trusted.manifestUrl,registry.android.signedManifest,'OTA_TRUST_ROOT_DRIFT');

assert.equal(gates.approvedArchitecture.canonicalSource,'web/maintrack/public/');
assert.equal(gates.approvedArchitecture.androidSource,'android/maintrack-app/');
assert.equal(gates.approvedArchitecture.productionWebProject,registry.web.production.name);
assert.equal(gates.approvedArchitecture.productionWebDeploymentAllowed,false,'UNREVIEWED_WEB_PUBLISH');
assert.equal(gates.approvedArchitecture.employeeAndroidApkReleaseAllowed,false,'UNREVIEWED_APK_PUBLISH');
assert.equal(gates.approvedArchitecture.stagingDatabaseDestructiveChangesAllowed,false,'DANGEROUS_STAGING_WRITE');
assert.equal(gates.employeeRollout,'DENY_UNTIL_ALL_GATES_INDEPENDENTLY_VERIFIED');
check(gates.updateRouting.nativeAndroidChanges.includes('versionCode > 401'),
 'NATIVE_UPGRADE_VERSION_GATE_MISSING');
check(gates.updateRouting.expiryAndKeys.includes('does not substitute'),
 'APK_AND_OTA_KEYS_MUST_BE_SEPARATE');

const nativePlugin=fs.readFileSync(path.join(root,'android/maintrack-app/native/MainTrackSecureSessionPlugin.java'),'utf8');
const harden=fs.readFileSync(path.join(root,'android/maintrack-app/scripts/harden-native.mjs'),'utf8');
check(nativePlugin.includes('AndroidKeyStore') && nativePlugin.includes('AES/GCM/NoPadding'),
 'SECURE_NATIVE_SESSION_NOT_IMPLEMENTED_IN_SOURCE');
check(harden.includes('registerPlugin(MainTrackSecureSessionPlugin.class)'),
 'NATIVE_SESSION_NOT_REGISTERED_DURING_BUILD');

check(Array.isArray(gates.mandatoryGates),'INVALID_RELEASE_GATES');
assert.deepEqual(gates.mandatoryGates.map(x=>x.id).sort(),[...required].sort(),
 'MANDATORY_RELEASE_GATES_MISSING_OR_DUPLICATE');
for(const g of gates.mandatoryGates){
 check(['pending','verified'].includes(g.status),'INVALID_GATE_STATE_'+g.id);
 if(g.status==='verified') check(typeof g.evidence==='string'
   && /^https:\/\/github\.com\/m-as23\/ICC-Reports\/actions\/runs\/[0-9]+$/.test(g.evidence),
   'GATE_EVIDENCE_REFERENCE_REQUIRED_'+g.id);
 else assert.equal(g.evidence,null,'PENDING_GATE_CANNOT_HAVE_RELEASE_EVIDENCE_'+g.id);
}

const blocked=[];
for(const g of gates.mandatoryGates)if(g.status!=='verified')blocked.push(g.id);
if(registry.phase!=='PRODUCTION_LIVE_VERIFIED')blocked.push('production-not-live');
if(registry.web.production.status!=='LIVE_VERIFIED' || !registry.web.production.deployment
   || !registry.web.production.stableDomain)blocked.push('web-prod-not-verified');
if(!registry.backend.production?.projectId || !registry.database.production?.projectId)
 blocked.push('isolated-production-api-and-database-missing');
if(!gates.approvedArchitecture.productionWebDeploymentAllowed
   || !gates.approvedArchitecture.employeeAndroidApkReleaseAllowed)blocked.push('owner-release-switches-off');

console.log('MainTrack employee release audit: source='+baseline.commit);
console.log('Installed native identity: '+baseline.appId+' / code='+baseline.installedNativeVersionCode);
console.log('Android certificate fingerprint frozen; OTA signing trust root checked separately.');
if(blocked.length){
 console.log('EMPLOYEE_ROLLOUT_BLOCKED: '+blocked.join(', '));
}else{
 // Structural readiness is NOT enough. A future trusted CI release workflow
 // must independently verify the evidence and owner approval before publish.
 console.log('STRUCTURAL_GATES_ONLY: external verification and explicit owner approval still required');
}
const mode=process.argv[2]||'--audit';
check(['--audit','--assert-blocked','--enforce-production'].includes(mode),'INVALID_COMMAND');
if(mode==='--assert-blocked')check(blocked.length>0,'UNEXPECTED_PRODUCTION_ELIGIBILITY');
if(mode==='--enforce-production'){
 // This checker intentionally never authorizes publishing: staged claims in a
 // JSON file are not cryptographic or live-environment verification.
 console.error('DENIED: only a future verified release workflow may publish employee builds.');
 process.exitCode=2;
}
