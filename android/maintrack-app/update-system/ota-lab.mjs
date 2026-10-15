// Stage13 LAB ONLY. Never auto-call; plugin autoUpdate stays off.
// Signed JSON manifest contains exact ZIP SHA256 + URL. Server cannot trigger an update with unsigned data.
import { canonicalJson, activationBlockers, compareVersions } from './policy.mjs';
function decode(s){
 if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('INVALID_BASE64');
 return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),x=>x.charCodeAt(0));
}
export function validateLabRelease(m,{now=Date.now(),allowedOrigins=[],currentNative='0.2.0'}={}){
 if(!m||typeof m!=='object'||Array.isArray(m))return false;
 if(m.schema!==1||m.channel!=='lab'||m.kind!=='web-ota'||m.appId!=='com.icc.maintrack')return false;
 if(!Number.isSafeInteger(m.issuedAt)||!Number.isSafeInteger(m.expiresAt)||m.issuedAt>now+300000||m.expiresAt<=now||m.expiresAt-m.issuedAt>7*86400000)return false;
 if(!/^[0-9a-f]{64}$/.test(m.sha256)||!Number.isSafeInteger(m.bytes)||m.bytes<100||m.bytes>15000000)return false;
 if(typeof m.bundleUrl!=='string'||typeof m.bundleVersion!=='string')return false;
 try {
  if(compareVersions(m.bundleVersion,'0.0.0')<=0||compareVersions(currentNative,m.nativeMinimum)<0||compareVersions(currentNative,m.nativeMaximum)>0)return false;
  const u=new URL(m.bundleUrl);
  if(u.protocol!=='https:'||u.username||u.password||u.hash||!allowedOrigins.includes(u.origin)||!u.pathname.endsWith('.zip'))return false;
 } catch{return false}
 return true;
}
export async function verifyLabRelease(envelope,opts={}){
 const {publicKeyBase64,cryptoSubtle=globalThis.crypto?.subtle}=opts;
 if(!publicKeyBase64||!cryptoSubtle||!envelope?.payload||!validateLabRelease(envelope.payload,opts))return null;
 try{
  const key=await cryptoSubtle.importKey('raw',decode(publicKeyBase64),{name:'Ed25519'},false,['verify']);
  const ok=await cryptoSubtle.verify({name:'Ed25519'},key,decode(envelope.signature),new TextEncoder().encode(canonicalJson(envelope.payload)));
  return ok?envelope.payload:null;
 }catch{return null}
}
export function canActivate({dirtyForm=false,unsentReports=0,submitting=false,offline=false,unknownQueue=false}={}){
 return activationBlockers({dirtyForm,unsentReports,submitting,offline,unknownQueue}).length===0;
}
export async function stageVerifiedBundle({verifiedRelease,updater,getLocalState}){
 if(!verifiedRelease||!updater||typeof getLocalState!=='function')return {status:'disabled'};
 if(!canActivate(getLocalState()))return {status:'deferred',reason:'LOCAL_WORK'};
 try{
  // Capgo native plugin enforces checksum; signature binds the URL and checksum.
  const bundle=await updater.download({url:verifiedRelease.bundleUrl,version:verifiedRelease.bundleVersion,checksum:verifiedRelease.sha256});
  if(!bundle?.id)throw Error('MISSING_BUNDLE_ID');
  if(!canActivate(getLocalState()))return {status:'deferred',reason:'LOCAL_WORK_AFTER_DOWNLOAD'};
  // Schedule only. No immediate reload; let user finish work.
  await updater.next({id:bundle.id});
  return {status:'scheduled',id:bundle.id};
 } catch{return {status:'failed'} }
}
export async function simulatedRollback({updater,bootstrapCompleted}){
 if(bootstrapCompleted)return 'kept';
 // Offline lab fault injection, never called on a live boot path.
 await updater.reset();
 return 'reverted';
}
