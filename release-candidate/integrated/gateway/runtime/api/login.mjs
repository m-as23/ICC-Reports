// Node/Vercel API adapter template. Offline source; no deployment or secret provisioning.
import {createVercelLoginGateway} from '../../server/login-gateway.mjs';
export function createNodeVercelLoginHandler(env=process.env,fetchImpl=fetch){
 if(env.MT_LOGIN_ADMISSION_PROJECT_REF!=='szhstrafzkxzstjdcynl')throw Error('QA_PROJECT_CONFIGURATION_REQUIRED');
 const capability=env.MT_QA_WINDOW_CAPABILITY;
 if(!/^[a-f0-9]{64}$/.test(capability||''))throw Error('QA_WINDOW_CAPABILITY_REQUIRED');
 const qaFetch=(url,options)=>{
  if(url!=='https://szhstrafzkxzstjdcynl.supabase.co/functions/v1/maintrack-security-qa-final/api')throw Error('QA_UPSTREAM_TARGET_REQUIRED');
  const headers=new Headers(options.headers);headers.set('x-maintrack-qa-run-id','SECURITY_FINAL_20261025');headers.set('x-maintrack-qa-capability',capability);
  return fetchImpl(url,{...options,headers:Object.fromEntries(headers)});
 };
 const hostname=env.MT_LOGIN_GATEWAY_HOST;
 const gateway=createVercelLoginGateway({secret:env.MT_LOGIN_GATEWAY_SECRET,gatewayHostname:hostname,vercel:env.VERCEL,ingressContractApproved:env.MT_LOGIN_INGRESS_ATTESTATION==='VERCEL_HEADERS_REVIEWED_V1',allowedOrigins:(env.MT_LOGIN_NATIVE_ORIGINS||'').split(',').filter(Boolean),fetchImpl:qaFetch});
 return async(req,res)=>{
  try{
   const method=req.method||'GET';let body;
   if(!['GET','HEAD','OPTIONS'].includes(method)){if(req.body===undefined)throw Error('JSON_BODY_REQUIRED');body=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString('utf8'):JSON.stringify(req.body);if(Buffer.byteLength(body)>65536)throw Error('BODY_BUDGET');}
   const headers=new Headers();for(const [k,v] of Object.entries(req.headers||{}))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):String(v));
   const response=await gateway(new Request(new URL(req.url||'/', 'https://'+hostname),{method,headers,...(body!==undefined?{body}:{})}));
   res.statusCode=response.status;for(const [k,v] of response.headers)res.setHeader(k,v);res.end(await response.text());
  }catch{res.statusCode=503;res.setHeader('content-type','application/json');res.end('{"error":"LOGIN_GATEWAY_UNAVAILABLE"}');}
 };
}
export default async function handler(req,res){
 try{return await createNodeVercelLoginHandler()(req,res);}catch{res.statusCode=503;res.setHeader('content-type','application/json');res.end('{"error":"QA_GATEWAY_NOT_CONFIGURED"}');}
}
