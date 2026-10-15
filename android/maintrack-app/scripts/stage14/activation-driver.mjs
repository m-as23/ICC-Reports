// QA ONLY: actual locked UI + real native plugin, no login or reachable backend.
import {CapacitorUpdater} from '@capgo/capacitor-updater';
import {createMainTrackLabUpdater} from '../../update-system/stage-maintrack.mjs';
import {inspectQueueData} from '../../update-system/data-contract.mjs';
const log = message => console.log('MT_BOUNDARY_' + message);
const configKey = 'stage14-boundary-public-config';
if (globalThis.__BOUNDARY_LAB_CONFIG__) localStorage.setItem(configKey, JSON.stringify(globalThis.__BOUNDARY_LAB_CONFIG__));
const config = JSON.parse(localStorage.getItem(configKey) || 'null');
const phaseKey = 'stage14-boundary-phase';
const raw = JSON.stringify([
  {u:'LAB-NO-LOGIN',cid:'stable-lab-cid-1',section:'LAB',machine:'LAB-MACHINE',comp:'LAB-PART',desc:'Synthetic retained report',
    solution:'Synthetic solution',date:'2026-10-15',t1:'10:00',t2:'10:10',t3:'10:30',status:'Open',cat:'Electrical',spare:'',future:{keep:true}},
  {u:'LAB-OTHER',cid:'stable-lab-cid-2',desc:'Synthetic rejected report',err:'TEST_REJECTED'}
]);
const assert = (condition, label) => {if (!condition) throw Error(label);};
const intact = () => localStorage.getItem('q') === raw && !inspectQueueData(localStorage).unknownQueue;
async function prepare(name) {
  const next = await CapacitorUpdater.getNextBundle(); assert(next == null, 'UNEXPECTED_NATIVE_SCHEDULE');
  const nativeVersion = (await CapacitorUpdater.current()).native;
  const controller = createMainTrackLabUpdater({
    verification:{publicKeyBase64:config.publicKey,allowedOrigins:['https://localhost:8443'],currentNative:nativeVersion},
    updater:{
      download:options => CapacitorUpdater.download(options),
      getNextBundle:() => CapacitorUpdater.getNextBundle(),
      current:() => CapacitorUpdater.current(),
      set:options => {
        // Compatibility experiment ONLY: inject synthetic legacy rows at the bridge
        // boundary to exercise data survival across real native switches/rollback.
        // The real controller is separately proven to refuse pre-existing queued work.
        localStorage.setItem('q', raw); localStorage.setItem(phaseKey, name);
        log('SET_' + name.toUpperCase());
        return CapacitorUpdater.set(options);
      }
    }
  });
  localStorage.setItem('q', raw);
  assert((await controller.prepare(config[name])).status === 'deferred', 'QUEUE_MUST_DEFER');
  assert(intact(), 'QUEUE_WAS_CHANGED'); log('QUEUE_GUARD_PASS_' + name.toUpperCase());
  localStorage.setItem('q', '[]'); // Lab rows only. No production data in this APK.
  assert((await controller.prepare(config[name])).status === 'ready', 'DOWNLOAD_FAILED');
  assert(await CapacitorUpdater.getNextBundle() == null, 'DOWNLOAD_ARMED_A_SCHEDULE');
  const button = document.createElement('button');
  button.textContent = 'APPLY LAB ' + name; button.id = 'boundary-apply';
  button.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;height:72px;z-index:2147483646;background:#fff;color:#111;font-size:20px';
  button.onclick = () => {controller.activate().then(result => {
    if (!['activating'].includes(result.status)) log('ERROR_ACTIVATION_' + JSON.stringify(result));
  }).catch(() => log('ERROR_ACTIVATION_EXCEPTION'));};
  document.body.append(button); log('READY_' + name.toUpperCase());
}
async function boot() {
  if (globalThis.__BOUNDARY_FAULTY__) {log('FAULTY_SHELL_EXECUTED'); return;}
  assert(config, 'CONFIG_MISSING');
  const current = await CapacitorUpdater.current();
  const phase = localStorage.getItem(phaseKey);
  if (!phase) {
    assert(current.bundle.id === 'builtin', 'EXPECTED_BUILTIN');
    assert(localStorage.getItem('q') === null || localStorage.getItem('q') === '[]', 'UNEXPECTED_EXISTING_DATA');
    log('ACTUAL_UI_BOOT_PASS'); await prepare('healthy');
  } else if (phase === 'healthy') {
    assert(current.bundle.version === '0.3.1', 'HEALTHY_VERSION'); assert(intact(), 'HEALTHY_QUEUE_CHANGED');
    log('HEALTHY_ACTUAL_UI_AND_QUEUE_PASS'); await prepare('faulty');
  } else if (phase === 'faulty') {
    assert(current.bundle.version === '0.3.1', 'ROLLBACK_VERSION'); assert(intact(), 'ROLLBACK_QUEUE_CHANGED');
    localStorage.setItem(phaseKey, 'offline'); log('ROLLBACK_ACTUAL_UI_AND_QUEUE_PASS');
  } else if (phase === 'offline') {
    assert(current.bundle.version === '0.3.1', 'OFFLINE_VERSION'); assert(intact(), 'OFFLINE_QUEUE_CHANGED');
    log('OFFLINE_RESTART_AND_QUEUE_PASS');
  } else throw Error('UNKNOWN_PHASE');
}
if (globalThis.__BOUNDARY_FAULTY__) log('FAULTY_SHELL_EXECUTED');
else globalThis.addEventListener('maintrack:boot-ready', () => boot().catch(error => log('ERROR_' + error.message)), {once:true});
