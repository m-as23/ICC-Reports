// Native build addition, loaded AFTER the approved classic MainTrack script.
// busy, D, startPending, initBusy and today are its existing global lexical bindings.
// Only expose a read-only summary. No network, updater call, or storage mutation.
import {createLocalWorkReader, hasReportDraft} from './local-work.mjs';

const read = createLocalWorkReader({
  storage: globalThis.localStorage,
  readSubmitting: () => busy || startPending || !!initBusy,
  isOnline: () => navigator.onLine,
  readDirtyForm: () => hasReportDraft(document, {
    date: today(),
    status: D?.status?.[0] || '',
    cat: D?.cats?.includes('كهربائي') ? 'كهربائي' : D?.cats?.[0] || ''
  })
});
Object.defineProperty(globalThis, 'MainTrackLocalWork', {value: Object.freeze({read})});
