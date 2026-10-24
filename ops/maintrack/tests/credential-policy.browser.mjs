import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {createServer} from 'node:http';import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../../..');const {chromium}=createRequire(path.join(root,'android/maintrack-app/tests-browser/package.json'))('playwright');const assets=process.env.MT047_ASSET_DIR||path.join(root,'audit-output/final-047/web');
test('real Final login preserves numeric strings and old passwords; password rules block invalid changes before transport',async()=>{
 const server=createServer(async(req,res)=>{try{const rel=new URL(req.url,'http://local').pathname.slice(1)||'index.html';if(rel.includes('..'))throw Error();res.setHeader('Content-Type',rel.endsWith('.js')?'text/javascript':rel.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(assets,rel)));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.MT047_CHROME,headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:390,height:844}});const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.hostname==='127.0.0.1')return route.continue();if(url.hostname==='tdnkeskczcsukcujwinu.supabase.co'){const b=req.postDataJSON();requests.push(b);const answer=b.action==='login'?{token:'a'.repeat(64),code:b.code,name:'Synthetic',role:'technician',must:true}:{error:'BAD_PW'};return route.fulfill({json:answer});}return route.abort();});
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#lcode').waitFor({state:'visible'});
  assert.equal(await page.locator('#lcode').getAttribute('placeholder'),'1111');assert.equal(await page.locator('#lcode').getAttribute('inputmode'),'numeric');
  await page.locator('#lcode').fill('PILOT01');await page.locator('#lpw').fill('Old!Password');await page.locator('#lgo').click();assert.equal(requests.filter(x=>x.action==='login').length,0);
  await page.locator('#lcode').fill('0011');await page.locator('#lgo').click();await page.locator('#np').waitFor({state:'visible'});
  const login=requests.find(x=>x.action==='login');assert.equal(login.code,'0011');assert.equal(login.pw,'Old!Password');
  for(const value of ['abcdefgh','12345678','Ab12345!',' Ab123456','Ab12345']){await page.locator('#np').fill(value);await page.locator('#np2').fill(value);await page.locator('#cgo').click();}
  assert.equal(requests.filter(x=>x.action==='change').length,0);
  await page.locator('#np').fill('Ab123456');await page.locator('#np2').fill('Ab123456');await page.locator('#cgo').click();await page.waitForFunction(()=>document.body.textContent.includes('BAD_PW'));
  assert.equal(requests.filter(x=>x.action==='change').length,1);assert.equal(requests.find(x=>x.action==='change').pw,'Ab123456');assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
