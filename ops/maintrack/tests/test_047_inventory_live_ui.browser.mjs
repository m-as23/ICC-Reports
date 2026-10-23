// The actual supplied page, authenticated host bridge, synthetic API data; no live account or stock.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../../..'),assets=path.join(root,'web/maintrack/public');
const require=createRequire(path.join(root,'android/maintrack-app/tests-browser/package.json'));
const {chromium}=require('playwright');
const stock=Array.from({length:25},(_,i)=>({code:'SE-DRV-M700'+String(i).padStart(3,'0'),description:(i===0?'<img src=x onerror=alert(1)> ':'')+'CONTROL TECHNIQUES DRIVE UNIDRIVE M700 '+(i+1)+' kW '+(i%2?'380':'220')+' V',quantity:i===24?null:i===0?'0':'7',location:i%2?'R2':'R1',extra:{sourceSheet:'parts',drawer:'D1',newCard:'C1'}}));
const referenceItems=stock.map(x=>({c:x.code,d:x.description,q:x.quantity===null?null:Number(x.quantity),l:x.location,n:'C1',o:null,r:'D1',i:'',s:2}));
for(const width of [390,1280])for(const role of ['owner','technician'])test('Approved compact/empty UI and Owner versions: '+role+' '+width,async()=>{
 const index=await fs.readFile(path.join(assets,'index.html'),'utf8');
 const section=index.match(/<section id="inventory"[\s\S]*?<\/section>/)[0];
 const original=await fs.readFile(path.join(root,'ops/maintrack/tests/inventory-reference-original.fixture.html'),'utf8');
 const server=createServer(async(req,res)=>{try{
  const name=new URL(req.url,'http://local').pathname.slice(1);
  let content,type='text/html';
  if(name==='harness.html')content='<!doctype html><html dir="rtl"><head><link rel="stylesheet" href="inventory-047.css"></head><body style="margin:0">'+section+'<script src="inventory-047.js"></script></body></html>';
  else if(name==='original.html')content=original;
  else{if(!/^[a-z0-9.-]+$/i.test(name))throw Error('PATH');content=await fs.readFile(path.join(assets,name));type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html';}
  res.writeHead(200,{'Content-Type':type});res.end(content);
 }catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({role})=>{window.S={token:'a'.repeat(64),role};},{role});
  const requests=[];let activeVersion='1',excluded=false;
  await page.route('https://tdnkeskczcsukcujwinu.supabase.co/**',async route=>{
   const req=route.request();
   if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':base,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, content-type'}});return;}
   const x=req.postDataJSON();requests.push(x);
   assert.equal(req.headers().authorization,'Bearer '+'a'.repeat(64));
   let data;
   if(x.action==='inventorySnapshot')data={versionId:activeVersion,generation:Number(activeVersion),filename:activeVersion==='1'?'approved.xlsx':'approved-v'+activeVersion+'.xlsx',approvedAt:'2026-10-23T07:03:00Z',items:stock};
   else if(x.action==='inventorySearchCapabilities')data={cloud:false};
   else if(x.action==='inventoryVersions'){const versions=[{id:activeVersion,status:'current',filename:'approved.xlsx',itemCount:25,approvedAt:'2026-10-23T07:03:00Z',approvedBy:'Owner'},...['8','7','6'].map(id=>({id,status:'archived',filename:'archive-'+id+'.xlsx',itemCount:25,approvedAt:'2026-10-22T07:03:00Z',approvedBy:'Owner',excludedAt:id==='8'&&excluded?'2026-10-23T07:03:00Z':null}))].filter(v=>v.status==='current'||!v.excludedAt||x.includeExcluded);data={items:versions.slice(x.offset,x.offset+x.limit),hasMore:false,nextOffset:null};}
   else if(x.action==='inventoryActivity')data={items:[{id:'1',event:'PUBLISHED',actorName:'Owner',filename:'approved.xlsx',occurredAt:'2026-10-23T07:03:00Z'}],hasMore:false,nextOffset:null};
   else if(x.action==='inventoryExcludeVersion'){excluded=true;data={updated:true};}
   else if(x.action==='inventoryVersion')data={versionId:activeVersion};
   else if(x.action==='inventoryHistory')data=[{id:'1',filename:'approved.xlsx',itemCount:25,status:'current',approvedAt:'2026-10-23T07:03:00Z'}];
   else if(x.action==='inventoryDraft')data={draftId:'2'};
   else if(x.action==='inventoryDiff')data={draftId:'2',baseVersionId:'1',currentVersionId:'1',filename:'test.xlsx',reviewReceipt:'b'.repeat(64),isStale:false,detailsTotal:101,total:101,offset:x.offset,limit:x.limit,nextOffset:null,hasMore:false,truncated:false,counts:{CHANGED:101},requiresExplicitReview:false,details:Array.from({length:101},(_,i)=>({code:'ITEM'+i,type:'CHANGED',before:{description:'Parker',quantity:7},after:{description:'Parker',quantity:9}}))};
   else if(x.action==='inventoryPublish')data={versionId:'2'};
   else throw Error('UNEXPECTED_ACTION '+x.action);
   await route.fulfill({status:200,headers:{'access-control-allow-origin':base},contentType:'application/json',body:JSON.stringify({ok:true,data})});
  });
  await page.goto(base+'/harness.html');await page.evaluate(()=>document.getElementById('inventory').style.display='block');
  const frame=page.frameLocator('#inv47Frame');
  await frame.locator('#query:enabled').waitFor();
  assert.equal(await frame.locator('#query').inputValue(),'');assert.equal(await frame.locator('#welcome').isVisible(),true);
  assert.match(await frame.locator('.freshness-row').textContent(),/آخر تحديث لرصيد قطع الغيار/);assert.doesNotMatch(await frame.locator('.content').textContent(),/approved.xlsx/);
  const outEmpty=path.join(root,'audit-output/maintrack-047-mobile');await fs.mkdir(outEmpty,{recursive:true});await page.screenshot({path:path.join(outEmpty,'approved-empty-'+role+'-'+width+'.png')});
  await frame.locator('[data-example="ليمت سويتش"]').click();assert.equal(await frame.locator('#query').inputValue(),'ليمت سويتش');await frame.locator('#clearSearch').click();assert.equal(await frame.locator('#welcome').isVisible(),true);
  assert.match(await frame.locator('#inventoryFreshness').textContent(),/٢٠٢٦/);
  await frame.locator('#query').fill('M700');await frame.locator('#searchButton').click();
  await frame.locator('#counter').filter({hasText:'25 صنف'}).waitFor();
  assert.equal(await frame.locator('.part-card').count(),12);
  assert.equal(await frame.locator('#results img').count(),0,'Untrusted Excel description is escaped');
  assert.match(await frame.locator('.item-heading h3').first().textContent(),/Drive \/ Inverter · M700/);
  assert.match(await frame.locator('#facetArea').textContent(),/القدرة/);
  assert.match(await frame.locator('#facetArea').textContent(),/الجهد/);
  // Matching/facets remain equivalent to original; card layout is explicitly redesigned.
  const baseline=await browser.newPage({viewport:{width,height:844}});await baseline.goto(base+'/original.html');
  await baseline.evaluate(items=>{mt6SetData(items);document.getElementById('query').value='M700';search();},referenceItems);
  const live=page.frames().find(x=>x.url().endsWith('/inventory-reference.html'));
  assert.deepEqual(await live.locator('[data-detail]').evaluateAll(rows=>rows.map(x=>x.dataset.detail)),await baseline.locator('[data-detail]').evaluateAll(rows=>rows.map(x=>x.dataset.detail)));
  assert.equal(await live.locator('#facetArea').innerHTML(),await baseline.locator('#facetArea').innerHTML());
  assert.equal(await frame.locator('.item-desc').count(),0,'Full descriptions belong inside details');
  await live.evaluate(()=>document.documentElement.style.scrollBehavior='auto');await baseline.close();
  await frame.locator('#moreBtn').click();await frame.locator('#moreBtn').click();assert.equal(await frame.locator('.part-card').count(),25);
  if(width<790)await frame.locator('#filterOpen').click();
  await frame.locator('[data-facet="availability"][data-value="missing"]').click();assert.equal(await frame.locator('.part-card').count(),1);
  await frame.locator('#resetFilters').click();if(width<790)await frame.locator('#filterClose').click();
  await frame.locator('[data-detail]').first().click();await frame.locator('#detailDrawer.open').waitFor();assert.match(await frame.locator('#detailBody').textContent(),/D1/);
  activeVersion='2';await live.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await live.waitForFunction(()=>currentVersion?.versionId==='2');
  assert.equal(await frame.locator('#detailDrawer').evaluate(x=>x.classList.contains('open')),false,'New snapshot closes old item details');assert.equal(await frame.locator('#ownerImportOpen').isVisible(),role==='owner');
  if(role==='owner'){
   await frame.locator('#ownerImportOpen').click();await frame.locator('#importHistory .version-card').first().waitFor();
   assert.equal(await frame.locator('#importHistory .version-card').count(),3);assert.match(await frame.locator('#storageStatus').textContent(),/البحث السحابي غير مفعّل/);assert.equal(await frame.locator('#importHistory .current [data-version-action]').count(),0);
   await frame.locator('#activityOpen').click();await frame.locator('#activityRows').filter({hasText:'اعتماد نسخة المخزن'}).waitFor();
   page.once('dialog',d=>d.accept());await frame.locator('#importHistory [data-version-action=exclude]').first().click();await page.waitForFunction(()=>true);await frame.locator('#importHistory').filter({hasNotText:'archive-8.xlsx'}).waitFor();assert.equal(requests.filter(x=>x.action==='inventoryExcludeVersion').length,1);
   await frame.locator('#archiveOpen').click();await frame.locator('#archiveRows .version-card').first().waitFor();
   assert.equal(await frame.locator('#approveImport').isDisabled(),true);
   await frame.locator('#inventoryFile').setInputFiles({name:'test.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('synthetic-upload-fixture')});
   await frame.locator('#importPreview').waitFor({state:'visible'});assert.equal(await frame.locator('#diffBody tr').count(),50);assert.match(await frame.locator('#importMetrics').textContent(),/داخل الملف101/);
   await frame.locator('#diffNext').click();await frame.locator('#diffNext').click();assert.equal(await frame.locator('#diffBody tr').count(),1);assert.match(await frame.locator('#diffBody').textContent(),/ITEM100/);
   await frame.locator('#reviewConfirm').check();page.once('dialog',d=>d.accept());await frame.locator('#approveImport').click();
   await frame.locator('#importProgress').filter({hasText:'تم اعتماد النسخة الجديدة'}).waitFor();assert.equal(requests.filter(x=>x.action==='inventoryPublish').length,1);
   await frame.locator('#ownerImportDone').click();
  }
  assert.equal(await live.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'No horizontal overflow');
  const out=path.join(root,'audit-output/maintrack-047-mobile');await fs.mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,'reference-'+role+'-'+width+'.png'),fullPage:true});
  await page.evaluate(()=>{window.S=null;document.getElementById('inventory').style.display='none';});
  await page.waitForFunction(()=>!document.getElementById('inv47Frame').getAttribute('src'));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('Hybrid search retains literal matches, appends labelled meaning matches across families, and clears stale responses',async()=>{
 const rows=[{code:'SENSOR-1',description:'MOUNTING BRACKET',quantity:1},{code:'TEMP-K',description:'THERMOCOUPLE TYPE K',quantity:2},{code:'RTD-1',description:'PT100',quantity:3},{code:'LIMIT-1',description:'MECHANICAL LIMIT SWITCH',quantity:4}];
 const index=await fs.readFile(path.join(assets,'index.html'),'utf8');const section=index.match(/<section id="inventory"[\s\S]*?<\/section>/)[0];
 const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://local').pathname.slice(1);if(name==='harness.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html dir="rtl"><body>'+section+'<script src="inventory-047.js"></script></body></html>');return;}if(!/^[a-z0-9.-]+$/i.test(name))throw Error('PATH');res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(assets,name)));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.S={token:'a'.repeat(64),role:'technician'});
  let held,resolveHeld,requests=0;
  await page.route('https://tdnkeskczcsukcujwinu.supabase.co/**',async route=>{
   if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':base,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, content-type'}});return;}
   const x=route.request().postDataJSON();let data;
   if(x.action==='inventorySnapshot')data={versionId:'1',generation:1,approvedAt:'2026-10-23T07:03:00Z',items:rows};
   else if(x.action==='inventorySearchCapabilities')data={cloud:true,semantic:true};
   else if(x.action==='inventoryVersion')data={versionId:'1'};
   else if(x.action==='inventorySearchAssist'){
    requests++;if(x.query==='انتظار'){resolveHeld?.();await new Promise(r=>held=r);}
    data={mode:'semantic',versionId:'1',codes:x.query.includes('مشوار')?['LIMIT-1']:['TEMP-K','RTD-1']};
   }else throw Error('UNEXPECTED_ACTION '+x.action);
   await route.fulfill({status:200,headers:{'access-control-allow-origin':base},contentType:'application/json',body:JSON.stringify({ok:true,data})});
  });
  await page.goto(base+'/harness.html');await page.evaluate(()=>document.getElementById('inventory').style.display='block');const frame=page.frameLocator('#inv47Frame');await frame.locator('#query:enabled').waitFor();
  await frame.locator('#query').fill('SENSOR-1');await frame.locator('#searchButton').click();await frame.locator('.part-card').first().waitFor();assert.equal(await frame.locator('.part-card .item-id').first().textContent(),'SENSOR-1');
  await frame.locator('#query').fill('حساس حرارة');await frame.locator('#searchButton').click();await frame.locator('.mt6-assisted').first().waitFor();assert.equal(await frame.locator('.mt6-assisted').count(),2);assert.match(await frame.locator('#results').textContent(),/PT100/);
  await frame.locator('#query').fill('THERMOCOUPLE');await frame.locator('#searchButton').click();await frame.locator('#mt6Explain').filter({hasText:'التطابقات أولًا'}).waitFor();assert.equal(await frame.locator('.item-id').first().textContent(),'TEMP-K');assert.equal(await frame.locator('.part-card').first().locator('.mt6-assisted').count(),0);assert.equal(await frame.locator('.part-card').nth(1).locator('.mt6-assisted').textContent(),'مرتبط بالمعنى');
  await frame.locator('#query').fill('مفتاح نهاية مشوار');await frame.locator('#searchButton').click();await frame.locator('.item-id').filter({hasText:'LIMIT-1'}).waitFor();
  const requested=new Promise(r=>resolveHeld=r);await frame.locator('#query').fill('انتظار');await frame.locator('#searchButton').click();await requested;await frame.locator('#clearSearch').click();held();await frame.locator('#welcome').waitFor({state:'visible'});assert.equal(await frame.locator('#resultSection').isVisible(),false);assert.ok(requests>=4);assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
