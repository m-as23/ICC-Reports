
import pg from 'npm:pg@8.13.3';
import {createHash,timingSafeEqual} from 'node:crypto';
const pool=new pg.Pool({connectionString:Deno.env.get('SUPABASE_DB_URL'),max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:7000});
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const safe=(v,n=160)=>String(v??'').replace(/[\r\n]+/g,' ').slice(0,n);
function eq(a,b){if(!a||!b)return false;return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());}
async function auth(req){
 const token=(req.headers.get('Authorization')||'').match(/^Bearer\s+(\S+)$/)?.[1]||'';
 let modern='';try{modern=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||'';}catch{}
 const legacy=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(eq(token,modern)||eq(token,legacy))return true;
 const dispatch=req.headers.get('x-maintrack-dispatch-token')||'';
 if(!/^[a-f0-9]{64}$/.test(dispatch))return false;
 const rows=await pool.query('SELECT token_sha256 FROM maintrack_internal.mail_dispatch_access WHERE id=1');
 return eq(createHash('sha256').update(dispatch).digest('hex'),rows.rows[0]?.token_sha256||'');
}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
async function take(limit){
 const c=await pool.connect();
 try{
 await c.query('BEGIN');
 const sql=[
  "WITH selected AS (",
  " SELECT id FROM public.mt_outbox",
  " WHERE event_type='report.created.email' AND attempts < 5",
  " AND ((state='PENDING' AND next_run_at<=now()) OR",
  " (state='PROCESSING' AND claimed_at < now()-interval '10 minutes'))",
  " ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $1",
  ") UPDATE public.mt_outbox q SET state='PROCESSING',",
  " claimed_at=now(),attempts=q.attempts+1,last_error=NULL",
  " FROM selected s WHERE q.id=s.id",
  " RETURNING q.id,q.event_key,q.payload,q.attempts"
 ].join(' ');
 const result=await c.query(sql,[limit]);
 await c.query('COMMIT');
 return result.rows;
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
async function fail(j,status,code,permanent=false){
 const secs=Math.min(3600,30*Math.pow(2,Math.min(j.attempts,7)));
 await pool.query([
  "UPDATE public.mt_outbox SET",
  " state=CASE WHEN $3::boolean OR attempts>=5 THEN 'FAILED' ELSE 'PENDING' END,",
  " next_run_at=now()+($4::integer*interval '1 second'),",
  " claimed_at=NULL,last_error=$2,last_http_status=$5",
  " WHERE id=$1 AND state='PROCESSING' AND event_key=$6"
 ].join(' '),[j.id,safe(code,110),permanent,secs,status||null,j.event_key]);
}
// v0.4.7 MT-05: report-time-based elapsed duration, including one midnight rollover.
function maintrackClockMinutes(value){
 const m=/^(\d{2}):(\d{2})$/.exec(String(value||''));
 if(!m)return null;
 const h=Number(m[1]),minute=Number(m[2]);
 return h<24&&minute<60?h*60+minute:null;
}
function maintrackDurationArabic(value){
 if(!Number.isSafeInteger(value)||value<0)return 'غير متاحة';
 const h=Math.floor(value/60),m=value%60;
 const hour=h===0?'':h===1?'ساعة واحدة':h===2?'ساعتان':h<=10?h+' ساعات':h+' ساعة';
 const minute=m===0?'':m===1?'دقيقة واحدة':m===2?'دقيقتان':m<=10?m+' دقائق':m+' دقيقة';
 return [hour,minute].filter(Boolean).join(' و')||'0 دقيقة';
}
function maintrackReportTiming(row){
 const start=maintrackClockMinutes(row.report_clock),end=maintrackClockMinutes(row.work_end_clock);
 if(start===null||end===null)return {duration:'غير متاحة',nextDay:false};
 if(start===end)return {duration:'غير محددة (وقت البداية يساوي وقت النهاية)',nextDay:false};
 return {duration:maintrackDurationArabic((end-start+1440)%1440),nextDay:end<start};
}

async function send(j,to,from,key){
 const reportId=j.payload?.report_id;
 if(!reportId){await fail(j,0,'MISSING_REPORT_ID',true);return false;}
 const found=await pool.query([
  "SELECT r.wo_number,r.description,r.solution,to_char(r.incident_date,'YYYY-MM-DD') AS day,", 
  "to_char(r.report_time,'HH24:MI') AS report_clock,to_char(r.work_start_time,'HH24:MI') AS work_start_clock,to_char(r.work_end_time,'HH24:MI') AS work_end_clock,",
  " s.name AS section,m.name AS machine,u.name AS technician FROM public.mt_reports r",
  " LEFT JOIN public.mt_sections s ON s.id=r.section_id",
  " LEFT JOIN public.mt_machines m ON m.id=r.machine_id",
  " LEFT JOIN public.mt_users u ON u.id=r.creator_id",
  " WHERE r.id=$1 LIMIT 1"
 ].join(' '),[reportId]);
 const x=found.rows[0];
 if(!x){await fail(j,0,'REPORT_NOT_FOUND',true);return false;}
 const sender=String(from||'').trim();
 if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender)){await fail(j,0,'INVALID_SENDER_EMAIL',true);return false;}
 const label='WO-'+String(x.wo_number).padStart(2,'0');
 const timing=maintrackReportTiming(x);
 const subject='MainTrack | بلاغ صيانة '+label;
 const message=[
  'تم تسجيل بلاغ صيانة جديد في MainTrack',
  'رقم البلاغ: '+label,
  'القسم: '+safe(x.section),
  'الماكينة: '+safe(x.machine),
  'الموظف: '+safe(x.technician),
  'التاريخ: '+safe(x.day),
  'وقت الإبلاغ / بداية العطل المسجلة: '+safe(x.report_clock),
  'بداية الإصلاح: '+safe(x.work_start_clock),
  'نهاية الإصلاح: '+safe(x.work_end_clock)+(timing.nextDay?' (اليوم التالي)':''),
  'المدة الإجمالية من الإبلاغ لنهاية الإصلاح: '+timing.duration,
  'وصف العطل: '+safe(x.description,1900),
  'خطوات الحل: '+safe(x.solution,1900)
 ].join('\n');
 let res;
 try{
  res=await fetch('https://api.resend.com/emails',{
   method:'POST',signal:AbortSignal.timeout(12000),
   headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':j.event_key},
   body:JSON.stringify({
     from:'MainTrack Notifications <'+sender+'>',to:[to],subject,text:message,
     html:'<div dir="rtl" style="font:15px system-ui">'+esc(message).replace(/\n/g,'<br>')+'</div>'
   })
  });
 }catch{await fail(j,0,'PROVIDER_TRANSPORT_FAILURE');return false;}
 const payload=await res.json().catch(()=>({}));
 if(!res.ok){
  await fail(j,res.status,'PROVIDER_HTTP_'+res.status,!([408,429].includes(res.status)||res.status>=500));
  return false;
 }
 if(!payload?.id){await fail(j,res.status,'PROVIDER_MISSING_ID');return false;}
 await pool.query([
  "UPDATE public.mt_outbox SET state='DONE',done_at=now(),claimed_at=NULL,",
  " provider_message_id=$3,last_http_status=$2,last_error=NULL",
  " WHERE id=$1 AND state='PROCESSING' AND event_key=$4"
 ].join(' '),[j.id,res.status,String(payload.id),j.event_key]);
 return true;
}
Deno.serve(async(req)=>{
 const path=new URL(req.url).pathname;
 if(req.method==='GET'&&path.endsWith('/healthz'))return reply({service:'maintrack-pilot-mail-worker',status:'deployed'});
 if(req.method!=='POST'||!(path.endsWith('/dispatch')||path.endsWith('/preflight')))return reply({error:'NOT_FOUND'},404);
 if(!(await auth(req)))return reply({error:'UNAUTHORIZED'},401);
 if(path.endsWith('/preflight')){
  const hasKey=Boolean(Deno.env.get('RESEND_API_KEY'));
  const cfg=(await pool.query("SELECT enabled,sender_email,recipient_email FROM public.mt_mail_config WHERE singleton=true")).rows[0];
  return reply({provider_key_present:hasKey,mail_enabled:Boolean(cfg?.enabled),sender_configured:Boolean(cfg?.sender_email),recipient_configured:Boolean(cfg?.recipient_email)});
 }
 try{
  const cfg=(await pool.query('SELECT recipient_email,sender_email,enabled FROM public.mt_mail_config WHERE singleton=true')).rows[0];
  if(!cfg?.enabled||!cfg.sender_email)return reply({error:'MAIL_NOT_ENABLED'},409);
  const key=Deno.env.get('RESEND_API_KEY')||'';
  if(!key)return reply({error:'MAIL_PROVIDER_NOT_CONFIGURED'},503);
  const jobs=await take(5);
  let sent=0,failed=0;
  for(const j of jobs){
   try{if(await send(j,cfg.recipient_email,cfg.sender_email,key))sent++;else failed++;}
   catch{
    console.error('PILOT_MAIL_JOB_FAILED',j.id);
    try{await fail(j,0,'MAIL_JOB_EXCEPTION')}catch{}
    failed++;
   }
  }
  return reply({processed:jobs.length,sent,failed});
 }catch(e){
  console.error('PILOT_MAIL_WORKER_ERROR',String(e).slice(0,150));
  return reply({error:'INTERNAL_ERROR'},500);
 }
});
