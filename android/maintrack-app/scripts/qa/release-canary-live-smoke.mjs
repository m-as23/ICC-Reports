// MainTrack Stage22 release API canary: public/read-only readiness and unauthorized-path checks.
import assert from 'node:assert/strict';

const root='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage22-release-canary';
const allowed=['https://maintrack-final-security-qa.vercel.app','https://maintrack-pilot-icc.vercel.app','https://localhost'];
const timeout=()=>AbortSignal.timeout(18000);
async function call(suffix,options={}){return fetch(root+suffix,{signal:timeout(),...options});}
for(const suffix of ['/healthz','/readyz']){
 const r=await call(suffix);
 assert.equal(r.status,200,suffix+' must be up');
 const json=await r.json();
 assert.equal(json.status,suffix==='/healthz'?'up':'ready');
 console.log('PASS canary '+suffix);
}
for(const origin of allowed){
 const r=await call('/api',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
 assert.equal(r.status,200,origin+' preflight must succeed');
 assert.equal(r.headers.get('access-control-allow-origin'),origin);
 console.log('PASS canary allowed Origin '+origin);
}
for(const origin of ['https://untrusted-origin.invalid','https://maintrack-final-security-ldgcbkqqw-mohamedashrefsrag-5918.vercel.app']){
 const r=await call('/api',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
 assert.equal(r.status,403,origin+' must remain forbidden on production-candidate API');
 assert.equal(r.headers.get('access-control-allow-origin'),null);
 console.log('PASS canary rejected Origin '+origin);
}
for(const action of ['session','init','submit','overtimeInbox','adminUsers']){
 const origin=allowed[0];
 const r=await call('/api',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action})});
 assert.ok([401,403].includes(r.status),action+' unauthenticated request must be forbidden, got '+r.status);
 assert.equal(r.headers.get('access-control-allow-origin'),origin);
 const json=await r.json();
 assert.equal(typeof json.error,'string');
 console.log('PASS canary denies unauthenticated '+action);
}
console.log('MAINTRACK_STAGE22_CANARY_LIVE_PASS (READ_ONLY)');
