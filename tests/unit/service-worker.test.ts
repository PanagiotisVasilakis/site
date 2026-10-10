import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: Record<string, unknown>) => void;

const ORIGIN = 'https://guide.example';

type RequestLike = { url: string } | string;

// `precache` answers `cache.add()` with the absolute URL asked for; by default a marker body (the path), so
// tests can tell precached entries apart.
type Precache = (url: string) => Response;

// What the worker handed to `cache.add()`: the absolute URL and, for a Request, its credentials mode. A bare
// URL string always means the default mode, which sends and stores cookies for a same-origin URL.
type Added = { url: string; credentials?: RequestCredentials };

// A worker resolves `new Request('/x')` against its own URL; Node's Request throws on a relative URL.
class WorkerRequest extends Request {
  constructor(input: string | Request, init?: RequestInit) {
    super(typeof input === 'string' ? new URL(input, ORIGIN).href : input, init);
  }
}

function createFakeCaches(precache: Precache = (url) => new Response(`precached ${new URL(url).pathname}`, { status: 200 })) {
  const stores = new Map<string, Map<string, Response>>();
  const added: Added[] = [];
  const key = (input: RequestLike) => (typeof input === 'string' ? new URL(input, ORIGIN).href : input.url);
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      add: async (input: string | Request) => {
        added.push(typeof input === 'string' ? { url: key(input) } : { url: input.url, credentials: input.credentials });
        store.set(key(input), precache(key(input)));
      },
      put: async (request: RequestLike, response: Response) => { store.set(key(request), response); },
      match: async (request: RequestLike) => store.get(key(request))?.clone(),
    };
  };
  return {
    stores,
    added,
    api: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
  };
}

function loadWorker(fetchImpl: (request: RequestLike) => Promise<Response>, precache?: Precache) {
  const handlers = new Map<string, Handler>();
  const fakeCaches = createFakeCaches(precache);
  const sandbox = {
    self: {
      location: { href: `${ORIGIN}/sw.js?v=0.1.1&build=build-2`, origin: ORIGIN },
      addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
      clients: { claim: async () => {}, matchAll: async () => [] },
      skipWaiting: vi.fn(),
    },
    caches: fakeCaches.api,
    fetch: fetchImpl,
    Request: WorkerRequest,
    Response,
    URL,
    Promise,
  };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), sandbox);
  return { handlers, stores: fakeCaches.stores, added: fakeCaches.added };
}

async function dispatch(handlers: Map<string, Handler>, type: string, event: Record<string, unknown>) {
  let pending: Promise<unknown> | undefined;
  handlers.get(type)!({
    ...event,
    waitUntil: (promise: Promise<unknown>) => { pending = promise; },
    respondWith: (promise: Promise<unknown>) => { pending = promise; },
  });
  return pending;
}

function navigation(path: string) {
  return { request: { url: `${ORIGIN}${path}`, method: 'GET', mode: 'navigate' } };
}

// Same-origin fetch responses in a real worker have type 'basic'.
function basic(body: string, init: { redirected?: boolean } = {}) {
  const response = new Response(body, { status: 200 });
  Object.defineProperty(response, 'type', { value: 'basic' });
  if (init.redirected) Object.defineProperty(response, 'redirected', { value: true });
  return response;
}

describe('service worker', () => {
  let online: boolean;
  const fetchImpl = vi.fn(async (request: RequestLike) => {
    if (!online) throw new TypeError('Failed to fetch');
    const url = typeof request === 'string' ? request : request.url;
    return basic(`network ${new URL(url, ORIGIN).pathname}`);
  });

  beforeEach(() => {
    online = true;
  });

  it('precaches the offline pages and icons, never a redirecting page, in a build-specific cache', async () => {
    const { handlers, stores } = loadWorker(fetchImpl);
    await dispatch(handlers, 'install', {});

    expect([...stores.keys()]).toEqual(['guest-guide-build-2']);
    const precached = [...stores.get('guest-guide-build-2')!.keys()].map((url) => new URL(url).pathname);
    expect(precached).toContain('/en/offline');
    expect(precached).not.toContain('/');
    expect(precached).not.toContain('/en');
  });

  // R-380: the proxy answers /en/offline and /el/offline with `Set-Cookie: lang=<that locale>` when the request's
  // `lang` cookie is missing or differs, so fetching them with the visitor's cookies would flip the stored language.
  it('precaches the offline pages and icons without credentials, so the install cannot rewrite the lang cookie (R-380)', async () => {
    const { handlers, added } = loadWorker(fetchImpl);
    await dispatch(handlers, 'install', {});

    const upFront = added.filter(({ url }) => !new URL(url).pathname.startsWith('/_next/static/'));
    expect(upFront.map(({ url }) => new URL(url).pathname)).toEqual(
      expect.arrayContaining(['/offline', '/en/offline', '/el/offline', '/app.webmanifest', '/icons/icon-192.png']),
    );
    for (const { url, credentials } of upFront) expect(credentials, url).toBe('omit');
  });

  // R-381: offline, /{locale}/offline hydrates (Retry) from its build scripts. Their URLs are content-hashed
  // `<script src>` values of the offline HTML, so the worker reads them from the precached pages, like the CSS.
  it('precaches the build scripts the offline pages load, so they hydrate offline (R-381)', async () => {
    const shared = '/_next/static/chunks/0shared.js';
    const own: Record<string, string> = {
      '/offline': '/_next/static/chunks/0root.js',
      '/en/offline': '/_next/static/chunks/0en.js',
      '/el/offline': '/_next/static/chunks/0el.js',
    };
    const html = (page: string) => `<!doctype html><html><head>
      <script src="${shared}?dpl=x&amp;v=1" async=""></script>
      <script nonce="n" src="${own[page]}" async></script>
      <script src="https://elsewhere.example/x.js" async=""></script>
      <script src="/vendor/y.js"></script>
      </head><body>offline<script>self.__next_f.push([1,"inline"])</script></body></html>`;
    const { handlers, stores, added } = loadWorker(fetchImpl, (url) => {
      const path = new URL(url).pathname;
      return new Response(path in own ? html(path) : `precached ${path}`, { status: 200 });
    });

    await dispatch(handlers, 'install', {});

    const sharedUrl = `${ORIGIN}${shared}?dpl=x&v=1`;
    const precached = [...stores.get('guest-guide-build-2')!.keys()].map((url) => new URL(url));
    const paths = precached.map((url) => url.pathname);
    for (const script of [shared, ...Object.values(own)]) expect(paths).toContain(script);
    expect(precached.map((url) => url.href)).toContain(sharedUrl);
    expect(paths).not.toContain('/vendor/y.js');
    expect(precached.every((url) => url.origin === ORIGIN)).toBe(true);
    expect(added.filter(({ url }) => url === sharedUrl)).toHaveLength(1);

    online = false;
    const offline = await dispatch(handlers, 'fetch', { request: { url: sharedUrl, method: 'GET', mode: 'no-cors' } }) as Response;
    expect(await offline.text()).toBe(`precached ${shared}`);
  });

  // identity §9.11: /offline renders in the brand fonts and tokens offline. Their URLs are content-hashed
  // (next/font, the global CSS chunk), so the worker reads them from the precached offline pages.
  it('precaches the global CSS and every self-hosted font file the offline pages use', async () => {
    const css = '/_next/static/chunks/0abc.css';
    const html = `<!doctype html><html><head>
      <link rel="preload" href="/_next/static/media/commissioner_latin-s.p.woff2" as="font" type="font/woff2"/>
      <link rel="stylesheet" href="${css}?dpl=x&amp;v=1" data-precedence="next"/>
      <link rel="stylesheet" href="https://elsewhere.example/x.css"/>
      </head><body>offline</body></html>`;
    const fonts = [
      'commissioner_latin-s.p.woff2', 'commissioner_greek.woff2',
      'noto_display_latin.woff2', 'noto_display_latin_italic.woff2',
      'noto_display_greek.woff2', 'noto_display_greek_italic.woff2',
    ];
    const stylesheet = fonts.map((file, index) => (
      `@font-face{font-family:f${index};src:url(${index % 2 ? `"../media/${file}"` : `../media/${file}`}) format("woff2")}`
    )).join('') + '.x{background:url(../media/grain.webp)}@font-face{src:url(https://cdn.example/x.woff2)}';
    const { handlers, stores } = loadWorker(fetchImpl, (url) => {
      const path = new URL(url, ORIGIN).pathname;
      if (path.endsWith('/offline')) return new Response(html, { status: 200 });
      if (path === css) return new Response(stylesheet, { status: 200 });
      return new Response(`precached ${url}`, { status: 200 });
    });

    await dispatch(handlers, 'install', {});

    const precached = [...stores.get('guest-guide-build-2')!.keys()].map((url) => new URL(url));
    const paths = precached.map((url) => url.pathname);
    expect(paths).toContain(css);
    for (const file of fonts) expect(paths).toContain(`/_next/static/media/${file}`);
    expect(paths).not.toContain('/_next/static/media/grain.webp');
    expect(precached.every((url) => url.origin === ORIGIN)).toBe(true);
  });

  it('serves the precached fonts offline (cache-first for build assets)', async () => {
    const font = '/_next/static/media/commissioner_latin-s.p.woff2';
    const { handlers } = loadWorker(fetchImpl, (url) => {
      const path = new URL(url, ORIGIN).pathname;
      if (path.endsWith('/offline')) return new Response(`<link rel="preload" href="${font}" as="font">`, { status: 200 });
      return new Response(`precached ${path}`, { status: 200 });
    });
    await dispatch(handlers, 'install', {});

    online = false;
    const response = await dispatch(handlers, 'fetch', { request: { url: `${ORIGIN}${font}`, method: 'GET', mode: 'cors' } }) as Response;
    expect(await response.text()).toBe(`precached ${font}`);
  });

  it('keeps the stay pages behind sign-in network-only (check-in, guest, portal)', async () => {
    const { handlers, stores } = loadWorker(fetchImpl);
    await dispatch(handlers, 'install', {});

    for (const path of ['/en/guest', '/el/check-in', '/en/portal/refresh', '/admin']) {
      await dispatch(handlers, 'fetch', navigation(path));
    }
    const stored = [...stores.get('guest-guide-build-2')!.keys()].map((url) => new URL(url).pathname);
    expect(stored.filter((path) => /guest|check-in|portal|admin/u.test(path))).toEqual([]);
  });

  it('serves navigations from the network and falls back to the visited page, then the offline page', async () => {
    const { handlers } = loadWorker(fetchImpl);
    await dispatch(handlers, 'install', {});

    const online1 = await dispatch(handlers, 'fetch', navigation('/en/moments')) as Response;
    expect(await online1.text()).toBe('network /en/moments');

    online = false;
    const visited = await dispatch(handlers, 'fetch', navigation('/en/moments')) as Response;
    expect(await visited.text()).toBe('network /en/moments');
    const unvisited = await dispatch(handlers, 'fetch', navigation('/el/phones')) as Response;
    expect(await unvisited.text()).toBe('precached /el/offline');
  });

  // R-425: during an origin outage Nginx answers 502 (Cloudflare 52x). The fetch resolves instead of rejecting,
  // so the fallback to the visited copy never ran and the guest saw the error page.
  it('serves the visited copy of a public page when the origin answers 5xx; unvisited and network-only pages keep the 5xx (R-425)', async () => {
    let status = 200;
    const { handlers, stores } = loadWorker(async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      return status === 200 ? basic(`network ${new URL(url).pathname}`) : new Response(`error ${status}`, { status });
    });
    await dispatch(handlers, 'install', {});
    const visited = await dispatch(handlers, 'fetch', navigation('/en/moments')) as Response;
    expect(await visited.text()).toBe('network /en/moments');

    for (const outage of [500, 502, 503, 504, 522]) {
      status = outage;
      const copy = await dispatch(handlers, 'fetch', navigation('/en/moments')) as Response;
      expect([copy.status, await copy.text()], `status ${outage}`).toEqual([200, 'network /en/moments']);
    }

    // No copy to fall back to: the visitor gets the real 502, not the "You're offline" page, while online.
    status = 502;
    const unvisited = await dispatch(handlers, 'fetch', navigation('/el/phones')) as Response;
    expect([unvisited.status, await unvisited.text()]).toEqual([502, 'error 502']);

    // Network-only pages (private, and live ones with prices and free nights) never come from the cache, even
    // when an entry exists: an outage must not replay a stale price either (R-312, R-460).
    const cache = stores.get('guest-guide-build-2')!;
    for (const path of ['/en/portal', '/en/availability', '/en', '/el', '/en/apartment', '/el/apartment']) {
      cache.set(`${ORIGIN}${path}`, basic(`stale ${path}`));
      const live = await dispatch(handlers, 'fetch', navigation(path)) as Response;
      expect([live.status, await live.text()], path).toEqual([502, 'error 502']);
    }

    // Only a 5xx falls back: a 404 is a real answer. An error response never replaces the stored copy.
    status = 404;
    const missing = await dispatch(handlers, 'fetch', navigation('/en/moments')) as Response;
    expect([missing.status, await missing.text()]).toEqual([404, 'error 404']);
    status = 502;
    const kept = await dispatch(handlers, 'fetch', navigation('/en/moments')) as Response;
    expect(await kept.text()).toBe('network /en/moments');
  });

  it('never stores private pages or redirected responses', async () => {
    const { handlers, stores } = loadWorker(async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      return url.endsWith('/') ? basic('page after redirect', { redirected: true }) : basic('private check-in');
    });

    await dispatch(handlers, 'fetch', navigation('/'));
    await dispatch(handlers, 'fetch', navigation('/en/check-in'));

    const stored = [...(stores.get('guest-guide-build-2')?.keys() ?? [])].map((url) => new URL(url).pathname);
    expect(stored).not.toContain('/');
    expect(stored).not.toContain('/en/check-in');
  });

  // R-312: the availability calendar is force-dynamic. R-460: home and apartment render the same live data
  // (from-price, "Free tonight", the 14-night open/booked strip), so they are network-only too.
  it('keeps the live pages network-only (availability, home, apartment): never stored, never replayed offline (R-312, R-460)', async () => {
    const { handlers, stores } = loadWorker(fetchImpl);
    await dispatch(handlers, 'install', {});
    const livePaths = ['/en', '/el', '/en/apartment', '/el/apartment', '/en/availability', '/el/availability'];

    for (const path of livePaths) {
      const live = await dispatch(handlers, 'fetch', navigation(path)) as Response;
      expect(await live.text()).toBe(`network ${path}`);
    }
    const cache = stores.get('guest-guide-build-2')!;
    const stored = [...cache.keys()].map((url) => new URL(url).pathname);
    for (const path of livePaths) expect(stored, path).not.toContain(path);

    // Even an entry already in the cache is never served for them.
    for (const path of livePaths) cache.set(`${ORIGIN}${path}`, basic(`stale ${path}`));
    online = false;
    for (const path of livePaths) {
      const offline = await dispatch(handlers, 'fetch', navigation(path)) as Response;
      expect(await offline.text(), path).toBe(`precached /${path.split('/')[1]}/offline`);
    }
  });

  // R-459: next/image serves photos as `/_next/image?url=…&w=…&q=…`: no file extension, not under /_next/static/.
  it('caches the next/image optimizer responses of visited pages, so their photos render offline (R-459)', async () => {
    const photo = (width: number) => ({
      request: { url: `${ORIGIN}/_next/image?url=%2Fphones%2Fsos-hero.webp&w=${width}&q=75`, method: 'GET', mode: 'no-cors' },
    });
    const { handlers } = loadWorker(async (request) => {
      if (!online) throw new TypeError('Failed to fetch');
      const url = typeof request === 'string' ? request : request.url;
      return basic(`network ${url.slice(ORIGIN.length)}`);
    });
    await dispatch(handlers, 'install', {});

    const first = await dispatch(handlers, 'fetch', photo(128)) as Response | undefined;
    expect(first, 'the worker answers /_next/image requests').toBeDefined();
    expect(await first!.text()).toBe('network /_next/image?url=%2Fphones%2Fsos-hero.webp&w=128&q=75');

    online = false;
    const offline = await dispatch(handlers, 'fetch', photo(128)) as Response;
    expect(await offline.text()).toBe('network /_next/image?url=%2Fphones%2Fsos-hero.webp&w=128&q=75');
    // The cache key is the whole URL: a width that was never fetched is not answered with another one.
    const other = await dispatch(handlers, 'fetch', photo(256)) as Response;
    expect(other.status).toBe(504);
  });

  it('deletes caches of previous builds on activation', async () => {
    const { handlers, stores } = loadWorker(fetchImpl);
    stores.set('guest-guide-build-1', new Map());
    stores.set('unrelated-cache', new Map());

    await dispatch(handlers, 'activate', {});

    expect([...stores.keys()]).toEqual(['unrelated-cache']);
  });
});
