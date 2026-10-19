// Fail closed if future Web/Android source still targets the old 26-action API.
// This checks source only: no network mutation, bundle signing or deployment.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'../../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const OLD='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api';
const QA='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa/api';

export function checkFutureClientApiSource(source,{expected=QA}={}){
 assert.ok(expected===QA,'UNREVIEWED_API_ENDPOINT');
 assert.ok(source.includes(expected),'MISSING_REVIEWED_32_ACTION_QA_API');
 assert.ok(!source.includes(OLD),'LEGACY_26_ACTION_API_STILL_IN_CLIENT');
 const urls=[...new Set([...source.matchAll(/https:\/\/tdnkeskczcsukcujwinu\.supabase\.co\/functions\/v1\/[a-zA-Z0-9_-]+\/api/g)].map(m=>m[0]))];
 assert.deepEqual(urls,[expected],'MULTIPLE_OR_UNAPPROVED_API_ENDPOINTS');
 return {backend:'maintrack-unified-four-qa',actions:32,unified:true};
}

async function main(){
 const mode=process.argv[2]||'--enforce';
 if(mode==='--candidate'){
   const {prepareAlignedClient,sourcePath,outputPath,recordPath,root,sha256}=await import('./prepare-qa-api-client.mjs');
   const original=fs.readFileSync(sourcePath,'utf8');
   const prepared=prepareAlignedClient(original);
   const actual=fs.readFileSync(outputPath,'utf8');
   const record=JSON.parse(fs.readFileSync(recordPath,'utf8'));
   const {execFileSync}=await import('node:child_process');
   const reviewedSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
   assert.equal(actual,prepared.content,'QA_CANDIDATE_CONTENT_NOT_DETERMINISTIC');
   for(const k of ['schema','appId','backend','actions','sourceGitBlob','sourceSha256',
                   'candidateSha256','candidateBytes','replacements','stagingOnly',
                   'releasesEnabled','signingEnabled','status'])
     assert.deepEqual(record[k],prepared.record[k],'QA_CANDIDATE_RECORD_TAMPERED: '+k);
   assert.equal(record.reviewCommit,reviewedSha,'QA_CANDIDATE_WRONG_COMMIT');
   assert.equal(sha256(actual),record.candidateSha256,'QA_CANDIDATE_HASH_MISMATCH');
   checkFutureClientApiSource(actual);
   console.log('PASS exact source-locked 32-action Staging QA API candidate, unchanged application logic.');
   console.log('NO_APK_BUILD / NO_OTA / NO_WEB_DEPLOY / NO_DATABASE_WRITE');
   return;
 }
 if(mode!=='--audit'&&mode!=='--enforce')throw Error('UNKNOWN_MODE');
 const code=read('web/maintrack/public/secure-assets/index-inline-1.js');
 try{
   const result=checkFutureClientApiSource(code);
   console.log('PASS Canonical Web source uses reviewed 32-action QA API',JSON.stringify(result));
 }catch(e){
   if(mode==='--audit'){
     console.log('EXPECTED_SOURCE_LOCK: canonical source still uses legacy URL; isolated candidate required.');
     console.log('NO_DEPLOYMENT_AUTHORIZED');
     return;
   }
   throw e;
 }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
