import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {canonicalJson} from '../update-system/policy.mjs';
import {createMainTrackLabUpdater} from '../update-system/stage-maintrack.mjs';
import {LOCAL_DATA_CONTRACT, inspectQueueData} from '../update-system/data-contract.mjs';
import {createBootHealth} from '../update-system/boot-health.mjs';

const keys = generateKeyPairSync('ed25519');
const start = Date.now();
const base = {schema:1, channel:'lab', kind:'web-ota', appId:'com.icc.maintrack', issuedAt:start-1000,
  expiresAt:start+60000, nativeMinimum:'0.2.0', nativeMaximum:'0.3.0', bundleVersion:'0.3.1',
  bundleUrl:'https://updates.example.org/immutable.zip', sha256:'a'.repeat(64), bytes:1024, localData:LOCAL_DATA_CONTRACT};
const signed = (changes = {}) => {
  const payload = {...base, ...changes};
  return {payload, signature:sign(null, Buffer.from(canonicalJson(payload)), keys.privateKey).toString('base64url')};
};
function setup() {
  const state = {unsentReports:0, unknownQueue:false, dirtyForm:false, submitting:false, offline:false};
  const env = {time:start, held:false, gesture:true, visible:true, current:'builtin', next:null,
    downloadCount:0, setCount:0, recovery:0, releaseCount:0};
  const updater = {
    getNextBundle:async () => env.next,
    current:async () => ({bundle:{id:env.current}}),
    download:async () => {env.downloadCount++; return {id:'candidate'};},
    set:async () => {env.setCount++; env.current = 'candidate';},
    next:() => assert.fail('An unattended native schedule is forbidden'),
    reload:() => assert.fail('Native set performs its own reload')
  };
  const localWork = {read:() => ({...state}), acquireActivation:() => {
    if (!env.gesture) return null;
    env.held = true;
    return {isHeld:() => env.held && env.visible, release:() => {env.held = false; env.releaseCount++;}, recovery:() => env.recovery++};
  }};
  const controller = createMainTrackLabUpdater({updater, localWork, clock:() => env.time,
    verification:{publicKeyBase64:keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url'),
      allowedOrigins:['https://updates.example.org'], currentNative:'0.3.0'}});
  return {controller, state, env, updater};
}

test('download never schedules; explicit activation checks once more and retains the old-page lock', async () => {
  const {controller, env} = setup();
  assert.equal((await controller.prepare(signed())).status, 'ready');
  assert.equal(env.setCount, 0); assert.equal(env.next, null);
  assert.equal((await controller.activate()).status, 'activating');
  assert.equal(env.setCount, 1); assert.equal(env.held, true);
  assert.equal((await controller.activate()).status, 'busy');
});
test('work created AFTER download blocks activation without touching the reports', async () => {
  for (const [key, value] of [['unsentReports',1],['dirtyForm',true],['submitting',true],['offline',true],['unknownQueue',true]]) {
    const {controller, state, env} = setup();
    await controller.prepare(signed()); state[key] = value;
    assert.equal((await controller.activate()).status, 'deferred', key);
    assert.equal(env.setCount, 0); assert.equal(env.held, false); assert.equal(state[key], value);
  }
});
test('data/schema migrations, expired candidates and mutated signatures never activate', async () => {
  const {controller, env} = setup();
  for (const localData of [undefined, {reportQueue:2, writesReportQueue:2, migration:'replace'}, {...LOCAL_DATA_CONTRACT, extra:1}]) {
    assert.equal((await controller.prepare(signed({localData}))).status, 'rejected');
  }
  assert.equal(env.downloadCount, 0);
  await controller.prepare(signed()); env.time = base.expiresAt;
  assert.equal((await controller.activate()).status, 'rejected'); assert.equal(env.setCount, 0);
  const forged = signed(); forged.payload.localData = {...LOCAL_DATA_CONTRACT, reportQueue:2};
  assert.equal((await controller.prepare(forged)).status, 'rejected');
});
test('candidate metadata cannot be changed by the caller after download', async () => {
  const {controller, env} = setup(), envelope = signed();
  await controller.prepare(envelope); envelope.payload.expiresAt = start-1;
  assert.equal((await controller.activate()).status, 'activating'); assert.equal(env.setCount, 1);
});
test('a pending native schedule, absent user gesture, and loss of visibility defer activation', async () => {
  const {controller, env, updater} = setup();
  env.next = {id:'unexpected'};
  assert.equal((await controller.prepare(signed())).reason, 'NATIVE_PENDING_UPDATE');
  env.next = null; await controller.prepare(signed()); env.gesture = false;
  assert.equal((await controller.activate()).reason, 'USER_ACTION_REQUIRED');
  env.gesture = true; updater.current = async () => {env.visible = false; return {bundle:{id:'builtin'}};};
  assert.equal((await controller.activate()).reason, 'LOCAL_WORK_AT_ACTIVATION');
  assert.equal(env.setCount, 0); assert.equal(env.held, false);
});
test('work arriving during asynchronous native preflight is caught by the final check', async () => {
  const {controller, env, updater, state} = setup();
  await controller.prepare(signed());
  updater.current = async () => {state.unsentReports = 1; return {bundle:{id:'builtin'}};};
  assert.equal((await controller.activate()).reason, 'LOCAL_WORK_AT_ACTIVATION');
  assert.equal(env.setCount, 0); assert.equal(env.held, false);
});
test('safe native refusal unlocks; a partially completed switch never unlocks the stale UI', async () => {
  for (const changed of [false, true]) {
    const {controller, env, updater} = setup(); await controller.prepare(signed());
    updater.set = async () => {if (changed) env.current = 'candidate'; throw Error('native failure');};
    assert.equal((await controller.activate()).status, changed ? 'recovery-required' : 'failed');
    assert.equal(env.held, changed); assert.equal(env.recovery, changed ? 1 : 0);
  }
});
test('concurrent preparation cannot replace the candidate; cancellation never activates it', async () => {
  const {controller, updater, env} = setup();
  let finish, began;
  const started = new Promise(resolve => began = resolve);
  updater.download = () => {began(); return new Promise(resolve => finish = resolve);};
  const first = controller.prepare(signed()); await started;
  assert.equal((await controller.prepare(signed())).status, 'busy'); assert.equal(controller.cancel(), false);
  finish({id:'candidate'}); await first;
  assert.equal(controller.cancel(), true); assert.equal((await controller.activate()).status, 'disabled');
  assert.equal(env.setCount, 0);
});
test('legacy queue fields, account/cid identity and future fields survive read-only compatibility checks', () => {
  const raw = JSON.stringify([{u:'LAB', cid:'stable-id', section:'S', desc:'Original', err:'rejected', future:{keep:true}}]);
  const storage = {getItem:() => raw, setItem:() => assert.fail('No migration is permitted')};
  assert.deepEqual(inspectQueueData(storage), {unsentReports:1, unknownQueue:false});
  assert.equal(storage.getItem('q'), raw);
  for (const rows of [[{u:'LAB',cid:'x',desc:42}], [{u:'LAB',cid:'x'},{u:'LAB',cid:'x'}]]) {
    assert.equal(inspectQueueData({getItem:() => JSON.stringify(rows)}).unknownQueue, true);
  }
});
test('boot readiness waits for the local shell and compatible data, independently of connectivity', async () => {
  let shell = false, compatible = false, calls = 0;
  const health = createBootHealth({isShellReady:() => shell, isDataCompatible:() => compatible, notifyReady:async () => calls++});
  assert.equal(await health.check(), false); shell = true;
  assert.equal(await health.check(), false); compatible = true;
  assert.equal(await health.check(), true); assert.equal(await health.check(), false); assert.equal(calls, 1);
});
test('a failed startup or incompatible local data is never acknowledged as a healthy bundle', async () => {
  const health = createBootHealth({isShellReady:() => true, isDataCompatible:() => true, notifyReady:() => assert.fail('must roll back')});
  health.fail(); assert.equal(await health.check(), false);
});
