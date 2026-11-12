'use strict';
(() => {
 const panel = document.getElementById('drivefault-view');
 const tabs = document.getElementById('tabs');
 const inventoryTab = document.getElementById('tabInventory');
 if (!panel || !tabs || inventoryTab?.parentElement !== tabs) return;

 const title = 'أعطال الدرايفات';
 const button = document.createElement('button');
 button.id = 'tabDriveFault';
 button.type = 'button';
 button.textContent = title;
 const svgNamespace = 'http://www.w3.org/2000/svg';
 const icon = document.createElementNS(svgNamespace, 'svg');
 icon.setAttribute('viewBox', '0 0 24 24');
 icon.setAttribute('aria-hidden', 'true');
 icon.classList.add('v6Icon');
 const outline = document.createElementNS(svgNamespace, 'path');
 outline.setAttribute('d', 'M12 3 22 20H2L12 3ZM12 9v5m0 3h.01');
 icon.append(outline);
 button.prepend(icon);
 button.hidden = true;
 button.setAttribute('aria-controls', panel.id);
 tabs.insertBefore(button, inventoryTab);
 let sessionToken;
 let allowed = false;
 let currentView;

 async function request(action, data) {
  if (!['context', 'versions', 'download'].includes(action)) throw Error('Read only');
  const token = typeof S !== 'undefined' && S?.token;
  if (!token) throw Error('MainTrack session required');
  const response = await fetch('/drivefault-api/' + action, {
   method: 'POST',
   headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token},
   body: JSON.stringify(data)
  });
  if (S?.token !== token) throw Error('Session changed');
  if (!response.ok) {
   const error = Error('DriveFault request denied (' + response.status + ')');
   error.status = response.status;
   throw error;
  }
  return response.json();
 }

 async function onView(view, logged) {
  currentView = view;
  const token = logged && typeof S !== 'undefined' ? S?.token : undefined;
  if (token !== sessionToken) {
   sessionToken = token;
   allowed = false;
   button.hidden = true;
   panel.hidden = true;
   panel.replaceChildren();
   if (token) {
    try {
     const context = await request('context', {library: 10});
     if (sessionToken === token && ['owner', 'engineer', 'technician'].includes(context.role)) {
      allowed = true;
      button.hidden = false;
     }
    } catch { /* A missing or disabled feature leaves the tab unavailable. */ }
   }
  }
  panel.hidden = currentView !== 'drivefault' || !allowed;
  button.classList.toggle('active', !panel.hidden);
  if (!panel.hidden && !panel.firstChild) {
   const frame = document.createElement('iframe');
   frame.id = 'drivefault-module';
   frame.title = title;
   frame.style.cssText = 'display:block;width:100%;height:75vh;border:0';
   frame.src = 'drivefault/index.html';
   panel.append(frame);
  }
 }

 window.MainTrackDriveFaultHost = Object.freeze({
  context() {
   if (typeof S === 'undefined' || !S?.token) throw Error('MainTrack session required');
   return S.code + ':drivefault:library10';
  },
  request,
  onView
 });
 button.onclick = () => {
  if (!allowed || S?.token !== sessionToken) return;
  document.body.classList.remove('v6Drawer');
  if (typeof show === 'function') show('drivefault');
  else void onView('drivefault', true);
 };
 void onView('initial', typeof S !== 'undefined' && !!S?.token);
})();
