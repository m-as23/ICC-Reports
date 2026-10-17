// Metadata only: never downloads, activates, or waits on application startup.
// A bounded check runs on start and periodically only while foreground and online.
export const DISCOVERY_INTERVAL = 5 * 60 * 1000;
export function createDiscovery({check, document = globalThis.document, events = globalThis,
  navigator = globalThis.navigator, clock = Date.now, schedule = setTimeout,
  cancel = clearTimeout, interval = DISCOVERY_INTERVAL}) {
  let last = -Infinity, running = null, stopped = false, timer;
  const active = () => !stopped && document.visibilityState === 'visible' && navigator.onLine !== false;
  // Re-arm using remaining time; foreground focus storms must not multiply requests.
  function scheduleNext(delay) {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    if (active()) timer = schedule(() => {timer = undefined; void inspect();}, Math.max(0, Math.min(interval, delay)));
  }
  function inspect({manual = false} = {}) {
    if (!active()) return Promise.resolve(null);
    if (running) return running;
    if (!manual && clock() - last < interval) {
      scheduleNext(interval - (clock() - last));
      return Promise.resolve(null);
    }
    last = clock();
    running = Promise.resolve().then(() => check({manual})).catch(() => null).finally(() => {
      running = null;
      if (active()) scheduleNext(interval - (clock() - last));
    });
    return running;
  }
  const resume = () => {
    if (!active()) {
      if (timer !== undefined) cancel(timer);
      timer = undefined;
      return;
    }
    void inspect();
  };
  document.addEventListener('visibilitychange', resume);
  events.addEventListener('online', resume);
  events.addEventListener('focus', resume);
  timer = schedule(() => {timer = undefined; resume();}, 0);
  return Object.freeze({inspect, stop() {
    stopped = true;
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    document.removeEventListener('visibilitychange', resume);
    events.removeEventListener('online', resume);
    events.removeEventListener('focus', resume);
  }});
}
