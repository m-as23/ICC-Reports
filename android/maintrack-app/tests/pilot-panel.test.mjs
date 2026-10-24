import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync,sign} from 'node:crypto';import {mountPilotPanel} from '../update-system/pilot-panel.mjs';import {canonicalJson} from '../update-system/policy.mjs';
function documentFixture(){
 const doc=Object.assign(new EventTarget(),{visibilityState:'hidden',activeElement:null});
 class Element{constructor(tag){this.tagName=tag;this.children=[];this.hidden=false;this.disabled=false;this.attributes={};}append(...children){this.children.push(...children);}setAttribute(k,v){this.attributes[k]=v;}focus(){if(!this.hidden&&!this.disabled)doc.activeElement=this;}}
 doc.createElement=t=>new Element(t);doc.head=new Element('head');doc.body=new Element('body');doc.getElementById=id=>{const find=e=>e.id===id?e:e.children.map(find).find(Boolean);return find(doc.head)||find(doc.body)||null;};
 const profile=doc.createElement('main');profile.id='profile';doc.body.append(profile);return doc;
}
function fixture({fail=false,reject=false,autoDiscover=false,hold=false}={}){
 const pair=generateKeyPairSync('ed25519'),now=Date.now();const payload={schema:1,channel:'lab',kind:'web-ota',appId:'com.icc.maintrack',issuedAt:now-1000,expiresAt:now+60000,nativeMinimum:'0.2.0',nativeMaximum:'0.3.0',bundleVersion:'0.3.1',bundleUrl:'https://updates.example.org/test.zip',sha256:'a'.repeat(64),bytes:1024,localData:{reportQueue:1,writesReportQueue:1,migration:'none'}};
 const envelope={payload,signature:reject?'A'.repeat(86):sign(null,Buffer.from(canonicalJson(payload)),pair.privateKey).toString('base64url')};
 const document=documentFixture(),calls={fetch:0,download:0,set:0},work={dirtyForm:false,unsentReports:0,submitting:false,offline:false,unknownQueue:false};let release;
 const panel=mountPilotPanel({document,autoDiscover,events:new EventTarget(),navigator:{onLine:false},config:{schema:1,channel:'lab',publicKeyBase64:pair.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url'),manifestUrl:'https://updates.example.org/release.json',allowedOrigins:['https://updates.example.org']},fetchImpl:async()=>{calls.fetch++;if(fail)throw Error('offline');return new Response(JSON.stringify(envelope),{headers:{'content-type':'application/json'}});},updater:{current:async()=>({native:'0.3.0',bundle:{id:'builtin'}}),getNextBundle:async()=>null,download:async()=>{calls.download++;if(hold)await new Promise(r=>{release=r;});return {id:'candidate'};},set:async()=>{calls.set++;}},localWork:{read:()=>({...work}),acquireActivation:()=>({isHeld:()=>true,release(){}})}});
 return {document,panel,calls,work,get:id=>document.getElementById('mt-pilot-'+id),release:()=>release()};
}
test('known update hides recheck during download and activation; opening focuses visible action',async()=>{
 const h=fixture({hold:true});assert.equal(h.get('check').hidden,false);await h.get('check').onclick();assert.equal(h.panel.read().phase,'available');assert.equal(h.get('check').hidden,true);assert.equal(h.get('download').hidden,false);
 h.get('open').onclick();assert.equal(h.document.activeElement,h.get('download'));
 const downloading=h.get('download').onclick();for(let i=0;i<100&&h.calls.download===0;i++)await new Promise(r=>setTimeout(r,5));assert.equal(h.calls.download,1);assert.equal(h.panel.read().phase,'downloading');assert.equal(h.get('check').hidden,true);assert.equal(h.get('download').disabled,true);assert.equal(h.get('close').disabled,false);h.release();await downloading;
 assert.equal(h.panel.read().phase,'ready');assert.equal(h.get('check').hidden,true);assert.equal(h.get('activate').hidden,false);h.get('open').onclick();assert.equal(h.document.activeElement,h.get('activate'));
 await h.get('activate').onclick();assert.equal(h.panel.read().phase,'activating');assert.equal(h.get('check').hidden,true);assert.equal(h.calls.set,1);assert.equal(h.get('close').disabled,true);
});
test('failed or rejected update retains retry without downloading or activating',async()=>{for(const options of [{fail:true},{reject:true}]){const h=fixture(options);await h.get('check').onclick();assert.ok(['failed','rejected'].includes(h.panel.read().phase));assert.equal(h.get('check').hidden,false);assert.equal(h.get('check').disabled,false);assert.equal(h.get('download').hidden,true);assert.equal(h.calls.download,0);assert.equal(h.calls.set,0);}});
test('pending local reports still block download and new edits still block activation',async()=>{
 const h=fixture();await h.get('check').onclick();h.work.unsentReports=2;await h.get('download').onclick();assert.equal(h.panel.read().phase,'blocked');assert.equal(h.calls.download,0);assert.equal(h.work.unsentReports,2);assert.equal(h.get('check').hidden,true);assert.equal(h.get('download').hidden,false);
 h.work.unsentReports=0;await h.get('download').onclick();h.work.dirtyForm=true;await h.get('activate').onclick();assert.equal(h.panel.read().phase,'ready');assert.equal(h.calls.set,0);assert.equal(h.get('check').hidden,true);assert.equal(h.get('activate').hidden,false);
});
test('account manual-check button remains wired to existing discovery action',()=>{const h=fixture({autoDiscover:true});const manual=h.document.getElementById('mt-update-manual');assert.ok(manual);assert.equal(manual.hidden,false);assert.equal(manual.onclick,h.get('check').onclick);assert.equal(h.calls.fetch,0);});
