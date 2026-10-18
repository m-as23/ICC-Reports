// Actual feature-branch Web release UI, with a fully synthetic localhost backend.
// No real Supabase, update server, employee credentials, notifications or DB writes.
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'../unified-four-review/web/.vercel/output/static');
let server,browser,origin,commit;
const qaProfile=role=>({
 code:role==='owner'?'QA-OWNER':'QA-ENGINEER',name:'Synthetic QA Account',role,
 department:'Electrical Maintenance',jobTitle:role==='owner'?'Maintenance Owner':'Electrical Engineer',
 leaveBalance:22
});
const overtime=[
 {id:'OT-QA-MONEY',date:'2026-10-14',from:'15:00',to:'19:00',
   minutes:240,hours:4,compensation:'FINANCIAL',workKind:'AFTER_SHIFT',status:'APPROVED',reason:'Demo'},
 {id:'OT-QA-BADAL',date:'2026-10-15',from:'07:00',to:'15:00',
   minutes:480,hours:8,compensation:'SUBSTITUTE',workKind:'INDEPENDENT_DAY',status:'PENDING',reason:'Demo'}
];
before(async()=>{
 const names=await fs.readdir(path.join(root,'releases'));
 assert.equal(names.length,1,'one immutable feature candidate');
 commit=names[0];
 server=http.createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   const rel=pathname.endsWith('/')?pathname+'index.html':pathname;
   const filename=path.resolve(root,'.'+rel);
   if(!filename.startsWith(root+path.sep))throw Error('OUTSIDE');
   const content=await fs.readFile(filename);
   const ext=path.extname(filename);
   const types={'.html':'text/html','.css':'text/css','.js':'application/javascript',
     '.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
   res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'});
   res.end(content);
  }catch{res.writeHead(404);res.end('Not found')}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,channel:'chromium'});
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});

async function withPage(role,run){
 const ctx=await browser.newContext({serviceWorkers:'block'});
 const errors=[],actions=[];
 const decisions={leave:null,overtime:null};
 ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await ctx.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===origin)return route.continue();
  if(!/^https:\/\/tdnkeskczcsukcujwinu\.supabase\.co\/functions\/v1\/maintrack-stage9-security-api\/api$/.test(request.url()))
   return route.abort('blockedbyclient');
  const ok=(data)=>route.fulfill({status:200,contentType:'application/json',headers:{
    'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body:JSON.stringify(data)});
  if(request.method()==='OPTIONS')return ok({});
  const data=request.postDataJSON()||{};
  actions.push(data.action);
  const profile=qaProfile(role);
  switch(data.action){
   case 'login':return ok({token:'synthetic-qa',code:profile.code,name:profile.name,role});
   case 'session':return ok({ok:true,role,name:profile.name});
   case 'init':return ok({id:'QA-WO-NEXT',role,sections:['DRAWING'],
       machines:[['DRAWING','QA-MACHINE']],parts:[['DRAWING','QA-PART']],
       status:['Open','Closed'],cats:['Electrical','Mechanical']});
   case 'nextId':return ok({id:'QA-WO-NEXT'});
   case 'dashboard':return ok({metrics:{},recent:[],topMachines:[],sectionHours:[]});
   case 'notifications':return ok({items:[],storedItems:[],pendingItems:[],pendingCount:0});
   case 'profile':return ok({profile});
   case 'accountSummary':return ok({profile,annualAvailableDays:22,annualTotalDays:28,
      annualUsedDays:6,substituteAvailableDays:4.5,substituteEarnedDays:8.5,
      substituteUsedDays:4,financialApprovedDays:6});
   case 'leaveMine':return ok({profile,items:[]});
   case 'overtimeMine':return ok({items:overtime});
   case 'overtimeSummary':return ok({approvedHours:48,financialHours:16,
      substituteHours:32,distinctDays:6,pendingCount:1,approvedCount:7,
      employees:[{code:'QA-ENGINEER',name:'Synthetic QA Engineer'}]});
   case 'overtimeDecision':decisions.overtime=data.decision;return ok({ok:true});
   case 'leaveDecision':decisions.leave=data.decision;return ok({ok:true});
   case 'overtimeInbox':return ok({items:[
      {...overtime[1],name:'Pilot Engineer',code:'PILOT02',status:decisions.overtime||'PENDING'},
      {...overtime[0],name:'QA Approved Engineer',code:'QAENG',status:'APPROVED'},
      {id:'OT-QA-REJECT',date:'2026-10-13',from:'16:00',to:'18:00',
       minutes:120,hours:2,compensation:'FINANCIAL',workKind:'AFTER_SHIFT',
       name:'QA Rejected Engineer',code:'QAREJ',status:'REJECTED',decisionReason:'طلب مكرر'}
    ]});
   case 'leaveInbox':return ok({items:[
      {id:'LV-QA',name:'Pilot Engineer',code:'PILOT02',
       type:'annual',start:'2026-10-16',end:'2026-10-16',days:1,durationKind:'FULL_DAY',
       status:decisions.leave||'PENDING',reason:'Demo leave'},
      {id:'LV-QA-APPROVED',name:'Approved Pilot Technician',code:'QATECH',
       type:'annual',start:'2026-10-17',end:'2026-10-17',days:1,status:'APPROVED'},
      {id:'LV-QA-REJECTED',name:'Rejected Pilot Technician',code:'QAREJ',
       type:'compensatory',start:'2026-10-15',end:'2026-10-15',days:0.5,
       durationKind:'HALF_DAY',status:'REJECTED',decisionReason:'الرصيد غير كاف'}
    ],pendingCount:decisions.leave?0:1});
   case 'overtimeRequest':return ok({id:'OT-NEW-QA',status:'PENDING'});
   default:return ok({ok:true});
  }
 });
 const page=await ctx.newPage();
 try{
  await page.goto(origin+'/releases/'+commit+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#lcode').fill(profileCode(role));
  await page.locator('#lpw').fill('synthetic-password');
  await page.locator('#lgo').click();
  await page.locator('#tabProfile').waitFor({state:'visible',timeout:12000});
  await run({page,ctx,errors,actions});
  assert.deepEqual(errors,[],'actual UI must not raise script errors');
 }finally{await ctx.close();}
}
function profileCode(role){return role==='owner'?'QA-OWNER':'QA-ENGINEER'}

test('employee sees day-based My Account, 3 history filters, native-safe dirty overtime form',async()=>{
 await withPage('engineer',async({page,actions})=>{
  await page.locator('#tabProfile').click();
  await page.locator('#profile').waitFor({state:'visible'});
  // Profile fetches run concurrently; page visibility precedes API completion.
  await page.waitForFunction(()=>document.getElementById('leaveBalance')?.textContent.trim()==='22');
  assert.equal((await page.locator('#leaveBalance').innerText()).trim(),'22');
  assert.equal((await page.locator('#substituteBalance').innerText()).trim(),'4.5');
  assert.equal((await page.locator('#otFinancial').innerText()).trim(),'6');
  assert.ok((await page.locator('#annualTotal').innerText()).includes('28'));
  assert.ok((await page.locator('#substituteEarned').innerText()).includes('8.5'));
  assert.equal(await page.locator('#accountLeaveDetails').count(),1);
  assert.equal(await page.locator('#accountOvertimeDetails').count(),1);
  await page.locator('#historyFilterFinancial').click();
  assert.ok((await page.locator('#otMine').innerText()).includes('OT-QA-MONEY'));
  assert.ok(!(await page.locator('#otMine').innerText()).includes('OT-QA-BADAL'));
  await page.locator('#historyFilterSubstitute').click();
  assert.ok((await page.locator('#otMine').innerText()).includes('OT-QA-BADAL'));
  assert.ok(!(await page.locator('#otMine').innerText()).includes('OT-QA-MONEY'));
  await page.locator('#accountOvertimeDetails summary').click();
  const work=page.locator('#otReason');
  await work.fill('Actual test-only unfinished draft');
  const state=await page.evaluate(()=>MainTrackLocalWork.read());
  assert.equal(state.dirtyForm,true,'unsent overtime must block OTA even without a network request');
  assert.ok(!actions.includes('overtimeRequest'));
 });
});

test('Owner inbox renders detailed named overtime and leave cards with clear approval states',async()=>{
 await withPage('owner',async({page,actions})=>{
  await page.locator('#tabApprove').click();
  await page.locator('#approvals').waitFor({state:'visible'});
  const overtimeCard=page.locator('#otApprovalRows .approval-card--detailed').first();
  await overtimeCard.waitFor({state:'visible'});
  const text=await overtimeCard.innerText();
  for(const detail of ['Pilot Engineer','PILOT02','OT-QA-BADAL',
    '7:00 صباحًا','3:00 مساءً','يوم مستقل','قيد المراجعة','1 يوم مكافئ'])
    assert.ok(text.includes(detail),'missing owner overtime detail: '+detail);
  const leaveCard=page.locator('#approvalRows .approval-card--detailed').first();
  await leaveCard.waitFor({state:'visible'});
  const leaveText=await leaveCard.innerText();
  for(const detail of ['LV-QA','سنوية','2026-10-16'])
    assert.ok(leaveText.includes(detail),'missing leave detail: '+detail);
  assert.ok(actions.includes('overtimeInbox'));
  assert.ok(actions.includes('leaveInbox'));
  // Never click approval: this is a read-only synthetic UI verification.
 });
});


test('mobile Owner inbox keeps pending cards detailed and completed cards compact with audit drill-down',async()=>{
 await withPage('owner',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  // Trigger the existing navigation handler without synthetic Playwright scrolling;
  // the bottom fixed nav can be outside the desktop emulation click rectangle.
  await page.locator('#tabApprove').evaluate(button=>button.click());
  const pending=page.locator('#approvalRows .approval-card--detailed').first();
  const approved=page.locator('#approvalRows .approval-card--compact').first();
  const rejected=page.locator('#approvalRows .approval-card--compact').last();
  await approved.waitFor({state:'visible'});
  assert.ok((await pending.innerText()).includes('اعتماد الطلب'));
  assert.equal(await approved.locator('.request-actions').count(),0);
  assert.equal(await rejected.locator('.request-actions').count(),0);
  assert.ok((await approved.innerText()).includes('LV-QA-APPROVED'));
  assert.ok((await rejected.innerText()).includes('سبب الرفض'));
  const pBox=await pending.boundingBox(),cBox=await approved.boundingBox();
  assert.ok(cBox.height<pBox.height*0.72,'completed request must save substantial vertical space');
  assert.equal(await approved.locator('details').evaluate(el=>el.open),false);
  await approved.locator('summary').click();
  assert.ok((await approved.innerText()).includes('تاريخ البداية'));
  const otPending=page.locator('#otApprovalRows .approval-card--detailed').first();
  const otCompact=page.locator('#otApprovalRows .approval-card--compact').first();
  await otCompact.waitFor({state:'visible'});
  assert.ok((await otPending.innerText()).includes('اعتماد الطلب'));
  assert.ok((await otCompact.innerText()).includes('التعويض'));
  assert.ok((await otCompact.innerText()).includes('المدة'));
  assert.ok((await otCompact.innerText()).includes('OT-QA-MONEY'));
  assert.ok((await otCompact.boundingBox()).height<(await otPending.boundingBox()).height*0.75);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'no mobile horizontal overflow');
 });
});

test('owner approval changes a detailed pending request into a compact read-only card',async()=>{
 await withPage('owner',async({page,actions})=>{
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('#tabApprove').click();
  const target=page.locator('#approvalRows .approval-card').first();
  await target.locator('button', {hasText:'اعتماد الطلب'}).click();
  await page.waitForFunction(()=>{
   const first=document.querySelector('#approvalRows .approval-card');
   return first?.classList.contains('approval-card--compact') &&
          first?.querySelector('.request-status--approved');
  });
  assert.equal(await target.locator('.request-actions').count(),0);
  assert.ok(actions.includes('leaveDecision'));
 });
});

test('My Account requires an explicit overtime compensation choice above work nature',async()=>{
 await withPage('engineer',async({page,actions})=>{
  await page.setViewportSize({width:390,height:844});
  await page.locator('#tabProfile').evaluate(button=>button.click());
  await page.locator('#accountOvertimeDetails summary').click();
  const compensation=page.locator('#otKind'),workKind=page.locator('#otWorkKind');
  assert.equal(await compensation.inputValue(),'');
  assert.equal(await compensation.locator('option').first().textContent(),'اختر نوع التعويض');
  assert.equal(await compensation.getAttribute('required'),'');
  const order=await page.evaluate(()=>{
   const a=document.getElementById('otKind'),b=document.getElementById('otWorkKind');
   return Boolean(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);
  });
  assert.ok(order,'compensation must appear before work nature');
  await page.locator('#otSend').click();
  assert.ok((await page.locator('#otFeedback').innerText()).includes('اختر نوع التعويض'));
  assert.equal(await page.evaluate(()=>document.activeElement.id),'otKind');
  assert.ok(!actions.includes('overtimeRequest'),'no request sent without compensation');
  await compensation.selectOption('SUBSTITUTE');
  assert.equal(await compensation.inputValue(),'SUBSTITUTE');
  assert.equal(await workKind.inputValue(),'');
 });
});
