// Validate evidence emitted by Android SDK apksigner/aapt AFTER signing.
// No signing keys are needed. Does not sign, copy, publish or install any APK.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkNextNativeRelease,fingerprint} from './native-release-floor.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
const floorFile=path.join(root,'ops/maintrack/security/android-native-release-floor.json');

export function inspectSignedApk({badging,verification,expectedVersionCode,
  expectedVersionName,lastVersionCode},floor){
 assert.ok(typeof badging==='string'&&typeof verification==='string','APK_EVIDENCE_MISSING');
 const line=badging.split(/\r?\n/).find(x=>x.startsWith('package: '));
 assert.ok(line,'APK_PACKAGE_BADGING_MISSING');
 const parsed=line.match(/^package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'/);
 assert.ok(parsed,'APK_PACKAGE_BADGING_INVALID');
 const [,appId,versionCode,versionName]=parsed;
 assert.equal(String(versionCode),String(expectedVersionCode),'SIGNED_APK_VERSION_CODE_MISMATCH');
 assert.equal(versionName,String(expectedVersionName),'SIGNED_APK_VERSION_NAME_MISMATCH');
 const signer=[...verification.matchAll(/^Signer #(\d+) certificate SHA-256 digest:\s*([0-9a-fA-F:]{64,95})\s*$/gm)];
 assert.equal(signer.length,1,'ANDROID_SIGNING_CERTIFICATE_COUNT_MUST_BE_ONE');
 assert.equal(signer[0][1],'1','ANDROID_SIGNER_MUST_BE_1');
 assert.ok(/Verified using v[23] scheme.*:\s*true/m.test(verification),
   'ANDROID_STRONG_APK_SIGNATURE_NOT_VERIFIED');
 assert.ok(!/^Verified using v[23] scheme.*:\s*false$/m.test(verification)&&
           !/^DOES NOT VERIFY$/m.test(verification),'ANDROID_APK_SIGNATURE_VALIDATION_FAILED');
 const candidate=checkNextNativeRelease({appId,versionCode,versionName,
     certificateSha256:fingerprint(signer[0][2])},floor,
     {environmentLastVersionCode:lastVersionCode});
 return {schema:1,mode:'OWNER_QA_ONLY_NOT_FOR_EMPLOYEES',
   appId:candidate.appId,versionCode:candidate.versionCode,
   versionName:candidate.versionName,certificateSha256:candidate.certificateSha256,
   passed: true,installedDeviceTest:'NOT_RUN',rolloutEnabled:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,badgingPath,verificationPath]=process.argv.slice(2);
 assert.equal(mode,'--evidence','NO_APK_SIGNING_OR_BUILD_IN_THIS_TOOL');
 assert.ok(badgingPath&&verificationPath,'EXPLICIT_APK_EVIDENCE_FILES_REQUIRED');
 const floor=JSON.parse(fs.readFileSync(floorFile,'utf8'));
 const report=inspectSignedApk({
  badging:fs.readFileSync(badgingPath,'utf8'),
  verification:fs.readFileSync(verificationPath,'utf8'),
  expectedVersionCode:process.env.MAINTRACK_RELEASE_VERSION_CODE,
  expectedVersionName:process.env.MAINTRACK_RELEASE_VERSION_NAME,
  lastVersionCode:process.env.MT_ANDROID_LAST_VERSION_CODE,
 },floor);
 console.log('PASS signed APK identity and cryptographic certificate continuity for Owner QA only');
 console.log(JSON.stringify(report));
}
