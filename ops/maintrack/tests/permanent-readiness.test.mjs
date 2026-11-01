import test from 'node:test';import assert from 'node:assert/strict';import {permanentChannel} from '../security/qa-permanent-adapter.mjs';
const headers={'x-maintrack-qa-run-id':'SECURITY_FINAL_20261025'};

test('CORS preflight allows only configured QA origins without consuming admission or calling SQL',async()=>{
 const h=permanentChannel({query:()=>{throw Error('SQL_FORBIDDEN')}},{allowedOrigins:['https://localhost','https://maintrack-registered-isolated-qa.vercel.app']}).wrap(()=>{throw Error('HANDLER_FORBIDDEN')});
 const r=await h(new Request('https://qa.invalid/api',{method:'OPTIONS',headers:{origin:'https://maintrack-registered-isolated-qa.vercel.app'}}));
 assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),'https://maintrack-registered-isolated-qa.vercel.app');
 assert.equal((await h(new Request('https://qa.invalid/api',{method:'OPTIONS',headers:{origin:'https://attacker.invalid'}}))).status,403);
 assert.throws(()=>permanentChannel({}, {allowedOrigins:['*']}),/QA_ORIGINS_REQUIRED/);
});
test('pre-Arm readiness is metadata-only and cannot admit or call protected handler',async()=>{
 let queries=0,handlers=0;const pool={query:async q=>{queries++;assert.doesNotMatch(q,/\.admit\(|mt_users|mt_sessions/);return {rows:[{active:false,login:true,role:true,isolated:true,mutation_boundary:true,owner:true}]};}};
 const h=permanentChannel(pool).wrap(()=>{handlers++;throw Error('PROTECTED_HANDLER_FORBIDDEN');});const r=await h(new Request('https://qa.invalid/readyz',{headers}));assert.equal(r.status,200);const b=await r.json();assert.equal(b.metadataOnly,true);assert.equal(b.activeTestsAuthorized,false);assert.equal(queries,1);assert.equal(handlers,0);
});
test('preflight denies missing marker or unapproved origin without database call',async()=>{
 const h=permanentChannel({query:()=>{throw Error('DATABASE_FORBIDDEN');}}).wrap(()=>{throw Error('HANDLER_FORBIDDEN');});
 for(const hds of [{},{...headers,origin:'https://untrusted.invalid'}])assert.equal((await h(new Request('https://qa.invalid/readyz',{headers:hds}))).status,403);
});
test('failed metadata boundary returns hold rather than active authorization',async()=>{
 const h=permanentChannel({query:async()=>({rows:[{active:false,login:true,role:true,isolated:true,mutation_boundary:false,owner:true}]})}).wrap(()=>{throw Error('HANDLER_FORBIDDEN');});const r=await h(new Request('https://qa.invalid/readyz',{headers}));assert.equal(r.status,503);assert.equal((await r.json()).activeTestsAuthorized,false);
});
