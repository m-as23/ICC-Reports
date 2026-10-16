import {Capacitor} from '@capacitor/core';
import {CapacitorUpdater} from '@capgo/capacitor-updater';
import {mountPilotPanel} from './pilot-panel.mjs';

// Replaced at build time by prepare-pilot-ui.mjs. No mutable runtime trust config.
if (Capacitor.isNativePlatform() && globalThis.MainTrackLocalWork) {
  mountPilotPanel({config:__MAINTRACK_PILOT_CONFIG__, updater:CapacitorUpdater,
    localWork:globalThis.MainTrackLocalWork});
}
