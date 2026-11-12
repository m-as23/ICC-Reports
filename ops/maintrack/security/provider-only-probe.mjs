// Temporary QA operator diagnostic. No database, login, session or enrollment path.
// The injected verifier must return a trusted Cloudflare Siteverify verdict; a boolean
// is not evidence of hostname, action, cData binding or challenge freshness.
import {loginProofBinding} from '../../../supabase/functions/maintrack-final-047/login-proof.mjs';
const REF='szhstrafzkxzstjdcynl',ORIGIN='https://maintrack-registered-isolated-qa.vercel.app';
const HOSTNAME=new URL(ORIGIN).hostname,ACTION='maintrack_login';
const MAX_TOKEN_AGE_MS=300000,MAX_FUTURE_SKEW_MS=30000;
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
/** @param {{projectRef?:string,operatorKey?:string,bodySha256?:string,expires?:number,verify?:(body:Record<string,unknown>)=>Promise<unknown>,now?:()=>number}} [options] */
export function createProviderOnlyProbe({projectRef,operatorKey,bodySha256,expires,verify,now=Date.now}={}){
 if(projectRef!==REF||typeof operatorKey!=='string'||operatorKey.length<20||!/^[a-f0-9]{64}$/.test(bodySha256||'')||!Number.isFinite(expires)||typeof verify!=='function')throw Error('QA_PROVIDER_CONFIGURATION');
 let consumed=false;
 const reply=(status,data)=>Response.json({...data,sessionsIssued:0},{status,headers:{'cache-control':'no-store'}});
 return async req=>{
  try{
   if(req.method!=='POST'||req.headers.get('origin')!==ORIGIN||now()>expires)return reply(403,{error:'PROBE_CLOSED'});
   const time=req.headers.get('x-probe-time')||'',signature=req.headers.get('x-probe-signature')||'';
   if(!/^[0-9]{13}$/.test(time)||Math.abs(now()-Number(time))>30000||!/^[a-f0-9]{64}$/.test(signature))return reply(403,{error:'PROBE_AUTH_REQUIRED'});
   const reader=req.body?.getReader();if(!reader)return reply(403,{error:'PROBE_BODY_REQUIRED'});
   let bytes=0;const parts=[];try{for(;;){const x=await reader.read();if(x.done)break;bytes+=x.value.length;if(bytes>4096)return reply(403,{error:'PROBE_BODY_BUDGET'});parts.push(x.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   const all=new Uint8Array(bytes);let i=0;for(const part of parts){all.set(part,i);i+=part.length;}
   if(hex(await crypto.subtle.digest('SHA-256',all))!==bodySha256)return reply(403,{error:'PROBE_BODY_MISMATCH'});
   const raw=new TextDecoder('utf-8',{fatal:true}).decode(all),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(operatorKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
   const sig=Uint8Array.from(signature.match(/../g),x=>parseInt(x,16));
   if(!await crypto.subtle.verify('HMAC',key,sig,new TextEncoder().encode('maintrack-provider-probe-v1\n'+time+'\n'+raw)))return reply(403,{error:'PROBE_AUTH_REQUIRED'});
   if(consumed)return reply(409,{error:'PROBE_ALREADY_CONSUMED'});consumed=true;
   const body=JSON.parse(raw);
   if(body===null||typeof body!=='object'||Array.isArray(body)||body.action!=='login'||body.code!=='90000001'||Object.keys(body).some(k=>!['action','code','admission'].includes(k)))return reply(403,{error:'PROBE_SCOPE'});
   const admission=body.admission;
   if(admission===null||typeof admission!=='object'||Array.isArray(admission)||typeof admission.token!=='string'||admission.token.length<1||admission.token.length>2048||typeof admission.requestId!=='string'||!/^[a-f0-9]{32}$/.test(admission.requestId)||Object.keys(admission).some(k=>!['token','requestId'].includes(k)))return reply(403,{error:'PROBE_SCOPE'});
   const expectedCData=await loginProofBinding(body.code,admission.requestId);
   const start=now();
   const verifierResponse=await verify(body);
   /** @type {Record<string,unknown>} */
   const verdict=verifierResponse!==null&&typeof verifierResponse==='object'&&!Array.isArray(verifierResponse)?/** @type {Record<string,unknown>} */(verifierResponse):{};
   const solvedAt=typeof verdict.challenge_ts==='string'?Date.parse(verdict.challenge_ts):NaN;
   const age=now()-solvedAt;
   if(verdict.success!==true||verdict.hostname!==HOSTNAME||verdict.action!==ACTION||verdict.cdata!==expectedCData||!Number.isFinite(solvedAt)||age>MAX_TOKEN_AGE_MS||age< -MAX_FUTURE_SKEW_MS)throw Error('PROVIDER_VERDICT_MISMATCH');
   return reply(200,{providerAccepted:true,validatedHostname:HOSTNAME,validatedAction:ACTION,cDataBindingVerified:true,challengeFreshnessVerified:true,serverElapsedMilliseconds:now()-start});
  }catch(e){return reply(e?.status===403?403:503,{error:e?.status===403?'PROVIDER_PROOF_REJECTED':'PROVIDER_PROOF_UNAVAILABLE'});}
 };
}
