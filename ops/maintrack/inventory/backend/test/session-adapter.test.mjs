// MT-01 / CP-06 — NO DATABASE, NO NETWORK, NO LIVE MAINTRACK SESSIONS.
// Exercise the actual ported opaque-session verifier using synthetic query results.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMainTrackOpaqueSessionVerifier} from '../src/maintrack-session-adapter.mjs';
import {authorizeInventoryAction} from '../src/domain.mjs';
import {createInventoryHttpHandler} from '../src/http-adapter.mjs';
const ownerToken='A'.repeat(64);
const tokenHash=createHash('sha256').update(ownerToken.toLowerCase()).digest('hex');
const origin='https://maintrack-staging-qa.invalid';
const mkPool=(identity)=>{
 const calls=[];
 return {calls,pool:{async query(sql,params){calls.push({sql,params});return {rows:identity?[identity]:[]};}}};
};
test('Opaque MainTrack 64-hex session is SHA-256 verified server-side, never trusted from JSON',async()=>{
 const {pool,calls}=mkPool({userId:'synthetic-1',role:'owner',active:true,mustChange:false});
 const verify=createMainTrackOpaqueSessionVerifier({pool});
 const actor=await verify(ownerToken);
 assert.equal(actor.role,'owner');
 assert.equal(actor.userId,'synthetic-1');
 assert.equal(calls.length,1);
 assert.equal(calls[0].params[0],tokenHash);
 assert.equal(calls[0].sql.includes('public.mt_sessions'),true);
 assert.equal(calls[0].sql.includes('public.mt_users'),true);
 assert.equal(calls[0].sql.includes('s.expires_at>now()'),true);
 assert.equal(calls[0].sql.includes('s.token_version=u.token_version'),true);
 assert.equal(calls[0].sql.includes('u.active=true'),true);
 assert.equal(calls[0].sql.includes('u.must_change'),true);
 assert.equal(calls[0].sql.includes(ownerToken),false);
 assert.equal(await verify('forged'),null);
 assert.equal(calls.length,1,'Invalid token must not hit database');
});
test('Account disabled, forced password change, expired/missing session and unknown role fail closed',async()=>{
 for(const identity of [null,{userId:'2',role:'owner',active:false,mustChange:false},{userId:'3',role:'owner',active:true,mustChange:true},{userId:'4',role:'unassigned',active:true,mustChange:false}]){
  const {pool}=mkPool(identity);
  assert.equal(await createMainTrackOpaqueSessionVerifier({pool})(ownerToken),null);
 }
 for(const role of ['owner','engineer','technician']){
  const u={authenticated:true,active:true,role,userId:'synthetic-user'};
  assert.doesNotThrow(()=>authorizeInventoryAction(u,'search'));
  assert.doesNotThrow(()=>authorizeInventoryAction(u,'details'));
  if(role!=='owner')for(const action of ['upload','diff','publish','restore','audit','versions:list'])
    assert.throws(()=>authorizeInventoryAction(u,action),/FORBIDDEN/);
 }
});
test('HTTP permission boundary ignores attacker-supplied role, session and userId',async()=>{
 const identity={userId:'synthetic-technician',role:'technician',active:true,mustChange:false};
 const {pool,calls}=mkPool(identity);
 const verify=createMainTrackOpaqueSessionVerifier({pool});
 const service={async execute(input){
  const id=await verify(input.session);
  authorizeInventoryAction(id,{'inventoryVersion':'search','inventoryHistory':'versions:list','inventoryPublish':'publish'}[input.action]);
  return input.action==='inventoryVersion'?{versionId:null}:[];
 }};
 const handler=createInventoryHttpHandler({service,allowedOrigins:[origin]});
 const request=(action,extra={})=>new Request(origin+'/api',{method:'POST',headers:{'Authorization':'Bearer '+ownerToken,'Origin':origin,'Content-Type':'application/json'},body:JSON.stringify({action,role:'owner',userId:'fake-owner',session:'fake-session',...extra})});
 assert.equal((await handler(request('inventoryVersion'))).status,200);
 assert.equal((await handler(request('inventoryHistory'))).status,403);
 assert.equal((await handler(request('inventoryPublish',{confirmReviewed:true}))).status,403);
 assert.equal(calls.length,3);
 const blocked=await handler(new Request(origin+'/api',{method:'POST',headers:{'Origin':origin,'Content-Type':'application/json'},body:JSON.stringify({action:'inventoryHistory',role:'owner'})}));
 assert.equal(blocked.status,401);
 assert.equal(calls.length,3);
});
