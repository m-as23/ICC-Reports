import test from 'node:test';import assert from 'node:assert/strict';
import {qaConnection,requireBackendTls} from '../recovery/qa-connection.mjs';
test('direct recovery remains explicitly QA pinned with verify-full',()=>{
 const s=qaConnection('maintrack_qa_recovery');assert.match(s,/host=db\.szhstrafzkxzstjdcynl\.supabase\.co port=5432/);assert.match(s,/sslmode=verify-full/);
 assert.match(s,/ user=postgres /);assert.doesNotMatch(s,/user=postgres\.szhstrafzkxzstjdcynl/);
 assert.match(s,/hostaddr=''/,'inherited service address cannot reroute pinned hostname');
});
test('recovery TLS attestation never substitutes client verify-full for backend TLS',()=>{
 for(const d of [null,{backendSsl:false,backendProtocol:null},{backendSsl:true,backendProtocol:'TLSv1.0'}])assert.throws(()=>requireBackendTls(d),/BACKEND_TLS_REQUIRED/);
 assert.deepEqual(requireBackendTls({backendSsl:true,backendProtocol:'TLSv1.3'}),{backendSsl:true,backendProtocol:'TLSv1.3'});
});
test('explicit approved Session Pooler pins project username and endpoint, no fallback',()=>{
 const s=qaConnection('maintrack_qa_recovery','qa-session-pooler');assert.match(s,/host=aws-1-eu-central-1\.pooler\.supabase\.com port=5432 user=postgres\.szhstrafzkxzstjdcynl/);assert.match(s,/dbname=postgres sslmode=verify-full/);
 assert.throws(()=>qaConnection('safe','arbitrary-host'),/INVALID_QA_TRANSPORT/);
 assert.throws(()=>qaConnection('safe host=production'),/INVALID_SERVICE_NAME/);
});
