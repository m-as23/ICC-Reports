// Actual Android UI + native session bridge, cloud responses forwarded by bounded Node transport.
// This does not test Android TLS or direct Android-to-Supabase networking.
import {_android} from '../../android/maintrack-app/tests-browser/node_modules/playwright/index.mjs';
import {BoundedQaClient} from './bounded-client.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {parseCiCredentials,chooseLeaveDate} from './connected-guards.mjs';
const creds=parseCiCredentials(process.env.MAINTRACK_B2_QA_CREDENTIALS);
const endpoint='https://szhstrafzkxzstjdcynl.supabase.co/functions/v1/maintrack-isolated-e2e-b2/api';
const pkg='com.icc.maintrack.b2lab';const checks=[],ids={};let passed=false,page,device,stop;
const client=new BoundedQaClient();
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('B2_UI_PASS',name);};
const nav=async id=>{if(await page.evaluate(()=>!document.body.classList.contains('v6Drawer')))await page.locator('#v6Toggle').click();await page.locator(id).click();};
try{
 const ready=await client.request('readyz',{origin:'https://localhost'});check('B2 readiness and mail disabled',ready.status==='ready'&&ready.mailDelivery===false);
 [device]=await _android.devices();assert(device,'ANDROID_REQUIRED');device.setDefaultTimeout(30000);const view=await device.webView({pkg},{timeout:30000});page=await view.page();page.setDefaultTimeout(20000);
 await page.route('**/*',r=>new URL(r.request().url()).origin==='https://localhost'?r.continue():r.abort());
 await page.waitForFunction(()=>Boolean(globalThis.MainTrackSecureSession?.available?.()&&document.querySelector('#lgo')));
 // No browser/network interception bypass: the offline APK's original API constant stays B2.
 // The explicit RPC adapter sends real requests from the runner with the fixed QA marker and limits.
 await page.exposeBinding('__maintrackB2Transport',async(_,{url,body,authorization})=>{
  assert.equal(url,endpoint,'B2_TARGET');assert.equal(typeof body,'string','B2_BODY');const b=JSON.parse(body);
  const data=await client.request('api',{body:b,token:authorization?.replace(/^Bearer /,''),origin:'https://localhost'});
  if(b.action==='submit')ids.report=data.id;if(b.action==='leaveRequest')ids.leave=data.id;
  return data;
 });
 await page.evaluate(target=>{globalThis.fetch=async(url,options={})=>{
  if(String(url)!==target||options.method!=='POST')throw Error('B2_TRANSPORT_ONLY');
  const headers=new Headers(options.headers);const data=await globalThis.__maintrackB2Transport({url:String(url),body:options.body,authorization:headers.get('authorization')||undefined});
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };},endpoint);
 page.on('dialog',d=>d.accept());
 async function login(role){await page.locator('#lcode').fill('QA_B2_'+role.toUpperCase());await page.locator('#lpw').fill(creds[role]);await page.locator('#lgo').click();await page.locator('#who').waitFor({state:'visible'});await page.waitForFunction(()=>typeof startPending!=='undefined'&&!startPending);check(role+' Android UI login via real B2',true);}
 async function logout(){await page.locator('#out').click();await page.locator('#login').waitFor({state:'visible'});await page.waitForFunction(async()=>await globalThis.MainTrackSecureSession.read()===null);}
 await login('engineer');check('native session stored for real B2 account',await page.evaluate(async()=>{const s=await globalThis.MainTrackSecureSession.read();return s?.code==='QA_B2_ENGINEER'&&/^[a-f0-9]{64}$/.test(s.token)&&localStorage.getItem('s')===null;}));
 const mine=await client.request('api',{body:{action:'leaveMine'},token:await page.evaluate(async()=>(await globalThis.MainTrackSecureSession.read()).token),origin:'https://localhost'});const fixtureDate=chooseLeaveDate(mine.items);check('fresh leave fixture checked before writes',true);
 await nav('#tabForm');await page.locator('#section').selectOption('QA_B2_SECTION');await page.locator('#machine').selectOption('QA_B2_MACHINE');await page.locator('#comp').selectOption('QA_B2_COMPONENT');
 for(const [id,value] of Object.entries({desc:'Synthetic Android B2 cloud-adapter smoke',solution:'Synthetic Android verification',date:'2026-10-18',t1:'07:00',t2:'07:15',t3:'08:00'}))await page.locator('#'+id).fill(value);
 await page.locator('#status').selectOption('Closed');await page.locator('#cat').selectOption('Electrical');await page.locator('#send').click();await page.waitForFunction(()=>document.querySelector('#msg').textContent.includes('تم حفظ:'));check('Android report persisted via real B2',!!ids.report);
 await nav('#tabProfile');await page.waitForFunction(()=>document.querySelector('#profileCode').textContent==='QA_B2_ENGINEER');await page.locator('#accountLeaveDetails > summary').click();await page.locator('#leaveType').selectOption('annual');await page.locator('#leaveStart').fill(fixtureDate);await page.locator('#leaveEnd').fill(fixtureDate);await page.locator('#leaveDuration').selectOption('HALF_DAY');await page.locator('#leaveReason').fill('Synthetic Android B2 half day');await page.locator('#sendLeave').click();await page.waitForFunction(()=>document.querySelector('#leaveFeedback').textContent.includes('تم إرسال'));check('Android half day request persisted',!!ids.leave);await page.waitForFunction(()=>!document.querySelector('#sendLeave').disabled);await logout();
 await login('owner');await nav('#tabApprove');await page.locator('.approval-card[data-request-id="'+ids.leave+'"]').getByText('اعتماد الطلب',{exact:true}).click();await page.locator('#ownerHistoryRows .approval-card[data-request-id="'+ids.leave+'"] .request-status--approved').waitFor();check('Owner Android UI decision moved to history',true);await logout();
 await login('technician');check('technician restricted Android UI',!await page.locator('#tabAdmin').isVisible()&&!await page.locator('#tabApprove').isVisible()&&!await page.locator('#mMttr').isVisible());await logout();passed=true;
}catch(e){stop=/^QA_[A-Z_]+$/.test(e.message)?e.message:'B2_ANDROID_CHECK_FAILED';console.error(stop);process.exitCode=1;}
finally{await device?.close();await fs.mkdir('.b2-connected',{recursive:true});await fs.writeFile('.b2-connected/evidence.json',JSON.stringify({passed,checks,ids,stop,bounds:client.summary(),transport:'Explicit Node RPC adapter; real B2 responses; offline Android APK',directAndroidTlsTested:false},null,2));for(const k of Object.keys(creds||{}))creds[k]='';}
