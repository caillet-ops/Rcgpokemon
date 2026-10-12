const VERSION = 'v4';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
const CDN = ['cdn.jsdelivr.net', 'images.pokemontcg.io', 'tessdata.projectnaptha.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// App: rede primeiro (sempre pega a versão nova), cache se estiver offline.
// CDNs e imagens de cartas: cache primeiro. API de dados: direto na rede.
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  const same = u.origin === location.origin;
  if (!same && !CDN.includes(u.hostname)) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const store = res => { if (res.ok || res.type === 'opaque') cache.put(r, res.clone()); return res; };
    if (same) return fetch(r).then(store).catch(async () => (await cache.match(r, { ignoreSearch: true })) || Response.error());
    return (await cache.match(r)) || fetch(r).then(store);
  }));
});
