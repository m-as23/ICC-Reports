export const QA=Object.freeze({ref:'szhstrafzkxzstjdcynl',schema:'qa_security_final_20261025',role:'maintrack_qa_inventory_runtime',login:'maintrack_qa_b2_runtime',sourceCommit:'1c23d09127bebca48b5aba129b505af254e0a010',marker:'SECURITY_FINAL_20261025',searchPath:'pg_catalog,qa_security_final_20261025,extensions'});
export function assertQaEnvironment(get){
 if(get('SUPABASE_URL')!==`https://${QA.ref}.supabase.co`||get('MAINTRACK_QA_ENABLE')!=='ISOLATED_E2E_B2_ONLY')throw Error('QA_PROJECT_ENVIRONMENT_MISMATCH');
 let database;try{database=new URL(get('MAINTRACK_QA_DB_URL')||'');}catch{throw Error('QA_DATABASE_TARGET_MISMATCH');}
 const direct=database.hostname===`db.${QA.ref}.supabase.co`,pooler=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(database.hostname);
 let login;try{login=decodeURIComponent(database.username);}catch{throw Error('QA_DATABASE_ROLE_MISMATCH');}
 // SET ROLE must persist for this checked-out client: direct or session pooler only.
 if(!['postgres:','postgresql:'].includes(database.protocol)||(!direct&&!pooler)||database.search||database.hash||database.pathname!=='/postgres'||!['','5432'].includes(database.port)||login!==(direct?QA.login:`${QA.login}.${QA.ref}`))throw Error('QA_DATABASE_TARGET_MISMATCH');
 return {database};
}
const attestationSql=`SELECT /* qa_runtime_attestation */ current_user AS role,session_user AS login,current_database() AS database,current_setting('search_path') AS search_path,m.project_ref,m.source_commit,m.preparation,pg_catalog.to_regclass('${QA.schema}.mt_sessions') IS NOT NULL AS sessions_present,(SELECT enabled=false FROM ${QA.schema}.mt_mail_config WHERE singleton=true) AS mail_disabled FROM ${QA.schema}.qa_scope m WHERE singleton=true`;
function valid(a){return a?.role===QA.role&&a.login===QA.login&&a.database==='postgres'&&String(a.search_path).replace(/[\s"]/g,'')===QA.searchPath&&a.project_ref===QA.ref&&a.sessions_present===true&&a.source_commit===QA.sourceCommit&&a.preparation===QA.marker&&a.mail_disabled===true;}
export function createQaPool({Pool,base,envGet}={}){
 const {database}=assertQaEnvironment(envGet);
 const raw=base||new Pool({connectionString:database.toString(),ssl:{rejectUnauthorized:true},max:2,idleTimeoutMillis:1000,connectionTimeoutMillis:6000,options:'-c statement_timeout=10000 -c lock_timeout=3000'});
 const connect=async()=>{const c=await raw.connect();try{await c.query(`SET ROLE ${QA.role}`);await c.query(`SET search_path TO pg_catalog, ${QA.schema}, extensions`);const a=(await c.query(attestationSql)).rows[0];if(!valid(a))throw Error('QA_RUNTIME_ATTESTATION_FAILED');return c;}catch{const e=Error('QA_RUNTIME_ATTESTATION_FAILED');c.release(e);throw e;}};
 const query=async(sql,args=[])=>{const c=await connect();try{return await c.query(sql,args);}finally{c.release();}};
 return Object.freeze({connect,query,async attest(){const c=await connect();try{const x=(await c.query(`SELECT count(*)::int AS accounts,count(*) FILTER(WHERE active)::int AS active_accounts,count(*) FILTER(WHERE employee_code IN ('90000001','90000002','90000003','90000004') AND name LIKE 'QA_FINAL_%')::int AS synthetic_accounts FROM ${QA.schema}.mt_users`)).rows[0];return {status:x.accounts===2&&x.active_accounts===2&&x.synthetic_accounts===2?'ready':'hold',qaProject:QA.ref,schema:QA.schema,executionRole:QA.role,sourceCommit:QA.sourceCommit,preparation:QA.marker,mailDisabled:true,externalTransport:false,accounts:x,activeTestsAuthorized:false};}finally{c.release();}}});
}
const reply=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
/** @param {(req:Request)=>Response|Promise<Response>} handler @param {{attest?:()=>Promise<Record<string,unknown>>,activeAuthorized?:()=>boolean|Promise<boolean>}} [options] */
export function withQaIsolation(handler,{attest,activeAuthorized=()=>false}={}){return async req=>{
 const origin=req.headers.get('origin');if(origin&&origin!=='https://localhost')return reply({error:'QA_ORIGIN_FORBIDDEN'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...(origin?{'access-control-allow-origin':origin}:{}),'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type,x-request-id,x-maintrack-qa-run-id,x-maintrack-qa-capability','vary':'Origin'}});
 if(req.headers.get('x-maintrack-qa-run-id')!==QA.marker)return reply({error:'QA_RUN_MARKER_REQUIRED'},403);
 if(req.method==='GET'&&new URL(req.url).pathname.endsWith('/readyz')){try{return reply({...await attest(),activeTestsAuthorized:await activeAuthorized()});}catch{return reply({status:'hold',error:'QA_NOT_READY'},503);}}
 if(req.method==='GET'&&new URL(req.url).pathname.endsWith('/healthz'))return reply({service:'maintrack-security-qa-inventory',preparation:QA.marker,project:QA.ref,activeTestsAuthorized:await activeAuthorized()});
 if(req.method==='POST'&&!await activeAuthorized())return reply({error:'QA_ACTIVE_TESTS_NOT_AUTHORIZED'},423);
 return handler(req);
};}
