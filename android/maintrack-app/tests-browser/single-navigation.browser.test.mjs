// Stage23 device UX acceptance. Uses the real checked-in MainTrack UI.
// Every external network request is blocked or fulfilled locally; no real users,
// credentials, Supabase writes, mail or OTA host calls are made.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'../../../web/maintrack/public');
const qa=path.resolve(import.meta.dirname,'../qa-results/stage23-ux');
let server,browser,origin;
const fake=role=>({token:'a'.repeat(64),code:'UX-'+role.toUpperCase(),name:'Synthetic '+role,role});
const profile=role=>({code:fake(role).code,name:fake(role).name,role,department:'Maintenance',jobTitle:'Maintenance',leaveBalance:12});
const reply=(action,role)=>{
 const p=profile(role),s=fake(role);
 switch(action){
  case 'login': return s;
  case 'session': return {ok:true,role,name:s.name};
  case 'init': return {id:'WO-UX',role,sections:['Electrical'],machines:[['Electrical','QA Motor']],parts:[['Electrical','QA PLC']],status:['Open','Closed'],cats:['Electrical','Mechanical']};
  case 'nextId': return {id:'WO-UX'};
  case 'dashboard': return {metrics:{},recent:[],topMachines:[],sectionHours:[]};
  case 'notifications': return {items:[],storedItems:[],pendingItems:[],pendingCount:0};
  case 'profile': return {profile:p};
  case 'accountSummary':return {profile:p,annualAvailableDays:12,annualTotalDays:20,annualUsedDays:8,substituteAvailableDays:0,substituteEarnedDays:0,substituteUsedDays:0,financialApprovedDays:0};
  case 'leaveMine':return {profile:p,items:[]};
  case 'overtimeMine':return {items:[]};
  case 'overtimeInbox':case 'leaveInbox':return {items:[],pendingCount:0};
  case 'overtimeSummary':return {approvedHours:0,financialHours:0,substituteHours:0,distinctDays:0,pendingCount:0,approvedCount:0,employees:[]};
  case 'adminCatalog':return {items:[]};
  case 'adminUsers':return {users:[]};
  case 'cmms':return {items:[],total:0};
  default:return {ok:true,items:[],users:[]};
 }
};
before(async()=>{
 await fs.mkdir(qa,{recursive:true});
 server=http.createServer(async(req,res)=>{
  try{
   const reqPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   const pathname=path.resolve(root,'.'+(reqPath.endsWith('/')?reqPath+'index.html':reqPath));
   if(!pathname.startsWith(root+path.sep))throw Error('outside static root');
   const data=await fs.readFile(pathname);
   const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
   res.writeHead(200,{'Content-Type':types[path.extname(pathname)]||'application/octet-stream','Cache-Control':'no-store'});
   res.end(data);
  }catch{res.writeHead(404);res.end('not found');}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});

async function scenario(role,width,fn){
 const ctx=await browser.newContext({viewport:{width,height:854},deviceScaleFactor:1,serviceWorkers:'block',hasTouch:width<=760});
 const page=await ctx.newPage();
 const errors=[],actions=[],blocked=[];
 page.on('pageerror',e=>errors.push(e.message));
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===origin)return route.continue();
  if(url.hostname==='tdnkeskczcsukcujwinu.supabase.co'&&url.pathname.endsWith('/api')){
   const action=req.method()==='POST'?(req.postDataJSON()?.action||''):'';
   actions.push(action);
   const disallow=['submit','leaveRequest','leaveDecision','overtimeRequest','overtimeDecision','cmmsWrite','cmmsDelete','adminCreateEmployee','adminSaveUser'];
   assert.ok(!disallow.includes(action),'UX smoke must not perform business writes: '+action);
   return route.fulfill({status:200,contentType:'application/json',
    headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,x-request-id','Access-Control-Allow-Methods':'OPTIONS,GET,POST'},
    body:JSON.stringify(reply(action,role))});
  }
  blocked.push(url.origin);
  return route.abort('blockedbyclient');
 });
 try{
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#lcode').fill(fake(role).code);
  await page.locator('#lpw').fill('LOCAL_ONLY_SYNTHETIC_PASSWORD');
  await page.locator('#lgo').click();
  await page.waitForFunction(()=>document.body.classList.contains('v6On')&&!!document.querySelector('#v6Toggle'),null,{timeout:15000});
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#v6Dock').count(),0,'No duplicate/unlabelled bottom navigation');
  assert.equal(await page.getByRole('button',{name:'فتح القائمة الرئيسية'}).count(),width<=960?1:0,'Clear labelled mobile menu button');
  await fn({page,actions,errors,blocked});
  assert.deepEqual(errors,[],'No uncaught JavaScript errors');
 }finally{await ctx.close();}
}
for(const role of ['owner','engineer','technician']){
 test('mobile 382px: '+role+' single drawer, roles, report draft and back navigation',async()=>{
  await scenario(role,382,async({page,actions})=>{
   const menu=page.getByRole('button',{name:'فتح القائمة الرئيسية'});
   await menu.click();
   assert.equal(await page.locator('body.v6Drawer').count(),1);
   assert.equal(await page.getByRole('navigation',{name:'القائمة الرئيسية'}).count(),1);
   const visibleMenus=await page.locator('#tabs button[id^=tab]:visible').allTextContents();
   assert.ok(visibleMenus.some(x=>x.includes('بلاغ جديد')));
   if(role==='owner')assert.ok(visibleMenus.some(x=>x.includes('سجل أوامر الشغل')));
   else assert.equal(visibleMenus.some(x=>x.includes('سجل أوامر الشغل')),false,'No Owner-only CMMS on employee menu');
   await page.locator('#tabForm').click();
   assert.equal(await page.evaluate(()=>window.__maintrackActiveView),'form');
   assert.equal(await page.locator('body.v6Drawer').count(),0,'Drawer must close after navigation');
   await page.locator('#desc').fill('DEMO UNSENT ELECTRICAL FAULT -- no database write');
   await page.locator('#v6Toggle').click();
   await page.locator('#tabDash').click();
   assert.equal(await page.evaluate(()=>window.__maintrackActiveView),'dashboard');
   await page.locator('#v6Toggle').click();
   await page.locator('#tabForm').click();
   assert.equal(await page.locator('#desc').inputValue(),'DEMO UNSENT ELECTRICAL FAULT -- no database write','Unsubmitted report draft must not disappear when switching pages');
   const visibleView=await page.locator('body').evaluate(el=>el.scrollWidth);
   assert.ok(visibleView<=382+4,'No horizontal clipping due to navigation');
   assert.ok(actions.includes('login'),'Expected synthetic login');
   await page.screenshot({path:path.join(qa,role+'-single-menu.png'),timeout:13000});
  });
 });
}
test('320px smallest supported: menu remains accessible and bottom dock is absent',async()=>{
 await scenario('technician',320,async({page})=>{
  const menu=page.getByRole('button',{name:'فتح القائمة الرئيسية'});
  assert.ok((await menu.boundingBox()).width>=80,'Menu touch target is too narrow');
  await menu.click();
  assert.equal(await page.locator('#tabs button#tabAdmin:visible').count(),0);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('body.v6Drawer').count(),0);
 });
});
test('desktop 1280px: owner keeps visible sidebar, no mobile dock',async()=>{
 await scenario('owner',1280,async({page})=>{
  assert.equal(await page.locator('#v6Dock').count(),0);
  assert.equal(await page.locator('#tabDash:visible').count(),1);
  assert.equal(await page.locator('#tabApprove:visible').count(),1);
  await page.locator('#tabDash').click();
  assert.equal(await page.evaluate(()=>window.__maintrackActiveView),'dashboard');
 });
});
