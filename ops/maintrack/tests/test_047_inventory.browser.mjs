// MT-01 spare-parts preview screenshot/layout proof: isolated HTML, NO inventory API, DB, or account.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../../..');
const require=createRequire(path.join(root,'android/maintrack-app/tests-browser/package.json'));
const {chromium}=require('playwright');
const assets=path.join(root,'web/maintrack/public');
test('MT-01: inventory menu last and preview renders without unapproved stock or backend',async()=>{
 const index=await fs.readFile(path.join(assets,'index.html'),'utf8');
 const inventory=index.match(/<section id="inventory"[\s\S]*?<\/section>/)?.[0];
 const menu=index.match(/<div id="tabs">([\s\S]*?)<\/div>/)?.[1];
 assert.ok(inventory&&menu,'Inventory preview and side menu must both exist');
 const css=await fs.readFile(path.join(assets,'inventory-047.css'),'utf8');
 const baseline=await fs.readFile(path.join(assets,'secure-assets/index-inline-1.css'),'utf8');
 const html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<style>'+baseline+'\n'+css+'</style></head><body>'+
 '<div id="tabs">'+menu+'</div>'+inventory.replace('style="display:none"','style="display:block"')+'</body></html>';
 const out=path.join(root,'audit-output/maintrack-047-mobile');
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [360,390,412,600]){
   const ctx=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,isMobile:true});
   const page=await ctx.newPage();
   const external=[];
   await page.route('**/*',route=>{external.push(route.request().url());return route.abort();});
   await page.setContent(html,{waitUntil:'load'});
   await page.locator('#inventory').waitFor({state:'visible'});
   const state=await page.evaluate(()=>{
    const ids=[...document.querySelectorAll('#tabs button')].map(x=>x.id);
    const p=document.querySelector('#inventory');
    const r=p.getBoundingClientRect();
    return {
     ids,
     title:p.querySelector('h2')?.textContent,
     searchDisabled:document.querySelector('#inv47Query')?.disabled,
     actionDisabled:document.querySelector('#inv47Find')?.disabled,
     ownerActions:[...document.querySelectorAll('#inv47Owner button')].every(x=>x.disabled),
     inventoryVisible:r.width>0&&r.height>0,
     viewport:window.innerWidth,
     scrollWidth:document.documentElement.scrollWidth
    };
   });
   assert.equal(external.length,0,'Preview must not call any services');
   assert.equal(state.ids.at(-1),'tabInventory');
   assert.equal(state.title,'رصيد المخزن');
   assert.equal(state.searchDisabled,false);
   assert.equal(state.actionDisabled,false);
   assert.equal(await page.locator('#inv47Publish').isDisabled(),true);
   assert.equal(state.inventoryVisible,true);
   assert.ok(state.scrollWidth<=width+2,'Horizontal overflow: '+width+' '+JSON.stringify(state));
   await page.screenshot({path:path.join(out,'mt-01-inventory-'+width+'.png'),fullPage:true});
   console.log('PASS MT-01 isolated inventory preview '+width+'px; no API, no stock');
   await ctx.close();
  }
 }finally{await browser.close();}
});
