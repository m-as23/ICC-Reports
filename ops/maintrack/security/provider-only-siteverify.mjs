// QA-only provider adapter. Does not issue sessions, change user records, or log tokens.
const URL='https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_RESPONSE_BYTES=8192;

/**
 * Provide the structured, server-verified result to createProviderOnlyProbe.
 * Never expose this handler to clients: Siteverify's secret stays server-side.
 * @param {{secret?:string,fetchImpl?:typeof fetch,timeoutMs?:number}} [options]
 */
export function createQaSiteverifyVerifier({secret,fetchImpl=fetch,timeoutMs=2500}={}){
 if(typeof secret!=='string'||secret.length<20||secret.length>4096||typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('QA_SITEVERIFY_CONFIGURATION');
 return async body=>{
  const token=body?.admission?.token;
  if(typeof token!=='string'||!token||token.length>2048||/\s/.test(token))throw Error('QA_SITEVERIFY_PROOF_REQUIRED');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetchImpl(URL,{method:'POST',redirect:'error',cache:'no-store',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret,response:token}),signal:controller.signal});
   if(response.status!==200||!response.body)throw Error('QA_SITEVERIFY_RESPONSE');
   const reader=response.body.getReader();
   const chunks=[];let length=0;
   try{
    for(;;){
     const {done,value}=await reader.read();
     if(done)break;
     length+=value.byteLength;
     if(length>MAX_RESPONSE_BYTES)throw Error('QA_SITEVERIFY_RESPONSE_BUDGET');
     chunks.push(value);
    }
   }finally{try{await reader.cancel();}catch{}reader.releaseLock();}
   const bytes=new Uint8Array(length);let pos=0;
   for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.byteLength;}
   const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(!data||typeof data!=='object'||Array.isArray(data))throw Error('QA_SITEVERIFY_RESPONSE');
   // Return only fields the outer QA probe independently checks; never echo token/secret.
   return {success:data.success===true,hostname:data.hostname,action:data.action,cdata:data.cdata,challenge_ts:data.challenge_ts};
  }catch{throw Error('QA_SITEVERIFY_UNAVAILABLE');}
  finally{clearTimeout(timer);controller.abort();}
 };
}
