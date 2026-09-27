/* Minimal service worker: offline fallback pages, immutable build assets and images.
 *
 * HTML is network-first. Nothing is precached except the offline pages and
 * icons, so a redirect (e.g. `/` → `/en`) is never replayed from the cache and
 * online visitors always get the current deploy. Visited public pages are kept
 * for offline reading. PwaManager registers `/sw.js?v=<version>&build=<build>`
 * from /version.json, so every build installs a new worker and a new cache.
 */
const params = new URL(self.location.href).searchParams;
const VERSION = params.get('v') || '0.0.0';
const BUILD = params.get('build') || 'unversioned';
const CACHE_PREFIX = 'guest-guide-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD}`;

const OFFLINE_ASSETS = [
  '/offline',
  '/en/offline',
  '/el/offline',
  '/app.webmanifest',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

// Never stored: authenticated, administrative or per-guest pages.
const PRIVATE_PAGE_PREFIXES = [
  '/admin',
  '/en/check-in', '/el/check-in',
  '/en/guest', '/el/guest',
  '/en/portal', '/el/portal',
];

// Internal fetch helper (keeps the internal-fetch lint rule satisfied).
function fetchInternal(input, init) { return fetch(input, init); }

function isPrivatePage(pathname) {
  return PRIVATE_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isStorable(response) {
  return Boolean(response && response.ok && !response.redirected && response.type === 'basic');
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(OFFLINE_ASSETS.map((url) => cache.add(url)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => (
      key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME ? caches.delete(key) : null
    )));
    await self.clients.claim();
    const clients = await self.clients.matchAll();
    for (const client of clients) client.postMessage({ type: 'RUNTIME_VERSION', meta: { version: VERSION, build: BUILD } });
  })());
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'REQUEST_VERSION') {
    event.source?.postMessage({ type: 'RUNTIME_VERSION', meta: { version: VERSION, build: BUILD } });
  }
});

async function networkFirstPage(request, pathname) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetchInternal(request);
    if (isStorable(response) && !isPrivatePage(pathname)) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = isPrivatePage(pathname) ? undefined : await cache.match(request);
    if (cached) return cached;
    const locale = pathname.split('/')[1];
    return (await cache.match(`/${locale}/offline`))
      || (await cache.match('/offline'))
      || new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'content-type': 'text/plain' } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetchInternal(request);
  if (isStorable(response)) cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetchInternal(request)
    .then((response) => {
      if (isStorable(response)) cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request, url.pathname));
    return;
  }
  // Content-hashed build output never changes under the same URL.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (/\.(?:png|jpe?g|webp|avif|svg|ico)$/u.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
