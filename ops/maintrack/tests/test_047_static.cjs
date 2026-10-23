'use strict';
// MainTrack v0.4.7 offline-only QA: run with "node ops/maintrack/tests/test_047_static.cjs".
// No network requests, credentials, database writes, deployment or email sends.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../../..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const index=read('index.html');
const webIndex=read('web/maintrack/public/index.html');
const webJs=read('web/maintrack/public/secure-assets/index-inline-1.js');
const css=read('web/maintrack/public/v6.css');
const menuCore=read('web/maintrack/public/v6-core.js');
const nav=read('web/maintrack/public/v6.js');
const inventoryCss=read('web/maintrack/public/inventory-047.css');
const api=read('supabase/functions/maintrack-stage9-security-api/index.ts');
const worker=read('supabase/functions/maintrack-pilot-mail-worker/index.ts');

new vm.Script(webJs,{filename:'index-inline-1.js'});
new vm.Script(menuCore,{filename:'v6-core.js'});
assert.ok(menuCore.includes("const role=S.role==='owner'?'المسؤول':S.role==='engineer'?'مهندس':S.role==='technician'?'فني':'غير معيّن';"),'Sidebar actual role label changed');
assert.ok(!menuCore.includes('Owner / المسؤول')&&!menuCore.includes('Technician / فني'),'Mixed language role label restored');
const scripts=[...index.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
 .filter(m=>!/\bsrc\s*=/.test(m[1])&&m[2].trim()&&!/application\/json/i.test(m[1]));
assert.ok(scripts.length,'Standalone scripts not found');
for(const m of scripts)new vm.Script(m[2],{filename:'index.html:inline.js'});

// Only the canonical Web bundle is edited; legacy root index.html remains immutable.
for(const source of [webJs]){
 for(const role of ["owner:'المسؤول'","engineer:'مهندس'","technician:'فني'"]){
  assert.ok(source.includes(role),'Missing Arabic role display: '+role);
 }
 assert.ok(source.includes("reason.includes('OVERLAPPING_LEAVE_REQUEST')"));
 assert.ok(source.includes('اختر تاريخًا مختلفًا.'));
}
assert.ok(api.includes('SELECT id FROM mt_users WHERE id=$1 FOR UPDATE'),'Lost leave serialization');
assert.ok(api.includes("status IN ('PENDING','APPROVED') AND start_date<=$3::date AND end_date>=$2::date"),'Lost overlap guard');
assert.ok(api.includes('IDEMPOTENCY_CONFLICT'),'Lost idempotency guard');
assert.ok(webIndex.includes('href="v6.css"'));
assert.ok(css.includes('main#form{padding-bottom:calc(120px + env(safe-area-inset-bottom));}'));

const marker='// v0.4.7 MT-05:';
const from=worker.indexOf(marker);
const to=worker.indexOf('async function send(',from);
assert.ok(from>=0&&to>from,'Worker utility functions missing');
const utility=new Function(worker.slice(from,to)+'\nreturn {maintrackDurationArabic,maintrackReportTiming,maintrackClockMinutes,maintrackClockAmPm};')();
for(const [input,want] of [[125,'ساعتان و5 دقائق'],[61,'ساعة واحدة ودقيقة واحدة'],[2,'دقيقتان'],[185,'3 ساعات و5 دقائق'],[750,'12 ساعة و30 دقيقة']]){
 assert.equal(utility.maintrackDurationArabic(input),want);
}
assert.deepEqual(utility.maintrackReportTiming({report_clock:'23:40',work_end_clock:'00:05'}),{duration:'25 دقيقة',nextDay:true});
assert.deepEqual(utility.maintrackReportTiming({report_clock:'10:30',work_end_clock:'12:35'}),{duration:'ساعتان و5 دقائق',nextDay:false});
assert.equal(utility.maintrackReportTiming({report_clock:'07:00',work_end_clock:'07:00'}).duration,'غير محددة (وقت البداية يساوي وقت النهاية)');
assert.equal(utility.maintrackReportTiming({report_clock:'25:00',work_end_clock:'06:00'}).duration,'غير متاحة');
for(const [clock,formatted] of [['00:05','12:05 AM'],['08:30','8:30 AM'],['12:45','12:45 PM'],['23:59','11:59 PM']]) {
 assert.equal(utility.maintrackClockAmPm(clock),formatted);
}
assert.ok(worker.includes("const subject='إشعار تسجيل بلاغ جديد في MainTrack'"));
assert.ok(worker.includes("'وقت بداية العطل: '+maintrackClockAmPm(x.report_clock)"));
assert.ok(worker.includes("'المدة الإجمالية للعطل: '+timing.duration"));
assert.ok(!worker.includes("'بداية الإصلاح: '"));
assert.ok(!worker.includes("const subject='MainTrack Pilot"));
assert.ok(!worker.includes('تجربة Pilot فقط'));
assert.ok(worker.includes("'Idempotency-Key':j.event_key"));
assert.ok(worker.includes("event_type='report.created.email'"));
assert.ok(worker.includes("from:'MainTrack Notifications <'+sender+'>'"));
assert.ok(worker.includes("to_char(r.report_time,'HH24:MI') AS report_clock"));
assert.ok(worker.includes("to_char(r.work_end_time,'HH24:MI') AS work_end_clock"));
new vm.Script(worker.replace(/^import .*;\r?\n/gm,''),{filename:'mail-worker-index.ts-stripped-imports'});

// CP-06 MT-01: menu must keep its original items/order and add inventory ONLY last.
const order=nav.match(/const order=\[([^\]]+)\]/)?.[1].match(/'[^']+'/g)?.map(x=>x.slice(1,-1));
assert.deepEqual(order,['tabDash','tabForm','tabCmms','tabCatalog','tabProfile','tabLeave','tabApprove','tabAdmin','tabInventory']);
assert.ok(webIndex.includes('<button id="tabInventory" type="button" style="display:none">قطع الغيار</button>'));
assert.ok(webIndex.includes('<section id="inventory" style="display:none"'));
assert.ok(webIndex.includes('<link rel="stylesheet" href="inventory-047.css">'));
assert.ok(webIndex.includes('id="inv47Frame"')&&webIndex.includes('inventory-047.js'));
assert.ok(webIndex.includes('id="inv47Owner"')&&webIndex.includes('id="inv47State"'));
assert.ok(!/<input id="inv47Query"[^>]* disabled>/.test(webIndex),'Integrated search must be enabled');
assert.ok(webIndex.includes('<script src="inventory-047.js"></script>'));
assert.ok(!/<button id="inv47Find"[^>]* disabled>/.test(webIndex),'Integrated search button must be enabled');
assert.ok(read('web/maintrack/public/inventory-reference.html').includes('id="approveImport" disabled'),'Publish starts disabled in the original page');
assert.ok(menuCore.includes('tabInventory:'),'New menu icon must not replace existing icons');
assert.ok(inventoryCss.split('\n').filter(line=>line.trim()).every(line=>line.startsWith('#inventory')||line.startsWith('/*')||line.startsWith('@media')||line.startsWith('}')),'CSS must be scoped to inventory preview');
assert.ok(webJs.includes("$('tabInventory').style.display=canReport()?'block':'none';"));
assert.ok(webJs.includes("$('inv47Owner').hidden=!(S&&S.role==='owner');"));
assert.ok(webJs.includes("$('tabInventory').onclick=()=>{if(!canReport())return;show('inventory');};"));
const viewSource=webJs.match(/function show\(v\) \{[\s\S]*?\n\}\nasync function save\(d\)/)?.[0];
assert.ok(viewSource,'Canonical app view function must be testable');
const showCode=viewSource.slice(0,viewSource.indexOf('\nasync function save(d)'));
for(const role of ['owner','engineer','technician','unassigned']){
 const elements=new Map();
 const $=id=>{
  if(!elements.has(id))elements.set(id,{style:{},classList:{toggle(){}},hidden:false,setAttribute(){},textContent:''});
  return elements.get(id);
 };
 const ctx={window:{__maintrackActiveView:'dashboard',scrollTo(){}},document:{body:{classList:{toggle(){}}}},$,S:{role,displayName:'Test'},canReport:()=>['owner','engineer','technician'].includes(role),note(){}};
 vm.runInNewContext(showCode+';show("dashboard");',ctx);
 assert.equal($('tabInventory').style.display,role==='unassigned'?'none':'block',role);
 assert.equal($('inv47Owner').hidden,role!=='owner',role);
 if(role!=='unassigned'){
  vm.runInNewContext('show("inventory");',ctx);
  assert.equal($('inventory').style.display,'block',role);
  assert.equal($('headTitle').textContent,'رصيد المخزن',role);
  assert.equal($('form').style.display,'none',role);
 }
}
console.log('PASS MT-01 menu order, inventory preview fail-closed, role-only UI checks.');

console.log('PASS MainTrack v0.4.7 static/syntax/duration checks (offline only).');
