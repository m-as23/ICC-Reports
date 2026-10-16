import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDiscovery, DISCOVERY_INTERVAL} from '../update-system/discovery.mjs';
function harness(check) {
  let now=0, startup;
  const document=Object.assign(new EventTarget(), {visibilityState:'visible'});
  const events=new EventTarget(), navigator={onLine:true};
  const discovery=createDiscovery({check,document,events,navigator,clock:()=>now,schedule:fn=>{startup=fn;return 1;},cancel(){}});
  return {document,events,navigator,discovery,start:()=>startup(),advance:ms=>{now+=ms;}};
}
test('startup is deferred and foreground events are throttled for thirty minutes',async()=>{
  let calls=0; const h=harness(()=>calls++);
  assert.equal(calls,0);h.start();await h.discovery.inspect();assert.equal(calls,1);
  for(let i=0;i<20;i++)h.events.dispatchEvent(new Event('focus'));
  await h.discovery.inspect();assert.equal(calls,1);
  h.advance(DISCOVERY_INTERVAL);h.events.dispatchEvent(new Event('focus'));await h.discovery.inspect();assert.equal(calls,2);
  await h.discovery.inspect({manual:true});assert.equal(calls,3);h.discovery.stop();
});
test('offline and hidden starts recover on foreground without duplicate requests',async()=>{
  let calls=0,release;const h=harness(()=>{calls++;return new Promise(r=>{release=r;});});
  h.navigator.onLine=false;h.start();await h.discovery.inspect();assert.equal(calls,0);
  h.navigator.onLine=true;h.document.visibilityState='hidden';await h.discovery.inspect();assert.equal(calls,0);
  h.document.visibilityState='visible';const a=h.discovery.inspect(),b=h.discovery.inspect({manual:true});assert.equal(a,b);
  await Promise.resolve();assert.equal(calls,1);release();await a;h.discovery.stop();
});
test('failed server requests remain silent and cannot create a retry storm',async()=>{
  let calls=0;const h=harness(()=>{calls++;throw Error('network');});
  await h.discovery.inspect();await h.discovery.inspect();assert.equal(calls,1);
  h.advance(DISCOVERY_INTERVAL);await h.discovery.inspect();assert.equal(calls,2);
  h.discovery.stop();h.events.dispatchEvent(new Event('online'));await h.discovery.inspect({manual:true});assert.equal(calls,2);
});
