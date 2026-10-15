import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectReportQueue, hasReportDraft, createLocalWorkReader, readTrustedLocalWork} from '../update-system/local-work.mjs';
const row = {cid: 'test-only-cid', u: 'TEST-ACCOUNT', desc: 'synthetic'};
const storage = raw => ({getItem: () => raw});

test('queue read includes rejected rows and other accounts without exposing or mutating their data', () => {
  const raw = JSON.stringify([row, {...row, cid: 'other', u: 'OTHER', err: 'VALIDATION'}]);
  assert.deepEqual(inspectReportQueue(storage(raw)), {unsentReports: 2, unknownQueue: false});
  assert.deepEqual(inspectReportQueue(storage(null)), {unsentReports: 0, unknownQueue: false});
});
test('corrupt, inaccessible and unrecognized queue storage never becomes a safe empty queue', () => {
  for (const raw of ['', '{', 'null', '{}', '[null]', '[{}]', '[{"cid":1,"u":"x"}]']) {
    assert.equal(inspectReportQueue(storage(raw)).unknownQueue, true, raw);
  }
  assert.equal(inspectReportQueue({getItem() {throw Error('unavailable');}}).unknownQueue, true);
});
test('only explicit safe booleans and a nonnegative integer queue count permit integration', () => {
  const safe = {unsentReports: 0, unknownQueue: false, dirtyForm: false, submitting: false, offline: false};
  assert.deepEqual(readTrustedLocalWork({read: () => safe}), safe);
  for (const result of [null, {}, {...safe, unsentReports: -1}, {...safe, unsentReports: NaN}, {...safe, submitting: undefined}]) {
    assert.equal(readTrustedLocalWork({read: () => result}).unknownQueue, true);
  }
  assert.equal(readTrustedLocalWork(undefined).unknownQueue, true);
});
test('runtime read failures defer updates and summary never includes report data', () => {
  const read = createLocalWorkReader({storage: storage(JSON.stringify([row])),
    readDirtyForm() {throw Error('not ready');}, readSubmitting: () => undefined, isOnline: () => false});
  assert.deepEqual(read(), {unsentReports: 1, unknownQueue: false, dirtyForm: true, submitting: true, offline: true});
  assert.equal(Object.isFrozen(read()), true);
});
test('report defaults and post-save reset are clean; hidden or partially edited report remains protected', () => {
  const fields = Object.fromEntries(['form','section','machine','comp','desc','solution','t1','t2','t3','spare','date','status','cat']
    .map(id => [id, {value: '', disabled: false}]));
  const document = {getElementById: id => fields[id]};
  const defaults = {date: '2026-10-15', status: 'Closed', cat: 'Electrical'};
  Object.entries(defaults).forEach(([id, value]) => fields[id].value = value);
  assert.equal(hasReportDraft(document, defaults), false);
  fields.desc.value = 'Unsubmitted work';
  fields.form.style = {display: 'none'};
  assert.equal(hasReportDraft(document, defaults), true);
  fields.desc.value = '';
  fields.status.value = 'Open';
  assert.equal(hasReportDraft(document, defaults), true);
  fields.status.value = '';
  fields.cat.value = '';
  assert.equal(hasReportDraft(document, defaults), false);
  delete fields.comp;
  assert.equal(hasReportDraft(document, defaults), true);
});
