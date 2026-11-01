import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {Client}=createRequire(new URL('../inventory/backend/package.json',import.meta.url))('pg');
test('permanent migration works for non-superuser creator and leaves no executor SET/inherited access',async()=>{
 const c=new Client({host:'127.0.0.1',port:55438,user:'mt_local_admin',database:'maintrack_auth_local'});
 await c.connect();
 try {
  assert.equal((await c.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1');
  await c.query('BEGIN');
  await c.query("DROP SCHEMA IF EXISTS maintrack_qa_permanent CASCADE;DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='maintrack_qa_permanent_executor') THEN DROP OWNED BY maintrack_qa_permanent_executor;DROP ROLE maintrack_qa_permanent_executor;END IF;END $$");
  assert.equal((await c.query("SELECT to_regnamespace('maintrack_qa_permanent') IS NULL absent")).rows[0].absent,true);
  // All role/owner changes are local fixture changes inside the rolled-back transaction.
  await c.query("CREATE ROLE mt_qa_installer_probe NOLOGIN CREATEROLE;GRANT CREATE ON DATABASE maintrack_auth_local TO mt_qa_installer_probe;ALTER SCHEMA qa_security_final_20261025 OWNER TO mt_qa_installer_probe;DO $$ DECLARE r record; BEGIN FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='qa_security_final_20261025' AND c.relkind='r' LOOP EXECUTE format('ALTER TABLE qa_security_final_20261025.%I OWNER TO mt_qa_installer_probe',r.relname);END LOOP;END $$;SET LOCAL ROLE mt_qa_installer_probe");
  assert.equal((await c.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0].rolsuper,false);
  const sql=fs.readFileSync(new URL('../security/qa-permanent.sql',import.meta.url),'utf8').replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,'');
  await c.query(sql);
  const access=(await c.query("SELECT pg_has_role(current_user,'maintrack_qa_permanent_executor','SET') can_set,pg_has_role(current_user,'maintrack_qa_permanent_executor','USAGE') inherited")).rows[0];
  assert.equal(access.can_set,false);assert.equal(access.inherited,false);
  const owners=await c.query("SELECT pg_get_userbyid(p.proowner) owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='maintrack_qa_permanent' AND p.proname='mutate'");
  assert.equal(owners.rows[0].owner,'maintrack_qa_permanent_executor');
 } finally {await c.query('ROLLBACK');assert.equal((await c.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0].rolsuper,true);await c.end();}
});
