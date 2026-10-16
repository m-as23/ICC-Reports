import {createDiscovery} from './discovery.mjs';
import {createPilotSession} from './pilot-session.mjs';

export function mountPilotPanel({document = globalThis.document, autoDiscover = true, events = globalThis, navigator = globalThis.navigator, ...options}) {
  if (document.getElementById('mt-pilot-updates')) throw Error('PILOT_PANEL_ALREADY_MOUNTED');
  const root = document.createElement('section'); root.id = 'mt-pilot-updates'; root.dir = 'rtl';
  const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet';
  stylesheet.href = 'secure-assets/stage15-pilot-update.css'; document.head.append(stylesheet);
  const button = (id, label, parent = root) => {
    const element = document.createElement('button'); element.type = 'button'; element.id = id;
    element.textContent = label; parent.append(element); return element;
  };
  const open = button('mt-pilot-open', 'تحديث متاح'); open.hidden = autoDiscover;
  open.setAttribute('aria-controls', 'mt-pilot-dialog'); open.setAttribute('aria-expanded', 'false');
  const dialog = document.createElement('div'); dialog.id = 'mt-pilot-dialog'; dialog.hidden = true;
  dialog.setAttribute('role', 'region'); dialog.setAttribute('aria-labelledby', 'mt-pilot-title'); root.append(dialog);
  const title = document.createElement('h2'); title.id = 'mt-pilot-title'; title.textContent = 'تحديث MainTrack'; dialog.append(title);
  const text = document.createElement('p'); text.id = 'mt-pilot-status'; text.setAttribute('role', 'status'); text.setAttribute('aria-live', 'polite'); dialog.append(text);
  const actions = document.createElement('div'); actions.id = 'mt-pilot-actions'; dialog.append(actions);
  const check = button('mt-pilot-check', 'التحقق من تحديث', actions);
  const download = button('mt-pilot-download', 'تنزيل التحديث', actions);
  const activate = button('mt-pilot-activate', 'تفعيل وإعادة فتح التطبيق', actions);
  const close = button('mt-pilot-close', 'إغلاق', actions);
  const messages = {
    idle:'يمكنك التحقق من وجود تحديث. احفظ شغلك قبل تفعيله.', checking:'جارٍ التحقق من تحديث موثوق…',
    available:'يوجد تحديث متاح. يمكنك تنزيله الآن وتفعيله لاحقًا.', downloading:'جارٍ تنزيل التحديث…',
    ready:'التحديث جاهز. احفظ شغلك ثم اضغط تفعيل؛ سيُعاد فتح التطبيق.',
    blocked:'التحديث مؤجل. احفظ التعديلات وانتظر إرسال البلاغات وانتهاء الطلبات، ثم أعد المحاولة.',
    rejected:'تعذّر التحقق من أمان هذا التحديث أو توافقه. يمكنك الاستمرار في استخدام التطبيق.',
    failed:'تعذّر التحقق أو التنزيل الآن. يمكنك الاستمرار والمحاولة لاحقًا.',
    'up-to-date':'لا يوجد إصدار أحدث متوافق مع هذه النسخة.', activating:'جارٍ تفعيل التحديث…',
    'recovery-required':'أغلق التطبيق وافتحه مجددًا لاستكمال التحقق من الإصدار.'
  };
  let manualCheck = false;
  const render = state => {
    if (autoDiscover) open.hidden = !['available','blocked','downloading','ready','activating','recovery-required'].includes(state.phase);
    if (manualCheck && state.phase !== 'checking') {dialog.hidden = false; manualCheck = false;}
    const busy = ['checking','downloading','activating','recovery-required'].includes(state.phase);
    text.textContent = (state.phase === 'ready' && state.reason ? messages.blocked : messages[state.phase])
      + (state.installedVersion ? ' الإصدار الحالي: ' + state.installedVersion + '.' : '')
      + (state.version ? ' التحديث المتاح: ' + state.version : '');
    check.disabled = busy; download.disabled = busy; activate.disabled = busy;
    download.hidden = !['available','blocked'].includes(state.phase);
    activate.hidden = state.phase !== 'ready';
    close.disabled = ['activating','recovery-required'].includes(state.phase);
  };
  const session = createPilotSession({...options, onChange:render});
  const discovery = autoDiscover ? createDiscovery({check:() => session.check(), document, events, navigator}) : null;
  check.onclick = () => {manualCheck = true; return discovery ? discovery.inspect({manual:true}) : session.check();};
  if (autoDiscover) {
    const settings = document.getElementById('profile');
    if (settings) {const manual = button('mt-update-manual', 'التحقق من التحديث', settings); manual.className = 'btn'; manual.onclick = check.onclick;}
  } download.onclick = () => session.download();
  activate.onclick = () => session.activate();
  open.onclick = () => {dialog.hidden = false; open.setAttribute('aria-expanded','true'); check.focus();};
  close.onclick = () => {dialog.hidden = true; open.setAttribute('aria-expanded','false'); open.focus();};
  document.body.append(root); render(session.read());
  return Object.freeze({read:session.read});
}
