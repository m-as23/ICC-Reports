// Disposable Postgres only. This never connects to Supabase.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../../..');
const require=createRequire(process.env.LEDGER_PG_PACKAGE||path.join(root,'audit-output/test-runtime/package.json'));
const {PGlite}=require('@electric-sql/pglite');
const sql=await fs.readFile(path.join(root,'ops/maintrack/final-047-reset.sql'),'utf8');
const tables=sql.match(/TRUNCATE TABLE ([\s\S]+?) RESTART IDENTITY/)[1].split(',');
async function fixture(){
 const db=new PGlite();
 await db.exec('CREATE SCHEMA inv_lab; CREATE SEQUENCE public.mt_wo_number_seq START 99;');
 await db.exec('CREATE TABLE public.mt_users(id uuid primary key default gen_random_uuid(),employee_code text unique,name text,role text,active boolean,password_hash text,must_change boolean);');
 for(const table of tables.filter(x=>x!=='public.mt_users')){
  if(table==='inv_lab.active')await db.exec('CREATE TABLE inv_lab.active(singleton boolean primary key,current_version_id bigint,generation bigint);');
  else await db.exec(`CREATE TABLE ${table}(id bigserial primary key${table==='inv_lab.versions'?',file_storage_key text':''}${table.startsWith('public.')&&!/mt_(components|machines|sections|technicians|login_attempts|login_rate_guard)$/.test(table)?',user_id uuid references public.mt_users(id)':''});`);
 }
 for(const name of ['mt_migrations','mt_mail_config','mt_statuses','mt_categories'])await db.exec(`CREATE TABLE public.${name}(value text);INSERT INTO public.${name} VALUES('preserve configuration');`);
 await db.exec("INSERT INTO public.mt_users(employee_code,name,role,active,password_hash,must_change) VALUES('PILOT01','test owner','owner',true,'existing-password-hash',false),('TESTTECH','test technician','technician',true,'discard',false);INSERT INTO public.mt_reports DEFAULT VALUES;INSERT INTO inv_lab.items DEFAULT VALUES;INSERT INTO inv_lab.active VALUES(true,6,3);");
 return db;
}
test('clean launch removes test users/records, creates new OWNER with password continuity and preserves configuration',async()=>{
 const db=await fixture();try{
  await db.exec(sql);
  const users=(await db.query('SELECT employee_code,role,active,must_change,password_hash FROM public.mt_users')).rows;
  assert.deepEqual(users,[{employee_code:'OWNER',role:'owner',active:true,must_change:true,password_hash:'existing-password-hash'}]);
  for(const table of ['public.mt_reports','public.mt_sessions','inv_lab.items'])assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0);
  assert.deepEqual((await db.query('SELECT current_version_id,generation::int FROM inv_lab.active')).rows,[{current_version_id:null,generation:4}]);
  assert.equal((await db.query("SELECT nextval('public.mt_wo_number_seq')::int AS n")).rows[0].n,1);
  for(const table of ['mt_migrations','mt_mail_config','mt_statuses','mt_categories'])assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n,1);
 }finally{await db.close()}
});
test('missing active Owner or an unreviewed dependent table stops reset and rolls back',async()=>{
 for(const mode of ['missing-owner','new-dependent']){
  const db=await fixture();try{
   if(mode==='missing-owner')await db.exec("UPDATE public.mt_users SET active=false WHERE employee_code='PILOT01'");
   else await db.exec('CREATE TABLE public.unreviewed_child(user_id uuid references public.mt_users(id));');
   await assert.rejects(db.exec(sql));await db.exec('ROLLBACK');
   assert.equal((await db.query('SELECT count(*)::int AS n FROM public.mt_reports')).rows[0].n,1);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM public.mt_users')).rows[0].n,2);
  }finally{await db.close()}
 }
});
