// Native build addition, loaded AFTER the approved classic MainTrack script.
// busy, D, startPending, initBusy and today are its existing global lexical bindings.
// Expose counts/booleans and an explicit activation lease. No storage writes.
import {createLocalWorkReader, hasReportDraft} from './local-work.mjs';
import {createEditorWork} from './editor-work.mjs';
import {createActivationLock} from './activation-lock.mjs';

const editors = createEditorWork(document);
const activation = createActivationLock({document, navigator});
let requests = 0;
const originalPost = post;
// All screens, including login/password and session verification, share post().
// Preserve payloads/results; never acknowledge a response from a superseded token.
post = async function (payload) {
  if (activation.isHeld()) throw Error('UPDATE_ACTIVATING');
  const acknowledge = editors.begin(payload.action);
  requests++;
  try {
    const result = await originalPost.call(this, payload);
    if (!payload.token || (typeof S !== 'undefined' && S?.token === payload.token)) acknowledge(result);
    return result;
  } finally {requests--;}
};

const read = createLocalWorkReader({
  storage: globalThis.localStorage,
  readSubmitting: () => busy || startPending || !!initBusy || requests > 0,
  isOnline: () => navigator.onLine,
  readDirtyForm: () => editors.read() || sessionStorage.getItem('pendingLeave') !== null || hasReportDraft(document, {
    date: today(),
    status: D?.status?.[0] || '',
    cat: D?.cats?.includes('كهربائي') ? 'كهربائي' : D?.cats?.[0] || ''
  })
});
Object.defineProperty(globalThis, 'MainTrackLocalWork', {value: Object.freeze({read, acquireActivation: activation.acquire})});
