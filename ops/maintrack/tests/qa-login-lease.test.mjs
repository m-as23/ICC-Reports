import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash,randomBytes} from 'node:crypto';import {createRequire} from 'node:module';
import {leaseLoginIssue,applyQaLoginLease,qaLoginPrivileges} from '../security/qa-login-lease.mjs';
const {Pool}=createRequire(new URL('../inventory/backend/package.json',import.meta.url))('pg');
const id='11111111-2222-4333-8444-555555555555',sha=x=>createHash('sha256').update(x).digest('hex');
test('QA source adapter is explicit, single-use and operational source stays immutable',()=>{const source=fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/index.ts',import.meta.url),'utf8');const adapted=applyQaLoginLease(source,id);assert.ok(adapted.includes('return issue(u,c)'));assert.ok(adapted.includes('const issue=leaseLoginIssue('));assert.ok(!source.includes('leaseLoginIssue'));assert.throws(()=>applyQaLoginLease(adapted,id),/ALREADY_APPLIED/);});
test('QA-issued sessions are transactionally registered and server-expiring',{skip:!process.env.LOGIN_PG_URL?'owned fixture required':false},async()=>{
 const u=new URL(process.env.LOGIN_PG_URL);assert.ok(['postgres:','postgresql:'].includes(u.protocol)&&['127.0.0.1','localhost'].includes(u.hostname)&&u.pathname==='/maintrack_auth_local'&&!u.search&&!u.hash&&['mt_local_admin','mt_lab_admin'].includes(u.username));
 const pool=new Pool({connectionString:u.toString(),max:1});let c;
 try{assert.equal((await pool.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1');
  await pool.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='maintrack_qa_cleanup_worker') THEN CREATE ROLE maintrack_qa_cleanup_worker NOLOGIN; END IF; END $$;CREATE SCHEMA IF NOT EXISTS maintrack_qa_lease;CREATE TABLE IF NOT EXISTS maintrack_qa_lease.runs(id uuid PRIMARY KEY,project_ref text,state text,admit_until timestamptz);CREATE TABLE IF NOT EXISTS maintrack_qa_lease.sessions(run_id uuid,token_hash text PRIMARY KEY);TRUNCATE maintrack_qa_lease.sessions,maintrack_qa_lease.runs,mt_sessions;INSERT INTO maintrack_qa_lease.runs VALUES('${id}','szhstrafzkxzstjdcynl','ARMED',now()+interval '1 minute')`);
  assert.equal((await qaLoginPrivileges(pool)).compatible,true,'owned local superuser fixture, not a cloud runtime attestation');
  let deniedCalls=0;const denied=leaseLoginIssue(async()=>{deniedCalls++;},{runId:id,sha,reject:(code,status)=>{throw Object.assign(Error(code),{code,status});}});await assert.rejects(()=>denied({employee_code:'90000001'},{query:async()=>({rows:[{worker_member:false}]})}),e=>e.code==='QA_RUNTIME_ROLE_INCOMPATIBLE');assert.equal(deniedCalls,0);
  let issued=0;const base=async(u,c)=>{issued++;const token=randomBytes(32).toString('hex');await c.query("INSERT INTO mt_sessions VALUES($1,'a',0,now()+interval '7 days')",[sha(token)]);return {token};};const issue=leaseLoginIssue(base,{runId:id,sha,reject:(code,status)=>{throw Object.assign(Error(code),{code,status});}});
  c=await pool.connect();await c.query('BEGIN');await issue({employee_code:'90000001'},c);await c.query('COMMIT');
  assert.equal((await c.query('SELECT count(*) n FROM mt_sessions s JOIN maintrack_qa_lease.sessions q USING(token_hash) JOIN maintrack_qa_lease.runs r ON r.id=q.run_id WHERE s.expires_at<=r.admit_until')).rows[0].n,'1');
  await c.query('BEGIN');await issue({employee_code:'90000002'},c);await c.query('ROLLBACK');assert.equal((await c.query('SELECT count(*) n FROM mt_sessions')).rows[0].n,'1');assert.equal((await c.query('SELECT count(*) n FROM maintrack_qa_lease.sessions')).rows[0].n,'1');
  await c.query("UPDATE maintrack_qa_lease.runs SET admit_until=now()-interval '1 second'");await c.query('BEGIN');await assert.rejects(()=>issue({employee_code:'90000001'},c),e=>e.code==='QA_LEASE_CLOSED');await c.query('ROLLBACK');assert.equal(issued,2);
  await c.query("UPDATE maintrack_qa_lease.runs SET admit_until=now()+interval '1 minute'");
  for(let i=0;i<3;i++)await c.query('INSERT INTO maintrack_qa_lease.sessions VALUES($1,$2)',[id,String(i).repeat(64)]);
  await c.query('BEGIN');await assert.rejects(()=>issue({employee_code:'90000001'},c),e=>e.code==='QA_SESSION_BUDGET');await c.query('ROLLBACK');assert.equal(issued,2);
  await c.query('TRUNCATE maintrack_qa_lease.sessions,maintrack_qa_lease.runs,mt_sessions');
 }finally{if(c)c.release();await pool.end();}
});
