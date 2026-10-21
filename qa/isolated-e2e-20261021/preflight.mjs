// MainTrack offline QA preparation gate. Does NOT contact any API or database.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const allowedRef='szhstrafzkxzstjdcynl';
const target='https://'+allowedRef+'.supabase.co';
const urls=['SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','VITE_SUPABASE_URL','MAINTRACK_API_URL','MAINTRACK_QA_URL'];
let failures=0;
function check(ok,message){ console.log((ok?'PASS: ':'STOP: ')+message);if(!ok)failures++; }
for (const key of urls) {
 const raw=process.env[key];
 if(!raw) continue;
 let url;
 try { url=new URL(raw); } catch { check(false,key+' is not a valid URL');continue; }
 check(url.protocol==='https:'&&url.hostname===new URL(target).hostname,
       key+' targets approved QA project only');
}
const required=[
 'android/maintrack-app/package.json',
 'android/maintrack-app/tests-browser/package.json',
 'android/maintrack-app/tests-browser/role-boundaries.browser.test.mjs',
 'android/maintrack-app/tests-browser/full-functional-approval.browser.test.mjs',
 'ops/maintrack/scripts/prepare-browser-qa.mjs',
 'supabase/functions/maintrack-stage9-security-api/index.ts'
];
for(const name of required){check(fs.existsSync(path.join(root,name)),'expected QA source '+name);}
console.log('QA_ISOLATION_ID='+allowedRef);
console.log('OFFLINE PREFLIGHT ONLY: No database access, no authenticated E2E, no deployment.');
process.exitCode=failures?1:0;
