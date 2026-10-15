// Local boot acceptance. No update URL, download, installation, or network wait.
// Do not mark an OTA healthy until its actual shell and storage reader have loaded.
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import {createBootHealth} from './boot-health.mjs';
import {inspectQueueData} from './data-contract.mjs';
if (Capacitor.isNativePlatform()) {
  const health = createBootHealth({
    isShellReady: () => document.readyState !== 'loading'
      && !!globalThis.MainTrackLocalWork && globalThis.__MainTrackV7Fix === true
      && globalThis.__MainTrackV6Integrated === true
      && ['login','form','dashboard','v7FormStatus','v7RefreshLists','v6Dock'].every(id => !!document.getElementById(id)),
    isDataCompatible: () => !inspectQueueData(globalThis.localStorage).unknownQueue,
    notifyReady: async () => {
      await CapacitorUpdater.notifyAppReady();
      globalThis.dispatchEvent(new Event('maintrack:boot-ready'));
    }
  });
  const onError = event => {
    if (event.error || event.target?.tagName === 'SCRIPT') health.fail();
  };
  const onRejection = () => health.fail();
  globalThis.addEventListener('error', onError, true);
  globalThis.addEventListener('unhandledrejection', onRejection);
  const deadline = Date.now() + 8000;
  const timer = setInterval(async () => {
    const ready = await health.check();
    if (ready || Date.now() >= deadline) {
      clearInterval(timer);
      globalThis.removeEventListener('error', onError, true);
      globalThis.removeEventListener('unhandledrejection', onRejection);
    }
  }, 50);
}
