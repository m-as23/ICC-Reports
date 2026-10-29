// QA-only instrumentation. Never imported by the operational candidate.
// Uses the existing reviewed lease schema; installs no tables, jobs or grants.
export async function qaLoginPrivileges(c){
 const result=await c.query(`SELECT
 CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname='maintrack_qa_cleanup_worker') THEN pg_has_role(session_user,'maintrack_qa_cleanup_worker','MEMBER') ELSE false END AS worker_member,
 has_schema_privilege(current_user,'maintrack_qa_lease','USAGE') AS schema_usage,
 has_table_privilege(current_user,'maintrack_qa_lease.runs','SELECT') AS lease_read,
 has_table_privilege(current_user,'maintrack_qa_lease.runs','UPDATE') AS lease_lock,
 has_table_privilege(current_user,'maintrack_qa_lease.sessions','SELECT') AS ledger_read,
 has_table_privilege(current_user,'maintrack_qa_lease.sessions','INSERT') AS ledger_insert,
 has_table_privilege(current_user,'mt_sessions','INSERT') AS core_insert,
 (has_table_privilege(current_user,'mt_login_attempts','SELECT') AND has_table_privilege(current_user,'mt_login_attempts','INSERT') AND has_table_privilege(current_user,'mt_login_attempts','UPDATE') AND has_table_privilege(current_user,'mt_login_attempts','DELETE')) AS account_counters,
 has_table_privilege(current_user,'mt_users','SELECT') AS login_user_read,
 has_schema_privilege(current_user,'extensions','USAGE') AS crypt_schema,
 COALESCE(has_function_privilege(current_user,to_regprocedure('extensions.crypt(text,text)'),'EXECUTE'),false) AS crypt_execute,
 NOT row_security_active('mt_login_attempts') AS counters_unfiltered,
 NOT row_security_active('mt_users') AS users_unfiltered,
 has_column_privilege(current_user,'mt_sessions','expires_at','UPDATE') AS core_clamp,
 has_column_privilege(current_user,'mt_sessions','token_hash','SELECT') AS core_hash_read,
 has_column_privilege(current_user,'mt_sessions','expires_at','SELECT') AS core_expiry_read,
 NOT row_security_active('maintrack_qa_lease.runs') AS lease_unfiltered,
 NOT row_security_active('maintrack_qa_lease.sessions') AS ledger_unfiltered,
 NOT row_security_active('mt_sessions') AS core_unfiltered`);
 const proof=result.rows[0];
 return {compatible:!!proof&&Object.values(proof).every(x=>x===true),checks:proof};
}
export function leaseLoginIssue(original,{runId,sha,reject}){
 if(!/^[a-f0-9-]{36}$/.test(runId))throw Error('QA_RUN_ID_REQUIRED');
 return async function(u,c){
  if(!c)throw Error('QA_TRANSACTION_CLIENT_REQUIRED');
  if(!(await qaLoginPrivileges(c)).compatible)reject('QA_RUNTIME_ROLE_INCOMPATIBLE',503);
  const lease=(await c.query("SELECT id,admit_until FROM maintrack_qa_lease.runs WHERE id=$1::uuid AND project_ref='szhstrafzkxzstjdcynl' AND state='ARMED' AND clock_timestamp()<admit_until FOR UPDATE",[runId])).rows[0];
  if(!lease)reject('QA_LEASE_CLOSED',403);
  if(!['90000001','90000002'].includes(u.employee_code))reject('QA_ACTOR_FORBIDDEN',403);
  // The existing arm operation contributes one fixture; allow three real Logins.
  const registered=(await c.query('SELECT count(*) n FROM maintrack_qa_lease.sessions WHERE run_id=$1::uuid',[runId])).rows[0].n;
  if(Number(registered)>=4)reject('QA_SESSION_BUDGET',403);
  const result=await original(u,c),tokenHash=sha(result.token);
  const updated=await c.query('UPDATE mt_sessions SET expires_at=LEAST(expires_at,$2::timestamptz) WHERE token_hash=$1 RETURNING token_hash',[tokenHash,lease.admit_until]);
  if(updated.rows.length!==1)reject('QA_SESSION_NOT_REGISTERED',503);
  await c.query('INSERT INTO maintrack_qa_lease.sessions(run_id,token_hash) VALUES($1::uuid,$2)',[runId,tokenHash]);
  return result;
 };
}

export function applyQaLoginLease(source,runId){
 if(!/^[a-f0-9-]{36}$/.test(runId))throw Error('QA_RUN_ID_REQUIRED');
 if(source.includes('leaseLoginIssue'))throw Error('QA_LEASE_ALREADY_APPLIED');
 const anchor='async function issue(u,c=pool){';
 if(source.split(anchor).length!==2||!source.includes('return issue(u,c)'))throw Error('QA_ISSUE_TRANSACTION_CONTRACT_CHANGED');
 const patched=source.replace(anchor,'async function issueBeforeQaLease(u,c=pool){');
 const ready="if(p.endsWith('/readyz')){try{const x=";
 if(patched.split(ready).length!==2)throw Error('QA_READINESS_CONTRACT_CHANGED');
 const withProof=patched.replace(ready,"if(p.endsWith('/readyz')){try{const qaRuntime=await qaLoginPrivileges(pool);if(!qaRuntime.compatible)return response({status:'unavailable',reason:'QA_RUNTIME_ROLE_INCOMPATIBLE',qaRuntime},503,rid);const x=").replace("status:'ready',database:'postgresql'","status:'ready',qaRuntime,database:'postgresql'");
 return "import {leaseLoginIssue,qaLoginPrivileges} from './qa-login-lease.mjs';\n"+withProof.replace('async function login(',`const issue=leaseLoginIssue(issueBeforeQaLease,{runId:${JSON.stringify(runId)},sha,reject:die});\nasync function login(`);
}
