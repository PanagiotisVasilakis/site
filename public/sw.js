/* basic offline-first service worker for Next.js static assets and pages */
// Version bump strategy: use package.json version if available (from version.json), else fallback CACHE_VERSION; bump package version to invalidate.
const CACHE_VERSION = self.__CACHE_VERSION || 'v4';
let RUNTIME_META = { version: CACHE_VERSION, pkgVersion: undefined, precacheHash: undefined };
let ACTIVE_CACHE_NAME = `guest-guide-${CACHE_VERSION}`; // updated after reading version.json
// Keep core shell + locale root + offline pages for all supported locales.
const CORE_ASSETS = [
  '/',
  '/en','/el',
  '/offline',
  '/en/offline','/el/offline',
  '/favicon.ico',
  '/app.webmanifest',
  // Key icons / imagery likely referenced above the fold (add more as needed)
  '/qr/site.png'
];
// Internal fetch helper to centralize internal route calls (for lint compliance)
function fetchInternal(input, init) { return fetch(input, init); }

// Cache validation helper to prevent serving corrupted responses
async function validateCachedResponse(response) {
  if (!response) return false;
  try {
    // Check if response is readable and has valid headers
    if (!response.ok && response.status !== 0) return false;
    
    // For HTML responses, verify basic structure integrity
    if (response.headers.get('content-type')?.includes('text/html')) {
      const clone = response.clone();
      const text = await clone.text();
      // Basic validation - should have opening tag and some content
      if (text.length < 10 || !text.includes('<')) return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// Cache storage management for quota exceeded scenarios
async function manageCacheStorage(cache) {
  try {
    const keys = await cache.keys();
    // Remove oldest 25% of cached items to free up space
    const keysToDelete = keys.slice(0, Math.floor(keys.length * 0.25));
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
  } catch {
    // If management fails, clear all cache as last resort
    try {
      const keys = await cache.keys();
      await Promise.all(keys.map(key => cache.delete(key)));
    } catch {}
  }
}

// Simple IndexedDB wrapper for queueing failed analytics POSTs
const DB_NAME = 'analytics-queue-db';
const STORE = 'queue';
function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueue(body) {
  try {
    const db = await openQueueDb();
    
    // Use a single transaction for atomic queue management
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    
    // Get current queue size within the same transaction
    const sizeRequest = store.count();
    const currentSize = await new Promise((resolve, reject) => {
      sizeRequest.onsuccess = () => resolve(sizeRequest.result);
      sizeRequest.onerror = () => reject(sizeRequest.error);
    });
    
    // If queue is full, remove oldest entries atomically
    if (currentSize >= 100) {
      console.warn('Analytics queue full, dropping oldest entries');
      
      // Get oldest entries to delete
      const deletePromises = [];
      const cursor = store.openCursor();
      
      await new Promise((resolve, reject) => {
        let deletedCount = 0;
        cursor.onsuccess = (e) => {
          const cur = e.target.result;
          if (cur && deletedCount < 10) {
            deletePromises.push(
              new Promise((delResolve, delReject) => {
                const deleteReq = store.delete(cur.primaryKey);
                deleteReq.onsuccess = () => delResolve();
                deleteReq.onerror = () => delReject(deleteReq.error);
              })
            );
            deletedCount++;
            cur.continue();
          } else {
            resolve();
          }
        };
        cursor.onerror = () => reject(cursor.error);
      });
      
      // Wait for all deletions to complete
      await Promise.all(deletePromises);
    }
    
    // Add new entry atomically
    await new Promise((resolve, reject) => {
      const req = store.add({ body, timestamp: Date.now() });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    
    // Ensure transaction completes
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    
    broadcastQueueSize();
  } catch (err) {
    console.error('Failed to enqueue analytics:', err);
  }
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
      // Send payloads individually to support servers that expect single-event POSTs.
      for (const body of payloads) {
        try {
          // body is stored as a JSON string
          await fetchInternal('/api/analytics', { method: 'POST', body, headers: { 'content-type': 'application/json' } });
        } catch {
          // Re-enqueue failed payload for next sync attempt
          try { await enqueue(body); } catch {}
        }
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
    try {
      const size = await getQueueSize();
      const clients = await self.clients.matchAll();
      for (const c of clients) c.postMessage({ type: 'ANALYTICS_QUEUE_SIZE', size });
    } catch {}
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
      // Prefer a smaller critical precache to reduce install cost. Fall back to full precache.
      let urls = [];
      try {
        const crit = await fetchInternal('/critical-precache.json', { cache: 'no-store' });
        if (crit.ok) urls = await crit.json();
      } catch {}
      if (!urls || urls.length === 0) {
        try {
          const res = await fetchInternal('/precache.json', { cache: 'no-store' });
          if (res.ok) urls = await res.json();
        } catch {}
      }
      // Add assets in parallel (best-effort) to speed up install; individual failures ignored.
      const allAssets = [...CORE_ASSETS, ...(Array.isArray(urls) ? urls : [])];
      await Promise.allSettled(allAssets.map(u => cache.add(u).catch(() => {})));
    } catch {
      await Promise.allSettled(CORE_ASSETS.map(u => cache.add(u).catch(() => {})));
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
        // Keep naming consistent with install: include precacheHash when present
        const suffix = data.precacheHash ? `${data.version}-${data.precacheHash.slice(0,8)}` : data.version || RUNTIME_META.version;
        if (data.version) ACTIVE_CACHE_NAME = `guest-guide-${suffix}`;
        // SECONDARY CLEANUP: now that ACTIVE_CACHE_NAME may have changed based on version.json,
        // remove any older caches not caught by initial pass.
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => (k === ACTIVE_CACHE_NAME ? null : caches.delete(k))));
        } catch {}
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
  // Pre-warm dynamic JSON endpoints so first offline visit still has basic data.
  event.waitUntil(prewarmData());
});

async function prewarmData() {
  try {
    const cache = await caches.open(ACTIVE_CACHE_NAME);
    const bust = RUNTIME_META.precacheHash || RUNTIME_META.version;
    const withBust = (url) => bust ? `${url}?v=${bust}` : url;
    // Helper: fetch with bust param but store under canonical URL (without param) for runtime matches.
    const fetchAndStore = async (canonicalUrl) => {
      try {
        const res = await fetchInternal(withBust(canonicalUrl), { cache: 'no-store' });
        if (res.ok) {
          const clone = res.clone();
          // Store response under canonical URL key
          cache.put(canonicalUrl, clone).catch(()=>{});
          return res;
        }
      } catch {}
      return null;
    };
    const catsRes = await fetchAndStore('/api/categories');
    if (!catsRes) return;
    let json = null;
    try { json = await catsRes.json(); } catch { return; }
    const cats = Array.isArray(json?.categories) ? json.categories : [];
    // Build a list of URLs to prewarm (bounded)
    const toPrewarm = [];
    for (const c of cats.slice(0,25)) { // safety cap
      if (!c?.id) continue;
      const listUrl = `/api/categories/${c.id}/items`;
      toPrewarm.push(listUrl);
    }
    // Helper to run limited concurrency
    async function runWithConcurrency(tasks, worker, concurrency = 5) {
      const results = [];
      let i = 0;
      const runOne = async () => {
        while (i < tasks.length) {
          const idx = i++;
          try { results[idx] = await worker(tasks[idx]); } catch { results[idx] = null; }
        }
      };
      const workers = new Array(Math.max(1, Math.min(concurrency, tasks.length))).fill(0).map(() => runOne());
      await Promise.all(workers);
      return results;
    }

    // First fetch lists with limited concurrency
    const listResults = await runWithConcurrency(toPrewarm, async (u) => await fetchAndStore(u), 5);
    // For each successful list, prewarm first 2 item details (also limited concurrently)
    const detailUrls = [];
    for (const lr of (listResults || [])) {
      if (!lr) continue;
      try {
        const listJson = await lr.clone().json();
        const items = Array.isArray(listJson?.items) ? listJson.items : [];
        for (const item of items.slice(0,2)) {
          if (!item?.slug) continue;
          detailUrls.push(`/api/categories/${item.categoryId ?? ''}/items/${item.slug}`.replace('//','/'));
        }
      } catch {}
    }
    // Run detail prewarm with the same concurrency cap
    await runWithConcurrency(detailUrls, async (u) => await fetchAndStore(u), 5);
  } catch {}
}

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
  // NOTE: Previously used undefined CACHE_NAME; intentionally using ACTIVE_CACHE_NAME.
  fetchInternal('/precache.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(async (urls) => {
  const cache = await caches.open(ACTIVE_CACHE_NAME);
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
  // NOTE: Previously used undefined CACHE_NAME; intentionally using ACTIVE_CACHE_NAME.
  event.waitUntil(fetchInternal('/precache.json', { cache: 'no-store' }).then(r => r.json()).then(async (urls) => {
  const cache = await caches.open(ACTIVE_CACHE_NAME);
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

  // Prefer network for dynamic data (JSON) routes; cache-first for static/page GETs
  if (request.method === 'GET') {
    // JSON / API data: stale-while-revalidate so previously fetched data is available offline.
    if (request.headers.get('accept')?.includes('application/json') || url.pathname.endsWith('.json')) {
      event.respondWith((async () => {
        const cache = await caches.open(ACTIVE_CACHE_NAME);
        const cached = await cache.match(request);
        // Broadcast simple metric about cache hit vs network for JSON.
        const report = (source) => {
          try { broadcastJsonMetric(url.pathname, source); } catch {}
        };
        if (cached) report('cache');
        const fetchPromise = fetchInternal(request).then(res => {
          if (res.ok) cache.put(request, res.clone()).catch(()=>{});
          if (!cached) report('network');
          return res;
        }).catch(() => cached || new Response('offline', { status: 503 }));
        // Return cached immediately if present for fast offline; else wait network
        return cached || fetchPromise;
      })());
      return;
    }
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
          // Only cache successful responses to avoid storing 404s/errors
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(ACTIVE_CACHE_NAME).then((c) => c.put(request, copy)).catch(()=>{});
          }
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
        
        // Validate cached response before serving
        const validCached = cached && await validateCachedResponse(cached) ? cached : null;
        
        const fetchPromise = fetchInternal(request).then(res => {
          if (res.ok) {
            cache.put(request, res.clone()).catch(async (err) => {
              // Handle storage quota exceeded
              if (err.name === 'QuotaExceededError') {
                await manageCacheStorage(cache);
                // Retry cache operation after cleanup
                cache.put(request, res.clone()).catch(() => {});
              }
            });
          }
          return res;
        }).catch(() => validCached || Promise.reject('offline'));
        return validCached || fetchPromise;
      })());
      return;
    }
    // Other static assets (Next chunks, css/js): cache-first with populate
    if (url.pathname.startsWith('/_next') || url.pathname.match(/\.(css|js|ico)$/)) {
      event.respondWith(
        caches.match(request).then(async (cached) => {
          const validCached = cached && await validateCachedResponse(cached) ? cached : null;
          return validCached || fetchInternal(request).then(async (res) => {
            if (res.ok) {
              try {
                const cache = await caches.open(ACTIVE_CACHE_NAME);
                await cache.put(request, res.clone());
              } catch (err) {
                if (err.name === 'QuotaExceededError') {
                  const cache = await caches.open(ACTIVE_CACHE_NAME);
                  await manageCacheStorage(cache);
                  try {
                    await cache.put(request, res.clone());
                  } catch {}
                }
              }
            }
            return res;
          });
        })
      );
      return;
    }
  }
});

// JSON fetch metric broadcasting (dev/diagnostic; time-based throttled)
let __jsonMetricSent = 0;
let __jsonMetricResetTime = Date.now();
async function broadcastJsonMetric(path, source) {
  const now = Date.now();
  // Reset counter every 60 seconds
  if (now - __jsonMetricResetTime > 60000) {
    __jsonMetricSent = 0;
    __jsonMetricResetTime = now;
  }
  
  if (__jsonMetricSent > 50) return; // throttle to avoid noise
  __jsonMetricSent++;
  try {
    const clients = await self.clients.matchAll();
    for (const c of clients) c.postMessage({ type: 'SW_JSON_FETCH', path, source });
  } catch {}
}

// Background sync event flush with concurrency protection
let syncInProgress = false;
self.addEventListener('sync', (event) => {
  // @ts-expect-error Background Sync event tag not typed
  if (event.tag === 'analytics-sync') {
    // @ts-expect-error waitUntil typed generically
    event.waitUntil((async () => {
      if (syncInProgress) return; // Prevent concurrent sync operations
      syncInProgress = true;
      try {
        await flushQueue();
      } finally {
        syncInProgress = false;
      }
    })());
  }
});
