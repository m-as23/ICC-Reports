import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {canonicalJson} from '../update-system/policy.mjs';
import {validatePilotConfig, fetchPilotEnvelope, createPilotSession} from '../update-system/pilot-session.mjs';

const pair = generateKeyPairSync('ed25519');
const config = {schema:1, channel:'lab', publicKeyBase64:pair.publicKey.export({format:'der', type:'spki'}).subarray(-32).toString('base64url'),
  manifestUrl:'https://updates-lab.example.org/release.json', allowedOrigins:['https://updates-lab.example.org']};
const start = Date.now();
const payload = {schema:1, channel:'lab', kind:'web-ota', appId:'com.icc.maintrack', issuedAt:start-1000,
  expiresAt:start+60000, nativeMinimum:'0.2.0', nativeMaximum:'0.3.0', bundleVersion:'0.3.1',
  bundleUrl:'https://updates-lab.example.org/test.zip', sha256:'a'.repeat(64), bytes:1024,
  localData:{reportQueue:1,writesReportQueue:1,migration:'none'}};
const signed = p => ({payload:p, signature:sign(null, Buffer.from(canonicalJson(p)), pair.privateKey).toString('base64url')});
function fixture({release = signed(payload), currentVersion = 'builtin'} = {}) {
  const calls = {fetch:0, download:0, set:0, release:0};
  const work = {dirtyForm:false, unsentReports:0, submitting:false, offline:false, unknownQueue:false};
  let time = start;
  const session = createPilotSession({config, clock:() => time,
    fetchImpl:async () => {calls.fetch++; return new Response(JSON.stringify(release), {headers:{'content-type':'application/json'}});},
    updater:{current:async () => ({native:'0.3.0', bundle:{id:currentVersion === 'builtin' ? 'builtin' : 'installed', version:currentVersion}}),
      getNextBundle:async () => null, download:async () => {calls.download++; return {id:'candidate'};}, set:async () => {calls.set++;}},
    localWork:{read:() => ({...work}), acquireActivation:() => ({isHeld:() => true, release:() => {calls.release++;}})}});
  return {session, calls, work, expire:() => {time = start + 60001;}};
}

test('pilot has no startup traffic; check/download/activate remain separate actions', async () => {
  const {session, calls} = fixture(); assert.equal(session.read().phase, 'idle'); assert.equal(calls.fetch, 0);
  assert.equal((await session.check()).phase, 'available'); assert.equal(calls.download, 0);
  assert.equal((await session.download()).phase, 'ready'); assert.equal(calls.set, 0);
  assert.equal((await session.activate()).phase, 'activating'); assert.equal(calls.set, 1);
});
test('pilot refuses a validly signed old or already installed release', async () => {
  for (const version of ['0.3.1', '0.3.2']) {
    const {session, calls} = fixture({currentVersion:version});
    assert.equal((await session.check()).phase, 'up-to-date');
    await session.download(); assert.equal(calls.download, 0);
  }
});
test('pilot refuses an untrusted signature or incompatible storage before download', async () => {
  for (const release of [{...signed(payload), signature:'A'.repeat(86)}, signed({...payload, localData:{reportQueue:2}})]) {
    const {session, calls} = fixture({release}); assert.equal((await session.check()).phase, 'rejected');
    await session.download(); assert.equal(calls.download, 0);
  }
});
test('pilot rechecks new edits and expiry at explicit activation', async () => {
  const {session, calls, work, expire} = fixture();
  await session.check(); await session.download(); work.dirtyForm = true;
  assert.equal((await session.activate()).phase, 'ready'); assert.equal(calls.set, 0); assert.equal(calls.release, 1);
  work.dirtyForm = false; expire(); assert.equal((await session.activate()).phase, 'rejected'); assert.equal(calls.set, 0);
});
test('pilot defers retained reports without downloading or modifying the queue summary', async () => {
  const {session, calls, work} = fixture(); await session.check(); work.unsentReports = 2;
  assert.equal((await session.download()).phase, 'blocked'); assert.equal(calls.download, 0); assert.equal(work.unsentReports, 2);
  work.unsentReports = 0; assert.equal((await session.download()).phase, 'ready');
});
test('pilot manifest transport omits credentials, rejects redirects and limits actual streamed bytes', async () => {
  let options;
  await fetchPilotEnvelope(config.manifestUrl, async (url, opts) => {
    options = opts; return new Response('{}', {headers:{'content-type':'application/json'}});
  });
  assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
  for (const response of [new Response('<html>', {headers:{'content-type':'text/html'}}),
    new Response('a'.repeat(16385), {headers:{'content-type':'application/json'}}),
    {ok:true, redirected:true, headers:new Headers({'content-type':'application/json'})}]) {
    await assert.rejects(fetchPilotEnvelope(config.manifestUrl, async () => response));
  }
});
test('pilot configuration is fixed to an approved HTTPS lab origin', () => {
  for (const bad of [{...config, channel:'production'}, {...config, manifestUrl:'http://updates-lab.example.org/release.json'},
    {...config, manifestUrl:'https://other.example.org/release.json'}, {...config, manifestUrl:config.manifestUrl+'?token=not-allowed'}]) {
    assert.throws(() => validatePilotConfig(bad));
  }
});
test('only GitHub raw hosting accepts plain-text JSON; signatures still gate a release', async () => {
  const plain = () => new Response('{}', {headers:{'content-type':'text/plain; charset=utf-8'}});
  assert.deepEqual(await fetchPilotEnvelope('https://raw.githubusercontent.com/owner/repo/commit/release.json', async () => plain()), {});
  await assert.rejects(fetchPilotEnvelope(config.manifestUrl, async () => plain()));
  const {session} = fixture(); await session.check(); assert.equal(session.read().installedVersion, '0.3.0');
});
