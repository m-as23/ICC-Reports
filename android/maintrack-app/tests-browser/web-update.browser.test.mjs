import {before, after, test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';

// Real generated Web Pilot assets from the immediately preceding CI packaging step.
// This server is loopback-only; external backend traffic is blocked by browser routes.
const root = path.resolve(import.meta.dirname,'../web-pilot/.vercel/output/static');
let server, browser, origin, release;
let metadataReads = 0;
before(async () => {
  release = JSON.parse(await fs.readFile(path.join(root,'maintrack-release.json'),'utf8'));
  assert.match(release.commit,/^[a-f0-9]{40}$/);
  server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      const name=decodeURIComponent(url.pathname);
      if (name==='/maintrack-release.json') metadataReads++;
      const relative=name==='/'? '/maintrack-release.json' : (name.endsWith('/') ? name+'index.html' : name);
      const file=path.resolve(root,'.'+relative);
      if (!file.startsWith(root+path.sep)) throw Error('PATH_OUTSIDE_WEB_ROOT');
      const buffer=await fs.readFile(file);
      const types={'.json':'application/json','.html':'text/html','.css':'text/css','.js':'application/javascript','.webmanifest':'application/manifest+json','.png':'image/png'};
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(buffer);
    } catch {res.writeHead(404);res.end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'chromium',headless:true});
});
after(async()=>{
  await browser?.close();
  if (server) await new Promise(resolve=>server.close(resolve));
});
async function pageContext() {
  const context=await browser.newContext({serviceWorkers:'block'});
  // Never let the browser reach a real employee backend, fonts or update server.
  await context.route('**/*',async route=>{
    if(new URL(route.request().url()).origin===origin) return route.continue();
    return route.abort('blockedbyclient');
  });
  const page=await context.newPage();
  const jsErrors=[];
  page.on('pageerror',e=>jsErrors.push(e.message));
  return {context,page,jsErrors};
}
async function awaitMetadata(beforeCount) {
  const end=Date.now()+8000;
  while(metadataReads<=beforeCount && Date.now()<end) await new Promise(r=>setTimeout(r,35));
  assert.ok(metadataReads>beforeCount,'Web discovery did not fetch metadata on opening the page');
}
test('current signed-in-or-out Web Pilot keeps update button hidden and discovery bounded',async()=>{
  const {context,page,jsErrors}=await pageContext();
  try {
    const old=metadataReads;
    const result=await page.goto(origin+release.path,{waitUntil:'domcontentloaded'});
    assert.equal(result.status(),200);
    await page.locator('#maintrack-web-update').waitFor({state:'attached'});
    await awaitMetadata(old);
    const state=await page.evaluate(()=>{
      const bar=document.getElementById('maintrack-web-update');
      const apply=[...bar.querySelectorAll('button')].find(x=>x.textContent.trim()==='تحديث متاح');
      const check=[...document.querySelectorAll('#profile button')].find(x=>x.textContent.trim()==='التحقق من التحديث');
      return {barHidden:bar.hidden,applyHidden:apply?.hidden,manual:!!check};
    });
    assert.deepEqual(state,{barHidden:true,applyHidden:true,manual:false},'No duplicate manual profile-update button when no new release exists');
    const afterCheck=metadataReads;
    await page.evaluate(()=>{for(let i=0;i<6;i++) dispatchEvent(new Event('focus'));});
    await page.waitForTimeout(350);
    assert.equal(metadataReads,afterCheck,'Foreground focus storm triggered excessive metadata checks');
    assert.deepEqual(jsErrors,[]);
  } finally {await context.close();}
});
test('same Web Pilot displays update only when same-origin metadata advertises a newer commit',async()=>{
  const {context,page,jsErrors}=await pageContext();
  try {
    const newest='d'.repeat(40);
    let intercepted=0;
    await page.route('**/maintrack-release.json',async route=>{
      intercepted++;
      await route.fulfill({status:200,contentType:'application/json',
        headers:{'Cache-Control':'no-store'},body:JSON.stringify({...release,
          commit:newest,path:'/releases/'+newest+'/',expiresAt:Date.now()+86400000})});
    });
    const result=await page.goto(origin+release.path,{waitUntil:'domcontentloaded'});
    assert.equal(result.status(),200);
    const available=page.locator('#maintrack-web-update button').filter({hasText:'تحديث متاح'});
    await available.waitFor({state:'visible',timeout:8000});
    assert.equal(await page.locator('#maintrack-web-update').isVisible(),true);
    assert.equal(intercepted,1,'Update discovery should make one metadata request, not poll continuously');
    await page.waitForTimeout(350);
    assert.equal(intercepted,1);
    assert.deepEqual(jsErrors,[]);
    // Do not click: the simulated release is metadata-only and is not an installable asset.
  } finally {await context.close();}
});
