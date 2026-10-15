// Compiled ONLY into the isolated Stage14 Android test APK, never web production or user devices.
import {Capacitor} from '@capacitor/core';
import {CapacitorUpdater} from '@capgo/capacitor-updater';
import {verifyLabRelease,canActivate,stageVerifiedBundle} from '../update-system/ota-lab.mjs';

const lab=__STAGE14_CONFIG__;
const log=(s)=>{console.log(s);const e=document.createElement('p');e.textContent=s;document.body?.appendChild(e)};
const phaseKey='stage14-qa-phase';
const sentinelKey='stage14-qa-persist';
async function run(){
  if(!Capacitor.isNativePlatform()){log('MT_STAGE14_UNEXPECTED_WEB');return}
  // Called before fetch, before data loading, on every builtin app launch.
  await CapacitorUpdater.notifyAppReady();
  const state=localStorage.getItem(phaseKey);
  const current=await CapacitorUpdater.current();
  log('MT_STAGE14_CURRENT_'+JSON.stringify(current));
  if(state==='switching'){
    if(lab.scenario==='faulty'&&localStorage.getItem(sentinelKey)==='intact'
       &&(JSON.stringify(current).includes('builtin')||JSON.stringify(current).includes('native'))){
      log('MT_STAGE14_ROLLBACK_PASS_BUILTIN_AND_LOCAL_STORAGE');
    }else{
      log('MT_STAGE14_UNEXPECTED_BUILTIN_AFTER_SWITCH_'+lab.scenario);
    }
    return;
  }
  if(state) {log('MT_STAGE14_UNEXPECTED_PHASE_'+state);return}
  if(localStorage.getItem('q')!==null && localStorage.getItem('q')!=='[]') {
    log('MT_STAGE14_ABORT_REAL_QUEUE_PRESENT');
    return;
  }
  // Seed a synthetic unsent report to prove that our production scheduling guards refuse any update.
  localStorage.setItem('q',JSON.stringify([{id:'stage14-offline-queue-sentinel',u:'LAB-NO-ACCOUNT'}]));
  if(canActivate({unsentReports:JSON.parse(localStorage.getItem('q')).length})){
    log('MT_STAGE14_FAIL_UNSENT_QUEUE_NOT_BLOCKED');
    return;
  }
  log('MT_STAGE14_PENDING_QUEUE_GUARD_PASS');
  localStorage.setItem('q','[]');
  // Independent data persistence check; never write a real report into the backend.
  localStorage.setItem(sentinelKey,'intact');
  const release=await verifyLabRelease(lab.envelope,{
    publicKeyBase64:lab.publicKey,
    cryptoSubtle:crypto.subtle,
    now:Date.now(),
    allowedOrigins:['https://raw.githubusercontent.com'],
    currentNative:'0.3.0'
  });
  if(!release){log('MT_STAGE14_FAIL_SIGNATURE_VERIFICATION');return}
  log('MT_STAGE14_SIGNATURE_OK');
  const result=await stageVerifiedBundle({
    verifiedRelease:release,
    updater:CapacitorUpdater,
    getLocalState:()=>({unsentReports:JSON.parse(localStorage.getItem('q')||'[]').length})
  });
  if(result.status!=='scheduled') {
    log('MT_STAGE14_UPDATE_FAILED_'+JSON.stringify(result));
    return;
  }
  log('MT_STAGE14_BUNDLE_DOWNLOADED_AND_SCHEDULED');
  localStorage.setItem(phaseKey,'switching');
  await CapacitorUpdater.reload();
}
run().catch(e=>log('MT_STAGE14_EXCEPTION_'+String(e?.message||e)));
