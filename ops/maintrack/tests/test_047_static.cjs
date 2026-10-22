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
const api=read('supabase/functions/maintrack-stage9-security-api/index.ts');
const worker=read('supabase/functions/maintrack-pilot-mail-worker/index.ts');

new vm.Script(webJs,{filename:'index-inline-1.js'});
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
console.log('PASS MainTrack v0.4.7 static/syntax/duration checks (offline only).');
