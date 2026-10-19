import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {prepareNativeHtml,inventory} from '../scripts/prepare-native-405-qa.mjs';
import {prepareAlignedClient,sourcePath,OLD_API,QA_API} from '../scripts/prepare-qa-api-client.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
const htmlPath=path.join(root,'web/maintrack/public/index.html');

test('native 405 QA index injects Native session bridge before MainTrack and offline guard after V6',async()=>{
 const html=await fs.readFile(htmlPath,'utf8');
 const out=prepareNativeHtml(html);
 const boot='secure-assets/stage13-native-ready.js';
 const session='secure-assets/stage20-native-session.js';
 const local='secure-assets/stage14-local-work.js';
 assert.ok(out.indexOf('Content-Security-Policy')<out.indexOf(boot));
 assert.ok(out.indexOf(session)<out.indexOf('secure-assets/index-inline-1.js'));
 assert.ok(out.indexOf(local)>out.indexOf('v6.js'));
 assert.ok(out.includes('localhost')===html.includes('localhost'));
 assert.equal((out.match(/stage20-native-session.js/g)||[]).length,1);
});
test('native QA refuses broken or duplicate HTML injection locations',async()=>{
 const html=await fs.readFile(htmlPath,'utf8');
 assert.throws(()=>prepareNativeHtml(html.replace('Content-Security-Policy','CSP_REMOVED')),
  /MISSING_OR_UNSAFE_WEB_SECURITY/);
 assert.throws(()=>prepareNativeHtml(html.replace('</head>','<body>')),
  /NATIVE_BOOT_HTML_ANCHOR_MISSING_OR_DUPLICATE/);
 assert.throws(()=>prepareNativeHtml(html+'<script src="v6.js"></script>'),
  /NATIVE_BOOT_HTML_ANCHOR_MISSING_OR_DUPLICATE/);
 assert.throws(()=>prepareNativeHtml(prepareNativeHtml(html)),
  /NATIVE_BRIDGE_ALREADY_IN_SOURCE/);
});
test('full canonical Staging source is byte-preserved except exact API URL and native bootstrap',async()=>{
 const original=await fs.readFile(sourcePath,'utf8');
 const prepared=prepareAlignedClient(original);
 assert.equal(prepared.content.replace(QA_API,OLD_API),original);
 assert.equal(prepared.record.changedAssets.length,1);
 assert.equal(prepared.record.changedAssets[0],'secure-assets/index-inline-1.js');
 assert.equal(prepared.record.appId,'com.icc.maintrack');
 assert.equal(prepared.record.signingEnabled,false);
});
test('asset enumerator forbids source symlinks, including nested links',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'maintrack-native-safe-'));
 try{
   await fs.mkdir(path.join(tmp,'safe'),{recursive:true});
   await fs.writeFile(path.join(tmp,'safe/test.css'),'.safe{}');
   assert.deepEqual(await inventory(tmp),['safe/test.css']);
   await fs.symlink('/etc/hosts',path.join(tmp,'safe','link.css'));
   await assert.rejects(inventory(tmp),/SYMLINK_WEB_ASSET_NOT_ALLOWED/);
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
test('release package source contains native secure session plugin and safe OTA local data bridge',async()=>{
 const [session,local,java]=await Promise.all([
  fs.readFile(path.join(root,'android/maintrack-app/update-system/native-session-entry.mjs'),'utf8'),
  fs.readFile(path.join(root,'android/maintrack-app/update-system/local-work-startup.mjs'),'utf8'),
  fs.readFile(path.join(root,'android/maintrack-app/native/MainTrackSecureSessionPlugin.java'),'utf8')
 ]);
 assert.ok(session.includes("registerPlugin('MainTrackSecureSession')"));
 assert.ok(local.includes("MainTrackLocalWork"));
 assert.ok(local.includes("acquireActivation"));
 assert.ok(java.includes('AndroidKeyStore'));
});
