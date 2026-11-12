// Native archive rehearsal on the existing marked, loopback-only disposable lab.
// No cloud URLs, service files, passwords or employee data are accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const {Pool}=createRequire(new URL('../inventory/backend/package.json',import.meta.url))('pg');
const bin='C:/Program Files/PostgreSQL/17/bin';
const cfg={host:'127.0.0.1',port:55438,user:'mt_local_admin',database:'maintrack_auth_local',max:1};
const suffix=crypto.randomBytes(5).toString('hex');
const schema='qa_archive_'+suffix,control='qa_control_'+suffix;
const owner='qa_archive_owner_'+suffix,reader='qa_archive_reader_'+suffix;
const target='maintrack_restore_'+suffix;
const dir=path.resolve('D:/MainTrack-Android-QA/evidence/final-recovery-alternative-20261030/native-archive-'+suffix);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const catalog=`SELECT json_build_object(
 'schemas',(SELECT json_agg(json_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname=$1),
 'tables',(SELECT json_agg(json_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r'),
 'functions',(SELECT json_agg(json_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1),
 'policies',(SELECT json_agg(json_build_object('name',policyname,'roles',roles,'cmd',cmd,'qual',qual,'check',with_check) ORDER BY policyname) FROM pg_policies WHERE schemaname=$1),
 'triggers',(SELECT json_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND NOT t.tgisinternal)
 ) AS state`;
test('native schema-only dump/restore retains owners, ACL, RLS, functions and triggers locally',{timeout:45000,skip:process.platform!=='win32'?'Windows native archive rehearsal':false},async t=>{
 const admin=new Pool(cfg);let restored,created=false,marked=false;const checks=[];
 const pass=(id)=>checks.push({id,status:'PASS'});
 try{
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1');
  marked=true;
  fs.mkdirSync(dir,{recursive:true});
  await admin.query(`CREATE ROLE ${owner} NOLOGIN;CREATE ROLE ${reader} NOLOGIN;
   CREATE SCHEMA ${schema} AUTHORIZATION ${owner};CREATE SCHEMA ${control};CREATE TABLE ${control}.sentinel(balance integer);INSERT INTO ${control}.sentinel VALUES(17);
   SET ROLE ${owner};CREATE TABLE ${schema}.items(actor text,state text);
   ALTER TABLE ${schema}.items ENABLE ROW LEVEL SECURITY;
   CREATE POLICY actor_read ON ${schema}.items FOR SELECT TO ${reader} USING(actor='90000001');
   GRANT USAGE ON SCHEMA ${schema} TO ${reader};GRANT SELECT ON ${schema}.items TO ${reader};
   CREATE FUNCTION ${schema}.write_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.state='QUARANTINED' THEN RAISE EXCEPTION 'CLOSED';END IF;RETURN NEW;END$$;
   REVOKE ALL ON FUNCTION ${schema}.write_guard() FROM PUBLIC;
   CREATE TRIGGER guard BEFORE INSERT ON ${schema}.items FOR EACH ROW EXECUTE FUNCTION ${schema}.write_guard();RESET ROLE;`);
  const before=(await admin.query(catalog,[schema])).rows[0].state;
  const url='postgresql://mt_local_admin@127.0.0.1:55438/';
  execFileSync(path.join(bin,'pg_dump.exe'),['--no-password','--dbname',url+cfg.database,'--schema-only','--format=custom','--schema',schema,'--lock-wait-timeout=3s','--file',path.join(dir,'schema.dump')],{timeout:15000,windowsHide:true,stdio:'pipe'});
  const index=execFileSync(path.join(bin,'pg_restore.exe'),['--list',path.join(dir,'schema.dump')],{encoding:'utf8',timeout:5000,windowsHide:true});
  await t.test('archive is schema-only and includes policy/trigger/function entries',()=>{assert.doesNotMatch(index,/TABLE DATA/);for(const kind of ['POLICY','TRIGGER','FUNCTION','ACL'])assert.ok(index.includes(kind));pass('schema_only_native_archive');});
  await admin.query(`CREATE DATABASE ${target} TEMPLATE template0`);created=true;
  await admin.query(`COMMENT ON DATABASE ${target} IS 'MAINTRACK_RECOVERY_ARCHIVE_EPHEMERAL_V1'`);
  execFileSync(path.join(bin,'pg_restore.exe'),['--no-password','--exit-on-error','--single-transaction','--dbname',url+target,path.join(dir,'schema.dump')],{timeout:15000,windowsHide:true,stdio:'pipe'});
  restored=new Pool({...cfg,database:target});
  await t.test('catalog including ownership ACL RLS functions and triggers restored exactly',async()=>{assert.deepEqual((await restored.query(catalog,[schema])).rows[0].state,before);assert.equal((await restored.query(`SELECT count(*)::int n FROM ${schema}.items`)).rows[0].n,0);pass('exact_restored_catalog');});
  await t.test('restored RLS and trigger enforce restrictions',async()=>{
   await restored.query(`INSERT INTO ${schema}.items VALUES('90000001','READY'),('90000002','READY')`);
   const client=await restored.connect();try{await client.query(`SET ROLE ${reader}`);assert.equal((await client.query(`SELECT count(*)::int n FROM ${schema}.items`)).rows[0].n,1);await assert.rejects(()=>client.query(`INSERT INTO ${schema}.items VALUES('90000001','READY')`),e=>e.code==='42501');}finally{await client.query('RESET ROLE');client.release();}
   await assert.rejects(()=>restored.query(`INSERT INTO ${schema}.items VALUES('90000001','QUARANTINED')`),e=>e.message==='CLOSED');pass('restored_rls_acl_and_trigger_enforcement');
  });
  await t.test('non-scope sentinel unchanged and absent from restored database',async()=>{assert.equal((await admin.query(`SELECT balance FROM ${control}.sentinel`)).rows[0].balance,17);assert.equal((await restored.query('SELECT to_regclass($1) r',[control+'.sentinel'])).rows[0].r,null);pass('outside_scope_untouched');});
  fs.writeFileSync(path.join(dir,'archive-index.txt'),index);
 }finally{
  if(marked){
  await restored?.end();
  if(created){assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=$1",[target])).rows[0].marker,'MAINTRACK_RECOVERY_ARCHIVE_EPHEMERAL_V1');await admin.query(`DROP DATABASE ${target}`);}
  await admin.query(`RESET ROLE;DROP SCHEMA IF EXISTS ${schema} CASCADE;DROP SCHEMA IF EXISTS ${control} CASCADE;DROP ROLE IF EXISTS ${reader};DROP ROLE IF EXISTS ${owner}`);
  const residual=await admin.query('SELECT (SELECT count(*) FROM pg_namespace WHERE nspname=ANY($1))::int schemas,(SELECT count(*) FROM pg_roles WHERE rolname=ANY($2))::int roles',[ [schema,control],[owner,reader] ]);
  assert.deepEqual(residual.rows[0],{schemas:0,roles:0});await admin.end();
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({scope:'Synthetic local native archive only; no Supabase snapshot or cloud restore',checks,cleanup:residual.rows[0],archiveSha256:fs.existsSync(path.join(dir,'schema.dump'))?hash(fs.readFileSync(path.join(dir,'schema.dump'))):null,roles:'NOLOGIN fixture roles provisioned separately; pg_dump does not archive global role definitions',employeeData:false},null,2));
  }else await admin.end();
 }
});
