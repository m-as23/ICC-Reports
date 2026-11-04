/** Untrusted JSON is kept unknown until each action's existing field validators run. */
export type RequestBody = Record<string,unknown>;
export function isRequestBody(value:unknown):value is RequestBody{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
export type UserRole='owner'|'engineer'|'technician';
export function isUserRole(value:unknown):value is UserRole{return value==='owner'||value==='engineer'||value==='technician';}
export interface SessionUser{id:string;employee_code:string;name:string;role:UserRole;token_version:number;must_change:boolean;}
export interface Actor extends SessionUser{active:boolean;}
/** SQL arguments are values, not SQL fragments; the driver performs parameter binding. */
export interface CorePool extends SqlConnection{connect():Promise<import('npm:@types/pg@8.11.11').PoolClient>;}
export interface QaCorePool extends CorePool{attest():Promise<Record<string,unknown>>;}
export interface SqlConnection{query(sql:string,args?:unknown[]):Promise<import('npm:@types/pg@8.11.11').QueryResult>;}
export interface Aggregate{name:string;count:number;hours:number;complete:number;}
export interface LeaveRow{public_id:string;employee_code:string;name:string;type:string;start_date:Date|string;end_date:Date|string;days:number|string;duration_kind:string|null;reason:string;status:string;created_at:Date;decided_at:Date|null;decider_code?:string|null;decision_reason:string|null;}
export interface OvertimeRow{public_id:string;employee_code:string;name:string;work_date:Date|string;start_time:string;end_time:string;minutes:number|string;compensation_kind:string;work_kind:string|null;reason:string;status:string;created_at:Date;decided_at:Date|null;decision_reason:string|null;}
export interface CmmsRow{workStart:string|null;workEnd:string|null;reportTime:string|null;date:string;category:string;component:string;section:string;machine:string;imported:boolean;}
/** Called only after clock() validates the complete time. Reject accidental invalid callers. */
export function requiredMinutes(value:string):number{const match=/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);if(!match)throw Error('INVALID_TIME');return Number(match[1])*60+Number(match[2]);}

/** Session claims come from the database, never from the request body. */
export function sessionUser(value:unknown):SessionUser{
 if(!isRequestBody(value)||typeof value.id!=='string'||typeof value.employee_code!=='string'||typeof value.name!=='string'||!isUserRole(value.role)||typeof value.token_version!=='number'||!Number.isSafeInteger(value.token_version)||typeof value.must_change!=='boolean')throw Error('INVALID_SESSION_USER');
 return {id:value.id,employee_code:value.employee_code,name:value.name,role:value.role,token_version:value.token_version,must_change:value.must_change};
}
export function actor(value:unknown):Actor{const user=sessionUser(value);if(!isRequestBody(value)||typeof value.active!=='boolean')throw Error('INVALID_SESSION_USER');return {...user,active:value.active};}
