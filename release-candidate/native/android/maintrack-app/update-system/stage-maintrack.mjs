// Explicit LAB integration only. No startup import, production endpoint/key, or
// unattended native schedule. Downloaded candidates cannot activate on background.
import {verifyLabRelease, canActivate} from './ota-lab.mjs';
import {readTrustedLocalWork} from './local-work.mjs';
import {acceptsLocalDataContract} from './data-contract.mjs';

export function createMainTrackLabUpdater({verification, updater,
  localWork = globalThis.MainTrackLocalWork, clock = Date.now} = {}) {
  let candidate = null, running = false, terminal = false;
  const safe = () => canActivate(readTrustedLocalWork(localWork));
  const verify = envelope => verifyLabRelease(envelope, {...verification, now:clock()});
  const pending = async () => (await updater.getNextBundle()) != null;
  return Object.freeze({
    async prepare(envelope) {
      if (running || terminal) return {status:'busy'};
      running = true; candidate = null;
      try {
        const copy = JSON.parse(JSON.stringify(envelope));
        const release = await verify(copy);
        if (!release || !acceptsLocalDataContract(release.localData)) return {status:'rejected'};
        if (!safe()) return {status:'deferred', reason:'LOCAL_WORK'};
        if (await pending()) return {status:'deferred', reason:'NATIVE_PENDING_UPDATE'};
        const bundle = await updater.download({url:release.bundleUrl, version:release.bundleVersion, checksum:release.sha256});
        if (!bundle?.id || typeof bundle.id !== 'string' || bundle.id === 'builtin') throw Error('INVALID_BUNDLE');
        candidate = {envelope:copy, id:bundle.id};
        if (!safe()) return {status:'deferred', reason:'LOCAL_WORK_AFTER_DOWNLOAD'};
        return {status:'ready', id:bundle.id}; // No next(), reload(), or set().
      } catch {return {status:'failed'};}
      finally {running = false;}
    },
    async activate() {
      if (running || terminal) return {status:'busy'};
      if (!candidate) return {status:'disabled'};
      // Acquire synchronously from a real user gesture before the first await.
      let lease;
      try {lease = localWork?.acquireActivation?.();} catch { /* Missing runtime is unsafe. */ }
      if (!lease) return {status:'deferred', reason:'USER_ACTION_REQUIRED'};
      running = true;
      let handedToNative = false, beforeId;
      try {
        if (!safe()) return {status:'deferred', reason:'LOCAL_WORK'};
        const release = await verify(candidate.envelope);
        if (!release || !acceptsLocalDataContract(release.localData)) return {status:'rejected'};
        if (await pending()) return {status:'deferred', reason:'NATIVE_PENDING_UPDATE'};
        beforeId = (await updater.current())?.bundle?.id;
        if (typeof beforeId !== 'string') throw Error('CURRENT_BUNDLE_UNKNOWN');
        // Nothing asynchronous between this final check and the native bridge.
        if (!lease.isHeld() || !safe()) return {status:'deferred', reason:'LOCAL_WORK_AT_ACTIVATION'};
        handedToNative = true; terminal = true;
        await updater.set({id:candidate.id});
        return {status:'activating'}; // A real reload normally destroys this context.
      } catch {
        if (handedToNative) {
          // Rejection can occur AFTER native activation. Unlock only if the bridge
          // proves the original bundle is still current and no next exists.
          try {
            if ((await updater.current())?.bundle?.id === beforeId && !(await pending())) {
              handedToNative = false; terminal = false;
            }
          } catch { /* Unknown native state: keep the old UI locked until restart. */ }
          if (handedToNative) {lease.recovery?.(); return {status:'recovery-required'};}
        }
        return {status:'failed'};
      } finally {
        running = false;
        if (!handedToNative) lease.release();
      }
    },
    cancel() {
      if (running || terminal) return false;
      candidate = null; return true; // Never reset the app or alter local reports.
    }
  });
}

// Compatibility entry point only prepares a download. The controller above
// retains a candidate for a later explicit user-driven activation.
export async function stageMainTrackLabRelease({envelope, ...options} = {}) {
  return createMainTrackLabUpdater(options).prepare(envelope);
}
