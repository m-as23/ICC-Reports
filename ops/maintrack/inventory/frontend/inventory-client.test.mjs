import test from 'node:test';
import assert from 'node:assert/strict';
import {createInventoryClient} from './inventory-client.mjs';
const endpoint='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-inventory-047-qa';
test('search uses existing opaque session and pins result pages without sending client role',async()=>{
 const calls=[];
 const client=createInventoryClient({endpoint,readSession:()=>({token:'a'.repeat(64),role:'technician'}),fetchImpl:async(url,o)=>{
  calls.push({url,headers:o.headers,body:JSON.parse(o.body)});
  return {ok:true,json:async()=>({ok:true,data:{versionId:'8',items:[],nextOffset:null,totalMatches:0}})};
 }});
 await client.search('65 أمبير');await client.search('65 أمبير',{offset:50});
 assert.equal(calls[0].headers.Authorization,'Bearer '+'a'.repeat(64));
 assert.equal(calls[0].body.role,undefined);assert.equal(calls[0].body.token,undefined);
 assert.equal(calls[1].body.versionId,'8');
});
test('Owner publish needs complete current review plus human confirmation; technicians cannot upload',async()=>{
 let session={token:'a'.repeat(64),role:'technician'},published=0;
 const client=createInventoryClient({endpoint,readSession:()=>session,fetchImpl:async(url,o)=>{
  const b=JSON.parse(o.body);if(b.action==='inventoryPublish'){published++;return {ok:true,json:async()=>({ok:true,data:{versionId:'2'}})};}
  return {ok:true,json:async()=>({ok:true,data:{draftId:'2',baseVersionId:'1',currentVersionId:'1',isStale:false,reviewReceipt:'f'.repeat(64),detailsTotal:1,details:[{code:'A',type:'CHANGED'}],offset:0,hasMore:false,nextOffset:null}})};
 }});
 await assert.rejects(client.upload({name:'a.xlsx',size:100}),/FORBIDDEN/);
 session={...session,role:'owner'};
 await assert.rejects(client.publish({confirmReviewed:true}),/COMPLETE_REVIEW_REQUIRED/);
 await client.review('2');
 await assert.rejects(client.publish({confirmReviewed:false}),/OWNER_REVIEW_REQUIRED/);
 await client.publish({confirmReviewed:true});assert.equal(published,1);
 await assert.rejects(client.publish({confirmReviewed:true}),/COMPLETE_REVIEW_REQUIRED/);
});
test('all API auth denials notify the host, including semantic search',async()=>{const denied=[];const client=createInventoryClient({endpoint,readSession:()=>({token:'a'.repeat(64),role:'owner'}),onAuthFailure:e=>denied.push(e.message),fetchImpl:async()=>({ok:false,json:async()=>({ok:false,error:'UNAUTHENTICATED'})})});await assert.rejects(client.assist({query:'motor'}),/UNAUTHENTICATED/);assert.deepEqual(denied,['UNAUTHENTICATED']);});
test('semantic cancellation reaches the actual fetch signal',async()=>{let received;const client=createInventoryClient({endpoint,readSession:()=>({token:'a'.repeat(64),role:'owner'}),fetchImpl:async(url,o)=>{received=o.signal;await new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));}});const controller=new AbortController(),pending=client.assist({query:'motor'},{signal:controller.signal});controller.abort();assert.equal(received.aborted,true);await assert.rejects(pending,{name:'AbortError'});});
