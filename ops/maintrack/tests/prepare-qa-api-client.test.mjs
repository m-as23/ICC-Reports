import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {checkFutureClientApiSource} from '../scripts/check-next-release-api-parity.mjs';
import {prepareAlignedClient,gitBlob,sha256,OLD_API,QA_API,PINNED_SOURCE_GIT_BLOB,sourcePath} from '../scripts/prepare-qa-api-client.mjs';

const actual=fs.readFileSync(sourcePath,'utf8');
test('canonical Web script matches reviewed blob and is never mutated',()=>{
 assert.equal(gitBlob(actual),PINNED_SOURCE_GIT_BLOB);
 const {content,record}=prepareAlignedClient(actual);
 assert.equal(content.split(OLD_API).length,1);
 assert.equal(content.split(QA_API).length,2);
 assert.equal(content.replace(QA_API,OLD_API),actual);
 assert.equal(record.sourceGitBlob,PINNED_SOURCE_GIT_BLOB);
 assert.equal(record.candidateSha256,sha256(content));
 assert.equal(record.replacements,1);
 assert.equal(checkFutureClientApiSource(content).actions,32);
 assert.equal(record.releasesEnabled,false);
});
test('any change to original JS fails closed even if the API URL remains the same',()=>{
 assert.throws(()=>prepareAlignedClient(actual+'//unexpected'),/UNREVIEWED_CANONICAL_WEB_JS_CHANGED/);
});
test('legacy API remains in canonical source and no live Web application was rewritten',()=>{
 assert.ok(actual.includes(OLD_API));
 assert.ok(!actual.includes(QA_API));
});
test('duplicate API references are rejected even with a matching test blob',()=>{
 const contaminated=actual+OLD_API;
 assert.throws(()=>prepareAlignedClient(contaminated,{pinnedBlob:gitBlob(contaminated)}),/EXPECTED_SINGLE_LEGACY_API_LITERAL/);
});
test('new API in source without review is rejected',()=>{
 const contaminated=actual.replace(OLD_API,QA_API);
 assert.throws(()=>prepareAlignedClient(contaminated,{pinnedBlob:PINNED_SOURCE_GIT_BLOB}),/UNREVIEWED_CANONICAL_WEB_JS_CHANGED/);
});
test('tampered unexpected API assignment fails before change',()=>{
 const contaminated=actual.replace('const API =','let API =');
 assert.throws(()=>prepareAlignedClient(contaminated,{pinnedBlob:gitBlob(contaminated)}),/CANONICAL_API_ASSIGNMENT_CHANGED/);
});
