// Temporary QA operator diagnostic. No database, login, session or enrollment path.
const REF='szhstrafzkxzstjdcynl',ORIGIN='https://maintrack-registered-isolated-qa.vercel.app';
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
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
   const body=JSON.parse(raw);if(body.action!=='login'||body.code!=='90000001'||Object.keys(body).some(k=>!['action','code','admission'].includes(k)))return reply(403,{error:'PROBE_SCOPE'});
   const start=now();if(await verify(body)!==true)throw Error('PROVIDER_VERIFICATION_REQUIRED');
   return reply(200,{providerAccepted:true,validatedHostname:ORIGIN.slice(8),validatedAction:'maintrack_login',cDataBindingVerified:true,challengeFreshnessVerified:true,serverElapsedMilliseconds:now()-start});
  }catch(e){return reply(e?.status===403?403:503,{error:e?.status===403?'PROVIDER_PROOF_REJECTED':'PROVIDER_PROOF_UNAVAILABLE'});}
 };
}
