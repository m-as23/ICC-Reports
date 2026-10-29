// Offline bundle preparation only: no network, deployment or credential access.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {applyQaLoginLease} from '../security/qa-login-lease.mjs';
export function prepareQaLoginRpc(baseline,candidate,runId,adapter,budget){
 if(baseline.slug!=='maintrack-security-qa-final'||!Array.isArray(baseline.files))throw Error('QA_BASELINE_REQUIRED');
 const files=baseline.files.map(x=>({...x})),entry=files.find(x=>x.name==='index.ts');if(!entry||!files.find(x=>x.name==='channel.mjs')||!files.find(x=>x.name==='qa-guard.mjs'))throw Error('QA_ISOLATION_MODULES_REQUIRED');
 if(!entry.content.includes('createQaPool')||!entry.content.includes('createQaChannel')||!files.some(x=>x.content.includes('szhstrafzkxzstjdcynl')))throw Error('QA_PROJECT_BINDING_REQUIRED');
 const extract=(source,name)=>{const a=source.indexOf('async function '+name+'('),b=source.indexOf('\nasync function ',a+1);if(a<0||b<0)throw Error('FUNCTION_CONTRACT_CHANGED');return source.slice(a,b);};
 for(const name of ['issue','login','revokeCurrentSession']){if(name==='revokeCurrentSession'&&!entry.content.includes('async function revokeCurrentSession(')){if(!entry.content.includes('async function auth('))throw Error('AUTH_CONTRACT_CHANGED');entry.content=entry.content.replace('async function auth(',extract(candidate,name)+'\nasync function auth(');}else entry.content=entry.content.replace(extract(entry.content,name),extract(candidate,name));}
 const route="a==='login'?await login(b):await dispatch(await auth(req),b)";if(entry.content.split(route).length!==2)throw Error('QA_ROUTER_CONTRACT_CHANGED');entry.content=entry.content.replace(route,"a==='login'?await login(b):a==='logout'?await revokeCurrentSession(req):await dispatch(await auth(req),b)");
 entry.content="import {withLoginBudget,LoginRateError} from './login-rate-limit.mjs';\n"+entry.content;
 if(!entry.content.includes('instanceof LoginRateError'))entry.content=entry.content.replace('e instanceof AppError','e instanceof AppError||e instanceof LoginRateError');
 entry.content=applyQaLoginLease(entry.content,runId);
 files.push({name:'qa-login-lease.mjs',content:adapter.replace("../../../supabase/functions/maintrack-final-047/login-rate-limit.mjs","./login-rate-limit.mjs")},{name:'login-rate-limit.mjs',content:budget});
 const hash=x=>createHash('sha256').update(x).digest('hex');
 return {deploy:false,projectRef:'szhstrafzkxzstjdcynl',runId,baselineVersion:baseline.version,baselineSourceSha256:hash(JSON.stringify(baseline.files)),sqlMustBeInstalledAndAttestedTogether:true,files,sha256:Object.fromEntries(files.map(x=>[x.name,hash(x.content)]))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [baselineFile,runId,out]=process.argv.slice(2);if(!baselineFile||!runId||!out)throw Error('BASELINE_RUN_OUTPUT_REQUIRED');let baseline=JSON.parse(fs.readFileSync(baselineFile,'utf8'));if(baseline.content)baseline=JSON.parse(baseline.content.find(x=>x.type==='text').text);
 const root=path.resolve(import.meta.dirname,'../../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const result=prepareQaLoginRpc(baseline,read('supabase/functions/maintrack-final-047/index.ts'),runId,read('ops/maintrack/security/qa-login-lease.mjs'),read('supabase/functions/maintrack-final-047/login-rate-limit.mjs'));
 result.installSql=read('ops/maintrack/security/qa-login-rpc.sql');result.rollbackSql=read('ops/maintrack/security/qa-login-rpc.rollback.sql');fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log('OFFLINE_QA_BUNDLE_ONLY');
}
