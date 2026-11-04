// Real local PostgreSQL: no cloud, user rows, hashes or credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {withLoginBudget} from '../../../supabase/functions/maintrack-final-047/login-rate-limit.mjs';
const {Pool}=createRequire(new URL('../inventory/backend/package.json',import.meta.url))('pg');

test('database ends abandoned login work, releases only its slots and permits recovery',{skip:!process.env.LOGIN_PG_URL?'owned LOGIN_PG_URL required':false},async()=>{
 const u=new URL(process.env.LOGIN_PG_URL);
 assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/maintrack_auth_local');assert.equal(u.password,'');assert.equal(u.search,'');assert.equal(u.hash,'');
 assert.ok((u.port==='55438'&&u.username==='mt_local_admin')||(u.port==='5432'&&u.username==='mt_lab_admin'&&process.env.MAINTRACK_CLEANUP_OWNED==='MAINTRACK_CLEANUP_EPHEMERAL_V2'),'explicit owned Windows fixture or existing disposable CI fixture only');
 const cfg={host:u.hostname,port:Number(u.port),user:u.username,database:'maintrack_auth_local',connectionTimeoutMillis:2000};
 const admin=new Pool({...cfg,max:1}),workers=new Pool({...cfg,max:4});
 const tasks=[],entered=[],release=[];let owner;
 try{
  owner=await admin.connect();
  assert.equal((await owner.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1');
  await owner.query('BEGIN');await owner.query("SET LOCAL idle_in_transaction_session_timeout='20s'");
  await owner.query("SELECT pg_advisory_xact_lock(hashtextextended('maintrack-idle-test-unrelated',0))");
  for(let i=0;i<4;i++){
   let ready;const r=new Promise(resolve=>ready=resolve);entered.push(r);
   const task=withLoginBudget(workers,undefined,'idle-recovery-'+i,async c=>{
    const settings=(await c.query("SELECT pg_backend_pid() pid,current_setting('idle_in_transaction_session_timeout') AS idle_timeout,current_setting('statement_timeout') AS statement_timeout")).rows[0];
    ready(settings);await new Promise(resolve=>release.push(resolve));return true;
   });
   // Record rejections immediately: server disconnect must be contained, not unhandled.
   tasks.push(task.then(value=>({ok:true,value}),error=>({ok:false,code:error.code,status:error.status})));
  }
  const settings=await Promise.all(entered);
  assert.ok(settings.every(s=>s.idle_timeout==='5s'&&s.statement_timeout==='4s'),'5s server idle deadline must coexist with unchanged4s statement deadline');
  assert.equal((await owner.query("SELECT count(*)::int n FROM pg_locks WHERE pid=ANY($1::int[]) AND locktype='advisory'",[settings.map(s=>s.pid)])).rows[0].n,8,'four account and four work-slot locks are held');
  const started=performance.now();let timer;
  const results=await Promise.race([Promise.all(tasks),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SERVER_IDLE_DEADLINE_NOT_ENFORCED')),8500);})]).finally(()=>clearTimeout(timer));
  assert.ok(performance.now()-started>=3500&&performance.now()-started<8500,'server termination is bounded, not immediate fixture release');
  assert.ok(results.every(r=>!r.ok&&r.code==='LOGIN_BUSY'&&r.status===429),'disconnect rejects pending budget callbacks fail-closed');
  assert.equal((await owner.query("SELECT count(*)::int n FROM pg_locks WHERE pid=ANY($1::int[]) AND locktype='advisory'",[settings.map(s=>s.pid)])).rows[0].n,0,'server alone releases abandoned transaction locks');
  assert.equal((await owner.query("SELECT count(*)::int n FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'")).rows[0].n,1,'unrelated live transaction is unchanged');
  assert.equal(await withLoginBudget(workers,undefined,'fresh-unrelated-account',async c=>Number((await c.query('SELECT 42 AS value')).rows[0].value)),42,'pool and admission reservations recover after disconnect');
 }finally{
  release.forEach(resolve=>resolve());await Promise.allSettled(tasks);
  if(owner){await owner.query('ROLLBACK').catch(()=>{});owner.release();}
  await workers.end();await admin.end();
 }
});
