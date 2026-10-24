// Read-only extension. The same projection powers personal and Owner current balances.
const fail=message=>{throw Error(message);};
const round=n=>Math.round(Number(n)*100)/100;
const check=actor=>{if(!actor?.id||actor.active===false)fail('AUTH');};
const owner=actor=>{check(actor);if(actor.role!=='owner')fail('FORBIDDEN');};
const yearOf=y=>{const n=Number(y);if(!Number.isInteger(n)||n<2000||n>2100)fail('INVALID_YEAR');return n;};
const pageOf=({offset=0,limit=50})=>{if(!Number.isInteger(Number(offset))||Number(offset)<0||Number(offset)>100000)fail('INVALID_OFFSET');if(!Number.isInteger(Number(limit))||Number(limit)<1||Number(limit)>50)fail('INVALID_LIMIT');return {offset:Number(offset),limit:Number(limit)};};
const canonical=where=>`SELECT u.id,u.employee_code AS code,u.name,u.role::text AS role,u.active,u.department,u.job_title AS "jobTitle",u.preferred_name AS "preferredName",u.phone,b.days AS available,
 (SELECT COALESCE(SUM(-delta),0) FROM mt_leave_ledger WHERE user_id=u.id) AS used,
 (SELECT COALESCE(SUM(delta_minutes),0) FROM mt_substitute_time_ledger WHERE user_id=u.id)+(SELECT COALESCE(SUM(delta_minutes),0) FROM mt_substitute_time_adjustments WHERE user_id=u.id) AS sub_available,
 (SELECT COALESCE(SUM(-delta_minutes),0) FROM mt_substitute_time_ledger WHERE user_id=u.id AND delta_minutes<0) AS sub_used,
 (SELECT COALESCE(SUM(minutes),0) FROM mt_overtime_requests WHERE requester_id=u.id AND status='APPROVED' AND compensation_kind='FINANCIAL') AS financial
 FROM mt_users u LEFT JOIN mt_leave_balances b ON b.user_id=u.id ${where}`;
function balance(x){const available=x.available==null?null:round(x.available),used=round(x.used),subAvailable=round(Number(x.sub_available)/480),subUsed=round(Number(x.sub_used)/480);return {profile:{code:x.code,name:x.name,role:x.role,department:x.department,jobTitle:x.jobTitle,preferredName:x.preferredName,phone:x.phone,leaveBalance:available},annualAvailableDays:available,annualUsedDays:used,annualTotalDays:available==null?null:round(Number(x.available)+Number(x.used)),substituteAvailableDays:subAvailable,substituteUsedDays:subUsed,substituteEarnedDays:round((Number(x.sub_available)+Number(x.sub_used))/480),financialApprovedDays:round(Number(x.financial)/480)};}
const scope='CURRENT_NOT_HISTORICAL';
export function createTeamLedger({query}){
 if(typeof query!=='function')fail('QUERY_REQUIRED');
 return Object.freeze({
  async account(actor){check(actor);const r=await query(canonical('WHERE u.id=$1'),[actor.id]);if(!r.rows[0])fail('AUTH');return balance(r.rows[0]);},
  async team(actor,input={}){
   owner(actor);const year=yearOf(input.year),{offset,limit}=pageOf(input),q=String(input.query||'').trim();if(q.length>100)fail('INVALID_QUERY');
   const r=await query(`WITH people AS (${canonical("WHERE $1='' OR strpos(lower(u.name||' '||u.employee_code||' '||COALESCE(u.department,'')),lower($1))>0")}),
    page AS (SELECT p.*,(SELECT COUNT(DISTINCT work_date)::int FROM mt_overtime_requests WHERE requester_id=p.id AND status='APPROVED' AND compensation_kind='FINANCIAL' AND work_date>=$2::date AND work_date<$3::date) AS financial_days,
    (SELECT COALESCE(SUM(minutes),0) FROM mt_overtime_requests WHERE requester_id=p.id AND status='APPROVED' AND compensation_kind='FINANCIAL' AND work_date>=$2::date AND work_date<$3::date) AS financial_minutes FROM people p ORDER BY code LIMIT $4 OFFSET $5)
    SELECT (SELECT COUNT(*)::int FROM people) AS total,(SELECT COUNT(*)::int FROM mt_users) AS staff_count,
    ((SELECT COUNT(*) FROM mt_leave_requests WHERE status='PENDING' AND start_date<$3::date AND end_date>=$2::date)+(SELECT COUNT(*) FROM mt_overtime_requests WHERE status='PENDING' AND work_date>=$2::date AND work_date<$3::date))::int AS pending_count,
    COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY code) FROM page),'[]') AS items`,[q,`${year}-01-01`,`${year+1}-01-01`,limit,offset]);
   const x=r.rows[0];return {year,balanceScope:scope,staffCount:Number(x.staff_count),pendingCount:Number(x.pending_count),total:Number(x.total),offset,limit,hasMore:offset+limit<Number(x.total),items:x.items.map(p=>({profile:balance(p).profile,active:p.active,balance:balance(p),financialActualDays:Number(p.financial_days),financialHours:round(Number(p.financial_minutes)/60)}))};
  },
  async detail(actor,input={}){
   owner(actor);const year=yearOf(input.year),{offset,limit}=pageOf(input),code=String(input.employeeCode||'');if(!/^[A-Za-z0-9_-]{1,32}$/.test(code))fail('INVALID_EMPLOYEE');const kind=input.kind||'annual';if(!['annual','sub','cash'].includes(kind))fail('INVALID_KIND');
   const r=await query(`WITH person AS (${canonical('WHERE u.employee_code=$1')}),events AS (
    SELECT l.public_id AS id,'leave' AS source,CASE WHEN l.type='compensatory' THEN 'sub' ELSE 'annual' END AS kind,l.start_date::text AS date,l.end_date::text AS "endDate",NULL::text AS "from",NULL::text AS "to",l.days::numeric AS days,NULL::int AS minutes,l.status::text AS status,l.reason,l.type AS label,l.decided_at::text AS "recordedAt",(SELECT name FROM mt_users WHERE id=l.decided_by) AS "approvedBy"
    FROM mt_leave_requests l JOIN person p ON p.id=l.requester_id WHERE l.start_date<$3::date AND l.end_date>=$2::date
    UNION ALL SELECT o.public_id,'overtime',CASE WHEN compensation_kind='FINANCIAL' THEN 'cash' ELSE 'sub' END,o.work_date::text,NULL,o.start_time::text,o.end_time::text,NULL,o.minutes,o.status::text,o.reason,o.work_kind,o.decided_at::text,(SELECT name FROM mt_users WHERE id=o.decided_by) FROM mt_overtime_requests o JOIN person p ON p.id=o.requester_id WHERE o.work_date>=$2::date AND o.work_date<$3::date
    UNION ALL SELECT a.id::text,'adjustment','annual',(a.created_at AT TIME ZONE 'Africa/Cairo')::date::text,NULL,NULL,NULL,a.delta_days,NULL,'APPROVED',a.reason,'تسوية إدارية',a.created_at::text,(SELECT name FROM mt_users WHERE id=a.approved_by) FROM mt_leave_balance_adjustments a JOIN person p ON p.id=a.user_id WHERE (a.created_at AT TIME ZONE 'Africa/Cairo')::date>=$2::date AND (a.created_at AT TIME ZONE 'Africa/Cairo')::date<$3::date
    UNION ALL SELECT a.id::text,'adjustment','sub',(a.created_at AT TIME ZONE 'Africa/Cairo')::date::text,NULL,NULL,NULL,NULL,a.delta_minutes,'APPROVED',a.reason,'تسوية إدارية',a.created_at::text,(SELECT name FROM mt_users WHERE id=a.approved_by) FROM mt_substitute_time_adjustments a JOIN person p ON p.id=a.user_id WHERE (a.created_at AT TIME ZONE 'Africa/Cairo')::date>=$2::date AND (a.created_at AT TIME ZONE 'Africa/Cairo')::date<$3::date),
    filtered AS (SELECT * FROM events WHERE kind=$4),page AS (SELECT * FROM filtered ORDER BY date DESC,source,id LIMIT $5 OFFSET $6)
    SELECT (SELECT to_jsonb(person) FROM person) AS person,(SELECT COUNT(*)::int FROM filtered) AS total,COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY date DESC,source,id) FROM page),'[]') AS items,
    (SELECT COUNT(DISTINCT date)::int FROM events WHERE source='overtime' AND status='APPROVED' AND kind=$4) AS attendance_days,
    (SELECT COALESCE(SUM(minutes),0) FROM events WHERE source='overtime' AND status='APPROVED' AND kind=$4) AS approved_minutes`,[code,`${year}-01-01`,`${year+1}-01-01`,kind,limit,offset]);
   const x=r.rows[0];if(!x.person)fail('EMPLOYEE_NOT_FOUND');return {year,kind,balanceScope:scope,profile:balance(x.person).profile,active:x.person.active,balance:balance(x.person),total:Number(x.total),offset,limit,hasMore:offset+limit<Number(x.total),attendanceDays:Number(x.attendance_days),approvedHours:round(Number(x.approved_minutes)/60),items:x.items};
  }
 });
}
