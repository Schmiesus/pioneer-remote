// Increment this every deploy to force cache bust
const CACHE = 'pioneer-v4';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Nuke every old cache version
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-only — no caching at all. PWA install still works, but always fetches fresh.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return;
  // Just pass through to network, no cache
  e.respondWith(fetch(e.request));
});
