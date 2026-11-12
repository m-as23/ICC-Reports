import {requireQaBinding} from '../qa-binding.mjs';
export default async function handler(req,res){
 try{requireQaBinding();}catch{res.statusCode=503;res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');return res.end('{"error":"QA_ADMISSION_DISABLED"}');}
 return (await import('../runtime/api/login.mjs')).default(req,res);
}
