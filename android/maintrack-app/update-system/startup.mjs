// Stage13 native readiness ONLY. No OTA fetching, update URL, or installation.
// Capgo requires notifyAppReady on every launch to avoid rollback of healthy bundles.
// This is deliberately executed before MainTrack's first API request.
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
if (Capacitor.isNativePlatform()) {
  try {
    Promise.resolve(CapacitorUpdater.notifyAppReady()).catch(()=>{
      // Native updater manages rollback if readiness cannot be confirmed.
      // Never block login or send sensitive data from this bootstrap.
    });
  } catch {
    // A missing native bridge cannot block the original web UI.
  }
}
