// REVIEW-ONLY v0.4.7 integration test: pinned upstream SpareParts-Search-Lab @ 07dbac0c2a63cf58336ae8a2df383cbcf9f283be.
// No Supabase / Vercel changes, no inventory database operations executed by this module alone.
// Framework-neutral Fetch API handler for a future trusted server/Edge integration.
// Standalone test module only. No listening socket, deployment or route in MainTrack.
const MAX_BODY=15*1024*1024;
const MAX_XLSX_BYTES=10*1024*1024;
const jsonHeaders={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const allowedMethods='POST, OPTIONS';
const allowedHeaders='Authorization, Content-Type';

function makeResponse(status,body,origin=null){
 const h={...jsonHeaders,'vary':'Origin'};
 if(origin)h['access-control-allow-origin']=origin;
 return new Response(JSON.stringify(body),{status,headers:h});
}
async function limitedJson(request){
 const len=Number(request.headers.get('content-length')||0);
 if(Number.isFinite(len)&&len>MAX_BODY)throw Error('REQUEST_TOO_LARGE');
 if(!request.body)throw Error('REQUEST_BODY_REQUIRED');
 const chunks=[],reader=request.body.getReader();let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.length;
   if(size>MAX_BODY)throw Error('REQUEST_TOO_LARGE');
   chunks.push(value);
  }
 }catch(e){await reader.cancel().catch(()=>{});throw e;}
 const bytes=new Uint8Array(size);let off=0;
 for(const c of chunks){bytes.set(c,off);off+=c.length;}
 let payload;
 try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{throw Error('INVALID_JSON');}
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('INVALID_JSON_OBJECT');
 return {payload,bytesLength:size};
}
function decodeUpload(str){
 if(typeof str!=='string'||str.length<100||str.length>Math.ceil(MAX_XLSX_BYTES/3)*4+8
     ||str.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(str))throw Error('INVALID_XLSX_ENCODING');
 const bytes=Buffer.from(str,'base64');
 if(!bytes.length||bytes.length>MAX_XLSX_BYTES||bytes.toString('base64')!==str)throw Error('INVALID_XLSX_ENCODING');
 return bytes;
}
const codeFor=(err)=>{
 if(/UNAUTHENTICATED|VERIFIED_USER_ID_REQUIRED/.test(err))return 401;
 if(/FORBIDDEN/.test(err))return 403;
 if(/STALE_BASE|NOT_PENDING|REVIEW_RECEIPT_MISMATCH/.test(err))return 409;
 if(/UNKNOWN_ACTION|INVALID_JSON|REQUEST_TOO_LARGE|REQUEST_BODY_REQUIRED|INVALID_XLSX_ENCODING|INVALID_QUERY|ONLY_XLSX|INVALID_FILE|DUPLICATE_|MISSING_|REQUIRED_|SUSPICIOUS_|OWNER_REVIEW_REQUIRED|LARGE_ABSENCE|FORMULA_|HYPERLINK_|XLSX_|INVALID_QUANTITY|INVALID_REQUIRED_FIELD/.test(err))return 422;
 return 500;
};
export function createInventoryHttpHandler({service,allowedOrigins}={}){
 if(!service||typeof service.execute!=='function')throw Error('INVENTORY_SERVICE_REQUIRED');
 if(!Array.isArray(allowedOrigins)||!allowedOrigins.length||allowedOrigins.some(o=>!/^https:\/\/[^/]+$/i.test(o)))
  throw Error('EXPLICIT_HTTPS_ALLOWED_ORIGINS_REQUIRED');
 const allow=new Set(allowedOrigins);
 return async function handle(request){
  const origin=request.headers.get('origin');
  if(origin && !allow.has(origin))return makeResponse(403,{ok:false,error:'ORIGIN_FORBIDDEN'});
  const supported=request.method==='OPTIONS'||request.method==='POST';
  if(!supported)return makeResponse(405,{ok:false,error:'METHOD_NOT_ALLOWED'},origin);
  if(request.method==='OPTIONS'){
   if(!origin)return makeResponse(400,{ok:false,error:'ORIGIN_REQUIRED'});
   if(request.headers.get('access-control-request-method')!=='POST')
    return makeResponse(405,{ok:false,error:'METHOD_NOT_ALLOWED'},origin);
   const headers=new Headers({...jsonHeaders,'vary':'Origin',
    'access-control-allow-origin':origin,'access-control-allow-methods':allowedMethods,
    'access-control-allow-headers':allowedHeaders,'access-control-max-age':'600'});
   return new Response(null,{status:204,headers});
  }
  const authorization=request.headers.get('authorization')||'';
  const token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
  // Bearer is mandatory for native and browser requests; never use cookies or URL tokens.
  if(!/^[a-f0-9]{64}$/i.test(token))return makeResponse(401,{ok:false,error:'UNAUTHENTICATED'},origin);
  const contentType=request.headers.get('content-type')||'';
  if(!/^application\/json(?:\s*;.*)?$/i.test(contentType))
   return makeResponse(415,{ok:false,error:'JSON_ONLY'},origin);
  try{
   const {payload,bytesLength}=await limitedJson(request);
   if(typeof payload.action!=='string')throw Error('UNKNOWN_ACTION');
   if(payload.action!=='inventoryDraft'&&bytesLength>32768)throw Error('REQUEST_TOO_LARGE');
   const input={...payload};
   // Ignore caller-supplied session/userId/role. Use Authorization header exclusively.
   delete input.role;delete input.userId;delete input.session;
   if(input.action==='inventoryDraft'){
    input.bytes=decodeUpload(input.fileBase64);
   }
   delete input.fileBase64;
   input.session=token.toLowerCase();
   const data=await service.execute(input);
   return makeResponse(200,{ok:true,data},origin);
  }catch(error){
   const code=String(error?.message||'INTERNAL');
   const status=codeFor(code);
   // Keep details for server diagnostics only; never return SQL, stack traces or secrets.
   return makeResponse(status,{ok:false,error:status===500?'INTERNAL_ERROR':code.split(':')[0]},origin);
  }
 };
}
