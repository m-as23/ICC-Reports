// Local boot acceptance. No update URL, download, installation, or network wait.
// Do not mark an OTA healthy until its actual shell and storage reader have loaded.
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import {createBootHealth} from './boot-health.mjs';
import {inspectQueueData} from './data-contract.mjs';
import {isMainTrackShellReady} from './shell-readiness.mjs';
if (Capacitor.isNativePlatform()) {
  const health = createBootHealth({
    isShellReady: () => isMainTrackShellReady(document,globalThis),
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
