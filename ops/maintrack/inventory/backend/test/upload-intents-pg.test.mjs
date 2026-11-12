import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';

test('reviewed upload journal bounds concurrent reservations in real PostgreSQL', {skip:!process.env.LOGIN_PG_URL}, async()=>{
 const u=new URL(process.env.LOGIN_PG_URL);
 assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55438');assert.equal(u.pathname,'/maintrack_auth_local');
 const pool=new pg.Pool({connectionString:u.href,max:3});let created=false,a,b;
 try{
  assert.equal((await pool.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1');
  assert.equal((await pool.query("SELECT to_regclass('inv_lab.upload_intents') r")).rows[0].r,null,'do not replace an existing journal');
  await pool.query(fs.readFileSync(new URL('../upload-intents.review.sql',import.meta.url),'utf8'));created=true;
  assert.equal((await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='inv_lab.upload_intents'::regclass")).rows[0].relrowsecurity,true);
  assert.equal((await pool.query("SELECT count(*)::int n FROM pg_class c,LATERAL aclexplode(c.relacl) a WHERE c.oid='inv_lab.upload_intents'::regclass AND a.grantee=0")).rows[0].n,0);
  a=await pool.connect();b=await pool.connect();
  await a.query('BEGIN');await b.query("SET lock_timeout='250ms'");
  const sql="INSERT INTO inv_lab.upload_intents(storage_key,file_sha256,state,actor) VALUES($1,$2,'RESERVED','LOCAL-JOURNAL-TEST')";
  await a.query(sql,['inventory/imports/00000000-0000-4000-8000-000000000001.xlsx','a'.repeat(64)]);
  await assert.rejects(()=>b.query(sql,['inventory/imports/00000000-0000-4000-8000-000000000002.xlsx','b'.repeat(64)]),e=>e.code==='55P03');
  await a.query('COMMIT');a.release();a=null;
  await assert.rejects(()=>b.query(sql,['inventory/imports/00000000-0000-4000-8000-000000000002.xlsx','b'.repeat(64)]),e=>e.code==='23505');
  assert.equal((await b.query('SELECT count(*)::int n FROM inv_lab.upload_intents')).rows[0].n,1,'committed reservation survives connection release');
  await assert.rejects(()=>b.query("UPDATE inv_lab.upload_intents SET state='ATTACHED'"),e=>e.code==='23514');
 }finally{
  if(a){await a.query('ROLLBACK');a.release();}if(b)b.release();
  if(created)await pool.query('DROP TABLE inv_lab.upload_intents');
  await pool.end();
 }
});
