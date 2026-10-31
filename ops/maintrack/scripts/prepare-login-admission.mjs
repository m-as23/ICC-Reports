// Offline QA derivative only. Does not install SQL, deploy, configure a provider or touch canonical code.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
export function protectQaLoginSource(source){
 if(source.includes('const admittedLogin='))throw Error('ADMISSION_ALREADY_PROTECTED');
 if(!source.includes('createQaPool')||!source.includes('createQaChannel'))throw Error('EXISTING_QA_ISOLATION_REQUIRED');
 const route="a==='login'?await login(b)";if(source.split(route).length!==2)throw Error('LOGIN_ROUTER_CONTRACT_CHANGED');
 const errors='e instanceof AppError||e instanceof LoginRateError';if(!source.includes(errors))throw Error('LOGIN_ERROR_CONTRACT_CHANGED');
 const prefix=`import {createAdmissionLogin,LoginAdmissionError} from './login-admission.mjs';
if(Deno.env.get('MT_LOGIN_ADMISSION_PROJECT_REF')!=='szhstrafzkxzstjdcynl')throw Error('QA_ADMISSION_PROJECT_CONFIG_REQUIRED');
const admittedLogin=createAdmissionLogin({login,secret:Deno.env.get('MT_LOGIN_TURNSTILE_SECRET'),allowedHostnames:(Deno.env.get('MT_LOGIN_TURNSTILE_HOSTNAMES')||'').split(',').filter(Boolean)});
`;
 return prefix+source.replace(route,"a==='login'?await admittedLogin(b)").replaceAll(errors,errors+'||e instanceof LoginAdmissionError');
}
export function protectClientLoginSource(source){
 if(source.includes('LOGIN_ADMISSION_CLIENT_NOT_READY'))throw Error('ADMISSION_CLIENT_ALREADY_PROTECTED');
 const anchor='async function post(b){';if(source.split(anchor).length!==2)throw Error('CLIENT_POST_CONTRACT_CHANGED');
 return source.replace(anchor,anchor+"if(b.action==='login'){if(typeof window.MainTrackLoginProof!=='function')throw Error('LOGIN_ADMISSION_CLIENT_NOT_READY');b=await window.MainTrackLoginProof(b);}");
}
export function prepareAdmissionBundle(bundle){
 if(bundle?.projectRef!=='szhstrafzkxzstjdcynl'||bundle.deploy!==false||!Array.isArray(bundle.files))throw Error('REVIEWED_OFFLINE_QA_BUNDLE_REQUIRED');
 if(new Set(bundle.files.map(x=>x.name)).size!==bundle.files.length||bundle.files.some(x=>typeof x.name!=='string'||x.name.startsWith('/')||x.name.includes('\\')||x.name.split('/').includes('..')))throw Error('BUNDLE_FILE_IDENTITY');
 const files=bundle.files.map(x=>({...x})),entry=files.find(x=>x.name==='index.ts');if(!entry)throw Error('CORE_ENTRY_REQUIRED');entry.content=protectQaLoginSource(entry.content);
 const base=new URL('../../../supabase/functions/maintrack-final-047/',import.meta.url);
 for(const name of ['login-admission.mjs','login-proof.mjs']){if(files.some(x=>x.name===name))throw Error('ADMISSION_MODULE_COLLISION');files.push({name,content:fs.readFileSync(new URL(name,base),'utf8')});}
 for(const file of files)for(const m of file.content.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
  const dest=path.posix.normalize(path.posix.join(path.posix.dirname(file.name),m[1]));if(dest.startsWith('../')||!files.some(x=>x.name===dest))throw Error('BUNDLE_DEPENDENCY_MISSING');
 }
 return {...bundle,files,deploy:false,admission:{status:'LOCAL_CANDIDATE_NOT_ACTIVATED',mode:'edge-siteverify-before-password',providerConfigured:false,cloudAcceptance:'NOT TESTED',hostnamesRequired:true,noLegacyFallback:true},sha256:Object.fromEntries(files.map(x=>[x.name,createHash('sha256').update(x.content).digest('hex')]))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [input,output]=process.argv.slice(2);if(!input||!output||fs.existsSync(output))throw Error('NEW_OUTPUT_AND_OFFLINE_INPUT_REQUIRED');const result=prepareAdmissionBundle(JSON.parse(fs.readFileSync(input,'utf8')));fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({deploy:false,projectRef:result.projectRef,files:result.files.length,admission:result.admission}));
}
