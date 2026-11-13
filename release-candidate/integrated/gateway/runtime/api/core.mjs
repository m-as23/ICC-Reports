import {createQaSessionProxy} from '../../server/qa-session-proxy.mjs';
export default async function handler(req,res){try{return await createQaSessionProxy({kind:"core"})(req,res);}catch{res.statusCode=503;res.setHeader('content-type','application/json');res.end('{"error":"QA_SESSION_PROXY_NOT_CONFIGURED"}');}}
