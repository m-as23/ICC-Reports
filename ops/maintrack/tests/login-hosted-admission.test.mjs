// Actual hosted router + Login functions, synthetic owned PostgreSQL only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {withLoginBudget,LoginRateError,trustedLoginSource} from '../../../supabase/functions/maintrack-final-047/login-rate-limit.mjs';
const coreGuards=vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/core-types.ts',import.meta.url),'utf8'),{mode:'transform'}).replace(/^export /gm,'')+';({sessionUser,isRequestBody,actor})');
const {Pool}=createRequire(new URL('../inventory/backend/package.json',import.meta.url))('pg');
const source=fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/index.ts',import.meta.url),'utf8');
const declaration=name=>{const a=source.indexOf('async function '+name+'(');assert.ok(a>=0);const b=source.indexOf('\nasync function ',a+1);return stripTypeScriptTypes(source.slice(a,b),{mode:'transform'});};

test('hosted admission is source-independent without losing account limits',{skip:!process.env.LOGIN_PG_URL?'owned LOGIN_PG_URL required':false},async t=>{
 const raw=process.env.LOGIN_PG_URL,u=new URL(raw);
 assert.ok(['postgres:','postgresql:'].includes(u.protocol)&&['127.0.0.1','localhost'].includes(u.hostname)&&u.pathname==='/maintrack_auth_local'&&!u.search&&!u.hash&&['mt_local_admin','mt_lab_admin'].includes(u.username));
 const admin=new Pool({connectionString:raw,max:1}),pools=[new Pool({connectionString:raw,max:2,connectionTimeoutMillis:2000}),new Pool({connectionString:raw,max:2,connectionTimeoutMillis:2000})];
 const logs=[];
 try{
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1');
  await admin.query(`CREATE SCHEMA IF NOT EXISTS extensions;CREATE SEQUENCE IF NOT EXISTS hosted_hash_calls;CREATE OR REPLACE FUNCTION extensions.crypt(p text,s text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN PERFORM nextval('hosted_hash_calls');PERFORM pg_sleep(0.2);RETURN p;END $$;CREATE TABLE IF NOT EXISTS mt_users(id text PRIMARY KEY,employee_code text UNIQUE,name text,role text,active boolean,token_version integer,must_change boolean,password_hash text);CREATE TABLE IF NOT EXISTS mt_sessions(token_hash text PRIMARY KEY,user_id text,token_version integer,expires_at timestamptz);CREATE TABLE IF NOT EXISTS mt_login_rate_guard(key_hash text PRIMARY KEY,window_start timestamptz,attempts integer,updated_at timestamptz);CREATE TABLE IF NOT EXISTS mt_login_attempts(employee_code text PRIMARY KEY,fail_count integer,updated_at timestamptz,blocked_until timestamptz);TRUNCATE mt_users,mt_sessions,mt_login_rate_guard,mt_login_attempts;INSERT INTO mt_users VALUES('a','90000001','SYNTHETIC A','engineer',true,0,false,'FixtureOnly7'),('b','90000002','SYNTHETIC B','technician',true,0,false,'FixtureOnly7');INSERT INTO mt_login_rate_guard VALUES('maintrack_stage9_global_login',now(),301,now())`);
  const handlers=pools.map(pool=>{
   class AppError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status;}}
   let handler,env;
   const ctx={...coreGuards,pool,withLoginBudget,trustedLoginSource,LoginRateError,AppError,randomBytes,randomUUID,URL,Request,Response,sha:x=>createHash('sha256').update(x).digest('hex'),validEmployeeCode:x=>typeof x==='string'&&/^[0-9]{1,32}$/.test(x),first:async(c,q,p)=>(await c.query(q,p)).rows[0]||null,die:(code,status)=>{throw new AppError(code,status);},MT_ALLOWED_ORIGINS:new Set(),text:x=>String(x),console:{info:x=>logs.push(x),error:x=>logs.push(x)},Deno:{env:{get:()=>env},serve:fn=>{handler=fn;}}};
   ctx.issue=vm.runInNewContext('('+declaration('issue')+')',ctx);ctx.login=vm.runInNewContext('('+declaration('login')+')',ctx);
   const router=stripTypeScriptTypes(source.slice(source.lastIndexOf('Deno.serve(')),{mode:'transform'});
   vm.runInNewContext(router,ctx);
   return {call:async(code,pw,headers={},body={},mode)=>{env=mode;const req=new Request('https://qa.invalid/api',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({action:'login',code,pw,...body})});return handler(req,new Proxy({},{get(){throw Error('TRANSPORT_METADATA_MUST_NOT_BE_USED');}}));}};
  });
  await t.test('no ingress flag or gateway peer required; forged headers/body cannot select source',async()=>{
   const locker=await admin.connect();try{await locker.query('BEGIN');await locker.query('LOCK TABLE mt_login_rate_guard IN ACCESS EXCLUSIVE MODE');
    for(const mode of [undefined,'verified-direct-transport-v1']){
     const r=await handlers[0].call('90000002','FixtureOnly7',{'x-forwarded-for':'1.2.3.4, 127.0.0.1','x-real-ip':'10.0.0.1','cf-connecting-ip':'203.0.113.9'},{source:'forged',role:'owner'},mode);
     assert.equal(r.status,200);const b=await r.json();assert.ok(/^[a-f0-9]{64}$/.test(b.token));assert.equal(b.role,'technician');
    }
   }finally{await locker.query('ROLLBACK');locker.release();}
  });
  await t.test('unknown codes create no account-counter rows or shared source budget',async()=>{
   const before=(await admin.query('SELECT count(*) n FROM mt_login_attempts')).rows[0].n;
   for(let i=0;i<16;i++)assert.equal((await handlers[i%2].call(String(100000+i),'wrong')).status,401);
   assert.equal((await admin.query('SELECT count(*) n FROM mt_login_attempts')).rows[0].n,before);
   assert.equal((await admin.query('SELECT count(*) n FROM mt_login_rate_guard')).rows[0].n,'1');
   assert.equal((await handlers[1].call('90000002','FixtureOnly7')).status,200);
  });
  await t.test('changing all forwarding headers cannot bypass five failures; other account remains available',async()=>{
   for(let i=0;i<5;i++)assert.equal((await handlers[i%2].call('90000001','wrong',{'x-forwarded-for':'192.0.2.'+i,'cf-connecting-ip':'198.51.100.'+i,'x-real-ip':'203.0.113.'+i})).status,401);
   assert.equal((await handlers[0].call('90000001','FixtureOnly7')).status,429);
   assert.equal((await handlers[1].call('90000002','FixtureOnly7')).status,200);
   assert.equal((await admin.query("SELECT fail_count FROM mt_login_attempts WHERE employee_code='90000001'")).rows[0].fail_count,5);
   await admin.query("UPDATE mt_login_attempts SET updated_at=now()-interval '6 minutes',blocked_until=now()-interval '1 second'");
   assert.equal((await handlers[1].call('90000001','FixtureOnly7')).status,200);
  });
  await t.test('same account cannot consume remaining global slots while another instance hashes it',async()=>{
   const owner=await admin.connect();try{await owner.query('BEGIN');await owner.query("SELECT pg_advisory_xact_lock(hashtextextended('maintrack-login-account:90000001',0))");
    for(let i=0;i<4;i++)assert.equal((await handlers[i%2].call('90000001','wrong')).status,429);
    assert.equal((await handlers[1].call('90000002','FixtureOnly7')).status,200);
   }finally{await owner.query('ROLLBACK');owner.release();}
  });
  await t.test('four source-independent slots bound work and recover after release',async()=>{
   const workers=Array.from({length:5},()=>new Pool({connectionString:raw,max:1,connectionTimeoutMillis:2000})),release=[],running=[];
   try{for(let i=0;i<4;i++){let enter;const ready=new Promise(r=>enter=r);const current=withLoginBudget(workers[i],undefined,'slot-account-'+i,async()=>{enter();await new Promise(r=>release.push(r));return true;});running.push(current);await Promise.race([ready,current.then(()=>{throw Error('WORK_FINISHED_BEFORE_ENTRY');})]);}
    await assert.rejects(()=>withLoginBudget(workers[4],undefined,'probe',async()=>true),e=>e.code==='LOGIN_BUSY');
    release.splice(0).forEach(r=>r());await Promise.all(running);
    assert.equal(await withLoginBudget(workers[4],undefined,'probe',async()=>true),true);
   }finally{release.splice(0).forEach(r=>r());await Promise.allSettled(running);await Promise.all(workers.map(p=>p.end()));}
  });
  await t.test('unexpected default-mode failure rolls back and releases account admission',async()=>{
   await assert.rejects(()=>withLoginBudget(pools[0],undefined,'rollback-default',async c=>{await c.query("INSERT INTO mt_login_attempts VALUES('rollback-default',1,now(),NULL)");throw Error('synthetic-failure');}),/synthetic-failure/);
   assert.equal((await admin.query("SELECT count(*) n FROM mt_login_attempts WHERE employee_code='rollback-default'")).rows[0].n,'0');
   assert.equal(await withLoginBudget(pools[1],null,'rollback-default',async()=>true),true);
  });
  assert.ok(logs.every(x=>!x.includes('FixtureOnly7')&&!x.includes('wrong')&&!x.includes('203.0.113.9')),'no credentials or forwarded addresses logged');
 }finally{await Promise.all(pools.map(p=>p.end()));await admin.end();}
});
