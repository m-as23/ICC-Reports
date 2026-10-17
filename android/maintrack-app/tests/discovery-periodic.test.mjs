import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDiscovery, DISCOVERY_INTERVAL} from '../update-system/discovery.mjs';

function mock() {
  let now = 0, nextId = 0;
  const timers = new Map();
  const document = Object.assign(new EventTarget(), {visibilityState:'visible'});
  const events = new EventTarget(), navigator = {onLine:true}, calls = [];
  const schedule = (fn, delay) => {const id = ++nextId; timers.set(id, {fn, at:now + delay}); return id;};
  const cancel = id => timers.delete(id);
  const discovery = createDiscovery({check:async args => {calls.push({when:now,...args});},
    document, events, navigator, clock:() => now, schedule, cancel});
  const tick = async elapsed => {
    now += elapsed;
    for (let i = 0; i < 10; i++) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= now);
      if (!due.length) break;
      for (const [id, t] of due) {timers.delete(id); t.fn();}
      await new Promise(resolve => setImmediate(resolve));
    }
  };
  return {document, events, navigator, calls, timers, discovery, tick};
}

test('periodic update discovery remains nonblocking and deduplicates repeated focus', async () => {
  const m = mock();
  assert.equal(m.calls.length, 0);
  await m.tick(0); assert.equal(m.calls.length, 1);
  for (let i = 0; i < 25; i++) m.events.dispatchEvent(new Event('focus'));
  assert.equal(m.calls.length, 1);
  await m.tick(DISCOVERY_INTERVAL - 1); assert.equal(m.calls.length, 1);
  await m.tick(1); assert.equal(m.calls.length, 2);
  await m.tick(DISCOVERY_INTERVAL); assert.equal(m.calls.length, 3);
  m.discovery.stop(); assert.equal(m.timers.size, 0);
  await m.tick(DISCOVERY_INTERVAL); assert.equal(m.calls.length, 3);
});

test('hidden or offline app never polls; resuming after expiry checks once', async () => {
  const m = mock(); await m.tick(0); assert.equal(m.calls.length, 1);
  m.document.visibilityState = 'hidden'; m.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(m.timers.size, 0);
  await m.tick(DISCOVERY_INTERVAL * 3); assert.equal(m.calls.length, 1);
  m.document.visibilityState = 'visible'; m.document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(resolve => setImmediate(resolve)); await m.tick(0);
  assert.equal(m.calls.length, 2);
  m.navigator.onLine = false; m.events.dispatchEvent(new Event('online'));
  assert.equal(m.timers.size, 0);
  await m.tick(DISCOVERY_INTERVAL * 2); assert.equal(m.calls.length, 2);
  m.navigator.onLine = true; m.events.dispatchEvent(new Event('online'));
  await new Promise(resolve => setImmediate(resolve)); await m.tick(0);
  assert.equal(m.calls.length, 3);
  m.discovery.stop();
});

test('failed discovery cannot generate retry storms and manual check resets throttling', async () => {
  let calls = 0, now = 0;
  const pending = [], document = Object.assign(new EventTarget(), {visibilityState:'visible'});
  const events = new EventTarget();
  const discovery = createDiscovery({check:() => {calls++; throw Error('NETWORK');},
    document, events, navigator:{onLine:true}, clock:() => now,
    schedule:(fn, ms) => {pending.push({fn, ms}); return pending.length;}, cancel:() => {}});
  pending.shift().fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  for (let i = 0; i < 10; i++) events.dispatchEvent(new Event('focus'));
  assert.equal(calls, 1);
  now = DISCOVERY_INTERVAL / 2; await discovery.inspect({manual:true}); assert.equal(calls, 2);
  now += DISCOVERY_INTERVAL / 2; await discovery.inspect(); assert.equal(calls, 2);
  now += DISCOVERY_INTERVAL / 2; await discovery.inspect(); assert.equal(calls, 3);
  discovery.stop();
});
