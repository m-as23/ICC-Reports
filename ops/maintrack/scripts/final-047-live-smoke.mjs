// Read-only post-cutover gate: no credentials, accounts or writes.
import assert from 'node:assert/strict';
const base='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/';
const origin='https://maintrack-final-security-qa.vercel.app';
for(const slug of ['maintrack-final-047','maintrack-inventory-final-047']){
 const health=await fetch(base+slug+'/healthz',{headers:{Origin:origin},signal:AbortSignal.timeout(20000)});
 assert.equal(health.status,200);assert.equal((await health.json()).status,'up');
 const denied=await fetch(base+slug+(slug==='maintrack-final-047'?'/api':''),{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:slug==='maintrack-final-047'?'session':'inventoryVersion'}),signal:AbortSignal.timeout(20000)});
 assert.ok([401,403].includes(denied.status));assert.equal(denied.headers.get('access-control-allow-origin'),origin);
 console.log('PASS Final health, CORS and unauthenticated denial:',slug);
}
for(const slug of ['maintrack-stage6-api','maintrack-stage9-security-api','maintrack-unified-four-qa','maintrack-stage22-release-canary','inventory-session-storage-staging','maintrack-inventory-047-qa']){
 const r=await fetch(base+slug+'/api',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'session'}),signal:AbortSignal.timeout(20000)});
 assert.equal(r.status,410);assert.equal((await r.json()).error,'UPDATE_REQUIRED');console.log('PASS retired client route:',slug);
}
