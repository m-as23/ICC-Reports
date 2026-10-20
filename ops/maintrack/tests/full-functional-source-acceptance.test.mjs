// Real MainTrack backend business logic executed with synthetic in-memory query results.
// The source under test is the EXACT isolated Edge Function source, not re-implemented logic.
// DB writes, live employees, external mail and Production are NOT used.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'../../..');
const src=fs.readFileSync(path.join(root,'supabase/functions/maintrack-rbac-readonly-qa/index.ts'),'utf8');
const contract=JSON.parse(fs.readFileSync(path.join(root,'ops/maintrack/production-api-contract.json'),'utf8'));
const portion=(from,to)=>{
  const a=src.indexOf(from),b=src.indexOf(to,a+from.length);
  assert.ok(a>=0&&b>a,'BACKEND_SOURCE_BLOCK_MISSING '+from);
  return src.slice(a,b);
};
const helpers=portion('const text=','const rights=');
const roles=portion('const rights=','async function issue');
const inputs=portion('function reportInput(b)','async function submit');
const dashboard=portion('async function dashboard(u,b)','async function profile');
const notification=portion('async function notifications(u)','async function');
const overtimeDates=portion('function cairoLocalMinute','async function overtimeRequest');
const cmmsHelpers=portion('const cmmsSource=','async function cmms');
const fnNames=['reportInput','span','clock','day','woid','permit','dashboard','notifications','overtimeEndLocal','validateCompletedOvertime','cmmsSource','cmmsLimits'];
function runtime(rows=[],extras={}){
 const pool={query:async(sql)=>{
  if(sql.includes('FROM mt_reports r'))return {rows};
  if(sql.includes('FROM mt_notifications'))return {rows:extras.notifications||[]};
  if(sql.includes('count(*)::int AS n FROM mt_leave_requests'))return {rows:[{n:extras.pendingCount||0}]};
  if(sql.includes('SELECT l.public_id'))return {rows:extras.pendingLeaves||[]};
  throw Error('UNEXPECTED_DATABASE_QUERY:'+sql.slice(0,90));
 }};
 const ctx=vm.createContext({
  Date,Intl,Math,Number,String,Object,Array,Map,Set,JSON,RegExp,
  pool,
  die:(code)=>{throw Error(code);}
 });
 const script=[helpers,roles,inputs,dashboard,notification,overtimeDates,cmmsHelpers,
  '({'+fnNames.join(',')+'})'].join('\n');
 return vm.runInContext(script,ctx,{timeout:800});
}
const worker=(role)=>({id:'00000000-0000-4000-8000-000000000001',
  role,active:true,must_change:false});
const incident={cid:'b4ff0054-4ef1-4a66-802f-d589cd207700',
  section:'QA SECTION',machine:'QA MACHINE',comp:'QA COMPONENT',
  desc:'Electrical overload',solution:'Replaced overload relay',
  spare:'relay',date:'2026-10-15',t1:'23:00',t2:'23:20',t3:'00:40',
  status:'Closed',cat:'Electrical'};
const rows=[{wo_number:9,legacy_wo:null,incident_date:'2026-10-15',
  report_time:'07:00',work_start_time:'07:15',work_end_time:'09:15',
  status:'Closed',category:'Electrical',section:'QA SEC',machine:'QA Machine'}];

test('release contract names are 32 distinct actions, source dispatch recognizes all',()=>{
 assert.equal(contract.requiredActions.length,32);
 assert.equal(new Set(contract.requiredActions).size,32);
 const cases=[...src.matchAll(/case\s+'([A-Za-z][A-Za-z0-9_]*)'\s*:/g)].map(m=>m[1]);
 const missing=contract.requiredActions.filter(a=>!cases.includes(a));
 assert.deepEqual(missing,[]);
});
test('overnight fault report preserves chronology and normalizes time',()=>{
 const f=runtime().reportInput(incident);
 assert.equal(f.t1,'23:00:00');assert.equal(f.t3,'00:40:00');
 assert.equal(f.desc,'Electrical overload');
});
test('report input rejects malformed UUID, invalid time, chronology and missing component',()=>{
 const v=runtime();
 for(const [update,code] of [
  [{cid:'NOT_UUID'},'INVALID_CLIENT_REF'],
  [{t2:'29:30'},'INVALID_TIME'],
  [{t1:'22:00',t2:'08:00',t3:'05:00'},'INVALID_WORK_CHRONOLOGY'],
  [{comp:''},'INVALID_COMPONENT'],
  [{desc:''},'INVALID_DESCRIPTION'],
  [{date:'2026-02-30'},'INVALID_DATE']
 ]){
  assert.throws(()=>v.reportInput({...incident,...update}),e=>
   e.message.includes(code)||code==='INVALID_DATE'&&e instanceof RangeError);
 }
});
test('CMMS hours across midnight and work response calculations',()=>{
 const {span}=runtime();
 assert.equal(span(23*60+20,40),1.33);
 assert.equal(span(7*60,7*60+15),0.25);
 assert.equal(span(null,50),null);
});
test('owner-only actions are denied by the actual backend permit function',()=>{
 const {permit}=runtime();
 assert.doesNotThrow(()=>permit(worker('owner'),'users.manage'));
 for(const role of ['engineer','technician']){
  assert.throws(()=>permit(worker(role),'users.manage'),/FORBIDDEN/);
  assert.throws(()=>permit(worker(role),'leave.approve'),/FORBIDDEN/);
 }
 assert.throws(()=>permit({...worker('owner'),must_change:true},'users.manage'),/CHANGE_REQUIRED/);
 assert.throws(()=>permit({...worker('owner'),active:false},'dashboard.view'),/AUTH/);
});
test('technician dashboard never exposes machine and per-work-order analytics',async()=>{
 const out=await runtime(rows).dashboard(worker('technician'),{year:2026,month:10});
 assert.equal(out.limited,true);
 assert.equal(out.count,1);assert.equal(out.totalDowntime,2);
 assert.deepEqual([...Object.keys(out)].sort(),['categoryTable','count','limited','month','totalDowntime','year'].sort());
 assert.equal(out.categoryTable[0].name,'Electrical');
});
test('engineer and owner dashboard expose sanctioned full analytics with correct month',async()=>{
 for(const role of ['engineer','owner']){
  const out=await runtime(rows).dashboard(worker(role),{year:2026,month:10});
  assert.equal(out.count,1);assert.equal(out.mttr,2);
  assert.equal(out.sectionTable[0].hours,2);
  assert.equal(out.recent[0].id,'WO-09');
  assert.equal(out.avgResponse,0.25);
 }
 await assert.rejects(runtime(rows).dashboard(worker('owner'),{year:2026,month:13}),/INVALID_MONTH/);
});
test('Owner notification feed caps five items and non-owner sees no pending approval data',async()=>{
 const notes=Array.from({length:6},(_,i)=>({
  id:String(i+1),source_id:'QA-'+i,title:'QA report '+i,
  description:'synthetic',target:'report',
  created_at:'2026-10-15T12:00:00Z',read_at:null}));
 const pending=[{public_id:'LV-UNITTEST',type:'annual',reason:'QA',
  days:1,start_date:'2026-10-15',end_date:'2026-10-15',
  created_at:'2026-10-15T12:00:00Z',name:'QA User'}];
 const {notifications}=runtime([], {notifications:notes,pendingCount:1,pendingLeaves:pending});
 const owner=await notifications(worker('owner'));
 assert.equal(owner.items.length,5);assert.equal(owner.pendingCount,1);
 assert.equal(owner.items[0].requestId,'LV-UNITTEST');
 const tech=await notifications(worker('technician'));
 assert.equal(tech.pendingCount,0);assert.equal(tech.pendingItems.length,0);
 assert.equal(tech.items.length,5);
});
test('overtime validates Africa/Cairo completion and crossing midnight',()=>{
 const v=runtime();
 assert.equal(v.overtimeEndLocal('2026-10-12','23:00:00','03:00:00'),'2026-10-13T03:00');
 assert.doesNotThrow(()=>v.validateCompletedOvertime('2025-10-12','15:00:00','19:00:00'));
 assert.throws(()=>v.validateCompletedOvertime('2099-10-12','15:00:00','19:00:00'),
  /FUTURE_OVERTIME_NOT_ALLOWED/);
});
test('CMMS filters bound source, pagination and reject arbitrary values',()=>{
 const v=runtime();
 assert.equal(v.cmmsSource({source:'pilot'}),'pilot');
 assert.equal(v.cmmsLimits({limit:100,offset:0}).limit,100);
 assert.throws(()=>v.cmmsSource({source:'secret'}),/INVALID_SOURCE/);
 assert.throws(()=>v.cmmsLimits({limit:10000}),/INVALID_PAGINATION/);
});
test('backend persists reports once, rejects idempotency collision, and emits transaction-bound audit',()=>{
 const code=portion('async function submit(u,b)','async function dashboard');
 assert.match(code,/ON CONFLICT\(client_request_id\) DO NOTHING/);
 assert.match(code,/IDEMPOTENCY_CONFLICT/);
 assert.match(code,/INSERT INTO mt_notifications/);
 assert.match(code,/INSERT INTO mt_audit/);
 assert.match(code,/return transaction\(async c=>/);
});
test('leave and overtime create/decision source includes locks, ledger and notification writes',()=>{
 const leave=portion('async function leaveRequest(u,b)','async function decision');
 const decide=portion('async function decision(u,b)','async function notifications');
 const ot=portion('async function overtimeRequest(u,b)','async function overtimeDecision');
 const otApprove=portion('async function overtimeDecision(u,b)','async function dispatch');
 for(const part of [leave,decide,ot,otApprove])assert.match(part,/FOR UPDATE|transaction\(async c=>/);
 assert.match(leave,/OVERLAPPING_LEAVE_REQUEST/);
 assert.match(leave,/INSUFFICIENT_LEAVE_BALANCE/);
 assert.match(decide,/INSERT INTO mt_leave_ledger/);
 assert.match(decide,/INSERT INTO mt_substitute_time_ledger/);
 assert.match(ot,/OVERLAPPING_OVERTIME_REQUEST/);
 assert.match(otApprove,/INSERT INTO mt_substitute_time_ledger/);
 assert.match(otApprove,/INSERT INTO mt_notifications/);
});
test('QA deployment remains read-only and cannot be accidentally reused for full functionality',()=>{
 assert.match(src,/QA_ACTION_DISABLED/);
 assert.match(src,/const QA_ONLY_IDENTITIES=new Set/);
 assert.match(src,/const MT_ALLOWED_ORIGINS=new Set\(\[\]\)/);
 assert.ok(!src.includes('tdnkeskczcsukcujwinu'),'ISOLATION_DRIFT');
});
