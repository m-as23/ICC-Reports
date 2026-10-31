import test from 'node:test';import assert from 'node:assert/strict';
import {createTurnstileTokenProvider,installLoginProofClient} from '../security/login-turnstile-client.mjs';
import {createLoginProofClient} from '../../../supabase/functions/maintrack-final-047/login-proof.mjs';
test('Web/WebView widget passes action/binding only and removes its native instance after success',async()=>{
 let options,removed=0;const widget={render(el,o){options=o;return 'instance';},execute(){queueMicrotask(()=>options.callback('single-use-token'));},remove(id){assert.equal(id,'instance');removed++;}};
 const obtainToken=createTurnstileTokenProvider({widget,element:{},sitekey:'public-synthetic-key'});const client=createLoginProofClient({obtainToken});const r=await client({action:'login',code:'90000001',pw:'SyntheticOnly7'});assert.equal(r.admission.token,'single-use-token');assert.equal(options.action,'maintrack_login');assert.match(options.cData,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(options).includes('SyntheticOnly7'),false);assert.equal(removed,1);
});
test('widget timeout fails without retry, cleans the instance and permits a fresh explicit attempt',async()=>{
 let count=0,removed=0;const widget={render(){count++;return 'id';},execute(){},remove(){removed++;}};const get=createTurnstileTokenProvider({widget,element:{},sitekey:'public-synthetic-key',timeoutMs:5});await assert.rejects(()=>get({action:'maintrack_login',cData:'binding'}),/UNAVAILABLE/);assert.equal(count,1);assert.equal(removed,1);
});

test('explicit install binds the actual Web/native post hook and uninstall removes it',async()=>{
 const scope={};let options;const widget={render(el,o){options=o;return 'id';},execute(){queueMicrotask(()=>options.callback('one-token'));},remove(){}};
 const uninstall=installLoginProofClient({scope,widget,element:{},sitekey:'public-synthetic-key'});const b=await scope.MainTrackLoginProof({action:'login',code:'90000001',pw:'SyntheticOnly7'});assert.equal(b.admission.token,'one-token');assert.throws(()=>installLoginProofClient({scope,widget,element:{},sitekey:'public-synthetic-key'}),/ALREADY_INSTALLED/);uninstall();assert.equal(scope.MainTrackLoginProof,undefined);
});
