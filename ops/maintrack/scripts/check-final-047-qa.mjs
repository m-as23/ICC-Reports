import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const requiredFinalChecks=[
 'v0.4.7 — syntax, leave overlap, roles, mail duration, immutable legacy root',
 'v0.4.7 — pinned inventory SQL contract on disposable Postgres only',
 'v0.4.7 — mobile Chromium form collision QA (offline backend)',
 'MainTrack Staging-only QA — required combined result',
 'Actual candidate Chromium — cache, account isolation, numerals'
];
export function finalQAPasses(checks,sha){
 if(!/^[a-f0-9]{40}$/.test(sha||'')||!Array.isArray(checks))return false;
 return requiredFinalChecks.every(name=>{
  const latest=checks.filter(c=>c.name===name&&c.head_sha===sha&&c.app?.slug==='github-actions').sort((a,b)=>b.id-a.id)[0];
  return latest?.status==='completed'&&latest.conclusion==='success';
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 process.exitCode=finalQAPasses(data.check_runs,process.env.GITHUB_SHA)?0:1;
}
