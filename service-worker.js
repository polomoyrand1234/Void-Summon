const CACHE='void-summon-v3-5-cache-v1';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>self.clients.claim());
self.addEventListener('fetch',event=>{event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));});
