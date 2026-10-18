// Stage22 0.4.4 RELEASE PREPARATION ONLY. No production/API/OTA writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {canonicalJson} from '../../update-system/policy.mjs';

const root=process.cwd();
const branch=process.env.GITHUB_REF?.replace(/^refs\/heads\//,'')||'';
const expectBranch='release/maintrack-stage22-044-integration';
assert.equal(branch,expectBranch,'release-integration branch only');
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(head,process.env.GITHUB_SHA,'pin event source commit');
const manifest=JSON.parse(fs.readFileSync('../../updates/android/release.json','utf8'));
const key=JSON.parse(fs.readFileSync('release/owner-public.json','utf8'));
assert.equal(manifest.payload.bundleVersion,'0.4.3','signed owner baseline must be 0.4.3');
assert.equal(manifest.payload.appId,'com.icc.maintrack');
assert.equal(manifest.payload.channel,'lab');
assert.equal(key.channel,'lab');
assert.equal(key.manifestUrl,'https://raw.githubusercontent.com/m-as23/ICC-Reports/android/stage14-ota-native-lab/updates/android/release.json');
const pub=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(key.publicKeyBase64,'base64url')]),format:'der',type:'spki'});
assert.equal(crypto.verify(null,Buffer.from(canonicalJson(manifest.payload)),pub,Buffer.from(manifest.signature,'base64url')),true,'existing 0.4.3 OTA signature must validate');
assert.deepEqual(manifest.payload.localData,{reportQueue:1,writesReportQueue:1,migration:'none'});
assert.match(manifest.payload.bundleUrl,/^https:\/\/raw\.githubusercontent\.com\/m-as23\/ICC-Reports\/[a-f0-9]{40}\/updates\/android\/maintrack-0\.4\.3\.zip$/);
console.log('PASS existing owner-signed 0.4.3 OTA trust key and manifest');

const candidate=JSON.parse(fs.readFileSync('unified-four-review/candidate.json','utf8'));
assert.equal(candidate.gitCommit,head);
assert.equal(candidate.branch,expectBranch);
assert.equal(candidate.appId,'com.icc.maintrack');
assert.equal(candidate.mode,'review-only');
assert.equal(candidate.deployable,false);
assert.equal(candidate.signed,false);
assert.equal(candidate.rolloutEnabled,false);
assert.deepEqual(candidate.localData,manifest.payload.localData);
assert.equal(candidate.nativePilotUpdatePanel.pinnedPublicKey,key.publicKeyBase64);
assert.equal(candidate.nativePilotUpdatePanel.trustedManifestUrl,key.manifestUrl);
assert.equal(Object.keys(candidate.sharedAssetHashes).length,16);
const names=['MainTrack-Android-OTA-UNSIGNED-REVIEW.zip','MainTrack-Web-REVIEW-ONLY.zip'];
for(const name of names){
 const contents=fs.readFileSync('unified-four-review/'+name);
 assert.equal(contents.length,candidate.archives[name].bytes);
 assert.equal(crypto.createHash('sha256').update(contents).digest('hex'),candidate.archives[name].sha256);
}
console.log('PASS Stage22 native OTA + Web source-lock and matching immutable review bytes');

const stableActions=['session','init','nextId','submit','cmmsDelete','cmmsWrite','cmmsAudit','cmms','dashboard',
 'notifications','profile','updateProfile','leaveMine','leaveRequest','leaveDecision','leaveInbox','leavePendingCount',
 'markNotificationRead','markAllNotificationsRead','adminCatalog','adminCatalogSave',
 'adminCreateEmployee','adminResetEmployeePassword','adminUsers','adminSaveUser','change'];
const added=['overtimeMine','overtimeRequest','overtimeDecision','overtimeSummary','overtimeInbox','accountSummary'];
const api=fs.readFileSync('../../supabase/functions/maintrack-stage9-security-api/index.ts','utf8');
for(const action of [...stableActions,...added]){
 assert.ok(api.includes("case '"+action+"'"),'required stable/new API dispatch case missing: '+action);
}
assert.ok(api.includes('maintrack-pilot-icc.vercel.app'),'current stable frontend origin lost');
assert.ok(api.includes("'https://localhost'"),'installed native origin must remain accepted');
assert.ok(!api.includes('maintrack-final-security-ldgcbkqqw-'),'QA preview origin accidentally allowed by stable release');
const ui=fs.readFileSync('../../web/maintrack/public/secure-assets/index-inline-1.js','utf8');
assert.ok(ui.includes('maintrack-stage9-security-api/api'));
assert.ok(!ui.includes('maintrack-unified-four-qa/api'));
assert.ok(ui.includes('ownerPendingRows')&&ui.includes('ownerHistoryRows'),'stage22 Owner inbox missing');
console.log('PASS static backwards-compatible API action inventory and production origin');

const out='release-preflight',metadata={
 schema:1,project:'MainTrack',status:'REVIEW_APPROVED_NOT_PUBLISHED',branch:expectBranch,
 sourceCommit:head,proposedVersion:'0.4.4',previousSignedOta:manifest.payload.bundleVersion,
 signedByOwner:false,otaPublished:false,webPublished:false,backendPromoted:false,
 localData:manifest.payload.localData,ownerPublicKey:key.publicKeyBase64,
 nativeZip:candidate.archives[names[0]],webZip:candidate.archives[names[1]],
 remaining:[
 'Authenticate old owner, engineer and technician against candidate backend before stable API promotion',
 'Verify stable Web origin and preserve earlier immutable version directories and non-stale discovery metadata',
 'Sign exact reviewed OTA with already-trusted owner Ed25519 key in protected GitHub environment',
 'Test genuine in-place OTA on already-installed com.icc.maintrack; preserve data/rollback',
 'Promote backend, Web release pointer and signed OTA only after release preconditions'
 ]};
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'release-readiness.json'),JSON.stringify(metadata,null,2)+'\n');
console.log('MAINTRACK_STAGE22_RELEASE_PREFLIGHT_PASS (NO PRODUCTION WRITES)');
