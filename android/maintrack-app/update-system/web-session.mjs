import {readTrustedLocalWork} from './local-work.mjs';
export function validateWebRelease(value, origin, now = Date.now()) {
  if (value?.schema !== 1 || value.appId !== 'com.icc.maintrack' || value.channel !== 'web-pilot'
    || !/^[a-f0-9]{40}$/.test(value.commit) || value.path !== `/releases/${value.commit}/`
    || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now
    || value.expiresAt > now + 7 * 86400000) throw Error('INVALID_WEB_RELEASE');
  const url = new URL(value.path, origin);
  if (url.origin !== origin) throw Error('INVALID_WEB_ORIGIN');
  return Object.freeze({...value, url:url.href});
}
export function createWebSession({origin, currentCommit, fetchRelease, localWork, navigate, now = Date.now}) {
  let candidate, busy = false;
  const safe = () => {
    const s = readTrustedLocalWork(localWork);
    if (s.unknownQueue || s.unsentReports || s.dirtyForm || s.submitting || s.offline) throw Error('LOCAL_WORK_PENDING');
  };
  return Object.freeze({
    async check() {
      if (busy) throw Error('UPDATE_BUSY');
      candidate = undefined;
      const release = validateWebRelease(await fetchRelease(), origin, now());
      if (release.commit !== currentCommit) candidate = release;
      return candidate || null;
    },
    async activate() {
      if (busy || !candidate) throw Error('NO_WEB_UPDATE');
      safe();
      const lease = localWork?.acquireActivation?.();
      if (!lease) throw Error('TRUSTED_ACTION_REQUIRED');
      busy = true;
      let navigating = false;
      try {
        const fresh = validateWebRelease(await fetchRelease(), origin, now());
        if (fresh.commit !== candidate.commit) throw Error('RELEASE_CHANGED');
        safe();
        if (!lease.isHeld()) throw Error('ACTIVATION_INTERRUPTED');
        // Preserve QR section/machine query and hash. Same origin preserves storage.
        const target = new URL(fresh.url);
        navigate(target.href);
        navigating = true;
      } finally {
        if (!navigating) {lease.release(); busy = false;}
      }
    }
  });
}
