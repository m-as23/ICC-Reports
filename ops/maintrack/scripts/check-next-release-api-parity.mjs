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

function main(){
 const code=read('web/maintrack/public/secure-assets/index-inline-1.js');
 const mode=process.argv[2]||'--enforce';
 try{
   const r=checkFutureClientApiSource(code);
   console.log('PASS Canonical Web source points only to the 32-action reviewed QA API',JSON.stringify(r));
 }catch(e){
   if(mode==='--audit'){
     console.log('EXPECTED_PRELAUNCH_BLOCK: canonical Web source needs reviewed 32-action API alignment before future native signing.');
     console.log('NO APK MAY BE SIGNED UNTIL THIS IS RESOLVED.');
     return;
   }
   throw e;
 }
 if(mode!=='--audit'&&mode!=='--enforce')throw new Error('UNKNOWN_MODE');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
