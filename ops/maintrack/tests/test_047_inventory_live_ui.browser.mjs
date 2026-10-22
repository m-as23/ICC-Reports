// Real inventory DOM/controller with synthetic HTTP responses; no account or live stock.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../../..');
const require=createRequire(path.join(root,'android/maintrack-app/tests-browser/package.json'));
const {chromium}=require('playwright');
const assets=path.join(root,'web/maintrack/public');
for(const role of ['owner','technician'])test('inventory usable search/paging and Owner review guard: '+role,async()=>{
 const index=await fs.readFile(path.join(assets,'index.html'),'utf8');
 const section=index.match(/<section id="inventory"[\s\S]*?<\/section>/)[0];
 const css=await fs.readFile(path.join(assets,'inventory-047.css'),'utf8');
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.setContent('<html dir="rtl"><style>'+css+'</style><body>'+section+'</body></html>');
  await page.evaluate(({role})=>{
   window.S={token:'a'.repeat(64),role};window.requests=[];
   window.fetch=async(url,opts)=>{
    const x=JSON.parse(opts.body);window.requests.push(x);
    if(opts.headers.Authorization!=='Bearer '+'a'.repeat(64))throw Error('NO_BEARER');
    let data;
    if(x.action==='inventoryVersion')data={versionId:'1',filename:'stock.xlsx'};
    else if(x.action==='inventorySearchPage')data={versionId:'1',offset:x.offset,totalMatches:25,nextOffset:x.offset===0?13:null,items:Array.from({length:x.offset===0?13:12},(_,j)=>{const n=x.offset+j;return {code:'A'+(n+1),quantity:n===24?null:n===0?'0':'7',description:n===0?'<img src=x onerror=alert(1)> Parker inverter 65A':'Parker inverter 90L',location:n%2?'R2':'R1',extra:{drawer:'D1',newCard:'C1'}};})};
    else if(x.action==='inventoryDraft')data={draftId:'2'};
    else if(x.action==='inventoryDiff')data={draftId:'2',baseVersionId:'1',currentVersionId:'1',reviewReceipt:'b'.repeat(64),isStale:false,detailsTotal:1,total:1,offset:0,limit:500,nextOffset:null,hasMore:false,truncated:false,counts:{CHANGED:1},requiresExplicitReview:false,details:[{code:'A1',type:'CHANGED',before:{description:'Parker',quantity:7},after:{description:'Parker',quantity:9}}]};
    else if(x.action==='inventoryPublish')data={versionId:'2'};
    else throw Error('UNEXPECTED_ACTION');
    return {ok:true,json:async()=>({ok:true,data})};
   };
  },{role});
  await page.addScriptTag({path:path.join(assets,'inventory-047.js')});
  await page.evaluate(()=>document.getElementById('inventory').style.display='block');
  await page.waitForFunction(()=>document.getElementById('inv47Version').textContent.includes('stock.xlsx'));
  await page.locator('#inv47Query').fill('Parker');await page.locator('#inv47Find').click();
  await page.waitForFunction(()=>document.querySelectorAll('#inv47Results .part-card').length===12);
  assert.equal(await page.locator('#inv47Results img').count(),0,'Descriptions render as safe text');
  await page.locator('#inv47More').click();
  await page.waitForFunction(()=>document.getElementById('inv47Results').textContent.includes('90L'));
  assert.equal(await page.locator('#inv47Results .part-card').count(),24);
  await page.locator('#inv47More').click();
  assert.equal(await page.locator('#inv47Results .part-card').count(),25);
  assert.equal(await page.locator('#inv47More').isVisible(),false);
  await page.locator('#inv47Stock').selectOption('unknown');
  assert.equal(await page.locator('#inv47Results .part-card').count(),1);
  assert.match(await page.locator('#inv47Results').textContent(),/A25/);
  await page.locator('#inv47ResetFilters').click();
  const detail=page.getByRole('button',{name:'التفاصيل',exact:true}).first();
  await detail.click();
  await page.locator('#inv47Detail').waitFor({state:'visible'});
  assert.match(await page.locator('#inv47DetailBody').textContent(),/D1/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#inv47Detail').isVisible(),false);
  assert.equal(await detail.evaluate(x=>x===document.activeElement),true);
  const calls=await page.evaluate(()=>requests.filter(x=>x.action==='inventorySearchPage'));
  assert.equal(calls[1].versionId,'1');
  assert.equal(await page.locator('#inv47Owner').isVisible(),role==='owner');
  assert.ok((await page.locator('#inventory').evaluate(x=>x.scrollWidth))<=390,'Inventory overflow');
  if(role==='owner'){
   assert.equal(await page.locator('#inv47Publish').isDisabled(),true);
   await page.locator('#inv47File').setInputFiles({name:'test.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('synthetic-upload-fixture')});
   await page.locator('#inv47Upload').click();
   await page.locator('#inv47Review').waitFor({state:'visible'});
   assert.equal(await page.locator('#inv47Publish').isDisabled(),true);
   await page.locator('#inv47Confirm').check();
   await page.locator('#inv47Publish').click();
   await page.waitForFunction(()=>document.getElementById('inv47State').textContent.includes('تم اعتماد'));
   assert.equal((await page.evaluate(()=>requests.filter(x=>x.action==='inventoryPublish'))).length,1);
  }
  await page.screenshot({path:path.join(root,'audit-output/maintrack-047-mobile/inventory-design-'+role+'.png'),fullPage:true});
  await page.evaluate(()=>{window.S=null;document.getElementById('inventory').style.display='none';});
  await page.waitForFunction(()=>document.getElementById('inv47Results').textContent==='');
 }finally{await browser.close();}
});
