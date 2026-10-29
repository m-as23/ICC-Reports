// Read-only interactive capture. No password is read by Node, logged, or exported.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {qaConnection} from './qa-connection.mjs';
const REF='szhstrafzkxzstjdcynl';
export const SCHEMAS=['qa_security_final_20261025','qa_security_inventory_20261025','maintrack_qa_lease'];
export function capturePlan(options={}){
 if(options['source-commit']&&!/^[a-f0-9]{40}$/.test(options['source-commit']))throw Error('EXACT_SOURCE_COMMIT_REQUIRED');
 if(options.mode&&!['DryRun','Capture'].includes(options.mode))throw Error('INVALID_MODE');
 if(options.mode==='Capture'&&options['execute-readonly']!=='yes')throw Error('EXPLICIT_READONLY_CAPTURE_REQUIRED');
 const transport=options.transport||'direct',connection=qaConnection(options.service||'maintrack_qa_recovery',transport);
 return {projectRef:REF,mode:options.mode||'DryRun',transport,connection,schemas:SCHEMAS,sourceCommit:options['source-commit']||null,
  mutations:0,credentialHandling:'Official psql/pg_dump terminal prompts only; Node never reads credentials',
  prompts:2,atomicAcrossCatalogAndArchive:false,restoreAuthorized:false};
}
export const catalogQuery=`BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
DO $verify$ BEGIN
 IF (SELECT project_ref FROM qa_security_final_20261025.qa_scope WHERE singleton) IS DISTINCT FROM '${REF}' THEN RAISE EXCEPTION 'WRONG_QA_PROJECT'; END IF;
 IF NOT coalesce((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false) THEN RAISE EXCEPTION 'TLS_REQUIRED'; END IF;
END $verify$;
SELECT json_build_object(
 'projectRef','${REF}','capturedUtc',clock_timestamp(),'database',current_database(),'sessionUser',session_user,
 'serverVersion',current_setting('server_version'),'backendSsl',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'tlsProtocol',(SELECT version FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'tlsCipher',(SELECT cipher FROM pg_stat_ssl WHERE pid=pg_backend_pid()),
 'schemaScope',ARRAY['qa_security_final_20261025','qa_security_inventory_20261025','maintrack_qa_lease'],
 'schemas',(SELECT json_agg(json_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl)) FROM pg_namespace WHERE nspname=ANY(ARRAY['qa_security_final_20261025','qa_security_inventory_20261025','maintrack_qa_lease'])),
 'functions',(SELECT json_agg(json_build_object('schema',n.nspname,'name',p.proname,'identityArgs',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'acl',p.proacl)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY(ARRAY['qa_security_final_20261025','qa_security_inventory_20261025','maintrack_qa_lease'])),
 'relations',(SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY(ARRAY['qa_security_final_20261025','qa_security_inventory_20261025','maintrack_qa_lease'])),
 'policies',(SELECT json_agg(json_build_object('schema',schemaname,'table',tablename,'name',policyname,'roles',roles,'command',cmd,'permissive',permissive)) FROM pg_policies WHERE schemaname=ANY(ARRAY['qa_security_final_20261025','qa_security_inventory_20261025','maintrack_qa_lease'])),
 'triggers',(SELECT json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'internal',t.tgisinternal)) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY(ARRAY['qa_security_final_20261025','qa_security_inventory_20261025','maintrack_qa_lease'])),
 'roles',(SELECT json_agg(json_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypassRls',rolbypassrls,'connectionLimit',rolconnlimit)) FROM pg_roles WHERE rolname='postgres' OR rolname LIKE 'maintrack_qa_%'),
 'roleMemberships',(SELECT json_agg(json_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'adminOption',admin_option)) FROM pg_auth_members WHERE pg_get_userbyid(roleid) LIKE 'maintrack_qa_%' OR pg_get_userbyid(member) LIKE 'maintrack_qa_%')
);
ROLLBACK;`;
export function runCapture(options={},run=spawnSync){
 const plan=capturePlan(options);if(plan.mode==='DryRun')return plan;
 if(process.platform!=='win32')throw Error('WINDOWS_RESTRICTED_CAPTURE_REQUIRED');
 if(plan.transport==='direct'){
  const probe=run(process.execPath,[fileURLToPath(new URL('./probe-qa-direct.mjs',import.meta.url))],{encoding:'utf8',windowsHide:true,timeout:12000,maxBuffer:65536});
  let state;try{state=JSON.parse(probe.stdout);}catch{throw Error('DIRECT_NETWORK_PROBE_FAILED_NO_CAPTURE');}
  if(probe.status!==0||state.projectRef!==REF||state.host!==`db.${REF}.supabase.co`||state.reachable!==true)throw Error('DIRECT_QA_NETWORK_UNAVAILABLE_NO_PASSWORD_PROMPT');
 }
 const recoveryRoot=path.resolve('D:\\MainTrack-QA-Recovery');
 const out=path.resolve(options.output||path.join(recoveryRoot,`schema-capture-${new Date().toISOString().replace(/[:.]/g,'-')}`));
 if(!out.toLowerCase().startsWith((recoveryRoot+path.sep).toLowerCase())||fs.existsSync(out))throw Error('NEW_RECOVERY_SUBDIRECTORY_REQUIRED');
 for(let p=path.dirname(out);p!==path.dirname(p);p=path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('REPARSE_POINT_REFUSED');}
 const identity=run('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true,timeout:5000});
 const sid=identity.stdout?.match(/S-1-5-[0-9-]+/)?.[0];if(identity.status!==0||!sid)throw Error('CURRENT_USER_SID_REQUIRED');
 fs.mkdirSync(out);
 const acl=run('icacls.exe',[out,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{encoding:'utf8',windowsHide:true,timeout:5000});
 if(acl.status!==0)throw Error('PRIVATE_CAPTURE_DIRECTORY_ACL_FAILED');
 const report={...plan,output:out,startedUtc:new Date().toISOString(),status:'INCOMPLETE',sensitiveReviewRequired:true,files:[]};
 const save=()=>fs.writeFileSync(path.join(out,'capture-manifest.json'),JSON.stringify(report,null,2)+'\n');save();
 const argv=['-X','--password','-q','-t','-A','--set','ON_ERROR_STOP=1','--dbname',plan.connection,'--command',catalogQuery,'--output',path.join(out,'catalog.json')];
 // Terminal-only password prompts: no pipes, callbacks, readline, environment password, or stdout capture.
 const psql=run(options.psql||'psql.exe',argv,{stdio:'inherit',windowsHide:false,timeout:180000});
 if(psql.status!==0){report.status='CATALOG_CAPTURE_FAILED';save();throw Error('CATALOG_CAPTURE_FAILED_NO_RETRY');}
 const catalog=JSON.parse(fs.readFileSync(path.join(out,'catalog.json'),'utf8').trim());
 if(catalog.projectRef!==REF||catalog.database!=='postgres'||catalog.schemas?.length!==SCHEMAS.length){report.status='IDENTITY_OR_SCHEMA_SCOPE_MISMATCH';save();throw Error('CAPTURE_IDENTITY_MISMATCH');}
 if(catalog.backendSsl!==true||!['TLSv1.2','TLSv1.3'].includes(catalog.tlsProtocol)){report.status='BACKEND_TLS_UNVERIFIED';save();throw Error('BACKEND_TLS_REQUIRED_BEFORE_DUMP');}
 report.tlsEvidence={transport:plan.transport,clientVerification:'libpq sslmode=verify-full',backendSsl:catalog.backendSsl,backendProtocol:catalog.tlsProtocol,scope:plan.transport==='direct'?'Direct client-to-PostgreSQL connection':'PostgreSQL sees pooler-to-backend leg; client-to-pooler verification is separate'};
 const dump=run(options['pg-dump']||'pg_dump.exe',['--password','--dbname',plan.connection,'--schema-only','--format=custom','--lock-wait-timeout=10s',...SCHEMAS.flatMap(x=>['--schema',x]),'--file',path.join(out,'schema.dump')],{stdio:'inherit',windowsHide:false,timeout:240000});
 if(dump.status!==0){report.status='SCHEMA_CAPTURE_FAILED';save();throw Error('SCHEMA_CAPTURE_FAILED_NO_RETRY');}
 const list=run(options['pg-restore']||'pg_restore.exe',['--list',path.join(out,'schema.dump')],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8*1024*1024});
 if(list.status!==0){report.status='ARCHIVE_INDEX_FAILED';save();throw Error('ARCHIVE_INDEX_FAILED');}
 fs.writeFileSync(path.join(out,'archive-index.txt'),list.stdout);
 for(const name of ['catalog.json','schema.dump','archive-index.txt']){const bytes=fs.readFileSync(path.join(out,name));report.files.push({path:name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});}
 report.status='CAPTURED_PENDING_SECRET_REVIEW_AND_LOCAL_RESTORE';report.finishedUtc=new Date().toISOString();save();
 return {projectRef:REF,output:out,status:report.status,mutations:0,files:report.files,restoreAuthorized:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const options={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i].startsWith('--')||!process.argv[i+1])throw Error('INVALID_ARGUMENTS');options[process.argv[i].slice(2)]=process.argv[i+1];}console.log(JSON.stringify(runCapture(options),null,2));}
 catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'CAPTURE_FAILED_NO_SECRET_OUTPUT');process.exitCode=2;}
}
