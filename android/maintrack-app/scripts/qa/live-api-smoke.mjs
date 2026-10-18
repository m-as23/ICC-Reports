// Read-only Stage22 live API smoke. Does not log in, mutate data, or use employee credentials.
import assert from 'node:assert/strict';

const origin='https://maintrack-final-security-ldgcbkqqw-mohamedashrefsrag-5918.vercel.app';
const base='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa';
const endpoint=base+'/api';

async function request(path,options={}){
  const response=await fetch(path,{
    ...options,
    signal:AbortSignal.timeout(20000),
    headers:{Origin:origin,...options.headers},
  });
  return response;
}
function cors(response){
  assert.equal(response.headers.get('access-control-allow-origin'),origin,
    'QA API must authorize ONLY the exact Stage22 browser origin');
}
function checkStatus(response,expected,label){
  assert.equal(response.status,expected,`${label}: HTTP ${response.status}, expected ${expected}`);
}
function step(label){console.log('PASS: '+label);}

const health=await request(base+'/healthz');
checkStatus(health,200,'QA health');
cors(health);
assert.equal((await health.json()).status,'up');
step('QA Edge function health and exact CORS origin');

const ready=await request(base+'/readyz');
checkStatus(ready,200,'QA DB readiness');
cors(ready);
assert.equal((await ready.json()).status,'ready');
step('QA database available (read-only)');

const preflight=await request(endpoint,{method:'OPTIONS',headers:{
  'Access-Control-Request-Method':'POST',
  'Access-Control-Request-Headers':'content-type,x-request-id',
}});
checkStatus(preflight,200,'QA preflight');
cors(preflight);
assert.match(preflight.headers.get('access-control-allow-methods')||'',/POST/);
assert.match(preflight.headers.get('access-control-allow-headers')||'',/content-type/);
step('Browser POST preflight allows Stage22');

const rejected=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action:'session'})});
assert.ok([401,403].includes(rejected.status),
  `Missing session must return 401/403, got ${rejected.status}`);
cors(rejected);
assert.equal(typeof (await rejected.json()).error,'string');
step('Missing authentication is rejected; no employee credentials');

const denied=await fetch(endpoint,{method:'OPTIONS',signal:AbortSignal.timeout(20000),headers:{
  Origin:'https://untrusted-maintrack-origin.invalid',
  'Access-Control-Request-Method':'POST',
  'Access-Control-Request-Headers':'content-type',
}});
checkStatus(denied,403,'Untrusted Origin');
assert.equal(denied.headers.get('access-control-allow-origin'),null);
step('Untrusted domain remains blocked');

console.log('MAINTRACK_STAGE22_QA_LIVE_API_PASS');
