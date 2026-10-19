import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {checkNextNativeRelease,verifyApprovedFloor} from '../scripts/native-release-floor.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
const data=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const floor=data('ops/maintrack/security/android-native-release-floor.json');
const baseline=data('ops/maintrack/runtime-registry-0.4.4.json');
const employee=data('ops/maintrack/employee-release-gates.json');
const owner=fs.readFileSync(path.join(root,floor.acceptedOwnerDevice.evidenceDocument),'utf8');
const candidate={appId:'com.icc.maintrack',versionCode:405,versionName:'0.4.5',
 certificateSha256:floor.androidApkSigningCertificateSha256};
const yes=(e={})=>checkNextNativeRelease(candidate,floor,{environmentLastVersionCode:404,...e});

test('accepted Owner 0.4.4 baseline is verified without changing active app or database',()=>{
 assert.equal(verifyApprovedFloor(floor,owner,baseline,employee),true);
});
test('next code 405 with same signer, appId, newer version name and env 404 passes',()=>{
 assert.equal(yes().versionCode,405);
});
test('native versionCode 404 is rejected, even if the versionName changed',()=>{
 assert.throws(()=>checkNextNativeRelease({...candidate,versionCode:404},floor),/ANDROID_VERSION_CODE_NOT_GREATER_THAN_404/);
});
test('native versionCode downgrade to 401 is rejected',()=>{
 assert.throws(()=>checkNextNativeRelease({...candidate,versionCode:401},floor),/ANDROID_VERSION_CODE_NOT_GREATER_THAN_404/);
});
test('same native versionName is rejected to avoid ambiguous on-device updates',()=>{
 assert.throws(()=>checkNextNativeRelease({...candidate,versionName:'0.4.4'},floor),/VERSION_NAME_MUST_INCREASE/);
});
test('older native versionName is rejected',()=>{
 assert.throws(()=>checkNextNativeRelease({...candidate,versionName:'0.4.3'},floor),/VERSION_NAME_MUST_INCREASE/);
});
test('different appId is rejected',()=>{
 assert.throws(()=>checkNextNativeRelease({...candidate,appId:'com.icc.other'},floor),/ANDROID_PACKAGE_CHANGED/);
});
test('changed signing certificate rejected',()=>{
 assert.throws(()=>checkNextNativeRelease({...candidate,certificateSha256:'0'.repeat(64)},floor),/ANDROID_SIGNING_CERT_CHANGED/);
});
test('SHA-256 fingerprint case and colon-separated formatting accepted without changing pinned bytes',()=>{
 const colon=String(candidate.certificateSha256).match(/.{2}/g).join(':').toUpperCase();
 assert.equal(checkNextNativeRelease({...candidate,certificateSha256:colon},floor).versionCode,405);
});
test('stale environment last versionCode=0 fails, even though new version code 405 passes policy floor',()=>{
 assert.throws(()=>yes({environmentLastVersionCode:0}),/STALE_MT_ANDROID_LAST_VERSION_CODE_ENVIRONMENT_VARIABLE/);
});
test('environment last versionCode greater than or equal to candidate fails',()=>{
 assert.throws(()=>yes({environmentLastVersionCode:405}),/ANDROID_VERSION_CODE_NOT_GREATER_THAN_ENVIRONMENT_FLOOR/);
});
test('non-integer, scientific notation and invalid semver are rejected',()=>{
 for(const code of ['405.5','4e2','0','undefined'])
   assert.throws(()=>checkNextNativeRelease({...candidate,versionCode:code},floor),/VERSION_CODE_INVALID/);
 assert.throws(()=>checkNextNativeRelease({...candidate,versionName:'0.4.5-beta'},floor),/ANDROID_RELEASE_VERSION_NAME_INVALID/);
});
test('employee rollout remains denied independently of successful QA checks',()=>{
 assert.equal(employee.employeeRollout,'DENY_UNTIL_ALL_GATES_INDEPENDENTLY_VERIFIED');
 assert.equal(employee.approvedArchitecture.employeeAndroidApkReleaseAllowed,false);
});
