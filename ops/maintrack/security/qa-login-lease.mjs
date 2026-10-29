import {LoginRateError} from '../../../supabase/functions/maintrack-final-047/login-rate-limit.mjs';
// QA-only adapter. Operational source is immutable; no retries of ambiguous writes.
export async function qaLoginPrivileges(c){
 const r=await c.query(`SELECT session_user='maintrack_qa_final_runtime' caller,
 NOT pg_has_role(session_user,'maintrack_qa_cleanup_worker','MEMBER') isolated,
 has_function_privilege(current_user,'maintrack_qa_lease.login_mutate(uuid,text,text,text)','EXECUTE') executable,
 NOT has_table_privilege(current_user,'maintrack_qa_lease.sessions','SELECT') private_ledger,
 (SELECT count(*)=3 FROM pg_policies WHERE schemaname='qa_security_final_20261025' AND policyname IN('qa_login_issuer_users','qa_login_issuer_counters','qa_login_issuer_sessions') AND roles=ARRAY['maintrack_qa_login_issuer']::name[]) issuer_policies,
 EXISTS(SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='maintrack_qa_lease.login_mutate(uuid,text,text,text)'::regprocedure AND r.rolname='maintrack_qa_login_issuer' AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']) owner_path,
 NOT EXISTS(SELECT 1 FROM pg_proc p,CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='maintrack_qa_lease.login_mutate(uuid,text,text,text)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') public_denied`.replace('p,CROSS','p CROSS'));
 const checks=r.rows[0];return {compatible:!!checks&&Object.values(checks).every(x=>x===true),checks};
}
export function qaLeaseHarness(pool,runId){
 if(!/^[a-f0-9-]{36}$/.test(runId))throw Error('QA_RUN_ID_REQUIRED');
 let halted=false;
 return {async mutate(c,op,code,hash=null){
  if(halted)throw Error('QA_HARNESS_HALTED_NO_RETRY');
  try{return await c.query('SELECT maintrack_qa_lease.login_mutate($1::uuid,$2::text,$3::text,$4::text)',[runId,op,code,hash]);}
  catch(e){if(!e.code||['ECONNRESET','ETIMEDOUT','08006','57P01'].includes(e.code)){halted=true;throw Error('QA_AMBIGUOUS_WRITE_NO_RETRY');}if(e.code==='P0002')throw new LoginRateError('QA_LEASE_OR_ACTOR_CLOSED',403);if(e.code==='P0001'&&['QA_CALLER_DENIED','QA_ACTOR_DENIED','QA_PROJECT_DENIED','QA_SESSION_BUDGET_OR_HASH','QA_TOKEN_NOT_OWNED','QA_OPERATION_DENIED'].includes(e.message))throw new LoginRateError(e.message,403);throw e;}
 },async ready(){return qaLoginPrivileges(pool);},get halted(){return halted;}};
}
export function applyQaLoginLease(source,runId){
 if(source.includes('qaLeaseHarness'))throw Error('QA_LEASE_ALREADY_APPLIED');
 qaLeaseHarness({},runId); // validate before source emission
 const one=(text,anchor,value)=>{if(text.split(anchor).length!==2)throw Error('QA_SOURCE_CONTRACT_CHANGED');return text.replace(anchor,value);};
 const a=source.indexOf('async function issue('),b=source.indexOf('\nasync function login(',a);
 if(a<0||b<0)throw Error('QA_ISSUE_TRANSACTION_CONTRACT_CHANGED');
 let out=source.slice(0,a)+`const qaLease=qaLeaseHarness(pool,${JSON.stringify(runId)});
async function issue(u,c=pool){const token=randomBytes(32).toString('hex');await qaLease.mutate(c,'issue',u.employee_code,sha(token));return {token,code:u.employee_code,name:u.name,role:u.role,must:u.must_change};}`+source.slice(b);
 const failure=out.match(/await c.query\("INSERT INTO mt_login_attempts[^\n]+?\[code\]\)/g);
 if(failure?.length!==1)throw Error('QA_FAILURE_TRANSACTION_CONTRACT_CHANGED');
 out=one(out,failure[0],"await qaLease.mutate(c,'failure',code)");
 out=one(out,"await c.query('DELETE FROM mt_login_attempts WHERE employee_code=$1',[code])","await qaLease.mutate(c,'reset',code)");
 out=one(out,"await pool.query('DELETE FROM mt_sessions WHERE token_hash=$1',[sha(token)])","await qaLease.mutate(pool,'revoke',null,sha(token))");
 const ready="if(p.endsWith('/readyz')){try{const x=";
 out=one(out,ready,"if(p.endsWith('/readyz')){try{const qaRuntime=await qaLease.ready();if(!qaRuntime.compatible)return response({status:'unavailable',qaRuntime},503,rid);const x=");
 return "import {qaLeaseHarness} from './qa-login-lease.mjs';\n"+out;
}

// Controller bounds supplement, never replace, the server lease/expiry.
export function qaWindowHarness({now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),send}){
 const started=now(),deadline=started+1200000;let count=0,last=null,halted=false;
 const run=async operation=>{
  if(halted||count>=60||now()>=deadline)throw Error('QA_WINDOW_CLOSED');
  if(last!==null)await sleep(Math.max(0,2600-(now()-last)));
  if(now()>=deadline)throw Error('QA_WINDOW_CLOSED');count++;
  try{const result=await operation();if(result?.status>=500){halted=true;throw Error('QA_SERVER_FAILURE_NO_RETRY');}return result;}catch{halted=true;throw Error('QA_AMBIGUOUS_REQUEST_NO_RETRY');}finally{last=now();}
 };
 return {get state(){return {started,deadline,count,halted};},async request(url,options){
  const u=new URL(url);if(u.origin!=='https://szhstrafzkxzstjdcynl.supabase.co'||!['/functions/v1/maintrack-security-qa-final/api','/functions/v1/maintrack-security-qa-inventory'].includes(u.pathname)||u.search||u.hash||u.username||u.password)throw Error('QA_TARGET_DENIED');
  return run(()=>send(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)}));
 },async external(projectRef,operation){if(projectRef!=='szhstrafzkxzstjdcynl')throw Error('QA_TARGET_DENIED');return run(operation);},close(){halted=true;}};
}
