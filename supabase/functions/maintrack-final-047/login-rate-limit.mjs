import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
export class LoginRateError extends Error {constructor(code,status=429){super(code);this.code=code;this.status=status;}}
// Only enable after the deployment owner has verified that the transport peer is
// the client itself. Hosted gateway headers are deliberately never consulted.
export function trustedLoginSource(info,env){
 if(env('MAINTRACK_LOGIN_INGRESS')!=='verified-direct-transport-v1')throw new LoginRateError('LOGIN_INGRESS_UNVERIFIED',503);
 let host=info?.remoteAddr?.hostname;
 if(typeof host!=='string')throw new LoginRateError('LOGIN_INGRESS_UNVERIFIED',503);
 if(host.toLowerCase().startsWith('::ffff:')&&isIP(host.slice(7))===4)host=host.slice(7);
 const version=isIP(host);if(!version)throw new LoginRateError('LOGIN_INGRESS_UNVERIFIED',503);
 if(version===6){const normalized=new URL('http://['+host+']/').hostname.slice(1,-1);const [left,right]=normalized.split('::');const a=left?left.split(':'):[],b=right?right.split(':'):[];const words=right!==undefined?[...a,...Array(8-a.length-b.length).fill('0'),...b]:a;const n=words.map(x=>parseInt(x,16));if(n.slice(0,5).every(x=>x===0)&&n[5]===65535){host=[n[6]>>>8,n[6]&255,n[7]>>>8,n[7]&255].join('.');}else{host=n.slice(0,4).map(x=>x.toString(16)).join(':')+'::/64';}}
 return createHash('sha256').update('maintrack-login-source-v1:'+host).digest('hex');
}
export async function withLoginBudget(pool,source,code,work){
 if(!/^[a-f0-9]{64}$/.test(source||''))throw new LoginRateError('LOGIN_INGRESS_UNVERIFIED',503);
 const c=await pool.connect();let begun=false;
 try{
 // Reserve in a separate bounded transaction: failed credentials still consume
 // quota, while row contention cannot hold a pooled connection indefinitely.
 await c.query('BEGIN');begun=true;
 await c.query("SET LOCAL statement_timeout='4000ms'");
 await c.query("SET LOCAL lock_timeout='750ms'");
 const quota=await c.query(`INSERT INTO public.mt_login_rate_guard(key_hash,window_start,attempts,updated_at) VALUES($1,now(),1,now()) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN mt_login_rate_guard.window_start<=now()-interval '5 minutes' THEN 1 ELSE LEAST(mt_login_rate_guard.attempts+1,301) END,window_start=CASE WHEN mt_login_rate_guard.window_start<=now()-interval '5 minutes' THEN now() ELSE mt_login_rate_guard.window_start END,updated_at=now() RETURNING attempts`,['login-source-v1:'+source]);
 await c.query('COMMIT');begun=false;
 if(Number(quota.rows[0].attempts)>300)throw new LoginRateError('RATE_LIMIT');
 await c.query('BEGIN');begun=true;
 await c.query("SET LOCAL statement_timeout='4000ms'");
 await c.query("SET LOCAL lock_timeout='750ms'");
 const lock=async key=>(await c.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',[key])).rows[0].locked;
 if(!await lock('maintrack-login-source:'+source))throw new LoginRateError('LOGIN_BUSY');
 let slot=false;for(let i=0;i<4;i++){if(await lock('maintrack-login-slot:'+i)){slot=true;break;}}if(!slot)throw new LoginRateError('LOGIN_BUSY');
 if(!await lock('maintrack-login-account:'+code))throw new LoginRateError('LOGIN_BUSY');
 let result;try{result=await work(c);}catch(e){if(e.code==='BAD_PW'){await c.query('COMMIT');begun=false;}throw e;}
 await c.query('COMMIT');begun=false;return result;
 }catch(e){if(begun)await c.query('ROLLBACK');if(['55P03','57014'].includes(e.code))throw new LoginRateError('LOGIN_BUSY');throw e;}finally{c.release();}
}
