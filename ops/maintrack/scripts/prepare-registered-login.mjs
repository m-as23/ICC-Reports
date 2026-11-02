// Compose a disabled local derivative only. No SQL install, deploy or provider setup.
import {typeCoreSource} from './prepare-qa-login-rpc.mjs';
import {frameHostingConfig} from './security-client-overlay.mjs';
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
export function prepareRegisteredBundle(bundle){
 if(bundle?.projectRef!=='szhstrafzkxzstjdcynl'||bundle.deploy!==false||!Array.isArray(bundle.files))throw Error('OFFLINE_QA_BUNDLE_REQUIRED');
 if(bundle.registeredIdentity)throw Error('REGISTERED_BUNDLE_ALREADY_PREPARED');
 const files=bundle.files.map(x=>({...x}));if(new Set(files.map(f=>f.name)).size!==files.length)throw Error('DUPLICATE_MODULE');
 // Refresh reviewed runtime dependencies: an immutable old review parent is not
 // evidence that its gateway/adapter modules are the current source candidate.
 for(const name of ['login-rate-limit.mjs','login-admission.mjs','login-gateway.mjs','login-proof.mjs']){
  const file=files.find(f=>f.name===name);if(file)file.content=fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/'+name,import.meta.url),'utf8');
 }
 const adapter=files.find(f=>f.name==='qa-login-lease.mjs');if(adapter)adapter.content=fs.readFileSync(new URL('../security/qa-login-lease.mjs',import.meta.url),'utf8').replace('../../../supabase/functions/maintrack-final-047/login-rate-limit.mjs','./login-rate-limit.mjs');
 const guard=files.find(f=>f.name==='qa-guard.mjs');if(guard&&!guard.content.includes('@param {(request:Request)'))guard.content=guard.content.replace('export function withQaIsolation(', '/** @param {(request:Request)=>Response|Promise<Response>} handler @param {{attest?:()=>Promise<Record<string,unknown>>,activeAuthorized?:()=>boolean|Promise<boolean>}} [options] */\nexport function withQaIsolation(');
 const entry=files.find(f=>f.name==='index.ts');if(!entry||entry.content.includes('createRegisteredLogin'))throw Error('REVIEWED_CORE_REQUIRED');
 let source=typeCoreSource(entry.content.replace("async function login(b,source,admissionPolicy:{kind:'verified-gateway-v1'})","async function login(b:RequestBody,source:string|undefined,admissionPolicy:{kind:'verified-gateway-v1'})"));
 if(!files.some(f=>f.name==='core-types.ts'))files.push({name:'core-types.ts',content:fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/core-types.ts',import.meta.url),'utf8')});
 const initialization=/^const admittedLogin=createGatewayAdmissionLogin\([^\n]+\);\r?$/m;
 if((source.match(initialization)||[]).length!==1)throw Error('GATEWAY_CONTRACT_CHANGED');
 source=source.replace(initialization,'let admittedLogin;');
 const importLine="import {createGatewayAdmissionLogin} from './login-gateway.mjs';";
 if(source.split(importLine).length!==2)throw Error('GATEWAY_IMPORT_CHANGED');
 source=source.replace(importLine,"import {createGatewayVerifier} from './login-gateway.mjs';\nimport {createRegisteredLogin,PgIdentityStore,registeredPrincipalSource} from './registered-login.mjs';");
 const sig="async function login(b:RequestBody,source:string|undefined,admissionPolicy:{kind:'verified-gateway-v1'})";
 source=source.replace("async function login(b:RequestBody,source,admissionPolicy:{kind:'verified-gateway-v1'})",sig);
 if(source.split(sig).length!==2)throw Error('LOGIN_SIGNATURE_CHANGED');source=source.replace(sig,sig.slice(0,-1)+',identity:{id:string;principal:string;epoch:number})');
 const budget='return withLoginBudget(pool,source,code,async (c:SqlConnection)=>{';
 if(source.split(budget).length!==2)throw Error('PASSWORD_WORK_CHANGED');source=source.replace(budget,budget+'\n await registeredStore.assertCurrent(c,identity);');
 const anchor='const qaChannel=createQaChannel({pool});';if(source.split(anchor).length!==2)throw Error('QA_POOL_CHANNEL_ATTESTATION_REQUIRED');
 const init=`
if(Deno.env.get('MT_REGISTERED_LOGIN_MODE')!=='qa-reviewed-v1')throw Error('REGISTERED_LOGIN_NOT_ACTIVATED');
const registeredStore=new PgIdentityStore(pool);
const registeredGateway=createGatewayVerifier({secret:Deno.env.get('MT_LOGIN_GATEWAY_SECRET')});
const registeredProvider=createAdmissionLogin({login:async()=>true,secret:Deno.env.get('MT_LOGIN_TURNSTILE_SECRET'),allowedHostnames:(Deno.env.get('MT_LOGIN_TURNSTILE_HOSTNAMES')||'').split(',').filter(Boolean)});
const registeredHandler=createRegisteredLogin({store:registeredStore,rpID:Deno.env.get('MT_REGISTERED_RP_ID'),origin:Deno.env.get('MT_REGISTERED_ORIGIN'),androidOrigins:(Deno.env.get('MT_REGISTERED_ANDROID_ORIGINS')||'').split(',').filter(Boolean),challengeSecret:Deno.env.get('MT_REGISTERED_CHALLENGE_SECRET'),verifyIngress:async(req,body)=>registeredGateway(req,body),verifyProvider:async body=>(await registeredProvider(body))===true,passwordLogin:(body,identity)=>login(body,registeredPrincipalSource(identity.principal),{kind:'verified-gateway-v1'},identity)});
admittedLogin=async(req:Request,body:RequestBody)=>{try{return await registeredHandler(req,body);}catch(e){if(e instanceof AppError||e instanceof LoginRateError||e instanceof LoginAdmissionError)throw e;throw new LoginAdmissionError('REGISTERED_LOGIN_REJECTED');}};
`;
 const issuePattern=/return issue\(u,c\);(?=\r?\n \},admissionPolicy\);)/;
 if(!issuePattern.test(source))throw Error('SESSION_ISSUE_CONTRACT_CHANGED');
 source=source.replace(issuePattern,"const issued=await issue(u,c);if(await registeredStore.bindSession(c,identity,sha(issued.token))!==true)throw new LoginAdmissionError('IDENTITY_SESSION_BINDING_REQUIRED');return issued;");
 source=source.replace(anchor,anchor+init);entry.content=source;
 if(!files.some(f=>f.name==='login-gateway.mjs'))throw Error('GATEWAY_MODULE_REQUIRED');
 if(source.includes("a==='login'?await login(b)"))throw Error('PASSWORD_ONLY_BYPASS');
 const module=fs.readFileSync(new URL('../security/registered-login.mjs',import.meta.url),'utf8').replace("'@simplewebauthn/server'","'npm:@simplewebauthn/server@14.0.3'").replace("'../../../supabase/functions/maintrack-final-047/login-rate-limit.mjs'","'./login-rate-limit.mjs'");
 if(files.some(f=>['registered-login.mjs','deno.lock'].includes(f.name)))throw Error('REGISTERED_MODULE_COLLISION');
 files.push({name:'registered-login.mjs',content:module},{name:'deno.lock',content:fs.readFileSync(new URL('../security/registered-login.deno.lock',import.meta.url),'utf8')});
 return {...bundle,files,deploy:false,registeredIdentity:{status:'LOCAL_DERIVATIVE_NOT_ACTIVATED',cloudAcceptance:'NOT TESTED',operatorEnrollment:'REQUIRES_OWNER_POLICY',runtimeRoles:'NOT_GRANTED',qaChannelGatewayBinding:'NOT_VERIFIED',android:'NOT_TESTED',noPasswordOnlyFallback:true,library:'@simplewebauthn/server@14.0.3'},sha256:Object.fromEntries(files.map(f=>[f.name,createHash('sha256').update(f.content).digest('hex')]))};
}

export function prepareRegisteredPermanentRuntime(bundle){
 if(bundle?.projectRef!=='szhstrafzkxzstjdcynl'||bundle.deploy!==false||!bundle.registeredIdentity)throw Error('REGISTERED_PERMANENT_QA_ONLY');
 const result={...bundle,files:bundle.files.map(f=>({...f}))};
 const file=name=>{const f=result.files.find(f=>f.name===name);if(!f)throw Error('PERMANENT_MODULE_REQUIRED:'+name);return f;};
 const entry=file('index.ts');
 const lease=/const qaLease=qaLeaseHarness\(pool,"[a-f0-9-]{36}"\);/g;
 if((entry.content.match(lease)||[]).length!==1)throw Error('REGISTERED_LEASE_CONTRACT_CHANGED');
 entry.content=entry.content.replace(lease,'const qaLease=qaLeaseHarness(pool);');
 const action='const a=text(b.action';
 if(entry.content.split(action).length!==2)throw Error('REGISTERED_ACTION_CONTRACT_CHANGED');
 entry.content=entry.content.replace(action,"if(typeof b.action!=='string'||!['login','logout','session','profile'].includes(b.action))die('QA_ACTION_DENIED',403);"+action);
 const origins=/const MT_ALLOWED_ORIGINS=new Set\(\[[\s\S]*?\]\);/g;
 if((entry.content.match(origins)||[]).length!==1)throw Error('REGISTERED_ORIGIN_CONTRACT_CHANGED');
 entry.content=entry.content.replace(origins,"const MT_ALLOWED_ORIGINS=new Set(['https://localhost',Deno.env.get('MT_REGISTERED_ORIGIN')]);");
 const boundary='{attest:()=>pool.attest(),activeAuthorized:qaChannel.activeAuthorized}';
 if(entry.content.split(boundary).length!==2)throw Error('REGISTERED_GUARD_BINDING_CHANGED');
 entry.content=entry.content.replace(boundary,"{attest:()=>pool.attest(),activeAuthorized:qaChannel.activeAuthorized,registeredOrigin:Deno.env.get('MT_REGISTERED_ORIGIN')}");
 file('qa-login-lease.mjs').content=fs.readFileSync(new URL('../security/qa-permanent-adapter.mjs',import.meta.url),'utf8')+'\nexport {permanentHarness as qaLeaseHarness};\n';
 file('channel.mjs').content="import {permanentChannel} from './qa-login-lease.mjs';export const createQaChannel=({pool})=>{const origin=Deno.env.get('MT_REGISTERED_ORIGIN');return permanentChannel(pool,{allowedOrigins:origin?['https://localhost',origin]:['https://localhost']})};export const BUCKET='maintrack-security-qa-20261025';export function guardStorageRequest(){throw Error('QA_STORAGE_DISABLED');}\n";
 const guard=file('qa-guard.mjs');for(const field of ['accounts','active_accounts','synthetic_accounts']){
  const before=`x.${field}===4`;if(guard.content.split(before).length!==2)throw Error('REGISTERED_ACTOR_CONTRACT_CHANGED');guard.content=guard.content.replace(before,`x.${field}===2`);
 }
 const signature='activeAuthorized=()=>false}';if(guard.content.split(signature).length!==2)throw Error('REGISTERED_GUARD_ORIGIN_CHANGED');
 guard.content=guard.content.replace(signature,"activeAuthorized=()=>false,registeredOrigin=''}").replace("origin&&origin!=='https://localhost'","origin&&origin!=='https://localhost'&&origin!==registeredOrigin");
 guard.content=guard.content.replace('activeAuthorized?:()=>boolean|Promise<boolean>','activeAuthorized?:()=>boolean|Promise<boolean>,registeredOrigin?:string');
 guard.content=guard.content.replace("'90000001','90000002','90000003','90000004'","'90000001','90000002'");
 result.registeredIdentity={...bundle.registeredIdentity,leaseBackend:'maintrack_qa_permanent',syntheticActorCount:2};
 result.sha256=Object.fromEntries(result.files.map(f=>[f.name,createHash('sha256').update(f.content).digest('hex')]));return result;
}

export function prepareRegisteredGatewayPackage(){
 const source=fs.readFileSync(new URL('../security/vercel-login-entry.mjs',import.meta.url),'utf8');
 const anchor='../../../supabase/functions/maintrack-final-047/login-gateway.mjs';
 if(source.split(anchor).length!==2)throw Error('GATEWAY_API_IMPORT_CONTRACT_CHANGED');
 return [{name:'api/login.mjs',content:source.replace(anchor,'../server/login-gateway.mjs')},
  {name:'server/qa-session-proxy.mjs',content:fs.readFileSync(new URL('../security/qa-session-proxy.mjs',import.meta.url),'utf8')},
  ...['core','inventory'].map(kind=>({name:'api/'+kind+'.mjs',content:"import {createQaSessionProxy} from '../server/qa-session-proxy.mjs';\nexport default async function handler(req,res){try{return await createQaSessionProxy({kind:"+JSON.stringify(kind)+"})(req,res);}catch{res.statusCode=503;res.setHeader('content-type','application/json');res.end('{\"error\":\"QA_SESSION_PROXY_NOT_CONFIGURED\"}');}}\n"})),
  ...['login-gateway.mjs','login-admission.mjs','login-proof.mjs'].map(name=>({name:'server/'+name,content:fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/'+name,import.meta.url),'utf8')}))];
}

export function prepareRegisteredTransportHtml(html,{native=false}={}){
 const anchor='<script type="module" src="secure-assets/login-admission-bootstrap.mjs"></script>';
 if(typeof html!=='string'||html.split(anchor).length!==2||html.includes('qa-session-transport.js'))throw Error('QA_TRANSPORT_HTML_CONTRACT');
 const tag='<script src="secure-assets/qa-session-transport.js"></script>';
 if(html.indexOf('Content-Security-Policy')<0||html.indexOf('Content-Security-Policy')>html.indexOf(anchor))throw Error('QA_TRANSPORT_CSP_ORDER');
 if(native){if(!html.includes('https://qa-gw.example'))throw Error('QA_NATIVE_CSP_GATEWAY_ANCHOR');html=html.replaceAll('https://qa-gw.example','https://maintrack-registered-isolated-qa.vercel.app');}
 return html.replace(anchor,tag+'\n'+anchor);
}

export function composeRegisteredReview({baseDirectory,outputDirectory}){
 const root=path.resolve(import.meta.dirname,'../../..'),base=fs.realpathSync(baseDirectory),out=path.resolve(outputDirectory),audit=path.join(root,'audit-output')+path.sep;
 if(!base.startsWith(audit)||!out.startsWith(audit)||fs.existsSync(out))throw Error('NEW_OWNED_REVIEW_DIRECTORY_REQUIRED');
 const old=JSON.parse(fs.readFileSync(path.join(base,'review-manifest.json'),'utf8'));
 if(old.projectRef!=='szhstrafzkxzstjdcynl'||old.deploy!==false||!old.activationBlocked)throw Error('DISABLED_QA_PARENT_REQUIRED');
 for(const entry of old.files){const target=path.resolve(base,entry.path);if(!target.startsWith(base+path.sep)||fs.lstatSync(target).isSymbolicLink()||createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==entry.sha256)throw Error('PARENT_ASSET_IDENTITY_CHANGED');}
 if(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw Error('CLEAN_LOCAL_COMMIT_REQUIRED');
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const files=fs.readdirSync(path.join(base,'qa-core')).map(name=>({name,content:fs.readFileSync(path.join(base,'qa-core',name),'utf8')}));
 const result=prepareRegisteredPermanentRuntime(prepareRegisteredBundle({projectRef:old.projectRef,deploy:false,files}));
 for(const variant of ['web','native/www'])for(const relative of ['secure-assets/login-admission-bootstrap.mjs','login-admission-public.json'])if(!fs.statSync(path.join(base,variant,relative)).isFile())throw Error('CLIENT_PARENT_CONTRACT_CHANGED');
 fs.cpSync(base,out,{recursive:true,errorOnExist:true});for(const file of result.files)fs.writeFileSync(path.join(out,'qa-core',file.name),file.content);
 for(const file of prepareRegisteredGatewayPackage()){
  const target=path.join(out,'vercel-api',file.name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,file.content);
 }
 const client=fs.readFileSync(new URL('../security/registered-login-client.mjs',import.meta.url));
 for(const variant of ['web','native/www']){
  const dir=path.join(out,variant),assets=path.join(dir,'secure-assets');fs.writeFileSync(path.join(assets,'registered-login-client.mjs'),client);
  fs.copyFileSync(new URL('../security/qa-session-transport.js',import.meta.url),path.join(assets,'qa-session-transport.js'));
  const htmlPath=path.join(dir,'index.html');fs.writeFileSync(htmlPath,prepareRegisteredTransportHtml(fs.readFileSync(htmlPath,'utf8'),{native:variant==='native/www'}));
  const boot=path.join(assets,'login-admission-bootstrap.mjs');let text=fs.readFileSync(boot,'utf8');
  if(variant==='native/www'){
   fs.copyFileSync(new URL('../security/registered-login-native-client.mjs',import.meta.url),path.join(assets,'registered-login-native-client.mjs'));
   text="import {installRegisteredNativeClient} from './registered-login-native-client.mjs';\n"+text+"\nif(!window.Capacitor?.PluginHeaders?.some(p=>p.name==='MainTrackPasskey'))throw Error('NATIVE_PASSKEY_BUILD_REQUIRED');\nconst nativeBridge={create:request=>Capacitor.nativePromise('MainTrackPasskey','create',request),get:request=>Capacitor.nativePromise('MainTrackPasskey','get',request)};\ninstallRegisteredNativeClient({scope:window,bridge:nativeBridge,endpoint:config.gatewayUrl,allowedGatewayHost:config.gatewayHost,enabled:config.registeredIdentity?.enabled===true});\n";
  }else text="import {installRegisteredClient} from './registered-login-client.mjs';\n"+text+"\ninstallRegisteredClient({scope:window,endpoint:config.gatewayUrl,allowedGatewayHost:config.gatewayHost,enabled:config.registeredIdentity?.enabled===true});\n";
  fs.writeFileSync(boot,text);
  const config=path.join(dir,'login-admission-public.json'),value=JSON.parse(fs.readFileSync(config,'utf8'));value.enabled=false;value.registeredIdentity={enabled:false,enrollmentPolicyApproved:false,androidVerified:false};fs.writeFileSync(config,JSON.stringify(value,null,2)+'\n');
 }
 const pages=fs.readdirSync(path.join(out,'web'),{recursive:true}).filter(p=>p.endsWith('.html')).sort().map(name=>({name:name.replaceAll('\\','/'),html:fs.readFileSync(path.join(out,'web',name),'utf8')}));
 fs.writeFileSync(path.join(out,'web/vercel.json'),JSON.stringify(frameHostingConfig(pages),null,2)+'\n');
 const entries=fs.readdirSync(out,{recursive:true}).map(p=>p.replaceAll('\\','/')).filter(p=>p!=='review-manifest.json'&&fs.statSync(path.join(out,p)).isFile()).sort().map(p=>({path:p,sha256:createHash('sha256').update(fs.readFileSync(path.join(out,p))).digest('hex')}));
 const manifest={...old,sourceCommit,sourceTreeClean:true,parentReviewSource:old.sourceCommit,deploy:false,activationBlocked:true,providerConfigured:false,gatewayIngressVerified:false,registeredIdentity:result.registeredIdentity,profile:'LOCAL_REGISTERED_QA_DERIVATIVE_NOT_OPERATIONAL_EQUIVALENT',files:entries};fs.writeFileSync(path.join(out,'review-manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
