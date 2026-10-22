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
 '.github/workflows/maintrack-047-isolated-qa.yml',
 'ops/maintrack/MAINTRACK_047_CHECKPOINTS_AR.md',
 'ops/maintrack/scripts/attest-047-source.mjs',
 'ops/maintrack/tests/test_047_static.cjs',
 'ops/maintrack/tests/test_047_mobile.browser.mjs',
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
 ownerApprovalRequired:true,baselineUntouched:true,
 deploymentAuthorized:false,apiDeploymentAuthorized:false,apkSigningAuthorized:false
};
const out=resolve(root,'audit-output/maintrack-047-source-attestation.json');
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify(attestation,null,2)+'\n');
console.log('PASS MainTrack 0.4.7 source attested — baseline and historical source locks intact; changes='+changed.length);
console.log('NO_DEPLOY / NO_APK / NO_OTA / NO_DATABASE_CHANGE');
