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
const outstandingByPool=new WeakMap();
export async function withLoginBudget(pool,source,code,work,policy){
 // Hosted callers deliberately omit source: no proxy/header identity is assumed.
 const hasSource=source!==undefined&&source!==null;
 const gatewayMode=policy?.kind==='verified-gateway-v1';
 if(policy!==undefined&&(!gatewayMode||!hasSource))throw new LoginRateError('LOGIN_INGRESS_UNVERIFIED',503);
 if(hasSource&&(typeof source!=='string'||!/^[a-f0-9]{64}$/.test(source)))throw new LoginRateError('LOGIN_INGRESS_UNVERIFIED',503);
 const outstanding=outstandingByPool.get(pool)||0;if(outstanding>=8)throw new LoginRateError('LOGIN_BUSY');outstandingByPool.set(pool,outstanding+1);
 let c,begun=false,connectionError,rejectConnection;
 const connectionFailure=new Promise((_,reject)=>{rejectConnection=reject;});
 // A checked-out node-pg client may emit an error while no query is pending.
 // Contain server-side idle termination and reject the request without retry.
 connectionFailure.catch(()=>{});
 const onConnectionError=e=>{connectionError ||= e;rejectConnection(connectionError);};
 try{c=await pool.connect();
 c.on?.('error',onConnectionError);
 if(!gatewayMode){
 // Reserve in a separate bounded transaction: failed credentials still consume
 // quota, while row contention cannot hold a pooled connection indefinitely.
 await c.query('BEGIN');begun=true;
 await c.query("SET LOCAL statement_timeout='4000ms'");
 await c.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
 await c.query("SET LOCAL lock_timeout='750ms'");
 // Keep the Production v3 counter and its current window for direct hosted login.
 const quotaKey=hasSource?'login-source-v1:'+source:'maintrack_stage9_global_login';
 const quota=await c.query(`INSERT INTO public.mt_login_rate_guard(key_hash,window_start,attempts,updated_at) VALUES($1,now(),1,now()) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN mt_login_rate_guard.window_start<now()-interval '5 minutes' THEN 1 ELSE LEAST(mt_login_rate_guard.attempts+1,301) END,window_start=CASE WHEN mt_login_rate_guard.window_start<now()-interval '5 minutes' THEN now() ELSE mt_login_rate_guard.window_start END,updated_at=now() RETURNING attempts`,[quotaKey]);
 await c.query('COMMIT');begun=false;
 if(Number(quota.rows[0].attempts)>300)throw new LoginRateError('RATE_LIMIT');
 }
 await c.query('BEGIN');begun=true;
 await c.query("SET LOCAL statement_timeout='4000ms'");
 await c.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
 await c.query("SET LOCAL lock_timeout='750ms'");
 const lock=async key=>(await c.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',[key])).rows[0].locked;
 if(gatewayMode){
  // Only server-verified gateway proofs select this mode. No persistent NAT quota.
  let sourceSlot=false;for(let i=0;i<2;i++)if(await lock('maintrack-login-gateway-source:'+source+':'+i)){sourceSlot=true;break;}
  if(!sourceSlot)throw new LoginRateError('LOGIN_BUSY');
 }else if(hasSource&&!await lock('maintrack-login-source:'+source))throw new LoginRateError('LOGIN_BUSY');
 // Reject duplicate account work before it can occupy shared work slots.
 if(!await lock('maintrack-login-account:'+code))throw new LoginRateError('LOGIN_BUSY');
 let slot=false;for(let i=0;i<4;i++){if(await lock('maintrack-login-slot:'+i)){slot=true;break;}}if(!slot)throw new LoginRateError('LOGIN_BUSY');
 let result;try{result=await Promise.race([Promise.resolve().then(()=>work(c)),connectionFailure]);}catch(e){if(e.code==='BAD_PW'&&!connectionError){await c.query('COMMIT');begun=false;}throw e;}
 await c.query('COMMIT');begun=false;return result;
 }catch(e){if(begun&&!connectionError){try{await c.query('ROLLBACK');}catch(rollbackError){connectionError ||= rollbackError;}}
 if(['55P03','57014','25P03'].includes(e.code)||connectionError?.code==='25P03')throw new LoginRateError('LOGIN_BUSY');throw e;
 }finally{try{c?.release(connectionError);}finally{c?.off?.('error',onConnectionError);outstandingByPool.set(pool,(outstandingByPool.get(pool)||1)-1);}}
}
