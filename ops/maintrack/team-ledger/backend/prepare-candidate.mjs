// Produces a review artifact only. No deploy, secrets, SQL writes or changed origins.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const reviewedSha='d2b9213a17db285343abe0eaf454e422d7a9bbe6576cefb23ed064220dcf9642';
export async function prepareCandidate({baseline,target}){
 const original=await fs.readFile(baseline,'utf8'),sha=createHash('sha256').update(original).digest('hex');
 if(sha!==reviewedSha)throw Error('UNREVIEWED_LIVE_BASELINE');
 const start=original.indexOf('async function accountSummary(u){'),end=original.indexOf('\nfunction cairoLocalMinute',start);
 if(start<0||end<0||!original.includes("case 'accountSummary':return accountSummary(u);"))throw Error('API_BOUNDARY_CHANGED');
 const adapter=`const teamLedger=createTeamLedger({query:(sql,args)=>pool.query(sql,args)});
async function accountSummary(u){permit(u,'profile.view');return teamLedger.account(u);}
async function teamLedgerRead(u,b,detail=false){
 permit(u,'users.manage');
 try{return await (detail?teamLedger.detail(u,b):teamLedger.team(u,b));}
 catch(e){if(/^(INVALID_YEAR|INVALID_OFFSET|INVALID_LIMIT|INVALID_QUERY|INVALID_EMPLOYEE|INVALID_KIND|EMPLOYEE_NOT_FOUND)$/.test(e.message))die(e.message,e.message==='EMPLOYEE_NOT_FOUND'?404:400);throw e;}
}
`;
 let candidate="import {createTeamLedger} from './ledger-service.mjs';\n"+original.slice(0,start)+adapter+original.slice(end);
 candidate=candidate.replace("case 'accountSummary':return accountSummary(u);","case 'accountSummary':return accountSummary(u);\n case 'teamBalances':return teamLedgerRead(u,b);\n case 'teamBalanceDetail':return teamLedgerRead(u,b,true);");
 await fs.mkdir(target,{recursive:true});await fs.writeFile(path.join(target,'index.ts'),candidate);await fs.copyFile(path.join(import.meta.dirname,'ledger-service.mjs'),path.join(target,'ledger-service.mjs'));
 await fs.writeFile(path.join(target,'deno.json'),'{"imports":{},"compilerOptions":{}}\n');
 const report={baselineSha256:sha,candidateSha256:createHash('sha256').update(candidate).digest('hex'),originalAuthAndOriginsUnchanged:true,newActions:['teamBalances','teamBalanceDetail'],databaseMigration:false,deployed:false};
 await fs.writeFile(path.join(target,'review.json'),JSON.stringify(report,null,2));return report;
}
