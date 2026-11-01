import {Buffer} from 'node:buffer';
import {LoginAdmissionError} from './login-admission.mjs';
// Server-to-server gateway proof. Never bundle this module/key into Web or APK.
import {createHmac,createHash,timingSafeEqual,randomBytes} from 'node:crypto';import {isIP} from 'node:net';
/** @typedef {{projectRef:string,functionSlug:string}} GatewayTargetProfile */
const QA_TARGET=Object.freeze({projectRef:'szhstrafzkxzstjdcynl',functionSlug:'maintrack-security-qa-final'});
// Server configuration only. Capture immutable derived values before receiving requests.
/** @param {GatewayTargetProfile|undefined} profile */
function gatewayTarget(profile){
 const selected=profile===undefined?QA_TARGET:profile;
 if(!selected||typeof selected!=='object'||Array.isArray(selected)||Object.keys(selected).length!==2||!Object.hasOwn(selected,'projectRef')||!Object.hasOwn(selected,'functionSlug')||!((selected.projectRef===QA_TARGET.projectRef&&selected.functionSlug===QA_TARGET.functionSlug)||(selected.projectRef==='tdnkeskczcsukcujwinu'&&selected.functionSlug==='maintrack-final-047')))throw Error('GATEWAY_TARGET_REQUIRED');
 const {projectRef,functionSlug}=selected,path='/functions/v1/'+functionSlug+'/api';
 return Object.freeze({aud:projectRef+':'+functionSlug,path,url:'https://'+projectRef+'.supabase.co'+path});
}
function key(secret){if(typeof secret!=='string'||secret.length<32)throw Error('GATEWAY_KEY_REQUIRED');return secret;}
function canonical(x){if(Array.isArray(x))return x.map(canonical);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));return x;}
const json=x=>JSON.stringify(canonical(x));const digest=x=>createHash('sha256').update(json(x)).digest('hex');
function address(ip){
 if(typeof ip!=='string'||!isIP(ip))throw Error('GATEWAY_SOURCE_UNVERIFIED');
 if(ip.startsWith('::ffff:')&&isIP(ip.slice(7))===4)return ip.slice(7);
 if(isIP(ip)===4)return ip;
 const normalized=new URL('http://['+ip+']/').hostname.slice(1,-1),[left,right]=normalized.split('::'),a=left?left.split(':'):[],b=right?right.split(':'):[],words=right!==undefined?[...a,...Array(8-a.length-b.length).fill('0'),...b]:a;const n=words.map(x=>parseInt(x,16));
 if(n.slice(0,5).every(x=>x===0)&&n[5]===65535)return [n[6]>>>8,n[6]&255,n[7]>>>8,n[7]&255].join('.');
 return n.slice(0,4).map(x=>x.toString(16)).join(':')+'::/64';
}
/** @param {{secret?:string,now?:()=>number,targetProfile?:GatewayTargetProfile}} [options] */
export function createGatewaySigner({secret,now=Date.now,targetProfile}={}){
 const target=gatewayTarget(targetProfile);key(secret);return (body,ip,path=target.path)=>{
  if(body?.action!=='login'||path!==target.path||Buffer.byteLength(json(body))>65536)throw Error('GATEWAY_LOGIN_SCOPE');
  const source=createHmac('sha256',secret).update('mt-source-v1:'+address(ip)).digest('hex'),issued=now();
  const claim={aud:target.aud,method:'POST',path,body:digest(body),source,issued,expires:issued+10000,nonce:randomBytes(16).toString('hex')};
  const payload=Buffer.from(json(claim)).toString('base64url'),mac=createHmac('sha256',secret).update('mt-admission-v1:'+payload).digest('hex');return payload+'.'+mac;
 };
}
/** @param {{secret?:string,expectedPath?:string,now?:()=>number,targetProfile?:GatewayTargetProfile}} [options] */
export function createGatewayVerifier({secret,expectedPath,now=Date.now,targetProfile}={}){
 const target=gatewayTarget(targetProfile);key(secret);expectedPath=expectedPath===undefined?target.path:expectedPath;if(expectedPath!==target.path)throw Error('GATEWAY_PATH_ATTESTATION_REQUIRED');
 return (req,body)=>{
  const proof=req.headers.get('x-maintrack-admission')||'';if(proof.length>2048)throw Error('GATEWAY_PROOF_REJECTED');const [payload,mac,...extra]=proof.split('.');
  if(extra.length||!payload||!/^[A-Za-z0-9_-]+$/.test(payload)||!/^[a-f0-9]{64}$/.test(mac||''))throw Error('GATEWAY_PROOF_REJECTED');
  const expected=createHmac('sha256',secret).update('mt-admission-v1:'+payload).digest();if(!timingSafeEqual(expected,Buffer.from(mac,'hex')))throw Error('GATEWAY_PROOF_REJECTED');
  let c;try{c=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{throw Error('GATEWAY_PROOF_REJECTED');}
  const t=now();if(c.aud!==target.aud||c.method!=='POST'||req.method!=='POST'||c.path!==expectedPath||![expectedPath,expectedPath.replace('/functions/v1','')].includes(new URL(req.url).pathname)||c.body!==digest(body)||!/^[a-f0-9]{64}$/.test(c.source||'')||!/^[a-f0-9]{32}$/.test(c.nonce||'')||!Number.isSafeInteger(c.issued)||!Number.isSafeInteger(c.expires)||c.issued>t+1000||c.expires<=t||c.expires-c.issued!==10000)throw Error('GATEWAY_PROOF_REJECTED');
  // Full replay rejection additionally requires Siteverify's token single-use check.
  return c.source;
 };
}
async function requestBody(req){
 const reader=req.body?.getReader();if(!reader)throw Error('BODY');let timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reader.cancel().catch(()=>{});reject(Error('BODY_DEADLINE'));},2000);});
 try{return await Promise.race([(async()=>{let raw='',size=0;const decoder=new TextDecoder();for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw Error('BODY');raw+=decoder.decode(value,{stream:true});}return JSON.parse(raw+decoder.decode());})(),deadline]);}
 finally{clearTimeout(timer);try{await reader.cancel();}catch{}}
}
/** @param {{secret?:string,gatewayHostname?:string,vercel?:string,ingressContractApproved?:boolean,allowedOrigins?:string[],fetchImpl?:typeof fetch,targetProfile?:GatewayTargetProfile}} [options] */
export function createVercelLoginGateway({secret,gatewayHostname,vercel=process.env.VERCEL,ingressContractApproved=false,allowedOrigins=[],fetchImpl=fetch,targetProfile}={}){
 const target=gatewayTarget(targetProfile);
 if(vercel!=='1'||ingressContractApproved!==true||typeof gatewayHostname!=='string'||! /^[a-z0-9.-]+$/.test(gatewayHostname))throw Error('VERCEL_INGRESS_NOT_ATTESTED');
 if(!Array.isArray(allowedOrigins)||allowedOrigins.some(x=>{try{return new URL(x).origin!==x||!x.startsWith('https://');}catch{return true;}}))throw Error('GATEWAY_ORIGINS_REQUIRED');
 const origins=new Set(['https://'+gatewayHostname,...allowedOrigins]);
 const sign=createGatewaySigner({secret,targetProfile});
 return async req=>{
  const origin=req.headers.get('origin')||'';const cors=origin&&origins.has(origin)?{'access-control-allow-origin':origin,'vary':'Origin'}:{};
  try{
   if((origin&&!origins.has(origin))||new URL(req.url).protocol!=='https:'||new URL(req.url).hostname!==gatewayHostname||new URL(req.url).pathname!=='/api/login')return Response.json({error:'GATEWAY_SCOPE'},{status:403});
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type'}});
   if(req.method!=='POST')return Response.json({error:'GATEWAY_SCOPE'},{status:405,headers:cors});
   const ip=req.headers.get('x-vercel-forwarded-for');if(!ip||address(ip)!==address(req.headers.get('x-forwarded-for')))throw Error('SOURCE');
   const body=await requestBody(req);const proof=sign(body,ip);
   const response=await fetchImpl(target.url,{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-maintrack-admission':proof},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
   if(response.status<200||response.status>=600)throw Error('UPSTREAM');return new Response(response.body,{status:response.status,headers:{'content-type':'application/json','cache-control':'no-store',...cors}});
  }catch{return Response.json({error:'LOGIN_GATEWAY_UNAVAILABLE'},{status:503,headers:cors});}
 };
}

/** @param {{secret?:string,admissionLogin?:(body:Record<string,unknown>,source:string)=>Promise<unknown>,targetProfile?:GatewayTargetProfile}} [options] */
export function createGatewayAdmissionLogin({secret,admissionLogin,targetProfile}={}){
 const verify=createGatewayVerifier({secret,targetProfile});if(typeof admissionLogin!=='function')throw Error('ADMISSION_HANDLER_REQUIRED');
 return async(req,body)=>{let source;try{source=verify(req,body);}catch{throw new LoginAdmissionError('LOGIN_GATEWAY_PROOF_REQUIRED');}return admissionLogin(body,source);};
}
