const VERSION = 'v3';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
const CDN = ['cdn.jsdelivr.net', 'images.pokemontcg.io', 'tessdata.projectnaptha.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// App e CDNs: devolve do cache e atualiza em segundo plano. API de dados: direto na rede.
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || !(u.origin === location.origin || CDN.includes(u.hostname))) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(r, { ignoreSearch: u.origin === location.origin });
    const net = fetch(r).then(res => { if (res.ok || res.type === 'opaque') cache.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
