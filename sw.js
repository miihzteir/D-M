/* D&M: deixa o app instalável e recebe as notificações. Sempre busca a versão nova na internet; sem internet, usa a última guardada. */
const CACHE = 'dm-v3';
try{
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp({apiKey:'AIzaSyCJfh8vBafbuDSa4f1coZNHWQgRUJfgvgc', authDomain:'d-e-m-db466.firebaseapp.com', projectId:'d-e-m-db466', storageBucket:'d-e-m-db466.firebasestorage.app', messagingSenderId:'560661900030', appId:'1:560661900030:web:6fd16de3afc9a212e813af'});
  firebase.messaging();
}catch(e){}
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if(r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r, {cache:'no-store'}).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)).catch(() => {}); return res; }).catch(() => caches.match(r, {ignoreSearch:true})));
});
/* tocar na notificação abre o app (as que vêm do servidor o Firebase já abre sozinho) */
self.addEventListener('notificationclick', e => {
  const d = e.notification.data || {};
  if(d.FCM_MSG) return;
  e.notification.close();
  const url = d.url || self.registration.scope;
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(l => { const c = l.find(x => x.url.startsWith(self.registration.scope)); if(c){ c.focus(); return c.navigate ? c.navigate(url).catch(() => {}) : null; } return self.clients.openWindow(url); }));
});
