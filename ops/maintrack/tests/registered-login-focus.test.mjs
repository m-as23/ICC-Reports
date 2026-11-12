import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegisteredClient,waitForWebAuthnForeground} from '../security/registered-login-client.mjs';

for(const operation of ['enroll','login'])test(`${operation} waits for actual foreground before invoking native credentials`,async()=>{
 const oldDocument=globalThis.document,oldWindow=globalThis.window;
 const scope=new EventTarget(),doc=new EventTarget();let focused=false,nativeCalls=0,sends=0;
 doc.visibilityState='visible';doc.hasFocus=()=>focused;
 globalThis.document=doc;globalThis.window=scope;
 const client=createRegisteredClient({endpoint:'https://qa.example/api/login',ingressProof:async b=>b,fetchImpl:async()=>({ok:true,json:async()=>++sends===1?{options:{challenge:'YQ',user:{id:'YQ'}},ticket:'local-ticket'}:{ok:true}}),credentials:{create:async()=>{assert.equal(focused,true);nativeCalls++;return {toJSON:()=>({})};},get:async()=>{assert.equal(focused,true);nativeCalls++;return {toJSON:()=>({})};}}});
 let pending;
 try{
  pending=client[operation]('90000001','local-fixture');pending.catch(()=>{});
  await new Promise(r=>setImmediate(r));
  assert.equal(nativeCalls,0);assert.equal(sends,1);
  // A focus event alone is insufficient if the document still lacks focus.
  scope.dispatchEvent(new Event('focus'));await new Promise(r=>setImmediate(r));assert.equal(nativeCalls,0);
  focused=true;scope.dispatchEvent(new Event('focus'));
  assert.deepEqual(await pending,{ok:true});assert.equal(nativeCalls,1);assert.equal(sends,2);
 }finally{focused=true;scope.dispatchEvent(new Event('focus'));await pending?.catch(()=>{});globalThis.document=oldDocument;globalThis.window=oldWindow;}
});

test('foreground wait expires and removes listeners; hidden document cannot proceed',async()=>{
 const scope=new EventTarget(),document=new EventTarget();let added=0,removed=0;
 for(const target of [scope,document]){const add=target.addEventListener.bind(target),remove=target.removeEventListener.bind(target);target.addEventListener=(...a)=>{added++;return add(...a);};target.removeEventListener=(...a)=>{removed++;return remove(...a);};}
 document.visibilityState='hidden';document.hasFocus=()=>true;
 const pending=waitForWebAuthnForeground({document,scope,timeoutMs:5});
 scope.dispatchEvent(new Event('focus'));
 await assert.rejects(()=>pending,/WEBAUTHN_FOREGROUND_REQUIRED/);assert.equal(added,2);assert.equal(removed,2);
});
