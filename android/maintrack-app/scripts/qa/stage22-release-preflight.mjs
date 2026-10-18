// Stage22 release preflight only. No deployment, signing, secret access or API writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const candidate=JSON.parse(fs.readFileSync('unified-four-review/candidate.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('../../updates/android/release.json','utf8'));
const config=JSON.parse(fs.readFileSync('release/owner-public.json','utf8'));
const backend=fs.readFileSync('../../supabase/functions/maintrack-stage9-security-api/index.ts','utf8');
const expectedLegacy=[
 'session','init','nextId','submit','cmmsDelete','cmmsWrite','cmmsAudit','cmms',
 'dashboard','notifications','profile','updateProfile','leaveMine','leaveRequest',
 'leaveDecision','leaveInbox','leavePendingCount','markNotificationRead',
 'markAllNotificationsRead','adminCatalog','adminCatalogSave','adminCreateEmployee',
 'adminResetEmployeePassword','adminUsers','adminSaveUser','change'
];
const feature=['accountSummary','overtimeMine','overtimeRequest','overtimeDecision','overtimeInbox','overtimeSummary'];
const routeNames=[...new Set([...backend.matchAll(/case\s+['"]([a-zA-Z0-9_]+)['"]\s*:/g)].map(x=>x[1]))];
const absent=[...expectedLegacy,...feature].filter(x=>!routeNames.includes(x));
assert.deepEqual(absent,[],'QA candidate backend must expose legacy and new routes');
assert.equal(candidate.mode,'review-only');
assert.equal(candidate.rolloutEnabled,false);
assert.equal(candidate.signed,false);
assert.equal(candidate.deployable,false);
assert.equal(candidate.appId,'com.icc.maintrack');
assert.equal(candidate.localData.reportQueue,1);
assert.equal(candidate.localData.writesReportQueue,1);
assert.equal(candidate.localData.migration,'none');
assert.deepEqual(candidate.changedFromApprovedBaseline.sort(),
  ['index.html','secure-assets/index-inline-1.css','secure-assets/index-inline-1.js']);
assert.equal(manifest.payload.bundleVersion,'0.4.2','unexpected published stable OTA baseline');
assert.equal(manifest.payload.appId,candidate.appId);
assert.equal(manifest.payload.channel,'lab');
assert.deepEqual(manifest.payload.localData,candidate.localData);
assert.equal(config.channel,'lab');
assert.equal(config.publicKeyBase64,candidate.nativePilotUpdatePanel.pinnedPublicKey);
assert.equal(config.manifestUrl,candidate.nativePilotUpdatePanel.trustedManifestUrl);
const raw=fs.readFileSync('unified-four-review/native/www/secure-assets/index-inline-1.js','utf8');
assert.match(raw,/maintrack-stage9-security-api\/api/);
assert.ok(!raw.includes('maintrack-unified-four-qa/api'),'staging API must not leak into release candidate');
const nativeEntry=fs.readFileSync('unified-four-review/native/www/index.html','utf8');
assert.ok(nativeEntry.includes('stage15-pilot-update.js'));
assert.ok(nativeEntry.includes('stage14-local-work.js'));
const webIndex=fs.readFileSync('unified-four-review/web/.vercel/output/static/releases/'+candidate.gitCommit+'/index.html','utf8');
assert.ok(webIndex.includes('secure-assets/web-update.js'));
assert.ok(webIndex.includes('secure-assets/stage14-local-work.js'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const [name,info] of Object.entries(candidate.archives)){
 const bytes=fs.readFileSync('unified-four-review/'+name);
 assert.equal(sha(bytes),info.sha256);
 assert.equal(bytes.length,info.bytes);
}
const release={
 schema:1,app:'MainTrack',stage:22,sourceCommit:candidate.gitCommit,
 candidate:'verified-unsigned',automatedRelease:false,productionChanged:false,otaManifestChanged:false,
 currentSignedOtaVersion:manifest.payload.bundleVersion,
 proposedNextVersion:'0.4.3-or-higher',
 nativeAppId:'com.icc.maintrack',
 preservesExistingInstalledApk:true,
 trustedOtaPublicKey:config.publicKeyBase64,
 backend:{requiredLegacyActions:expectedLegacy.length,requiredNewActions:feature.length,
           staticCoverage:true,liveRoleAndOldClientRegression:'PENDING'},
 web:{immutablePrefix:candidate.webBasePath,
      releaseMetadataExpiresAt:0,existingStableOrigin:'UNRESOLVED',historyRetention:'PENDING'},
 android:{reviewArchive:'MainTrack-Android-OTA-UNSIGNED-REVIEW.zip',
          signedOwnerBundle:'PENDING',physicalInPlaceOtaUpgrade:'PENDING'},
 rolloutStatus:'BLOCKED_UNTIL_RELEASE_GATES_CLEAR',
 archives:candidate.archives
};
const folder='release-readiness';
fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(path.join(folder,'stage22-readiness.json'),JSON.stringify(release,null,2)+'\n');
const md=[
 '# MainTrack Stage22 — Owner release-readiness report',
 '',
 '**Disposition: BLOCKED for Production, READY for signed-release review.**',
 '',
 '| Check | Result |','|---|---|',
 '| Stage22 exact-source Web/Android archives & SHA-256 | PASS |',
 '| Existing 0.4.2 Ed25519 trust root & storage contract | PASS |',
 '| 26 legacy + 6 Stage22 API routes in candidate source | PASS (static only) |',
 '| Live legacy role/old-client compatibility and real approvals | PENDING |',
 '| Current Production Web host and old-release preservation | PENDING |',
 '| Owner-signed 0.4.3+ compatible immutable OTA and in-place physical upgrade | PENDING |',
 '',
 'No production deployment, backend promotion, OTA manifest change, or APK installation was performed.',
 '',
 'The built ZIPs are review-only. Never upload them as a signed OTA or promote the included',
 'Vercel output directly; its update metadata is deliberately expired and cannot act as a stable release.',
 '',
 'Source commit: `'+candidate.gitCommit+'`',
 'Native app ID: `'+candidate.appId+'`',
 'Current trusted OTA: `'+manifest.payload.bundleVersion+'`'
].join('\n');
fs.writeFileSync(path.join(folder,'stage22-readiness.md'),md+'\n');
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md+'\n');
console.log('MAINTRACK_STAGE22_UNSIGNED_RELEASE_PREFLIGHT_PASS',candidate.gitCommit);
