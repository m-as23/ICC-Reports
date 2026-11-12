import test from 'node:test';import assert from 'node:assert/strict';import {probeDirect} from '../recovery/probe-qa-direct.mjs';
test('direct probe reports IPv6 failure without credentials or TLS success claim',async()=>{
 const r=await probeDirect({resolve4:async()=>[],resolve6:async()=>['2001:db8::1'],attempt:async address=>({address,reachable:false,error:'ENETUNREACH'})});assert.equal(r.reachable,false);assert.equal(r.tls,'NOT TESTED');assert.equal(r.credentialsUsed,false);assert.equal(r.attempts.length,1);
});
test('TCP reachability is not certificate validation and attempts remain bounded',async()=>{
 let calls=0;const r=await probeDirect({resolve4:async()=>['192.0.2.1','192.0.2.2','192.0.2.3'],resolve6:async()=>[],attempt:async address=>{calls++;return {address,reachable:false,error:'TCP_TIMEOUT'};}});assert.equal(calls,2);assert.equal(r.reachable,false);assert.equal(r.tls,'NOT TESTED');
});
test('reachable direct TCP leaves TLS validation to mandatory libpq/catalog gate',async()=>{
 const r=await probeDirect({resolve4:async()=>[],resolve6:async()=>['2001:db8::1'],attempt:async address=>({address,reachable:true,error:null})});assert.equal(r.reachable,true);assert.equal(r.tls,'NOT TESTED');
});
