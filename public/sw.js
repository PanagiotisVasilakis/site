/* Minimal service worker: offline fallback pages, immutable build assets and images.
 *
 * HTML is network-first. Nothing is precached except the offline pages, icons,
 * and the global CSS, self-hosted fonts and build scripts the offline pages use
 * (identity §9.11), so a redirect (e.g. `/` → `/en`) is never replayed from the
 * cache and online visitors always get the current deploy. Visited public pages
 * are kept for offline reading and stand in for a 5xx answer of the origin,
 * except the live pages (home, apartment, availability). A page opened by a
 * client-side navigation is fetched and kept when PwaManager posts its URL
 * (CACHE_PAGE). A failed navigation to an /en or /el page without a kept copy is
 * redirected to `/{locale}/offline?from=<page>`, so that the offline page hydrates
 * at its own URL (R-648); any other path gets the root /offline page. PwaManager
 * registers `/sw.js?v=<version>&build=<build>` from /version.json, so every
 * build installs a new worker and a new cache.
 */
const params = new URL(self.location.href).searchParams;
const VERSION = params.get('v') || '0.0.0';
const BUILD = params.get('build') || 'unversioned';
const CACHE_PREFIX = 'guest-guide-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD}`;

const OFFLINE_PAGES = ['/offline', '/en/offline', '/el/offline'];
// Precached best-effort next to the offline pages: a missing one never fails the install.
const OFFLINE_ASSETS = [
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

// Never stored: authenticated, administrative or per-guest pages.
const PRIVATE_PAGE_PREFIXES = [
  '/admin',
  '/en/check-in', '/el/check-in',
  '/en/guest', '/el/guest',
  '/en/portal', '/el/portal',
];

// Never stored either: live pages (force-dynamic) that must not be shown stale
// offline: the availability calendar (R-312), and home and apartment (R-460), which
// carry the same live data ("Free tonight", the 14-night open/booked strip).
const LIVE_PAGE_PATHS = [
  '/en', '/el',
  '/en/apartment', '/el/apartment',
  '/en/availability', '/el/availability',
];

function isPrivatePage(pathname) {
  return PRIVATE_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isNetworkOnlyPage(pathname) {
  return isPrivatePage(pathname) || LIVE_PAGE_PATHS.includes(pathname);
}

function isStorable(response) {
  return Boolean(response && response.ok && !response.redirected && response.type === 'basic');
}

const BUILD_ASSET_PREFIX = '/_next/static/';

/** The same-origin build-asset URLs (`/_next/static/…`) among `references`, resolved against `base`. */
function buildAssetUrls(references, base) {
  const urls = new Set();
  for (const reference of references) {
    const url = new URL(reference.replace(/&amp;/gu, '&'), base);
    if (url.origin === self.location.origin && url.pathname.startsWith(BUILD_ASSET_PREFIX)) urls.add(url.href);
  }
  return [...urls];
}

/** `<link href="…">` values of an HTML page that end in `extension` (a query string is allowed). */
function linkHrefs(html, extension) {
  return [...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/gu)]
    .map((match) => match[1])
    .filter((href) => href.split('?')[0].endsWith(extension));
}

/** `<script src="…">` values of an HTML page, without the `noModule` ones (Next's polyfills): a browser that runs this worker never loads them. */
function scriptSrcs(html) {
  return [...html.matchAll(/<script\b(?![^>]*\snomodule[\s=/>])[^>]*\bsrc="([^"]+)"/giu)].map((match) => match[1]);
}

/** `url(…)` values of a stylesheet that end in `.woff2`. */
function woff2Urls(css) {
  return css.split('url(').slice(1)
    .map((part) => part.slice(0, part.indexOf(')')).trim().replace(/^["']|["']$/gu, ''))
    .filter((value) => value.endsWith('.woff2'));
}

async function cachedText(cache, url) {
  const response = await cache.match(url);
  return response ? response.text() : '';
}

// The offline pages must render in the brand fonts and tokens (identity §9.11) and hydrate (Retry). The global
// CSS, the next/font files and the build scripts have content-hashed URLs, so they are read from the precached
// offline pages: their stylesheets, then every woff2 those stylesheets reference, and their `<script src>`
// files. Build assets are served cache-first below. The scripts are required (a failure rejects, so the install
// fails: R-647); the CSS and the fonts are best-effort.
async function precacheOfflineSubresources(cache) {
  const pages = await Promise.all(OFFLINE_PAGES.map((url) => cachedText(cache, url)));
  const origin = self.location.origin;
  const stylesheets = [...new Set(pages.flatMap((html) => buildAssetUrls(linkHrefs(html, '.css'), origin)))];
  const preloadedFonts = pages.flatMap((html) => buildAssetUrls(linkHrefs(html, '.woff2'), origin));
  await Promise.allSettled(stylesheets.map((url) => cache.add(url)));
  const sheets = await Promise.all(stylesheets.map(async (url) => ({ url, css: await cachedText(cache, url) })));
  const fonts = new Set([
    ...preloadedFonts,
    ...sheets.flatMap(({ url, css }) => buildAssetUrls(woff2Urls(css), url)),
  ]);
  await Promise.allSettled([...fonts].map((url) => cache.add(url)));
  const scripts = [...new Set(pages.flatMap((html) => buildAssetUrls(scriptSrcs(html), origin)))];
  await Promise.all(scripts.map((url) => cache.add(url)));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // No cookies: /en/offline and /el/offline must not rewrite the visitor's `lang` cookie (src/proxy.ts).
    // The offline pages and their scripts are required: a failed install keeps the previous worker and cache, and
    // PwaManager registers again on the next page load (R-647). The favicon and the icons are best-effort.
    await Promise.all(OFFLINE_PAGES.map((url) => cache.add(new Request(url, { credentials: 'omit' }))));
    await Promise.allSettled(OFFLINE_ASSETS.map((url) => cache.add(new Request(url, { credentials: 'omit' }))));
    await precacheOfflineSubresources(cache);
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
  if (event.data.type === 'CACHE_PAGE') event.waitUntil(storePage(event.data.url));
});

// A page reached by a client-side navigation (a tap on a next/link) is not a `navigate` request, so the fetch
// handler never stores it. PwaManager sends the URL it landed on; the URL comes from page script, so it gets the
// same rules as a navigation: same origin, no /api/, no network-only page, and only an answer that isStorable.
// The offline pages are precached without cookies at install and are never fetched again here.
async function storePage(href) {
  try {
    const url = new URL(href);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
    if (isNetworkOnlyPage(url.pathname) || OFFLINE_PAGES.includes(url.pathname)) return;
    const response = await fetch(new Request(url.href));
    if (isStorable(response)) await (await caches.open(CACHE_NAME)).put(url.href, response);
  } catch { /* offline, an unusable URL or a failed cache write: the page is simply not kept */ }
}

/** The unlocalized offline page, or plain text when even that was not precached. */
async function rootOfflinePage(cache) {
  return (await cache.match('/offline'))
    || new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'content-type': 'text/plain' } });
}

async function networkFirstPage(request, pathname, search) {
  const cache = await caches.open(CACHE_NAME);
  const isOfflinePage = OFFLINE_PAGES.includes(pathname);
  try {
    const response = await fetch(request);
    // The offline pages stay as the install precached them (no cookies): a navigation never stores one, under any query.
    if (isStorable(response) && !isNetworkOnlyPage(pathname) && !isOfflinePage) {
      cache.put(request, response.clone()).catch(() => {});
    }
    // Origin outage (Nginx 502, Cloudflare 52x) resolves the fetch: a visited copy beats the error page.
    if (response.status >= 500 && !isNetworkOnlyPage(pathname)) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    return response;
  } catch {
    // An offline page is answered from the precache by pathname, whatever its query, and never redirects: the
    // redirect below lands on it.
    if (isOfflinePage) return (await cache.match(pathname)) || rootOfflinePage(cache);
    const cached = isNetworkOnlyPage(pathname) ? undefined : await cache.match(request);
    if (cached) return cached;
    // R-648: the localized offline page is not shown under the requested URL (it would hydrate against that
    // route: another header and footer, a layout jump, a hydration error) but at its own, which names the page
    // in `from` for Retry (OfflineActions). Any other path gets the root /offline page.
    const locale = pathname.split('/')[1];
    if (locale === 'en' || locale === 'el') {
      return Response.redirect(`/${locale}/offline?from=${encodeURIComponent(pathname + search)}`, 302);
    }
    return rootOfflinePage(cache);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isStorable(response)) cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
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
    event.respondWith(networkFirstPage(request, url.pathname, url.search));
    return;
  }
  // Content-hashed build output never changes under the same URL.
  if (url.pathname.startsWith(BUILD_ASSET_PREFIX)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Photos: the raw files and the next/image optimizer (`/_next/image?url=…&w=…&q=…`, no extension).
  if (url.pathname === '/_next/image' || /\.(?:png|jpe?g|webp|avif|svg|ico)$/u.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
