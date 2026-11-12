import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeCredentials,createRegisteredNativeClient,installRegisteredNativeClient} from './registered-login-native-client.mjs';
test('native bridge preserves WebAuthn JSON and uses only publicKey request JSON',async()=>{
 const calls=[];const response={id:'credential',type:'public-key',response:{clientDataJSON:'abc',authenticatorData:'def',signature:'ghi'}};
 const bridge={create:async x=>(calls.push(['create',x]),{responseJson:JSON.stringify(response)}),get:async x=>(calls.push(['get',x]),{responseJson:JSON.stringify(response)})};
 const credentials=createNativeCredentials(bridge);const options={challenge:'abcd',rpId:'reviewed.example',allowCredentials:[{type:'public-key',id:'abcd'}]};
 assert.deepEqual((await credentials.get({publicKey:options})).toJSON(),response);
 assert.deepEqual(calls,[['get',{requestJson:JSON.stringify(options)}]]);
 await credentials.create({publicKey:{challenge:'abcd',rp:{id:'reviewed.example'},user:{id:'abcd'}}});
 assert.equal(calls[1][0],'create');
});
test('missing bridge and malformed provider responses fail closed',async()=>{
 assert.throws(()=>createNativeCredentials({}),/NATIVE_PASSKEY_UNAVAILABLE/);
 const c=createNativeCredentials({create:async()=>({responseJson:'{}'}),get:async()=>{throw Error('CANCELLED');}});
 await assert.rejects(c.create({publicKey:{}}),/NATIVE_PASSKEY_RESPONSE/);
 await assert.rejects(c.get({publicKey:{}}),/CANCELLED/);
});
test('native adapter rejects caller supplied origin and clientDataHash',async()=>{
 let calls=0;const c=createNativeCredentials({create:async()=>{calls++;},get:async()=>{calls++;}});
 for(const publicKey of [{origin:'https://evil.example'},{clientDataHash:'abcd'}])await assert.rejects(c.get({publicKey}),/NATIVE_PASSKEY_OPTIONS/);
 assert.equal(calls,0);
});
test('native login keeps backend ticket and JSON proof, with no password fallback on cancellation',async()=>{
 const sent=[];let cancel=false;const response={id:'key',type:'public-key',response:{clientDataJSON:'native-origin',signature:'proof'}};
 const bridge={create:async()=>({responseJson:JSON.stringify(response)}),get:async()=>{if(cancel)throw Error('CANCELLED');return {responseJson:JSON.stringify(response)};}};
 const client=createRegisteredNativeClient({endpoint:'https://reviewed.example/api/login',bridge,ingressProof:async body=>body,fetchImpl:async(url,request)=>{
  const body=JSON.parse(request.body);sent.push(body);return {ok:true,json:async()=>body.identity.phase==='login-options'?{ticket:'server-ticket',options:{rpId:'reviewed.example',challenge:'challenge'}}:{ok:true}};
 }});
 assert.deepEqual(await client.login('code','password'),{ok:true});
 assert.deepEqual(sent[1].identity,{phase:'login-finish',ticket:'server-ticket',response});
 assert.equal(sent[1].pw,'password');cancel=true;
 await assert.rejects(client.login('code','password'),/CANCELLED/);
 assert.equal(sent.length,3);assert.equal(sent[2].identity.phase,'login-options');
});
test('installation defaults disabled and rejects another gateway host',()=>{
 const original=()=>{};const scope={MainTrackGatewayLogin:original,MainTrackLoginProof:async body=>body};
 assert.throws(()=>installRegisteredNativeClient({scope}),/NOT_ACTIVATED/);
 assert.throws(()=>installRegisteredNativeClient({scope,enabled:true,endpoint:'https://evil.example/api/login',allowedGatewayHost:'reviewed.example'}),/GATEWAY_SCOPE/);
 assert.equal(scope.MainTrackGatewayLogin,original);
});
