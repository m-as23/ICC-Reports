// Verify that a proposed native WebView package retains Android secure-session
// bootstrap. An ordinary Web bundle alone is not a safe replacement for v0.4.4.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(import.meta.dirname,'../../..');
export const requiredNativeAssets=[
 'index.html',
 'secure-assets/index-inline-1.js',
 'secure-assets/stage20-native-session.js'
];
export function verifyNativeSessionAssets(assetRoot,{config={appId:'com.icc.maintrack'}}={}){
 assert.equal(config.appId,'com.icc.maintrack','ANDROID_APP_ID_CHANGED');
 for(const item of requiredNativeAssets){
   const file=path.join(assetRoot,item);
   assert.ok(fs.existsSync(file),'MISSING_NATIVE_SESSION_ASSET: '+item);
   assert.ok(fs.statSync(file).isFile(),'NATIVE_ASSET_NOT_FILE: '+item);
 }
 const html=fs.readFileSync(path.join(assetRoot,'index.html'),'utf8');
 assert.ok(html.includes('secure-assets/stage20-native-session.js'),
   'NATIVE_SECURE_SESSION_BRIDGE_NOT_LOADED');
 const nativeBridge=fs.readFileSync(path.join(assetRoot,'secure-assets/stage20-native-session.js'),'utf8');
 assert.ok(nativeBridge.trim().length>=100,'NATIVE_SECURE_SESSION_BRIDGE_INVALID');
 const js=fs.readFileSync(path.join(assetRoot,'secure-assets/index-inline-1.js'),'utf8');
 assert.ok(js.includes('maintrack-unified-four-qa/api'),'NATIVE_API_NOT_APPROVED_QA');
 assert.ok(!js.includes('maintrack-stage9-security-api/api'),'LEGACY_NATIVE_API_PRESENT');
 return {appId:config.appId,secureSessionBridge:true,api:'maintrack-unified-four-qa'};
}

function main(){
 const mode=process.argv[2]||'--require';
 if(mode!=='--require'&&mode!=='--audit')throw Error('UNKNOWN_NATIVE_BRIDGE_MODE');
 const candidateRoot=path.join(ROOT,'audit-output/maintrack-staging-web-qa');
 const config=JSON.parse(fs.readFileSync(path.join(ROOT,'android/maintrack-app/capacitor.config.json'),'utf8'));
 try{
  const r=verifyNativeSessionAssets(candidateRoot,{config});
  console.log('PASS Android-native candidate has the secure-session bridge and QA API',JSON.stringify(r));
 }catch(error){
  if(mode!=='--audit')throw error;
  assert.match(error.message,/MISSING_NATIVE_SESSION_ASSET|NATIVE_SECURE_SESSION_BRIDGE_NOT_LOADED/,
    'UNEXPECTED_NATIVE_PRECHECK_FAILURE');
  console.log('EXPECTED_NATIVE_RELEASE_BLOCK: ordinary Web QA bundle lacks installed native 0.4.4 secure-session bridge.');
  console.log('The next signed Android APK MUST include and verify native session bootstrap from reviewed sources.');
  console.log('No signing or build authorized.');
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
