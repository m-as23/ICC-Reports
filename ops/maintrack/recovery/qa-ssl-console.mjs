// Standalone QA-only console. No MCP, password parsing, background scheduling or automatic retry.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {qaConnection} from './qa-connection.mjs';
export const QA_REF='szhstrafzkxzstjdcynl';
export const OWNER_SHA='a4920385692c72921f4fdcce546ec4ffcb140bffddf13a13f20d5dff2c7132b1';
export const ACK='QA_CONFIG_ONLY_REBOOT:'+QA_REF;
const RECOVERY=path.resolve('D:/MainTrack-QA-Recovery');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sleepSync=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
function spaceExternal(j,now=Date.now,wait=sleepSync){
 if(j.lastExternalFinishedMs===undefined)return;
 const delay=Math.max(0,2600-(now()-j.lastExternalFinishedMs));
 if(j.deadlineMs-now()<=delay)throw Error('MAINTENANCE_DEADLINE');
 if(delay)wait(delay);
}
export function plan(options={}){
 const mode=options.mode||'Preflight';
 if(!['Preflight','Maintenance','Observe'].includes(mode))throw Error('INVALID_MODE');
 if(options['project-ref']&&options['project-ref']!==QA_REF)throw Error('WRONG_QA_PROJECT');
 if(Object.keys(options).some(k=>!['mode','project-ref','run-dir','snapshot-sha256'].includes(k)))throw Error('UNKNOWN_OPTION');
 return {mode,projectRef:QA_REF,transport:'qa-session-pooler',connection:qaConnection('maintrack_qa_recovery','qa-session-pooler'),maximumMinutes:15,maximumCliInvocations:8,maximumEnableWrites:1,cloudAcceptance:'NOT TESTED',credentialHandling:'Official terminal prompts only; Node never reads passwords'};
}
export function requireAcknowledgement({inputTTY,outputTTY,ack,now,deadline}){
 if(inputTTY!==true||outputTTY!==true)throw Error('REAL_INTERACTIVE_TERMINAL_REQUIRED');
 if(now>=deadline)throw Error('MAINTENANCE_DEADLINE');
 if(ack!==ACK)throw Error('CONFIG_ONLY_REBOOT_NOT_ACKNOWLEDGED');
}
export function config(value){
 if(value?.appliedSuccessfully!==true||typeof value?.currentConfig?.database!=='boolean')throw Error('SSL_CONFIGURATION_NOT_SETTLED');
 return {database:value.currentConfig.database,appliedSuccessfully:true};
}
export function backupSummary(value){return {listedArtifacts:Array.isArray(value?.backups)?value.backups.length:null,pitrEnabled:value?.pitr_enabled===true,fullDataRecoveryVerified:false};}
export function requireMetadata(m){
 if(m?.projectRef!==QA_REF||m.database!=='postgres'||m.sqlUser!=='postgres'||m.sessionUser!=='postgres'||m.createRole!==true)throw Error('ADMIN_OR_QA_IDENTITY_UNPROVEN');
 for(const k of ['cronJobs','activeCronJobs','ledgerRows','validSessions','unclosedLeases','activeClientTransactions','qaRuntimeConnections']){
  if(!Number.isSafeInteger(m[k])||m[k]!==0)throw Error('QA_NOT_QUIESCENT_'+k.toUpperCase());
 }
 if(m.permanentSchemaPresent!==false)throw Error('UNREVIEWED_PERMANENT_SCHEMA');
 if(!Number.isSafeInteger(m.sessionRows)||m.sessionRows<0)throw Error('SESSION_BASELINE_UNPROVEN');
 return m;
}
export const metadataQuery=`BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT json_build_object(
 'projectRef',(SELECT project_ref FROM qa_security_final_20261025.qa_scope WHERE singleton),
 'database',current_database(),'sqlUser',current_user,'sessionUser',session_user,
 'createRole',(SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user),
 'backendSsl',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),
 'backendProtocol',(SELECT version FROM pg_stat_ssl WHERE pid=pg_backend_pid()),
 'cronJobs',(SELECT count(*) FROM cron.job),'activeCronJobs',(SELECT count(*) FROM cron.job WHERE active),
 'ledgerRows',(SELECT count(*) FROM maintrack_qa_lease.sessions),
 'validSessions',(SELECT count(*) FROM qa_security_final_20261025.mt_sessions WHERE expires_at>clock_timestamp()),
 'sessionRows',(SELECT count(*) FROM qa_security_final_20261025.mt_sessions),
 'unclosedLeases',(SELECT count(*) FROM maintrack_qa_lease.runs WHERE (state IN ('COMPLETE','FAILED') AND verified IS TRUE) IS NOT TRUE),
 'permanentSchemaPresent',EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='maintrack_qa_permanent'),
 'activeClientTransactions',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid() AND xact_start IS NOT NULL),
 'qaRuntimeConnections',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND usename LIKE 'maintrack_qa_%')
);
ROLLBACK;`;
function writeDurable(file,value){
 const tmp=file+'.tmp',fd=fs.openSync(tmp,'w');try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);
}
function confined(dir,{existing=false}={}){
 const p=path.resolve(dir);
 if(!p.toLowerCase().startsWith((RECOVERY+path.sep).toLowerCase()))throw Error('RECOVERY_DIRECTORY_REQUIRED');
 for(let x=p;x!==path.dirname(x);x=path.dirname(x))if(fs.existsSync(x)&&fs.lstatSync(x).isSymbolicLink())throw Error('REPARSE_POINT_REFUSED');
 if(existing&&!fs.statSync(p).isDirectory())throw Error('RUN_DIRECTORY_REQUIRED');
 return p;
}
function regularFile(file){if(fs.lstatSync(file).isSymbolicLink()||!fs.lstatSync(file).isFile())throw Error('REGULAR_RUN_FILE_REQUIRED');return fs.readFileSync(file);}
export class InvocationBudget{
 constructor({now=Date.now,wait=sleepSync,run=spawnSync,journal,save}){Object.assign(this,{now,wait,run,journal,save});}
 dispatch(args,{write=false,timeout=30000}={}){
  const j=this.journal,remaining=j.deadlineMs-this.now();
  if(remaining<=0)throw Error('MAINTENANCE_DEADLINE');
  if(j.cliInvocations>=8)throw Error('CLI_INVOCATION_LIMIT');
  if(write&&j.enableAttempted)throw Error('ENABLE_WRITE_ALREADY_ATTEMPTED');
  spaceExternal(j,this.now,this.wait);
  const dispatchRemaining=j.deadlineMs-this.now();if(dispatchRemaining<=0)throw Error('MAINTENANCE_DEADLINE');
  if(write)j.enableAttempted=true;
  j.cliInvocations++;j.operations.push({ordinal:j.cliInvocations,command:args.slice(0,2).join(' '),write,dispatchedUtc:new Date(this.now()).toISOString()});this.save();
  const result=this.run('supabase',args,{encoding:'utf8',windowsHide:true,timeout:Math.min(timeout,dispatchRemaining),maxBuffer:1024*1024});
  j.lastExternalFinishedMs=this.now();j.operations.at(-1).exitCode=result.status??null;this.save();
  if(result.error||result.status!==0)throw Error(write?'ENABLE_OUTCOME_AMBIGUOUS_NO_RETRY':'READ_FAILED_NO_SECRET_OUTPUT');
  return result.stdout;
 }
}
const cliArgs=(group,action)=>[group,action,'--project-ref',QA_REF,'--output','json',...(group==='ssl-enforcement'?['--experimental']:[])];
function sourceIdentity(){
 const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
 const r=spawnSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true,timeout:5000});
 const s=spawnSync('git',['-C',repo,'status','--porcelain'],{encoding:'utf8',windowsHide:true,timeout:5000});
 if(r.status!==0||s.status!==0||s.stdout.trim()||!/^[a-f0-9]{40}$/.test(r.stdout.trim()))throw Error('CLEAN_EXACT_SOURCE_REQUIRED');return r.stdout.trim();
}
function privateDirectory(dir){
 if(fs.existsSync(dir))throw Error('NEW_RUN_DIRECTORY_REQUIRED');
 const id=spawnSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true,timeout:5000});
 const sid=id.stdout?.match(/S-1-5-[0-9-]+/)?.[0];if(id.status!==0||!sid)throw Error('WINDOWS_USER_SID_REQUIRED');
 fs.mkdirSync(dir);
 const a=spawnSync('icacls.exe',[dir,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{encoding:'utf8',windowsHide:true,timeout:5000});
 if(a.status!==0)throw Error('PRIVATE_RUN_ACL_FAILED');
}
function owner(budget){
 let user;try{user=JSON.parse(budget.dispatch(['whoami','--output-format','json']));}catch(e){if(/^[A-Z_]+$/.test(e.message))throw e;throw Error('CLI_IDENTITY_UNREADABLE');}
 if(typeof user.id!=='string'||sha(user.id)!==OWNER_SHA)throw Error('VERIFIED_OWNER_IDENTITY_REQUIRED');
 return OWNER_SHA;
}
function getConfig(budget){try{return config(JSON.parse(budget.dispatch(cliArgs('ssl-enforcement','get'))));}catch(e){throw Error(/^[A-Z_]+$/.test(e.message)?e.message:'SSL_CONFIG_UNREADABLE');}}
function readMetadata(p,dir,journal,save){
 spaceExternal(journal);
 const remaining=journal.deadlineMs-Date.now();if(remaining<30000)throw Error('MAINTENANCE_DEADLINE');
 journal.operations.push({command:'psql read-only aggregate',write:false,dispatchedUtc:new Date().toISOString()});save();
 const file=path.join(dir,'quiescence.json');
 const result=spawnSync('psql.exe',['-X','--password','-q','-t','-A','--set','ON_ERROR_STOP=1','--dbname',p.connection,'--command',metadataQuery,'--output',file],{stdio:'inherit',windowsHide:false,timeout:Math.min(120000,remaining)});
 journal.lastExternalFinishedMs=Date.now();save();
 if(result.error||result.status!==0)throw Error('INTERACTIVE_PREFLIGHT_FAILED_NO_RETRY');
 let m;try{m=JSON.parse(fs.readFileSync(file,'utf8').trim());}catch{throw Error('METADATA_UNREADABLE');}return requireMetadata(m);
}
async function readAck(deadline){
 const rl=createInterface({input:process.stdin,output:process.stdout});const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),Math.max(1,deadline-Date.now()));
 try{return await rl.question(`QA only. This operation can reboot the database. No verified full database/data backup is supplied.\nConfig-only rollback cannot restore data, Edge, Storage or Scheduler.\nAn independent operator must remain available. To acknowledge these exact limits type:\n${ACK}\n> `,{signal:ac.signal});}finally{clearTimeout(timer);rl.close();}
}
async function execute(options){
 const p=plan(options);if(process.platform!=='win32')throw Error('NATIVE_WINDOWS_CONSOLE_REQUIRED');
 const tty=process.stdin.isTTY===true&&process.stdout.isTTY===true;
 if(p.mode==='Maintenance'&&!tty)throw Error('REAL_INTERACTIVE_TERMINAL_REQUIRED');
 const started=Date.now();let dir,journal,snapshotDigest,lockOwned=false;
 const lock=path.join(RECOVERY,'ssl-maintenance-active.json');
 if(p.mode==='Observe'){
  if(!options['run-dir']||!/^[a-f0-9]{64}$/.test(options['snapshot-sha256']||''))throw Error('PINNED_SNAPSHOT_REQUIRED');
  dir=confined(options['run-dir'],{existing:true});const bytes=regularFile(path.join(dir,'ssl-snapshot.json'));
  if(sha(bytes)!==options['snapshot-sha256'])throw Error('SNAPSHOT_HASH_MISMATCH');const snapshot=JSON.parse(bytes);
  if(snapshot.projectRef!==QA_REF||snapshot.ownerIdSha256!==OWNER_SHA)throw Error('SNAPSHOT_IDENTITY_INVALID');config({appliedSuccessfully:true,currentConfig:snapshot.previousConfig});
  journal={projectRef:QA_REF,mode:'Observe',deadlineMs:started+60000,cliInvocations:0,operations:[],writeWindowRearmed:false};
  const save=()=>writeDurable(path.join(dir,'observation-'+started+'.json'),journal);const budget=new InvocationBudget({journal,save});owner(budget);journal.currentConfig=getConfig(budget);journal.status='READ_ONLY_OBSERVATION';save();
  return {projectRef:QA_REF,mode:'Observe',runDirectory:dir,currentConfig:journal.currentConfig,writeWindowRearmed:false,cloudMutations:0};
 }
 if(options['run-dir']||options['snapshot-sha256'])throw Error('NEW_RUN_ONLY');
 dir=confined(path.join(RECOVERY,'ssl-console-'+new Date(started).toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex')));privateDirectory(dir);
 journal={projectRef:QA_REF,mode:p.mode,sourceCommit:sourceIdentity(),startedUtc:new Date(started).toISOString(),deadlineMs:started+900000,cliInvocations:0,enableAttempted:false,operations:[],status:'PREFLIGHT',scope:'SSL config only; no verified full-data backup or cloud restore',runDirectory:dir};
 const save=()=>writeDurable(path.join(dir,'journal.json'),journal);save();const budget=new InvocationBudget({journal,save});
 try{
  journal.ownerIdSha256=owner(budget);const previous=getConfig(budget);
  let backups;try{backups=JSON.parse(budget.dispatch(cliArgs('backups','list')));}catch{throw Error('BACKUP_METADATA_UNREADABLE');}
  const snapshot={projectRef:QA_REF,sourceCommit:journal.sourceCommit,ownerIdSha256:OWNER_SHA,capturedUtc:new Date().toISOString(),previousConfig:{database:previous.database},backupMetadata:backupSummary(backups),fullDataRecoveryVerified:false};
  writeDurable(path.join(dir,'ssl-snapshot.json'),snapshot);snapshotDigest=sha(fs.readFileSync(path.join(dir,'ssl-snapshot.json')));journal.snapshotSha256=snapshotDigest;
  journal.emergencyRestorePrevious={executed:false,requiresIndependentOwnerDecision:true,projectRef:QA_REF,snapshotSha256:snapshotDigest,originalDatabaseSsl:previous.database,command:`supabase ssl-enforcement update --project-ref ${QA_REF} --${previous.database?'enable':'disable'}-db-ssl-enforcement --experimental`,warning:'Exact original setting only. Restoring false reduces protection and reboots QA; never execute automatically or treat it as data restore.'};save();
  if(!tty){journal.status='BLOCKED_INTERACTIVE_SQL_PREFLIGHT_REQUIRED';save();return {projectRef:QA_REF,mode:p.mode,status:journal.status,runDirectory:dir,snapshotSha256:snapshotDigest,cloudMutations:0};}
  if(p.mode==='Maintenance')requireAcknowledgement({inputTTY:process.stdin.isTTY,outputTTY:process.stdout.isTTY,ack:await readAck(journal.deadlineMs),now:Date.now(),deadline:journal.deadlineMs});
  if(p.mode==='Maintenance'){
   const fd=fs.openSync(lock,'wx');try{fs.writeFileSync(fd,JSON.stringify({projectRef:QA_REF,runDirectory:dir,pid:process.pid,snapshotSha256:snapshotDigest})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}lockOwned=true;
  }
  const meta=readMetadata(p,dir,journal,save);journal.quiescenceSha256=sha(fs.readFileSync(path.join(dir,'quiescence.json')));journal.expiredSessionRowsRetained=meta.sessionRows;save();
  if(p.mode==='Preflight'){journal.status='READ_ONLY_PREFLIGHT_PASSED_NOT_WRITE_PROOF';save();return {projectRef:QA_REF,status:journal.status,runDirectory:dir,snapshotSha256:snapshotDigest,cloudMutations:0};}
  if(getConfig(budget).database!==previous.database)throw Error('SSL_BASELINE_CHANGED');
  if(journal.deadlineMs-Date.now()<600000)throw Error('RECOVERY_AND_CAPTURE_RESERVE_REQUIRED');
  if(previous.database===false){journal.status='ENABLE_DISPATCHING';save();budget.dispatch(['ssl-enforcement','update','--project-ref',QA_REF,'--enable-db-ssl-enforcement','--experimental'],{write:true,timeout:90000});}
  if(getConfig(budget).database!==true)throw Error('SSL_ENABLE_NOT_CONFIRMED_OBSERVE_NO_RETRY');
  journal.status='SSL_APPLIED_PENDING_STRICT_CAPTURE';save();
  if(journal.deadlineMs-Date.now()<480000)throw Error('CAPTURE_RESERVE_EXHAUSTED');
  spaceExternal(journal);
  journal.operations.push({command:'existing strict schema capture via pooler',write:false,dispatchedUtc:new Date().toISOString()});save();
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./capture-qa-schema.mjs',import.meta.url)),'--mode','Capture','--execute-readonly','yes','--transport','qa-session-pooler','--source-commit',journal.sourceCommit,'--output',path.join(dir,'capture')],{stdio:'inherit',windowsHide:false,timeout:Math.min(450000,journal.deadlineMs-Date.now())});
  if(result.error||result.status!==0)throw Error('STRICT_CAPTURE_FAILED_NO_RETRY');
  const capture=JSON.parse(fs.readFileSync(path.join(dir,'capture','capture-manifest.json'),'utf8'));
  if(capture.projectRef!==QA_REF||capture.transport!=='qa-session-pooler'||capture.tlsEvidence?.backendSsl!==true||capture.status!=='CAPTURED_PENDING_SECRET_REVIEW_AND_LOCAL_RESTORE')throw Error('CAPTURE_ATTESTATION_INCOMPLETE');
  journal.captureManifestSha256=sha(fs.readFileSync(path.join(dir,'capture','capture-manifest.json')));journal.status='CAPTURED_PENDING_LOCAL_RESTORE_NOT_RECOVERY_PASS';save();
  return {projectRef:QA_REF,status:journal.status,runDirectory:dir,snapshotSha256:snapshotDigest,enableWriteAttempts:journal.enableAttempted?1:0,cloudRestore:'NOT TESTED',independentStopRecovery:'NOT PROVEN BY CAPTURE',cliInvocations:journal.cliInvocations};
 }catch(e){journal.status='STOPPED_NO_RETRY';journal.error=/^[A-Z_]+$/.test(e.message)?e.message:'CONSOLE_FAILED_NO_SECRET_OUTPUT';journal.observeCommand=snapshotDigest?`node "${fileURLToPath(import.meta.url)}" --mode Observe --run-dir "${dir}" --snapshot-sha256 ${snapshotDigest}`:null;save();throw Object.assign(Error(journal.error),{runDirectory:dir});}
 finally{
  if(lockOwned&&(!journal.enableAttempted||journal.status==='CAPTURED_PENDING_LOCAL_RESTORE_NOT_RECOVERY_PASS')){
   const owned=JSON.parse(fs.readFileSync(lock,'utf8'));if(owned.projectRef===QA_REF&&owned.runDirectory===dir)fs.unlinkSync(lock);
  }
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};try{for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i].startsWith('--')||!process.argv[i+1]||Object.hasOwn(options,process.argv[i].slice(2)))throw Error('INVALID_ARGUMENTS');options[process.argv[i].slice(2)]=process.argv[i+1];}const result=await execute(options);console.log(JSON.stringify(result,null,2));if(result.status?.startsWith('BLOCKED'))process.exitCode=2;}catch(e){console.error(JSON.stringify({status:'BLOCKED',error:/^[A-Z_]+$/.test(e.message)?e.message:'CONSOLE_FAILED_NO_SECRET_OUTPUT',runDirectory:e.runDirectory||null,cloudAcceptance:'NOT TESTED'}));process.exitCode=2;}
}
