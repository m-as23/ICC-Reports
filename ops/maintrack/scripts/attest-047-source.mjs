// MainTrack v0.4.7 — fail-closed candidate source attestation (NO release signing).
// Never edits the historic 0.4.6 source lock or old pinned 0.4.5 QA logic.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import assert from 'node:assert/strict';

const BASE='1248211b662981e3e7db27ac0a61ca4d23862ca1';
const PIN='25f37b928eba7857d7ddff08362f575ee1224971';
const root=resolve(import.meta.dirname,'../../..');
const run=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const baselineRead=file=>execFileSync('git',['show',BASE+':'+file],{cwd:root});
const sha256=value=>createHash('sha256').update(value).digest('hex');
const gitBlob=value=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+value.length+'\0'),value])).digest('hex');
const oldRoot=baselineRead('index.html');
const oldLock=baselineRead('web/maintrack/source-lock.json');
const oldJs=baselineRead('web/maintrack/public/secure-assets/index-inline-1.js');
assert.equal(gitBlob(oldJs),PIN,'HISTORICAL_SOURCE_PIN_MISMATCH');
assert.deepEqual(readFileSync(resolve(root,'index.html')),oldRoot,'LEGACY_ROOT_CHANGED');
assert.deepEqual(readFileSync(resolve(root,'web/maintrack/source-lock.json')),oldLock,'HISTORICAL_SOURCE_LOCK_CHANGED');
const head=run('rev-parse','HEAD');
assert.match(head,/^[0-9a-f]{40}$/);
assert.equal(run('merge-base',BASE,head),BASE,'CANDIDATE_NOT_BASED_ON_046');
const changed=run('diff','--name-only',BASE,head,'--').split('\n').filter(Boolean);
const allow=new Set([
 'docs/superpowers/specs/2026-10-24-final-047-release-verification.md',
 'docs/superpowers/plans/2026-10-24-final-047-cutover.md',
 'ops/maintrack/tests/prepare-final-047.test.mjs',
 'ops/maintrack/scripts/prepare-final-047.mjs',
 'ops/maintrack/scripts/verify-native-final-407-build.py',
 '.github/workflows/maintrack-final-apk-047.yml',
 'ops/maintrack/security/release-surface-register.json',
 'ops/maintrack/scripts/audit-release-workflows.mjs',

 'docs/superpowers/plans/2026-10-24-inventory-cache-numerals.md',
 'docs/superpowers/specs/2026-10-24-cache-numerals-qa.md',
 'ops/maintrack/inventory/frontend/inventory-storage.mjs',
 'ops/maintrack/inventory/frontend/inventory-cache.test.mjs',
 'ops/maintrack/tests/test_047_inventory_cache.browser.mjs',

 "supabase/functions/maintrack-unified-four-qa/index.ts",
 "supabase/functions/maintrack-unified-four-qa/deno.json",
 "supabase/functions/maintrack-unified-four-qa/ledger-service.mjs",
 "ops/maintrack/team-ledger/staging-adoption.json",

 'ops/maintrack/team-ledger/test/origin-candidate.test.mjs',
 'ops/maintrack/team-ledger/test/workflow.test.mjs',
 "docs/superpowers/plans/2026-10-24-team-balances.md",
 "docs/superpowers/specs/2026-10-24-team-balances-design.md",
 "ops/maintrack/team-ledger/README_AR.md",
 "ops/maintrack/team-ledger/backend/ledger-service.mjs",
 "ops/maintrack/team-ledger/backend/prepare-candidate.mjs",
 "ops/maintrack/team-ledger/frontend/extract-reference.py",
 "ops/maintrack/team-ledger/frontend/team-ledger.js",
 "ops/maintrack/team-ledger/scripts/prepare-review.mjs",
 "ops/maintrack/team-ledger/test/api.test.mjs",
 "ops/maintrack/team-ledger/test/approved-reference.fixture.html",
 "ops/maintrack/team-ledger/test/full-app.browser.mjs",
 "ops/maintrack/team-ledger/test/ledger.test.mjs",
 "ops/maintrack/team-ledger/test/regression.test.mjs",
 "ops/maintrack/team-ledger/test/schema.sql",
 "ops/maintrack/team-ledger/test/ui.browser.mjs",
 "ops/maintrack/team-ledger/test/unified-v21.fixture.ts",
 "web/maintrack/public/team-ledger.css",
 "web/maintrack/public/team-ledger.js",

 'ops/maintrack/tests/test_047_inventory_loading.browser.mjs',
 'docs/superpowers/plans/2026-10-23-inventory-responsive-loading.md',
 'ops/maintrack/inventory/frontend/inventory-loader.mjs',
 'ops/maintrack/inventory/frontend/inventory-loader.test.mjs',
 'ops/maintrack/scripts/build-inventory-preparation.mjs',
 'ops/maintrack/tests/test_047_worker_equivalence.test.mjs',
 'web/maintrack/public/inventory-preparation.js',
 'web/maintrack/public/inventory-reference-worker.js',
 'ops/maintrack/inventory/backend/src/index-worker.mjs',
 'docs/superpowers/specs/2026-10-23-hybrid-search-design.md',
 'docs/superpowers/plans/2026-10-23-hybrid-search.md',
 'web/maintrack/public/inventory-hybrid.js',
 'ops/maintrack/inventory/003_semantic_index.sql',
 'ops/maintrack/inventory/backend/src/embedding-provider.mjs',
 'ops/maintrack/inventory/backend/src/semantic-search.mjs',
 'ops/maintrack/inventory/backend/src/postgres-semantic-store.mjs',
 'ops/maintrack/inventory/backend/test/semantic-search.test.mjs',
 'ops/maintrack/inventory/backend/test/semantic-postgres.integration.mjs',
 'ops/maintrack/tests/test_047_hybrid_search.test.mjs',

 'DESIGN.md',
 'UX-CONTRACT.md',
 'ops/maintrack/inventory/frontend/inventory-presentation.mjs',
 'ops/maintrack/inventory/frontend/inventory-presentation.test.mjs',
 'ops/maintrack/inventory/frontend/inventory-icons.mjs',
 'ops/maintrack/inventory/frontend/inventory-client.mjs',
 'ops/maintrack/inventory/frontend/inventory-client.test.mjs',
 'ops/maintrack/inventory/frontend/inventory-ui.mjs',
 'ops/maintrack/tests/test_047_mail_payload.test.cjs',
 'ops/maintrack/tests/test_047_inventory_live_ui.browser.mjs',
 'supabase/functions/maintrack-inventory-047-qa/entry.mjs',
 'supabase/functions/maintrack-inventory-047-qa/index.ts',
 'supabase/functions/maintrack-inventory-047-qa/deno.json',
 'web/maintrack/public/inventory-047.js',
 'docs/superpowers/specs/2026-10-23-inventory-approved-design.md',
 'docs/superpowers/plans/2026-10-23-inventory-approved-design.md',
 'web/maintrack/public/inventory-approved.js',
 'web/maintrack/public/inventory-approved.css',
 'ops/maintrack/inventory/002_owner_versions.sql',
 'ops/maintrack/inventory/backend/src/search-assist.mjs',
 'ops/maintrack/inventory/backend/test/search-assist.test.mjs',
 'ops/maintrack/tests/test_047_approved_inventory.test.mjs',
 'web/maintrack/public/inventory-reference.html',
 'web/maintrack/public/inventory-reference.css',
 'web/maintrack/public/inventory-reference.js',
 'web/maintrack/public/inventory-reference-integration.js',
 'ops/maintrack/inventory/frontend/reference-source.json',
 'ops/maintrack/tests/inventory-reference-original.fixture.html',

 '.github/workflows/maintrack-047-isolated-qa.yml',
 '.github/workflows/maintrack-change-qa.yml',
 'ops/maintrack/MAINTRACK_047_CHECKPOINTS_AR.md',
 'ops/maintrack/scripts/attest-047-source.mjs',
 '.github/workflows/maintrack-owner-qa-apk-047.yml',
 '.github/workflows/maintrack-isolated-preview-apk-047.yml',
 'ops/maintrack/scripts/prepare-native-405-qa.mjs',
 'ops/maintrack/scripts/prepare-047-owner-preview.mjs',
 'ops/maintrack/scripts/verify-native-407-build.py',
 'ops/maintrack/security/owner-047-preview-source.json',
 'ops/maintrack/security/release-surface-register.json',
 'ops/maintrack/scripts/audit-release-workflows.mjs',
 'ops/maintrack/tests/prepare-047-owner-preview.test.mjs',
 'ops/maintrack/tests/test_verify_native_407_build.py',

 'ops/maintrack/tests/test_047_static.cjs',
 'ops/maintrack/inventory/001_inventory_core.review.sql',
 'ops/maintrack/inventory/test_inventory_disposable.sql',
 'ops/maintrack/inventory/test_sessions_disposable.sql',
 'ops/maintrack/inventory/test_dump_restore_disposable.sh',
 'ops/maintrack/inventory/backend/src/domain.mjs',
 'ops/maintrack/inventory/backend/src/http-adapter.mjs',
 'ops/maintrack/inventory/backend/src/maintrack-session-adapter.mjs',
 'ops/maintrack/inventory/backend/src/search-normalizer.mjs',
 'ops/maintrack/inventory/backend/src/postgres-store.mjs',
 'ops/maintrack/inventory/backend/src/inventory-service.mjs',
 'ops/maintrack/inventory/backend/src/owner-review-pagination.mjs',
 'ops/maintrack/inventory/backend/src/import-xlsx.mjs',
 'ops/maintrack/inventory/backend/src/private-bucket.mjs',
 'ops/maintrack/inventory/backend/src/create-review-runtime.mjs',
 'ops/maintrack/inventory/backend/src/create-review-http-handler.mjs',
 'ops/maintrack/inventory/backend/test/review-http-handler.test.mjs',
 'ops/maintrack/inventory/backend/test/search-load.synthetic.test.mjs',
 'ops/maintrack/inventory/backend/package.json',
 'ops/maintrack/inventory/backend/package-lock.json',
 'ops/maintrack/inventory/backend/test/import-xlsx.test.mjs',
 'ops/maintrack/inventory/backend/test/private-bucket.test.mjs',
 'ops/maintrack/inventory/backend/test/import-service.test.mjs',
 'ops/maintrack/inventory/backend/test/inventory-service.test.mjs',
 'ops/maintrack/inventory/backend/test/owner-review-pagination.test.mjs',
 'ops/maintrack/inventory/backend/test/postgres-search.test.mjs',
 'ops/maintrack/inventory/backend/test/search-normalizer.test.mjs',
 'ops/maintrack/inventory/backend/test/domain.test.mjs',
 'ops/maintrack/inventory/backend/test/http-adapter.test.mjs',
 'ops/maintrack/inventory/backend/test/session-adapter.test.mjs',
 'ops/maintrack/tests/test_047_mobile.browser.mjs',
 'ops/maintrack/tests/test_047_inventory.browser.mjs',
 'ops/maintrack/tests/test_047_menu_roles.browser.mjs',
 'supabase/functions/maintrack-pilot-mail-worker/deno.json',
 'supabase/functions/maintrack-pilot-mail-worker/index.ts',
 'web/maintrack/public/index.html',
 'web/maintrack/public/inventory-047.css',
 'web/maintrack/public/secure-assets/index-inline-1.js',
 'web/maintrack/public/v6-core.js',
 'web/maintrack/public/v6.js',
 'web/maintrack/public/v6.css'
]);
const unexpected=changed.filter(f=>!allow.has(f));
assert.deepEqual(unexpected,[],'UNREVIEWED_047_UPDATE_SURFACE');
const canonical=[
 'web/maintrack/public/index.html',
 'web/maintrack/public/secure-assets/index-inline-1.js',
 'web/maintrack/public/secure-assets/index-inline-1.css',
 'web/maintrack/public/v6.css',
 'web/maintrack/public/inventory-047.css',
 'web/maintrack/public/v6.js',
 'web/maintrack/public/v6-core.js',
 'web/maintrack/public/v6-core.css'
];
const attestation={
 schema:1,channel:'047-EXPERIMENTAL',status:'SOURCE_AUDITED_ONLY_NO_DEPLOY',
 base:BASE,head,baselineLegacyHtml:{gitBlob:gitBlob(oldRoot),sha256:sha256(oldRoot)},
 baselinePinnedCanonicalJs:{gitBlob:gitBlob(oldJs),sha256:sha256(oldJs)},
 baselineSourceLock:{sha256:sha256(oldLock)},
 changed,
 candidateCanonicalAssets:canonical.map(file=>({path:file,sha256:sha256(readFileSync(resolve(root,file)))})),
 inventoryContractReviewOnly:['ops/maintrack/inventory/001_inventory_core.review.sql','ops/maintrack/inventory/test_inventory_disposable.sql'].map(file=>({path:file,sha256:sha256(readFileSync(resolve(root,file)))})),
 ownerApprovalRequired:true,baselineUntouched:true,
 deploymentAuthorized:false,apiDeploymentAuthorized:false,apkSigningAuthorized:false
};
const out=resolve(root,'audit-output/maintrack-047-source-attestation.json');
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify(attestation,null,2)+'\n');
console.log('PASS MainTrack 0.4.7 source attested — baseline and historical source locks intact; changes='+changed.length);
console.log('NO_DEPLOY / NO_APK / NO_OTA / NO_DATABASE_CHANGE');

