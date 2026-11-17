/* Service worker: cache shell aplikasi agar bisa dipasang & dibuka cepat.
   API (/api) TIDAK pernah di-cache — data pribadi tidak boleh tersimpan di cache. */
const VERSION = 'vcs-v1';
const SHELL = ['/', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    // halaman: jaringan dulu, jatuh ke shell saat offline
    e.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }
  // aset ber-hash: stale-while-revalidate
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req);
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
// Web Push: tampilkan notifikasi (butuh VAPID di server — belum diaktifkan, lihat docs)
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(d.title || 'Vehicle Contact System', { body: d.body || '', icon: '/icons/icon-192.png', tag: d.tag, data: { url: d.url || '/app' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(e.notification.data?.url || '/app'));
});
