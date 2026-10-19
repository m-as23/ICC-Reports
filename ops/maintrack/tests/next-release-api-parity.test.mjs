import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {checkFutureClientApiSource} from '../scripts/check-next-release-api-parity.mjs';

const old='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api';
const qa='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa/api';
const root=path.resolve(import.meta.dirname,'../../..');

test('future native release permits only the 32-action QA API on existing Supabase Staging',()=>{
 assert.equal(checkFutureClientApiSource('const BASE="'+qa+'";').actions,32);
});
test('legacy 26-action API is rejected before APK build',()=>{
 assert.throws(()=>checkFutureClientApiSource('const BASE="'+old+'";'),/MISSING_REVIEWED_32_ACTION_QA_API/);
});
test('mixed old and new API endpoints are blocked',()=>{
 assert.throws(()=>checkFutureClientApiSource('const old="'+old+'"; const current="'+qa+'";'),/LEGACY_26_ACTION_API_STILL_IN_CLIENT/);
});
test('unreviewed custom API cannot replace the audited QA service',()=>{
 assert.throws(()=>checkFutureClientApiSource('const BASE="https://example.com";'),/MISSING_REVIEWED_32_ACTION_QA_API/);
});
test('canonical source currently remains prelaunch-blocked, not silently rewritten or published',()=>{
 const src=fs.readFileSync(path.join(root,'web/maintrack/public/secure-assets/index-inline-1.js'),'utf8');
 assert.ok(src.includes(old),'SOURCE_STATUS_CHANGED_REVIEW_IS_REQUIRED');
 assert.throws(()=>checkFutureClientApiSource(src),/MISSING_REVIEWED_32_ACTION_QA_API/);
});
