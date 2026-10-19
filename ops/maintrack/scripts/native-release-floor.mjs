// MainTrack native Android release floor, read-only.
// This is a QA validation helper, NOT a signing/publishing authorization.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(import.meta.dirname,'../../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
export const fingerprint=value=>String(value??'').replaceAll(':','').toLowerCase();
const semver=s=>{
  assert.match(String(s),/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,'ANDROID_RELEASE_VERSION_NAME_INVALID');
  return String(s).split('.').map(Number);
};
const newer=(v,old)=>v.findIndex((n,i)=>n!==old[i])<0?false:(()=>{
  for(let i=0;i<v.length;i++){if(v[i]!==old[i])return v[i]>old[i];}
  return false;
})();

export function verifyApprovedFloor(floor,ownerRecord,base,employeePolicy){
  assert.equal(floor.schema,1);
  assert.equal(floor.appId,'com.icc.maintrack');
  assert.equal(floor.appId,base.android.appId,'APP_ID_NOT_BASELINE');
  assert.equal(floor.appId,employeePolicy.currentBaseline.appId,'APP_ID_NOT_INSTALLED');
  assert.equal(fingerprint(floor.androidApkSigningCertificateSha256),
     fingerprint(employeePolicy.currentBaseline.installedAndroidCertificateSha256),'SIGNING_CERT_NOT_BASELINE');
  assert.match(fingerprint(floor.androidApkSigningCertificateSha256),/^[0-9a-f]{64}$/);
  assert.equal(floor.acceptedOwnerDevice.versionCode,404,'OWNER_SIGNED_044_FLOOR_REQUIRED');
  assert.equal(floor.acceptedOwnerDevice.versionName,'0.4.4','OWNER_VERSION_NAME_DRIFT');
  assert.equal(floor.nativeNextReleaseMinimumVersionCode,405,'NEXT_CODE_MUST_BE_AT_LEAST_405');
  assert.equal(floor.notes.frozenNativeBaselineCode,
    employeePolicy.currentBaseline.installedNativeVersionCode,'OLDER_NATIVE_BASELINE_DRIFT');
  assert.ok(ownerRecord.includes('استمرار جلسة تسجيل الدخول') &&
            ownerRecord.includes('PASS reported by Owner'),'MISSING_SESSION_DEVICE_ACCEPTANCE');
  assert.equal(employeePolicy.state,'PRELAUNCH_BLOCKED');
  assert.equal(employeePolicy.approvedArchitecture.employeeAndroidApkReleaseAllowed,false);
  return true;
}

export function checkNextNativeRelease(candidate,floor,{environmentLastVersionCode}={}){
  assert.equal(candidate.appId,floor.appId,'ANDROID_PACKAGE_CHANGED');
  assert.match(String(candidate.versionCode),/^[1-9]\d{0,9}$/,'VERSION_CODE_INVALID');
  const versionCode=Number(candidate.versionCode);
  assert.ok(Number.isSafeInteger(versionCode)&&versionCode<=2000000000,'VERSION_CODE_NOT_SAFE');
  assert.ok(versionCode>=floor.nativeNextReleaseMinimumVersionCode,'ANDROID_VERSION_CODE_NOT_GREATER_THAN_404');
  assert.ok(newer(semver(candidate.versionName),semver(floor.acceptedOwnerDevice.versionName)),
    'VERSION_NAME_MUST_INCREASE');
  assert.equal(fingerprint(candidate.certificateSha256),
     fingerprint(floor.androidApkSigningCertificateSha256),'ANDROID_SIGNING_CERT_CHANGED');
  if(environmentLastVersionCode!==undefined){
    assert.match(String(environmentLastVersionCode),/^(0|[1-9]\d{0,9})$/,'ENVIRONMENT_LAST_VERSION_INVALID');
    const last=Number(environmentLastVersionCode);
    assert.ok(last>=floor.acceptedOwnerDevice.versionCode,
      'STALE_MT_ANDROID_LAST_VERSION_CODE_ENVIRONMENT_VARIABLE');
    assert.ok(versionCode>last,'ANDROID_VERSION_CODE_NOT_GREATER_THAN_ENVIRONMENT_FLOOR');
  }
  return {versionCode,versionName:candidate.versionName,appId:candidate.appId,
    certificateSha256:fingerprint(candidate.certificateSha256)};
}

function main(){
  const floor=read('ops/maintrack/security/android-native-release-floor.json');
  const employee=read('ops/maintrack/employee-release-gates.json');
  const base=read('ops/maintrack/runtime-registry-0.4.4.json');
  const owner=fs.readFileSync(path.join(root,floor.acceptedOwnerDevice.evidenceDocument),'utf8');
  verifyApprovedFloor(floor,owner,base,employee);
  const mode=process.argv[2]||'--audit';
  if(mode==='--audit'){
    console.log('PASS Owner QA 0.4.4/404 native floor; next signed native update must use versionCode >=405');
    console.log('PASS Android package/signing SHA-256 match the existing installed app');
    console.log('NO_SIGNING / NO_DEPLOY / STAGING_ONLY; this audit is not authorization to release.');
  }else if(mode==='--candidate'){
    const e=process.env;
    const result=checkNextNativeRelease({
      appId:e.MAINTRACK_RELEASE_APP_ID,
      versionCode:e.MAINTRACK_RELEASE_VERSION_CODE,
      versionName:e.MAINTRACK_RELEASE_VERSION_NAME,
      certificateSha256:e.MAINTRACK_ANDROID_CERT_SHA256,
    },floor,{environmentLastVersionCode:e.MT_ANDROID_LAST_VERSION_CODE});
    console.log('PASS validated new native release identity and version floor:',JSON.stringify(result));
    console.log('NO_SIGNING / NO_DEPLOY / OWNER_APPROVAL_STILL_REQUIRED');
  }else{throw new Error('UNKNOWN_MODE');}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
