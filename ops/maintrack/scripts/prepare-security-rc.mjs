// No deployment, credentials, network calls or changes to canonical source locks.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {prepareFinal047} from './prepare-final-047.mjs';
import {applyLogoutClient,frameHeaderRules,frameHostingConfig} from './security-client-overlay.mjs';
const root=path.resolve(import.meta.dirname,'../../..');
const folder=process.env.MAINTRACK_SECURITY_RC_FOLDER||'security-rc';
if(!/^security-rc(?:-[a-z0-9-]+)?$/.test(folder))throw Error('INVALID_RC_OUTPUT_FOLDER');
const target=path.join(root,'audit-output',folder);
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
const htmlPaths=(await fs.readdir(path.join(target,'web'),{recursive:true})).filter(name=>name.endsWith('.html')).sort();
const pages=await Promise.all(htmlPaths.map(async name=>({name:name.replaceAll('\\','/'),html:await fs.readFile(path.join(target,'web',name),'utf8')})));
const rules=frameHeaderRules(pages);
await fs.writeFile(path.join(target,'web/vercel.json'),JSON.stringify(frameHostingConfig(pages),null,2)+'\n');
const report={schema:1,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),baseCommit:'54476212144c02a4d730dac5337c343691bd5a48',acceptedSource:base.sourceCommit,canonicalLocksModified:false,changes,headerPolicy:rules,deploy:false,releaseDecision:'NO-GO',reason:'Candidate-bound QA and operational deployment parity require independent evidence'};
await fs.writeFile(path.join(target,'security-provenance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',sourceCommit:report.sourceCommit,changes:changes.length,target,deploy:false}));
