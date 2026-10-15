/* D&M: deixa o app instalável. Sempre busca a versão nova na internet; sem internet, usa a última guardada. */
const CACHE = 'dm-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if(r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)).catch(() => {}); return res; }).catch(() => caches.match(r, {ignoreSearch:true})));
});
