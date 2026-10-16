// Opt-in laboratory UI orchestration. No production trust root or startup fetch.
import {verifyLabRelease} from './ota-lab.mjs';
import {acceptsLocalDataContract} from './data-contract.mjs';
import {compareVersions} from './policy.mjs';
import {createMainTrackLabUpdater} from './stage-maintrack.mjs';

export function validatePilotConfig(config) {
  if (config?.schema !== 1 || config.channel !== 'lab'
    || !/^[A-Za-z0-9_-]{43}$/.test(config.publicKeyBase64)
    || !Array.isArray(config.allowedOrigins) || !config.allowedOrigins.length) throw Error('INVALID_PILOT_CONFIG');
  const https = value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('INVALID_PILOT_URL');
    return url;
  };
  const origins = config.allowedOrigins.map(value => {
    if (https(value).origin !== value) throw Error('INVALID_PILOT_ORIGIN');
    return value;
  });
  const manifest = https(config.manifestUrl);
  if (!origins.includes(manifest.origin) || !manifest.pathname.endsWith('.json')) throw Error('INVALID_MANIFEST_URL');
  return Object.freeze({schema:1, channel:'lab', publicKeyBase64:config.publicKeyBase64,
    manifestUrl:manifest.href, allowedOrigins:Object.freeze([...origins])});
}

export async function fetchPilotEnvelope(url, fetchImpl = globalThis.fetch) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 3000);
  let reader;
  try {
    const response = await fetchImpl(url, {signal:abort.signal, credentials:'omit', cache:'no-store',
      redirect:'error', headers:{accept:'application/json'}});
    if (!response.ok || response.redirected || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')
      || Number(response.headers.get('content-length') || 0) > 16384 || !response.body) throw Error('MANIFEST_RESPONSE_REJECTED');
    reader = response.body.getReader();
    const chunks = []; let bytes = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16384) throw Error('MANIFEST_TOO_LARGE');
      chunks.push(value);
    }
    const body = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) {body.set(chunk, offset); offset += chunk.length;}
    return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(body));
  } finally {
    clearTimeout(timer);
    try {await reader?.cancel();} catch { /* Stream already closed/aborted. */ }
  }
}

export function createPilotSession({config, updater, localWork, fetchImpl, clock = Date.now, onChange = () => {}}) {
  config = validatePilotConfig(config);
  let state = Object.freeze({phase:'idle', version:null, reason:null});
  let controller, envelope, running = false;
  const emit = (phase, reason = null, version = state.version) => {
    state = Object.freeze({phase, reason, version}); onChange(state); return state;
  };
  const terminal = () => ['activating','recovery-required'].includes(state.phase);
  return Object.freeze({
    read: () => state,
    async check() {
      if (running || terminal()) return state;
      running = true; controller?.cancel(); controller = null; envelope = null;
      emit('checking', null, null);
      try {
        const current = await updater.current();
        compareVersions(current?.native, '0.0.0');
        const installed = current?.bundle?.id === 'builtin' ? current.native : current?.bundle?.version;
        compareVersions(installed, '0.0.0');
        envelope = await fetchPilotEnvelope(config.manifestUrl, fetchImpl);
        const verification = {publicKeyBase64:config.publicKeyBase64,
          allowedOrigins:config.allowedOrigins, currentNative:current.native};
        const release = await verifyLabRelease(envelope, {...verification, now:clock()});
        if (!release || !acceptsLocalDataContract(release.localData)) return emit('rejected');
        if (compareVersions(release.bundleVersion, installed) <= 0) return emit('up-to-date');
        controller = createMainTrackLabUpdater({verification, updater, localWork, clock});
        return emit('available', null, release.bundleVersion);
      } catch {return emit('failed');}
      finally {running = false;}
    },
    async download() {
      if (running || !controller || !['available','blocked'].includes(state.phase)) return state;
      running = true; emit('downloading');
      try {
        const result = await controller.prepare(envelope);
        if (result.status === 'ready' || result.reason === 'LOCAL_WORK_AFTER_DOWNLOAD') return emit('ready', result.reason);
        return emit(result.status === 'deferred' ? 'blocked' : result.status === 'rejected' ? 'rejected' : 'failed', result.reason);
      } finally {running = false;}
    },
    activate() {
      if (running || state.phase !== 'ready') return Promise.resolve(state);
      running = true;
      // Keep the native controller call within the trusted click, before awaiting.
      const activation = controller.activate();
      return activation.then(result => {
        if (result.status === 'deferred') return emit('ready', result.reason);
        return emit(result.status === 'activating' ? 'activating'
          : result.status === 'recovery-required' ? 'recovery-required'
          : result.status === 'rejected' ? 'rejected' : 'ready', result.reason || (result.status === 'failed' ? 'NATIVE_REFUSED' : null));
      }).finally(() => {running = false;});
    }
  });
}
