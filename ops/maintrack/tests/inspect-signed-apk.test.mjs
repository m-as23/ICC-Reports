import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {inspectSignedApk} from '../scripts/inspect-signed-apk.mjs';
const root=path.resolve(import.meta.dirname,'../../..');
const floor=JSON.parse(fs.readFileSync(path.join(root,'ops/maintrack/security/android-native-release-floor.json'),'utf8'));
const cert=floor.androidApkSigningCertificateSha256;
const good={
 badging:"package: name='com.icc.maintrack' versionCode='405' versionName='0.4.5'\n",
 verification:"Verified using v1 scheme (JAR signing): true\nVerified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: "+cert+"\n",
 expectedVersionCode:405,expectedVersionName:'0.4.5',lastVersionCode:404
};
const check=(patch={})=>inspectSignedApk({...good,...patch},floor);
test('signed 405 matches installed package, signer and Android code 404 floor',()=>{
 const res=check();
 assert.equal(res.passed,true);
 assert.equal(res.rolloutEnabled,false);
 assert.equal(res.installedDeviceTest,'NOT_RUN');
});
test('wrong versionName in APK rejected',()=>{
 assert.throws(()=>check({badging:good.badging.replace('0.4.5','0.4.4')}),/SIGNED_APK_VERSION_NAME_MISMATCH/);
});
test('wrong APK versionCode rejected',()=>{
 assert.throws(()=>check({badging:good.badging.replace('405','404')}),/SIGNED_APK_VERSION_CODE_MISMATCH/);
});
test('wrong package ID rejected',()=>{
 assert.throws(()=>check({badging:good.badging.replace('com.icc.maintrack','com.icc.unknown')}),/ANDROID_PACKAGE_CHANGED/);
});
test('wrong signing certificate rejected',()=>{
 assert.throws(()=>check({verification:good.verification.replace(cert,'0'.repeat(64))}),/ANDROID_SIGNING_CERT_CHANGED/);
});
test('extra signer rejected',()=>{
 assert.throws(()=>check({verification:good.verification+"Signer #2 certificate SHA-256 digest: "+cert+"\n"}),/ANDROID_SIGNING_CERTIFICATE_COUNT_MUST_BE_ONE/);
});
test('invalid signature rejected even with matching certificate',()=>{
 assert.throws(()=>check({verification:good.verification.replace('v2 scheme (APK Signature Scheme v2): true','v2 scheme (APK Signature Scheme v2): false')}),/ANDROID_STRONG_APK_SIGNATURE_NOT_VERIFIED/);
});
test('old environment code 0 rejected',()=>{
 assert.throws(()=>check({lastVersionCode:0}),/STALE_MT_ANDROID_LAST_VERSION_CODE_ENVIRONMENT_VARIABLE/);
});
test('equal last version 405 rejected',()=>{
 assert.throws(()=>check({lastVersionCode:405}),/ANDROID_VERSION_CODE_NOT_GREATER_THAN_ENVIRONMENT_FLOOR/);
});
test('versionName cannot be unchanged even with code 405',()=>{
 assert.throws(()=>check({badging:good.badging.replace('0.4.5','0.4.4'),expectedVersionName:'0.4.4'}),/VERSION_NAME_MUST_INCREASE/);
});
