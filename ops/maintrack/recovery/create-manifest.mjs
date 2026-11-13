// Offline manifest creation for a separately captured/reviewed QA snapshot.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const o={};for(let i=2;i<process.argv.length;i+=2)o[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
if(!o.root||!o['source-commit']||!/^[a-f0-9]{40}$/.test(o['source-commit']))throw Error('ROOT_AND_EXACT_COMMIT_REQUIRED');
const root=path.resolve(o.root),hash=x=>crypto.createHash('sha256').update(x).digest('hex');const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('REPARSE_POINT_REFUSED');if(e.isDirectory())walk(p);else{
 const relative=path.relative(root,p).replaceAll('\\','/');if(['manifest.json','manifest.json.sha256'].includes(relative))continue;
 if(/(^|\/)(\.env(?:\..*)?|auth\.json|pgpass\.conf|\.pgpass|.*\.(?:p12|pfx|jks|keystore))$/i.test(relative))throw Error('SECRET_FILE_REFUSED');
 const data=fs.readFileSync(p);if(data.includes(Buffer.from('-----BEGIN PRIVATE KEY-----'))||data.includes(Buffer.from('-----BEGIN RSA PRIVATE KEY-----')))throw Error('PRIVATE_KEY_REFUSED');
 files.push({path:relative,sha256:hash(data)});
}}}
walk(root);files.sort((a,b)=>a.path.localeCompare(b.path));
const phases=[['close-admission','sql','close-admission.sql'],['restore-sessions-counters','sql','restore-sessions-counters.sql'],['restore-edge-core','edge','maintrack-security-qa-final'],['restore-edge-inventory','edge','maintrack-security-qa-inventory'],['stop-owned-job','sql','stop-owned-job.sql'],['restore-database-catalog','sql','restore-database-catalog.sql'],['verify-baseline','sql','verify-baseline.sql']].map(([id,kind,target])=>kind==='sql'?{id,kind,file:target}:{id,kind,function:target,entrypoint:`edge/supabase/functions/${target}/index.ts`});
for(const phase of phases){if(!files.some(f=>f.path===(phase.file||phase.entrypoint)))throw Error('MISSING_REVIEWED_PHASE_PAYLOAD');}
if(!files.some(f=>f.path==='edge/supabase/config.toml'))throw Error('PINNED_EDGE_CONFIG_REQUIRED');
const manifest={schema:1,projectRef:'szhstrafzkxzstjdcynl',sourceCommit:o['source-commit'],createdUtc:new Date().toISOString(),edgeWorkdir:'edge',files,phases,scope:['qa_security_final_20261025','qa_security_inventory_20261025','maintrack_qa_lease','maintrack_qa_permanent'],independentCloudAccessVerified:false};
const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),output=path.join(root,'manifest.json');fs.writeFileSync(output,bytes);fs.writeFileSync(output+'.sha256',hash(bytes)+'  manifest.json\n');console.log(JSON.stringify({manifest:output,sha256:hash(bytes),fileCount:files.length,cloudAccessVerified:false}));
