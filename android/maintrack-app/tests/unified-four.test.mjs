import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {DISCOVERY_INTERVAL} from '../update-system/discovery.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
const read=relative=>fs.readFile(path.join(root,relative),'utf8');
const htmlFile='web/maintrack/public/index.html';
const scriptFile='web/maintrack/public/secure-assets/index-inline-1.js';
const apiFile='supabase/functions/maintrack-stage9-security-api/index.ts';
const schemaFile='db/applied/maintrack-unified-four-staging.sql';

test('web and Android discovery cadence stays 30 minutes',()=>{
 assert.equal(DISCOVERY_INTERVAL,30*60*1000);
});

test('web update control remains update-only, not manual profile check',async()=>{
 const source=await read('android/maintrack-app/update-system/web-entry.mjs');
 assert.ok(source.includes('createDiscovery({check:inspect})'));
 assert.ok(source.includes('apply.hidden = !next'));
 assert.ok(!source.includes('settings.append(check)'));
});

test('browser source remains parseable and navigation clears old errors',async()=>{
 const js=await read(scriptFile);
 assert.doesNotThrow(()=>new Function(js));
 assert.ok(js.includes("if(window.__maintrackActiveView!==v)note('','');"));
 assert.ok(js.includes('INVALID_SECTION_MACHINE_COMPONENT'));
 assert.ok(js.includes('localizedError(t)'));
});

test('technician dashboard is restricted at API and client boundary',async()=>{
 const api=await read(apiFile),js=await read(scriptFile);
 const section=api.slice(api.indexOf("if(u.role==='technician')return"),api.indexOf('items.sort(',api.indexOf("if(u.role==='technician')return")));
 assert.ok(section.includes('categoryTable:tab(categories)'));
 for(const forbidden of ['machineTable','sectionTable','recent:','mttr:'])assert.ok(!section.includes(forbidden));
 assert.ok(js.includes("S.role==='technician'"));
 assert.ok(js.includes('setDashboardRoleView()'));
});

test('annual and compensatory leave permit 4h half-day',async()=>{
 const api=await read(apiFile),sql=await read(schemaFile),html=await read(htmlFile);
 assert.ok(api.includes("!['annual','compensatory'].includes(type)"));
 assert.ok(api.includes("const days=half?0.5:daySpan"));
 assert.ok(api.includes("if(type==='compensatory'&&start!==end)die('LEAVE_POLICY_PENDING')"));
 assert.ok(sql.includes("duration_kind='HALF_DAY' AND start_date=end_date AND days=0.5"));
 assert.ok(html.includes('id="leaveDuration"'));
 assert.ok(html.includes('value="compensatory"'));
});

test('substitute credit/deduction only after owner approval',async()=>{
 const api=await read(apiFile),sql=await read(schemaFile);
 const ot=api.slice(api.indexOf('async function overtimeDecision('),api.indexOf('async function dispatch('));
 assert.ok(ot.includes("permit(u,'leave.approve')"));
 assert.ok(ot.includes("decision==='APPROVED'&&r.compensation_kind==='SUBSTITUTE'"));
 assert.ok(ot.includes("INSERT INTO mt_substitute_time_ledger"));
 const leave=api.slice(api.indexOf('async function decision('),api.indexOf('async function notifications('));
 assert.ok(leave.includes("permit(u,'leave.approve')"));
 assert.ok(leave.includes("delta_minutes,leave_id,approved_by"));
 assert.ok(sql.includes('mt_sub_time_leave_uq'));
 assert.ok(sql.includes('mt_sub_time_overtime_uq'));
});

test('contact editor is removed only from UI',async()=>{
 const html=await read(htmlFile),js=await read(scriptFile);
 for(const id of ['profilePhone','profilePreferred','saveProfile'])assert.ok(!html.includes('id="'+id+'"'));
 assert.ok(!js.includes("$('saveProfile').onclick"));
 assert.ok(html.includes('id="profileCode"'));
 assert.ok(html.includes('id="profileLeave"'));
});

test('staging backend TypeScript source retains valid JavaScript grammar',async()=>{
 const ts=await read(apiFile);
 const plain=ts.replace(/^import[^\n]+$/gm,'').replace(/body:any/g,'body').replace(/h:Record<string,string>/g,'h');
 assert.doesNotThrow(()=>new Function(plain));
});

test('single-day compensatory leave supports 4h and 8h, but never unapproved spans',async()=>{
 const api=await read(apiFile),js=await read(scriptFile);
 const migration=await read('db/applied/maintrack-compensatory-full-day-staging.sql');
 assert.ok(api.includes("if(type==='compensatory'&&start!==end)die('LEAVE_POLICY_PENDING')"));
 assert.ok(api.includes('useMinutes=Math.round(Number(req.days)*480)'));
 assert.ok(migration.includes('start_date=end_date AND days IN (0.5,1)'));
 assert.ok(!js.includes("disabled=substitute"));
});

test('pending annual and substitute requests reserve balances without debiting early',async()=>{
 const api=await read(apiFile);
 assert.ok(api.includes("status='PENDING'"));
 assert.ok(api.includes('reserved.annual'));
 assert.ok(api.includes('reserved.substitute'));
 assert.ok(api.includes('Number(bank.minutes)<useMinutes'));
});

test('employee overtime entry and history use explicit Arabic 12h controls',async()=>{
 const html=await read(htmlFile),js=await read(scriptFile);
 for(const name of ['otFrom','otTo']){
  for(const part of ['Hour','Minute','Period'])assert.ok(html.includes('id="'+name+part+'"'));
  assert.ok(!html.includes('id="'+name+'"'));
 }
 assert.ok(html.includes('الإجازات والعمل الإضافي'));
 assert.ok(html.indexOf('id="overtimeCard"')>html.indexOf('id="leave"'));
 assert.ok(js.includes('showOvertimeClock(r.from)'));
 assert.ok(js.includes('readOvertimeClock'));
 assert.ok(html.includes('id="otMineFilter"'));
});

test('owner overtime KPIs require approval role and count unique employee-days',async()=>{
 const api=await read(apiFile),js=await read(scriptFile),html=await read(htmlFile);
 const endpoint=api.slice(api.indexOf('async function overtimeSummary('),api.indexOf('async function overtimeRequest('));
 assert.ok(endpoint.includes("permit(u,'leave.approve')"));
 assert.ok(endpoint.includes('COUNT(DISTINCT (o.requester_id,o.work_date))'));
 assert.ok(endpoint.includes("o.status='APPROVED'"));
 assert.ok(api.includes("case 'overtimeSummary':return overtimeSummary(u,b)"));
 for(const f of ['otOwnerYear','otOwnerMonth','otOwnerEmployee','otOwnerKind','otOwnerDistinctDays','otOwnerApprovedHours'])assert.ok(html.includes('id="'+f+'"'));
 assert.ok(js.includes("api('overtimeSummary',ownerOvertimeFilters())"));
 assert.ok(js.includes("api('overtimeInbox',ownerOvertimeFilters())"));
});
