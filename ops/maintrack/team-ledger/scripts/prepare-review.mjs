// Separate static review only: synthetic data, closed transport, no live sessions/services.
import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import {createTeamLedger} from '../backend/ledger-service.mjs';
const root=path.resolve(import.meta.dirname,'../../../..'),require=createRequire(process.env.LEDGER_PG_PACKAGE||'/tmp/maintrack-ledger-pg/package.json');const {PGlite}=require('@electric-sql/pglite');
export async function prepareReview(target){
 await fs.mkdir(path.dirname(target),{recursive:true});await fs.access(target).then(()=>{throw Error('OUTPUT_ALREADY_EXISTS')},e=>{if(e.code!=='ENOENT')throw e});await fs.cp(path.join(root,'web/maintrack/public'),target,{recursive:true});const db=new PGlite();let data;
 try{
  await db.exec(await fs.readFile(path.join(root,'ops/maintrack/team-ledger/test/schema.sql'),'utf8'));
  await db.exec("INSERT INTO mt_users(id,employee_code,name,role,active,department,job_title) SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'QA-'||n,'موظف اختباري '||n,'technician',true,'اختبار','فني صيانة' FROM generate_series(4,12) n;");
  const service=createTeamLedger({query:db.query.bind(db)}),owner={id:'00000000-0000-0000-0000-000000000001',role:'owner',active:true},years={};const current=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Africa/Cairo'}).format(new Date()));
  for(let year=2020;year<=current;year++){
   const team=await service.team(owner,{year}),details={};for(const p of team.items){details[p.profile.code]={};for(const kind of ['annual','sub','cash'])details[p.profile.code][kind]=await service.detail(owner,{employeeCode:p.profile.code,year,kind});}
   years[year]={team,details};
  }
  data={years,account:await service.account(owner)};
 }finally{await db.close()}
 const host=`// TEST-ONLY SYNTHETIC TRANSPORT. Never copied into canonical assets or the real APK.
(function(){const data=${JSON.stringify(data)};const fake={code:'QA-OWNER',name:'مالك المعاينة',role:'owner',token:'f'.repeat(64)};sessionStorage.setItem('s',JSON.stringify(fake));const originalFetch=window.fetch.bind(window);
window.fetch=async(input,options)=>{const url=String(input?.url||input);if(!url.includes('supabase.co')){if(new URL(url,location.href).origin===location.origin)return originalFetch(input,options);throw Error('EXTERNAL_NETWORK_DISABLED');}const b=JSON.parse(options?.body||'{}');let answer;
if(b.action==='session')answer={ok:true,role:'owner',name:fake.name,must:false};
else if(b.action==='init')answer={id:'QA-1',role:'owner',sections:[],status:[],cats:[],machines:{},parts:{},technicians:[]};
else if(b.action==='dashboard')answer={count:0,hours:0,topMachines:[],recent:[],sectionHours:[],categories:[],technicians:[]};
else if(['notifications','leaveInbox','overtimeInbox','leaveMine','overtimeMine'].includes(b.action))answer={items:[],pendingCount:0,hasMore:false};
else if(b.action==='adminUsers')answer={items:data.years[${new Date().getFullYear()}].team.items.map(p=>({...p.profile,active:p.active,leaveBalance:p.balance.annualAvailableDays,substituteAvailableHours:p.balance.substituteAvailableDays*8}))};
else if(b.action==='accountSummary')answer=data.account;
else if(b.action==='profile')answer={profile:data.account.profile};
else if(b.action==='teamBalances'){const y=data.years[b.year];if(!y)answer={error:'YEAR_NOT_IN_PREVIEW'};else{const q=String(b.query||'').toLowerCase(),rows=y.team.items.filter(p=>(p.profile.code+' '+p.profile.name).toLowerCase().includes(q));answer={...y.team,total:rows.length,items:rows.slice(b.offset||0,(b.offset||0)+(b.limit||50)),hasMore:false};}}
else if(b.action==='teamBalanceDetail')answer=data.years[b.year]?.details[b.employeeCode]?.[b.kind]||{error:'EMPLOYEE_NOT_FOUND'};
else answer={error:'PREVIEW_READ_ONLY'};
return new Response(JSON.stringify(answer),{status:200,headers:{'content-type':'application/json'}});};
window.addEventListener('load',()=>document.getElementById('tabAdmin').click());})();`;
 await fs.writeFile(path.join(target,'team-ledger-review-host.js'),host);
 const file=path.join(target,'index.html');let html=await fs.readFile(file,'utf8');html=html.replace('<script src="secure-assets/index-inline-1.js">','<script src="team-ledger-review-host.js"></script><script src="secure-assets/index-inline-1.js">');html=html.replace('<body>','<body><div class="team-ledger-preview-note" role="note">معاينة مراجعة — بيانات صناعية فقط. لا يوجد اتصال ببيانات الموظفين أو المخزن. الربط الحي ينتظر اعتماد الـAPI.</div>');await fs.writeFile(file,html);
 await fs.appendFile(path.join(target,'team-ledger.css'),'\n.team-ledger-preview-note{padding:12px 18px;background:#fff5db;border:1px solid #e8c46e;color:#624914;font:700 13px Tahoma;position:relative;z-index:10000;text-align:center}\n');
 return {target,synthetic:true,liveData:false,externalWrites:false};
}
if(process.argv[2])console.log(await prepareReview(path.resolve(process.argv[2])));
