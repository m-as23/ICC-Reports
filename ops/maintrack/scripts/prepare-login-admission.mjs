// Offline QA derivative only. Does not install SQL, deploy, configure a provider or touch canonical code.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {prepareQaLoginRpc} from './prepare-qa-login-rpc.mjs';
import {frameHeaderRules} from './security-client-overlay.mjs';
export function protectQaLoginSource(source){
 if(source.includes('const admittedLogin='))throw Error('ADMISSION_ALREADY_PROTECTED');
 if(!source.includes('createQaPool')||!source.includes('createQaChannel'))throw Error('EXISTING_QA_ISOLATION_REQUIRED');
 const route="a==='login'?await login(b)";if(source.split(route).length!==2)throw Error('LOGIN_ROUTER_CONTRACT_CHANGED');
 const errors='e instanceof AppError||e instanceof LoginRateError';if(!source.includes(errors))throw Error('LOGIN_ERROR_CONTRACT_CHANGED');
 const start='async function login(b,source){',end='return issue(u,c);\n });';
 if(source.split(start).length!==2||source.split(end).length!==2)throw Error('QA_LOGIN_BUDGET_CONTRACT_CHANGED');
 source=source.replace(start,"async function login(b,source,admissionPolicy:{kind:'verified-gateway-v1'}){").replace(end,'return issue(u,c);\n },admissionPolicy);');
 const prefix=`import {createAdmissionLogin,LoginAdmissionError} from './login-admission.mjs';
import {createGatewayAdmissionLogin} from './login-gateway.mjs';
if(Deno.env.get('MT_LOGIN_ADMISSION_PROJECT_REF')!=='szhstrafzkxzstjdcynl')throw Error('QA_ADMISSION_PROJECT_CONFIG_REQUIRED');
const admittedLogin=createGatewayAdmissionLogin({secret:Deno.env.get('MT_LOGIN_GATEWAY_SECRET'),admissionLogin:createAdmissionLogin({login:(body,source)=>login(body,source,{kind:'verified-gateway-v1'}),secret:Deno.env.get('MT_LOGIN_TURNSTILE_SECRET'),allowedHostnames:(Deno.env.get('MT_LOGIN_TURNSTILE_HOSTNAMES')||'').split(',').filter(Boolean)})});
`;
 return prefix+source.replace(route,"a==='login'?await admittedLogin(req,b)").replaceAll(errors,errors+'||e instanceof LoginAdmissionError');
}
export function protectClientLoginSource(source){
 if(source.includes('LOGIN_ADMISSION_CLIENT_NOT_READY'))throw Error('ADMISSION_CLIENT_ALREADY_PROTECTED');
 const anchor='async function post(b){';if(source.split(anchor).length!==2)throw Error('CLIENT_POST_CONTRACT_CHANGED');
 return source.replace(anchor,anchor+"if(b.action==='login'){if(typeof window.MainTrackGatewayLogin!=='function')throw Error('LOGIN_ADMISSION_CLIENT_NOT_READY');return await window.MainTrackGatewayLogin(b);}");
}
export function prepareAdmissionClientFiles(source){
 const proof=fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/login-proof.mjs',import.meta.url),'utf8');
 const provider=fs.readFileSync(new URL('../security/login-turnstile-client.mjs',import.meta.url),'utf8').replace("../../../supabase/functions/maintrack-final-047/login-proof.mjs","./login-proof.mjs");
 return [{name:'secure-assets/index-inline-1.js',content:protectClientLoginSource(source)},{name:'secure-assets/login-proof.mjs',content:proof},{name:'secure-assets/login-turnstile-client.mjs',content:provider}];
}
export function admissionClientBootstrap(){
 return `import {installLoginProofClient} from './login-turnstile-client.mjs';
// Missing public config blocks Login locally before any gateway or provider request.
const response=await fetch('./login-admission-public.json',{cache:'no-store'});const config=await response.json();
if(config.enabled!==true||!config.sitekey||!config.gatewayUrl||!config.gatewayHost)throw Error('QA_LOGIN_ADMISSION_PUBLIC_CONFIG_REQUIRED');
const gatewayOrigin=new URL(config.gatewayUrl).origin;
const csp=document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content||'';
const connection=csp.split(';').find(x=>x.trim().startsWith('connect-src '))||'';
if(!(connection.split(/\\s+/).includes(gatewayOrigin)||(connection.includes("'self'")&&location.origin===gatewayOrigin)))throw Error('QA_GATEWAY_CSP_REBUILD_REQUIRED');

const button=document.getElementById('lgo');if(!button)throw Error('QA_LOGIN_MOUNT_REQUIRED');
const element=document.createElement('div');element.id='maintrack-login-proof';button.before(element);
await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;const timer=setTimeout(()=>{script.remove();reject(Error('LOGIN_PROVIDER_UNAVAILABLE'));},15000);script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('LOGIN_PROVIDER_UNAVAILABLE'));};document.head.append(script);});
installLoginProofClient({scope:window,widget:window.turnstile,element,sitekey:config.sitekey,gatewayUrl:config.gatewayUrl,allowedGatewayHost:config.gatewayHost});
`;
}
export function prepareAdmissionHtml(html,gatewayOrigin){
 if(html.includes('login-admission-bootstrap.mjs'))throw Error('ADMISSION_HTML_ALREADY_PREPARED');
 const match=html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);if(!match)throw Error('ORIGINAL_CSP_REQUIRED');
 let csp=match[1];const allow=(name,fallback)=>{
  const directive=new RegExp('(^|;\\s*)'+name+'(?=\\s|;|$)([^;]*)(;|$)');
  if(directive.test(csp))csp=csp.replace(directive,(full,start,value,end)=>{if(value.includes("'none'"))throw Error('CSP_PROVIDER_REVIEW_REQUIRED');return start+name+value+(value.includes('https://challenges.cloudflare.com')?'':' https://challenges.cloudflare.com')+end;});
  else csp+='; '+name+' '+fallback+' https://challenges.cloudflare.com;';
 };allow('script-src',"'self'");allow('frame-src',"'self'");
 if(gatewayOrigin!==undefined){let url;try{url=new URL(gatewayOrigin);}catch{throw Error('QA_GATEWAY_ORIGIN_REQUIRED');}if(url.protocol!=='https:'||url.origin!==gatewayOrigin||url.username||url.password)throw Error('QA_GATEWAY_ORIGIN_REQUIRED');
  const re=/(^|;\s*)connect-src(?=\s|;|$)([^;]*)(;|$)/;
  if(re.test(csp))csp=csp.replace(re,(all,start,value,end)=>{if(value.includes("'none'"))throw Error('CSP_PROVIDER_REVIEW_REQUIRED');return start+'connect-src'+value+(value.split(/\s+/).includes(gatewayOrigin)?'':' '+gatewayOrigin)+end;});else csp+="; connect-src 'self' "+gatewayOrigin+';';
 }

 const out=html.replace(match[0],match[0].replace(match[1],csp));
 return out.replace('</head>','<script type="module" src="secure-assets/login-admission-bootstrap.mjs"></script>\n</head>');
}
export function prepareAdmissionBundle(bundle){
 if(bundle?.projectRef!=='szhstrafzkxzstjdcynl'||bundle.deploy!==false||!Array.isArray(bundle.files))throw Error('REVIEWED_OFFLINE_QA_BUNDLE_REQUIRED');
 if(new Set(bundle.files.map(x=>x.name)).size!==bundle.files.length||bundle.files.some(x=>typeof x.name!=='string'||x.name.startsWith('/')||x.name.includes('\\')||x.name.split('/').includes('..')))throw Error('BUNDLE_FILE_IDENTITY');
 const files=bundle.files.map(x=>({...x})),entry=files.find(x=>x.name==='index.ts');if(!entry)throw Error('CORE_ENTRY_REQUIRED');entry.content=protectQaLoginSource(entry.content);
 const base=new URL('../../../supabase/functions/maintrack-final-047/',import.meta.url);
 for(const name of ['login-admission.mjs','login-proof.mjs','login-gateway.mjs']){if(files.some(x=>x.name===name))throw Error('ADMISSION_MODULE_COLLISION');files.push({name,content:fs.readFileSync(new URL(name,base),'utf8')});}
 for(const file of files)for(const m of file.content.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
  const dest=path.posix.normalize(path.posix.join(path.posix.dirname(file.name),m[1]));if(dest.startsWith('../')||!files.some(x=>x.name===dest))throw Error('BUNDLE_DEPENDENCY_MISSING');
 }
 return {...bundle,files,deploy:false,admission:{status:'LOCAL_CANDIDATE_NOT_ACTIVATED',mode:'signed-vercel-source-and-siteverify-before-password',providerConfigured:false,cloudAcceptance:'NOT TESTED',hostnamesRequired:true,noLegacyFallback:true},sha256:Object.fromEntries(files.map(x=>[x.name,createHash('sha256').update(x.content).digest('hex')]))};
}
export function buildAdmissionReview({baselineDirectory,canonicalDirectory,outputDirectory}){
 const root=path.resolve(import.meta.dirname,'../../..'),out=path.resolve(outputDirectory),canonical=path.resolve(canonicalDirectory);
 if(!out.startsWith(path.join(root,'audit-output')+path.sep)||fs.existsSync(out))throw Error('NEW_LOCAL_REVIEW_DIRECTORY_REQUIRED');
 const baselinePath=path.resolve(baselineDirectory);if(path.basename(baselinePath)!=='maintrack-security-qa-final')throw Error('QA_CORE_SNAPSHOT_DIRECTORY_REQUIRED');
 const identity=JSON.parse(fs.readFileSync(path.join(canonical,'security-provenance.json'),'utf8'));if(identity.canonicalLocksModified!==false)throw Error('CANONICAL_BASELINE_REQUIRED');
 const allowed=['index.ts','deno.json','channel.mjs','qa-guard.mjs','ledger-service.mjs'];
 if(fs.readdirSync(baselinePath).some(name=>!allowed.includes(name))||allowed.some(name=>!fs.lstatSync(path.join(baselinePath,name)).isFile()||fs.lstatSync(path.join(baselinePath,name)).isSymbolicLink()))throw Error('QA_SNAPSHOT_FILE_SCOPE_REQUIRED');
 const read=p=>fs.readFileSync(path.join(root,p),'utf8'),files=allowed.map(name=>({name,content:fs.readFileSync(path.join(baselinePath,name),'utf8')}));
 const base=prepareQaLoginRpc({slug:'maintrack-security-qa-final',version:10,files},read('supabase/functions/maintrack-final-047/index.ts'),'11111111-2222-4333-8444-555555555555',read('ops/maintrack/security/qa-login-lease.mjs'),read('supabase/functions/maintrack-final-047/login-rate-limit.mjs'));
 const result=prepareAdmissionBundle(base);fs.mkdirSync(out,{recursive:true});
 const backend=path.join(out,'qa-core');fs.mkdirSync(backend);for(const f of result.files)fs.writeFileSync(path.join(backend,f.name),f.content);
 const publicConfig={enabled:false,sitekey:null,gatewayUrl:null,gatewayHost:null};
 for(const variant of ['web','native/www']){
  const target=path.join(out,variant);fs.cpSync(path.join(canonical,variant),target,{recursive:true,errorOnExist:true});
  for(const relative of fs.readdirSync(target,{recursive:true})){
   const file=path.join(target,relative);if(!fs.statSync(file).isFile()||! /\.(?:html|js|mjs|json|css|webmanifest)$/.test(relative))continue;
   const text=fs.readFileSync(file,'utf8').replaceAll('tdnkeskczcsukcujwinu','szhstrafzkxzstjdcynl').replaceAll('maintrack-inventory-final-047','maintrack-security-qa-inventory').replaceAll('maintrack-final-047','maintrack-security-qa-final');fs.writeFileSync(file,text);
  }
  for(const f of prepareAdmissionClientFiles(fs.readFileSync(path.join(target,'secure-assets/index-inline-1.js'),'utf8')))fs.writeFileSync(path.join(target,f.name),f.content);
  fs.writeFileSync(path.join(target,'secure-assets/login-admission-bootstrap.mjs'),admissionClientBootstrap());fs.writeFileSync(path.join(target,'login-admission-public.json'),JSON.stringify(publicConfig,null,2)+'\n');
  const html=prepareAdmissionHtml(fs.readFileSync(path.join(target,'index.html'),'utf8'),'https://qa-gw.example');fs.writeFileSync(path.join(target,'index.html'),html);
 }
 const pages=fs.readdirSync(path.join(out,'web'),{recursive:true}).filter(p=>p.endsWith('.html')).sort().map(name=>({name:name.replaceAll('\\','/'),html:fs.readFileSync(path.join(out,'web',name),'utf8')}));
 fs.writeFileSync(path.join(out,'web/vercel.json'),JSON.stringify({headers:frameHeaderRules(pages)},null,2)+'\n');
 const server=path.join(out,'vercel-api/server'),api=path.join(out,'vercel-api/api');fs.mkdirSync(server,{recursive:true});fs.mkdirSync(api,{recursive:true});
 for(const name of ['login-gateway.mjs','login-admission.mjs','login-proof.mjs'])fs.writeFileSync(path.join(server,name),read('supabase/functions/maintrack-final-047/'+name));
 fs.writeFileSync(path.join(api,'login.mjs'),read('ops/maintrack/security/vercel-login-entry.mjs').replace('../../../supabase/functions/maintrack-final-047/login-gateway.mjs','../server/login-gateway.mjs'));
 fs.writeFileSync(path.join(out,'vercel-api/package.json'),JSON.stringify({private:true,type:'module',engines:{node:'22.x'}},null,2)+'\n');
 const hashes=[];for(const relative of fs.readdirSync(out,{recursive:true}).sort()){
  const file=path.join(out,relative);if(!fs.statSync(file).isFile())continue;const bytes=fs.readFileSync(file);
  if(bytes.includes(Buffer.from('tdnkeskczcsukcujwinu')))throw Error('OPERATIONAL_API_REF_IN_QA_REVIEW');
  if(/\.(?:jks|keystore|p12|pfx)$|(^|[\\/])\.env/.test(relative)||bytes.includes(Buffer.from('-----BEGIN PRIVATE KEY-----')))throw Error('PRIVATE_MATERIAL_IN_REVIEW');
  hashes.push({path:relative.replaceAll('\\','/'),sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),clean=!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim();
 const manifest={sourceCommit,sourceTreeClean:clean,canonicalParent:identity.sourceCommit,projectRef:result.projectRef,deploy:false,activationBlocked:true,providerConfigured:false,gatewayIngressVerified:false,lease:'PLACEHOLDER_NOT_ARMED',profile:'QA_ONLY_NOT_OPERATIONAL_EQUIVALENT',baselineCoreVersion:10,files:hashes,remaining:['Real QA provider/widget and exact host configuration','Shared QA gateway key via protected server settings only','Live Vercel header-overwrite attestation and Edge pathname attestation','Reviewed private RPC actor scope and independent stop/rollback','Native network allowlist/OTA isolation and real provider compatibility','Bounded QA acceptance; no valid-token/NAT fairness claim from mocks']};
 fs.writeFileSync(path.join(out,'review-manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]==='--compose-review'){
  const [baselineDirectory,canonicalDirectory,outputDirectory]=process.argv.slice(3);if(!baselineDirectory||!canonicalDirectory||!outputDirectory)throw Error('COMPOSE_PATHS_REQUIRED');const result=buildAdmissionReview({baselineDirectory,canonicalDirectory,outputDirectory});console.log(JSON.stringify({sourceCommit:result.sourceCommit,projectRef:result.projectRef,deploy:false,activationBlocked:true,files:result.files.length}));
 }else{
  const [input,output]=process.argv.slice(2);if(!input||!output||fs.existsSync(output))throw Error('NEW_OUTPUT_AND_OFFLINE_INPUT_REQUIRED');const result=prepareAdmissionBundle(JSON.parse(fs.readFileSync(input,'utf8')));fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({deploy:false,projectRef:result.projectRef,files:result.files.length,admission:result.admission}));
 }
}
