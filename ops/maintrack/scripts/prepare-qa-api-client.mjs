// Prepare an isolated, reproducible QA API-aligned MainTrack client JS.
// NEVER mutate the canonical Web source or the signed installed 0.4.4 bundle.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkFutureClientApiSource} from './check-next-release-api-parity.mjs';

export const OLD_API='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api';
export const QA_API='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa/api';
export const PINNED_SOURCE_GIT_BLOB='25f37b928eba7857d7ddff08362f575ee1224971';
export const sha256=data=>createHash('sha256').update(data).digest('hex');
export const gitBlob=data=>{
 const bytes=Buffer.from(data);
 return createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
};
export function prepareAlignedClient(original,{pinnedBlob=PINNED_SOURCE_GIT_BLOB}={}){
 assert.equal(gitBlob(original),pinnedBlob,'UNREVIEWED_CANONICAL_WEB_JS_CHANGED');
 assert.equal(original.split(OLD_API).length-1,1,'EXPECTED_SINGLE_LEGACY_API_LITERAL');
 assert.equal(original.split(QA_API).length-1,0,'UNEXPECTED_EXISTING_QA_ENDPOINT');
 assert.ok(original.includes("const API = '"+OLD_API+"'"),'CANONICAL_API_ASSIGNMENT_CHANGED');
 const output=original.replace(OLD_API,QA_API);
 assert.equal(output.length,original.length-OLD_API.length+QA_API.length,'UNEXPECTED_BUNDLE_SIZE');
 assert.equal(output.replace(QA_API,OLD_API),original,'NON_API_CONTENT_CHANGED');
 checkFutureClientApiSource(output);
 return {content:output,record:{
   schema:1,status:'QA_CANDIDATE_NOT_SIGNED_NOT_PUBLISHED',
   appId:'com.icc.maintrack',backend:'maintrack-unified-four-qa',actions:32,
   sourceGitBlob:gitBlob(original),sourceSha256:sha256(original),
   candidateSha256:sha256(output),candidateBytes:Buffer.byteLength(output),
   changedAssets:['secure-assets/index-inline-1.js'],replacements:1,
   releasesEnabled:false,signingEnabled:false,stagingOnly:true
 }};
}
export const root=path.resolve(import.meta.dirname,'../../..');
export const sourcePath=path.join(root,'web/maintrack/public/secure-assets/index-inline-1.js');
export const outputRoot=path.join(root,'audit-output/maintrack-qa-api-candidate');
export const outputPath=path.join(outputRoot,'secure-assets/index-inline-1.js');
export const recordPath=path.join(outputRoot,'provenance.json');

function main(){
 const original=fs.readFileSync(sourcePath,'utf8');
 const prepared=prepareAlignedClient(original);
 const mode=process.argv[2]||'--check';
 if(mode==='--prepare'){
   fs.mkdirSync(path.dirname(outputPath),{recursive:true});
   fs.writeFileSync(outputPath,prepared.content);
   const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
   assert.match(sha,/^[a-f0-9]{40}$/);
   fs.writeFileSync(recordPath,JSON.stringify({...prepared.record,reviewCommit:sha},null,2)+'\n');
 }else if(mode!=='--check')throw Error('UNKNOWN_PREPARE_MODE');
 console.log('PASS source-pin, exact single API rewrite, identical client logic and 32-action QA target; no Web/Android publication.');
 console.log('Source blob:',prepared.record.sourceGitBlob,'Candidate SHA-256:',prepared.record.candidateSha256);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
