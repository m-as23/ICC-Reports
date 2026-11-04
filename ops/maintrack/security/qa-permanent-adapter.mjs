import {createHash} from 'node:crypto';
export function permanentHarness(pool){let halted=false;return {async ready(){const r=await pool.query("SELECT maintrack_qa_permanent.is_open() AS active,session_user='maintrack_qa_b2_runtime' AS login,current_user IN('maintrack_qa_final_runtime','maintrack_qa_inventory_runtime') AS role,NOT pg_has_role(session_user,'maintrack_qa_cleanup_worker','MEMBER') AS isolated,has_function_privilege(current_user,'maintrack_qa_permanent.mutate(text,text,text)','EXECUTE')=(current_user='maintrack_qa_final_runtime') AS mutation_boundary,EXISTS(SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='maintrack_qa_permanent.mutate(text,text,text)'::regprocedure AND r.rolname='maintrack_qa_permanent_executor' AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND p.prosecdef) AS owner");const {active,...checks}=r.rows[0];return {compatible:Object.values(checks).every(x=>x===true),active,checks};},
/**
 * @param {{query:(sql:string,args:unknown[])=>Promise<unknown>}} c
 * @param {string} op
 * @param {string|null} code
 * @param {string|null} [hash]
 */
async mutate(c,op,code,hash=null){if(halted)throw Error('QA_HALTED');try{return await c.query('SELECT maintrack_qa_permanent.mutate($1,$2,$3)',[op,code,hash]);}catch(e){if(!e.code||['ECONNRESET','ETIMEDOUT','08006'].includes(e.code))halted=true;throw e;}}};}
export function permanentChannel(pool,{allowedOrigins=['https://localhost']}={}){
 if(!Array.isArray(allowedOrigins)||!allowedOrigins.length||allowedOrigins.length>2||allowedOrigins.some(x=>{try{return new URL(x).origin!==x||!x.startsWith('https:')}catch{return true}}))throw Error('QA_ORIGINS_REQUIRED');
 const origins=new Set(allowedOrigins);
 return {async activeAuthorized(){return (await pool.query('SELECT maintrack_qa_permanent.is_open() AS active')).rows[0].active;},wrap:handler=>async req=>{
 try{
 const origin=req.headers.get('origin');
 if(origin&&!origins.has(origin))return new Response('QA_ORIGIN_FORBIDDEN',{status:403});
 if(req.method==='OPTIONS')return origin&&origins.has(origin)?new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization,content-type,x-request-id,x-maintrack-qa-run-id,x-maintrack-qa-capability','vary':'Origin','cache-control':'no-store'}}):new Response('QA_PREFLIGHT_DENIED',{status:403});
 if(req.method==='GET'&&new URL(req.url).pathname.endsWith('/readyz')){
  if(req.headers.get('x-maintrack-qa-run-id')!=='SECURITY_FINAL_20261025'||(req.headers.has('origin')&&!origins.has(req.headers.get('origin'))))return new Response('QA_PREFLIGHT_DENIED',{status:403});
  // Catalog/runtime attestation only. No actor/session read, admission or handler.
  const r=await permanentHarness(pool).ready();return new Response(JSON.stringify({status:r.compatible?'ready':'hold',metadataOnly:true,activeTestsAuthorized:r.active&&r.compatible,checks:r.checks}),{status:r.compatible?200:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
 }
 const cap=req.headers.get('x-maintrack-qa-capability')||'';if(!/^[a-f0-9]{64}$/.test(cap))return new Response('QA_CLOSED',{status:403});
 const hash=createHash('sha256').update(cap).digest('hex');if(!(await pool.query('SELECT maintrack_qa_permanent.admit($1) AS admitted',[hash])).rows[0].admitted)return new Response('QA_CLOSED',{status:423});
 if(req.method!=='POST')return new Response('QA_METHOD_DENIED',{status:405});return await handler(req);
 }catch{return new Response('QA_UNAVAILABLE',{status:503});}
 }};}
