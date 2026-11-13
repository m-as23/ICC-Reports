import {requireQaBinding} from '../qa-binding.mjs';
// QA-only transport for existing opaque-session operations. No Login route,
// credentials, role decisions, database connection or Production target profile.
const REF='szhstrafzkxzstjdcynl';
const actions={core:new Set(['session','profile','logout']),inventory:new Set(['inventorySnapshot','inventoryVersion','inventorySearch','inventorySearchPage','inventoryItem','inventoryHistory','inventoryVersions','inventoryActivity','inventorySearchCapabilities'])};
export function createQaSessionProxy({kind,env=process.env,fetchImpl=fetch}={}){
 const binding=requireQaBinding(),HOST=binding.rpId;
 if(!Object.hasOwn(actions,kind)||env.VERCEL!=='1'||env.MT_LOGIN_ADMISSION_PROJECT_REF!==REF||env.MT_LOGIN_GATEWAY_HOST!==HOST||!/^[a-f0-9]{64}$/.test(env.MT_QA_WINDOW_CAPABILITY||''))throw Error('QA_SESSION_PROXY_CONFIGURATION');
 const endpoint='https://'+REF+'.supabase.co/functions/v1/'+(kind==='core'?'maintrack-security-qa-final/api':'maintrack-security-qa-inventory'),capability=env.MT_QA_WINDOW_CAPABILITY;
 return async(req,res)=>{
  const reply=(status,error)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify({error}));};
  try{
   const headers=new Headers();for(const [k,v] of Object.entries(req.headers||{})){if(Array.isArray(v)&&v.length!==1)return reply(403,'QA_HEADER_AMBIGUOUS');if(v!==undefined)headers.set(k,Array.isArray(v)?v[0]:String(v));}
   const origin=headers.get('origin');if(req.url!=='/api/'+kind||(origin&&![binding.origin].includes(origin)))return reply(403,'QA_SESSION_SCOPE');
   if(origin){res.setHeader('access-control-allow-origin',origin);res.setHeader('vary','Origin');}
   if(req.method==='OPTIONS'){res.statusCode=204;res.setHeader('access-control-allow-methods','POST, OPTIONS');res.setHeader('access-control-allow-headers','authorization,content-type,x-request-id');return res.end();}
   if(req.method!=='POST')return reply(403,'QA_SESSION_SCOPE');
   const raw=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString('utf8'):JSON.stringify(req.body);if(typeof raw!=='string'||Buffer.byteLength(raw)>65536)return reply(413,'QA_BODY_LIMIT');
   const body=JSON.parse(raw);if(!body||Array.isArray(body)||typeof body!=='object'||!actions[kind].has(body.action))return reply(403,'QA_ACTION_DENIED');
   const authorization=headers.get('authorization')||'',headerToken=/^Bearer ([a-f0-9]{64})$/.exec(authorization)?.[1],bodyToken=body.token;
   if((authorization&&!headerToken)||(bodyToken!==undefined&&(typeof bodyToken!=='string'||!/^[a-f0-9]{64}$/.test(bodyToken)))||(headerToken&&bodyToken&&headerToken!==bodyToken)||(!headerToken&&!bodyToken))return reply(401,'AUTH');
   const token=headerToken||bodyToken;delete body.token;
   const upstream=await fetchImpl(endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+token,'x-maintrack-qa-run-id':'SECURITY_FINAL_20261025','x-maintrack-qa-capability':capability},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
   const reader=upstream.body?.getReader(),parts=[];let length=0;try{if(reader)for(;;){const x=await reader.read();if(x.done)break;length+=x.value.length;if(length>2097152)throw Error('QA_RESPONSE_LIMIT');parts.push(Buffer.from(x.value));}}finally{if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
   if(upstream.status<200||upstream.status>=600)throw Error('QA_UPSTREAM_STATUS');res.statusCode=upstream.status;res.setHeader('content-type',upstream.headers.get('content-type')||'application/json');res.setHeader('cache-control','no-store');res.end(Buffer.concat(parts).toString('utf8'));
  }catch{return reply(503,'QA_SESSION_TRANSPORT_UNCONFIRMED');}
 };
}
