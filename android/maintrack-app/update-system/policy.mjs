// Stage12 update-policy foundation. No network traffic unless caller provides an approved URL and trusted public key.
// Never call this module on the critical path to render the login screen.
export const DEFAULT_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const MAX_CHECK_DURATION_MS = 3000;
const textEncoder = new TextEncoder();

export function compareVersions(a,b) {
  const parse=v=>{
    if(typeof v!=='string'||!/^\d+\.\d+\.\d+$/.test(v))throw Error('INVALID_VERSION');
    return v.split('.').map(Number);
  };
  const x=parse(a),y=parse(b);
  for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]?1:-1}
  return 0;
}
export function canonicalJson(value) {
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}';
}
function base64Bytes(s){
  if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('INVALID_ENCODING');
  const b=atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'='));
  return Uint8Array.from(b,c=>c.charCodeAt(0));
}
export function validUpdatePayload(payload,now,channel='pilot'){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return false;
  if(payload.schema!==1||payload.channel!==channel||!['none','optional','required'].includes(payload.mode))return false;
  if(!Number.isSafeInteger(payload.issuedAt)||!Number.isSafeInteger(payload.expiresAt))return false;
  if(payload.issuedAt>now+5*60000||payload.expiresAt<=now||payload.expiresAt-payload.issuedAt>7*86400000)return false;
  try{for(const n of ['minNative','latestNative','minUi','latestUi'])compareVersions(payload[n],'0.0.0')}catch{return false}
  if(compareVersions(payload.minNative,payload.latestNative)>0||compareVersions(payload.minUi,payload.latestUi)>0)return false;
  // External update package activation is disallowed unless explicitly supported by a future release verifier.
  if(payload.bundleUrl!==undefined||payload.downloadUrl!==undefined)return false;
  return true;
}
export async function verifySignedPolicy(envelope,{publicKeyBase64,cryptoSubtle=globalThis.crypto?.subtle,now=Date.now(),channel='pilot'}={}){
  if(!publicKeyBase64||!cryptoSubtle||!envelope||typeof envelope!=='object'||!validUpdatePayload(envelope.payload,now,channel))return null;
  try {
    const key=await cryptoSubtle.importKey('raw',base64Bytes(publicKeyBase64),{name:'Ed25519'},false,['verify']);
    const valid=await cryptoSubtle.verify({name:'Ed25519'},key,base64Bytes(envelope.signature),textEncoder.encode(canonicalJson(envelope.payload)));
    return valid?envelope.payload:null;
  } catch{return null}
}
export function shouldCheck({now=Date.now(),lastCheck=0,intervalMs=DEFAULT_CHECK_INTERVAL_MS}={}){
  return !Number.isFinite(lastCheck)||lastCheck<=0||now-lastCheck>=intervalMs;
}
export function activationBlockers({dirtyForm=false,unsentReports=0,submitting=false,offline=false,unknownQueue=false}={}){
  const result=[];
  if(dirtyForm)result.push('UNSAVED_FORM');
  if(unsentReports>0)result.push('UNSENT_REPORTS');
  if(submitting)result.push('SUBMITTING');
  if(offline)result.push('OFFLINE');
  if(unknownQueue)result.push('UNKNOWN_QUEUE_STATE');
  return result;
}
export function decide({policy,currentNative,currentUi,blockers=[]}={}){
  if(!policy)return {action:'continue',reason:'NO_TRUSTED_POLICY'};
  const nativeBelowMin=compareVersions(currentNative,policy.minNative)<0;
  const uiBelowMin=compareVersions(currentUi,policy.minUi)<0;
  const nativeOutdated=compareVersions(currentNative,policy.latestNative)<0;
  const uiOutdated=compareVersions(currentUi,policy.latestUi)<0;
  const nativeRequired=nativeBelowMin||(policy.mode==='required'&&nativeOutdated);
  const uiRequired=uiBelowMin||(policy.mode==='required'&&uiOutdated);
  if(nativeRequired||uiRequired){
    if(blockers.length)return {action:'defer',reason:'PROTECT_LOCAL_WORK',blockers};
    return nativeRequired?{action:'native-required',reason:'VERIFIED_MINIMUM_VERSION'}:{action:'ui-required',reason:'VERIFIED_MINIMUM_VERSION'};
  }
  if(policy.mode==='optional'){
    if(nativeOutdated)return {action:'native-optional',reason:'OPTIONAL_NATIVE_RELEASE'};
    if(uiOutdated)return {action:'ui-optional',reason:'OPTIONAL_UI_RELEASE'};
  }
  return {action:'continue',reason:'SUPPORTED'};
}
// This is explicitly opt-in. An unsigned response can never require an update.
export async function fetchVerifiedPolicy({url,publicKeyBase64,fetchImpl=fetch,cryptoSubtle=globalThis.crypto?.subtle,now=Date.now(),timeoutMs=MAX_CHECK_DURATION_MS,channel='pilot'}={}){
  if(!url||!publicKeyBase64)return {status:'disabled',policy:null};
  if(!url.startsWith('https://')||timeoutMs>MAX_CHECK_DURATION_MS||timeoutMs<100) return {status:'rejected',policy:null};
  const abort=new AbortController();
  const timer=setTimeout(()=>abort.abort(),timeoutMs);
  try {
    const r=await fetchImpl(url,{signal:abort.signal,credentials:'omit',cache:'no-store',redirect:'error',headers:{'accept':'application/json'}});
    if(!r.ok)return {status:'network-failed',policy:null};
    const contentType=r.headers?.get('content-type')||'';
    if(!contentType.includes('application/json'))return {status:'rejected',policy:null};
    const len=Number(r.headers?.get('content-length')||0);
    if(len>16384)return {status:'rejected',policy:null};
    const raw=await r.text(); if(raw.length>16384)return {status:'rejected',policy:null};
    const policy=await verifySignedPolicy(JSON.parse(raw),{publicKeyBase64,cryptoSubtle,now,channel});
    return policy?{status:'verified',policy}:{status:'rejected',policy:null};
  }catch{return {status:'network-failed',policy:null}}
  finally{clearTimeout(timer)}
}
