import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gitBlob,OLD_API,QA_API} from '../scripts/prepare-qa-api-client.mjs';
import {prepareCompleteStagingWeb,verifyCompleteStagingWeb} from '../scripts/prepare-complete-staging-web.mjs';
import {verifyNativeSessionAssets} from '../scripts/check-next-native-session-assets.mjs';

async function sandbox(){
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'maintrack-staging-bundle-'));
 const source=path.join(tmp,'source'),destination=path.join(tmp,'qa-assets');
 await fs.mkdir(path.join(source,'secure-assets'),{recursive:true});
 const js="const API = '"+OLD_API+"';\nconst REPORT_QUEUE_VERSION = 1;\n";
 await fs.writeFile(path.join(source,'secure-assets/index-inline-1.js'),js);
 await fs.writeFile(path.join(source,'index.html'),'<html><body>MainTrack QA</body></html>');
 await fs.writeFile(path.join(source,'style.css'),'body { color: #111; }');
 return {tmp,source,destination,js,expectedSourceBlob:gitBlob(js)};
}
test('all Web assets preserved byte-for-byte except one reviewed 32-action QA API URL',async()=>{
 const t=await sandbox();
 try{
  const m=await prepareCompleteStagingWeb(t);
  assert.equal(m.files.length,3);
  assert.deepEqual(m.changedFiles,['secure-assets/index-inline-1.js']);
  assert.deepEqual(m.files.filter(x=>x.changed).map(x=>x.path),m.changedFiles);
  assert.equal((await fs.readFile(path.join(t.source,'secure-assets/index-inline-1.js'),'utf8')),t.js);
  assert.equal((await fs.readFile(path.join(t.destination,'secure-assets/index-inline-1.js'),'utf8')),t.js.replace(OLD_API,QA_API));
  assert.equal((await fs.readFile(path.join(t.destination,'style.css'),'utf8')),'body { color: #111; }');
  const verified=await verifyCompleteStagingWeb({source:t.source,destination:t.destination,
   expectedSourceBlob:t.expectedSourceBlob,manifestPath:t.destination+'-provenance.json'});
  assert.equal(verified.changed,1);
  assert.equal(verified.apiActions,32);
 }finally{await fs.rm(t.tmp,{recursive:true,force:true});}
});
test('rejects untrusted symbolic links even nested in Web asset directory',async()=>{
 const t=await sandbox();
 try{
  await fs.symlink(path.join(t.source,'style.css'),path.join(t.source,'secure-assets','linked.css'));
  await assert.rejects(prepareCompleteStagingWeb(t),/SYMLINK_WEB_ASSET_NOT_ALLOWED/);
 }finally{await fs.rm(t.tmp,{recursive:true,force:true});}
});
test('rejects attempted overwrite of an existing staging directory',async()=>{
 const t=await sandbox();
 try{
  await fs.mkdir(t.destination);
  await assert.rejects(prepareCompleteStagingWeb(t),/STAGING_OUTPUT_ALREADY_EXISTS/);
 }finally{await fs.rm(t.tmp,{recursive:true,force:true});}
});
test('refuses a staging destination inside the canonical source tree',async()=>{
 const t=await sandbox();
 try{
  await assert.rejects(prepareCompleteStagingWeb({...t,destination:path.join(t.source,'preview')}),/STAGING_SOURCE_DESTINATION_OVERLAP/);
 }finally{await fs.rm(t.tmp,{recursive:true,force:true});}
});
test('rejects tampered output JS when verifying complete staging bundle',async()=>{
 const t=await sandbox();
 try{
  await prepareCompleteStagingWeb(t);
  await fs.appendFile(path.join(t.destination,'secure-assets/index-inline-1.js'),'\n// unreviewed');
  await assert.rejects(verifyCompleteStagingWeb({source:t.source,destination:t.destination,
   expectedSourceBlob:t.expectedSourceBlob,manifestPath:t.destination+'-provenance.json'}),/QA_ASSET_BYTES_TAMPERED/);
 }finally{await fs.rm(t.tmp,{recursive:true,force:true});}
});
test('rejects candidate source drift from the pinned Git blob',async()=>{
 const t=await sandbox();
 try{
  await fs.appendFile(path.join(t.source,'secure-assets/index-inline-1.js'),'//unexpected');
  await assert.rejects(prepareCompleteStagingWeb(t),/UNREVIEWED_CANONICAL_WEB_JS_CHANGED/);
 }finally{await fs.rm(t.tmp,{recursive:true,force:true});}
});
test('Web QA is not a native APK: missing stage20 session bootstrap blocks signing',async()=>{
 const t=await sandbox();
 try{
  await prepareCompleteStagingWeb(t);
  assert.throws(()=>verifyNativeSessionAssets(t.destination),/MISSING_NATIVE_SESSION_ASSET/);
 }finally{await fs.rm(t.tmp,{recursive:true,force:true});}
});
test('native session verifier accepts a complete staged QA app with bootstrap reference',async()=>{
 const t=await sandbox();
 try{
  await prepareCompleteStagingWeb(t);
  await fs.writeFile(path.join(t.destination,'secure-assets/stage20-native-session.js'),'// trusted native session bootstrap\n'+('const noop = 1;\n'.repeat(8)));
  await fs.writeFile(path.join(t.destination,'index.html'),
    '<html><head><script src="secure-assets/stage20-native-session.js"></script></head><body></body></html>');
  const r=verifyNativeSessionAssets(t.destination);
  assert.equal(r.secureSessionBridge,true);
  assert.equal(r.appId,'com.icc.maintrack');
  assert.throws(()=>verifyNativeSessionAssets(t.destination,{config:{appId:'com.other'}}),/ANDROID_APP_ID_CHANGED/);
 }finally{await fs.rm(t.tmp,{recursive:true,force:true});}
});
