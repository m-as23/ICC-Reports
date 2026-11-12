// Offline-reviewed acceptance candidate. No automatic activation or legacy bypass.
import {loginProofBinding} from './login-proof.mjs';
export class LoginAdmissionError extends Error{constructor(code,status=403){super(code);this.code=code;this.status=status;}}
async function boundedJson(response,signal){
 if(response.status!==200||!response.body)throw Error('PROVIDER_RESPONSE');
 const reader=response.body.getReader();let bytes=0,parts=[];
 const cancel=()=>{reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192)throw Error('PROVIDER_RESPONSE_BUDGET');parts.push(value);}}
 finally{signal.removeEventListener('abort',cancel);try{await reader.cancel();}catch{}}
 const all=new Uint8Array(bytes);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.length;}
 return JSON.parse(new TextDecoder().decode(all));
}
/** @param {{secret?:string,allowedHostnames?:string[],login?:(body:Record<string,unknown>,source?:string)=>Promise<unknown>,fetchImpl?:typeof fetch,timeoutMs?:number,now?:()=>number}} [options] */
export function createAdmissionLogin({secret,allowedHostnames,login,fetchImpl=fetch,timeoutMs=2500,now=Date.now}={}){
 if(typeof secret!=='string'||secret.length<20||secret.length>4096||!Array.isArray(allowedHostnames)||!allowedHostnames.length||allowedHostnames.some(x=>typeof x!=='string'||! /^[a-z0-9.-]+$/.test(x)||x.startsWith('.')||x.endsWith('.'))||typeof login!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('ADMISSION_CONFIGURATION_REQUIRED');
 const hosts=new Set(allowedHostnames);
 return async (body,verifiedSource)=>{
  const proof=body?.admission;
  if(!proof||typeof proof.token!=='string'||proof.token.length<1||proof.token.length>2048||/\s/.test(proof.token)||typeof proof.requestId!=='string'||!/^[a-f0-9]{32}$/.test(proof.requestId)||typeof body.code!=='string'||!/^\d{1,32}$/.test(body.code))throw new LoginAdmissionError('LOGIN_PROOF_REQUIRED');
  const expected=await loginProofBinding(body.code,proof.requestId);
  const controller=new AbortController();let timer,data;
  const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('PROVIDER_DEADLINE'));},timeoutMs);});
  try{
   data=await Promise.race([(async()=>{const response=await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',redirect:'error',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret,response:proof.token}),signal:controller.signal});
   return await boundedJson(response,controller.signal);})(),expired]);
  }catch{throw new LoginAdmissionError('LOGIN_PROOF_UNAVAILABLE',503);}finally{clearTimeout(timer);controller.abort();}
  if(data?.success!==true)throw new LoginAdmissionError('LOGIN_PROOF_REJECTED');
  const issued=Date.parse(data.challenge_ts);
  if(!hosts.has(data.hostname)||data.action!=='maintrack_login'||data.cdata!==expected||!Number.isFinite(issued)||issued>now()+10000||now()-issued>300000)throw new LoginAdmissionError('LOGIN_PROOF_BINDING');
  // Siteverify is authoritative for single use across Edge instances; no local replay cache.
  // Only admitted requests reach the unchanged account lockout/password/work-slot logic.
  return login(body,verifiedSource);
 };
}
