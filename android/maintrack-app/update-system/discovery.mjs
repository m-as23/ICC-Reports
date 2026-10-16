// Metadata only: never downloads, activates, or waits on application startup.
export const DISCOVERY_INTERVAL = 30 * 60 * 1000;
export function createDiscovery({check, document = globalThis.document, events = globalThis,
  navigator = globalThis.navigator, clock = Date.now, schedule = setTimeout,
  cancel = clearTimeout, interval = DISCOVERY_INTERVAL}) {
  let last = -Infinity, running = null, stopped = false, timer;
  function inspect({manual = false} = {}) {
    if (stopped || document.visibilityState !== 'visible' || navigator.onLine === false) return Promise.resolve(null);
    if (running) return running;
    if (!manual && clock() - last < interval) return Promise.resolve(null);
    last = clock();
    running = Promise.resolve().then(() => check({manual})).catch(() => null).finally(() => {running = null;});
    return running;
  }
  const resume = () => {void inspect();};
  document.addEventListener('visibilitychange', resume);
  events.addEventListener('online', resume);
  events.addEventListener('focus', resume);
  timer = schedule(resume, 0);
  return Object.freeze({inspect, stop() {
    stopped = true; cancel(timer);
    document.removeEventListener('visibilitychange', resume);
    events.removeEventListener('online', resume); events.removeEventListener('focus', resume);
  }});
}
