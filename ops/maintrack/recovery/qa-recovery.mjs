// Standalone native Node runner. No MCP dependency, no Windows policy changes.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {qaConnection} from './qa-connection.mjs';
const REF='szhstrafzkxzstjdcynl';
const args=process.argv.slice(2),opt={};for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||args[i+1]===undefined)throw Error('INVALID_ARGUMENTS');opt[args[i].slice(2)]=args[i+1];}
const mode=opt.mode||'Preflight';if(!['Preflight','DryRun','Restore'].includes(mode))throw Error('INVALID_MODE');
const report={schema:1,mode,projectRef:REF,startedUtc:new Date().toISOString(),snapshot:'NOT TESTED',sqlAccess:'BLOCKED',edgeRead:'BLOCKED',sqlRestore:'NOT TESTED',edgeRestore:'NOT TESTED',mutations:0,phases:[],errors:[],dependency:'Same machine, Windows user credential store and network; process-independent of Codex/MCP only',restoreAuthorized:false};
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function file(root,relative){if(typeof relative!=='string'||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw Error('SNAPSHOT_PATH_ESCAPE');const target=path.resolve(root,relative);if(!target.toLowerCase().startsWith((root+path.sep).toLowerCase()))throw Error('SNAPSHOT_PATH_ESCAPE');let p=target;while(p!==root){if(fs.lstatSync(p).isSymbolicLink())throw Error('SNAPSHOT_REPARSE_POINT');p=path.dirname(p);}if(!fs.statSync(target).isFile())throw Error('SNAPSHOT_FILE_INVALID');return target;}
function tool(command,argv){const r=spawnSync(command,argv,{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8*1024*1024});if(r.error||r.status!==0)throw Error('TOOL_FAILED_NO_SECRET_OUTPUT');return r.stdout;}
function present(command){try{tool(command,['--version']);return true;}catch{return false;}}
let manifest,root,connection;
try{
 report.tools={psql:present(opt.psql||'psql'),supabase:present(opt.supabase||'supabase')};
 if(opt.manifest){
  if(!/^[a-fA-F0-9]{64}$/.test(opt['manifest-sha256']||''))throw Error('PINNED_MANIFEST_SHA_REQUIRED');const mf=path.resolve(opt.manifest);root=path.dirname(mf);const bytes=fs.readFileSync(mf);if(hash(bytes)!==opt['manifest-sha256'].toLowerCase())throw Error('MANIFEST_HASH_MISMATCH');manifest=JSON.parse(bytes);
  if(manifest.schema!==1||manifest.projectRef!==REF||!/^[a-f0-9]{40}$/.test(manifest.sourceCommit||''))throw Error('SNAPSHOT_IDENTITY_INVALID');if(!Array.isArray(manifest.files)||!manifest.files.length)throw Error('INCOMPLETE_SNAPSHOT');
  for(const e of manifest.files){if(!/^[a-f0-9]{64}$/.test(e.sha256||'')||hash(fs.readFileSync(file(root,e.path)))!==e.sha256)throw Error('SNAPSHOT_FILE_HASH_MISMATCH');}
  const phases=['close-admission','restore-sessions-counters','restore-edge-core','restore-edge-inventory','stop-owned-job','restore-database-catalog','verify-baseline'];if(JSON.stringify(manifest.phases?.map(x=>x.id))!==JSON.stringify(phases))throw Error('PHASE_ORDER_INVALID');
  for(const phase of manifest.phases){if(phase.id.startsWith('restore-edge-') !== (phase.kind==='edge'))throw Error('PHASE_KIND_INVALID');if(phase.kind==='sql'){if(!manifest.files.some(x=>x.path===phase.file))throw Error('UNPINNED_SQL');}else if(phase.kind==='edge'){if(!['maintrack-security-qa-final','maintrack-security-qa-inventory'].includes(phase.function)||!manifest.files.some(x=>x.path===phase.entrypoint))throw Error('UNPINNED_EDGE');}else throw Error('PHASE_KIND_INVALID');}
  if(typeof manifest.edgeWorkdir!=='string'||!manifest.files.some(x=>x.path===manifest.edgeWorkdir.replaceAll('\\','/')+'/supabase/config.toml'))throw Error('PINNED_EDGE_CONFIG_REQUIRED');report.snapshot='VERIFIED';report.phases=phases;
 }
 if(mode==='DryRun'){if(!manifest)throw Error('MANIFEST_REQUIRED');report.sqlAccess='NOT TESTED';report.edgeRead='NOT TESTED';}
 else{
  if(opt.service){
   connection=qaConnection(opt.service,opt.transport||'direct');report.transport=opt.transport||'direct';
   const sql="BEGIN READ ONLY;SELECT json_build_object('projectRef',(SELECT project_ref FROM qa_security_final_20261025.qa_scope WHERE singleton),'createRole',(SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user),'schemaCreate',has_schema_privilege(current_user,'qa_security_final_20261025','CREATE'),'cleanupMember',pg_has_role(current_user,'maintrack_qa_cleanup_worker','MEMBER'));ROLLBACK;";
   try{const data=JSON.parse(tool(opt.psql||'psql',['-X','-q','-t','-A','--no-password','--set','ON_ERROR_STOP=1','--dbname',connection,'--command',sql]));if(data.projectRef!==REF)throw Error('WRONG_PROJECT');report.sqlAccess='VERIFIED_READ_ONLY';report.sqlCapabilities={createRole:data.createRole,schemaCreate:data.schemaCreate,cleanupMember:data.cleanupMember};}catch{report.errors.push('SQL_READ_ACCESS_NOT_VERIFIED');}
  }else report.errors.push('QA_NAMED_SERVICE_REQUIRED');
  if(report.tools.supabase){try{const rows=JSON.parse(tool(opt.supabase||'supabase',['functions','list','--project-ref',REF,'--output','json']));if(!Array.isArray(rows)||!['maintrack-security-qa-final','maintrack-security-qa-inventory'].every(n=>rows.some(x=>x.slug===n)))throw Error('FUNCTION_IDENTITY_MISMATCH');report.edgeRead='VERIFIED_METADATA_ONLY';}catch{report.errors.push('EDGE_READ_ACCESS_NOT_VERIFIED');}}else report.errors.push('SUPABASE_CLI_REQUIRED');
 }
 if(mode==='Restore'){
  if(!manifest||!opt.approval)throw Error('EXPLICIT_APPROVAL_REQUIRED');const approval=JSON.parse(fs.readFileSync(opt.approval));if(approval.projectRef!==REF||approval.manifestSha256!==opt['manifest-sha256'].toLowerCase()||approval.action!=='RESTORE_QA_SNAPSHOT'||approval.ownerApproval!==true||JSON.stringify(approval.phases)!==JSON.stringify(report.phases)||!(Date.parse(approval.expiresUtc)>Date.now()))throw Error('APPROVAL_SCOPE_INVALID');
  if(opt['execute-approved-restore']!=='yes'||approval.independentRehearsalVerified!==true)throw Error('RESTORE_EXECUTION_BLOCKED_PENDING_INDEPENDENT_CLOUD_REHEARSAL');
  if(report.sqlAccess!=='VERIFIED_READ_ONLY'||report.edgeRead!=='VERIFIED_METADATA_ONLY')throw Error('LIVE_ACCESS_REQUIRED');report.restoreAuthorized=true;
  for(const phase of manifest.phases){try{for(const e of manifest.files){if(hash(fs.readFileSync(file(root,e.path)))!==e.sha256)throw Error('SNAPSHOT_CHANGED_BEFORE_RESTORE');}report.mutations++;if(phase.kind==='sql'){tool(opt.psql||'psql',['-X','--no-password','--set','ON_ERROR_STOP=1','--dbname',connection,'--file',file(root,phase.file)]);report.sqlRestore='EXECUTED_PENDING_INDEPENDENT_VERIFICATION';}else{
   if(!manifest.edgeWorkdir)throw Error('EDGE_WORKDIR_REQUIRED');const work=path.resolve(root,manifest.edgeWorkdir);if(file(root,phase.entrypoint)!==path.join(work,'supabase','functions',phase.function,'index.ts'))throw Error('EDGE_ENTRYPOINT_MISMATCH');
   const scan=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isSymbolicLink())throw Error('SNAPSHOT_REPARSE_POINT');if(e.isDirectory())scan(p);else if(!manifest.files.some(x=>path.resolve(root,x.path)===p))throw Error('UNPINNED_EDGE_FILE');}};scan(work);
   tool(opt.supabase||'supabase',['functions','deploy',phase.function,'--project-ref',REF,'--workdir',work,'--use-api']);report.edgeRestore='EXECUTED_PENDING_INDEPENDENT_VERIFICATION';
  }}catch{report.errors.push('AMBIGUOUS_RESTORE_STOP_NO_RETRY');break;}}
  report.independentVerification='REQUIRED';
 }
}catch(e){report.errors.push(/^[A-Z_]+$/.test(e.message)?e.message:'RECOVERY_VALIDATION_FAILED');}
report.finishedUtc=new Date().toISOString();if(opt.output)fs.writeFileSync(path.resolve(opt.output),JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify(report,null,2)+'\n');process.exitCode=report.errors.length?2:0;
