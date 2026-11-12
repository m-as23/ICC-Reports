// Only the explicitly owned, marked portable PG fixture. Never a hosted URL.
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const {Client}=createRequire(new URL('../inventory/backend/package.json',import.meta.url))('pg');
const cfg={host:'127.0.0.1',port:55438,user:'mt_local_admin',database:'maintrack_auth_local',application_name:'MAINTRACK_SCHEDULER_FAILURE_TEST'};
const lock=742119,tag='MAINTRACK_SCHEDULER_OWNED_CANCEL';
const pgCtl=fileURLToPath(new URL('../../../../tools/cleanup-pg-lab/pgsql/bin/pg_ctl.exe',import.meta.url)),data=fileURLToPath(new URL('../../../../tools/cleanup-pg-lab/rate-data',import.meta.url)),log=fileURLToPath(new URL('../../../../tools/cleanup-pg-lab/rate-postgres.log',import.meta.url));
async function connect(config=cfg){const c=new Client(config);c.on('error',()=>{});await c.connect();return c;}
async function marker(c){assert.equal((await c.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1');}
test('server cancellation, backend loss and restart retain bounded recovery state',async t=>{
 let admin=await connect(),worker,observer;try{
  await marker(admin);
  await admin.query(`CREATE SCHEMA maintrack_qa_scheduler_fault_fixture;CREATE TABLE maintrack_qa_scheduler_fault_fixture.state(singleton boolean PRIMARY KEY,attempts int,status text,deadline timestamptz);INSERT INTO maintrack_qa_scheduler_fault_fixture.state VALUES(true,0,'ARMED',clock_timestamp()+interval '1 second');CREATE PROCEDURE maintrack_qa_scheduler_fault_fixture.run() LANGUAGE plpgsql AS $$ BEGIN IF (SELECT attempts>=2 FROM maintrack_qa_scheduler_fault_fixture.state) THEN RAISE EXCEPTION 'EXHAUSTED';END IF;IF NOT pg_try_advisory_lock(${lock},1) THEN RETURN;END IF;UPDATE maintrack_qa_scheduler_fault_fixture.state SET attempts=attempts+1,status='RECOVERING';COMMIT;PERFORM pg_sleep(5);UPDATE maintrack_qa_scheduler_fault_fixture.state SET status='COMPLETE';COMMIT;PERFORM pg_advisory_unlock(${lock},1);END $$;`);
  await t.test('session statement_timeout cancels top-level CALL on server after durable attempt',async()=>{
   worker=await connect({...cfg,application_name:tag});await worker.query("SET statement_timeout='300ms'");assert.equal((await worker.query('SHOW statement_timeout')).rows[0].statement_timeout,'300ms');const start=performance.now();await assert.rejects(()=>worker.query('CALL maintrack_qa_scheduler_fault_fixture.run()'),e=>e.code==='57014');const ms=performance.now()-start;assert.ok(ms>=100&&ms<2500,'server cancellation bounded locally');assert.equal((await admin.query('SELECT attempts FROM maintrack_qa_scheduler_fault_fixture.state')).rows[0].attempts,1);
  });
  await t.test('cancelled live connection retains mutex, disconnect releases it',async()=>{
   observer=await connect();assert.equal((await observer.query(`SELECT pg_try_advisory_lock(${lock},1) ok`)).rows[0].ok,false);await worker.end();worker=null;assert.equal((await observer.query(`SELECT pg_try_advisory_lock(${lock},1) ok`)).rows[0].ok,true);await observer.query(`SELECT pg_advisory_unlock(${lock},1)`);await observer.end();observer=null;
  });
  await t.test('terminate only an identity-checked owned worker; attempts survive backend death',async()=>{
   worker=await connect({...cfg,application_name:tag});const pid=(await worker.query('SELECT pg_backend_pid() pid')).rows[0].pid;const running=worker.query('CALL maintrack_qa_scheduler_fault_fixture.run()').then(()=>({ok:true}),e=>({ok:false,code:e.code}));
   let ready=false;for(let i=0;i<10;i++){if((await admin.query('SELECT attempts FROM maintrack_qa_scheduler_fault_fixture.state')).rows[0].attempts===2){ready=true;break;}await new Promise(r=>setTimeout(r,20));}assert.ok(ready);
   const killed=await admin.query("SELECT pg_terminate_backend(pid) killed FROM pg_stat_activity WHERE pid=$1 AND datname='maintrack_auth_local' AND usename='mt_local_admin' AND application_name=$2",[pid,tag]);assert.equal(killed.rows.length,1);assert.equal(killed.rows[0].killed,true);assert.equal((await running).ok,false);await worker.end().catch(()=>{});worker=null;assert.equal((await admin.query('SELECT attempts FROM maintrack_qa_scheduler_fault_fixture.state')).rows[0].attempts,2);assert.equal((await admin.query(`SELECT pg_try_advisory_lock(${lock},1) ok`)).rows[0].ok,true);await admin.query(`SELECT pg_advisory_unlock(${lock},1)`);
  });
  await t.test('owned instance restart preserves attempt cap and expiry, no silent reset',async()=>{
   await admin.end();admin=null;
   execFileSync(pgCtl,['restart','-D',data,'-l',log,'-o','-h 127.0.0.1 -p 55438','-m','fast','-w'],{windowsHide:true,timeout:15000,stdio:'ignore'});
   admin=await connect();await marker(admin);const r=(await admin.query('SELECT attempts,status,deadline<=clock_timestamp() expired FROM maintrack_qa_scheduler_fault_fixture.state')).rows[0];assert.equal(r.attempts,2);assert.equal(r.status,'RECOVERING');assert.equal(r.expired,true);await assert.rejects(()=>admin.query('CALL maintrack_qa_scheduler_fault_fixture.run()'),e=>e.message==='EXHAUSTED');assert.equal((await admin.query('SELECT attempts FROM maintrack_qa_scheduler_fault_fixture.state')).rows[0].attempts,2);
  });
 }finally{
  await worker?.end().catch(()=>{});await observer?.end().catch(()=>{});if(!admin)admin=await connect();await marker(admin);await admin.query('DROP SCHEMA IF EXISTS maintrack_qa_scheduler_fault_fixture CASCADE');await admin.end();
 }
});
