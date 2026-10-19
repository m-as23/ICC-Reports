// Fail-closed gate: a Web-only QA fixture is not yet safe as a native Android APK.
// The existing Owner 0.4.4 session bridge must be included and tested in the
// *new* signed native bundle, not assumed from browser QA or the JS API rewrite.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

export const REQUIRED_BRIDGE='secure-assets/stage20-native-session.js';
const root=path.resolve(import.meta.dirname,'../../..');
export function inspectNativeBridgeBundle({html,files}){
 assert.ok(typeof html==='string','NATIVE_BUNDLE_INDEX_MISSING');
 assert.ok(html.includes('stage13-native-ready.js'),'NATIVE_OTA_BOOTSTRAP_MISSING');
 assert.ok(html.includes('stage14-local-work.js'),'NATIVE_OFFLINE_WORK_BRIDGE_MISSING');
 assert.ok(html.includes(REQUIRED_BRIDGE),'ANDROID_SECURE_SESSION_BRIDGE_NOT_REFERENCED');
 assert.ok(files.includes(REQUIRED_BRIDGE),'ANDROID_SECURE_SESSION_BRIDGE_ASSET_MISSING');
 assert.ok(html.indexOf(REQUIRED_BRIDGE)<html.indexOf('secure-assets/index-inline-1.js'),
   'ANDROID_SECURE_SESSION_BRIDGE_LOADED_AFTER_APP');
 return {ok:true,bridge:REQUIRED_BRIDGE,ownerUpgradeRequired:true};
}
function main(){
 const dir=path.join(root,'audit-output/maintrack-qa-bundle');
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const files=[];
 const read=(p,rel='')=>{
  for(const ent of fs.readdirSync(p,{withFileTypes:true})){
   const name=path.posix.join(rel,ent.name);
   if(ent.isDirectory())read(path.join(p,ent.name),name);
   else if(ent.isFile())files.push(name);
   else throw Error('UNSAFE_NATIVE_ASSET');
  }
 };
 read(dir);
 const mode=process.argv[2]||'--enforce';
 try{
  inspectNativeBridgeBundle({html,files});
  console.log('PASS Native session/offline/OTA bridge included; on-device upgrade acceptance still required.');
 }catch(err){
  if(mode==='--audit'){
   console.log('BLOCKED_BEFORE_NATIVE_APK_405: '+err.message);
   console.log('Existing 0.4.4 Owner APK remains unchanged; no native signing permitted.');
   return;
  }
  throw err;
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
