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

// Likewise `Response.redirect('/x')`: a worker resolves it against its own URL; Node's throws on a relative URL.
class WorkerResponse extends Response {
  static redirect(url: string | URL, status?: number) {
    return Response.redirect(new URL(url, ORIGIN).href, status);
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

// A page the worker controls, or the sender of a message: it receives what the worker posts.
type FakeClient = { postMessage: ReturnType<typeof vi.fn> };

function loadWorker(fetchImpl: (request: RequestLike) => Promise<Response>, precache?: Precache, pages: FakeClient[] = []) {
  const handlers = new Map<string, Handler>();
  const fakeCaches = createFakeCaches(precache);
  const skipWaiting = vi.fn();
  const sandbox = {
    self: {
      location: { href: `${ORIGIN}/sw.js?v=0.1.1&build=build-2`, origin: ORIGIN },
      addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
      clients: { claim: async () => {}, matchAll: async () => pages },
      skipWaiting,
    },
    caches: fakeCaches.api,
    fetch: fetchImpl,
    Request: WorkerRequest,
    Response: WorkerResponse,
    URL,
    Promise,
  };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), sandbox);
  return { handlers, stores: fakeCaches.stores, added: fakeCaches.added, skipWaiting };
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

  // R-647: the install used to settle whatever failed, so a dropped connection during it left a build without its
  // offline page (or with an offline page whose scripts were missing, so Retry stayed inert), and activation then
  // deleted the previous complete cache. The three offline pages and their module scripts are now required: a
  // failure rejects the install, the browser keeps the previous worker and cache and registers again on the next
  // page load. The manifest, the icons, the CSS and the fonts stay best-effort.
  describe('install: complete or failed (R-647)', () => {
    const CACHE = 'guest-guide-build-2';
    const script = '/_next/static/chunks/0main.js';
    const css = '/_next/static/chunks/0abc.css';
    const font = '/_next/static/media/commissioner_latin-s.p.woff2';
    const offlineHtml = `<!doctype html><html><head>
      <link rel="preload" href="${font}" as="font" type="font/woff2"/>
      <link rel="stylesheet" href="${css}" data-precedence="next"/>
      <script src="${script}" async=""></script>
      </head><body>offline</body></html>`;
    const secondary = [
      '/app.webmanifest', '/favicon.ico',
      '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png',
    ];

    // A worker whose `cache.add()` rejects for the listed paths, as it does when the connection drops or the origin
    // answers with an error status.
    function installingWith(failing: string[]) {
      return loadWorker(fetchImpl, (url) => {
        const path = new URL(url, ORIGIN).pathname;
        if (failing.includes(path)) throw new TypeError(`Failed to fetch ${path}`);
        if (path.endsWith('/offline')) return new Response(offlineHtml, { status: 200 });
        return new Response(`precached ${path}`, { status: 200 });
      });
    }

    function stored(stores: Map<string, Map<string, Response>>) {
      return [...(stores.get(CACHE)?.keys() ?? [])].map((key) => new URL(key).pathname);
    }

    it('installs when every request succeeds (control)', async () => {
      const { handlers, stores } = installingWith([]);

      await expect(dispatch(handlers, 'install', {})).resolves.toBeUndefined();

      expect(stored(stores)).toEqual(expect.arrayContaining(['/offline', '/en/offline', '/el/offline', script, css, font, ...secondary]));
    });

    it.each(['/offline', '/en/offline', '/el/offline'])('rejects the install when %s cannot be precached', async (page) => {
      const { handlers, stores } = installingWith([page]);
      stores.set('guest-guide-build-1', new Map([[`${ORIGIN}/en/offline`, new Response('previous offline page')]]));

      await expect(dispatch(handlers, 'install', {})).rejects.toThrow(`Failed to fetch ${page}`);

      // The previous build's cache is only deleted on activation, which a failed install never reaches.
      expect([...stores.keys()]).toContain('guest-guide-build-1');
    });

    it('rejects the install when a build script of the offline pages cannot be precached', async () => {
      const { handlers } = installingWith([script]);

      await expect(dispatch(handlers, 'install', {})).rejects.toThrow(`Failed to fetch ${script}`);
    });

    it('does not reject the install when the manifest, the favicon or an icon cannot be precached', async () => {
      for (const path of secondary) {
        const { handlers, stores } = installingWith([path]);

        await expect(dispatch(handlers, 'install', {}), path).resolves.toBeUndefined();

        expect(stored(stores), path).toEqual(expect.arrayContaining(['/offline', '/en/offline', '/el/offline', script, css, font]));
        expect(stored(stores), path).not.toContain(path);
      }
      const { handlers, stores } = installingWith(secondary);
      await expect(dispatch(handlers, 'install', {})).resolves.toBeUndefined();
      expect(stored(stores)).toEqual(expect.arrayContaining(['/offline', '/en/offline', '/el/offline', script]));
    });

    it('does not reject the install when the stylesheet or a font cannot be precached; the scripts are still kept', async () => {
      for (const path of [css, font]) {
        const { handlers, stores } = installingWith([path]);

        await expect(dispatch(handlers, 'install', {}), path).resolves.toBeUndefined();

        expect(stored(stores), path).toEqual(expect.arrayContaining(['/offline', '/en/offline', '/el/offline', script]));
        expect(stored(stores), path).not.toContain(path);
      }
    });
  });

  // R-744: Next marks its polyfill chunk `noModule`. A browser that runs a service worker supports module scripts
  // and never fetches such a script, so the install must not download it either.
  it('does not precache the noModule scripts of the offline pages (R-744)', async () => {
    const kept = ['/_next/static/chunks/0main.js', '/_next/static/chunks/nomodule-ui.js', '/_next/static/chunks/0note.js'];
    const skipped = [
      '/_next/static/chunks/0polyfill-after.js', '/_next/static/chunks/0polyfill-before.js',
      '/_next/static/chunks/0polyfill-upper.js', '/_next/static/chunks/0polyfill-bare.js', '/_next/static/chunks/0polyfill-self.js',
    ];
    const html = `<!doctype html><html><head>
      <script src="${kept[0]}" async=""></script>
      <script src="${skipped[0]}" noModule="" async=""></script>
      <script nomodule="" async="" src="${skipped[1]}"></script>
      <script nonce="n" src="${skipped[2]}" NOMODULE async></script>
      <script async src="${skipped[3]}" nomodule></script>
      <script src="${skipped[4]}" noModule/>
      <script src="${kept[1]}" async=""></script>
      <script src="${kept[2]}" data-nomodule-note="x" async=""></script>
      </head><body>offline</body></html>`;
    const { handlers, stores, added } = loadWorker(fetchImpl, (url) => {
      const path = new URL(url).pathname;
      return new Response(path.endsWith('/offline') ? html : `precached ${path}`, { status: 200 });
    });

    await dispatch(handlers, 'install', {});

    const paths = [...stores.get('guest-guide-build-2')!.keys()].map((url) => new URL(url).pathname);
    for (const path of kept) expect(paths, path).toContain(path);
    for (const path of skipped) {
      expect(paths, path).not.toContain(path);
      expect(added.map(({ url }) => new URL(url).pathname), `${path} was not even requested`).not.toContain(path);
    }
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

    // R-648: the offline page is not shown under the requested URL (it would hydrate against that route) but at its
    // own: the worker redirects, and the redirected request is answered from the precache.
    const unvisited = await dispatch(handlers, 'fetch', navigation('/el/phones')) as Response;
    expect([unvisited.status, unvisited.headers.get('location')]).toEqual([302, `${ORIGIN}/el/offline?from=%2Fel%2Fphones`]);
    const offlinePage = await dispatch(handlers, 'fetch', navigation('/el/offline?from=%2Fel%2Fphones')) as Response;
    expect([offlinePage.status, await offlinePage.text()]).toEqual([200, 'precached /el/offline']);
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

    // Even an entry already in the cache is never served for them: offline they take the way of any page
    // without a copy, the redirect to their localized offline page (R-648), and the redirect is not stored.
    for (const path of livePaths) cache.set(`${ORIGIN}${path}`, basic(`stale ${path}`));
    const before = [...cache.keys()];
    online = false;
    for (const path of livePaths) {
      const offline = await dispatch(handlers, 'fetch', navigation(path)) as Response;
      expect([offline.status, offline.headers.get('location')], path)
        .toEqual([302, `${ORIGIN}/${path.split('/')[1]}/offline?from=${encodeURIComponent(path)}`]);
    }
    expect([...cache.keys()]).toEqual(before);
  });

  // R-648: a failed navigation used to be answered with the cached /{locale}/offline page under the requested URL, so
  // the page hydrated against another route (hydration error, header and footer switch, a layout jump). The worker now
  // redirects an /en or /el page without a visited copy to its offline page, which hydrates at its own URL; Retry
  // goes back to `from` (OfflineActions).
  describe('offline fallback at its own URL (R-648)', () => {
    const CACHE = 'guest-guide-build-2';
    const REDIRECTS = [301, 302, 303, 307, 308];

    async function installedOffline() {
      const worker = loadWorker(fetchImpl);
      await dispatch(worker.handlers, 'install', {});
      online = false;
      return worker;
    }

    // What a browser does with a navigation: follow the worker's redirects, then show the last answer.
    async function visit(handlers: Map<string, Handler>, start: string) {
      const trail = [start];
      for (let hops = 0; hops < 5; hops += 1) {
        const response = await dispatch(handlers, 'fetch', navigation(trail[trail.length - 1])) as Response;
        const location = REDIRECTS.includes(response.status) ? response.headers.get('location') : null;
        if (!location) return { trail, response };
        const next = new URL(location);
        trail.push(`${next.pathname}${next.search}`);
      }
      throw new Error(`redirect loop: ${trail.join(' -> ')}`);
    }

    it('redirects an en/el navigation without a cached copy to its offline page, naming the page in `from`', async () => {
      const { handlers, stores } = await installedOffline();
      const before = [...stores.get(CACHE)!.keys()];

      const paths = [
        '/en/moments', '/el/phones', '/en/moments/viktoria',
        // The whole URL travels in `from`: the query string too, encoded so that its own `&` and `?` survive.
        '/el/moments?category=beaches&sort=name', '/en/phones?next=%2Fen%3Fa%3D1&b=2', '/el/%CE%BC%CE%BF%CE%B9',
        // Live and private pages never have a copy to show: they take the same way.
        '/en', '/el', '/en/apartment', '/el/availability', '/en/check-in', '/el/guest', '/en/portal/refresh?next=%2Fen%2Fcheck-in',
      ];
      for (const path of paths) {
        const response = await dispatch(handlers, 'fetch', navigation(path)) as Response;
        const target = new URL(response.headers.get('location') ?? 'about:blank');
        expect([response.status, target.origin, target.pathname, target.searchParams.get('from')], path)
          .toEqual([302, ORIGIN, `/${path.split('/')[1]}/offline`, path]);
        expect([...target.searchParams.keys()], path).toEqual(['from']);
      }
      expect([...stores.get(CACHE)!.keys()], 'the redirect is not stored').toEqual(before);
    });

    it('answers the redirected request from the precache: the chain ends at the offline page and never loops', async () => {
      const { handlers } = await installedOffline();

      for (const [start, locale] of [['/en/moments', 'en'], ['/el/phones?x=1', 'el'], ['/en', 'en'], ['/el/apartment', 'el']]) {
        const { trail, response } = await visit(handlers, start);
        expect(trail, start).toEqual([start, `/${locale}/offline?from=${encodeURIComponent(start)}`]);
        expect([response.status, await response.text()], start).toEqual([200, `precached /${locale}/offline`]);
      }
    });

    it('answers /offline, /en/offline and /el/offline from the precache by pathname, whatever the query', async () => {
      const { handlers } = await installedOffline();

      for (const page of ['/offline', '/en/offline', '/el/offline']) {
        for (const query of ['', '?', '?from=%2Fen%2Fmoments', '?from=%2Fen%2Foffline', '?a=1&b=2']) {
          const { trail, response } = await visit(handlers, `${page}${query}`);
          expect(trail, `${page}${query}`).toHaveLength(1);
          expect([response.status, await response.text()], `${page}${query}`).toEqual([200, `precached ${page}`]);
        }
      }
    });

    it('never redirects an offline page, not even when its precache entry is missing', async () => {
      const { handlers } = loadWorker(fetchImpl);
      online = false;

      for (const path of ['/offline', '/en/offline', '/el/offline?from=%2Fel%2Fphones']) {
        const response = await dispatch(handlers, 'fetch', navigation(path)) as Response;
        expect([response.status, response.headers.get('location')], path).toEqual([503, null]);
      }
    });

    it('keeps the root /offline page for every other path', async () => {
      const { handlers } = await installedOffline();

      // Only a first segment that is exactly `en` or `el` redirects, not one that merely starts with it.
      for (const path of ['/', '/admin', '/admin/bookings', '/english/moments', '/elsewhere', '/enx', '//en/moments']) {
        const response = await dispatch(handlers, 'fetch', navigation(path)) as Response;
        expect([response.status, response.headers.get('location'), await response.text()], path)
          .toEqual([200, null, 'precached /offline']);
      }
    });

    it('never stores an offline page from a navigation: not under another query, not over the precached copy', async () => {
      const { handlers, stores } = loadWorker(fetchImpl);
      await dispatch(handlers, 'install', {});
      const before = [...stores.get(CACHE)!.keys()];

      for (const path of ['/offline', '/en/offline', '/el/offline', '/en/offline?from=%2Fen%2Fmoments', '/el/offline?from=%2Fel%2Fphones']) {
        const served = await dispatch(handlers, 'fetch', navigation(path)) as Response;
        expect(await served.text(), path).toBe(`network ${new URL(path, ORIGIN).pathname}`);
      }

      const cache = stores.get(CACHE)!;
      expect([...cache.keys()], 'no entry under another query').toEqual(before);
      for (const page of ['/offline', '/en/offline', '/el/offline']) {
        expect(await cache.get(`${ORIGIN}${page}`)!.clone().text(), page).toBe(`precached ${page}`);
      }
    });
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

  // R-628: a tap on a next/link is a client-side navigation (an `?_rsc=` fetch, never `mode: 'navigate'`), so
  // the worker does not see the page. PwaManager hands the URL it landed on to the worker, which fetches and
  // stores it under the same rules as a navigation.
  describe('CACHE_PAGE message from the page (R-628)', () => {
    const CACHE = 'guest-guide-build-2';

    function cachePage(url: unknown) {
      return { data: { type: 'CACHE_PAGE', url } };
    }

    const urlOf = (request: RequestLike) => (typeof request === 'string' ? request : request.url);

    function stored(stores: Map<string, Map<string, Response>>) {
      return [...(stores.get(CACHE)?.keys() ?? [])].map((key) => new URL(key).href);
    }

    it('fetches a public page with the default credentials and keeps it for offline use', async () => {
      const requests: Request[] = [];
      const { handlers, stores } = loadWorker(async (request) => {
        requests.push(request as Request);
        return basic(`network ${new URL(urlOf(request)).pathname}`);
      });

      await dispatch(handlers, 'message', cachePage(`${ORIGIN}/en/moments/viktoria`));

      expect(stored(stores)).toEqual([`${ORIGIN}/en/moments/viktoria`]);
      expect(requests.map(({ url, credentials }) => [url, credentials])).toEqual([[`${ORIGIN}/en/moments/viktoria`, 'same-origin']]);

      // The tap never reached the worker as a navigation; the later full navigation, offline, does find the copy.
      online = false;
      const offline = await dispatch(handlers, 'fetch', navigation('/en/moments/viktoria')) as Response;
      expect(await offline.text()).toBe('network /en/moments/viktoria');
    });

    it('keeps the query string of the page it was given', async () => {
      const fetched: string[] = [];
      const { handlers, stores } = loadWorker(async (request) => {
        fetched.push(urlOf(request));
        return basic('network /en/phones');
      });

      await dispatch(handlers, 'message', cachePage(`${ORIGIN}/en/phones?lang=en`));

      // The cache key alone would also match a worker that fetched origin + pathname: the request needs the query too.
      expect(fetched).toEqual([`${ORIGIN}/en/phones?lang=en`]);
      expect(stored(stores)).toEqual([`${ORIGIN}/en/phones?lang=en`]);
    });

    it('ignores other origins, /api/, live pages, private pages and the offline pages: nothing is fetched or stored', async () => {
      const fetched: string[] = [];
      const { handlers, stores } = loadWorker(async (request) => {
        fetched.push(urlOf(request));
        return basic(`network ${urlOf(request)}`);
      });
      const control = `${ORIGIN}/en/moments`;
      await dispatch(handlers, 'message', cachePage(control));
      expect(stored(stores), 'a public page of the same origin is kept').toEqual([control]);

      const refused = [
        'https://elsewhere.example/en/moments',
        `${ORIGIN}/api/health/ready`,
        `${ORIGIN}/api/admin/bookings`,
        // Live pages (R-312, R-460).
        `${ORIGIN}/en`, `${ORIGIN}/el`,
        `${ORIGIN}/en/apartment`, `${ORIGIN}/el/apartment`,
        `${ORIGIN}/en/availability`, `${ORIGIN}/el/availability`,
        // Private and per-guest pages.
        `${ORIGIN}/admin`, `${ORIGIN}/admin/bookings`,
        `${ORIGIN}/en/check-in`, `${ORIGIN}/el/check-in`,
        `${ORIGIN}/en/guest`, `${ORIGIN}/en/guest/profile`,
        `${ORIGIN}/en/portal`, `${ORIGIN}/el/portal/refresh`,
        // The offline pages are precached at install, never re-fetched with the visitor's cookies.
        `${ORIGIN}/offline`, `${ORIGIN}/en/offline`, `${ORIGIN}/el/offline`,
      ];
      for (const url of refused) {
        await expect(dispatch(handlers, 'message', cachePage(url)), url).resolves.toBeUndefined();
      }

      expect(fetched, 'only the control page was fetched').toEqual([control]);
      expect(stored(stores), 'only the control page was stored').toEqual([control]);
    });

    it('ignores a message without a usable URL', async () => {
      const fetchSpy = vi.fn(async () => basic('network'));
      const { handlers, stores } = loadWorker(fetchSpy);
      await dispatch(handlers, 'install', {});
      const before = stored(stores);

      for (const url of [undefined, null, 42, '', 'not a url', { href: `${ORIGIN}/en/moments` }]) {
        await expect(dispatch(handlers, 'message', cachePage(url)), String(url)).resolves.toBeUndefined();
      }

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(stored(stores)).toEqual(before);
    });

    it('stores only an answer that isStorable: not an error status, a redirect, or a response from elsewhere', async () => {
      const answer = (init: { status: number; type: ResponseType; redirected?: boolean }) => {
        const response = new Response('answer', { status: init.status });
        Object.defineProperty(response, 'type', { value: init.type });
        if (init.redirected) Object.defineProperty(response, 'redirected', { value: true });
        return response;
      };
      const answers = new Map<string, () => Response | Promise<Response>>([
        ['/en/ok', () => answer({ status: 200, type: 'basic' })],
        ['/en/missing', () => answer({ status: 404, type: 'basic' })],
        ['/en/broken', () => answer({ status: 502, type: 'basic' })],
        ['/en/moved', () => answer({ status: 200, type: 'basic', redirected: true })],
        ['/en/opaque', () => answer({ status: 200, type: 'opaque' })],
        ['/en/offline-now', () => Promise.reject(new TypeError('Failed to fetch'))],
      ]);
      const { handlers, stores } = loadWorker(async (request) => {
        const answerFor = answers.get(new URL(urlOf(request)).pathname);
        if (!answerFor) throw new Error(`unexpected fetch ${urlOf(request)}`);
        return answerFor();
      });

      for (const path of answers.keys()) {
        await expect(dispatch(handlers, 'message', cachePage(`${ORIGIN}${path}`)), path).resolves.toBeUndefined();
      }

      expect(stored(stores)).toEqual([`${ORIGIN}/en/ok`]);
    });

    it('survives a failing cache write', async () => {
      const { handlers, stores } = loadWorker(fetchImpl);
      const store = new Map<string, Response>();
      stores.set(CACHE, store);
      vi.spyOn(store, 'set').mockImplementation(() => { throw new Error('QuotaExceededError'); });

      await expect(dispatch(handlers, 'message', cachePage(`${ORIGIN}/en/moments`))).resolves.toBeUndefined();
    });
  });

  // R-783: the worker's side of the update protocol that PwaManager relies on. The worker is loaded from
  // /sw.js?v=0.1.1&build=build-2, so these are the version and build it reports.
  describe('update protocol with PwaManager (R-783)', () => {
    const runtimeVersion = { type: 'RUNTIME_VERSION', meta: { version: '0.1.1', build: 'build-2' } };

    it('answers REQUEST_VERSION to the sender with its own version and build, and does not take over', async () => {
      const sender: FakeClient = { postMessage: vi.fn() };
      const bystander: FakeClient = { postMessage: vi.fn() };
      const { handlers, skipWaiting } = loadWorker(fetchImpl, undefined, [sender, bystander]);

      await dispatch(handlers, 'message', { data: { type: 'REQUEST_VERSION' }, source: sender });

      expect(sender.postMessage).toHaveBeenCalledTimes(1);
      expect(sender.postMessage).toHaveBeenCalledWith(runtimeVersion);
      expect(bystander.postMessage).not.toHaveBeenCalled();
      expect(skipWaiting).not.toHaveBeenCalled();
    });

    it('answers REQUEST_VERSION without throwing when the message has no source', async () => {
      const { handlers } = loadWorker(fetchImpl);

      await expect(dispatch(handlers, 'message', { data: { type: 'REQUEST_VERSION' } })).resolves.toBeUndefined();
    });

    it('skips waiting once on SKIP_WAITING, and only then', async () => {
      const sender: FakeClient = { postMessage: vi.fn() };
      const { handlers, skipWaiting } = loadWorker(fetchImpl);

      await dispatch(handlers, 'message', { data: { type: 'REQUEST_VERSION' }, source: sender });
      expect(skipWaiting).not.toHaveBeenCalled();

      await dispatch(handlers, 'message', { data: { type: 'SKIP_WAITING' }, source: sender });
      expect(skipWaiting).toHaveBeenCalledTimes(1);
      expect(sender.postMessage).toHaveBeenCalledTimes(1);
    });

    it('tells every controlled page its version and build when it activates', async () => {
      const pages: FakeClient[] = [{ postMessage: vi.fn() }, { postMessage: vi.fn() }];
      const { handlers } = loadWorker(fetchImpl, undefined, pages);

      await dispatch(handlers, 'activate', {});

      for (const page of pages) {
        expect(page.postMessage).toHaveBeenCalledTimes(1);
        expect(page.postMessage).toHaveBeenCalledWith(runtimeVersion);
      }
    });
  });

  it('deletes caches of previous builds on activation', async () => {
    const { handlers, stores } = loadWorker(fetchImpl);
    stores.set('guest-guide-build-1', new Map());
    stores.set('unrelated-cache', new Map());

    await dispatch(handlers, 'activate', {});

    expect([...stores.keys()]).toEqual(['unrelated-cache']);
  });
});
