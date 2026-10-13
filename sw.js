// App shell: serve cached UI instantly when available, then refresh it in background.
// Never cache Apps Script API responses, auth tokens, or user-specific data.
const CACHE = 'maintrack-v9-stability';
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'bd-192.png', 'bd-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('maintrack-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const r=event.request;
  if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(u.origin!==self.location.origin)return;
  const allowed=new Set(ASSETS.map(a=>new URL(a,self.registration.scope).pathname));
  if(!allowed.has(u.pathname)||u.search) return;
  event.respondWith(caches.match(r).then(cached=>{
    const network=fetch(r).then(res=>{
      if(res.ok && res.type==='basic')caches.open(CACHE).then(c=>c.put(r,res.clone()));
      return res;
    }).catch(()=>cached||Response.error());
    return cached||network;
  }));
});
