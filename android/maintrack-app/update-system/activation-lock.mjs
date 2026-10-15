// Explicit maintenance interval; no persistent lock and no storage writes.
// Keep it held after native set(): the old JavaScript context may never resume.
export function createActivationLock({document, navigator}) {
  let held = false;
  return Object.freeze({
    isHeld: () => held,
    acquire() {
      if (held || document.visibilityState !== 'visible' || navigator.userActivation?.isActive !== true) return null;
      held = true;
      let interrupted = false;
      const active = document.activeElement;
      const original = new Map();
      const overlay = document.createElement('div');
      overlay.id = 'maintrack-update-progress';
      overlay.setAttribute('role', 'status'); overlay.setAttribute('aria-live', 'polite');
      overlay.dir = 'rtl'; overlay.textContent = 'جارٍ تطبيق التحديث…';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#071521;color:white;font:600 20px sans-serif;padding:24px;text-align:center';
      const freeze = () => {
        for (const element of document.body.children) if (element !== overlay && !original.has(element)) {
          original.set(element, element.inert); element.inert = true;
        }
      };
      const stop = event => {event.preventDefault(); event.stopImmediatePropagation();};
      const events = ['click','pointerdown','keydown','beforeinput','input','change','submit'];
      for (const event of events) document.addEventListener(event, stop, true);
      const visibility = () => {if (document.visibilityState !== 'visible') interrupted = true;};
      document.addEventListener('visibilitychange', visibility);
      document.body.append(overlay); freeze();
      const observer = new MutationObserver(freeze);
      observer.observe(document.body, {childList:true});
      return Object.freeze({
        isHeld: () => held && !interrupted && document.visibilityState === 'visible',
        recovery() {overlay.textContent = 'تعذر تأكيد اكتمال التحديث. أغلق التطبيق وافتحه من جديد.';},
        release() {
          if (!held) return;
          held = false; observer.disconnect();
          for (const event of events) document.removeEventListener(event, stop, true);
          document.removeEventListener('visibilitychange', visibility);
          for (const [element, inert] of original) element.inert = inert;
          overlay.remove(); active?.focus?.();
        }
      });
    }
  });
}
