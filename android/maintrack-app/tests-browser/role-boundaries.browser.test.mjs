// Staging-only UI role checks against actual generated Web assets.
// All API requests are intercepted and answered in memory. This is NOT a live
// backend authorization test; authenticated RBAC requires separate QA accounts.
import {before, after, test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'../web-pilot/.vercel/output/static');
const api='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa/api';
let server,browser,origin,release;

before(async()=>{
  release=JSON.parse(await fs.readFile(path.join(root,'maintrack-release.json'),'utf8'));
  assert.match(release.commit,/^[a-f0-9]{40}$/);
  server=http.createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const relative=pathname==='/'?'/maintrack-release.json':pathname.endsWith('/')?pathname+'index.html':pathname;
      const file=path.resolve(root,'.'+relative);
      if(!file.startsWith(root+path.sep))throw Error('OUTSIDE_QA_ROOT');
      const bytes=await fs.readFile(file);
      const types={'.html':'text/html','.js':'application/javascript','.css':'text/css',
        '.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream',
        'Cache-Control':'no-store'});
      res.end(bytes);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,channel:'chromium'});
});
after(async()=>{
  await browser?.close();
  if(server)await new Promise(resolve=>server.close(resolve));
});

async function withRole(role,run){
  const context=await browser.newContext({serviceWorkers:'block'});
  const code='QA-'+role.toUpperCase();
  const profile={code,name:'Synthetic '+role,role,department:'QA only',
    jobTitle:role,leaveBalance:0};
  const actions=[],pageErrors=[],externalRequests=[];
  await context.route('**/*',async route=>{
    const req=route.request(),url=req.url();
    if(new URL(url).origin===origin)return route.continue();
    if(url!==api){
      externalRequests.push(url);
      return route.abort('blockedbyclient');
    }
    const reply=data=>route.fulfill({status:200,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},
      body:JSON.stringify(data)});
    if(req.method()==='OPTIONS')return reply({});
    if(req.method()!=='POST')throw Error('UNEXPECTED_QA_METHOD');
    const body=req.postDataJSON();
    actions.push(body.action);
    switch(body.action){
      case 'login':return reply({token:'synthetic-local-session',code,name:profile.name,role});
      case 'session':return reply({ok:true,role,name:profile.name});
      case 'init':return reply({id:'QA-WO-1',role,sections:['QA_SECTION'],
        machines:[['QA_SECTION','QA_MACHINE']],parts:[['QA_SECTION','QA_PART']],
        status:['Open','Closed'],cats:['Electrical']});
      case 'nextId':return reply({id:'QA-WO-1'});
      case 'dashboard':return reply({count:0,totalDowntime:0,metrics:{},
        topMachines:[],recent:[],sectionHours:[],categoryTable:[]});
      case 'notifications':return reply({items:[],storedItems:[],pendingItems:[],
        pendingCount:0,savedUnreadCount:0});
      case 'profile':return reply({profile});
      case 'accountSummary':return reply({profile,annualAvailableDays:0,
        annualTotalDays:0,annualUsedDays:0,substituteAvailableDays:0,
        substituteEarnedDays:0,substituteUsedDays:0,financialApprovedDays:0});
      case 'leaveMine':case 'overtimeMine':return reply({items:[],profile});
      default:return reply({ok:true,items:[],pendingCount:0,profile});
    }
  });
  const page=await context.newPage();
  page.on('pageerror',e=>pageErrors.push(e.message));
  try{
    const response=await page.goto(origin+release.path,{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200);
    await page.locator('#lcode').fill(code);
    await page.locator('#lpw').fill('local-test-password');
    await page.locator('#lgo').click();
    await page.locator('#tabProfile').waitFor({state:'visible',timeout:12000});
    await run({page,actions});
    assert.deepEqual(pageErrors,[],'Actual role UI must not throw JS errors');
    // The UI may request public font CSS; those requests were all intercepted
    // and aborted. Never require fonts or unrelated hosts for QA correctness.
    assert.ok(externalRequests.every(url=>url!==api),
      'All actual QA API calls must be satisfied by the in-memory mock');
  }finally{await context.close();}
}

for(const role of ['technician','engineer','owner']){
  test('Synthetic '+role+' role has expected navigation boundaries',async()=>{
    await withRole(role,async({page,actions})=>{
      for(const id of ['#tabDash','#tabForm','#tabProfile']){
        assert.equal(await page.locator(id).isVisible(),true,role+' should access '+id);
      }
      const ownerOnly=['#tabApprove','#tabAdmin','#tabCmms','#tabCatalog'];
      for(const id of ownerOnly){
        assert.equal(await page.locator(id).isVisible(),role==='owner',
          role+' owner-only menu '+id);
      }
      if(role!=='owner'){
        // Even scripted clicks on hidden controls must not open Owner pages or
        // start privileged API calls. This checks the client, not server RBAC.
        await page.locator('#tabApprove').evaluate(el=>el.click());
        await page.locator('#tabAdmin').evaluate(el=>el.click());
        assert.equal(await page.locator('#approvals').isVisible(),false);
        assert.equal(await page.locator('#admin').isVisible(),false);
        assert.equal(actions.some(a=>['adminUsers','leaveInbox','overtimeInbox',
          'leaveDecision','overtimeDecision'].includes(a)),false,
          'Non-owner must not request privileged actions from hidden navigation');
      }
      await page.locator('#tabDash').click();
      await page.locator('#dashboard').waitFor({state:'visible'});
      if(role==='technician'){
        assert.equal(await page.locator('#mMttr').isVisible(),false,
          'Technician advanced analytics must stay hidden');
        assert.equal(await page.locator('#recentReports').isVisible(),false,
          'Technician historical reports must stay hidden');
      }else{
        assert.equal(await page.locator('#mMttr').isVisible(),true,
          'Owner and Engineer should retain approved dashboard metrics');
      }
    });
  });
}
