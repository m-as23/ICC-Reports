import {createDiscovery} from './discovery.mjs';
import {createWebSession} from './web-session.mjs';
const config = __MAINTRACK_WEB_CONFIG__;
if (!globalThis.Capacitor?.isNativePlatform?.()) {
  const bar = document.createElement('aside');
  bar.id = 'maintrack-web-update'; bar.dir = 'rtl'; bar.hidden = true;
  const status = document.createElement('span'); status.setAttribute('role','status'); status.hidden = true;
  const check = document.createElement('button'); check.type = 'button'; check.textContent = 'التحقق من التحديث';
  const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = 'تحديث متاح'; apply.hidden = true;
  bar.append(status, apply); document.body.append(bar);
  // Check automatically on launch/foreground and each 30-minute interval; no manual profile button.
  const session = createWebSession({origin:location.origin, currentCommit:config.commit,
    localWork:globalThis.MainTrackLocalWork,
    fetchRelease:async () => {
      // The preview's Vercel access cookie is needed even though this metadata
      // contains no application credentials. Never send it cross-origin.
      const r = await fetch('/maintrack-release.json', {cache:'no-store', credentials:'same-origin', redirect:'error', signal:AbortSignal.timeout(5000)});
      if (!r.ok || !r.headers.get('content-type')?.includes('application/json')) throw Error('RELEASE_UNAVAILABLE');
      const reader = r.body.getReader(); let bytes = 0, chunks = [];
      try {for (;;) {const {done,value} = await reader.read(); if(done) break; bytes += value.length; if(bytes > 8192) throw Error('RELEASE_TOO_LARGE'); chunks.push(value);}}
      finally {await reader.cancel();}
      const data = new Uint8Array(bytes); let offset = 0;
      for(const chunk of chunks) {data.set(chunk,offset); offset += chunk.length;}
      return JSON.parse(new TextDecoder().decode(data));
    }, navigate:url => {const target = new URL(url); target.search = location.search; target.hash = location.hash; location.assign(target.href);}
  });
  let checking = false;
  let messageTimer;
  function notify(message) {
    clearTimeout(messageTimer);
    bar.hidden = false; status.textContent = message; status.hidden = false;
    messageTimer = setTimeout(() => {status.hidden = true; status.textContent = ''; bar.hidden = apply.hidden;}, 5000);
  }
  async function inspect({manual = false} = {}) {
    if(checking || document.visibilityState !== 'visible') return;
    if(!navigator.onLine) {if(manual) notify('لا يوجد اتصال بالإنترنت. حاول عند عودة الاتصال.'); return;}
    checking = true; check.disabled = true;
    try {const next = await session.check(); apply.hidden = !next; bar.hidden = !next; if(manual) notify(next ? 'تحديث جديد متاح — احفظ شغلك ثم طبّقه.' : 'أنت على الإصدار الحالي.');}
    catch {apply.hidden = true; bar.hidden = true; if(manual) notify('تعذر التحقق من التحديث. يمكنك متابعة العمل.');}
    finally {checking = false; check.disabled = false;}
  }
  const discovery = createDiscovery({check:inspect});
  check.onclick = () => discovery.inspect({manual:true});
  apply.onclick = () => {session.activate().catch(() => {notify('تعذر تطبيق التحديث. احفظ التعديلات وانتظر اكتمال الإرسال ثم حاول مجددًا.');});};
}
