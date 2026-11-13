import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {installPasskeyBridge} from '../scripts/install-passkey-bridge.mjs';

function fixture(run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mt-passkey-build-'));
 const java=path.join(root,'app/src/main/java/com/icc/maintrack');fs.mkdirSync(java,{recursive:true});
 fs.writeFileSync(path.join(java,'MainActivity.java'),'package com.icc.maintrack;\npublic class MainActivity extends BridgeActivity {public void onCreate(android.os.Bundle s){registerPlugin(MainTrackSecureSessionPlugin.class);super.onCreate(s);}}');
 fs.writeFileSync(path.join(root,'app/build.gradle'),"dependencies {\n implementation project(':capacitor-android')\n}\n");
 try{run(root,java);}finally{assert.equal(path.dirname(fs.realpathSync(root)),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(root).startsWith('mt-passkey-build-'));fs.rmSync(root,{recursive:true,force:true});}
}
test('actual packaging copies/registers pinned Credential Manager bridge and is idempotent',()=>fixture((root,java)=>{
 installPasskeyBridge(root);const activity=fs.readFileSync(path.join(java,'MainActivity.java'),'utf8');const gradle=fs.readFileSync(path.join(root,'app/build.gradle'),'utf8');
 assert.match(activity,/registerPlugin\(MainTrackPasskeyPlugin.class\)/);assert.match(activity,/MainTrackSecureSessionPlugin/);
 assert.match(gradle,/androidx.credentials:credentials:1.6.0/);assert.match(gradle,/androidx.credentials:credentials-play-services-auth:1.6.0/);
 const source=fs.readFileSync(path.join(java,'MainTrackPasskeyPlugin.java'),'utf8');assert.match(source,/REVIEWED_RP_ID = ""/);assert.match(source,/PASSKEY_NOT_ACTIVATED/);
 installPasskeyBridge(root);assert.equal(fs.readFileSync(path.join(java,'MainActivity.java'),'utf8'),activity);assert.equal(fs.readFileSync(path.join(root,'app/build.gradle'),'utf8'),gradle);
}));
test('unexpected activity/version refuses before changing build outputs',()=>fixture((root,java)=>{
 const gradle=path.join(root,'app/build.gradle');fs.writeFileSync(gradle,"dependencies {\n implementation 'androidx.credentials:credentials:0.0.1'\n}\n");
 const before=fs.readFileSync(path.join(java,'MainActivity.java'),'utf8');assert.throws(()=>installPasskeyBridge(root),/DEPENDENCY_VERSION/);assert.equal(fs.readFileSync(path.join(java,'MainActivity.java'),'utf8'),before);assert.equal(fs.existsSync(path.join(java,'MainTrackPasskeyPlugin.java')),false);
}));
test('arbitrary package identities cannot select an Android signing/origin identity',()=>fixture(root=>{
 assert.throws(()=>installPasskeyBridge(root,{packageName:'com.attacker.app'}),/PACKAGE_IDENTITY/);
}));
test('normal APK preparation actually invokes the installer',()=>{
 const source=fs.readFileSync(new URL('../scripts/harden-native.mjs',import.meta.url),'utf8');assert.match(source,/installPasskeyBridge\(path.join\(root,'android'\),\{rpId:process.env.MAINTRACK_PASSKEY_RP_ID\?\?''\}\)/);
});
test('public RP is pinned only at build time and invalid hosts fail before writing',()=>fixture((root,java)=>{
 for(const rpId of ['https://example.com','127.0.0.1','example.com/path','example.com:443','example.com\";bad'])assert.throws(()=>installPasskeyBridge(root,{rpId}),/RP_HOST/);
 assert.equal(fs.existsSync(path.join(java,'MainTrackPasskeyPlugin.java')),false);
 const result=installPasskeyBridge(root,{rpId:'isolated-qa.example.com'});assert.equal(result.approvalConferred,false);assert.equal(result.signingAuthorized,false);assert.match(fs.readFileSync(path.join(java,'MainTrackPasskeyPlugin.java'),'utf8'),/REVIEWED_RP_ID = "isolated-qa.example.com"/);
}));
