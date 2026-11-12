import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import engine from '../integrated/web/drivefault/engine.js';

const catalog = (id, manufacturer, models, records) => ({
  meta: { catalogId: id, manufacturer, models },
  records,
});

const card = (id, titleEn) => ({
  id, titleEn, code: 'Card No Data', recordType: 'NAMED_TRIP', tripNumber: 183,
  fullDetail: { subcodes: [{ subtrip: 1, matchPolicy: 'context-required' }] },
});
const m700 = catalog('m700', 'Control Techniques', ['M700', 'M701'], [
  card('m700-card', 'Card No Data'),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `excluded-${i}`, code: `Z${i}`,
    recordType: ['RESERVED', 'RESERVED_RANGE', 'UNDEFINED'][i % 3],
  })),
]);
const second = catalog('other', 'Siemens', ['G120C'], [
  card('other-card', 'Synthetic card fault'),
  { id: 'siemens-fault', code: 'F01600', titleEn: 'Safety shutdown', recordType: 'FAULT' },
]);

test('composite search excludes catalogs that fail the model or manufacturer filter', () => {
  assert.deepEqual(engine.search([m700], '183.1', { model: 'G120C' }), []);
  assert.deepEqual(engine.search([m700], '183.1', { manufacturer: 'Siemens' }), []);
  assert.deepEqual(engine.search([m700, second], '183.1', {
    model: 'G120C', manufacturer: 'SIEMENS',
  }).map(hit => hit.record.id), ['other-card']);
});

test('matching model aliases preserve composite resolution and ordinary searches', () => {
  for (const model of ['M700', 'M701']) {
    const [hit] = engine.search([second, m700], '183.1', { model });
    assert.equal(hit.record.id, 'm700-card');
    assert.equal(hit.resolution.status, 'CONTEXT_REQUIRED');
  }
  assert.equal(engine.search([second, m700], 'F01600', { model: 'G120C' })[0].reason, 'CODE_EXACT');
  assert.equal(engine.search([second, m700], 'shutdown', { model: 'G120C' })[0].record.id, 'siemens-fault');
  assert.deepEqual(engine.search([second, m700], 'F01600', { model: 'M700' }), []);
});

test('reserved and undefined entries remain excluded', () => {
  for (const row of m700.records.slice(1)) {
    assert.ok(!engine.search([m700], row.code, { model: 'M700' }).some(hit => hit.record.id === row.id));
  }
});

test('Web and Android Engine copies are byte-identical', () => {
  const read = path => readFileSync(new URL(path, import.meta.url));
  assert.deepEqual(read('../integrated/web/drivefault/engine.js'),
    read('../native/android/maintrack-app/www/drivefault/engine.js'));
});

test('offline worker installs the corrected shell and retires only the old shell cache', async () => {
  const web = readFileSync(new URL('../integrated/web/drivefault/sw.js', import.meta.url));
  const native = readFileSync(new URL('../native/android/maintrack-app/www/drivefault/sw.js', import.meta.url));
  assert.deepEqual(web, native);

  const { runInNewContext } = await import('node:vm');
  const handlers = {};
  const calls = [];
  runInNewContext(web.toString(), {
    self: {
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: async () => { calls.push('ready'); },
      clients: { claim: async () => { calls.push('claim'); } },
    },
    caches: {
      open: async name => ({
        addAll: async paths => { calls.push([name, ...paths]); },
      }),
      delete: async name => { calls.push(['delete', name]); },
    },
  });
  for (const name of ['install', 'activate']) {
    await new Promise(resolve => handlers[name]({ waitUntil: resolve }));
  }
  assert.equal(calls[0][0], 'drivefault-v2-simple-search-shell');
  assert.ok(calls[0].includes('/drivefault/engine.js'));
  assert.deepEqual(calls.slice(1), ['ready', ['delete', 'drivefault-v1-simple-search-shell'], 'claim']);
});
