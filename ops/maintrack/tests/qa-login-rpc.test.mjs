import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const {Pool}=createRequire(new URL('../inventory/backend/package.json',import.meta.url))('pg');
test('restricted QA RPC preserves private lease, caller identity, account/session budget and expiry',async()=>{
 const admin=new Pool({host:'127.0.0.1',port:55438,user:'mt_local_admin',database:'maintrack_auth_local',max:1});let runtime;
 try{
 assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1');
 await admin.query(`CREATE ROLE maintrack_qa_final_runtime LOGIN;CREATE SCHEMA qa_security_final_20261025;CREATE TABLE qa_security_final_20261025.qa_scope(singleton boolean,project_ref text);INSERT INTO qa_security_final_20261025.qa_scope VALUES(true,'szhstrafzkxzstjdcynl');CREATE TABLE qa_security_final_20261025.mt_users(id text,employee_code text,name text,active boolean,must_change boolean,token_version int);INSERT INTO qa_security_final_20261025.mt_users VALUES('a','90000001','QA_FINAL_A',true,false,0),('b','90000002','QA_FINAL_B',true,false,0);CREATE TABLE qa_security_final_20261025.mt_sessions(token_hash text PRIMARY KEY,user_id text,token_version int,expires_at timestamptz);CREATE TABLE qa_security_final_20261025.mt_login_attempts(employee_code text PRIMARY KEY,fail_count int,updated_at timestamptz,blocked_until timestamptz);ALTER TABLE maintrack_qa_lease.runs ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false;TRUNCATE maintrack_qa_lease.runs,maintrack_qa_lease.sessions;INSERT INTO maintrack_qa_lease.runs(id,project_ref,state,admit_until) VALUES('11111111-2222-4333-8444-555555555555','szhstrafzkxzstjdcynl','ARMED',now()+interval '3 minutes');CREATE FUNCTION maintrack_qa_lease.login_fixture_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;CREATE TRIGGER qa_lease_statement BEFORE INSERT ON qa_security_final_20261025.mt_sessions FOR EACH STATEMENT EXECUTE FUNCTION maintrack_qa_lease.login_fixture_guard();` .replace('CREATE TRIGGER qa_lease_statement','CREATE TRIGGER qa_lease_statement'));
 await admin.query("CREATE TRIGGER qa_lease_statement BEFORE INSERT ON qa_security_final_20261025.mt_login_attempts FOR EACH STATEMENT EXECUTE FUNCTION maintrack_qa_lease.login_fixture_guard()");
 await admin.query(fs.readFileSync(new URL('../security/qa-login-rpc.sql',import.meta.url),'utf8'));
 runtime=new Pool({host:'127.0.0.1',port:55438,user:'maintrack_qa_final_runtime',database:'maintrack_auth_local',max:1});
 const id='11111111-2222-4333-8444-555555555555',call=(op,code='90000001',hash=null)=>runtime.query('SELECT maintrack_qa_lease.login_mutate($1,$2,$3,$4)',[id,op,code,hash]);
 assert.equal((await admin.query("SELECT pg_has_role('maintrack_qa_final_runtime','maintrack_qa_cleanup_worker','MEMBER') yes")).rows[0].yes,false);
 await assert.rejects(()=>runtime.query('SELECT * FROM maintrack_qa_lease.sessions'));
 await assert.rejects(()=>call('issue','90000003','a'.repeat(64)));
 await assert.rejects(()=>admin.query('SELECT maintrack_qa_lease.login_mutate($1,$2,$3,$4)',[id,'issue','90000001','a'.repeat(64)]));
 for(let i=0;i<5;i++)await call('failure');
 assert.equal((await admin.query('SELECT fail_count,blocked_until>now() locked FROM qa_security_final_20261025.mt_login_attempts')).rows[0].locked,true);
 await call('reset');
 for(let i=0;i<4;i++)await call('issue','90000001',String(i).repeat(64));
 await assert.rejects(()=>call('issue','90000001','a'.repeat(64)));
 await call('revoke','90000001','0'.repeat(64));await call('revoke','90000001','0'.repeat(64));
 assert.equal((await admin.query('SELECT count(*) n FROM qa_security_final_20261025.mt_sessions')).rows[0].n,'3');
 await admin.query("UPDATE maintrack_qa_lease.runs SET admit_until=now()-interval '1 second'");await assert.rejects(()=>call('failure'));
 await admin.query('TRUNCATE qa_security_final_20261025.mt_sessions,qa_security_final_20261025.mt_login_attempts,maintrack_qa_lease.sessions,maintrack_qa_lease.runs');
 }finally{await runtime?.end();await admin.end();}
});
