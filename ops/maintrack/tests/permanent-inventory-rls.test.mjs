import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../inventory/backend/package.json',import.meta.url))('pg');
const cfg={host:'127.0.0.1',port:55438,user:'mt_local_admin',database:'maintrack_auth_local'};
test('Inventory database rejects reads and writes without live permanent lease',async()=>{
 const db=new Client(cfg);await db.connect();let transaction=false;
 try{
  assert.equal((await db.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1');
  await db.query('BEGIN');transaction=true;
  for(const table of ['active','versions','items','audit','search_budget'])await db.query(`DROP POLICY IF EXISTS qa_permanent_inventory_lease ON inv_lab.${table}`);
  // Exercise actual reviewed overlay against current canonical local inventory.
  // All policies/fixtures are transactionally rolled back; no existing row changed.
  const sql=fs.readFileSync(new URL('../security/qa-permanent-inventory.sql',import.meta.url),'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'').replaceAll('qa_security_inventory_20261025','inv_lab');
  await db.query('SAVEPOINT unsafe_membership');await db.query('GRANT maintrack_qa_cleanup_worker TO maintrack_qa_inventory_runtime');
  await assert.rejects(()=>db.query(sql),e=>e.message==='QA_RUNTIME_PRIVILEGE_PATH_UNSAFE');await db.query('ROLLBACK TO SAVEPOINT unsafe_membership');
  await db.query(sql);
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='inv_lab' AND policyname='qa_permanent_inventory_lease'")).rows[0].n,5);
  const before=(await db.query('SELECT count(*)::int n FROM inv_lab.items')).rows[0].n;assert.ok(before>0);
  await db.query("CREATE POLICY local_inventory_permissive ON inv_lab.items TO maintrack_qa_inventory_runtime USING(true) WITH CHECK(true); GRANT INSERT ON inv_lab.items TO maintrack_qa_inventory_runtime");
  await db.query('SET LOCAL ROLE maintrack_qa_inventory_runtime');
  assert.equal((await db.query('SELECT count(*)::int n FROM inv_lab.items')).rows[0].n,0,'closed lease blocks direct SQL despite permissive policy');
  await db.query('SAVEPOINT denied_write');await assert.rejects(()=>db.query("INSERT INTO inv_lab.items(version_id,code,description,quantity,location,extra) VALUES(1,'OWNED-RLS-TEST','synthetic',0,'LOCAL','{}')"),e=>e.code==='42501');await db.query('ROLLBACK TO SAVEPOINT denied_write');
  await db.query('RESET ROLE');
  await db.query("INSERT INTO maintrack_qa_permanent.windows(id,admit_until,state,cap_hash,plan_hash,baseline) VALUES('00000000-0000-4000-8000-000000000099',clock_timestamp()+interval '60 seconds','ARMED',repeat('9',64),repeat('8',64),'[]'); UPDATE maintrack_qa_permanent.health SET heartbeat=clock_timestamp()");
  await db.query('SET LOCAL ROLE maintrack_qa_inventory_runtime');assert.equal((await db.query('SELECT count(*)::int n FROM inv_lab.items')).rows[0].n,before,'valid lease retains approved rows');
  await db.query('RESET ROLE');await db.query("UPDATE maintrack_qa_permanent.windows SET admit_until=clock_timestamp()-interval '1 second' WHERE id='00000000-0000-4000-8000-000000000099'");
  await db.query('SET LOCAL ROLE maintrack_qa_inventory_runtime');assert.equal((await db.query('SELECT count(*)::int n FROM inv_lab.items')).rows[0].n,0,'expiry is checked by DB without HTTP or Harness');
  await db.query('RESET ROLE');assert.equal((await db.query('SELECT count(*)::int n FROM inv_lab.items')).rows[0].n,before,'unrelated administrator fixture unchanged');
 }finally{if(transaction)await db.query('ROLLBACK');await db.end();}
});
