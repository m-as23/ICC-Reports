import pg from 'npm:pg@8.13.3';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
const pool=new pg.Pool({connectionString:Deno.env.get('SUPABASE_DB_URL'),max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:6000});
const sha=v=>createHash('sha256').update(v).digest('hex');
const response=(o,status=200,rid='')=>new Response(JSON.stringify(o),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type,x-request-id','x-request-id':rid}});
class AppError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status;}}
const die=(code,status)=>{throw new AppError(code,status);};
const row=async(q,p=[])=>((await pool.query(q,p)).rows[0]||null);
const first=async(c,q,p=[])=>((await c.query(q,p)).rows[0]||null);
async function transaction(fn){const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
const text=(v,min,max,code)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max||/[\u0000-\u001f]/.test(v))die(code);return v.trim();};
const uuid=v=>{if(typeof v!=='string'||!/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(v))die('INVALID_CLIENT_REF');return v.toLowerCase();};
const iso=v=>v instanceof Date?v.toISOString().slice(0,10):String(v??'').slice(0,10);
const day=v=>{if(typeof v!=='string'||!/^20\d\d-(0[1-9]|1[0-2])-\d\d$/.test(v)||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)die('INVALID_DATE');return v;};
const clock=v=>{if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v))die('INVALID_TIME');return v.length===5?v+':00':v;};
const mins=v=>{const m=String(v||'').match(/^(\d\d):(\d\d)/);return m?Number(m[1])*60+Number(m[2]):null};
const span=(a,b)=>a===null||b===null?null:Math.round(((b-a+1440)%1440)/60*100)/100;
const round=n=>Math.round(n*100)/100;
const woid=n=>'WO-'+String(n).padStart(2,'0');
const rights={owner:['profile.view','profile.update','dashboard.view','report.create','leave.request','leave.approve','users.manage'],engineer:['profile.view','profile.update','dashboard.view','report.create','leave.request'],technician:['profile.view','profile.update','dashboard.view','report.create','leave.request']};
const permit=(u,p)=>{if(!u||!u.active)die('AUTH',401);if(u.must_change)die('CHANGE_REQUIRED',403);if(!rights[u.role]?.includes(p))die('FORBIDDEN',403)};
async function issue(u,c=pool){const token=randomBytes(32).toString('hex');await c.query("INSERT INTO mt_sessions(token_hash,user_id,token_version,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",[sha(token),u.id,u.token_version]);return {token,code:u.employee_code,name:u.name,role:u.role,must:u.must_change};}
async function mtGlobalLoginGuard(){
 const sql="INSERT INTO public.mt_login_rate_guard(key_hash,window_start,attempts,updated_at) VALUES('maintrack_stage9_global_login',now(),1,now()) "+
 "ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN mt_login_rate_guard.window_start<now()-interval '5 minutes' THEN 1 ELSE mt_login_rate_guard.attempts+1 END,window_start=CASE WHEN mt_login_rate_guard.window_start<now()-interval '5 minutes' THEN now() ELSE mt_login_rate_guard.window_start END,updated_at=now() RETURNING attempts";
 const result=await row(sql);
 if(Number(result?.attempts||0)>300)die('RATE_LIMIT',429);
}
async function login(b){await mtGlobalLoginGuard();const code=text(b.code,1,32,'INVALID_CODE'),password=String(b.pw||'');
 const blocked=await row('SELECT blocked_until FROM mt_login_attempts WHERE employee_code=$1',[code]);
 if(blocked?.blocked_until&&new Date(blocked.blocked_until)>new Date())die('LOCKED',429);
 const u=await row("SELECT id,employee_code,name,role::text AS role,active,token_version,must_change,(password_hash=extensions.crypt($2,password_hash)) AS matched FROM mt_users WHERE employee_code=$1",[code,password]);
 if(!u||!u.active||!u.matched){
  await pool.query("INSERT INTO mt_login_attempts(employee_code,fail_count,updated_at) VALUES($1,1,now()) ON CONFLICT(employee_code) DO UPDATE SET fail_count=CASE WHEN mt_login_attempts.updated_at<now()-interval '5 minutes' THEN 1 ELSE mt_login_attempts.fail_count+1 END,updated_at=now(),blocked_until=CASE WHEN (CASE WHEN mt_login_attempts.updated_at<now()-interval '5 minutes' THEN 1 ELSE mt_login_attempts.fail_count+1 END)>=5 THEN now()+interval '5 minutes' ELSE NULL END",[code]);die('BAD_PW',401);
 }
 await pool.query('DELETE FROM mt_login_attempts WHERE employee_code=$1',[code]);return issue(u);
}
async function auth(req){const token=String(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!/^[a-f0-9]{64}$/.test(token))die('AUTH',401);
 const u=await row("SELECT u.id,u.employee_code,u.name,u.role::text AS role,u.active,u.token_version,u.must_change FROM mt_sessions s JOIN mt_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.token_version=u.token_version AND u.active",[sha(token)]);
 if(!u)die('AUTH',401);return u;
}
async function getInit(){const rs=await Promise.all([
 pool.query('SELECT name FROM mt_sections WHERE active ORDER BY id'),
 pool.query('SELECT s.name AS section,m.name FROM mt_machines m JOIN mt_sections s ON s.id=m.section_id WHERE m.active AND s.active ORDER BY m.id'),
 pool.query('SELECT s.name AS section,c.name FROM mt_components c JOIN mt_sections s ON s.id=c.section_id WHERE c.active AND s.active ORDER BY c.id'),
 pool.query('SELECT name FROM mt_statuses WHERE active ORDER BY name'),
 pool.query('SELECT name FROM mt_categories WHERE active ORDER BY name'),pool.query('SELECT name FROM mt_technicians WHERE active ORDER BY name')]);
 return {id:'—',sections:rs[0].rows.map(r=>r.name),machines:rs[1].rows.map(r=>[r.section,r.name]),parts:rs[2].rows.map(r=>[r.section,r.name]),status:rs[3].rows.map(r=>r.name),cats:rs[4].rows.map(r=>r.name),technicians:rs[5].rows.map(r=>r.name)};
}
function reportInput(b){const f={cid:uuid(b.cid),section:text(b.section,1,100,'INVALID_SECTION'),machine:text(b.machine,1,100,'INVALID_MACHINE'),comp:text(b.comp,1,100,'INVALID_COMPONENT'),desc:text(b.desc,1,2000,'INVALID_DESCRIPTION'),solution:text(b.solution,1,4000,'INVALID_SOLUTION'),spare:text(String(b.spare||''),0,500,'INVALID_SPARE'),date:day(b.date),t1:clock(b.t1),t2:clock(b.t2),t3:clock(b.t3),status:text(b.status,1,80,'INVALID_STATUS'),cat:text(b.cat,1,80,'INVALID_CATEGORY')};
 if(((mins(f.t2)-mins(f.t1)+1440)%1440)+((mins(f.t3)-mins(f.t2)+1440)%1440)>1440)die('INVALID_WORK_CHRONOLOGY');return f;}
async function submit(u,b){permit(u,'report.create');const f=reportInput(b),fingerprint=sha(JSON.stringify({user:u.id,...f}));
 return transaction(async c=>{
  const prior=await first(c,'SELECT wo_number,request_digest FROM mt_reports WHERE client_request_id=$1',[f.cid]);
  if(prior){if(prior.request_digest!==fingerprint)die('IDEMPOTENCY_CONFLICT',409);return {id:woid(prior.wo_number),duplicate:true};}
  const r=await first(c,'SELECT s.id AS section_id,m.id AS machine_id,p.id AS component_id FROM mt_sections s JOIN mt_machines m ON m.section_id=s.id AND m.name=$2 AND m.active JOIN mt_components p ON p.section_id=s.id AND btrim(p.name)=$3 AND p.active WHERE s.name=$1 AND s.active',[f.section,f.machine,f.comp]);
  if(!r)die('INVALID_SECTION_MACHINE_COMPONENT');
  const [status,cat]=await Promise.all([first(c,'SELECT name FROM mt_statuses WHERE name=$1 AND active',[f.status]),first(c,'SELECT name FROM mt_categories WHERE name=$1 AND active',[f.cat])]);if(!status||!cat)die('INVALID_STATUS_OR_CATEGORY');
  const inserted=await first(c,'INSERT INTO mt_reports(client_request_id,request_digest,creator_id,section_id,machine_id,component_id,description,solution,spare_parts,incident_date,report_time,work_start_time,work_end_time,status,category) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(client_request_id) DO NOTHING RETURNING id,wo_number',[f.cid,fingerprint,u.id,r.section_id,r.machine_id,r.component_id,f.desc,f.solution,f.spare,f.date,f.t1,f.t2,f.t3,f.status,f.cat]);
  if(!inserted){const dupe=await first(c,'SELECT wo_number,request_digest FROM mt_reports WHERE client_request_id=$1',[f.cid]);if(!dupe||dupe.request_digest!==fingerprint)die('IDEMPOTENCY_CONFLICT',409);return {id:woid(dupe.wo_number),duplicate:true};}
  const label=woid(inserted.wo_number);
  await c.query("INSERT INTO mt_notifications(recipient_id,source_id,type,title,description,target) VALUES($1,$2,'report',$3,$4,'report') ON CONFLICT DO NOTHING",[u.id,label,'تم تسجيل البلاغ '+label,f.desc]);
  await c.query("INSERT INTO mt_audit(actor_id,action,entity,entity_id) VALUES($1,'report.created','report',$2)",[u.id,String(inserted.id)]);
  return {id:label,duplicate:false};
 });}
async function dashboard(u,b){permit(u,'dashboard.view');const y=Number(b.year),m=Number(b.month);
 if(!Number.isInteger(y)||y<2000||y>2100||!Number.isInteger(m)||m<1||m>12)die('INVALID_MONTH');
 const a=y+'-'+String(m).padStart(2,'0')+'-01',z=m===12?(y+1)+'-01-01':y+'-'+String(m+1).padStart(2,'0')+'-01';
 const r=await pool.query("SELECT r.wo_number,r.legacy_wo,to_char(r.incident_date,'YYYY-MM-DD') AS incident_date,r.report_time::text,r.work_start_time::text,r.work_end_time::text,r.status,r.category,s.name AS section,m.name AS machine FROM mt_reports r LEFT JOIN mt_sections s ON s.id=r.section_id LEFT JOIN mt_machines m ON m.id=r.machine_id WHERE r.incident_date >=$1::date AND r.incident_date<$2::date AND NOT r.is_test AND r.deleted_at IS NULL",[a,z]);
 const machines=new Map(),sections=new Map(),categories=new Map(),daily=new Map(),items=[];let downtime=0,done=0,responseTotal=0,responseN=0,elapsedTotal=0;
 const add=(map,key,hours)=>{const name=key||'غير محدد',v=map.get(name)||{name,count:0,hours:0,complete:0};v.count++;if(hours!==null){v.hours+=hours;v.complete++}map.set(name,v)};
 for(const t of r.rows){const a=mins(t.report_time),b=mins(t.work_start_time),c=mins(t.work_end_time),h=span(b,c),rt=span(a,b),et=span(a,c),date=iso(t.incident_date),item={id:t.legacy_wo||woid(t.wo_number),section:t.section,machine:t.machine,date,hours:h,response:rt,elapsed:et,status:t.status,category:t.category};
  items.push(item);add(machines,item.machine,h);add(sections,item.section,h);add(categories,item.category,h);add(daily,date,h);
  if(h!==null){downtime+=h;done++}if(rt!==null){responseTotal+=rt;responseN++}if(et!==null)elapsedTotal+=et;}
 const tab=mp=>[...mp.values()].map(x=>({...x,hours:round(x.hours)})).sort((a,b)=>b.hours-a.hours||b.count-a.count||a.name.localeCompare(b.name));
 // Restricted technician API view — no machine/section trends, MTTR, or recent report details.
 if(u.role==='technician')return {year:y,month:m,limited:true,count:items.length,totalDowntime:round(downtime),categoryTable:tab(categories)};
 items.sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id,undefined,{numeric:true}));
 return {year:y,month:m,count:items.length,totalDowntime:round(downtime),mttr:done?round(downtime/done):null,machineCount:tab(machines).filter(x=>x.complete>0).length,topMachines:tab(machines).filter(x=>x.complete>0).slice(0,5).map(x=>({machine:x.name,hours:x.hours})),sectionHours:tab(sections).filter(x=>x.complete>0).map(x=>({section:x.name,hours:x.hours})),avgResponse:responseN?round(responseTotal/responseN):null,totalElapsed:round(elapsedTotal),machineTable:tab(machines),sectionTable:tab(sections),categoryTable:tab(categories),daily:tab(daily).sort((a,b)=>a.name.localeCompare(b.name)),dataQuality:{complete:done,incomplete:items.length-done},recent:items.slice(0,20)};}
async function profile(u){permit(u,'profile.view');const r=await row('SELECT u.employee_code AS code,u.name,u.role::text AS role,u.department,u.job_title AS "jobTitle",u.preferred_name AS "preferredName",u.phone,b.days::float AS "leaveBalance" FROM mt_users u LEFT JOIN mt_leave_balances b ON b.user_id=u.id WHERE u.id=$1',[u.id]);return {profile:{...r,leaveBalance:r.leaveBalance??null}};}
// Both journals are additive and append-only: earned/used overtime and owner adjustments.
async function readSubstituteMinutes(c,userId){
 const b=await first(c,'SELECT (SELECT COALESCE(SUM(delta_minutes),0) FROM mt_substitute_time_ledger WHERE user_id=$1)+(SELECT COALESCE(SUM(delta_minutes),0) FROM mt_substitute_time_adjustments WHERE user_id=$1) AS minutes',[userId]);
 return Number(b?.minutes||0);
}
function leaveView(r){return {id:r.public_id,code:r.employee_code,name:r.name,type:r.type,start:iso(r.start_date),end:iso(r.end_date),days:Number(r.days),durationKind:r.duration_kind||'FULL_DAY',reason:r.reason,status:r.status,createdAt:r.created_at,decidedAt:r.decided_at,decidedBy:r.decider_code??'',decisionReason:r.decision_reason??''};}
const leaveSelect="SELECT l.public_id,l.type,l.start_date,l.end_date,l.days,l.duration_kind,l.reason,l.status,l.created_at,l.decided_at,l.decision_reason,u.employee_code,u.name,d.employee_code AS decider_code FROM mt_leave_requests l JOIN mt_users u ON u.id=l.requester_id LEFT JOIN mt_users d ON d.id=l.decided_by";
async function leaveRequest(u,b){permit(u,'leave.request');const start=day(b.start),end=day(b.end);
 const type=text(b.type,1,30,'INVALID_LEAVE_TYPE'),durationKind=String(b.durationKind||'FULL_DAY');
 if(!['annual','casual','sick','other','compensatory'].includes(type))die('INVALID_LEAVE_TYPE');
 if(!['FULL_DAY','HALF_DAY'].includes(durationKind))die('INVALID_LEAVE_DURATION');
 const daySpan=Math.round((new Date(end+'T00:00:00Z')-new Date(start+'T00:00:00Z'))/86400000)+1;
 const half=durationKind==='HALF_DAY';
 if(half&&(start!==end||!['annual','compensatory'].includes(type)))die('HALF_DAY_NOT_ALLOWED');
 if(type==='compensatory'&&!half)die('LEAVE_POLICY_PENDING');
 const days=half?0.5:daySpan;if(days<0.5||days>60)die('INVALID_LEAVE_DURATION');
 const f={cid:uuid(b.cid),start,end,days,type,reason:text(String(b.reason??''),0,500,'INVALID_REASON')};
 const digest=sha(JSON.stringify({user:u.id,...f,...(half?{durationKind}:{})})); // keep legacy full-day digest
 return transaction(async c=>{
  const old=await first(c,'SELECT public_id,days,status,request_digest FROM mt_leave_requests WHERE client_request_id=$1',[f.cid]);
  if(old){if(old.request_digest!==digest)die('IDEMPOTENCY_CONFLICT',409);return {ok:true,id:old.public_id,days:old.days,status:old.status,duplicate:true};}
  // Serialize same-employee requests; reject overlapping PENDING/APPROVED dates.
  await c.query('SELECT id FROM mt_users WHERE id=$1 FOR UPDATE',[u.id]);
  const overlap=await first(c,"SELECT public_id FROM mt_leave_requests WHERE requester_id=$1 AND status IN ('PENDING','APPROVED') AND start_date<=$3::date AND end_date>=$2::date LIMIT 1",[u.id,start,end]);
  if(overlap)die('OVERLAPPING_LEAVE_REQUEST',409);
  if(type==='compensatory'){
   const bank={minutes:await readSubstituteMinutes(c,u.id)};
   if(Number(bank.minutes)<240)die('INSUFFICIENT_SUBSTITUTE_BALANCE');
  }else{
   const bal=await first(c,'SELECT days FROM mt_leave_balances WHERE user_id=$1',[u.id]);
   if(!bal)die('LEAVE_BALANCE_NOT_SET');if(Number(bal.days)<days)die('INSUFFICIENT_LEAVE_BALANCE');
  }
  const publicId='LV-'+randomUUID().slice(0,8).toUpperCase();
  const r=await first(c,'INSERT INTO mt_leave_requests(public_id,requester_id,client_request_id,request_digest,type,start_date,end_date,days,reason,duration_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(client_request_id) DO NOTHING RETURNING public_id,days,status',[publicId,u.id,f.cid,digest,type,start,end,days,f.reason,durationKind]);
  if(!r){const x=await first(c,'SELECT public_id,days,status,request_digest FROM mt_leave_requests WHERE client_request_id=$1',[f.cid]);if(!x||x.request_digest!==digest)die('IDEMPOTENCY_CONFLICT',409);return {ok:true,id:x.public_id,days:x.days,status:x.status,duplicate:true};}
  await c.query("INSERT INTO mt_audit(actor_id,action,entity,entity_id) VALUES($1,'leave.requested','leave',$2)",[u.id,publicId]);
  return {ok:true,id:publicId,days,status:'PENDING'};
 });}
async function decision(u,b){permit(u,'leave.approve');const publicId=text(b.id,11,80,'INVALID_LEAVE_ID'),d=String(b.decision),reason=text(String(b.reason??''),0,500,'INVALID_REASON');if(!['APPROVED','REJECTED'].includes(d))die('INVALID_LEAVE_DECISION');
 return transaction(async c=>{
  const req=await first(c,'SELECT * FROM mt_leave_requests WHERE public_id=$1 FOR UPDATE',[publicId]);if(!req)die('LEAVE_NOT_FOUND',404);
  if(req.status!=='PENDING'){if(req.status===d)return {ok:true,id:publicId,status:d,balanceAfter:req.balance_after==null?null:Number(req.balance_after),duplicate:true};die('LEAVE_ALREADY_DECIDED',409);}
  let before=null,after=null;
 if(req.type==='compensatory'){
  if(req.duration_kind!=='HALF_DAY'||Number(req.days)!==0.5)die('LEAVE_POLICY_PENDING');
  // Serialize consumption against other approved substitute-time operations.
  await c.query('SELECT id FROM mt_users WHERE id=$1 FOR UPDATE',[req.requester_id]);
  const bank={minutes:await readSubstituteMinutes(c,req.requester_id)};
  before=Number(bank.minutes)/60;
  after=d==='APPROVED'?before-4:before;
  if(d==='APPROVED'&&Number(bank.minutes)<240)die('INSUFFICIENT_SUBSTITUTE_BALANCE');
  if(d==='APPROVED'){
   await c.query('INSERT INTO mt_substitute_time_ledger(user_id,delta_minutes,leave_id,approved_by) VALUES($1,-240,$2,$3)',[req.requester_id,req.id,u.id]);
  }
 }else{
  const bal=await first(c,'SELECT days FROM mt_leave_balances WHERE user_id=$1 FOR UPDATE',[req.requester_id]);
  if(!bal)die('LEAVE_BALANCE_NOT_SET');
  before=Number(bal.days);
  if(d==='APPROVED'&&before<Number(req.days))die('INSUFFICIENT_LEAVE_BALANCE');
  after=d==='APPROVED'?round(before-Number(req.days)):before;
  if(d==='APPROVED'){
   await c.query('UPDATE mt_leave_balances SET days=$1 WHERE user_id=$2',[after,req.requester_id]);
   await c.query('INSERT INTO mt_leave_ledger(request_id,user_id,delta,balance_after,approved_by) VALUES($1,$2,$3,$4,$5)',[req.id,req.requester_id,-Number(req.days),after,u.id]);
  }
 }
 await c.query('UPDATE mt_leave_requests SET status=$1,decided_at=now(),decided_by=$2,decision_reason=$3,balance_before=$4,balance_after=$5 WHERE id=$6',[d,u.id,reason,before,after,req.id]);
  await c.query("INSERT INTO mt_notifications(recipient_id,source_id,type,title,description,target) VALUES($1,$2,'leaveDecision',$3,$4,'leave') ON CONFLICT DO NOTHING",[req.requester_id,publicId,d==='APPROVED'?'تم اعتماد الإجازة':'تم رفض الإجازة',publicId+(reason?' — '+reason:'')]);
  await c.query('INSERT INTO mt_audit(actor_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5::jsonb)',[u.id,'leave.'+d.toLowerCase(),'leave',publicId,JSON.stringify({days:req.days,before,after})]);
  return {ok:true,id:publicId,status:d,balanceAfter:after};
 });}
async function notifications(u){
 permit(u,'profile.view');
 const [saved,pending,approvals]=await Promise.all([
  pool.query('SELECT id::text,source_id,title,description,target,created_at,read_at FROM mt_notifications WHERE recipient_id=$1 ORDER BY created_at DESC,id DESC LIMIT 5',[u.id]),
  u.role==='owner'?pool.query("SELECT count(*)::int AS n FROM mt_leave_requests WHERE status='PENDING'"):Promise.resolve({rows:[{n:0}]}),
  u.role==='owner'?pool.query("SELECT l.public_id,l.type,l.reason,l.days,l.start_date,l.end_date,l.created_at,u.name FROM mt_leave_requests l JOIN mt_users u ON u.id=l.requester_id WHERE l.status='PENDING' ORDER BY l.created_at ASC LIMIT 5"):Promise.resolve({rows:[]})
 ]);
 const storedItems=saved.rows.map(x=>({id:x.id,sourceId:x.source_id,title:x.title,description:x.description,createdAt:x.created_at,read:!!x.read_at,target:x.target}));
 const pendingItems=approvals.rows.map(x=>({id:'REQ-'+x.public_id,requestId:x.public_id,title:x.name+' طلب إجازة',description:'من '+iso(x.start_date)+' إلى '+iso(x.end_date)+' • '+x.days+' يوم',createdAt:x.created_at,read:false,target:'leaveDecision',leave:{id:x.public_id,name:x.name,type:x.type,reason:x.reason,start:iso(x.start_date),end:iso(x.end_date),days:Number(x.days)}}));
 const savedUnreadCount=storedItems.filter(x=>!x.read).length;
 const pendingCount=Number(pending.rows[0]?.n||0);
 return {
  // Compatibility with the old Pilot UI until the new frontend rollout finishes.
  items:pendingItems.concat(storedItems).slice(0,5),
  storedItems,pendingItems,savedUnreadCount,pendingCount,
  unreadCount:savedUnreadCount+pendingCount,
  retainedCount:storedItems.length,
  refreshedAt:new Date().toISOString()
 };
}

async function catalogAdmin(u,b){
 permit(u,'users.manage');
 const names={sections:'mt_sections',machines:'mt_machines',parts:'mt_components',technicians:'mt_technicians',categories:'mt_categories',statuses:'mt_statuses'};
 const kind=String(b.kind||''),table=names[kind];if(!table)die('INVALID_CATALOG');
 const scoped=kind==='machines'||kind==='parts';
 if(b.action==='adminCatalog'){
  const sql=scoped?'SELECT t.id,t.name,t.active,s.name AS section FROM '+table+' t JOIN mt_sections s ON s.id=t.section_id ORDER BY s.name,t.name':'SELECT id,name,active FROM '+table+' ORDER BY name';
  return {items:(await pool.query(sql)).rows};
 }
 const op=String(b.operation||'');if(!['create','rename','toggle'].includes(op))die('INVALID_OPERATION');
 const name=op==='toggle'?'':text(b.name,1,100,'INVALID_NAME');if(/[<>]/.test(name))die('INVALID_NAME');
 if(op==='create')return transaction(async c=>{
  let item;
  if(scoped){const section=text(b.section,1,100,'INVALID_SECTION'),parent=await first(c,'SELECT id FROM mt_sections WHERE name=$1 AND active',[section]);if(!parent)die('INVALID_SECTION');
   item=await first(c,'INSERT INTO '+table+'(section_id,name,active) VALUES($1,$2,true) ON CONFLICT(section_id,name) DO UPDATE SET active=true RETURNING id',[parent.id,name]);
  }else item=await first(c,'INSERT INTO '+table+'(name,active) VALUES($1,true) ON CONFLICT(name) DO UPDATE SET active=true RETURNING id',[name]);
  return {ok:true,id:item.id};
 });
 const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)die('INVALID_ID');
 return transaction(async c=>{
  const old=await first(c,'SELECT id,name FROM '+table+' WHERE id=$1 FOR UPDATE',[id]);if(!old)die('NOT_FOUND',404);
  if(op==='rename'){
   if(kind==='categories'||kind==='statuses'){
    const used=await first(c,'SELECT 1 FROM mt_reports WHERE '+(kind==='categories'?'category':'status')+'=$1 LIMIT 1',[old.name]);if(used)die('NAME_REFERENCED_BY_REPORTS',409);
   }
   try{await c.query('UPDATE '+table+' SET name=$1 WHERE id=$2',[name,id]);}catch(e){if(e.code==='23505')die('NAME_EXISTS',409);throw e;}
  }else{if(typeof b.active!=='boolean')die('INVALID_ACTIVE');await c.query('UPDATE '+table+' SET active=$1 WHERE id=$2',[b.active,id]);}
  return {ok:true,id};
 });
}


async function employeeAdmin(u,b){
 permit(u,'users.manage');
 const code=text(b.code,2,32,'INVALID_CODE').toUpperCase();
 if(!/^[A-Z0-9_-]+$/.test(code))die('INVALID_CODE');
 const password=randomBytes(12).toString('base64url');
 return transaction(async c=>{
  let record;
  if(b.action==='adminCreateEmployee'){
   const name=text(b.name,2,100,'INVALID_NAME'),role=String(b.role||'technician');
   if(!['technician','engineer'].includes(role))die('INVALID_ROLE');
   record=await first(c,"INSERT INTO mt_users(employee_code,name,role,active,password_hash,must_change) VALUES($1,$2,$3,true,extensions.crypt($4,extensions.gen_salt('bf',11)),true) ON CONFLICT(employee_code) DO NOTHING RETURNING id",[code,name,role,password]);
   if(!record)die('EMPLOYEE_EXISTS',409);
  }else{
   record=await first(c,"UPDATE mt_users SET password_hash=extensions.crypt($1,extensions.gen_salt('bf',11)),must_change=true,token_version=token_version+1,updated_at=now() WHERE employee_code=$2 AND role<>'owner' RETURNING id",[password,code]);
   if(!record)die('EMPLOYEE_NOT_FOUND',404);
   await c.query('DELETE FROM mt_sessions WHERE user_id=$1',[record.id]);
  }
  await c.query("INSERT INTO mt_audit(actor_id,action,entity,entity_id) VALUES($1,$2,'user',$3)",[u.id,b.action==='adminCreateEmployee'?'user.created':'user.password_reset',String(record.id)]);
  return {ok:true,code,temporaryPassword:password,mustChange:true};
 });
}


// CMMS Pilot: owner-only, read-only endpoints. Existing report/leave/notification APIs unchanged.
// Repair time is NOT equipment downtime; MTBF is deliberately not inferred.
const cmmsFrom = " FROM mt_reports r LEFT JOIN mt_sections s ON s.id=r.section_id LEFT JOIN mt_machines m ON m.id=r.machine_id LEFT JOIN mt_components c ON c.id=r.component_id LEFT JOIN mt_users u ON u.id=r.creator_id ";
const cmmsCols = "r.wo_number AS \"woNumber\",COALESCE(NULLIF(r.legacy_wo,''),'WO-'||CASE WHEN r.wo_number<10 THEN '0' ELSE '' END||r.wo_number::text) AS \"woId\",to_char(r.incident_date,'YYYY-MM-DD') AS \"date\",COALESCE(s.name,'') AS section,COALESCE(m.name,'') AS machine,r.machine_id AS \"machineId\",COALESCE(c.name,'') AS component,r.description,r.solution,r.spare_parts AS \"spareParts\",r.report_time::text AS \"reportTime\",r.work_start_time::text AS \"workStart\",r.work_end_time::text AS \"workEnd\",r.status,r.category,r.assigned_technician AS technician,COALESCE(u.employee_code,'') AS \"creatorCode\",r.is_test AS \"isTest\",r.workflow_state AS \"workflowState\",r.revision,r.updated_at AS \"updatedAt\",r.legacy_wo IS NOT NULL AS imported,r.created_at AS \"createdAt\",r.facility";
const cmmsBool=v=>v===true;
const cmmsPositive=(v,name)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<=0)die('INVALID_'+name);return n};
const cmmsSource=(b)=>{const v=String(b.source||'all');if(!['all','legacy','pilot'].includes(v))die('INVALID_SOURCE');return v};
const cmmsLimits=(b)=>{const limit=Number(b.limit||25),offset=Number(b.offset||0);if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>100000)die('INVALID_PAGINATION');return {limit,offset}};
function cmmsReport(row){
 const h=span(mins(row.workStart),mins(row.workEnd));
 const responseTime=span(mins(row.reportTime),mins(row.workStart));
 return {...row,repairHours:h,responseHours:responseTime};
}
async function cmms(u,b){
 permit(u,'users.manage');
 const mode=String(b.mode||'list');
 if(mode==='machines'){
  const r=await pool.query("SELECT m.id,m.name,s.name AS section,m.active,count(r.id)::int AS reports,count(r.id) FILTER(WHERE NOT r.is_test)::int AS \"analysisReports\" FROM mt_machines m JOIN mt_sections s ON s.id=m.section_id LEFT JOIN mt_reports r ON r.machine_id=m.id AND r.deleted_at IS NULL GROUP BY m.id,m.name,s.name,m.active ORDER BY s.name,m.name");
  return {items:r.rows};
 }
 if(mode==='list'){
  const {limit,offset}=cmmsLimits(b),source=cmmsSource(b),q=text(String(b.q||''),0,80,'INVALID_SEARCH'),section=text(String(b.section||''),0,100,'INVALID_SECTION');
  const machineId=b.machineId?cmmsPositive(b.machineId,'MACHINE_ID'):null;
  const from=b.from?day(b.from):null,to=b.to?day(b.to):null;if(from&&to&&from>to)die('INVALID_DATE_RANGE');
  const params=[q,section,machineId,source,from,to,limit,offset];
  const sql="SELECT "+cmmsCols+",count(*) OVER()::int AS \"totalCount\""+cmmsFrom+
   " WHERE r.deleted_at IS NULL AND ($1='' OR r.description ILIKE '%'||$1||'%' OR r.assigned_technician ILIKE '%'||$1||'%' OR (COALESCE(NULLIF(r.legacy_wo,''),'WO-'||r.wo_number::text)) ILIKE '%'||$1||'%' OR m.name ILIKE '%'||$1||'%')"+
   " AND ($2='' OR s.name=$2) AND ($3::bigint IS NULL OR r.machine_id=$3)"+
   " AND ($4='all' OR ($4='legacy' AND r.legacy_wo IS NOT NULL) OR ($4='pilot' AND r.legacy_wo IS NULL))"+
   " AND ($5::date IS NULL OR r.incident_date >= $5::date) AND ($6::date IS NULL OR r.incident_date <= $6::date)"+
   " ORDER BY r.wo_number DESC LIMIT $7 OFFSET $8";
  const rows=(await pool.query(sql,params)).rows;
  return {items:rows.map(cmmsReport),total:rows[0]?.totalCount??0,limit,offset};
 }
 if(mode==='detail'){
  const wo=cmmsPositive(b.woNumber,'WO_NUMBER');
  const r=await row("SELECT "+cmmsCols+cmmsFrom+" WHERE r.wo_number=$1 AND r.deleted_at IS NULL",[wo]);
  if(!r)die('REPORT_NOT_FOUND',404);
  return {item:cmmsReport(r)};
 }
 if(mode==='history'){
  const machineId=cmmsPositive(b.machineId,'MACHINE_ID');
  const machine=await row("SELECT m.id,m.name,s.name AS section,m.active FROM mt_machines m JOIN mt_sections s ON s.id=m.section_id WHERE m.id=$1",[machineId]);
  if(!machine)die('MACHINE_NOT_FOUND',404);
  const includeTests=cmmsBool(b.includeTests);
  const rows=(await pool.query("SELECT "+cmmsCols+cmmsFrom+" WHERE r.machine_id=$1 AND r.deleted_at IS NULL AND ($2::boolean OR NOT r.is_test) ORDER BY r.incident_date DESC,r.wo_number DESC LIMIT 500",[machineId,includeTests])).rows.map(cmmsReport);
  const categories={},components={};let repairHours=0,repairCount=0,responseHours=0,responseCount=0;
  for(const item of rows){categories[item.category]=(categories[item.category]||0)+1;components[item.component||'غير محدد']=(components[item.component||'غير محدد']||0)+1;if(item.repairHours!==null){repairHours+=item.repairHours;repairCount++;}if(item.responseHours!==null){responseHours+=item.responseHours;responseCount++;}}
  return {machine,items:rows,totalShown:rows.length,limited:rows.length===500,summary:{reports:rows.length,repairHours:round(repairHours),mttr:repairCount?round(repairHours/repairCount):null,avgResponse:responseCount?round(responseHours/responseCount):null,categories:Object.entries(categories).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count),components:Object.entries(components).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count)}};
 }
 if(mode==='analytics'){
  const from=b.from?day(b.from):null,to=b.to?day(b.to):null;if(from&&to&&from>to)die('INVALID_DATE_RANGE');
  const includeTests=cmmsBool(b.includeTests),source=cmmsSource(b);
  const sql="SELECT "+cmmsCols+cmmsFrom+" WHERE r.deleted_at IS NULL AND ($1::date IS NULL OR r.incident_date >= $1::date) AND ($2::date IS NULL OR r.incident_date <= $2::date)"+
   " AND ($3::boolean OR NOT r.is_test) AND ($4='all' OR ($4='legacy' AND r.legacy_wo IS NOT NULL) OR ($4='pilot' AND r.legacy_wo IS NULL)) ORDER BY r.wo_number DESC LIMIT 10001";
  const all=(await pool.query(sql,[from,to,includeTests,source])).rows;
  const truncated=all.length>10000,items=all.slice(0,10000).map(cmmsReport),months=new Map(),machines=new Map(),sections=new Map(),categories=new Map();
  let totalRepair=0,repairCount=0,totalResponse=0,responseCount=0,legacyCount=0,pilotCount=0;
  const add=(map,name,hours)=>{const key=name||'غير محدد',r=map.get(key)||{name:key,count:0,hours:0};r.count++;if(hours!==null)r.hours+=hours;map.set(key,r);};
  for(const r of items){
   const hr=r.repairHours,resp=r.responseHours;if(hr!==null){totalRepair+=hr;repairCount++;}if(resp!==null){totalResponse+=resp;responseCount++;}
   if(r.imported)legacyCount++;else pilotCount++;
   add(months,r.date.slice(0,7),hr);add(sections,r.section,hr);add(machines,r.section+' / '+r.machine,hr);add(categories,r.category,hr);
  }
  const sorted=map=>[...map.values()].map(x=>({...x,hours:round(x.hours)})).sort((a,b)=>b.hours-a.hours||b.count-a.count);
  return {data:{total:items.length,legacyCount,pilotCount,totalRepairHours:round(totalRepair),mttr:repairCount?round(totalRepair/repairCount):null,avgResponseHours:responseCount?round(totalResponse/responseCount):null,measuredRepairCount:repairCount,distinctMachines:machines.size,months:[...months.values()].map(x=>({...x,hours:round(x.hours)})).sort((a,b)=>a.name.localeCompare(b.name)),sections:sorted(sections),machines:sorted(machines),categories:sorted(categories)},filters:{from,to,source,includeTests},truncated,notes:["Repair Hours=work end minus work start (midnight wrap). It is not proven equipment downtime.","MTBF requires operating hours/runtime data; deliberately unavailable.","Pilot-created reports not tagged as test may appear in analysis."]};
 }
 die('INVALID_CMMS_MODE');
}


/* CMMS Phase 2: authenticated owner mutations with revision concurrency and append-only audit.
   Lifecycle is deliberately separate from imported status/category columns. */
const cmmsNotes=(value,min,max,code)=>{if(typeof value!=='string')die(code);const v=value.replace(/\r\n?/g,'\n').trim();if(v.length<min||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))die(code);return v;};
async function cmmsWrite(u,b){
 permit(u,'users.manage');
 const wo=cmmsPositive(b.woNumber,'WO_NUMBER');
 const revision=cmmsPositive(b.revision,'REVISION');
 const operation=String(b.operation||'');
 if(!['edit','close','reopen'].includes(operation))die('INVALID_CMMS_OPERATION');
 const reason=cmmsNotes(String(b.reason||''),3,500,'INVALID_EDIT_REASON');
 return transaction(async c=>{
  const r=await first(c,'SELECT id,wo_number,revision,workflow_state,description,solution,spare_parts,status,category FROM mt_reports WHERE wo_number=$1 AND deleted_at IS NULL FOR UPDATE',[wo]);
  if(!r)die('REPORT_NOT_FOUND',404);
  if(Number(r.revision)!==revision)die('WO_VERSION_CONFLICT',409);
  if(operation==='edit'&&r.workflow_state==='CLOSED')die('CLOSED_WO_REOPEN_REQUIRED',409);
  if(operation==='reopen'&&r.workflow_state!=='CLOSED')die('WO_NOT_CLOSED',409);
  const oldValues={description:r.description,solution:r.solution,spareParts:r.spare_parts,status:r.status,category:r.category,workflowState:r.workflow_state};
  let newValues={...oldValues};
  if(operation==='edit'){
   const description=cmmsNotes(b.description,1,2000,'INVALID_DESCRIPTION');
   const solution=cmmsNotes(String(b.solution??''),0,4000,'INVALID_SOLUTION');
   const spareParts=text(String(b.spareParts??''),0,500,'INVALID_SPARE');
   const status=text(b.status,1,80,'INVALID_STATUS');
   const category=text(b.category,1,80,'INVALID_CATEGORY');
   if(status!==r.status){
    const exists=await first(c,'SELECT 1 AS found FROM mt_statuses WHERE name=$1 AND active',[status]);
    if(!exists)die('INVALID_STATUS');
   }
   if(category!==r.category){
    const exists=await first(c,'SELECT 1 AS found FROM mt_categories WHERE name=$1 AND active',[category]);
    if(!exists)die('INVALID_CATEGORY');
   }
   newValues={...oldValues,description,solution,spareParts,status,category};
   if(['description','solution','spareParts','status','category'].every(key=>newValues[key]===oldValues[key]))die('NO_CHANGES');
   await c.query('UPDATE mt_reports SET description=$1,solution=$2,spare_parts=$3,status=$4,category=$5,revision=revision+1,updated_at=now() WHERE id=$6',[description,solution,spareParts,status,category,r.id]);
  }else{
   const goal=operation==='close'?'CLOSED':'OPEN';
   if(r.workflow_state===goal)die(operation==='close'?'ALREADY_CLOSED':'ALREADY_OPEN');
   newValues.workflowState=goal;
   await c.query('UPDATE mt_reports SET workflow_state=$1,revision=revision+1,updated_at=now() WHERE id=$2',[goal,r.id]);
  }
  const auditDetails={source:'maintrack-cmms-pilot',operation,reason,woNumber:wo,previousRevision:revision,nextRevision:revision+1,before:oldValues,after:newValues};
  await c.query("INSERT INTO mt_audit(actor_id,action,entity,entity_id,details) VALUES($1,$2,'report',$3,$4::jsonb)",[u.id,'wo.'+operation,String(r.id),JSON.stringify(auditDetails)]);
  return {ok:true,woNumber:wo,revision:revision+1,workflowState:newValues.workflowState,operation};
 });
}

/** Owner-only reversible archive; an audited transaction, not a physical delete. */
async function cmmsDelete(u,b){
 if(u.role!=='owner')die('FORBIDDEN',403);
 permit(u,'users.manage');
 const wo=cmmsPositive(b.woNumber,'WO_NUMBER');
 const revision=cmmsPositive(b.revision,'REVISION');
 const reason=cmmsNotes(String(b.reason||''),3,500,'INVALID_DELETE_REASON');
 return transaction(async c=>{
  const r=await first(c,'SELECT id,wo_number,revision,deleted_at,workflow_state,is_test FROM mt_reports WHERE wo_number=$1 FOR UPDATE',[wo]);
  if(!r)die('REPORT_NOT_FOUND',404);
  if(r.deleted_at)die('REPORT_ALREADY_DELETED',409);
  if(Number(r.revision)!==revision)die('WO_VERSION_CONFLICT',409);
  const updated=await first(c,'UPDATE mt_reports SET deleted_at=now(),deleted_by=$1,delete_reason=$2,revision=revision+1,updated_at=now() WHERE id=$3 AND deleted_at IS NULL RETURNING id,wo_number,revision,deleted_at',[u.id,reason,r.id]);
  if(!updated)die('REPORT_ALREADY_DELETED',409);
  const details={source:'maintrack-pilot',operation:'delete',reason,woNumber:wo,previousRevision:revision,nextRevision:revision+1,softDeleted:true,oldWorkflowState:r.workflow_state,isTest:r.is_test};
  await c.query("INSERT INTO mt_audit(actor_id,action,entity,entity_id,details) VALUES($1,'wo.delete','report',$2,$3::jsonb)",[u.id,String(r.id),JSON.stringify(details)]);
  return {ok:true,woNumber:wo,revision:revision+1,archived:true};
 });
}

async function cmmsAudit(u,b){
 permit(u,'users.manage');
 const wo=cmmsPositive(b.woNumber,'WO_NUMBER');
 const report=await row('SELECT id FROM mt_reports WHERE wo_number=$1',[wo]);
 if(!report)die('REPORT_NOT_FOUND',404);
 const items=(await pool.query("SELECT a.id,a.action,a.details,a.created_at AS \"createdAt\",COALESCE(u.name,'System') AS \"actorName\",COALESCE(u.employee_code,'') AS \"actorCode\" FROM mt_audit a LEFT JOIN mt_users u ON u.id=a.actor_id WHERE a.entity='report' AND a.entity_id=$1 AND a.action IN ('wo.edit','wo.close','wo.reopen','wo.delete') ORDER BY a.created_at DESC,a.id DESC LIMIT 100",[String(report.id)])).rows;
 return {items};
}


const otSelect="SELECT o.id,o.public_id,o.work_date,o.start_time,o.end_time,o.minutes,o.compensation_kind,o.reason,o.status,o.created_at,o.decided_at,o.decision_reason,u.employee_code,u.name FROM mt_overtime_requests o JOIN mt_users u ON u.id=o.requester_id";
const otView=r=>({id:r.public_id,code:r.employee_code,name:r.name,date:iso(r.work_date),from:String(r.start_time).slice(0,5),to:String(r.end_time).slice(0,5),hours:round(Number(r.minutes)/60),compensation:r.compensation_kind,reason:r.reason,status:r.status,createdAt:r.created_at,decidedAt:r.decided_at,decisionReason:r.decision_reason||''});
async function overtimeMine(u){permit(u,'leave.request');
 const [history,bank,totals]=await Promise.all([
  pool.query(otSelect+' WHERE o.requester_id=$1 ORDER BY o.created_at DESC LIMIT 150',[u.id]),
  readSubstituteMinutes(pool,u.id),
  pool.query("SELECT COALESCE(SUM(minutes) FILTER (WHERE status='APPROVED' AND compensation_kind='FINANCIAL'),0)::integer AS financial,COALESCE(SUM(minutes) FILTER (WHERE status='APPROVED' AND compensation_kind='SUBSTITUTE'),0)::integer AS substitute FROM mt_overtime_requests WHERE requester_id=$1",[u.id])
 ]);
 return {items:history.rows.map(otView),hasMore:history.rows.length===150,
  substituteAvailableHours:round(Number(bank)/60),
  financialApprovedHours:round(Number(totals.rows[0].financial)/60),
  substituteApprovedHours:round(Number(totals.rows[0].substitute)/60)};
}
async function overtimeRequest(u,b){permit(u,'leave.request');const workDate=day(b.workDate),from=clock(b.from),to=clock(b.to),minutes=(mins(to)-mins(from)+1440)%1440;
 if(minutes<1||minutes>1439)die('INVALID_OVERTIME_DURATION');
 const compensation=text(b.compensation,1,20,'INVALID_OVERTIME_KIND');if(!['FINANCIAL','SUBSTITUTE'].includes(compensation))die('INVALID_OVERTIME_KIND');
 const f={cid:uuid(b.cid),workDate,from,to,minutes,compensation,reason:text(String(b.reason??''),0,500,'INVALID_REASON')};
 const digest=sha(JSON.stringify({user:u.id,...f}));
 return transaction(async c=>{
  const old=await first(c,'SELECT public_id,request_digest,status FROM mt_overtime_requests WHERE client_request_id=$1',[f.cid]);
  if(old){if(old.request_digest!==digest)die('IDEMPOTENCY_CONFLICT',409);return {ok:true,id:old.public_id,status:old.status,duplicate:true};}
  await c.query('SELECT id FROM mt_users WHERE id=$1 FOR UPDATE',[u.id]);
  const overlap=await first(c,"SELECT public_id FROM mt_overtime_requests WHERE requester_id=$1 AND status IN ('PENDING','APPROVED') AND tsrange(work_date+start_time,work_date+end_time+CASE WHEN end_time<=start_time THEN interval '1 day' ELSE interval '0 day' END,'[)') && tsrange($2::date+$3::time,$2::date+$4::time+CASE WHEN $4::time<=$3::time THEN interval '1 day' ELSE interval '0 day' END,'[)') LIMIT 1",[u.id,workDate,from,to]);
  if(overlap)die('OVERLAPPING_OVERTIME_REQUEST',409);
  const publicId='OT-'+randomUUID().slice(0,8).toUpperCase();
  const ins=await first(c,'INSERT INTO mt_overtime_requests(public_id,requester_id,client_request_id,request_digest,work_date,start_time,end_time,minutes,compensation_kind,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(client_request_id) DO NOTHING RETURNING public_id,status',[publicId,u.id,f.cid,digest,workDate,from,to,minutes,compensation,f.reason]);
  if(!ins){const existing=await first(c,'SELECT public_id,request_digest,status FROM mt_overtime_requests WHERE client_request_id=$1',[f.cid]);if(!existing||existing.request_digest!==digest)die('IDEMPOTENCY_CONFLICT',409);return {ok:true,id:existing.public_id,status:existing.status,duplicate:true};}
  await c.query("INSERT INTO mt_audit(actor_id,action,entity,entity_id) VALUES($1,'overtime.requested','overtime',$2)",[u.id,publicId]);return {ok:true,id:publicId,status:'PENDING'};
 });
}
async function overtimeDecision(u,b){permit(u,'leave.approve');
 const id=text(b.id,10,80,'INVALID_OVERTIME_ID'),decision=String(b.decision),reason=text(String(b.reason??''),0,500,'INVALID_REASON');
 if(!['APPROVED','REJECTED'].includes(decision))die('INVALID_LEAVE_DECISION');
 return transaction(async c=>{
  const r=await first(c,'SELECT * FROM mt_overtime_requests WHERE public_id=$1 FOR UPDATE',[id]);
  if(!r)die('OVERTIME_NOT_FOUND',404);
  if(r.status!=='PENDING'){if(r.status===decision)return {ok:true,id,status:decision,duplicate:true};die('OVERTIME_ALREADY_DECIDED',409);}
  if(decision==='APPROVED'&&r.compensation_kind==='SUBSTITUTE'){
   await c.query('SELECT id FROM mt_users WHERE id=$1 FOR UPDATE',[r.requester_id]);
   await c.query('INSERT INTO mt_substitute_time_ledger(user_id,delta_minutes,overtime_id,approved_by) VALUES($1,$2,$3,$4)',[r.requester_id,r.minutes,r.id,u.id]);}
  await c.query('UPDATE mt_overtime_requests SET status=$1,decided_by=$2,decided_at=now(),decision_reason=$3 WHERE id=$4',[decision,u.id,reason,r.id]);
  await c.query("INSERT INTO mt_notifications(recipient_id,source_id,type,title,description,target) VALUES($1,$2,'overtimeDecision',$3,$4,'leave') ON CONFLICT DO NOTHING",[r.requester_id,id,decision==='APPROVED'?'تم اعتماد الوقت الإضافي':'تم رفض الوقت الإضافي',id+(reason?' — '+reason:'')]);
  await c.query('INSERT INTO mt_audit(actor_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5::jsonb)',[u.id,'overtime.'+decision.toLowerCase(),'overtime',id,JSON.stringify({minutes:r.minutes,compensation:r.compensation_kind})]);
  return {ok:true,id,status:decision};
 });
}

async function dispatch(u,b){const a=b.action;switch(a){
 case 'session':permit(u,'profile.view');return {ok:true,role:u.role,name:u.name,must:false};
 case 'init':permit(u,'profile.view');return {...await getInit(),role:u.role,must:false};
 case 'nextId':permit(u,'report.create');{const x=await row('SELECT last_value,is_called FROM mt_wo_number_seq');return {id:woid(Number(x.last_value)+(x.is_called?1:0))};}
 case 'submit':return submit(u,b);
 case 'cmmsDelete':return cmmsDelete(u,b);
 case 'cmmsWrite':return cmmsWrite(u,b);
 case 'cmmsAudit':return cmmsAudit(u,b);
 case 'cmms':return cmms(u,b);
 case 'dashboard':return dashboard(u,b);
  case 'overtimeMine':return overtimeMine(u);
  case 'overtimeRequest':return overtimeRequest(u,b);
  case 'overtimeDecision':return overtimeDecision(u,b);
  case 'overtimeInbox':{permit(u,'leave.approve');const r=await pool.query(otSelect+" ORDER BY (o.status='PENDING') DESC,o.created_at DESC LIMIT 150");return {items:r.rows.map(otView)};}
 case 'notifications':return notifications(u);
 case 'profile':return profile(u);
 case 'updateProfile':{permit(u,'profile.update');const n=text(String(b.preferredName??''),0,50,'INVALID_NAME'),p=text(String(b.phone??''),0,32,'INVALID_PHONE');if(/[<>]/.test(n)||!/^[+0-9٠-٩\s()-]*$/.test(p))die('INVALID_PROFILE');await pool.query('UPDATE mt_users SET preferred_name=$1,phone=$2,updated_at=now() WHERE id=$3',[n,p,u.id]);return profile(u);}
 case 'leaveMine':{permit(u,'leave.request');const r=await pool.query(leaveSelect+' WHERE l.requester_id=$1 ORDER BY l.created_at DESC LIMIT 50',[u.id]);return {items:r.rows.map(leaveView),...(await profile(u))};}
 case 'leaveRequest':return leaveRequest(u,b);
 case 'leaveDecision':return decision(u,b);
 case 'leaveInbox':{permit(u,'leave.approve');const offset=Math.min(1000000,Math.max(0,Math.floor(Number(b.offset)||0)));const [r,p]=await Promise.all([pool.query(leaveSelect+" ORDER BY (l.status='PENDING') DESC,CASE WHEN l.status='PENDING' THEN l.created_at END ASC NULLS LAST,l.created_at DESC LIMIT 100 OFFSET $1",[offset]),pool.query("SELECT count(*)::int AS n FROM mt_leave_requests WHERE status='PENDING'")]);return {items:r.rows.map(leaveView),pendingCount:p.rows[0].n,hasMore:r.rows.length===100,offset};}
 case 'leavePendingCount':{permit(u,'leave.approve');const x=await row("SELECT count(*)::int AS n FROM mt_leave_requests WHERE status='PENDING'");return {pendingCount:x.n};}
 case 'markNotificationRead':{permit(u,'profile.view');const x=text(b.id,1,100,'INVALID_NOTIFICATION');if(x.startsWith('REQ-'))die('ACTION_REQUIRED');const r=await row('UPDATE mt_notifications SET read_at=COALESCE(read_at,now()) WHERE recipient_id=$1 AND (id::text=$2 OR source_id=$2) RETURNING id',[u.id,x]);if(!r)die('NOTIFICATION_NOT_FOUND',404);return {ok:true,id:x,read:true};}
 case 'markAllNotificationsRead':{
  permit(u,'profile.view');
  const updated=await pool.query(
   "WITH recent AS (SELECT id FROM mt_notifications WHERE recipient_id=$1 ORDER BY created_at DESC,id DESC LIMIT 5) UPDATE mt_notifications n SET read_at=COALESCE(n.read_at,now()) WHERE n.recipient_id=$1 AND n.id IN (SELECT id FROM recent) AND n.read_at IS NULL RETURNING n.id",[u.id]);
  return {ok:true,marked:updated.rowCount};
 }
 case 'adminCatalog':case 'adminCatalogSave':return catalogAdmin(u,b);
 case 'adminCreateEmployee':case 'adminResetEmployeePassword':return employeeAdmin(u,b);
 case 'adminUsers':{
  permit(u,'users.manage');
  const q=`SELECT u.employee_code AS code,u.name,u.role::text AS role,u.active,u.department,u.job_title AS "jobTitle",b.days::float AS "leaveBalance",
   (SELECT COALESCE(SUM(delta_minutes),0) FROM mt_substitute_time_ledger WHERE user_id=u.id)
    +(SELECT COALESCE(SUM(delta_minutes),0) FROM mt_substitute_time_adjustments WHERE user_id=u.id) AS "substituteMinutes"
   FROM mt_users u LEFT JOIN mt_leave_balances b ON b.user_id=u.id ORDER BY u.employee_code LIMIT 1000`;
  const r=await pool.query(q);
  return {items:r.rows.map(x=>({code:x.code,name:x.name,role:x.role,active:x.active,department:x.department,jobTitle:x.jobTitle,leaveBalance:x.leaveBalance??null,substituteAvailableHours:round(Number(x.substituteMinutes||0)/60)}))};
 }
 case 'adminSaveUser':{
  permit(u,'users.manage');
  const code=text(b.code,1,32,'INVALID_CODE'),role=String(b.role);
  if(!['technician','engineer'].includes(role)||typeof b.active!=='boolean')die('INVALID_ROLE_OR_STATUS');
  const dept=text(String(b.department??''),0,80,'INVALID_DEPARTMENT'),job=text(String(b.jobTitle??''),0,80,'INVALID_JOB');
  const bal=b.leaveBalance===''||b.leaveBalance==null?null:Number(b.leaveBalance);
  if(bal!==null&&(!Number.isFinite(bal)||bal<0||bal>1000||Math.abs(bal*2-Math.round(bal*2))>0.00001))die('INVALID_LEAVE_BALANCE');
  const hasSub=Object.prototype.hasOwnProperty.call(b,'substituteHours');
  const subHours=hasSub?Number(b.substituteHours):null;
  const subMinutes=hasSub?Math.round(subHours*60):null;
  if(hasSub&&(b.substituteHours===''||!Number.isFinite(subHours)||subHours<0||subHours>1000||!Number.isSafeInteger(subMinutes)||Math.abs(subMinutes-subHours*60)>0.00001))die('INVALID_SUBSTITUTE_HOURS');
  const hasReason=Object.prototype.hasOwnProperty.call(b,'adjustmentReason');
  const reason=hasReason?text(String(b.adjustmentReason??''),0,250,'INVALID_ADJUSTMENT_REASON'):'Legacy client: employee balance adjustment';
  return transaction(async c=>{
   const t=await first(c,'SELECT * FROM mt_users WHERE employee_code=$1 FOR UPDATE',[code]);
   if(!t)die('NO_USER',404);if(t.id===u.id)die('SELF_ADMIN_CHANGE_BLOCKED');if(t.role==='owner')die('OWNER_ROLE_CANNOT_BE_EDITED_HERE');
   const beforeAnnualRow=await first(c,'SELECT days FROM mt_leave_balances WHERE user_id=$1 FOR UPDATE',[t.id]);
   const annualBefore=beforeAnnualRow?Number(beforeAnnualRow.days):null;
   const annualChange=annualBefore!==bal&&(bal??0)!==(annualBefore??0);
   const beforeSub=hasSub?await readSubstituteMinutes(c,t.id):null;
   const substituteChange=hasSub&&beforeSub!==subMinutes;
   if((annualChange||substituteChange)&&reason.length<3)die('BALANCE_ADJUSTMENT_REASON_REQUIRED');
   await c.query('UPDATE mt_users SET role=$1,active=$2,department=$3,job_title=$4,token_version=token_version+CASE WHEN role<>$1 OR active<>$2 THEN 1 ELSE 0 END,updated_at=now() WHERE id=$5',[role,b.active,dept,job,t.id]);
   if(bal!==null)await c.query('INSERT INTO mt_leave_balances(user_id,days) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET days=EXCLUDED.days',[t.id,bal]);
   else await c.query('DELETE FROM mt_leave_balances WHERE user_id=$1',[t.id]);
   if(annualChange)await c.query('INSERT INTO mt_leave_balance_adjustments(user_id,delta_days,balance_before,balance_after,reason,approved_by) VALUES($1,$2,$3,$4,$5,$6)',
    [t.id,Number((bal??0)-(annualBefore??0)).toFixed(1),annualBefore,bal,reason,u.id]);
   if(substituteChange)await c.query('INSERT INTO mt_substitute_time_adjustments(user_id,delta_minutes,reason,approved_by) VALUES($1,$2,$3,$4)',
    [t.id,subMinutes-beforeSub,reason,u.id]);
   await c.query('INSERT INTO mt_audit(actor_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5::jsonb)',
    [u.id,'user.admin_updated','user',code,JSON.stringify({annualBefore,annualAfter:bal,substituteMinutesBefore:beforeSub,substituteMinutesAfter:subMinutes,reason:(annualChange||substituteChange)?reason:undefined,role,active:b.active})]);
   return {ok:true,annualBalance:bal,substituteAvailableHours:subMinutes===null?undefined:round(subMinutes/60)};
  });
 }
 case 'change':{const pw=text(b.pw,8,256,'INVALID_PASSWORD');return transaction(async c=>{const t=await first(c,'SELECT * FROM mt_users WHERE id=$1 FOR UPDATE',[u.id]);if(!t)die('AUTH',401);if(!t.must_change){const x=await first(c,'SELECT ($1=extensions.crypt($1,$2)) AS valid',[String(b.old??''),t.password_hash]);if(!x.valid)die('BAD_PW',401);}const r=await first(c,"UPDATE mt_users SET password_hash=extensions.crypt($1,extensions.gen_salt('bf',11)),token_version=token_version+1,must_change=false,updated_at=now() WHERE id=$2 RETURNING id,employee_code,name,role::text AS role,token_version,must_change",[pw,u.id]);await c.query('DELETE FROM mt_sessions WHERE user_id=$1',[u.id]);return issue(r,c);});}
 default:die('UNKNOWN_ACTION',404);
}}
const MT_ALLOWED_ORIGINS=new Set([
'https://maintrack-final-security-gpnpu344u-mohamedashrefsrag-5918.vercel.app',
'https://maintrack-final-security-nr55ak3ey-mohamedashrefsrag-5918.vercel.app',
'https://maintrack-update-pilot-mohamedashrefsrag-5918.vercel.app',
'https://maintrack-final-security-elu75t41j-mohamedashrefsrag-5918.vercel.app',
'https://maintrack-final-security-6hsfv7uif-mohamedashrefsrag-5918.vercel.app',
'https://maintrack-pilot-icc.vercel.app',
'https://maintrack-unified-operations-v5.vercel.app',
'https://maintrack-csp-hardened-qa.vercel.app',
'https://maintrack-security-stage9-review.vercel.app',
'https://maintrack-security-bundle-audit.vercel.app',
'https://maintrack-final-security-qa.vercel.app',
'https://localhost'
]);
Deno.serve(async req=>{
 const url=new URL(req.url),p=url.pathname,rid=String(req.headers.get('x-request-id')||randomUUID()).slice(0,65),started=Date.now();
 const mtOrigin=req.headers.get('origin')||'',mtAllowed=!mtOrigin||MT_ALLOWED_ORIGINS.has(mtOrigin);
 const response=(body:any,status=200,requestId='')=>{
   const h:Record<string,string>={
     'content-type':'application/json; charset=utf-8',
     'cache-control':'no-store',
     'x-content-type-options':'nosniff',
     'referrer-policy':'no-referrer',
     'vary':'Origin',
     'access-control-allow-methods':'GET,POST,OPTIONS',
     'access-control-allow-headers':'authorization,apikey,content-type,x-client-info,x-request-id,x-retry-count,traceparent,tracestate,baggage',
     'x-request-id':requestId
   };
   if(mtOrigin&&mtAllowed)h['access-control-allow-origin']=mtOrigin;
   return new Response(JSON.stringify(body),{status,headers:h});
 };
 if(!mtAllowed)return response({error:'ORIGIN_FORBIDDEN'},403,rid);
 if(req.method==='OPTIONS')return response({},200,rid);
 if(req.method==='GET'){
  if(p.endsWith('/healthz'))return response({status:'up',service:'maintrack-stage6-api',stage:'staging'},200,rid);
  if(p.endsWith('/readyz')){try{const x=await pool.query('SELECT version FROM mt_migrations ORDER BY version');return response({status:'ready',database:'postgresql',migrations:x.rows.map(t=>t.version),stage:'staging'},200,rid);}catch(e){console.error('DB_CONNECT',String(e).slice(0,160));return response({status:'unavailable',reason:'DB_CONNECT'},503,rid);}}
  return response({error:'NOT_FOUND'},404,rid);
 }
 if(req.method!=='POST'||!p.endsWith('/api'))return response({error:'METHOD_NOT_ALLOWED'},405,rid);
 try{if(Number(req.headers.get('content-length')||0)>65536)die('PAYLOAD_TOO_LARGE',413);const b=await req.json();if(!b||typeof b!=='object'||Array.isArray(b))die('INVALID_PAYLOAD');const a=text(b.action,1,40,'UNKNOWN_ACTION');const result=a==='login'?await login(b):await dispatch(await auth(req),b);console.info(JSON.stringify({action:a,ms:Date.now()-started,status:'ok',rid}));return response(result,200,rid);}
 catch(e){const c=e instanceof AppError?e.code:'INTERNAL_ERROR',s=e instanceof AppError?e.status:500;console.error(JSON.stringify({status:c,ms:Date.now()-started,rid}));return response({error:c},s,rid);}
});