// Integration preparation only. Not imported by the app startup and no release
// endpoint/key is configured. The caller must explicitly provide a signed LAB release.
import {verifyLabRelease, stageVerifiedBundle} from './ota-lab.mjs';
import {readTrustedLocalWork} from './local-work.mjs';

export async function stageMainTrackLabRelease({envelope, verification, updater,
  localWork = globalThis.MainTrackLocalWork} = {}) {
  const release = await verifyLabRelease(envelope, verification);
  if (!release) return {status: 'rejected'};
  return stageVerifiedBundle({
    verifiedRelease: release,
    updater,
    getLocalState: () => readTrustedLocalWork(localWork)
  });
}
