import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegisteredLogin, RegisteredIdentityAdmin, PgIdentityStore} from '../security/registered-login.mjs';
test('registered identity requires explicit RP policy and trusted ingress, never defaults to password-only',()=>{
 assert.throws(()=>createRegisteredLogin({}),/IDENTITY_CONFIGURATION/);
 assert.equal(typeof RegisteredIdentityAdmin,'function');assert.equal(typeof PgIdentityStore,'function');
});

test('ingress/provider false is not successful verification and password callback cannot be a fallback',async()=>{
 const base={store:{credential:async()=>{throw Error('IDENTITY_REJECTED');}},rpID:'localhost',origin:'http://localhost:12345',challengeSecret:'local-fixture-key-that-is-not-deployed-32',passwordLogin:async()=>{throw Error('PASSWORD_MUST_NOT_RUN');},verifyIngress:async()=>false,verifyProvider:async()=>false};
 const handler=createRegisteredLogin(base);await assert.rejects(()=>handler(new Request('http://localhost:12345'),{action:'login',identity:{phase:'login-options'},code:'90000001',pw:'SyntheticOnly7'}),/IDENTITY_REJECTED/);
 const closed=createRegisteredLogin({...base,verifyIngress:async()=> 'a'.repeat(64)}),body={action:'login',code:'90000001',pw:'SyntheticOnly7',identity:{phase:'login-options'}};const {ticket}=await closed(new Request('http://localhost:12345'),body);await assert.rejects(()=>closed(new Request('http://localhost:12345'),{...body,identity:{phase:'login-finish',ticket,response:{id:'fake'}}}),/IDENTITY_REJECTED/);
});

test('operator cannot bootstrap unknown employees or accept caller-assigned principal identity',async()=>{
 assert.throws(()=>new RegisteredIdentityAdmin({pool:{}}),/TRUSTED_OPERATOR/);
 const operator=new RegisteredIdentityAdmin({pool:{connect(){throw Error('MUST_NOT_TOUCH_DB');}},resolveEmployee:async()=>null});
 await assert.rejects(()=>operator.enroll({code:'90000001',verificationRef:'LOCAL_FIXTURE_CASE'}),/IDENTITY_REJECTED/);
 const known=new RegisteredIdentityAdmin({pool:{connect(){throw Error('MUST_NOT_TOUCH_DB');}},resolveEmployee:async code=>({id:'11111111-2222-4333-8444-555555555555',employee_code:code,active:true})});
 await assert.rejects(()=>known.enroll({principal:'11111111-2222-4333-8444-666666666666',code:'90000001',verificationRef:'LOCAL_FIXTURE_CASE'}),/IDENTITY_REJECTED/);
});

test('hung verification provider has a finite deadline and no password fallback',async()=>{
 let calls=0;const handler=createRegisteredLogin({store:{invitation:async()=>({id:'11111111-2222-4333-8444-555555555555',employee_code:'90000001',epoch:1}),reserveEnrollmentProvider:async()=>({principal:'11111111-2222-4333-8444-555555555555',epoch:1}),releaseProvider:async()=>{}} ,rpID:'localhost',origin:'http://localhost:12345',challengeSecret:'local-fixture-key-that-is-not-deployed-32',verifyIngress:async()=> 'a'.repeat(64),verifyProvider:()=>new Promise(()=>{}),verificationTimeoutMs:5,passwordLogin:async()=>{calls++;}});
 const body={action:'login',code:'90000001',pw:'SyntheticOnly7',identity:{phase:'login-options'}};const {ticket}=await handler(new Request('http://localhost:12345'),body);
 await assert.rejects(()=>handler(new Request('http://localhost:12345'),{...body,identity:{phase:'enroll-options',invitation:'synthetic'}}),/IDENTITY_PROVIDER_TIMEOUT/);assert.equal(calls,0);
});


test('one valid enrollment capability cannot occupy provider/preflight capacity across handler instances',async()=>{
 const pending=new Map();let providerCalls=0,release,started;const entered=new Promise(r=>started=r);
 const principal='11111111-2222-4333-8444-555555555555';
 const store={invitation:async token=>{assert.equal(token,'trusted-invitation');return {id:principal,employee_code:'90000001',epoch:1};},reserveEnrollmentProvider:async(token,nonce)=>{assert.equal(token,'trusted-invitation');if(pending.has(principal))throw Error('IDENTITY_PROVIDER_BUSY');pending.set(principal,nonce);return {principal,epoch:1};},releaseProvider:async(identity,nonce)=>{assert.equal(identity.principal,principal);assert.equal(pending.get(principal),nonce);pending.delete(principal);}};
 const config={store,rpID:'localhost',origin:'http://localhost:12345',challengeSecret:'local-fixture-key-that-is-not-deployed-32',verifyIngress:async()=> 'a'.repeat(64),verifyProvider:async()=>{providerCalls++;started();await new Promise(r=>release=r);return true;},passwordLogin:async()=>{throw Error('PASSWORD_MUST_NOT_RUN');}};
 const handlers=[createRegisteredLogin(config),createRegisteredLogin(config)],req=new Request('http://localhost:12345'),body={action:'login',code:'90000001',identity:{phase:'enroll-options',invitation:'trusted-invitation'}};
 const first=handlers[0](req,body);await entered;
 try{
  const attacks=await Promise.allSettled(Array.from({length:8},(_,i)=>handlers[i%2](req,body)));assert.equal(attacks.every(x=>x.status==='rejected'),true);assert.equal(providerCalls,1);
  const other=await handlers[0](req,{action:'login',code:'90000002',pw:'SyntheticOnly7',identity:{phase:'login-options'}});assert.ok(other.ticket);
 }finally{release();await first;}
 assert.equal(pending.size,0);
});

test('enrollment finish rejects a forged ticket before provider reservation or provider I/O',async()=>{
 let reserved=0,provider=0;const handler=createRegisteredLogin({store:{invitation:async()=>({id:'11111111-2222-4333-8444-555555555555',employee_code:'90000001',epoch:1}),reserveEnrollmentProvider:async()=>{reserved++;throw Error('MUST_NOT_RESERVE');}},rpID:'localhost',origin:'http://localhost:12345',challengeSecret:'local-fixture-key-that-is-not-deployed-32',verifyIngress:async()=> 'a'.repeat(64),verifyProvider:async()=>{provider++;return true;},passwordLogin:async()=>{throw Error('PASSWORD_MUST_NOT_RUN');}});
 await assert.rejects(()=>handler(new Request('http://localhost:12345'),{action:'login',code:'90000001',identity:{phase:'enroll-finish',invitation:'trusted-invitation',ticket:'forged',response:{}}}),/IDENTITY_REJECTED/);assert.equal(reserved,0);assert.equal(provider,0);
});
