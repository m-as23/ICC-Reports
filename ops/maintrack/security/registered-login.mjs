// Local integration candidate. NOT activated in any application or cloud channel.
// Library verifies WebAuthn; operators establish the human identity out of band.
import {Buffer} from 'node:buffer';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {generateRegistrationOptions,generateAuthenticationOptions,verifyRegistrationResponse,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {withLoginBudget} from '../../../supabase/functions/maintrack-final-047/login-rate-limit.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const reject=()=>{throw Error('IDENTITY_REJECTED');};
const pending=new WeakMap();
export const registeredPrincipalSource=principal=>hash('registered-principal-v1:'+principal);
const binding=b=>hash(JSON.stringify([b.code,b.pw]));
async function tx(pool,fn){
 const c=await pool.connect();let broken;const onError=e=>{broken ||= e;};c.on?.('error',onError);
 try{await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='2000ms';SET LOCAL lock_timeout='500ms';SET LOCAL idle_in_transaction_session_timeout='3s'");const value=await fn(c);if(broken)throw broken;await c.query('COMMIT');return value;}
 catch(e){if(!broken){try{await c.query('ROLLBACK');}catch(err){broken ||= err;}}throw e;}
 finally{try{c.release(broken);}finally{c.off?.('error',onError);}}
}
// Never expose this class through the HTTP handler. Separate operator credentials
// and identity-verification process must be approved before installation.
export class RegisteredIdentityAdmin{
 constructor({pool,resolveEmployee}={}){if(!pool||typeof resolveEmployee!=='function')throw Error('TRUSTED_OPERATOR_EMPLOYEE_RESOLVER_REQUIRED');this.pool=pool;this.resolveEmployee=resolveEmployee;}
 async enroll({principal,code,verificationRef,recover=false}){
  if(!/^[0-9]{1,32}$/.test(code)||! /^[A-Za-z0-9:_-]{8,128}$/.test(verificationRef))reject();
  const employee=await this.resolveEmployee(code);if(!employee||employee.employee_code!==code||employee.active!==true||! /^[a-f0-9-]{36}$/.test(employee.id||'')||(principal!==undefined&&principal!==employee.id))reject();principal=employee.id;
  const token=randomBytes(32).toString('base64url');
  await tx(this.pool,async c=>{
   await c.query('INSERT INTO mt_registered_identity.principal(id,employee_code) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[principal,code]);
   const p=(await c.query('SELECT * FROM mt_registered_identity.principal WHERE id=$1 FOR UPDATE',[principal])).rows[0];if(!p||p.employee_code!==code)reject();
   if(recover){await c.query('UPDATE mt_registered_identity.principal SET epoch=epoch+1,enabled=true WHERE id=$1',[principal]);await c.query('UPDATE mt_registered_identity.credential SET revoked=true WHERE principal=$1',[principal]);}
   await c.query("INSERT INTO mt_registered_identity.invitation SELECT id,$2,epoch,now()+interval '10 minutes',$3 FROM mt_registered_identity.principal WHERE id=$1 AND enabled ON CONFLICT(principal) DO UPDATE SET token_hash=excluded.token_hash,epoch=excluded.epoch,expires=excluded.expires,verification_ref=excluded.verification_ref",[principal,hash(token),verificationRef]);
   await c.query('INSERT INTO mt_registered_identity.operator_audit(principal,operation,verification_ref) VALUES($1,$2,$3)',[principal,recover?'RECOVER_AND_REVOKE_ALL':'ENROLL_INVITATION',verificationRef]);
  });return {principal,token}; // one-time capability; caller must use secure delivery, never logs/Git.
 }
 async revoke({principal,credentialId=null,verificationRef}){
  if(! /^[A-Za-z0-9:_-]{8,128}$/.test(verificationRef))reject();
  await tx(this.pool,async c=>{if(!(await c.query('SELECT id FROM mt_registered_identity.principal WHERE id=$1 FOR UPDATE',[principal])).rowCount)reject();
   await c.query('UPDATE mt_registered_identity.credential SET revoked=true WHERE principal=$1 AND ($2::text IS NULL OR id=$2)',[principal,credentialId]);
   if(credentialId===null){await c.query('UPDATE mt_registered_identity.principal SET epoch=epoch+1,enabled=false WHERE id=$1',[principal]);await c.query('DELETE FROM mt_registered_identity.invitation WHERE principal=$1',[principal]);}
   await c.query('INSERT INTO mt_registered_identity.operator_audit(principal,operation,verification_ref) VALUES($1,$2,$3)',[principal,credentialId===null?'DISABLE_PRINCIPAL':'REVOKE_CREDENTIAL',verificationRef]);});
 }
}
export class PgIdentityStore{
 constructor(pool){this.pool=pool;}
 async invitation(token){if(typeof token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(token))reject();const r=await tx(this.pool,async c=>(await c.query('SELECT * FROM mt_registered_identity.invitation_lookup($1)',[hash(token)])).rows[0]);if(!r)reject();return r;}
 async register(token,epoch,credential){return tx(this.pool,async c=>(await c.query('SELECT mt_registered_identity.register_credential($1,$2,$3,$4,$5) principal',[hash(token),epoch,credential.id,Buffer.from(credential.publicKey),credential.counter])).rows[0].principal);}
 async credential(id,code){if(typeof id!=='string'||id.length>1400)reject();const r=await tx(this.pool,async c=>(await c.query('SELECT * FROM mt_registered_identity.credential_lookup($1,$2)',[id,code])).rows[0]);if(!r)reject();return r;}
 async consume(identity,nonce,expires,oldCounter,newCounter){return tx(this.pool,async c=>{if((await c.query('SELECT mt_registered_identity.consume_proof($1,$2,$3,$4,$5,$6) ok',[identity.id,identity.epoch,nonce,expires,oldCounter,newCounter])).rows[0].ok!==true)reject();});}
 async assertCurrent(c,identity){if((await c.query('SELECT mt_registered_identity.assert_current($1,$2,$3) ok',[identity.id,identity.principal,identity.epoch])).rows[0].ok!==true)reject();}
}
export function createRegisteredPasswordExecutor({pool,store,passwordWork}){
 if(!pool||!store||typeof passwordWork!=='function')throw Error('IDENTITY_EXECUTOR_CONFIGURATION');
 return (body,identity)=>withLoginBudget(pool,registeredPrincipalSource(identity.principal),body.code,async c=>{await store.assertCurrent(c,identity);return passwordWork(c,body);},{kind:'verified-gateway-v1'});
}
export function createRegisteredLogin({store,rpID,origin,challengeSecret,verifyIngress,verifyProvider,passwordLogin,now=Date.now,verificationTimeoutMs=3000,androidOrigins=[]}={}){
 if(!Array.isArray(androidOrigins)||androidOrigins.length>2||androidOrigins.some(x=>! /^android:apk-key-hash:[A-Za-z0-9_-]{43}$/.test(x))||!Number.isInteger(verificationTimeoutMs)||verificationTimeoutMs<1||verificationTimeoutMs>3000||!store||! /^[a-z0-9.-]+$/.test(rpID||'')||!(origin===`https://${rpID}`||(rpID==='localhost'&&/^http:\/\/localhost:\d+$/.test(origin||'')))||typeof challengeSecret!=='string'||challengeSecret.length<32||[verifyIngress,verifyProvider,passwordLogin].some(x=>typeof x!=='function'))throw Error('IDENTITY_CONFIGURATION');
 const mac=s=>createHmac('sha256',challengeSecret).update('registered-login-v1:'+s).digest();
 async function provider(body){let timer;const abort=new AbortController();try{return await Promise.race([Promise.resolve().then(()=>verifyProvider(body,abort.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('IDENTITY_PROVIDER_TIMEOUT'));},verificationTimeoutMs);})]);}finally{clearTimeout(timer);abort.abort();}}
 function issue(kind,bind){const data=Buffer.from(JSON.stringify({kind,bind,nonce:randomBytes(16).toString('hex'),expires:now()+60000})).toString('base64url');return data+'.'+mac(data).toString('base64url');}
 function read(token,kind,bind){if(typeof token!=='string'||token.length>1600)reject();const [p,m,...extra]=token.split('.');if(extra.length||! /^[A-Za-z0-9_-]+$/.test(p||'')||! /^[A-Za-z0-9_-]{43}$/.test(m||'')||!timingSafeEqual(mac(p),Buffer.from(m,'base64url')))reject();const c=JSON.parse(Buffer.from(p,'base64url').toString());if(c.kind!==kind||c.bind!==bind||!Number.isSafeInteger(c.expires)||c.expires<=now()||c.expires>now()+60000||! /^[a-f0-9]{32}$/.test(c.nonce))reject();return c;}
 const execute=async function registered(req,body){
  // A trusted server verifier must inspect the actual Request, not body flags.
  const source=await verifyIngress(req,body);if(typeof source!=='string'||! /^[a-f0-9]{64}$/.test(source))reject();
  if(body?.action!=='login'||!body.identity||JSON.stringify(body).length>65536)reject();
  const i=body.identity;
  if(i.phase==='enroll-options'){
   if(await provider(body)!==true)reject();
   const p=await store.invitation(i.invitation);if(body.code!==p.employee_code)reject();const ticket=issue('enroll',hash(i.invitation)+':'+p.epoch);
   const options=await generateRegistrationOptions({rpName:'MainTrack',rpID,userName:p.employee_code,userID:Buffer.from(p.id),challenge:ticket,attestationType:'none',supportedAlgorithmIDs:[-7],authenticatorSelection:{residentKey:'required',userVerification:'required'}});
   return {options,ticket};
  }
  if(i.phase==='enroll-finish'){
   if(await provider(body)!==true)reject();
   const p=await store.invitation(i.invitation);if(body.code!==p.employee_code)reject();read(i.ticket,'enroll',hash(i.invitation)+':'+p.epoch);
   const result=await verifyRegistrationResponse({response:i.response,expectedChallenge:Buffer.from(i.ticket).toString('base64url'),expectedOrigin:[origin,...androidOrigins],expectedRPID:rpID,requireUserVerification:true,supportedAlgorithmIDs:[-7]});if(!result.verified)reject();
   await store.register(i.invitation,p.epoch,result.registrationInfo.credential);return {registered:true};
  }
  if(typeof body.code!=='string'||! /^[0-9]{1,32}$/.test(body.code)||typeof body.pw!=='string'||body.pw.length>1024)reject();
  if(i.phase==='login-options'){
   // Stateless issuance: unknown employee codes do not allocate database rows.
   const ticket=issue('login',binding(body));const options=await generateAuthenticationOptions({rpID,challenge:ticket,userVerification:'required'});return {options,ticket};
  }
  if(i.phase!=='login-finish')reject();
  const claim=read(i.ticket,'login',binding(body));
  if(await provider(body)!==true)reject();
  const cred=await store.credential(i.response?.id,body.code);
  const result=await verifyAuthenticationResponse({response:i.response,expectedChallenge:Buffer.from(i.ticket).toString('base64url'),expectedOrigin:[origin,...androidOrigins],expectedRPID:rpID,requireUserVerification:true,credential:{id:cred.id,publicKey:new Uint8Array(cred.public_key),counter:Number(cred.counter)}});if(!result.verified)reject();
  // Turnstile is retained; provider errors consume no password work and have no fallback.
  await store.consume(cred,claim.nonce,claim.expires,cred.counter,result.authenticationInfo.newCounter);
  return passwordLogin(body,cred);
 };
 return async(req,body)=>{const key=store.pool||store,n=pending.get(key)||0;if(n>=8)throw Error('IDENTITY_PENDING_LIMIT');pending.set(key,n+1);try{return await execute(req,body);}finally{pending.set(key,(pending.get(key)||1)-1);}};
}
