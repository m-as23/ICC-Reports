// Read-only, fail-closed release candidate audit. Never publishes Web, stable API or OTA.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {canonicalJson,compareVersions} from '../../update-system/policy.mjs';

const srcBranch='release/maintrack-stage22-web-android-20261018';
const expectedSource='f5c9d78c6e0b135549c9efc9608d1f0df02ecf8e';
const currentSha=process.env.GITHUB_SHA||'';
const version='0.4.4';
if(process.env.GITHUB_REF!==\`refs/heads/\${srcBranch}\`||!/^[a-f0-9]{40}$/.test(currentSha))
  throw Error('ISOLATED_RELEASE_BRANCH_REQUIRED');
const p=JSON.parse(fs.readFileSync('unified-four-review/candidate.json','utf8'));
assert.equal(p.gitCommit,currentSha);
assert.equal(p.mode,'review-only');
assert.equal(p.deployable,false);
assert.equal(p.signed,false);
assert.equal(p.rolloutEnabled,false);
assert.deepEqual(p.localData,{reportQueue:1,writesReportQueue:1,migration:'none'});
assert.equal(p.appId,'com.icc.maintrack');
assert.ok(p.sharedAssetHashes&&Object.keys(p.sharedAssetHashes).length===16);
assert.equal(p.nativePilotUpdatePanel.pinnedPublicKey,
  JSON.parse(fs.readFileSync('release/owner-public.json','utf8')).publicKeyBase64);
const remote='https://raw.githubusercontent.com/m-as23/ICC-Reports/android/stage14-ota-native-lab/updates/android/release.json';
const resp=await fetch(remote,{signal:AbortSignal.timeout(20000),cache:'no-store'});
assert.equal(resp.status,200,'Existing owner channel must be readable');
const old=await resp.json();
const cfg=JSON.parse(fs.readFileSync('release/owner-public.json','utf8'));
const keyBuffer=Buffer.from(cfg.publicKeyBase64,'base64url');
assert.equal(keyBuffer.length,32);
const key=crypto.createPublicKey({key:Buffer.concat([
 Buffer.from('302a300506032b6570032100','hex'),keyBuffer
]),format:'der',type:'spki'});
const ok=crypto.verify(null,Buffer.from(canonicalJson(old.payload)),
  key,Buffer.from(old.signature,'base64url'));
assert.equal(ok,true,'Previous owner-signed release must verify against current trusted public key');
assert.equal(old.payload.appId,'com.icc.maintrack');
assert.equal(old.payload.channel,'lab');
assert.equal(old.payload.kind,'web-ota');
assert.deepEqual(old.payload.localData,p.localData);
assert.equal(old.payload.bundleVersion,'0.4.3',
  'Owner channel changed since Stage22 was reviewed; re-audit prior to releasing');
assert.ok(compareVersions(version,old.payload.bundleVersion)>0,'New version must exceed current');
assert.equal(old.payload.nativeMinimum,'0.4.1');
assert.equal(old.payload.nativeMaximum,'0.4.99');
const status={
 schema:1,component:'MainTrack Stage22 coordinated release preflight',
 approval:'owner-authorized-release-preparation',
 previousSignedOtaVersion:old.payload.bundleVersion,
 nextReservedVersion:version,
 channel:'lab',
 expectedReviewedSource:expectedSource,
 buildCommit:currentSha,
 requiredAppId:'com.icc.maintrack',
 signedManifestVerified:true,
 otaPrivateSigningKeyHandled:false,
 candidateUnsigned:true,
 productionBackendUpdated:false,
 stableWebOriginVerified:false,
 nativeApkUpgradeSignatureVerified:false,
 sourceAssetsSharedCount:Object.keys(p.sharedAssetHashes).length,
 localData:p.localData,
 status:'PREPARED_NOT_PUBLISHED',
 blockingChecks:[
   'Live stable stage9 API lacks six Stage22 overtime/account actions',
   'Production Web hostname/version-history and same-origin rollback not verified',
   'Owner signing workflow must sign immutable Stage22 OTA bundle with existing protected key',
   'No proof current installed 0.4.1 native APK shares signing certificate with new APK'
 ],
 productionFilesChanged:false,otaManifestChanged:false
};
fs.mkdirSync('release-preflight',{recursive:true});
fs.writeFileSync('release-preflight/release-readiness.json',JSON.stringify(status,null,2)+'\n');
fs.writeFileSync('release-preflight/SHA256SUMS',[
 ['unified-four-review/MainTrack-Android-OTA-UNSIGNED-REVIEW.zip',
  'MainTrack-Android-OTA-UNSIGNED-REVIEW.zip'],
 ['unified-four-review/MainTrack-Web-REVIEW-ONLY.zip',
  'MainTrack-Web-REVIEW-ONLY.zip'],
].map(([file,name])=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')+'  '+name).join('\n')+'\n');
console.log('PASS STAGE22 OWNER KEY CONTINUITY, SIGNED PREVIOUS OTA 0.4.3, NEXT VERSION 0.4.4');
console.log('STAGE22 RELEASE STATUS: PREPARED_NOT_PUBLISHED; live backend and stable Web gates remain open');
