import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';import {createRequire} from 'node:module';import {randomBytes} from 'node:crypto';
import {PgIdentityStore,RegisteredIdentityAdmin,createRegisteredLogin,createRegisteredPasswordExecutor} from '../security/registered-login.mjs';
import {createGatewaySigner,createGatewayVerifier} from '../../../supabase/functions/maintrack-final-047/login-gateway.mjs';
const {chromium}=createRequire(new URL('../security/package.json',import.meta.url))('playwright-core');const {Pool}=createRequire(new URL('../inventory/backend/package.json',import.meta.url))('pg');

test('registered candidate real browser WebAuthn + HTTP + PostgreSQL lifecycle and NAT admission',{timeout:60000},async t=>{
 const u=new URL(process.env.LOGIN_PG_URL);assert.equal(u.origin,'null');assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55438');assert.equal(u.username,'mt_local_admin');assert.equal(u.password,'');assert.equal(u.pathname,'/maintrack_auth_local');
 const ownerRole='mt_id_owner_'+randomBytes(4).toString('hex'),runtimeRole='mt_id_runtime_'+randomBytes(4).toString('hex');let rolesCreated=false;
 const cfg={host:u.hostname,port:Number(u.port),user:u.username,database:'maintrack_auth_local'},admin=new Pool({...cfg,max:1}),name='maintrack_registered_'+randomBytes(5).toString('hex');let db,runtime,browser,server,created=false,providerAvailable=true,dropResponse=false,clock=Date.now(),passwordCalls=0,maxActive=0,providerCalls=0,slowProvider=false;const metrics={scope:'Local browser virtual authenticator + real PG; not Android, Cloud or human identity verification',checks:[],latenciesMs:[]},observedPeers=new Set();
 try{
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1');await admin.query('CREATE DATABASE '+name+' TEMPLATE template0');created=true;await admin.query(`COMMENT ON DATABASE ${name} IS 'MAINTRACK_REGISTERED_LOCAL_EPHEMERAL_V1'`);db=new Pool({...cfg,database:name,max:8});
  await db.query(fs.readFileSync(new URL('../security/registered-login.sql',import.meta.url),'utf8'));await db.query("CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;CREATE TABLE synthetic_auth(code text PRIMARY KEY,hash text,id uuid DEFAULT gen_random_uuid(),active boolean DEFAULT true);INSERT INTO synthetic_auth(code,hash) VALUES('90000001',extensions.crypt('SyntheticOnly7',extensions.gen_salt('bf',13))),('90000002',extensions.crypt('SyntheticOnly7',extensions.gen_salt('bf',11)))");
  await db.query(fs.readFileSync(new URL('../security/registered-login-rpc.sql',import.meta.url),'utf8'));
  await db.query('CREATE ROLE '+ownerRole+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;CREATE ROLE '+runtimeRole+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');rolesCreated=true;
  const functions=(await db.query("SELECT p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='mt_registered_identity'")).rows;
  for(const {signature} of functions){await db.query('ALTER FUNCTION '+signature+' OWNER TO '+ownerRole);await db.query('GRANT EXECUTE ON FUNCTION '+signature+' TO '+runtimeRole);}
  for(const table of ['principal','invitation','credential','used_proof','operator_audit','session_binding','provider_pending'])await db.query('ALTER TABLE mt_registered_identity.'+table+' OWNER TO '+ownerRole);
  await db.query('ALTER SCHEMA mt_registered_identity OWNER TO '+ownerRole);await db.query('GRANT USAGE ON SCHEMA mt_registered_identity,extensions TO '+runtimeRole);await db.query('GRANT SELECT ON synthetic_auth TO '+runtimeRole);
  runtime=new Pool({...cfg,database:name,max:8,options:'-c role='+runtimeRole});
  await assert.rejects(()=>runtime.query('SELECT * FROM mt_registered_identity.credential'),e=>e.code==='42501');await assert.rejects(()=>runtime.query("INSERT INTO mt_registered_identity.principal VALUES(gen_random_uuid(),'90000009',1,true)"),e=>e.code==='42501');
  assert.equal((await runtime.query("SELECT current_user AS role,(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) bypass")).rows[0].bypass,false);
  // This legacy WebAuthn fixture deliberately issues no sessions. Real session rollback/binding is covered by registered-login.sessions.test.mjs.
  const registry=new PgIdentityStore(runtime),operator=new RegisteredIdentityAdmin({pool:db,invalidateSessions:async()=>true,resolveEmployee:async code=>(await db.query('SELECT id,code AS employee_code,active FROM synthetic_auth WHERE code=$1',[code])).rows[0]}),secret=randomBytes(32).toString('hex'),signer=createGatewaySigner({secret}),verifier=createGatewayVerifier({secret});
  const passwordLogin=createRegisteredPasswordExecutor({pool:runtime,store:registry,bindSession:async(c,identity,result)=>result.scope==='LOCAL_SYNTHETIC_PASSWORD_VERIFIED_NOT_CORE_SESSION',passwordWork:async(c,b)=>{passwordCalls++;await c.query("SELECT set_config('application_name',$1,true)",['registered_bcrypt_'+b.code]);const ok=(await c.query('SELECT code FROM synthetic_auth WHERE code=$1 AND hash=extensions.crypt($2,hash)',[b.code,b.pw])).rowCount;if(!ok)throw Error('BAD_PW');return {scope:'LOCAL_SYNTHETIC_PASSWORD_VERIFIED_NOT_CORE_SESSION',code:b.code};}});
  let handler;
  server=http.createServer(async(req,res)=>{observedPeers.add(req.socket.remoteAddress);try{if(req.method==='GET'){res.setHeader('content-type',req.url==='/client.mjs'?'text/javascript':'text/html');return res.end(req.url==='/client.mjs'?fs.readFileSync(new URL('../security/registered-login-client.mjs',import.meta.url)):'<!doctype html><title>Isolated registered identity acceptance</title>');}let raw='';for await(const p of req){raw+=p;if(raw.length>65536)throw Error('BODY');}const body=JSON.parse(raw),url='https://szhstrafzkxzstjdcynl.supabase.co/functions/v1/maintrack-security-qa-final/api';const headers={'content-type':'application/json'};if(req.url==='/api/login')headers['x-maintrack-admission']=signer(body,'192.0.2.1');const value=await handler(new Request(url,{method:'POST',headers,body:raw}),body);if(dropResponse&&body.identity?.phase==='login-finish'){dropResponse=false;req.socket.destroy();return;}res.setHeader('content-type','application/json');res.end(JSON.stringify(value));}catch(e){console.error('LOCAL_PHASE_ERROR',e.name,e.code||'',/^(IDENTITY_|GATEWAY_|DEVICE_|LOCAL_PROVIDER_)/.test(e.message)?e.message:'VERIFIER_REJECTED');res.writeHead(e.code==='LOGIN_BUSY'?429:403);res.end(JSON.stringify({error:'REJECTED'}));}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://localhost:'+server.address().port;
  const config={store:registry,rpID:'localhost',origin,challengeSecret:randomBytes(32).toString('hex'),verifyIngress:async(req,b)=>verifier(req,b),verifyProvider:async(body,signal)=>{providerCalls++;if(slowProvider&&body.code==='90000001')await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('LOCAL_PROVIDER_ABORTED')),{once:true});setTimeout(resolve,1000);});if(!providerAvailable)throw Error('LOCAL_PROVIDER_FAILURE');return true;},passwordLogin,now:()=>clock};handler=createRegisteredLogin(config);
  browser=await chromium.launch({executablePath:process.env.MAINTRACK_BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  async function device(){const ctx=await browser.newContext({serviceWorkers:'block'});await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await ctx.newPage();const cdp=await ctx.newCDPSession(page);await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});await page.goto(origin);await page.evaluate(async()=>{const {createRegisteredClient}=await import('/client.mjs');window.sent=[];window.client=createRegisteredClient({endpoint:'/api/login',ingressProof:async b=>b,fetchImpl:async(url,opts)=>{window.sent.push(JSON.parse(opts.body));return fetch(url,opts);}});});return {page,ctx,cdp};}
  const A=await device(),B=await device(),A2=await device();const invitationA=await operator.enroll({code:'90000001',verificationRef:'LOCAL_OPERATOR_CASE_A'}),invitationB=await operator.enroll({code:'90000002',verificationRef:'LOCAL_OPERATOR_CASE_B'});
  await t.test('enrollment provider reservation validates invitation expiry epoch and enabled principal',async()=>{
   const nonce=()=>randomBytes(16).toString('hex');
   await assert.rejects(()=>registry.reserveEnrollmentProvider(randomBytes(32).toString('base64url'),nonce()));
   await assert.rejects(()=>registry.reserveEnrollmentProvider(invitationA.token,'bad'));
   await db.query("UPDATE mt_registered_identity.invitation SET expires=clock_timestamp()-interval '1 second' WHERE principal=$1",[invitationA.principal]);
   await assert.rejects(()=>registry.reserveEnrollmentProvider(invitationA.token,nonce()));
   await db.query("UPDATE mt_registered_identity.invitation SET expires=clock_timestamp()+interval '10 minutes',epoch=epoch+1 WHERE principal=$1",[invitationA.principal]);
   await assert.rejects(()=>registry.reserveEnrollmentProvider(invitationA.token,nonce()));
   await db.query('UPDATE mt_registered_identity.invitation SET epoch=epoch-1 WHERE principal=$1',[invitationA.principal]);
   await db.query('UPDATE mt_registered_identity.principal SET enabled=false WHERE id=$1',[invitationA.principal]);
   await assert.rejects(()=>registry.reserveEnrollmentProvider(invitationA.token,nonce()));
   await db.query('UPDATE mt_registered_identity.principal SET enabled=true WHERE id=$1',[invitationA.principal]);
   assert.equal((await db.query('SELECT * FROM mt_registered_identity.provider_pending')).rowCount,0);
  });
  await t.test('one valid enrollment invitation across eight requests permits one slow provider and another principal options',async()=>{
   slowProvider=true;const before=providerCalls;
   const enrollmentBody={action:'login',code:'90000001',identity:{phase:'enroll-options',invitation:invitationA.token}};
   const send=(page,body)=>page.evaluate(async b=>{const r=await fetch('/api/login',{method:'POST',body:JSON.stringify(b)});return {status:r.status,body:await r.json()};},body);
   const first=send(A.page,enrollmentBody);
   try{
    for(let n=0;n<100&&providerCalls===before;n++)await new Promise(r=>setTimeout(r,10));assert.equal(providerCalls,before+1);
    handler=createRegisteredLogin(config);
    const rejected=await Promise.all(Array.from({length:7},()=>send(A2.page,enrollmentBody)));assert.equal(rejected.every(r=>r.status===403),true);assert.equal(providerCalls,before+1);
    const other=await send(B.page,{action:'login',code:'90000002',identity:{phase:'enroll-options',invitation:invitationB.token}});assert.equal(other.status,200);assert.ok(other.body.options);assert.ok(other.body.ticket);
    assert.equal(Number((await db.query("SELECT count(*) n FROM pg_stat_activity WHERE datname=$1 AND state='idle in transaction'",[name])).rows[0].n),0);
    assert.equal((await first).status,200);assert.equal(providerCalls,before+2);assert.equal((await db.query('SELECT * FROM mt_registered_identity.provider_pending')).rowCount,0);
   }finally{slowProvider=false;await first;}
   metrics.checks.push('ENROLL_INVITATION_EIGHT_REQUESTS_ONE_PROVIDER_OTHER_PRINCIPAL_AVAILABLE');
  });
  await t.test('single-use trusted invitation registers real WebAuthn credential; unsigned direct request denied',async()=>{
   await A.page.evaluate(token=>window.client.enroll('90000001',token),invitationA.token);await B.page.evaluate(token=>window.client.enroll('90000002',token),invitationB.token);
   const extra=await operator.enroll({principal:invitationA.principal,code:'90000001',verificationRef:'LOCAL_OPERATOR_SECOND_DEVICE'});await A2.page.evaluate(token=>window.client.enroll('90000001',token),extra.token);
   assert.equal(Number((await db.query('SELECT count(*) n FROM mt_registered_identity.credential')).rows[0].n),3);assert.equal((await db.query('SELECT * FROM mt_registered_identity.invitation')).rowCount,0);
   const A3=await device(),third=await operator.enroll({principal:invitationA.principal,code:'90000001',verificationRef:'LOCAL_OPERATOR_THIRD_DEVICE'});await assert.rejects(()=>A3.page.evaluate(token=>window.client.enroll('90000001',token),third.token));assert.equal(Number((await db.query('SELECT count(*) n FROM mt_registered_identity.credential WHERE NOT revoked')).rows[0].n),3);
   const before=passwordCalls;assert.equal((await fetch(origin+'/edge/api',{method:'POST',body:JSON.stringify({action:'login',code:'90000001',pw:'SyntheticOnly7',identity:{phase:'login-options'}})})).status,403);assert.equal(passwordCalls,before);
   await assert.rejects(()=>A.page.evaluate(token=>window.client.enroll('90000001',token),invitationA.token));metrics.checks.push('ENROLLMENT_SINGLE_USE_AND_DIRECT_BYPASS_DENIED');
  });
  await t.test('different registered principals share NAT without sharing source quota; actual bcrypt overlap',async()=>{
   const a=A.page.evaluate(()=>window.client.login('90000001','SyntheticOnly7'));let active=0;for(let i=0;i<80;i++){active=Number((await db.query("SELECT count(*) n FROM pg_stat_activity WHERE application_name='registered_bcrypt_90000001' AND state='active'")).rows[0].n);if(active)break;await new Promise(r=>setTimeout(r,10));}assert.equal(active,1);const before=passwordCalls;await assert.rejects(()=>A2.page.evaluate(()=>window.client.login('90000001','SyntheticOnly7')));assert.equal(passwordCalls,before);const start=performance.now();assert.equal((await B.page.evaluate(()=>window.client.login('90000002','SyntheticOnly7'))).code,'90000002');metrics.latenciesMs.push(performance.now()-start);assert.equal((await a).code,'90000001');maxActive=Number((await db.query('SELECT count(*) n FROM pg_stat_activity WHERE datname=$1',[name])).rows[0].n);metrics.checks.push('SAME_NAT_REGISTERED_PRINCIPALS_REAL_BCRYPT');
  });
  await t.test('replay across runtime instances, forged signatures, wrong code and provider failure cannot reach password work',async()=>{
   const b=await B.page.evaluate(()=>window.sent.at(-1));const before=passwordCalls;handler=createRegisteredLogin(config);
   const send=async x=>(await fetch(origin+'/api/login',{method:'POST',body:JSON.stringify(x)})).status;
   assert.equal(await send(b),403);assert.equal(await send({...b,code:'90000001'}),403);const forged=structuredClone(b);forged.identity.response.response.signature='AA';assert.equal(await send(forged),403);assert.equal(passwordCalls,before);
   providerAvailable=false;await assert.rejects(()=>B.page.evaluate(()=>window.client.login('90000002','SyntheticOnly7')));assert.equal(passwordCalls,before);providerAvailable=true;assert.equal((await B.page.evaluate(()=>window.client.login('90000002','SyntheticOnly7'))).code,'90000002');metrics.checks.push('REPLAY_FORGERY_ACTOR_BINDING_PROVIDER_FAIL_CLOSED');
  });
  await t.test('eight replayed/forged proofs never enter slow provider and another principal stays available',async()=>{
   const old=await A.page.evaluate(()=>window.sent.at(-1)),before=providerCalls;slowProvider=true;
   const attack=Array.from({length:8},(_,n)=>{const b=structuredClone(old);if(n%2)b.identity.response.response.signature='AA';return fetch(origin+'/api/login',{method:'POST',body:JSON.stringify(b)});});
   const responses=await Promise.all(attack);assert.equal(responses.every(r=>r.status===403),true);assert.equal(providerCalls,before);
   assert.equal((await B.page.evaluate(()=>window.client.login('90000002','SyntheticOnly7'))).code,'90000002');slowProvider=false;
  });
  await t.test('one verified principal reserves provider across two handler instances without holding database clients',async()=>{
   slowProvider=true;const before=providerCalls,first=A.page.evaluate(()=>window.client.login('90000001','SyntheticOnly7'));
   for(let n=0;n<100&&providerCalls===before;n++)await new Promise(r=>setTimeout(r,10));assert.equal(providerCalls,before+1);
   handler=createRegisteredLogin(config);await assert.rejects(()=>A2.page.evaluate(()=>window.client.login('90000001','SyntheticOnly7')));assert.equal(providerCalls,before+1);
   assert.equal(Number((await db.query("SELECT count(*) n FROM pg_stat_activity WHERE datname=$1 AND state='idle in transaction'",[name])).rows[0].n),0);
   assert.equal((await B.page.evaluate(()=>window.client.login('90000002','SyntheticOnly7'))).code,'90000002');assert.equal((await first).code,'90000001');slowProvider=false;
  });
  await t.test('ambiguous provider release denies password work; expiry recovers and old nonce cannot erase successor',async()=>{
   const release=registry.releaseProvider.bind(registry),before=passwordCalls;registry.releaseProvider=async()=>{throw Error('LOCAL_RELEASE_AMBIGUOUS');};
   try{await assert.rejects(()=>B.page.evaluate(()=>window.client.login('90000002','SyntheticOnly7')));assert.equal(passwordCalls,before);}finally{registry.releaseProvider=release;}
   const old=(await db.query('SELECT * FROM mt_registered_identity.provider_pending WHERE principal=$1',[invitationB.principal])).rows[0];assert.ok(old);
   const cred=(await db.query("SELECT c.*,p.epoch FROM mt_registered_identity.credential c JOIN mt_registered_identity.principal p ON p.id=c.principal WHERE p.id=$1 AND NOT c.revoked",[invitationB.principal])).rows[0];
   await assert.rejects(()=>registry.releaseProvider(cred,'0'.repeat(32)),/IDENTITY_PROVIDER_RELEASE_REJECTED/);
   await db.query("UPDATE mt_registered_identity.provider_pending SET expires=clock_timestamp()-interval '1 millisecond' WHERE principal=$1",[cred.principal]);
   const nonce=randomBytes(16).toString('hex');await registry.consume(cred,nonce,Date.now()+60000,cred.counter,cred.counter);
   await assert.rejects(()=>registry.releaseProvider(cred,old.nonce),/IDENTITY_PROVIDER_RELEASE_REJECTED/);assert.equal((await db.query('SELECT nonce FROM mt_registered_identity.provider_pending WHERE principal=$1',[cred.principal])).rows[0].nonce,nonce);
   await registry.releaseProvider(cred,nonce);assert.equal((await B.page.evaluate(()=>window.client.login('90000002','SyntheticOnly7'))).code,'90000002');
  });
  await t.test('revocation and operator recovery invalidate old devices; password-only cannot bypass; unrelated principal survives',async()=>{
   await operator.revoke({principal:invitationA.principal,verificationRef:'LOCAL_OPERATOR_REVOKE_A'});const before=passwordCalls;await assert.rejects(()=>A.page.evaluate(()=>window.client.login('90000001','SyntheticOnly7')));assert.equal(passwordCalls,before);
   const recovery=await operator.enroll({principal:invitationA.principal,code:'90000001',recover:true,verificationRef:'LOCAL_OPERATOR_RECOVER_A'});await A.page.evaluate(token=>window.client.enroll('90000001',token),recovery.token);assert.equal((await A.page.evaluate(()=>window.client.login('90000001','SyntheticOnly7'))).code,'90000001');assert.equal((await B.page.evaluate(()=>window.client.login('90000002','SyntheticOnly7'))).code,'90000002');
   assert.equal((await fetch(origin+'/api/login',{method:'POST',body:JSON.stringify({action:'login',code:'90000001',pw:'SyntheticOnly7'})})).status,403);metrics.checks.push('OPERATOR_RECOVERY_NO_PASSWORD_ONLY_FALLBACK');
  });
  await t.test('expired claims, finite device cap, zero-counter replay ledger and unprivileged SQL denial',async()=>{
   const proof=await B.page.evaluate(()=>window.sent.at(-1));const before=passwordCalls;clock+=61000;
   assert.equal((await fetch(origin+'/api/login',{method:'POST',body:JSON.stringify(proof)})).status,403);clock=Date.now();assert.equal(passwordCalls,before);
   const cred=(await db.query("SELECT c.*,p.epoch FROM mt_registered_identity.credential c JOIN mt_registered_identity.principal p ON p.id=c.principal WHERE p.employee_code='90000002' AND NOT c.revoked")).rows[0];const nonce=randomBytes(16).toString('hex');const races=await Promise.allSettled([registry.consume(cred,nonce,Date.now()+60000,cred.counter,cred.counter),registry.consume(cred,nonce,Date.now()+60000,cred.counter,cred.counter)]);assert.equal(races.filter(x=>x.status==='fulfilled').length,1);await registry.releaseProvider(cred,nonce);
   const role='mt_unpriv_'+randomBytes(5).toString('hex'),c=await db.connect();try{await c.query('BEGIN');await c.query('CREATE ROLE '+role+' NOLOGIN');await c.query('SET LOCAL ROLE '+role);await assert.rejects(()=>c.query('SELECT * FROM mt_registered_identity.credential'),e=>e.code==='42501');}finally{await c.query('ROLLBACK');c.release();}assert.equal((await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount,0);
   metrics.checks.push('EXPIRY_CONCURRENT_LEDGER_NO_PUBLIC_SQL_ACCESS');
  });
  await t.test('lost committed response fails visibly; transport retry/replay cannot repeat password work',async()=>{
   const before=passwordCalls;dropResponse=true;await assert.rejects(()=>B.page.evaluate(()=>window.client.login('90000002','SyntheticOnly7')));assert.equal(passwordCalls,before+1);
   const proof=await B.page.evaluate(()=>window.sent.at(-1));assert.equal((await fetch(origin+'/api/login',{method:'POST',body:JSON.stringify(proof)})).status,403);assert.equal(passwordCalls,before+1);metrics.checks.push('LOST_RESPONSE_NO_RETRY_OR_FAKE_SUCCESS');
  });
  metrics.observedTransportSources=observedPeers.size;metrics.poolMax=8;metrics.observedConnections=maxActive;metrics.globalBcryptSlots=4;metrics.principalActiveSlots=1;metrics.passwordCalls=passwordCalls;metrics.cloudAcceptance='NOT TESTED';metrics.androidIntegration='NOT TESTED';metrics.operatorVerification='FIXTURE_ONLY_NOT_HUMAN_APPROVAL';metrics.provider='INJECTED_LOCAL_FAILURE_NOT_LIVE_TURNSTILE';fs.mkdirSync('audit-output/registered-login',{recursive:true});fs.writeFileSync('audit-output/registered-login/results.json',JSON.stringify(metrics,null,2));
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));if(runtime)await runtime.end();if(db)await db.end();if(created){assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=$1",[name])).rows[0].marker,'MAINTRACK_REGISTERED_LOCAL_EPHEMERAL_V1');await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',[name]);await admin.query('DROP DATABASE '+name);}if(rolesCreated){await admin.query('DROP ROLE '+runtimeRole);await admin.query('DROP ROLE '+ownerRole);}await admin.end();}
});
