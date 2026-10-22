// MainTrack v0.4.7 — visual navigation / RBAC smoke, completely offline.
// Builds a disposable browser fixture from the ACTUAL canonical menu + CSS.
// No MainTrack app JS, accounts, API, backend secrets or live database.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

const root=path.resolve(import.meta.dirname,'../../..');
const require=createRequire(path.join(root,'android/maintrack-app/tests-browser/package.json'));
const {chromium}=require('playwright');
const publicDir=path.join(root,'web/maintrack/public');
const out=path.join(root,'audit-output/maintrack-047-mobile');
const widths=[360,390,412,600,1280];
const roles={
 owner:['tabDash','tabForm','tabCmms','tabCatalog','tabProfile','tabApprove','tabAdmin','tabInventory'],
 engineer:['tabDash','tabForm','tabProfile','tabInventory'],
 technician:['tabDash','tabForm','tabProfile','tabInventory']
};
test('MT-07: canonical sidebar order, role visibility and phone/desktop navigation',async()=>{
 const [index,canonical,app,styles]=await Promise.all([
  fs.readFile(path.join(publicDir,'index.html'),'utf8'),
  fs.readFile(path.join(publicDir,'v6.js'),'utf8'),
  fs.readFile(path.join(publicDir,'secure-assets/index-inline-1.js'),'utf8'),
  fs.readFile(path.join(publicDir,'v6-core.js'),'utf8')
 ]);
 const order=[...((canonical.match(/const order=\[([^\]]+)\]/)||[])[1]||'').matchAll(/'([^']+)'/g)].map(x=>x[1]);
 assert.deepEqual(order,['tabDash','tabForm','tabCmms','tabCatalog','tabProfile','tabLeave','tabApprove','tabAdmin','tabInventory']);
 assert.match(app,/\$\('tabLeave'\)\.style\.display='none'/);
 for(const name of ['tabAdmin','tabCmms','tabCatalog','tabApprove'])
  assert.ok(app.includes("$('"+name+"').style.display=S&&S.role==='owner'"),'Owner-only role gate missing '+name);
 assert.match(app,/\$\('tabInventory'\)\.style\.display=canReport\(\)\?'block':'none'/);
 assert.match(app,/const canReport = \(\) => S&&\['owner','engineer','technician'\]\.includes\(S.role\)/);
 const iconNames=[...styles.matchAll(/(?:tabDash|tabForm|tabCmms|tabCatalog|tabProfile|tabLeave|tabApprove|tabAdmin|tabInventory):'/g)].length;
 assert.equal(iconNames,9,'All canonical menu icons should still exist');
 const menu=index.match(/<div id="tabs">([\s\S]*?)<\/div>/)?.[1];
 const inventory=index.match(/<section id="inventory"[\s\S]*?<\/section>/)?.[0];
 assert.ok(menu&&inventory,'Canonical menu and inventory must exist');
 const html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<link rel="stylesheet" href="/secure-assets/index-inline-1.css">'+
 '<link rel="stylesheet" href="/v6.css">'+
 '<link rel="stylesheet" href="/inventory-047.css"></head><body class="v6On">'+
 '<header class="app-header"><h1 id="headTitle">رصيد المخزن</h1></header><div id="bar"></div>'+
 '<div id="tabs">'+menu+'</div>'+
 inventory.replace('style="display:none"','style="display:block"')+
 '<section id="dashboard" style="display:none"><h2>لوحة الأداء</h2></section>'+
 '<main id="form" style="display:none"><h2>بلاغ عطل جديد</h2></main>'+
 '<section id="profile" style="display:none"><h2>حسابي</h2></section>'+
 '<section id="approvals" style="display:none"><h2>الاعتمادات</h2></section>'+
 '<section id="admin" style="display:none"><h2>الإدارة</h2></section>'+
 '<section id="cmms" style="display:none"><h2>سجل أوامر الشغل</h2></section>'+
 '<section id="catalog" style="display:none"><h2>إدارة بيانات الصيانة</h2></section></body></html>';
 const files=new Map([['/secure-assets/index-inline-1.css','secure-assets/index-inline-1.css'],
  ['/v6.css','v6.css'],['/v6-core.css','v6-core.css'],
  ['/inventory-047.css','inventory-047.css']]);
 const server=http.createServer(async(req,res)=>{
  const name=new URL(req.url,'http://127.0.0.1').pathname;
  if(name==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return;}
  const file=files.get(name);if(!file){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':'text/css; charset=utf-8','cache-control':'no-store'});
  res.end(await fs.readFile(path.join(publicDir,file)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  await fs.mkdir(out,{recursive:true});
  const origin='http://127.0.0.1:'+server.address().port;
  for(const width of widths){
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width<961,hasTouch:width<961,deviceScaleFactor:1});
   const page=await context.newPage(),outside=[];
   await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==origin){outside.push(route.request().url());return route.abort();}
    return route.continue();
   });
   await page.goto(origin+'/',{waitUntil:'load'});
   await page.evaluate(({order,roles})=>{
    const $=id=>document.getElementById(id),tabs=$('tabs');
    const logo=document.createElement('div');logo.className='v6Logo';
    logo.innerHTML='<strong>MainTrack</strong><small>0.4.7 QA</small>';tabs.prepend(logo);
    const close=document.createElement('button');close.className='v6Close';close.type='button';close.textContent='×';logo.append(close);
    const user=document.createElement('div');user.className='v6User';
    user.innerHTML='<span class="v6UserAvatar">M</span><strong>Owner QA</strong>';tabs.append(user);
    const chunk=document.createDocumentFragment();
    for(const id of order)chunk.append($(id));tabs.insertBefore(chunk,user);
    const shade=document.createElement('div');shade.id='v6Shade';document.body.append(shade);
    const toggle=document.createElement('button');toggle.type='button';toggle.id='v6Toggle';toggle.textContent='☰';toggle.setAttribute('aria-label','فتح القائمة');
    $('bar').prepend(toggle);
    // Canonical CSS hides #bar until the authenticated application calls show().
    // In this credentials-free fixture we explicitly simulate that authenticated visibility.
    $('bar').style.display='flex';tabs.style.display='flex';
    const hide=()=>document.body.classList.remove('v6Drawer');
    toggle.onclick=()=>document.body.classList.toggle('v6Drawer');close.onclick=hide;shade.onclick=hide;
    let currentRole='owner';
    window.switchSyntheticRole=(r)=>{
      currentRole=r;
      for(const id of order)$(id).style.display=roles[r].includes(id)?'flex':'none';
      $('inv47Owner').hidden=r!=='owner';
    };
    window.switchSyntheticRole('owner');
    for(const id of order)$(id).addEventListener('click',()=>{
      if(!roles[currentRole].includes(id))return;
      const panels={tabInventory:'inventory',tabDash:'dashboard',tabForm:'form',tabProfile:'profile',
       tabCmms:'cmms',tabCatalog:'catalog',tabApprove:'approvals',tabAdmin:'admin'};
      if(!panels[id])return;
      for(const name of Object.values(panels))$(name).style.display=name===panels[id]?'block':'none';
      for(const name of order)$(name).classList.toggle('active',name===id);
      hide();
    });
   },{order,roles});
   for(const [role,wanted] of Object.entries(roles)){
    await page.evaluate(r=>window.switchSyntheticRole(r),role);
    if(width<961){await page.locator('#v6Toggle').click();await page.waitForTimeout(260);}
    const state=await page.evaluate(()=>{
      const visible=[...document.querySelectorAll('#tabs button[id^="tab"]')].filter(b=>getComputedStyle(b).display!=='none').map(b=>b.id);
      const nav=document.getElementById('tabs'),n=nav.getBoundingClientRect(),owner=document.getElementById('inv47Owner');
      return {visible,drawer:document.body.classList.contains('v6Drawer'),
       navLeft:n.left,navRight:n.right,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
       ownerHidden:owner.hidden,position:getComputedStyle(nav).position};
    });
    assert.deepEqual(state.visible,wanted,'Menu order/role drift: '+role+' width '+width);
    assert.equal(state.ownerHidden,role!=='owner','Owner menu must never appear for '+role);
    assert.equal(outside.length,0,'Unexpected external request during offline QA');
    assert.ok(state.documentWidth<=width+2,'Horizontal overflow '+JSON.stringify(state));
    if(width<961){
      assert.equal(state.drawer,true,'Drawer did not open at width '+width);
      assert.ok(state.navLeft>=-2 && state.navRight<=width+2,'Drawer outside phone viewport '+JSON.stringify(state));
      assert.equal(state.position,'fixed');
      await page.screenshot({path:path.join(out,'mt-07-'+role+'-'+width+'.png')});
      await page.locator('#tabInventory').click();
      assert.equal(await page.locator('#inventory').isVisible(),true,'Inventory was not navigated to');
      assert.equal(await page.evaluate(()=>document.body.classList.contains('v6Drawer')),false,'Mobile drawer should close after navigating');
    }else{
      assert.equal(state.position,'fixed');
      assert.ok(state.navRight<=width+2,'Desktop sidebar overflow');
      await page.screenshot({path:path.join(out,'mt-07-'+role+'-desktop.png')});
    }
    console.log('PASS MT-07 '+role+' '+width+'px menu '+wanted.length+' entries');
   }
   await context.close();
  }
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
});
