import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=new URL('../../../',import.meta.url);
process.chdir(root.pathname);
const read=p=>fs.readFileSync(p,'utf8');
const registry=JSON.parse(read('ops/maintrack/runtime-registry-0.4.4.json'));
const report=[];
const requireEqual=(a,b,m)=>assert.deepEqual(a,b,m);
const sha256=data=>crypto.createHash('sha256').update(data).digest('hex');
const canon=x=>(x===null||typeof x!=='object')?JSON.stringify(x):Array.isArray(x)?'['+x.map(canon).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canon(x[k])).join(',')+'}';
requireEqual(registry.schema,1,'REGISTRY_SCHEMA');
requireEqual(registry.phase,'PRODUCTION_FOUNDATION_NOT_LIVE','CANDIDATE_NOT_YET_APPROVED');
requireEqual(registry.repository.fullName,'m-as23/ICC-Reports','REPO_IDENTITY');
requireEqual(registry.repository.reviewedFeatureCommit,'865229c4706e946377fba811d2f51dad1a815138','REVIEWED_SHA');
requireEqual(registry.android.appId,'com.icc.maintrack','ANDROID_APP_ID');
requireEqual(registry.android.version,'0.4.4','ANDROID_VERSION');
requireEqual(registry.android.channel,'lab','ANDROID_OTA_CHANNEL');
requireEqual(registry.backend.staging.qaApi.actions,32,'QA_BACKEND_ACTIONS');
requireEqual(registry.backend.staging.stableLegacyApi.actions,26,'LEGACY_BACKEND_ACTIONS');
requireEqual(registry.web.production.status,'CREATED_NOT_DEPLOYED','DO_NOT_ASSERT_PROD_DEPLOYED');
requireEqual(registry.web.production.deployment,null,'UNVERIFIED_PROD_DEPLOYMENT');
requireEqual(registry.database.production.projectId,null,'UNVERIFIED_DB_PRODUCTION');
requireEqual(registry.android.localData,{reportQueue:1,writesReportQueue:1,migration:'none'},'LOCAL_WORK_CONTRACT');

const review=registry.repository.reviewedFeatureCommit;
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const paths=['web/maintrack/public','android/maintrack-app/update-system','android/maintrack-app/release/owner-public.json','supabase/functions/maintrack-stage9-security-api/index.ts'];
// Immutable 0.4.4 baseline remains pinned. Permit ONLY the three Owner-reviewed
// PR #17 UI removals on this operations branch, by exact Git blob identity.
const approvedUiHotfix=new Map([
 ['web/maintrack/public/index.html','b4c57297a5b709f41919673ecd98bb73d09e47ca'],
 ['web/maintrack/public/v6-core.js','9cc283b7594f9952339115fdba594883151987ef'],
 ['web/maintrack/public/v6-core.css','dc47c4c581b26c3319b0ab241e6c5b9f9a489ced']
]);
const changed=execFileSync('git',['diff','--name-only',review,sha,'--',...paths],
 {encoding:'utf8'}).trim().split('\\n').filter(Boolean).sort();
requireEqual(changed,[...approvedUiHotfix.keys()].sort(),
 'UNAPPROVED_CANONICAL_SOURCE_CHANGE_OUTSIDE_OWNER_UI_FIX');
for(const [path,expectedBlob] of approvedUiHotfix){
 const actual=execFileSync('git',['hash-object',path],{encoding:'utf8'}).trim();
 requireEqual(actual,expectedBlob,'OWNER_APPROVED_UI_BLOB_CHANGED: '+path);
}
execFileSync('git',['diff','--exit-code',review,sha,'--',
 'android/maintrack-app/update-system',
 'android/maintrack-app/release/owner-public.json',
 'supabase/functions/maintrack-stage9-security-api/index.ts'],{stdio:'pipe'});
report.push('PASS exact three-file Owner UI correction; legacy API, updater and frozen 0.4.4 baseline unchanged');

const source=read('web/maintrack/public/secure-assets/index-inline-1.js');
assert(source.includes('/maintrack-stage9-security-api/api'),'SOURCE_STABLE_API_NOT_DOCUMENTED');
assert(!source.includes('/maintrack-unified-four-qa/api'),'UNEXPECTED_SOURCE_API_REWRITE');
const api=read('supabase/functions/maintrack-stage9-security-api/index.ts');
const actions=[...new Set([...api.matchAll(/case '([A-Za-z]+)'/g)].map(x=>x[1]))];
requireEqual(actions.length,32,'REVIEWED_SOURCE_MUST_HAVE_ALL_32_ACTIONS');
const newActions=['accountSummary','overtimeMine','overtimeRequest','overtimeDecision','overtimeInbox','overtimeSummary'];
for(const action of newActions)assert(actions.includes(action),'MISSING_NEW_ACTION_'+action);
report.push('PASS source 32 action contract; legacy 26 action live deployment requires separate promotion');

const config=JSON.parse(read('android/maintrack-app/release/owner-public.json'));
const manifest=JSON.parse(execFileSync('git',['show','FETCH_HEAD:updates/android/release.json'],{encoding:'utf8'}));
const payload=manifest.payload;
requireEqual(payload.bundleVersion,registry.android.version,'SIGNED_OTA_VERSION');
requireEqual(payload.sha256,registry.android.bundleSha256,'SIGNED_OTA_DIGEST');
requireEqual(payload.bundleUrl,registry.android.bundleUrl,'SIGNED_OTA_URL');
requireEqual(config.manifestUrl,registry.android.signedManifest,'TRUSTED_DEVICE_MANIFEST_URL');
requireEqual(payload.localData,registry.android.localData,'SIGNED_LOCAL_DATA_CONTRACT');
requireEqual(payload.appId,registry.android.appId,'SIGNED_ANDROID_ID');
const pub=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(config.publicKeyBase64,'base64url')]),format:'der',type:'spki'});
assert(crypto.verify(null,Buffer.from(canon(payload)),pub,Buffer.from(manifest.signature,'base64url')),'OWNER_SIGNATURE_INVALID');
const zip=execFileSync('git',['show','FETCH_HEAD:updates/android/maintrack-0.4.4.zip'],{maxBuffer:18000000});
assert.equal(sha256(zip),payload.sha256,'SIGNED_BUNDLE_BYTES_CHANGED');
requireEqual(zip.length,payload.bytes,'SIGNED_BUNDLE_LENGTH');
report.push('PASS owner-signed OTA 0.4.4 cryptographic signature + immutable archive hash');
report.push('STATUS NOT_PRODUCTION — required prod API/domain/database and native employee APK are not released');
console.log(report.join('\n'));
