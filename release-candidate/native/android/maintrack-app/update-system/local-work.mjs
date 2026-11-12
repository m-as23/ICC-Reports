// Read-only adapter for the existing MainTrack q array. Never use getQ(): its
// recovery fallback returns [] for corrupt storage, which is unsafe for OTA.
export {inspectQueueData as inspectReportQueue} from './data-contract.mjs';
import {inspectQueueData as inspectReportQueue} from './data-contract.mjs';

const reportFields = ['section','machine','comp','desc','solution','t1','t2','t3','spare'];
export function hasReportDraft(document, defaults) {
  if (!defaults || !document.getElementById('form')) return true;
  for (const id of [...reportFields, 'date', 'status', 'cat']) {
    const field = document.getElementById(id);
    if (!field || typeof field.value !== 'string' || field.disabled) return true;
    // Match init()'s date/category/status defaults, and the empty reset after save.
    // Check hidden fields too: switching to the dashboard does not discard a draft.
    if (field.value !== '' && field.value !== (defaults[id] ?? '')) return true;
  }
  return false;
}

export function createLocalWorkReader({storage, readDirtyForm, readSubmitting, isOnline}) {
  return function read() {
    const state = inspectReportQueue(storage);
    // Missing/failed runtime reads conservatively defer an update.
    try { state.dirtyForm = readDirtyForm() !== false; } catch { state.dirtyForm = true; }
    try { state.submitting = readSubmitting() !== false; } catch { state.submitting = true; }
    try { state.offline = isOnline() !== true; } catch { state.offline = true; }
    return Object.freeze(state); // Counts and booleans only, no reports or credentials.
  };
}

export function readTrustedLocalWork(localWork) {
  try {
    const state = localWork.read();
    if (!state || !Number.isSafeInteger(state.unsentReports) || state.unsentReports < 0
      || ['unknownQueue','dirtyForm','submitting','offline'].some(k => typeof state[k] !== 'boolean')) {
      throw Error('LOCAL_WORK_UNAVAILABLE');
    }
    return state;
  } catch {
    return {unsentReports: 0, unknownQueue: true, dirtyForm: true, submitting: true, offline: true};
  }
}
