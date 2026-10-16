import {createWebSession} from './web-session.mjs';
const config = __MAINTRACK_WEB_CONFIG__;
if (!globalThis.Capacitor?.isNativePlatform?.()) {
  const bar = document.createElement('aside');
  bar.id = 'maintrack-web-update'; bar.dir = 'rtl';
  const status = document.createElement('span'); status.setAttribute('role','status');
  const check = document.createElement('button'); check.type = 'button'; check.textContent = 'التحقق من التحديث';
  const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = 'تطبيق التحديث'; apply.hidden = true;
  bar.append(status, check, apply); document.body.append(bar);
  const session = createWebSession({origin:location.origin, currentCommit:config.commit,
    localWork:globalThis.MainTrackLocalWork,
    fetchRelease:async () => {
      const r = await fetch('/maintrack-release.json', {cache:'no-store', credentials:'omit', redirect:'error', signal:AbortSignal.timeout(5000)});
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
  async function inspect() {
    if(checking || document.visibilityState !== 'visible' || !navigator.onLine) return;
    checking = true; check.disabled = true;
    try {const next = await session.check(); apply.hidden = !next; status.textContent = next ? 'تحديث جديد متاح — احفظ شغلك ثم طبّقه.' : 'أنت على الإصدار الحالي.';}
    catch {apply.hidden = true; status.textContent = 'تعذر التحقق من التحديث. يمكنك متابعة العمل.';}
    finally {checking = false; check.disabled = false;}
  }
  check.onclick = inspect;
  apply.onclick = () => {session.activate().catch(() => {status.textContent = 'تعذر تطبيق التحديث. احفظ التعديلات وانتظر اكتمال الإرسال ثم حاول مجددًا.';});};
  setInterval(inspect, 5 * 60000);
  document.addEventListener('visibilitychange', inspect);
  addEventListener('online', inspect);
  inspect();
}
