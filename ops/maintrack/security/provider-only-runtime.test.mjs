import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaProviderRuntime} from './provider-only-runtime.mjs';
import {createHash,createHmac} from 'node:crypto';
import {loginProofBinding} from '../../../supabase/functions/maintrack-final-047/login-proof.mjs';
const origin='https://maintrack-registered-isolated-qa.vercel.app',key='synthetic-operator-key-no-real-secret',secret='synthetic-provider-secret-only';
const now=Date.parse('2026-11-02T17:00:00Z');
const body={action:'login',code:'90000001',admission:{token:'synthetic-token',requestId:'a'.repeat(32)}};
const raw=JSON.stringify(body),digest=createHash('sha256').update(raw).digest('hex');
function request(){const time=String(now),sig=createHmac('sha256',key).update('maintrack-provider-probe-v1\n'+time+'\n'+raw).digest('hex');return new Request(origin,{method:'POST',headers:{origin,'x-probe-time':time,'x-probe-signature':sig},body:raw});}
test('QA runtime composes real Siteverify adapter and validates all identity fields without issuing sessions',async()=>{
 let calls=0;
 const runtime=createQaProviderRuntime({projectRef:'szhstrafzkxzstjdcynl',operatorKey:key,secret,bodySha256:digest,expires:now+1000,now:()=>now,fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');assert.equal(options.body.get('secret'),secret);return Response.json({success:true,hostname:new URL(origin).hostname,action:'maintrack_login',cdata:await loginProofBinding(body.code,body.admission.requestId),challenge_ts:new Date(now).toISOString()});}});
 const r=await runtime(request());assert.equal(r.status,200);assert.equal((await r.json()).sessionsIssued,0);assert.equal(calls,1);
 assert.equal((await runtime(request())).status,409);assert.equal(calls,1);
});
test('wrong QA project is rejected before provider fetch',()=>{let calls=0;assert.throws(()=>createQaProviderRuntime({projectRef:'tdnkeskczcsukcujwinu',secret,operatorKey:key,bodySha256:digest,expires:now+1000,fetchImpl:()=>{calls++;}}));assert.equal(calls,0);});
