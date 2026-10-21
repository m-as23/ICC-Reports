// Actual Android WebView + Keystore acceptance. Synthetic credentials only; no QA or production API traffic.
import {_android} from '../../android/maintrack-app/tests-browser/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import {execFileSync} from 'node:child_process';
const pkg='com.icc.maintrack.b2lab';
const phase=process.argv[2];
assert(['store','restore','logout','post-logout'].includes(phase));
const synthetic={token:'a'.repeat(64),code:'QA-SESSION-ONLY',name:'Synthetic QA',role:'technician'};
const evidence='.b2-native/evidence';
await fs.mkdir(evidence,{recursive:true});
const [device]=await _android.devices();
assert(device,'ANDROID_DEVICE_REQUIRED');
device.setDefaultTimeout(30000);
let page;let boundary='device-found';
function diagnostics(){
 fsSync.writeFileSync(evidence+'/boundary-'+phase+'.json',JSON.stringify({phase,boundary,syntheticOnly:true}));
 for(const [name,args] of [['crash',['logcat','-b','crash','-d']],['exits',['shell','dumpsys','activity','exit-info',pkg]],['logcat',['logcat','-d','-t','400']],['activity',['shell','dumpsys','activity','activities']],['sockets',['shell','cat','/proc/net/unix']]]){
  try{fsSync.writeFileSync(evidence+'/'+name+'-'+phase+'.txt',execFileSync('adb',args,{encoding:'utf8',timeout:5000,maxBuffer:1048576}));}catch{}
 }
}
const watchdog=setTimeout(()=>{console.error('DEVICE_SESSION_TEST_TIMEOUT',boundary);diagnostics();process.exit(1);},45000);
try{
  boundary='waiting-webview';console.log('B2_BOUNDARY',boundary);const view=await device.webView({pkg},{timeout:30000});
  boundary='connecting-page';console.log('B2_BOUNDARY',boundary);
  page=await view.page();boundary='page-attached';console.log('B2_BOUNDARY',boundary);
  page.setDefaultTimeout(30000);
  await page.route('**/*',r=>{
    return new URL(r.request().url()).origin==='https://localhost'
      ? r.continue() : r.abort('blockedbyclient');
  });
  boundary='waiting-native-ready';console.log('B2_BOUNDARY',boundary);await page.waitForFunction(()=>Boolean(globalThis.MainTrackSecureSession?.available?.() &&
    globalThis.Capacitor?.isNativePlatform?.() && document.querySelector('#lgo')));
  boundary='phase-'+phase;console.log('B2_BOUNDARY',boundary);if(phase==='store'){
    assert.equal(await page.evaluate(()=>localStorage.getItem('s')),null);
    await page.evaluate(async value=>{
      if(typeof save!=='function')throw Error('SHARED_LOGIN_SAVE_NOT_FOUND');
      await save(value);
      if(!S||S.code!==value.code)throw Error('MEMORY_SESSION_NOT_SET');
      sessionStorage.removeItem('s'); // force cold native restore path (not browser persistence).
    },synthetic);
    const stored=await page.evaluate(()=>globalThis.MainTrackSecureSession.read());
    assert.deepEqual(stored,synthetic);
    assert.equal(await page.evaluate(()=>localStorage.getItem('s')),null);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('s')),null);
    const xml=execFileSync('adb',['shell','run-as',pkg,'cat','shared_prefs/maintrack_protected_session_v1.xml'],{encoding:'utf8'});
    assert(xml.includes('encrypted'),'NO_ENCRYPTED_PREFS');
    assert(!xml.includes(synthetic.token),'PLAINTEXT_TOKEN_EXPOSED');
    console.log('MT_STAGE20_KEYSTORE_SYNTHETIC_STORE_PASS');
  }
  if(phase==='restore'){
    await page.waitForFunction(code=>{
      try{return JSON.parse(sessionStorage.getItem('s')||'null')?.code===code;}catch{return false;}
    },synthetic.code,{timeout:30000});
    assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('s')).token),synthetic.token);
    assert.equal(await page.evaluate(()=>localStorage.getItem('s')),null);
    assert.deepEqual(await page.evaluate(()=>globalThis.MainTrackSecureSession.read()),synthetic);
    assert.equal(await page.locator('#login').isVisible(),false);
    console.log('MT_STAGE20_FORCE_STOP_OFFLINE_NATIVE_SESSION_RESTORED_PASS');
  }
  if(phase==='logout'){
    await page.waitForFunction(code=>{
      try{return JSON.parse(sessionStorage.getItem('s')||'null')?.code===code;}catch{return false;}
    },synthetic.code,{timeout:30000});
    await page.evaluate(()=>logout());
    await page.waitForFunction(async ()=>{
      const data=await globalThis.MainTrackSecureSession.read();
      return data===null && sessionStorage.getItem('s')===null
        && localStorage.getItem('mt_native_logout_pending_v1')===null;
    });
    assert.equal(await page.locator('#login').isVisible(),true);
    console.log('MT_STAGE20_EXPLICIT_LOGOUT_CLEARS_NATIVE_SESSION_PASS');
  }
  if(phase==='post-logout'){
    await page.waitForFunction(()=>document.querySelector('#login') && !document.querySelector('#login').hidden);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('s')),null);
    assert.equal(await page.evaluate(()=>localStorage.getItem('s')),null);
    assert.equal(await page.evaluate(()=>globalThis.MainTrackSecureSession.read()),null);
    assert.equal(await page.locator('#login').isVisible(),true);
    assert.equal(await page.locator('[aria-label="Pilot demo system"]').count(),0);
    console.log('MT_STAGE20_OFFLINE_REOPEN_REQUIRES_LOGIN_AND_NO_PILOT_BADGE_PASS');
  }
  await fs.writeFile(evidence+'/'+phase+'.json',JSON.stringify({phase,passed:true,packageId:pkg,syntheticOnly:true,noBackendAccess:true},null,2)+'\n');
}catch(e){
  console.error('STAGE20_DEVICE_FAILED',phase,e.message);diagnostics();
  try{await page?.screenshot({path:evidence+'/failure-'+phase+'.png',timeout:4000});}catch{}
  throw e;
}finally{clearTimeout(watchdog);await device.close();}
