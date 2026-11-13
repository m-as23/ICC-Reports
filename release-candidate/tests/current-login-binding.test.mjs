import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
const output = process.argv[2];
const origin = process.env.MAINTRACK_SUPABASE_ORIGIN;
assert.match(origin ?? '', /^https:\/\/[a-z0-9]{20}\.supabase\.co$/);
if (!output) throw Error('Expected generated release-files directory');
const read = name => readFileSync(resolve(output, name), 'utf8');

for (const variant of ['web', 'native-www']) {
 const sandbox = { window: {} };
 runInNewContext(read(variant + '/runtime-binding.js'), sandbox);
 const { core, inventory, admissionEnabled } = sandbox.window.MainTrackRuntime;
 const base = origin + '/functions/v1/';
 assert.equal(core, base + 'maintrack-final-047/api');
 assert.equal(inventory, base + 'maintrack-inventory-final-047');
 assert.equal(admissionEnabled, false);
 const html = read(variant + '/index.html');
 assert.ok(html.includes("connect-src 'self' " + new URL(core).origin));
 assert.ok(!html.includes('native-login-bootstrap'));
 assert.ok(read(variant + '/drivefault-host.js').includes("if (!downloadsEnabled) throw Error('DriveFault downloads unavailable')"));
 const main = read(variant + '/secure-assets/index-inline-1.js');
 const transport = main.slice(main.indexOf('async function post(b){'), main.indexOf('async function confirmInvalidSession'));
 const requests = [];
 Object.assign(sandbox, {
  API: core, API_TIMEOUT_MS: {}, API_DEFAULT_TIMEOUT_MS: 1000, AbortController, setTimeout, clearTimeout, crypto,
  requestMetric() {},
  async fetch(url, options) {
   requests.push({ url, headers: options.headers, body: JSON.parse(options.body) });
   return { ok: true, async json() { return { ok: true }; } };
  },
 });
 runInNewContext(transport, sandbox);
 await sandbox.post({ action: 'login', code: '90000001', pw: 'synthetic' });
 await sandbox.post({ action: 'logout', token: 'synthetic-token' });
 assert.equal(requests.length, 2);
 assert.equal(requests[0].url, core);
 assert.deepEqual(requests[0].body, { action: 'login', code: '90000001', pw: 'synthetic' });
 assert.equal(requests[0].headers.Authorization, undefined);
 assert.equal(requests[1].headers.Authorization, 'Bearer synthetic-token');
 assert.deepEqual(requests[1].body, { action: 'logout' });
 console.log(variant + ': PASS direct Login, session Logout request and exact HTTPS bindings');
}
const framing = JSON.parse(read('web/vercel.json'));
for (const path of ['/', '/index', '/index.html', '/inventory-reference.html', '/drivefault/index.html']) {
 const route = framing.headers.find(entry => entry.source === path);
 assert.ok(route.headers.some(h => h.key === 'Content-Security-Policy' && h.value.includes("frame-ancestors 'self'")));
 assert.ok(route.headers.some(h => h.key === 'X-Frame-Options' && h.value === 'SAMEORIGIN'));
}
assert.equal(JSON.parse(read('backend/maintrack-inventory-final-047/deno.json')).imports.yauzl, 'npm:yauzl@3.2.1');
console.log('PASS hosted framing contract and pinned Inventory parser; no upstream calls');
