import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import fs from 'node:fs';import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../inventory/backend/package.json',import.meta.url))('pg');
test('failed local HTTP harness closes its owned lease and restores counters',async()=>{
 const db=new Client({host:'127.0.0.1',port:55438,user:'mt_local_admin',database:'maintrack_auth_local'});await db.connect();
 try{
  assert.equal((await db.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1');
  const env={...process.env,MAINTRACK_LOCAL_FAULT_AFTER_LOGIN:'1'};delete env.NODE_TEST_CONTEXT;
  const r=spawnSync(process.execPath,['--test','ops/maintrack/tests/permanent-http-runtime.test.mjs'],{encoding:'utf8',windowsHide:true,timeout:45000,env});
  fs.writeFileSync('../evidence/qa-execution/deno-runtime/injected-harness-stop.txt',(r.stdout||'')+(r.stderr||''));
  assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/LOCAL_INJECTED_HARNESS_STOP/);
  assert.equal((await db.query("SELECT state FROM maintrack_qa_permanent.windows WHERE id='33333333-2222-4333-8444-555555555555'")).rows[0].state,'COMPLETE');
  assert.equal((await db.query('SELECT count(*)::int n FROM qa_security_final_20261025.mt_sessions')).rows[0].n,0);
  assert.equal((await db.query("SELECT count(*)::int n FROM qa_security_final_20261025.mt_users WHERE employee_code IN('90000001','90000002') AND password_hash IS NOT NULL")).rows[0].n,0);
  assert.equal((await db.query("SELECT baseline=maintrack_qa_permanent.counter_state() equal FROM maintrack_qa_permanent.windows WHERE id='33333333-2222-4333-8444-555555555555'")).rows[0].equal,true);
 }finally{await db.end();}
});
test('unowned database marker rejection cannot run cleanup writes',async()=>{
 const db=new Client({host:'127.0.0.1',port:55438,user:'mt_local_admin',database:'maintrack_auth_local'});await db.connect();let changed=false;
 try{
  assert.equal((await db.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1');
  const before=(await db.query('SELECT count(*)::int n FROM maintrack_qa_permanent.windows')).rows[0].n;
  await db.query("COMMENT ON DATABASE maintrack_auth_local IS 'MAINTRACK_NEGATIVE_MARKER_TEST'");changed=true;
  const env={...process.env};delete env.NODE_TEST_CONTEXT;delete env.MAINTRACK_LOCAL_FAULT_AFTER_LOGIN;
  const r=spawnSync(process.execPath,['--test','ops/maintrack/tests/permanent-http-runtime.test.mjs'],{encoding:'utf8',windowsHide:true,timeout:10000,env});
  fs.writeFileSync('../evidence/qa-execution/deno-runtime/marker-rejection.txt',(r.stdout||'')+(r.stderr||''));
  assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/MAINTRACK_NEGATIVE_MARKER_TEST/);
  assert.equal((await db.query('SELECT count(*)::int n FROM maintrack_qa_permanent.windows')).rows[0].n,before);
 }finally{if(changed)await db.query("COMMENT ON DATABASE maintrack_auth_local IS 'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1'");await db.end();}
});
