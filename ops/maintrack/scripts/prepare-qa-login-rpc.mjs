// Offline bundle preparation only: no network, deployment or credential access.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {applyQaLoginLease} from '../security/qa-login-lease.mjs';

/** Migrate legacy QA snapshot declarations without replacing its isolation/runtime code. */
export function typeCoreSource(source){
 const edits=[
 [
  "function validEmployeeCode(value)",
  "function validEmployeeCode(value:unknown):value is string"
 ],
 [
  "function validNewPassword(value)",
  "function validNewPassword(value:unknown):value is string"
 ],
 [
  "function temporaryPassword(randomBytes)",
  "function temporaryPassword(randomBytes:(size:number)=>{toString(encoding:string):string})"
 ],
 [
  "const sha=v=>",
  "const sha=(v:string)=>"
 ],
 [
  "const response=(o,",
  "const response=(o:unknown,"
 ],
 [
  "constructor(code,status=400){super(code);this.code=code;this.status=status;}",
  "constructor(public code:string,public status=400){super(code);}"
 ],
 [
  "const die=(code,status)=>",
  "const die=(code:string,status=400):never=>"
 ],
 [
  "const row=async(q,p=[])",
  "const row=async(q:string,p:unknown[]=[])"
 ],
 [
  "const first=async(c,q,p=[])",
  "const first=async(c:SqlConnection,q:string,p:unknown[]=[])"
 ],
 [
  "async function transaction(fn)",
  "async function transaction<T>(fn:(c:SqlConnection)=>Promise<T>)"
 ],
 [
  "const text=(v,min,max,code)=>",
  "const text=(v:unknown,min:number,max:number,code:string)=>"
 ],
 [
  "const uuid=v=>",
  "const uuid=(v:unknown)=>"
 ],
 [
  "const iso=v=>",
  "const iso=(v:unknown)=>"
 ],
 [
  "const day=v=>",
  "const day=(v:unknown)=>"
 ],
 [
  "const clock=v=>",
  "const clock=(v:unknown)=>"
 ],
 [
  "const mins=v=>",
  "const mins=(v:unknown)=>"
 ],
 [
  "const span=(a,b)=>",
  "const span=(a:number|null,b:number|null)=>"
 ],
 [
  "const round=n=>",
  "const round=(n:number)=>"
 ],
 [
  "const woid=n=>",
  "const woid=(n:unknown)=>"
 ],
 [
  "const rights={",
  "const rights:Record<string,string[]>={"
 ],
 [
  "const permit=(u,p)=>",
  "const permit=(u:Actor,p:string)=>"
 ],
 [
  "async function issue(u,c=pool)",
  "async function issue(u:SessionUser,c:SqlConnection=pool)"
 ],
 [
  "async function login(b,source)",
  "async function login(b:RequestBody,source?:string)"
 ],
 [
  "async c=>{\n const blocked",
  "async (c:SqlConnection)=>{\n const blocked"
 ],
 [
  "async function revokeCurrentSession(req)",
  "async function revokeCurrentSession(req:Request)"
 ],
 [
  "async function auth(req)",
  "async function auth(req:Request)"
 ],
 [
  "function reportInput(b)",
  "function reportInput(b:RequestBody)"
 ],
 [
  "async function readSubstituteMinutes(c,userId)",
  "async function readSubstituteMinutes(c:SqlConnection,userId:unknown)"
 ],
 [
  "function leaveView(r)",
  "function leaveView(r:LeaveRow)"
 ],
 [
  "new Date(end+'T00:00:00Z')-new Date(start+'T00:00:00Z')",
  "new Date(end+'T00:00:00Z').getTime()-new Date(start+'T00:00:00Z').getTime()"
 ],
 [
  "const names={sections:",
  "const names:Record<string,string>={sections:"
 ],
 [
  "if(e.code==='23505')",
  "if(e instanceof Error&&'code' in e&&e.code==='23505')"
 ],
 [
  "const cmmsBool=v=>",
  "const cmmsBool=(v:unknown)=>"
 ],
 [
  "const cmmsPositive=(v,name)=>",
  "const cmmsPositive=(v:unknown,name:string)=>"
 ],
 [
  "const cmmsSource=(b)=>",
  "const cmmsSource=(b:RequestBody)=>"
 ],
 [
  "const cmmsLimits=(b)=>",
  "const cmmsLimits=(b:RequestBody)=>"
 ],
 [
  "function cmmsReport(row)",
  "function cmmsReport(row:CmmsRow)"
 ],
 [
  "const categories={},components={}",
  "const categories:Record<string,number>={},components:Record<string,number>={}"
 ],
 [
  "const cmmsNotes=(value,min,max,code)=>",
  "const cmmsNotes=(value:unknown,min:number,max:number,code:string)=>"
 ],
 [
  "const otView=r=>",
  "const otView=(r:OvertimeRow)=>"
 ],
 [
  "function overtimeOwnerFilters(b)",
  "function overtimeOwnerFilters(b:RequestBody)"
 ],
 [
  "query:(sql,args)=>",
  "query:(sql:string,args:unknown[])=>"
 ],
 [
  "function overtimeEndLocal(workDate,from,to)",
  "function overtimeEndLocal(workDate:string,from:string,to:string)"
 ],
 [
  "function validateCompletedOvertime(workDate,from,to)",
  "function validateCompletedOvertime(workDate:string,from:string,to:string)"
 ],
 [
  "body:any",
  "body:unknown"
 ],
 [
  "const b=await req.json();",
  "const b:unknown=await req.json();"
 ],
 [
  "if(!b||typeof b!=='object'||Array.isArray(b))die('INVALID_PAYLOAD');",
  "if(!isRequestBody(b))die('INVALID_PAYLOAD');"
 ],
 [
  "subMinutes-beforeSub",
  "Number(subMinutes)-Number(beforeSub)"
 ],
 [
  "subMinutes===null?undefined:round(subMinutes/60)",
  "subMinutes===null?undefined:round(subMinutes/60)"
 ],
 [
  "toString(encoding:string)",
  "toString(encoding:'hex')"
 ],
 [
  "const die=(code:string,status=400):never=>",
  "const die:(code:string,status?:number)=>never=(code,status=400)=>"
 ],
 [
  "const pool=createQaPool",
  "const pool:QaCorePool=createQaPool"
 ],
 [
  "envGet:k=>",
  "envGet:(k:string)=>"
 ],
 [
  "async function boundedJson(req)",
  "async function boundedJson(req:Request)"
 ],
 [
  "const subMinutes=hasSub?Math.round(subHours*60):null;",
  "const subMinutes=subHours===null?null:Math.round(subHours*60);"
 ],
 [
  "if(hasSub&&(",
  "if(subHours!==null&&subMinutes!==null&&("
 ],
 [
  "items:pendingItems.concat(storedItems).slice(0,5)",
  "items:[...pendingItems,...storedItems].slice(0,5)"
 ]
];
 for(const [from,to] of edits)source=source.replaceAll(from,to);
 source=source.replace(/async function (\w+)\(u,b/g,'async function $1(u:Actor,b:RequestBody').replace(/async function (\w+)\(u\)/g,'async function $1(u:Actor)');
 source=source.replaceAll('async req=>','async (req:Request)=>').replaceAll('async function boundedJson(req:Request){','async function boundedJson(req:Request):Promise<unknown>{').replaceAll('async function issue(u:SessionUser,c:SqlConnection=pool){','async function issue(input:unknown,c:SqlConnection=pool){const u=sessionUser(input);').replaceAll("if(!u)die('AUTH',401);return u;","if(!u)die('AUTH',401);return actor(u);");
 source=source.replaceAll('const add=(map,key,hours)=>','const add=(map:Map<string,Aggregate>,key:string,hours:number|null)=>').replaceAll('const tab=mp=>','const tab=(mp:Map<string,Aggregate>)=>').replaceAll('const add=(map,name,hours)=>','const add=(map:Map<string,Aggregate>,name:string,hours:number|null)=>').replaceAll('const sorted=map=>','const sorted=(map:Map<string,Aggregate>)=>');
 source=source.replaceAll('map:Map<string,Aggregate>,name:string,hours:number|null',"map:Map<string,Omit<Aggregate,'complete'>>,name:string,hours:number|null").replaceAll('const sorted=(map:Map<string,Aggregate>)',"const sorted=(map:Map<string,Omit<Aggregate,'complete'>>)");
 source=source.replaceAll('catch(e){if(/^(INVALID_YEAR','catch(e){if(e instanceof Error&&/^(INVALID_YEAR');
 source=source.replaceAll("['description','solution','spareParts','status','category'].every(key=>", "(['description','solution','spareParts','status','category'] as const).every(key=>");
 source=source.replaceAll('mins(f.t2)-mins(f.t1)','requiredMinutes(f.t2)-requiredMinutes(f.t1)').replaceAll('mins(f.t3)-mins(f.t2)','requiredMinutes(f.t3)-requiredMinutes(f.t2)').replaceAll('mins(to)-mins(from)','requiredMinutes(to)-requiredMinutes(from)').replaceAll('mins(to)<=mins(from)','requiredMinutes(to)<=requiredMinutes(from)');
 if(!source.includes("from './core-types.ts'"))source="import {isRequestBody,requiredMinutes,sessionUser,actor,type QaCorePool,type CorePool,type Actor,type SessionUser,type SqlConnection,type RequestBody,type Aggregate,type LeaveRow,type OvertimeRow,type CmmsRow} from './core-types.ts';\n"+source;
 return source;
}

export function prepareQaLoginRpc(baseline,candidate,runId,adapter,budget){
 if(baseline.slug!=='maintrack-security-qa-final'||!Array.isArray(baseline.files))throw Error('QA_BASELINE_REQUIRED');
 const files=baseline.files.map(x=>({...x})),entry=files.find(x=>x.name==='index.ts');if(!entry||!files.find(x=>x.name==='channel.mjs')||!files.find(x=>x.name==='qa-guard.mjs'))throw Error('QA_ISOLATION_MODULES_REQUIRED');
 if(!entry.content.includes('createQaPool')||!entry.content.includes('createQaChannel')||!files.some(x=>x.content.includes('szhstrafzkxzstjdcynl')))throw Error('QA_PROJECT_BINDING_REQUIRED');
 const extract=(source,name)=>{const a=source.indexOf('async function '+name+'('),b=source.indexOf('\nasync function ',a+1);if(a<0||b<0)throw Error('FUNCTION_CONTRACT_CHANGED');return source.slice(a,b);};
 for(const name of ['issue','login','revokeCurrentSession']){if(name==='revokeCurrentSession'&&!entry.content.includes('async function revokeCurrentSession(')){if(!entry.content.includes('async function auth('))throw Error('AUTH_CONTRACT_CHANGED');entry.content=entry.content.replace('async function auth(',extract(candidate,name)+'\nasync function auth(');}else entry.content=entry.content.replace(extract(entry.content,name),extract(candidate,name));}
 const route="a==='login'?await login(b):await dispatch(await auth(req),b)";if(entry.content.split(route).length!==2)throw Error('QA_ROUTER_CONTRACT_CHANGED');entry.content=entry.content.replace(route,"a==='login'?await login(b):a==='logout'?await revokeCurrentSession(req):await dispatch(await auth(req),b)");
 entry.content="import {withLoginBudget,LoginRateError} from './login-rate-limit.mjs';\n"+entry.content;
 if(!entry.content.includes('instanceof LoginRateError'))entry.content=entry.content.replace('e instanceof AppError','e instanceof AppError||e instanceof LoginRateError');
 entry.content=typeCoreSource(applyQaLoginLease(entry.content,runId));
 files.push({name:'core-types.ts',content:fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/core-types.ts',import.meta.url),'utf8')});
 files.push({name:'qa-login-lease.mjs',content:adapter.replace("../../../supabase/functions/maintrack-final-047/login-rate-limit.mjs","./login-rate-limit.mjs")},{name:'login-rate-limit.mjs',content:budget});
 const guard=files.find(x=>x.name==='qa-guard.mjs');if(guard)guard.content=guard.content.replace('export function withQaIsolation(', '/** @param {(request:Request)=>Response|Promise<Response>} handler @param {{attest?:()=>Promise<Record<string,unknown>>,activeAuthorized?:()=>boolean|Promise<boolean>}} [options] */\nexport function withQaIsolation(');
 const hash=x=>createHash('sha256').update(x).digest('hex');
 return {deploy:false,projectRef:'szhstrafzkxzstjdcynl',runId,baselineVersion:baseline.version,baselineSourceSha256:hash(JSON.stringify(baseline.files)),sqlMustBeInstalledAndAttestedTogether:true,files,sha256:Object.fromEntries(files.map(x=>[x.name,hash(x.content)]))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [baselineFile,runId,out]=process.argv.slice(2);if(!baselineFile||!runId||!out)throw Error('BASELINE_RUN_OUTPUT_REQUIRED');let baseline=JSON.parse(fs.readFileSync(baselineFile,'utf8'));if(baseline.content)baseline=JSON.parse(baseline.content.find(x=>x.type==='text').text);
 const root=path.resolve(import.meta.dirname,'../../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const result=prepareQaLoginRpc(baseline,read('supabase/functions/maintrack-final-047/index.ts'),runId,read('ops/maintrack/security/qa-login-lease.mjs'),read('supabase/functions/maintrack-final-047/login-rate-limit.mjs'));
 result.installSql=read('ops/maintrack/security/qa-login-rpc.sql');result.rollbackSql=read('ops/maintrack/security/qa-login-rpc.rollback.sql');fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log('OFFLINE_QA_BUNDLE_ONLY');
}
