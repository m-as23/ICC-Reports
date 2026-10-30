// Real browser framing regression; local RC only, all non-loopback traffic aborted.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('SEC003 actual browser blocks external framing for every RC HTML page; same-origin framing remains usable',{timeout:40000},async()=>{
 const {chromium}=require(process.env.MAINTRACK_PLAYWRIGHT_MODULE||'playwright');
 const folder=path.resolve('audit-output',process.env.MAINTRACK_SECURITY_RC_FOLDER||'security-rc');
 const config=JSON.parse(fs.readFileSync(path.join(folder,'web/vercel.json')));
 const pages=fs.readdirSync(path.join(folder,'web')).filter(n=>n.endsWith('.html'));
 const servers=[];let browser;
 const serve=async(handler)=>{const s=http.createServer(handler);await new Promise(r=>s.listen(0,'127.0.0.1',r));servers.push(s);return 'http://127.0.0.1:'+s.address().port;};
 try{
  const protectedOrigin=await serve((req,res)=>{try{let route=new URL(req.url,'http://local').pathname;for(const rule of config.headers)if(rule.source==='/(.*)'||rule.source===route)for(const h of rule.headers)res.setHeader(h.key,h.value);
   if(route==='/')route='/index.html';else if(!path.extname(route))route+='.html';const file=path.resolve(folder,'web','.'+route);assert.ok(file.startsWith(path.resolve(folder,'web')+path.sep));
   res.setHeader('Content-Type',route.endsWith('.js')?'text/javascript':route.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end('NOT_FOUND');}});
  const attackerOrigin=await serve((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>LOCAL FRAMING TEST</title>');});
  browser=await chromium.launch({headless:true,...(process.env.MAINTRACK_BROWSER_EXECUTABLE?{executablePath:process.env.MAINTRACK_BROWSER_EXECUTABLE}:{})});
  const ctx=await browser.newContext({serviceWorkers:'block'});await ctx.route('**/*',route=>{const u=new URL(route.request().url());return [protectedOrigin,attackerOrigin].includes(u.origin)?route.continue():route.abort();});
  for(const name of pages){const page=await ctx.newPage();await page.goto(attackerOrigin);
   const blocked=page.waitForEvent('console',{predicate:m=>/frame-ancestors|X-Frame-Options/i.test(m.text()),timeout:5000});
   await page.evaluate(url=>{const frame=document.createElement('iframe');frame.src=url;document.body.append(frame);},protectedOrigin+'/'+name);await blocked;
   assert.ok(!page.frames().some(f=>f.url()===protectedOrigin+'/'+name));await page.close();
  }
  const page=await ctx.newPage();await page.goto(protectedOrigin+'/');
  await page.evaluate(url=>{const frame=document.createElement('iframe');frame.src=url;document.body.append(frame);},protectedOrigin+'/inventory-reference.html');
  await page.waitForFunction(url=>[...document.querySelectorAll('iframe')].some(f=>{try{return f.contentWindow.location.href===url&&!!f.contentDocument.body}catch{return false}}),protectedOrigin+'/inventory-reference.html');
  await ctx.close();
 }finally{if(browser)await browser.close();await Promise.all(servers.map(s=>new Promise(r=>s.close(r))));}
});
