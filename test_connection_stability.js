'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=__dirname+'/';
const html=fs.readFileSync(path+'index.html','utf8');
const js=html.split('<script>').pop().split('</script>')[0];
assert(html.includes('id="retryConnect"'));
assert(js.includes('startPending=true'));
assert(js.includes("d=await api('submit',f)"));
assert(js.includes("const d=await api('markNotificationRead',{id:String(id)})"));
assert(!js.includes("setTimeout(() => c.abort(), 25000)"));
const segment=js.slice(js.indexOf('const API_TIMEOUT_MS ='),js.indexOf('const roles ='));
assert(segment.startsWith('const API_TIMEOUT_MS'));
const timers=[],metrics=[],requests=[];
let plan=[];
const context={
 API:'https://example.invalid/exec',S:{token:'first'},
 fetch:async(url,opt)=>{requests.push(JSON.parse(opt.body));const reply=plan.shift();if(reply instanceof Error)throw reply;if(typeof reply==='function')return reply();return {ok:true,json:async()=>reply};},
 AbortController,Date,JSON,Math,Object,Array,
 setTimeout:(cb,ms)=>{timers.push(ms);return 1},clearTimeout:()=>{},
 console:{info:(...x)=>metrics.push(x.join(' '))}
};
vm.createContext(context);vm.runInContext(segment,context);
async function run(){
  plan=[{ok:true,pendingCount:0}];
  let x=await vm.runInContext("api('notifications')",context);
  assert.equal(x.ok,true);assert.equal(requests.at(-1).action,'notifications');assert.equal(requests.at(-1).token,'first');
  assert.equal(timers.at(-1),15000);
  plan=[{error:'AUTH'},{ok:true,role:'technician',name:'Name'}];
  x=await vm.runInContext("api('dashboard',{year:2026,month:10})",context);
  assert.equal(x.error,'AUTH_UNCONFIRMED');assert.equal(context.S.token,'first');
  assert.equal(requests.at(-2).action,'dashboard');assert.equal(requests.at(-1).action,'session');
  assert.equal(timers.at(-2),20000);assert.equal(timers.at(-1),15000);
  plan=[{error:'AUTH'},{error:'AUTH'}];
  x=await vm.runInContext("api('dashboard',{year:2026,month:10})",context);
  assert.equal(x.error,'AUTH');
  // An old request must not invalidate a newer signed-in session.
  let resolvePending;
  plan=[()=>new Promise(resolve=>{resolvePending=resolve;})];
  const pending=vm.runInContext("api('notifications')",context);
  context.S={token:'second'};
  resolvePending({ok:true,json:async()=>({error:'AUTH'})});
  x=await pending;
  assert.equal(x.error,'STALE_SESSION');
  assert.equal(requests.at(-1).action,'notifications'); // no extra session check
  // A mutating request is sent only once: no hidden retry.
  plan=[new Error('net down')];let before=requests.length;
  try{await vm.runInContext("api('submit',{cid:'CID-123'})",context);assert.fail('expected error');}catch(e){assert.equal(e.message,'net down');}
  assert.equal(requests.length,before+1);assert.equal(timers.at(-1),45000);
  assert(!metrics.join('\n').includes('CID-123'));
  assert(!metrics.join('\n').includes('second'));
  console.log('PASS: action-specific timeouts, AUTH recheck valid/invalid, stale token protection, no write retry, privacy-safe logs');
  // Server-side action timing: no payload, code or passwords in diagnostics.
  const backend=fs.readFileSync(path+'Code_API.gs','utf8');
  const log=[];
  const server={
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:s=>({text:s,setMimeType(){return this;}})},
    console:{info:(...a)=>log.push(a.join(' '))}
  };
  vm.createContext(server);vm.runInContext(backend,server);
  server.login_=()=>({token:'REDACTED',code:'123',role:'technician'});
  let response=server.doPost({postData:{contents:JSON.stringify({action:'login',code:'123',pw:'private-password'})}});
  assert.equal(JSON.parse(response.text).token,'REDACTED');
  assert.equal(JSON.parse(log.at(-1).split('MAINTRACK_API ')[1]).action,'login');
  assert(!log.join('\n').includes('private-password'));
  assert(!log.join('\n').includes('REDACTED'));
  server.login_=()=>{throw new Error('BAD_PW');};
  response=server.doPost({postData:{contents:JSON.stringify({action:'login',code:'123',pw:'private-password'})}});
  assert.equal(JSON.parse(response.text).error,'BAD_PW');
  assert.equal(JSON.parse(log.at(-1).split('MAINTRACK_API ')[1]).outcome,'BAD_PW');
  assert(!log.join('\n').includes('123'));
  console.log('PASS: server logs action, timing, safe error class; never secrets or employee code');
}
run().catch(e=>{console.error(e);process.exitCode=1});
