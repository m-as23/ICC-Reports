'use strict';
const previousCacheNames=['drivefault-v1-simple-search-shell','drivefault-v2-simple-search-shell'];
const cacheName='drivefault-v3-simple-search-shell';
const paths=['/drivefault/index.html','/drivefault/module.js','/drivefault/engine.js','/drivefault/simple-search.css'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(cacheName);await cache.addAll(paths.map(path=>new Request(new URL(path,self.location.origin),{cache:'reload'})));await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of previousCacheNames)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==location.origin||!paths.includes(url.pathname))return;
 event.respondWith(fetch(event.request).catch(async()=>await (await caches.open(cacheName)).match(url.pathname)||Response.error()));
});
