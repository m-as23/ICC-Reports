// Full, unmodified RC shell. Remote API URLs are intercepted, NEVER forwarded.
import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {randomBytes,createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require(process.env.MAINTRACK_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(import.meta.dirname,'../../..'),target=path.join(root,'audit-output/security-rc'),results=[];
const stock=Array.from({length:3920},(_,i)=>({code:'SE-CON-LAB'+String(i).padStart(5,'0'),description:'CONTACTOR 65 A 220 V '+i,quantity:i,location:'LOCAL',extra:{sourceSheet:'synthetic'}}));
let browser;const servers=[];
async function serverFor(folder,protectedHeaders){
 const config=protectedHeaders?JSON.parse(await fs.readFile(path.join(folder,'vercel.json'),'utf8')):{headers:[]};
 const server=http.createServer(async(req,res)=>{try{
  const name=new URL(req.url,'http://local').pathname;if(name.includes('..'))throw Error('PATH');
  const rule=config.headers.find(x=>x.source===name);for(const h of rule?.headers||[])res.setHeader(h.key,h.value);
  const file=path.join(folder,name==='/'?'index.html':name.slice(1));
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':name.endsWith('.json')?'application/json':'text/html');res.end(await fs.readFile(file));
 }catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));servers.push(server);return 'http://127.0.0.1:'+server.address().port;
}
async function scenario({folder,protectedHeaders,role}){
 const origin=await serverFor(folder,protectedHeaders),sessions=new Map(),counts={},unhandled=[],errors=[];let fault='',logoutCalls=0;
 const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
  if(url.hostname!=='tdnkeskczcsukcujwinu.supabase.co'||!['/functions/v1/maintrack-final-047/api','/functions/v1/maintrack-unified-four-qa/api','/functions/v1/maintrack-inventory-final-047','/functions/v1/maintrack-inventory-047-qa'].includes(url.pathname)){unhandled.push(url.origin);return route.abort();}
  const headers={'access-control-allow-origin':origin,'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'POST,OPTIONS'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  assert.equal(req.method(),'POST');let body=JSON.parse(req.postData()||'{}'),action=body.action;counts[action]=(counts[action]||0)+1;
  assert.ok(!body.token,'Bearer must never be included in request body');
  const token=(req.headers().authorization||'').replace(/^Bearer /,''),user=sessions.get(token);let status=200,result={ok:true};
  if(action==='login'){
   assert.equal(body.code,'90000001');assert.equal(body.pw,'SyntheticPassword7');const fresh=randomBytes(32).toString('hex');sessions.set(fresh,{role});result={token:fresh,role,name:'SYNTHETIC '+role,code:body.code,must:false};
  }else if(action==='logout'){
   logoutCalls++;if(fault==='offline')return route.abort('internetdisconnected');sessions.delete(token);if(fault==='lost-response')return route.abort('connectionreset');result={ok:true,revoked:true};
  }else if(!user){status=401;result={error:'AUTH'};}
  else if(action==='session')result={ok:true,role,name:'SYNTHETIC '+role};
  else if(action==='dashboard')result={ok:true,total:0,open:0,closed:0,hours:0,recent:[],byMachine:[],byCategory:[],bySection:[]};
  else if(action==='notifications')result={items:[],storedItems:[],pendingCount:0};
  else if(['leaveInbox','overtimeInbox'].includes(action))result={items:[],pending:[],history:[]};
  else if(action==='inventorySearchCapabilities')result={cloud:false};
  else if(action==='inventorySnapshot')result={versionId:'1',generation:'synthetic-1',approvedAt:'2026-10-28T00:00:00Z',items:stock};
  else if(action==='inventoryVersion')result={versionId:'1',generation:'synthetic-1'};
  else if(action==='inventoryVersions')result={items:[],hasMore:false};
  else if(action==='inventoryActivity')result={items:[],hasMore:false};
  else {unhandled.push('UNMOCKED_ACTION:'+action);status=500;result={error:'UNMOCKED_ACTION'};}
  // Actual Inventory API uses {ok,data}; Core uses a flat response.
  if(action?.startsWith('inventory')&&status===200)result={ok:true,data:result};
  return route.fulfill({status,headers:{...headers,'content-type':'application/json'},body:JSON.stringify(result)});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(origin);await page.locator('#lcode').fill('90000001');await page.locator('#lpw').fill('SyntheticPassword7');await page.locator('#lgo').click();await page.waitForFunction(()=>typeof S!=='undefined'&&S&&appAuthenticated);
  assert.equal(await page.locator('#tabAdmin').isVisible(),role==='owner');assert.equal(await page.locator('#tabApprove').isVisible(),role==='owner');
  await page.locator('#tabInventory').click();const frame=page.frameLocator('#inv47Frame');await frame.locator('#query:enabled').waitFor();
  const live=()=>page.frames().find(x=>x.url().endsWith('/inventory-reference.html'));await live().waitForFunction(()=>typeof INDEX!=='undefined'&&INDEX.length===3920);assert.equal(await live().evaluate(()=>INDEX.length),3920);
  const before={...counts};const start=performance.now();await frame.locator('#query').fill(stock[100].code);await frame.locator('#searchButton').click();await live().waitForFunction(code=>state.filtered.some(x=>x.c===code),stock[100].code);const searchMs=performance.now()-start;
  await frame.locator('#query').fill(stock[101].code);await frame.locator('#searchButton').click();await live().waitForFunction(code=>state.filtered.some(x=>x.c===code),stock[101].code);
  assert.equal(counts.inventorySnapshot,before.inventorySnapshot);assert.equal(counts.inventorySearch||0,0);assert.equal(counts.inventorySearchPage||0,0);assert.ok(searchMs<1500,'LOCAL_SEARCH_LATENCY_EXCEEDED');
  const other=randomBytes(32).toString('hex');sessions.set(other,{role});const current=await page.evaluate(()=>S.token);
  await page.locator('#out').click();await page.waitForFunction(()=>S===null);
  if(!protectedHeaders){assert.ok(sessions.has(current));assert.equal(logoutCalls,0);return {role,headers:false,items:3920,searchMs:Math.round(searchMs),snapshotRequests:counts.inventorySnapshot,remoteSearchRequests:0,knownUnfixedBaselineLogout:true,externalConnections:0};}
  await page.waitForFunction(()=>!document.getElementById('out').disabled);assert.ok(!sessions.has(current));assert.ok(sessions.has(other));
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('s')),null);assert.equal(logoutCalls,1);
  await page.locator('#lcode').fill('90000001');await page.locator('#lpw').fill('SyntheticPassword7');await page.locator('#lgo').click();await page.waitForFunction(()=>S&&appAuthenticated);
  fault='offline';await page.locator('#out').click();await page.waitForFunction(()=>S===null);await page.waitForFunction(()=>!document.getElementById('out').disabled);assert.equal(logoutCalls,2);assert.ok((await page.locator('#msg').textContent()).includes('لم يتأكد'));
  assert.deepEqual(errors,[]);assert.ok(unhandled.every(x=>['https://fonts.googleapis.com','https://fonts.gstatic.com','https://images.unsplash.com'].includes(x)),'UNEXPECTED_REMOTE_REQUEST');
  if(protectedHeaders){const response=await page.request.get(origin+'/inventory-reference.html');assert.equal(response.headers()['x-frame-options'],'SAMEORIGIN');assert.match(response.headers()['content-security-policy'],/frame-ancestors 'self'/);}
  return {role,headers:protectedHeaders,items:3920,searchMs:Math.round(searchMs),snapshotRequests:counts.inventorySnapshot,remoteSearchRequests:0,logoutCalls,logoutConfirmed:true,offlineLogoutUnconfirmed:true,otherSessionPreserved:true,unexpectedErrors:errors,externalConnections:0,interceptedApiRequests:Object.values(counts).reduce((a,b)=>a+b,0)};
 }catch(error){console.error(JSON.stringify({role,protectedHeaders,counts,unhandled,errors,message:error.message}));throw error;}finally{await context.close();}
}
try{
 browser=await chromium.launch({executablePath:process.env.MAINTRACK_BROWSER,headless:true,args:['--no-sandbox','--disable-background-networking']});
 const baseline=await scenario({folder:path.join(target,'accepted-base/web'),protectedHeaders:false,role:'technician'});results.push({kind:'baseline',...baseline});
 for(const role of ['technician','engineer','owner'])results.push({kind:'candidate',...await scenario({folder:path.join(target,'web'),protectedHeaders:true,role})});
 assert.ok(results[1].searchMs<=Math.max(250,baseline.searchMs*2),'SEARCH_REGRESSION');
 const origin=await serverFor(path.join(target,'web'),true),attack=http.createServer((q,r)=>{r.setHeader('content-type','text/html');r.end('<iframe src="'+origin+'/"></iframe>');});await new Promise(r=>attack.listen(0,'127.0.0.1',r));servers.push(attack);
 const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();const blocks=[];page.on('console',m=>{if(/frame-ancestors|X-Frame-Options/i.test(m.text()))blocks.push(m.text());});await context.route('**/*',r=>['127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());await page.goto('http://127.0.0.1:'+attack.address().port);await page.waitForTimeout(400);assert.ok(blocks.length,'EXTERNAL_FRAME_NOT_BLOCKED');await context.close();
 const report={status:'PASS',scope:'LOCAL_SYNTHETIC_FULL_SHELL_NO_CLOUD',sourceApkParity:false,results,externalFramingBlocked:true,sourceCommit:JSON.parse(await fs.readFile(path.join(target,'security-provenance.json'))).sourceCommit,webAssetSha256:createHash('sha256').update(await fs.readFile(path.join(target,'web/secure-assets/index-inline-1.js'))).digest('hex')};
 const out=process.env.MAINTRACK_BROWSER_REPORT||path.join(target,'browser-results.json');await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();for(const s of servers)await new Promise(r=>s.close(r));}
