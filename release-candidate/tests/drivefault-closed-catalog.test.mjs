import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = path => readFileSync(new URL('../integrated/web/' + path, import.meta.url), 'utf8');
const element = () => ({
  hidden: false,
  disabled: false,
  firstChild: null,
  classList: { add() {}, toggle() {}, remove() {} },
  setAttribute() {},
  addEventListener() {},
  append(child) { this.firstChild = child; },
  prepend() {},
  replaceChildren() { this.firstChild = null; },
  style: {},
});

function app(downloadsEnabled, role, fetch) {
  const tabs = element();
  const inventory = { parentElement: tabs };
  const panel = { ...element(), id: 'drivefault-view' };
  let button;
  tabs.insertBefore = (item, anchor) => {
    assert.equal(anchor, inventory);
    button = item;
  };
  const window = { MainTrackRuntime: { driveFaultPublishedDownloads: downloadsEnabled } };
  const document = {
    body: element(),
    getElementById: id => ({ tabs, tabInventory: inventory, 'drivefault-view': panel })[id],
    createElement: element,
    createElementNS: element,
  };
  const context = { document, window, fetch, S: { role, token: 'synthetic', code: 'fixture' } };
  runInNewContext(source('drivefault-host.js'), context);
  return { button, panel, context, host: window.MainTrackDriveFaultHost };
}

test('closed catalog opens Simple Search for MainTrack readers without API or cache access', async () => {
  const neverFetch = () => assert.fail('closed catalog requested network');
  const neverOpen = () => assert.fail('closed catalog opened IndexedDB');
  for (const role of ['owner', 'engineer', 'technician']) {
    const { button, panel, context, host } = app(false, role, neverFetch);
    assert.equal(button.hidden, false);
    await host.onView('drivefault', true);
    assert.equal(panel.firstChild.src, 'drivefault/index.html');
    const ui = new Map();
    const get = id => {
      if (!ui.has(id)) ui.set(id, element());
      return ui.get(id);
    };
    runInNewContext(source('drivefault/module.js'), {
      window: { parent: { MainTrackDriveFaultHost: host } },
      document: { getElementById: get },
      indexedDB: { open: neverOpen },
      navigator: {},
    });
    assert.equal(get('welcomeTitle').textContent, 'لا توجد حزم أعطال معتمدة متاحة');
    for (const id of ['catalog', 'query', 'download']) assert.equal(get(id).disabled, true);
    await assert.rejects(host.request('download', {}), /unavailable/);
    context.S = null;
    await host.onView('login', false);
    assert.equal(button.hidden, true);
    assert.equal(panel.hidden, true);
    assert.equal(panel.firstChild, null);
  }
  const denied = app(false, 'unrecognized', neverFetch);
  await denied.host.onView('drivefault', true);
  assert.equal(denied.button.hidden, true);
  assert.equal(denied.panel.firstChild, null);
});

test('published mode still requires authorization from the existing server context route', async () => {
  const requests = [];
  const { button, panel, host } = app(true, 'owner', async (path, options) => {
    requests.push({ path, authorization: options.headers.Authorization });
    return { ok: false, status: 403 };
  });
  await new Promise(resolve => setImmediate(resolve));
  await host.onView('drivefault', true);
  assert.deepEqual(requests, [{ path: '/drivefault-api/context', authorization: 'Bearer synthetic' }]);
  assert.equal(button.hidden, true);
  assert.equal(panel.firstChild, null);
});
