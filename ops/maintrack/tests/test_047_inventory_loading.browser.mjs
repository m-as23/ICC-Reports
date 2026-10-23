// Local Chromium only. All external origins are denied before opening the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../../..'),assets=path.join(root,'web/maintrack/public');
const require=createRequire(path.join(root,'android/maintrack-app/tests-browser/package.json'));
const {chromium}=require('playwright');
const browserPath=process.env.MT047_CHROME;
const stock=Array.from({length:3920},(_,i)=>({code:'SE-CON-LAB'+String(i).padStart(5,'0'),description:(i%2?'CONTACTOR 165 A 380 V ':'CONTACTOR 65 A 220 V ')+i,quantity:i,location:'LOCAL',extra:{sourceSheet:'parts'}}));


async function harness({candidate=true,role='owner',delay=0,fail=false,cpu=1}={}){
 const host=`window.lab={account:1,role:${JSON.stringify(role)},version:'1',delay:${delay},fail:${fail},calls:0};const stock=${JSON.stringify(stock)};
window.MainTrackInventoryHost={contextKey:()=>lab.account,role:()=>lab.role,capabilities:async()=>({cloud:false}),snapshot:async()=>{lab.calls++;const d=lab.delay,f=lab.fail,versionId=lab.version;await new Promise(r=>setTimeout(r,d));if(f)throw Error('LOCAL_SNAPSHOT_FAILURE');return {versionId,approvedAt:'2026-10-23T12:00:00Z',items:stock};},version:async()=>({versionId:lab.version}),versions:async()=>({items:['1','2','3'].map((id,i)=>({id,status:i?'archived':'current',itemCount:3920,filename:'local.xlsx',approvedAt:'2026-10-23T12:00:00Z',approvedBy:'Local test'})),hasMore:false}),activity:async()=>({items:[],hasMore:false})};`;
 const metrics=`window.labMetrics={gaps:[],longTasks:[],started:performance.now()};let last=performance.now();setInterval(()=>{const n=performance.now();labMetrics.gaps.push(n-last);last=n;},10);new PerformanceObserver(list=>labMetrics.longTasks.push(...list.getEntries().map(x=>x.duration))).observe({entryTypes:['longtask']});`;
 const server=createServer(async(req,res)=>{try{
  const name=new URL(req.url,'http://localhost').pathname.slice(1);let data,type='text/javascript';
  if(name==='harness.html'){data='<html><body><button id="otherPage" onclick="this.textContent=\'navigation works\'">Other page</button><script src="host.js"></script><iframe id="inv47Frame" style="width:100%;height:800px" src="inventory-reference.html"></iframe></body></html>';type='text/html';}
  else if(name==='host.js')data=host;
  else if(name==='metrics.js')data=metrics;
  else{if(!/^[a-z0-9.-]+$/i.test(name))throw Error('PATH');data=await fs.readFile(path.join(assets,name));type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html';if(name==='inventory-reference.html')data=data.toString().replace('<script src="inventory-reference.js">','<script src="metrics.js"></script><script src="inventory-reference.js">');}
  res.writeHead(200,{'Content-Type':type});res.end(data);
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 let browser;const external=[],errors=[];
 try{
  browser=await chromium.launch({...(browserPath?{executablePath:browserPath}:{}),headless:true,args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  if(cpu!==1){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});}
  await page.goto(origin+'/harness.html');const frame=page.frameLocator('#inv47Frame');
  const live=()=>page.frames().find(f=>f.url().endsWith('/inventory-reference.html'));
  return {page,frame,live,errors,external,async close(){await browser.close();await new Promise(r=>server.close(r));}};
 }catch(e){if(browser)await browser.close();await new Promise(r=>server.close(r));throw e;}
}

test('candidate displays loading state while local snapshot is pending, then exact code remains searchable',async()=>{
 const h=await harness({delay:400});try{
  await h.frame.locator('#inventoryMeta').filter({hasText:'جارٍ تحميل رصيد قطع الغيار'}).waitFor();
  await h.page.locator('#otherPage').click();assert.equal(await h.page.locator('#otherPage').textContent(),'navigation works');
  await h.frame.locator('#query:enabled').waitFor();assert.equal(await h.live().evaluate(()=>INDEX.length),3920);
  await h.frame.locator('#query').fill(stock[0].code);await h.frame.locator('#searchButton').click();
  assert.equal(await h.live().evaluate(()=>state.filtered[0]?.c),stock[0].code);
  assert.deepEqual(h.errors,[]);assert.deepEqual(h.external,[]);
 }finally{await h.close();}
});

test('overlapping loads commit only the newest version in the actual page',async()=>{
 const h=await harness();try{
  await h.frame.locator('#query:enabled').waitFor();
  await h.page.evaluate(()=>{lab.delay=150;lab.version='2';});
  await h.live().evaluate(()=>{loadInventory();});
  await h.page.evaluate(()=>{lab.delay=0;lab.version='3';});
  await h.live().evaluate(()=>{loadInventory();});
  await h.live().waitForFunction(()=>currentVersion?.versionId==='3');
  await new Promise(r=>setTimeout(r,250));
  assert.equal(await h.live().evaluate(()=>currentVersion?.versionId),'3');
  assert.deepEqual(h.errors,[]);assert.deepEqual(h.external,[]);
 }finally{await h.close();}
});

test('account change during preparation leaves no committed stock, then a fresh technician frame has no Owner controls',async()=>{
 const h=await harness({cpu:4});try{
  await h.frame.locator('#inventoryMeta').filter({hasText:'جارٍ تجهيز البحث'}).waitFor();
  await h.page.evaluate(()=>{lab.account++;lab.role='technician';});
  await new Promise(r=>setTimeout(r,100));
  assert.equal(await h.live().evaluate(()=>currentVersion),null);
  assert.equal(await h.live().evaluate(()=>INDEX.length),0);
  await h.page.evaluate(()=>{document.getElementById('inv47Frame').src='inventory-reference.html?new-account';});
  const fresh=()=>h.page.frames().find(f=>f.url().includes('new-account'));
  await h.page.waitForFunction(()=>document.getElementById('inv47Frame').contentWindow.location.search==='?new-account');
  await fresh().waitForFunction(()=>typeof currentVersion!=='undefined'&&currentVersion?.versionId==='1'&&INDEX.length===3920);
  await h.frame.locator('#query:enabled').waitFor();
  assert.equal(await h.frame.locator('#ownerImportOpen').isVisible(),false);
  assert.equal(await fresh().evaluate(()=>INDEX.length),3920);
  assert.deepEqual(h.errors,[]);assert.deepEqual(h.external,[]);
 }finally{await h.close();}
});

test('snapshot error offers retry and owner retains the last-three-versions view after recovery',async()=>{
 const h=await harness({fail:true});try{
  await h.frame.locator('#retryInventory').waitFor();
  assert.equal(await h.live().evaluate(()=>INDEX.length),0);
  await h.page.evaluate(()=>{lab.fail=false;});await h.frame.locator('#retryInventory').click();
  await h.frame.locator('#query:enabled').waitFor();
  await h.frame.locator('#ownerImportOpen').click();
  assert.equal(await h.frame.locator('#importHistory .version-card').count(),3);
  assert.equal(await h.frame.locator('#approveImport').isDisabled(),true);
  assert.deepEqual(h.errors,[]);assert.deepEqual(h.external,[]);
 }finally{await h.close();}
});

test('unit boundaries and empty results survive preparation through the full page',async()=>{
 const h=await harness();try{
  await h.frame.locator('#query:enabled').waitFor();
  await h.frame.locator('#query').fill('65 أمبير');await h.frame.locator('#searchButton').click();
  const codes=await h.live().evaluate(()=>state.filtered.map(x=>x.c));
  assert.equal(codes.length,1960);assert.ok(codes.every(c=>Number(c.slice(-5))%2===0));
  await h.frame.locator('#query').fill('NO-SUCH-INVENTORY-ITEM');await h.frame.locator('#searchButton').click();
  assert.equal(await h.live().evaluate(()=>state.filtered.length),0);
  assert.deepEqual(h.errors,[]);assert.deepEqual(h.external,[]);
 }finally{await h.close();}
});

test('a real worker is terminated on cancellation rather than left consuming CPU',{timeout:15000},async()=>{
 const h=await harness();try{
  await h.frame.locator('#query:enabled').waitFor();
  const created=h.page.waitForEvent('worker');
  await h.live().evaluate(()=>{
   window.workerCancel=new AbortController();window.workerOutcome=null;
   MainTrackInventoryPreparation.prepareInWorker(currentVersion.items,{signal:workerCancel.signal}).then(()=>workerOutcome='unexpected commit',e=>workerOutcome=e.name);
  });
  const worker=await created;const closed=new Promise(resolve=>worker.once('close',resolve));
  await h.live().evaluate(()=>workerCancel.abort());await closed;
  assert.equal(await h.live().evaluate(()=>workerOutcome),'AbortError');
  assert.deepEqual(h.errors,[]);assert.deepEqual(h.external,[]);
 }finally{await h.close();}
});

test('approval changed during worker preparation is rejected until a fresh snapshot is loaded',async()=>{
 const h=await harness();try{
  await h.frame.locator('#inventoryMeta').filter({hasText:'جارٍ تجهيز البحث'}).waitFor();
  await h.page.evaluate(()=>{lab.version='2';});
  await h.frame.locator('#retryInventory').waitFor();assert.equal(await h.live().evaluate(()=>currentVersion),null);
  await h.frame.locator('#retryInventory').click();await h.frame.locator('#query:enabled').waitFor();
  assert.equal(await h.live().evaluate(()=>currentVersion?.versionId),'2');
  assert.deepEqual(h.errors,[]);assert.deepEqual(h.external,[]);
 }finally{await h.close();}
});

test('worker execution error leaves no partial index and retry rebuilds the complete inventory',async()=>{
 const h=await harness({delay:300});try{
  await h.page.route('**/inventory-reference-worker.js',route=>route.fulfill({contentType:'text/javascript',body:'throw Error("LOCAL_WORKER_FAILURE");'}));
  await h.frame.locator('#retryInventory').waitFor();assert.equal(await h.live().evaluate(()=>INDEX.length),0);
  await h.page.unroute('**/inventory-reference-worker.js');await h.frame.locator('#retryInventory').click();
  await h.frame.locator('#query:enabled').waitFor();assert.equal(await h.live().evaluate(()=>INDEX.length),3920);
  assert.deepEqual(h.errors,[]);assert.deepEqual(h.external,[]);
 }finally{await h.close();}
});


test('restoring a preserved page after cancellation resumes interrupted loading',async()=>{
 const h=await harness({delay:300});try{
  await h.frame.locator('#inventoryMeta').filter({hasText:'جارٍ تحميل رصيد قطع الغيار'}).waitFor();
  await h.live().evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  await new Promise(r=>setTimeout(r,1600));
  assert.equal(await h.live().evaluate(()=>INDEX.length),3920);assert.equal(await h.frame.locator('#query').isEnabled(),true);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
