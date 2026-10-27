// No deployment, credentials, network calls or changes to canonical source locks.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {prepareFinal047} from './prepare-final-047.mjs';
import {applyLogoutClient,frameHeaders} from './security-client-overlay.mjs';
const root=path.resolve(import.meta.dirname,'../../..');
const target=path.join(root,'audit-output/security-rc');
const hash=b=>createHash('sha256').update(b).digest('hex');
await fs.mkdir(path.dirname(target),{recursive:true});
// Original verifier runs in full, including source locks and file lists.
const base=await prepareFinal047({target});
const changes=[];
for(const folder of ['web','native/www']) {
 const file=path.join(target,folder,'secure-assets/index-inline-1.js');
 const before=await fs.readFile(file,'utf8'),after=applyLogoutClient(before);
 await fs.writeFile(file,after);changes.push({path:folder+'/secure-assets/index-inline-1.js',before:hash(before),after:hash(after),origin:'PR27'});
}
const rules=[];
for(const [page,routes] of [['index.html',['/','/index.html']],['inventory-reference.html',['/inventory-reference.html']]]) {
 const headers=frameHeaders(await fs.readFile(path.join(target,'web',page),'utf8'));
 for(const source of routes)rules.push({source,headers:Object.entries(headers).map(([key,value])=>({key,value}))});
}
await fs.writeFile(path.join(target,'web/vercel.json'),JSON.stringify({headers:rules},null,2)+'\n');
const report={schema:1,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),baseCommit:'54476212144c02a4d730dac5337c343691bd5a48',acceptedSource:base.sourceCommit,canonicalLocksModified:false,changes,headerPolicy:rules,deploy:false,releaseDecision:'NO-GO',reason:'Candidate-bound QA and operational deployment parity require independent evidence'};
await fs.writeFile(path.join(target,'security-provenance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',sourceCommit:report.sourceCommit,changes:changes.length,target,deploy:false}));
