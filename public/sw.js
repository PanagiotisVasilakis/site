/* basic offline-first service worker for Next.js static assets and pages */
const CACHE_NAME = 'guest-guide-v2';
const CORE_ASSETS = [
  '/',
  '/en',
  '/el',
  '/offline',
  '/en/offline',
  '/el/offline',
  '/favicon.ico',
  '/app.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const res = await fetch('/precache.json', { cache: 'no-store' });
      if (res.ok) {
        const urls = await res.json();
        await cache.addAll([...CORE_ASSETS, ...urls]);
      } else {
        await cache.addAll(CORE_ASSETS);
      }
    } catch {
      await cache.addAll(CORE_ASSETS);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))).then(() => self.clients.claim())
  );
});

// Allow clients to request immediate activation of the new SW
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING' && self.skipWaiting) {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Prefer network for dynamic data routes; cache-first for static/page GETs
  if (request.method === 'GET') {
    // HTML navigation requests: offline-first but revalidate in background
    if (request.headers.get('accept')?.includes('text/html')) {
      event.respondWith((async () => {
        const cached = await caches.match(request);
        if (cached) {
          // Revalidate in background
          fetch(request).then((res) => caches.open(CACHE_NAME).then((c) => c.put(request, res))).catch(() => {});
          return cached;
        }
        try {
          const res = await fetch(request);
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return res;
        } catch {
          // Fallback to locale-aware offline page if possible
          const localePath = url.pathname.split('/')[1];
          const offline = await caches.match(`/${localePath}/offline`) || await caches.match('/offline');
          return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })());
      return;
    }

    // Static assets from Next (/_next) and public/
    if (url.pathname.startsWith('/_next') || url.pathname.startsWith('/public') || url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|css|js)$/)) {
      event.respondWith(
        caches.match(request).then((cached) => cached || fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return res;
        }))
      );
      return;
    }
  }
});
