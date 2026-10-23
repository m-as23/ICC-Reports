import {timingSafeEqual} from 'node:crypto';
// Internal continuation only; browser/employee authorization never grants access.
export function createIndexWorker({secret,initialize,schedule}={}){
 return async request=>{
  const reply=status=>new Response(null,{status,headers:{'Cache-Control':'no-store'}});
  if(request.method!=='POST')return reply(405);
  if(request.headers.has('origin'))return reply(403);
  const provided=request.headers.get('authorization')||'',expected='Bearer '+secret;
  const actualBytes=Buffer.from(provided),expectedBytes=Buffer.from(expected);
  if(!secret||actualBytes.length!==expectedBytes.length||!timingSafeEqual(actualBytes,expectedBytes))return reply(401);
  try{const runtime=await initialize();schedule(runtime.warmIndex());return reply(202);}catch{return reply(503);}
 };
}
