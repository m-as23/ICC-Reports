import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegisteredPasswordExecutor,RegisteredIdentityAdmin} from '../security/registered-login.mjs';

test('session issuance denies an unsupported credential binding before password work',()=>{
 assert.throws(()=>createRegisteredPasswordExecutor({pool:{},store:{},passwordWork:async()=>({token:'synthetic'})}),/IDENTITY_SESSION_BINDING_REQUIRED/);
});
test('operator session invalidation unsupported fails closed before database mutation',async()=>{
 const operator=new RegisteredIdentityAdmin({pool:{connect(){throw Error('MUST_NOT_MUTATE');}},resolveEmployee:async()=>({id:'11111111-2222-4333-8444-555555555555',employee_code:'90000001',active:true})});
 await assert.rejects(()=>operator.revoke({principal:'11111111-2222-4333-8444-555555555555',verificationRef:'LOCAL_CASE_REVOKE'}),/IDENTITY_SESSION_INVALIDATION_REQUIRED/);
 await assert.rejects(()=>operator.enroll({code:'90000001',recover:true,verificationRef:'LOCAL_CASE_RECOVER'}),/IDENTITY_SESSION_INVALIDATION_REQUIRED/);
});
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createHash,randomBytes} from 'node:crypto';
const {Pool}=createRequire(new URL('../inventory/backend/package.json',import.meta.url))('pg');
const sha=x=>createHash('sha256').update(x).digest('hex');
test('atomic recovery rejects stolen session; credential revoke preserves siblings; failed invalidation and binding roll back',{skip:!process.env.LOGIN_PG_URL},async t=>{
 const u=new URL(process.env.LOGIN_PG_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55438');assert.equal(u.username,'mt_local_admin');assert.equal(u.password,'');assert.equal(u.pathname,'/maintrack_auth_local');
 const cfg={host:u.hostname,port:55438,user:u.username,database:'maintrack_auth_local'},admin=new Pool(cfg),name='mt_session_'+randomBytes(5).toString('hex');let db,created=false;
 const principal='11111111-2222-4333-8444-555555555555';
 try{
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1');
  await admin.query('CREATE DATABASE '+name+' TEMPLATE template0');created=true;await admin.query(`COMMENT ON DATABASE ${name} IS 'MAINTRACK_REGISTERED_SESSION_LOCAL_V1'`);db=new Pool({...cfg,database:name,max:4});
  await db.query(fs.readFileSync(new URL('../security/registered-login.sql',import.meta.url),'utf8'));
  await db.query(fs.readFileSync(new URL('../security/registered-login-rpc.sql',import.meta.url),'utf8'));
  await db.query('CREATE TABLE synthetic_sessions(token_hash text PRIMARY KEY,principal uuid NOT NULL,credential text NOT NULL)');
  await db.query("INSERT INTO mt_registered_identity.principal(id,employee_code) VALUES($1,'90000001');",[principal]);
  await db.query("INSERT INTO mt_registered_identity.credential VALUES('device-a',$1,decode('00','hex'),0,false),('device-b',$1,decode('00','hex'),0,false)",[principal]);
  let failInvalidation=false,failBinding=false;
  const operator=new RegisteredIdentityAdmin({pool:db,resolveEmployee:async code=>({id:principal,employee_code:code,active:true}),invalidateSessions:async(c,{principal,credentialId})=>{await c.query('DELETE FROM synthetic_sessions WHERE principal=$1 AND ($2::text IS NULL OR credential=$2)',[principal,credentialId]);if(failInvalidation)throw Error('SYNTHETIC_INVALIDATION_FAILED');return true;}});
  const {PgIdentityStore}=await import('../security/registered-login.mjs');const store=new PgIdentityStore(db);
  const login=createRegisteredPasswordExecutor({pool:db,store,passwordWork:async(c,b,identity)=>{assert.equal(identity.principal,principal);return {token:randomBytes(32).toString('hex')};},bindSession:async(c,identity,result)=>{await c.query('INSERT INTO synthetic_sessions VALUES($1,$2,$3)',[sha(result.token),identity.principal,identity.id]);if(failBinding)return false;return store.bindSession(c,identity,sha(result.token));}});
  const identity=id=>({id,principal,epoch:1}),body={code:'90000001',pw:'SYNTHETIC_ONLY'};
  const a=await login(body,identity('device-a')),b=await login(body,identity('device-b'));const authorized=async token=>(await db.query('SELECT 1 FROM synthetic_sessions WHERE token_hash=$1',[sha(token)])).rowCount===1;
  failInvalidation=true;await assert.rejects(()=>operator.revoke({principal,credentialId:'device-a',verificationRef:'LOCAL_CASE_FAILED_REVOKE'}),/SYNTHETIC_INVALIDATION_FAILED/);assert.equal(await authorized(a.token),true);assert.equal((await db.query("SELECT revoked FROM mt_registered_identity.credential WHERE id='device-a'")).rows[0].revoked,false);
  failInvalidation=false;await operator.revoke({principal,credentialId:'device-a',verificationRef:'LOCAL_CASE_REVOKE_DEVICE'});assert.equal(await authorized(a.token),false);assert.equal(await authorized(b.token),true);
  failBinding=true;await assert.rejects(()=>login(body,identity('device-b')),/IDENTITY_SESSION_BINDING_REQUIRED/);assert.equal((await db.query('SELECT count(*) n FROM synthetic_sessions')).rows[0].n,'1');failBinding=false;
  failInvalidation=true;await assert.rejects(()=>operator.enroll({code:'90000001',recover:true,verificationRef:'LOCAL_CASE_FAILED_RECOVERY'}),/SYNTHETIC_INVALIDATION_FAILED/);assert.equal(await authorized(b.token),true);assert.equal((await db.query('SELECT epoch FROM mt_registered_identity.principal')).rows[0].epoch,1);assert.equal((await db.query('SELECT 1 FROM mt_registered_identity.invitation')).rowCount,0);
  failInvalidation=false;await operator.enroll({code:'90000001',recover:true,verificationRef:'LOCAL_CASE_RECOVERY'});assert.equal(await authorized(b.token),false);assert.equal((await db.query('SELECT epoch FROM mt_registered_identity.principal')).rows[0].epoch,2);await assert.rejects(()=>login(body,identity('device-b')),/IDENTITY_REJECTED/);
 }finally{await db?.end();if(created){assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=$1",[name])).rows[0].marker,'MAINTRACK_REGISTERED_SESSION_LOCAL_V1');await admin.query('DROP DATABASE '+name);}await admin.end();}
});
