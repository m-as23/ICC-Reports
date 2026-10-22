'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const worker=fs.readFileSync(path.resolve(__dirname,'../../../supabase/functions/maintrack-pilot-mail-worker/index.ts'),'utf8');
const begin=worker.indexOf('// v0.4.7 MT-05:');
const end=worker.indexOf('Deno.serve',begin);
const safe=(v,n=160)=>String(v??'').replace(/[\r\n]+/g,' ').slice(0,n);
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
for(const [start,finish,duration] of [['07:00','09:05','ساعتان و5 دقائق'],['23:40','00:05','25 دقيقة']]){
 test('047 report email payload uses agreed sender, employee, AM/PM and duration '+start,async()=>{
  const queries=[];let payload,headers;
  const pool={query:async(sql,params)=>{queries.push({sql,params});return sql.startsWith('SELECT')?{rows:[{wo_number:12,section:'قسم صناعي',machine:'ماكينة اختبار',technician:'موظف اختبار',day:'2026-10-23',report_clock:start,work_end_clock:finish,description:'Fault <test>',solution:'Fix & verify'}]}:{rows:[]};}};
  const fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');payload=JSON.parse(options.body);headers=options.headers;return {ok:true,status:200,json:async()=>({id:'synthetic-provider-id'})};};
  const fail=async()=>{assert.fail('Valid report must not fail');};
  const send=new Function('pool','fetch','fail','safe','esc','AbortSignal',worker.slice(begin,end)+';return send;')(pool,fetch,fail,safe,esc,AbortSignal);
  assert.equal(await send({id:'synthetic-job',event_key:'synthetic-idempotency-key',payload:{report_id:'synthetic-report'}},'owner@example.test','notifications@example.test','synthetic-key'),true);
  assert.equal(payload.from,'MainTrack Notifications <notifications@example.test>');
  assert.equal(payload.subject,'إشعار تسجيل بلاغ جديد في MainTrack');
  assert.ok(!payload.subject.includes('Pilot'));
  for(const text of ['رقم البلاغ: WO-12','الموظف: موظف اختبار','المدة الإجمالية للعطل: '+duration,'وصف العطل: Fault <test>','خطوات الحل: Fix & verify'])assert.ok(payload.text.includes(text),text);
  assert.match(payload.text,/وقت بداية العطل: \d{1,2}:\d{2} (AM|PM)/);
  assert.ok(payload.html.includes('Fault &lt;test&gt;')&&payload.html.includes('Fix &amp; verify'));
  assert.equal(headers['Idempotency-Key'],'synthetic-idempotency-key');
  assert.ok(queries[0].sql.includes('u.name AS technician')&&queries[0].sql.includes('r.creator_id'));
  assert.ok(queries.some(x=>x.sql.includes("state='DONE'")));
 });
}
