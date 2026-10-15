import {before, after, test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {generateKeyPairSync, sign} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {canonicalJson} from '../update-system/policy.mjs';

const root = path.resolve(import.meta.dirname, '..');
const www = path.join(root, 'www');
const evidence = [];
const pair = generateKeyPairSync('ed25519');
const verification = {publicKeyBase64: pair.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url'),
  allowedOrigins: ['https://updates-lab.example.org'], currentNative:'0.3.0'};
const now = Date.now();
const payload = {schema:1, channel:'lab', kind:'web-ota', appId:'com.icc.maintrack', issuedAt:now-1000,
  expiresAt:now+86400000, nativeMinimum:'0.2.0', nativeMaximum:'0.3.0', bundleVersion:'0.3.1',
  bundleUrl:'https://updates-lab.example.org/test-only.zip', sha256:'a'.repeat(64), bytes:1024};
const envelope = {payload, signature:sign(null, Buffer.from(canonicalJson(payload)), pair.privateKey).toString('base64url')};
let browser, server, origin, harness;

before(async () => {
  harness = (await build({entryPoints:[path.join(import.meta.dirname, 'harness-entry.mjs')],
    bundle:true, write:false, format:'iife', platform:'browser', target:'es2022'})).outputFiles[0].contents;
  server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/stage14-integration-harness.js') {
        res.writeHead(200, {'Content-Type':'application/javascript'}); res.end(harness); return;
      }
      const file = path.resolve(www, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(www + path.sep)) {res.writeHead(403); res.end(); return;}
      let data = await fs.readFile(file);
      if (file.endsWith('index.html')) {
        data = Buffer.from(data.toString().replace('</body>', '<script src="stage14-integration-harness.js"></script></body>'));
      }
      const types = {'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
      res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
      res.end(data);
    } catch {res.writeHead(404); res.end();}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({channel:'chromium', headless:true});
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await fs.mkdir(path.join(import.meta.dirname, 'evidence'), {recursive:true});
  await fs.writeFile(path.join(import.meta.dirname, 'evidence/summary.json'), JSON.stringify({
    scope:'Actual locked MainTrack UI + read-only native integration; localhost and intercepted mock backend only',
    nativeUpdater:'mock only; no Android emulator or real OTA rerun',
    exactlyOnceScope:'In-memory backend deduplicates by employee + cid; no claim about production backend',
    scenarios:evidence
  }, null, 2) + '\n');
});

function scenario(name, run) {
  test(name, async () => {
    try {await run(); evidence.push({name, result:'passed'});}
    catch (error) {evidence.push({name, result:'failed'}); throw error;}
  });
}

async function until(predicate, message) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(message);
}

async function fixture(run) {
  const context = await browser.newContext({serviceWorkers:'block'});
  context.setDefaultTimeout(10000);
  const mock = {offline:false, submitMode:'success', submitAttempts:[], committed:new Map(), held:[], pageErrors:[]};
  const catalog = {id:'LAB-WO-NEXT', role:'technician', sections:['LAB_SECTION'],
    machines:[['LAB_SECTION','LAB_MACHINE']], parts:[['LAB_SECTION','LAB_PART']],
    status:['Closed','Open'], cats:['Electrical','Mechanical']};
  const apiUrl = 'https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api';
  await context.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === origin) return route.continue();
    // Every external request is intercepted. No route can reach a real backend.
    if (req.url() !== apiUrl) return route.abort('blockedbyclient');
    if (mock.offline) return route.abort('internetdisconnected');
    const fulfill = data => route.fulfill({status:200, contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}, body:JSON.stringify(data)});
    if (req.method() === 'OPTIONS') return fulfill({});
    const body = req.postDataJSON();
    if (body.action === 'login') return fulfill({token:'synthetic-token-' + body.code, code:body.code,
      name:'Synthetic Test Account', role:'technician'});
    if (body.action === 'session') return fulfill({ok:true, role:'technician', name:'Synthetic Test Account'});
    if (body.action === 'init') return fulfill(catalog);
    if (body.action === 'dashboard') return fulfill({metrics:{}, topMachines:[], recent:[], sectionHours:[]});
    if (body.action === 'nextId') return fulfill({id:'LAB-WO-NEXT'});
    if (body.action === 'notifications') return fulfill({items:[], storedItems:[], pendingItems:[], pendingCount:0, savedUnreadCount:0});
    if (body.action === 'submit') {
      mock.submitAttempts.push(body);
      const key = body.u + ':' + body.cid;
      const commit = () => {
        if (!mock.committed.has(key)) mock.committed.set(key, {id:'LAB-WO-' + (mock.committed.size + 1)});
        return mock.committed.get(key);
      };
      if (mock.submitMode === 'hold') {
        mock.held.push(() => fulfill(commit()));
        return;
      }
      if (mock.submitMode === 'drop-once') {
        commit(); mock.submitMode = 'success'; return route.abort('connectionreset');
      }
      return fulfill(commit());
    }
    return fulfill({ok:true});
  });
  context.on('page', page => page.on('pageerror', e => mock.pageErrors.push(e.message)));
  try {await run({context, mock, page:await context.newPage()});}
  finally {await context.close();}
  assert.deepEqual(mock.pageErrors, [], 'The actual application must keep working with the integration');
}

async function open(page) {
  await page.goto(origin);
  await page.waitForFunction(() => globalThis.MainTrackLocalWork && globalThis.Stage14IntegrationTest && globalThis.__MainTrackV7Fix);
}
async function login(page, code = 'LAB_ACCOUNT') {
  await page.locator('#lcode').fill(code);
  await page.locator('#lpw').fill('synthetic-test-password');
  await page.locator('#lgo').click();
  await page.locator('#tabForm').waitFor({state:'visible'});
}
async function reportForm(page) {
  await page.locator('#tabForm').click();
  await page.waitForFunction(() => [...document.querySelectorAll('#section option')].some(x => x.value === 'LAB_SECTION'));
  await page.locator('#section').selectOption('LAB_SECTION');
  await page.locator('#machine').selectOption('LAB_MACHINE');
  await page.locator('#comp').selectOption('LAB_PART');
  await page.locator('#desc').fill('Synthetic offline maintenance report');
  await page.locator('#solution').fill('Synthetic recovery test');
  await page.locator('#t1').fill('10:00');
  await page.locator('#t2').fill('10:10');
  await page.locator('#t3').fill('10:30');
}
const readState = page => page.evaluate(() => MainTrackLocalWork.read());
const readRawQueue = page => page.evaluate(() => localStorage.getItem('q'));
async function attempt(page, {release = envelope, raceRaw = null, missingAdapter = false} = {}) {
  return page.evaluate(async ({release, verification, raceRaw, missingAdapter}) => {
    const calls = {download:0, next:0, reload:0};
    const options = {envelope:release, verification, updater:{
      download:async () => {calls.download++; if (raceRaw) localStorage.setItem('q', raceRaw); return {id:'mock-native-bundle'};},
      next:async () => {calls.next++;}, reload:async () => {calls.reload++;}
    }};
    if (missingAdapter) options.localWork = null;
    return {result:await Stage14IntegrationTest.stageMainTrackLabRelease(options), calls};
  }, {release, verification, raceRaw, missingAdapter});
}
function assertDeferred(result) {
  assert.equal(result.result.status, 'deferred');
  assert.deepEqual(result.calls, {download:0,next:0,reload:0});
}

scenario('actual offline report survives closing/reopening UI, blocks OTA, then sends once after confirmed acknowledgement', async () => {
  await fixture(async ({context, mock, page}) => {
    await open(page); await login(page); await reportForm(page);
    mock.offline = true; await context.setOffline(true);
    await page.locator('#send').click();
    await page.waitForFunction(() => !MainTrackLocalWork.read().submitting);
    const raw = await readRawQueue(page);
    const rows = JSON.parse(raw);
    assert.equal(rows.length, 1); assert.equal(rows[0].u, 'LAB_ACCOUNT'); assert.ok(rows[0].cid);
    assert.equal((await readState(page)).offline, true);
    assertDeferred(await attempt(page));
    await page.close();
    // A fresh tab has no sessionStorage login. Persistent report data must remain.
    await context.setOffline(false);
    const reopened = await context.newPage(); await open(reopened);
    assert.equal(await readRawQueue(reopened), raw);
    assert.equal((await readState(reopened)).unsentReports, 1);
    assertDeferred(await attempt(reopened));
    mock.offline = false; mock.submitMode = 'hold';
    await login(reopened);
    await until(() => mock.held.length === 1, 'Restored account must resume its pending report');
    assert.equal((await readState(reopened)).submitting, true);
    assertDeferred(await attempt(reopened));
    await reopened.locator('#now').click(); // Actual concurrent resend action.
    assert.equal(mock.submitAttempts.length, 1);
    await mock.held.shift()();
    await reopened.waitForFunction(() => localStorage.getItem('q') === '[]' && !MainTrackLocalWork.read().submitting);
    assert.equal(mock.committed.size, 1);
    assert.equal(mock.submitAttempts.length, 1);
    assert.equal(mock.submitAttempts[0].cid, rows[0].cid);
    assert.equal((await readState(reopened)).unsentReports, 0);
  });
});

scenario('another account cannot drain a retained report and its queue still blocks updates', async () => {
  await fixture(async ({context, mock, page}) => {
    await open(page); await login(page); await reportForm(page);
    mock.offline = true; await context.setOffline(true); await page.locator('#send').click();
    await page.waitForFunction(() => !MainTrackLocalWork.read().submitting);
    const raw = await readRawQueue(page);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#out').click();
    await context.setOffline(false); mock.offline = false;
    await login(page, 'LAB_OTHER_ACCOUNT');
    // Invoke the same real handler even though the other user's pending bar is hidden.
    await page.locator('#now').evaluate(el => el.click());
    assert.equal(await readRawQueue(page), raw);
    assert.equal(mock.submitAttempts.length, 0);
    assertDeferred(await attempt(page));
  });
});

scenario('a draft remains protected when hidden on another tab; defaults alone do not block a safe update', async () => {
  await fixture(async ({page}) => {
    await open(page); await login(page); await page.locator('#tabForm').click();
    await page.waitForFunction(() => document.getElementById('section').options.length > 1 && !MainTrackLocalWork.read().submitting);
    assert.equal((await readState(page)).dirtyForm, false);
    assert.equal((await attempt(page)).result.status, 'scheduled');
    await page.locator('#desc').fill('Unsubmitted draft');
    await page.locator('#tabDash').click();
    assert.equal((await readState(page)).dirtyForm, true);
    assertDeferred(await attempt(page));
    await page.locator('#tabForm').click(); await page.locator('#desc').fill('');
    await page.locator('#status').selectOption('Open');
    assertDeferred(await attempt(page));
  });
});

scenario('corrupt and unsupported queue values are retained byte for byte and never permit an update', async () => {
  await fixture(async ({page}) => {
    await open(page); await login(page);
    for (const raw of ['{broken', 'null', '{}', '[null]', '[{}]']) {
      await page.evaluate(raw => localStorage.setItem('q', raw), raw);
      assert.equal((await readState(page)).unknownQueue, true);
      assertDeferred(await attempt(page));
      assert.equal(await readRawQueue(page), raw);
    }
  });
});

scenario('a report arriving during mock download defers scheduling; untrusted releases and missing runtime are refused', async () => {
  await fixture(async ({page}) => {
    await open(page); await login(page);
    await page.waitForFunction(() => !MainTrackLocalWork.read().submitting);
    const signed = await attempt(page);
    assert.equal(signed.result.status, 'scheduled');
    assert.deepEqual(signed.calls, {download:1,next:1,reload:0});
    const tampered = {...envelope, payload:{...payload, bundleVersion:'0.3.9'}};
    const refused = await attempt(page, {release:tampered});
    assert.equal(refused.result.status, 'rejected'); assert.equal(refused.calls.download, 0);
    assertDeferred(await attempt(page, {missingAdapter:true}));
    const raw = JSON.stringify([{cid:'synthetic-race-cid', u:'LAB_ACCOUNT', desc:'Synthetic retained item'}]);
    const raced = await attempt(page, {raceRaw:raw});
    assert.equal(raced.result.status, 'deferred');
    assert.deepEqual(raced.calls, {download:1,next:0,reload:0});
    assert.equal(await readRawQueue(page), raw);
  });
});

scenario('lost acknowledgement keeps the actual queued report and reuses cid on retry against an idempotent mock backend', async () => {
  await fixture(async ({mock, page}) => {
    await open(page); await login(page); await reportForm(page);
    mock.submitMode = 'drop-once';
    await page.locator('#send').click();
    await page.waitForFunction(() => !MainTrackLocalWork.read().submitting && JSON.parse(localStorage.getItem('q') || '[]').length === 1);
    assert.equal(mock.committed.size, 1); assert.equal(mock.submitAttempts.length, 1);
    const raw = await readRawQueue(page);
    assertDeferred(await attempt(page));
    await page.locator('#now').click();
    await page.waitForFunction(() => localStorage.getItem('q') === '[]' && !MainTrackLocalWork.read().submitting);
    assert.equal(mock.submitAttempts.length, 2); assert.equal(mock.committed.size, 1);
    assert.equal(mock.submitAttempts[0].cid, mock.submitAttempts[1].cid);
    assert.equal(JSON.parse(raw)[0].cid, mock.submitAttempts[1].cid);
  });
});
