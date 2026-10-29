import test from 'node:test';import assert from 'node:assert/strict';
import {qaConnection} from '../recovery/qa-connection.mjs';
test('direct recovery remains explicitly QA pinned with verify-full',()=>{
 const s=qaConnection('maintrack_qa_recovery');assert.match(s,/host=db\.szhstrafzkxzstjdcynl\.supabase\.co port=5432/);assert.match(s,/sslmode=verify-full/);
});
test('explicit approved Session Pooler pins project username and endpoint, no fallback',()=>{
 const s=qaConnection('maintrack_qa_recovery','qa-session-pooler');assert.match(s,/host=aws-1-eu-central-1\.pooler\.supabase\.com port=5432 user=postgres\.szhstrafzkxzstjdcynl/);assert.match(s,/dbname=postgres sslmode=verify-full/);
 assert.throws(()=>qaConnection('safe','arbitrary-host'),/INVALID_QA_TRANSPORT/);
 assert.throws(()=>qaConnection('safe host=production'),/INVALID_SERVICE_NAME/);
});
