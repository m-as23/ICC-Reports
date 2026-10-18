// Stage22 single Android35 WebView smoke, isolated QA app only.
// All remote traffic is intercepted/blocked; ZERO requests to production or real QA database.
// Run phases "online" -> force-stop and disable network -> "offline" on same emulator.
import {_android} from '../../tests-browser/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const pkg='com.icc.maintrack.stage22qa';
const phase=process.argv[2];
assert.ok(['online','offline'].includes(phase),'Expected online/offline phase');
const root='qa-results/stage22-emulator';
const api='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa/api';
const fake={token:'stage22-synthetic-device-token',code:'QA-OWNER-EMU',name:'Synthetic Emulator Owner',role:'owner'};
const sentinel={u:fake.code,cid:'stage22-android-durable-queue',desc:'Synthetic unsent maintenance report'};
const expected=JSON.stringify([sentinel]);
await fs.mkdir(root,{recursive:true});
const errors=[],calls=[],blocked=[];
const watchdog=setTimeout(()=>{console.error('STAGE22_EMULATOR_TIMEOUT');process.exit(1)},110000);
const [device]=await _android.devices();
assert.ok(device,'ANDROID_EMULATOR_MISSING');
device.setDefaultTimeout(25000);
let page;
const profile={code:fake.code,name:fake.name,role:'owner',leaveBalance:12};
const mockReply=(action,params)=>{
  switch(action){
    case 'login': return fake;
    case 'session': return {ok:true,name:fake.name,role:'owner'};
    case 'init': return {id:'QA-EMU-WO',role:'owner',sections:['QA_SECTION'],
      machines:[['QA_SECTION','QA_MACHINE']],parts:[['QA_SECTION','QA_PART']],
      status:['Open','Closed'],cats:['Electrical','Mechanical']};
    case 'nextId': return {id:'QA-EMU-WO'};
    case 'dashboard': return {metrics:{},recent:[],topMachines:[],sectionHours:[]};
    case 'notifications': return {items:[],storedItems:[],pendingItems:[],pendingCount:0};
    case 'profile': return {profile};
    case 'accountSummary': return {profile,annualAvailableDays:12,annualTotalDays:20,
      annualUsedDays:8,substituteAvailableDays:0,substituteEarnedDays:0,
      substituteUsedDays:0,financialApprovedDays:0};
    case 'leaveMine': return {items:[],profile};
    case 'overtimeMine': return {items:[]};
    case 'overtimeSummary': return {approvedHours:0,financialHours:0,substituteHours:0,
      distinctDays:0,pendingCount:1,approvedCount:0,employees:[]};
    case 'leaveInbox': return {items:[{id:'LV-EMU-PENDING',name:'Synthetic Technician',
      code:'QA-EMP-EMU',type:'annual',start:'2026-10-17',end:'2026-10-17',
      days:1,status:'PENDING',reason:'No real employee data',createdAt:'2026-10-17T08:00:00Z'},
      {id:'LV-EMU-HISTORY',name:'Synthetic Engineer',code:'QA-ENG-EMU',
       type:'annual',start:'2026-10-16',end:'2026-10-16',days:1,status:'APPROVED',
       createdAt:'2026-10-16T08:00:00Z',decidedAt:'2026-10-16T09:00:00Z'}],pendingCount:1};
    case 'overtimeInbox': return {items:[{id:'OT-EMU-PENDING',name:'Synthetic Engineer',
      code:'QA-ENG-EMU',date:'2026-10-17',from:'15:00',to:'18:00',minutes:180,
      hours:3,compensation:'FINANCIAL',workKind:'AFTER_SHIFT',reason:'Synthetic',
      status:'PENDING',createdAt:'2026-10-17T11:00:00Z'}]};
    default: return {ok:true};
  }
};
try{
  const view=await device.webView({pkg});
  page=await view.page();
  page.setDefaultTimeout(25000);
  page.on('pageerror',e=>errors.push(e.message));
  // Fail closed: never allow Supabase (or any external origin) to receive credentials/requests.
  await page.route('**/*',async route=>{
    const req=route.request(),url=req.url();
    if(new URL(url).origin==='https://localhost')return route.continue();
    if(phase==='online'&&url===api){
      if(req.method()==='OPTIONS')return route.fulfill({status:200,contentType:'application/json',
        headers:{'Access-Control-Allow-Origin':'https://localhost',
          'Access-Control-Allow-Headers':'authorization,content-type,x-request-id',
          'Access-Control-Allow-Methods':'GET,POST,OPTIONS'},body:'{}'});
      const payload=req.postDataJSON()||{};
      calls.push(payload.action);
      // Explicitly forbid any business-data writes, even to a mock endpoint.
      assert.ok(!['submit','leaveDecision','overtimeDecision','overtimeRequest','leaveRequest'].includes(payload.action),
        'Unexpected write during read-only emulator smoke: '+payload.action);
      return route.fulfill({status:200,contentType:'application/json',
        headers:{'Access-Control-Allow-Origin':'https://localhost'},
        body:JSON.stringify(mockReply(payload.action,payload))});
    }
    blocked.push(url.split('?')[0]);
    return route.abort('blockedbyclient');
  });
  await page.waitForFunction(()=>!!document.getElementById('lgo')
    && !!globalThis.MainTrackLocalWork?.read
    && globalThis.Capacitor?.isNativePlatform?.()
    && globalThis.MainTrackSecureSession?.available?.(),null,{timeout:30000});
  assert.equal(await page.locator('[aria-label="Pilot demo system"]').count(),0);
  if(phase==='online'){
    assert.equal(await page.locator('#login').isVisible(),true);
    await page.locator('#lcode').fill(fake.code);
    await page.locator('#lpw').fill('LOCAL-SYNTHETIC-ONLY');
    await page.locator('#lgo').click();
    await page.locator('#tabApprove').waitFor({state:'visible',timeout:30000});
    await page.locator('#tabApprove').evaluate(button=>button.click());
    await page.waitForFunction(()=>document.getElementById('ownerPendingCount')?.textContent==='2',
      null,{timeout:30000});
    assert.equal(await page.locator('#ownerPendingRows .approval-card').count(),2);
    assert.equal(await page.locator('#ownerHistoryRows .approval-card').count(),1);
    assert.ok((await page.locator('#ownerPendingRows').innerText()).includes('إجازة'));
    assert.ok((await page.locator('#ownerPendingRows').innerText()).includes('إضافي'));
    assert.deepEqual(await page.evaluate(()=>globalThis.MainTrackSecureSession.read()),fake,
      'Encrypted native QA login session must be stored');
    await page.evaluate(raw=>localStorage.setItem('q',raw),expected);
    assert.equal((await page.evaluate(()=>MainTrackLocalWork.read())).unsentReports,1);
    assert.equal(await page.evaluate(()=>localStorage.getItem('q')),expected);
    assert.ok(calls.includes('login')&&calls.includes('leaveInbox')&&calls.includes('overtimeInbox'));
    // The WebView storage flush is asynchronous. Keep it foregrounded long enough to persist.
    await new Promise(resolve=>setTimeout(resolve,6500));
    assert.equal(await page.evaluate(()=>localStorage.getItem('q')),expected);
    await page.screenshot({path:root+'/owner-qa-online.png',timeout:10000});
    console.log('STAGE22_EMULATOR_OWNER_INBOX_AND_SYNTHETIC_QUEUE_PASS');
  }else{
    await page.waitForFunction(()=>globalThis.MainTrackLocalWork?.read?.().unsentReports===1,
      null,{timeout:30000});
    assert.equal(await page.evaluate(()=>localStorage.getItem('q')),expected,
      'Unsent report must survive actual Android force-stop and offline relaunch');
    assert.equal((await page.evaluate(()=>MainTrackLocalWork.read())).unsentReports,1);
    assert.deepEqual(await page.evaluate(()=>globalThis.MainTrackSecureSession.read()),fake,
      'Encrypted owner session should survive offline force-stop');
    await page.screenshot({path:root+'/offline-queue-preserved.png',timeout:10000});
    console.log('STAGE22_EMULATOR_OFFLINE_FORCE_STOP_QUEUE_PERSISTENCE_PASS');
  }
  assert.deepEqual(errors,[],'WebView uncaught JavaScript errors');
  await fs.writeFile(root+'/'+phase+'.json',JSON.stringify({
    phase,result:'PASS',sourceCommit:process.env.GITHUB_SHA||'unknown',
    packageId:pkg,syntheticOnly:true,allExternalRequestsMockedOrBlocked:true,
    realBackendWrites:0,reportQueueCount:1,encryptedSessionChecked:true,
    actionsObserved:calls,blockedRemoteCount:blocked.length
  },null,2)+'\n');
}catch(e){
  console.error('STAGE22_EMULATOR_FAILED',phase,e.stack||String(e));
  try{await page?.screenshot({path:root+'/failure-'+phase+'.png',timeout:4000});}catch{}
  try{await fs.writeFile(root+'/failure-'+phase+'.txt',String(e.stack||e));}catch{}
  try{await fs.writeFile(root+'/adb-logcat-'+phase+'.txt',
    execFileSync('adb',['logcat','-d','-t','500'],{timeout:10000,maxBuffer:1024*1024}));}catch{}
  throw e;
}finally{
  clearTimeout(watchdog);
  await device.close();
}
