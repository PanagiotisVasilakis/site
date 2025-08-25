/* basic offline-first service worker for Next.js static assets and pages */
// Version bump strategy: use package.json version if available (from version.json), else fallback CACHE_VERSION; bump package version to invalidate.
const CACHE_VERSION = self.__CACHE_VERSION || 'v4';
let RUNTIME_META = { version: CACHE_VERSION, pkgVersion: undefined, precacheHash: undefined };
let ACTIVE_CACHE_NAME = `guest-guide-${CACHE_VERSION}`; // updated after reading version.json
// Keep core shell + locale offline pages for all supported locales.
const CORE_ASSETS = [
  '/',
  '/en','/el',
  '/offline',
  '/en/offline','/el/offline',
  '/favicon.ico',
  '/app.webmanifest',
  // Key icons / imagery likely referenced above the fold (add more as needed)
  '/globe.svg','/window.svg','/file.svg'
  // Curated hero / brand images (add if present; harmless if 404 skipped)
  // Add any critical above-the-fold images you want guaranteed offline
  ,'/next.svg','/vercel.svg','/qr/site.png'
];
// Internal fetch helper to centralize internal route calls (for lint compliance)
function fetchInternal(input, init) { return fetch(input, init); }

// Simple IndexedDB wrapper for queueing failed analytics POSTs
const DB_NAME = 'analytics-queue-db';
const STORE = 'queue';
function openQueueDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function flushQueue() {
  try {
    const db = await openQueueDb();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
  const payloads = [];
    await new Promise((resolve) => {
      store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          payloads.push(cursor.value.body);
          store.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
    if (payloads.length) {
      try {
        const merged = payloads.map(p => { try { return JSON.parse(p); } catch { return null; } }).filter(Boolean);
        await fetchInternal('/api/analytics', { method: 'POST', body: JSON.stringify(merged), headers: { 'content-type': 'application/json' } });
      } catch {
        for (const body of payloads) enqueue(body);
        return;
      }
    }
    broadcastQueueSize();
  } catch {}
}

async function getQueueSize() {
  try {
    const db = await openQueueDb();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    return await new Promise((resolve) => {
      let count = 0;
      store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { count++; cursor.continue(); } else resolve(count); };
    });
  } catch { return 0; }
}
let bqsTimer = null;
function broadcastQueueSize() {
  if (bqsTimer) return; // debounce within 500ms window
  bqsTimer = setTimeout(async () => {
    bqsTimer = null;
    const size = await getQueueSize();
    const clients = await self.clients.matchAll();
    for (const c of clients) c.postMessage({ type: 'ANALYTICS_QUEUE_SIZE', size });
  }, 500);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Attempt to fetch version metadata first to derive cache name
    try {
      const vRes = await fetchInternal('/version.json', { cache: 'no-store' });
      if (vRes.ok) {
        const meta = await vRes.json();
        if (meta?.version) {
          RUNTIME_META.pkgVersion = meta.version;
          RUNTIME_META.precacheHash = meta.precacheHash;
          if (!RUNTIME_META.version || RUNTIME_META.version === CACHE_VERSION) RUNTIME_META.version = meta.version;
          const suffix = meta.precacheHash ? `${meta.version}-${meta.precacheHash.slice(0,8)}` : meta.version;
          ACTIVE_CACHE_NAME = `guest-guide-${suffix}`;
        }
      }
    } catch {}
  const cache = await caches.open(ACTIVE_CACHE_NAME);
    try {
      const res = await fetchInternal('/precache.json', { cache: 'no-store' });
      if (res.ok) {
        const urls = await res.json();
        // Add assets individually to tolerate 404s (hero images optional)
        for (const u of [...CORE_ASSETS, ...urls]) {
          try { await cache.add(u); } catch { /* ignore missing */ }
        }
      } else {
        for (const u of CORE_ASSETS) { try { await cache.add(u); } catch {} }
      }
    } catch {
      for (const u of CORE_ASSETS) { try { await cache.add(u); } catch {} }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => (k === ACTIVE_CACHE_NAME ? null : caches.delete(k))))).then(() => self.clients.claim())
  );
  // Fetch runtime version metadata (non-fatal if missing)
  event.waitUntil((async () => {
    try {
      const res = await fetchInternal('/version.json', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        RUNTIME_META = { ...RUNTIME_META, ...data, version: data.version || RUNTIME_META.version };
        if (data.version) ACTIVE_CACHE_NAME = `guest-guide-${data.version}`;
      }
    } catch {}
    // Broadcast version info to all clients so UI can display it
    try {
      const clients = await self.clients.matchAll();
      for (const c of clients) c.postMessage({ type: 'RUNTIME_VERSION', meta: RUNTIME_META, cache: ACTIVE_CACHE_NAME });
    } catch {}
  })());
  // Try to register periodic sync for precache refresh
  event.waitUntil((async () => {
    if ('periodicSync' in registration) {
      try {
    // @ts-expect-error periodicSync not yet in TS lib
        await registration.periodicSync.register('precache-refresh', { minInterval: 24 * 60 * 60 * 1000 });
      } catch {}
    }
  })());
});

// Allow clients to request immediate activation of the new SW
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING' && self.skipWaiting) {
    self.skipWaiting();
  }
  if (event.data.type === 'REQUEST_VERSION') {
    // Respond directly to requesting client only
    event.source?.postMessage({ type: 'RUNTIME_VERSION', meta: RUNTIME_META, cache: ACTIVE_CACHE_NAME });
  }
  if (event.data.type === 'BG_SYNC_TRIGGER') {
    // Placeholder: attempt to refetch precache manifest
  fetchInternal('/precache.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(async (urls) => {
      const cache = await caches.open(CACHE_NAME);
      if (Array.isArray(urls)) {
        for (const u of urls) cache.add(u).catch(()=>{});
      }
    }).catch(()=>{});
  }
  if (event.data.type === 'QUEUE_ANALYTICS' && event.data.body) {
    enqueue(event.data.body).then(() => {
      broadcastQueueSize();
      if ('sync' in registration) {
    // @ts-expect-error Background Sync type missing
        registration.sync.register('analytics-sync').catch(()=>{});
      } else {
        flushQueue();
      }
    });
  }
  if (event.data.type === 'REPLAY_ANALYTICS') {
    flushQueue();
  }
});

// Periodic sync event
self.addEventListener('periodicsync', (event) => {
  // @ts-expect-error periodicSync event tag not typed
  if (event.tag === 'precache-refresh') {
    // @ts-expect-error waitUntil overload not typed for periodic sync event
  event.waitUntil(fetchInternal('/precache.json', { cache: 'no-store' }).then(r => r.json()).then(async (urls) => {
      const cache = await caches.open(CACHE_NAME);
      for (const u of urls) cache.add(u).catch(()=>{});
    }).catch(()=>{}));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Intercept analytics POST for offline queueing
  if (request.method === 'POST' && url.pathname === '/api/analytics') {
    event.respondWith((async () => {
      try {
        return await fetch(request.clone());
      } catch {
        const body = await request.clone().text();
        await enqueue(body);
        if ('sync' in registration) {
          // @ts-expect-error Background Sync type missing
          registration.sync.register('analytics-sync').catch(()=>{});
        }
        return new Response('queued', { status: 202 });
      }
    })());
    return;
  }

  // Prefer network for dynamic data routes; cache-first for static/page GETs
  if (request.method === 'GET') {
    // HTML navigation requests: offline-first but revalidate in background
    if (request.headers.get('accept')?.includes('text/html')) {
      event.respondWith((async () => {
        const cached = await caches.match(request);
        if (cached) {
          // Revalidate in background
          fetchInternal(request).then((res) => caches.open(ACTIVE_CACHE_NAME).then((c) => c.put(request, res))).catch(() => {});
          return cached;
        }
        try {
          const res = await fetch(request);
          const copy = res.clone();
          caches.open(ACTIVE_CACHE_NAME).then((c) => c.put(request, copy));
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

    // Runtime image requests: stale-while-revalidate for fast display + silent freshness
    if (url.pathname.match(/\.(png|jpg|jpeg|svg|webp|avif)$/)) {
      event.respondWith((async () => {
        const cache = await caches.open(ACTIVE_CACHE_NAME);
        const cached = await cache.match(request);
        const fetchPromise = fetchInternal(request).then(res => {
          if (res.ok) cache.put(request, res.clone()).catch(()=>{});
          return res;
        }).catch(() => cached || Promise.reject('offline'));
        return cached || fetchPromise;
      })());
      return;
    }
    // Other static assets (Next chunks, css/js): cache-first with populate
    if (url.pathname.startsWith('/_next') || url.pathname.match(/\.(css|js|ico)$/)) {
      event.respondWith(
        caches.match(request).then((cached) => cached || fetchInternal(request).then((res) => {
          if (res.ok) caches.open(ACTIVE_CACHE_NAME).then((c) => c.put(request, res.clone()));
          return res;
        }))
      );
      return;
    }
  }
});

// Background sync event flush
self.addEventListener('sync', (event) => {
  // @ts-expect-error Background Sync event tag not typed
  if (event.tag === 'analytics-sync') {
    // @ts-expect-error waitUntil typed generically
    event.waitUntil(flushQueue());
  }
});
