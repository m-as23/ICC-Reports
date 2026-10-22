// MainTrack v0.4.7 — isolated mobile form visual layout QA.
// Only serves extracted static form HTML and reviewed CSS via loopback.
// No user account, application JavaScript, Supabase requests, release artifact or email.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

const root=path.resolve(import.meta.dirname,'../../..');
const require=createRequire(path.join(root,'android/maintrack-app/tests-browser/package.json'));
const {chromium}=require('playwright');
const web=path.join(root,'web/maintrack/public');
const out=path.join(root,'audit-output/maintrack-047-mobile');
const widths=[360,390,412,600];

test('MT-02: fault classification stays clear of fixed Save button on mobile',async()=>{
 const canonical=await fs.readFile(path.join(web,'index.html'),'utf8');
 const form=canonical.match(/<main id="form"[\s\S]*?<\/main>/)?.[0];
 const send=canonical.match(/<button id="send"[\s\S]*?<\/button>/)?.[0];
 assert.ok(form&&send,'Canonical main form and Save button must exist');
 assert.match(form,/id="cat"/);
 const fixture='<!doctype html><html lang="ar" dir="rtl"><head>'+
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<link rel="stylesheet" href="/secure-assets/index-inline-1.css">'+
  '<link rel="stylesheet" href="/v6.css"></head><body>'+
  form.replace('style="display:none"','style="display:block"')+
  send.replace('style="display:none"','style="display:block"')+
  '</body></html>';
 const files=new Map([
  ['/secure-assets/index-inline-1.css','secure-assets/index-inline-1.css'],
  ['/v6.css','v6.css'],
  ['/v6-core.css','v6-core.css']
 ]);
 let requests=0;
 const server=http.createServer(async(req,res)=>{
  requests++;
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(pathname==='/'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.end(fixture);return;
  }
  const rel=files.get(pathname);
  if(!rel){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/css; charset=utf-8','Cache-Control':'no-store'});
  res.end(await fs.readFile(path.join(web,rel)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  await fs.mkdir(out,{recursive:true});
  for(const width of widths){
   const context=await browser.newContext({viewport:{width,height:780},deviceScaleFactor:1,isMobile:true,hasTouch:true});
   const page=await context.newPage();
   const extraneous=[];
   await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==origin){
     extraneous.push(route.request().url());return route.abort();
    }
    return route.continue();
   });
   await page.goto(origin+'/',{waitUntil:'load'});
   await page.locator('#cat').evaluate(select=>{
    select.append(new Option('كهربائي','electrical'));
    select.value='electrical';
   });
   await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
   await page.waitForTimeout(80); // settle last scroll without network or app code
   const boxes=await page.evaluate(()=>{
    const select=document.querySelector('#cat');
    const button=document.querySelector('#send');
    const form=document.querySelector('main#form');
    const cat=select.getBoundingClientRect(),save=button.getBoundingClientRect();
    return {
     categoryBottom:cat.bottom,categoryTop:cat.top,saveTop:save.top,
     categoryVisible:cat.top>=0&&cat.bottom<=window.innerHeight,
     saveVisible:save.top>=0&&save.bottom<=window.innerHeight,
     paddingBottom:parseFloat(getComputedStyle(form).paddingBottom),
     scrollY:window.scrollY,documentHeight:document.documentElement.scrollHeight
    };
   });
   await page.screenshot({path:path.join(out,'mt-02-'+width+'.png')});
   assert.equal(extraneous.length,0,'Static fixture must never access external services');
   assert.ok(boxes.paddingBottom>=120,'Mobile form clearance CSS not loaded for '+width);
   assert.ok(boxes.categoryVisible,'Category is not visible on mobile '+width+': '+JSON.stringify(boxes));
   assert.ok(boxes.saveVisible,'Save button is not visible on mobile '+width+': '+JSON.stringify(boxes));
   assert.ok(boxes.saveTop-boxes.categoryBottom>=16,
    'Fixed Save button overlaps category on '+width+': '+JSON.stringify(boxes));
   assert.ok(boxes.scrollY>0,'Expected scrollable mobile form on '+width);
   console.log('PASS MT-02 viewport '+width+' gap '+Math.floor(boxes.saveTop-boxes.categoryBottom)+' px');
   await context.close();
  }
  assert.ok(requests>=widths.length,'Static fixture must have loaded');
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
});
