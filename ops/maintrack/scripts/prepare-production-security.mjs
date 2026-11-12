// Review-only local Production composition. No network, installation or deployment.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(import.meta.dirname,'../../..');
const production=Object.freeze({projectRef:'tdnkeskczcsukcujwinu',functionSlug:'maintrack-final-047'});
const sha=value=>createHash('sha256').update(value).digest('hex');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
function once(source,anchor,replacement){if(source.split(anchor).length!==2)throw Error('PRODUCTION_SOURCE_CONTRACT_CHANGED');return source.replace(anchor,replacement);}
/** Compose from current canonical files; the supplied SHA is a local source identity, not approval. */
export function prepareProductionSecurity({projectRef,sourceSha256}={}){
 if(projectRef!==production.projectRef)throw Error('EXACT_PRODUCTION_PROJECT_REQUIRED');
 const base='supabase/functions/maintrack-final-047/';
 const canonical=read(base+'index.ts'),actualSha=sha(canonical);
 if(typeof sourceSha256!=='string'||sourceSha256!==actualSha)throw Error('CURRENT_CANONICAL_SOURCE_SHA_REQUIRED');
 if(/createQaPool|qaLeaseHarness|createQaChannel|withQaIsolation|createRegisteredLogin/.test(canonical))throw Error('CANONICAL_PRODUCTION_SOURCE_REQUIRED');
 let source=canonical.replace('type QaCorePool,','');
 const preamble=`import {createAdmissionLogin,LoginAdmissionError} from './login-admission.mjs';
import {createGatewayVerifier} from './login-gateway.mjs';
import {createRegisteredLogin,PgIdentityStore,registeredPrincipalSource} from './registered-login.mjs';
const productionTarget=Object.freeze(${JSON.stringify(production)});
const productionSourceSha256=${JSON.stringify(actualSha)};
// Source identity/configuration checks are not runtime-role or deployment approval.
if(Deno.env.get('MT_PRODUCTION_PROJECT_REF')!==productionTarget.projectRef||Deno.env.get('MT_REGISTERED_LOGIN_MODE')!=='production-review-v1'||Deno.env.get('MT_PRODUCTION_SOURCE_SHA256')!==productionSourceSha256)throw Error('PRODUCTION_REVIEW_CONFIGURATION_REQUIRED');
`;
 const init=`
const registeredStore=new PgIdentityStore(pool);
const registeredGateway=createGatewayVerifier({secret:Deno.env.get('MT_LOGIN_GATEWAY_SECRET'),targetProfile:productionTarget});
const registeredProvider=createAdmissionLogin({login:async()=>true,secret:Deno.env.get('MT_LOGIN_TURNSTILE_SECRET'),allowedHostnames:(Deno.env.get('MT_LOGIN_TURNSTILE_HOSTNAMES')||'').split(',').filter(Boolean)});
const registeredHandler=createRegisteredLogin({store:registeredStore,rpID:Deno.env.get('MT_REGISTERED_RP_ID'),origin:Deno.env.get('MT_REGISTERED_ORIGIN'),androidOrigins:(Deno.env.get('MT_REGISTERED_ANDROID_ORIGINS')||'').split(',').filter(Boolean),challengeSecret:Deno.env.get('MT_REGISTERED_CHALLENGE_SECRET'),verifyIngress:async(req,body)=>registeredGateway(req,body),verifyProvider:async body=>(await registeredProvider(body))===true,passwordLogin:(body,identity)=>login(body,registeredPrincipalSource(identity.principal),{kind:'verified-gateway-v1'},identity)});
const admittedLogin=async(req:Request,body:RequestBody)=>{try{return await registeredHandler(req,body);}catch(e){if(e instanceof AppError||e instanceof LoginRateError||e instanceof LoginAdmissionError)throw e;throw new LoginAdmissionError('REGISTERED_LOGIN_REJECTED');}};
`;
 const pool=source.match(/^const pool:CorePool=new pg\.Pool\([^\n]+\);\r?$/m)?.[0];if(!pool)throw Error('CANONICAL_POOL_CONTRACT_REQUIRED');
 source=once(source,pool,pool+init);
 source=once(source,'async function login(b:RequestBody,source?:string){',"async function login(b:RequestBody,source:string,admissionPolicy:{kind:'verified-gateway-v1'},identity:{id:string;principal:string;epoch:number}){");
 source=once(source,'return withLoginBudget(pool,source,code,async (c:SqlConnection)=>{','return withLoginBudget(pool,source,code,async (c:SqlConnection)=>{\n await registeredStore.assertCurrent(c,identity);');
 source=once(source,"await c.query('DELETE FROM mt_login_attempts WHERE employee_code=$1',[code]);return issue(u,c);\n });", "await c.query('DELETE FROM mt_login_attempts WHERE employee_code=$1',[code]);const issued=await issue(u,c);if(await registeredStore.bindSession(c,identity,sha(issued.token))!==true)throw new LoginAdmissionError('IDENTITY_SESSION_BINDING_REQUIRED');return issued;\n },admissionPolicy);");
 source=once(source,"a==='login'?await login(b):a==='logout'?await revokeCurrentSession(req):await dispatch(await auth(req),b)","a==='login'?await admittedLogin(req,b):a==='logout'?await revokeCurrentSession(req):await dispatch(await auth(req),b)");
 source=source.replaceAll('e instanceof AppError||e instanceof LoginRateError','e instanceof AppError||e instanceof LoginRateError||e instanceof LoginAdmissionError');
 source=source.replaceAll('||e instanceof LoginAdmissionError||e instanceof LoginAdmissionError','||e instanceof LoginAdmissionError');
 source=preamble+source;
 const files=[{name:'index.ts',content:source}];
 for(const name of ['core-types.ts','ledger-service.mjs','login-rate-limit.mjs','login-admission.mjs','login-gateway.mjs','login-proof.mjs']){
  let content=read(base+name);if(name==='core-types.ts')content=content.replace(/^export interface QaCorePool[^\r\n]*\r?\n/m,'');files.push({name,content});
 }
 files.push({name:'registered-login.mjs',content:read('ops/maintrack/security/registered-login.mjs').replace("'@simplewebauthn/server'","'npm:@simplewebauthn/server@14.0.3'").replace("'../../../supabase/functions/maintrack-final-047/login-rate-limit.mjs'","'./login-rate-limit.mjs'")});
 files.push({name:'deno.json',content:JSON.stringify({imports:{},compilerOptions:{}},null,2)+'\n'},{name:'deno.lock',content:read('ops/maintrack/security/registered-login.deno.lock')});
 const lock=JSON.parse(files.find(file=>file.name==='deno.lock').content);for(const specifier of ['npm:pg@8.13.3','npm:@types/pg@8.11.11','npm:@simplewebauthn/server@14.0.3'])if(!lock.specifiers?.[specifier])throw Error('PINNED_PRODUCTION_LOCK_REQUIRED');
 files.push({name:'production-gateway.mjs',content:`// Server review factory only. No handler is created or activated by importing this file.
import {createVercelLoginGateway} from './login-gateway.mjs';
const targetProfile=Object.freeze(${JSON.stringify(production)});
const sourceSha256=${JSON.stringify(actualSha)};
/** @param {Parameters<typeof createVercelLoginGateway>[0]} options @param {{projectRef?:string,sourceSha256?:string,mode?:string}} configuration */
export function createProductionGateway(options,configuration){
 if(configuration?.projectRef!==targetProfile.projectRef||configuration?.sourceSha256!==sourceSha256||configuration?.mode!=='production-review-v1')throw Error('PRODUCTION_REVIEW_CONFIGURATION_REQUIRED');
 return createVercelLoginGateway({...options,targetProfile});
}
`});
 for(const file of files)for(const match of file.content.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){if(!files.some(candidate=>candidate.name===match[1].slice(2))||!match[1].startsWith('./'))throw Error('PRODUCTION_MODULE_ESCAPE');}
 if(files.some(file=>/createQaPool|qaLeaseHarness|createQaChannel|withQaIsolation|maintrack_qa_lease|qa_security_final_20261025|https:\/\/szhstrafzkxzstjdcynl\.supabase\.co/.test(file.content)))throw Error('QA_ISOLATION_IN_PRODUCTION_BUNDLE');
 const manifest={projectRef:production.projectRef,core:{slug:production.functionSlug,identifiedVersion:3},inventory:{slug:'maintrack-inventory-final-047',identifiedVersion:1,included:false},source:'CURRENT_LOCAL_CANONICAL_CORE',canonicalSourceSha256:actualSha,deploy:false,productionAuthorized:false,activationBlocked:true,sourceComparison:'PENDING',runtimeRoleAttestation:'PENDING',review:'PENDING',backup:'PENDING',cloudAcceptance:'NOT TESTED',deploymentBlockedUntil:['Actual deployed source comparison','Actual runtime-role and database-transport attestation','Independent review','Verified backup and rollback','Full authorized acceptance'],files:files.map(file=>({name:file.name,sha256:sha(file.content)}))};
 return {files,manifest};
}
export function writeProductionSecurityReview({outputDirectory,...options}={}){
 const result=prepareProductionSecurity(options),out=path.resolve(outputDirectory||'');let audit;
 try{audit=fs.realpathSync(path.join(root,'audit-output'));}catch{throw Error('NEW_OWNED_AUDIT_DIRECTORY_REQUIRED');}
 if(path.dirname(out)!==audit||fs.existsSync(out))throw Error('NEW_OWNED_AUDIT_DIRECTORY_REQUIRED');
 fs.mkdirSync(out);for(const file of result.files)fs.writeFileSync(path.join(out,file.name),file.content);fs.writeFileSync(path.join(out,'review-manifest.json'),JSON.stringify(result.manifest,null,2)+'\n');return result.manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [projectRef,sourceSha256,outputDirectory]=process.argv.slice(2);if(!projectRef||!sourceSha256||!outputDirectory)throw Error('PROJECT_SHA_NEW_OUTPUT_REQUIRED');
 console.log(JSON.stringify(writeProductionSecurityReview({projectRef,sourceSha256,outputDirectory}),null,2));
}
