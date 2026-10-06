import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: Record<string, unknown>) => void;

const ORIGIN = 'https://guide.example';

type RequestLike = { url: string } | string;

// `precache` answers `cache.add()`; by default a marker body, so tests can tell precached entries apart.
type Precache = (url: string) => Response;

function createFakeCaches(precache: Precache = (url) => new Response(`precached ${url}`, { status: 200 })) {
  const stores = new Map<string, Map<string, Response>>();
  const key = (input: RequestLike) => (typeof input === 'string' ? new URL(input, ORIGIN).href : input.url);
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      add: async (url: string) => { store.set(key(url), precache(url)); },
      put: async (request: RequestLike, response: Response) => { store.set(key(request), response); },
      match: async (request: RequestLike) => store.get(key(request))?.clone(),
    };
  };
  return {
    stores,
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
    Response,
    URL,
    Promise,
  };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), sandbox);
  return { handlers, stores: fakeCaches.stores };
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

  it('keeps the live availability pages network-only: never stored, never replayed offline (R-312)', async () => {
    const { handlers, stores } = loadWorker(fetchImpl);
    await dispatch(handlers, 'install', {});

    for (const path of ['/en/availability', '/el/availability']) {
      const live = await dispatch(handlers, 'fetch', navigation(path)) as Response;
      expect(await live.text()).toBe(`network ${path}`);
    }
    const cache = stores.get('guest-guide-build-2')!;
    const stored = [...cache.keys()].map((url) => new URL(url).pathname);
    expect(stored).not.toContain('/en/availability');
    expect(stored).not.toContain('/el/availability');

    // Even an entry already in the cache is never served for them.
    cache.set(`${ORIGIN}/el/availability`, basic('stale calendar'));
    online = false;
    const offline = await dispatch(handlers, 'fetch', navigation('/el/availability')) as Response;
    expect(await offline.text()).toBe('precached /el/offline');
  });

  it('deletes caches of previous builds on activation', async () => {
    const { handlers, stores } = loadWorker(fetchImpl);
    stores.set('guest-guide-build-1', new Map());
    stores.set('unrelated-cache', new Map());

    await dispatch(handlers, 'activate', {});

    expect([...stores.keys()]).toEqual(['unrelated-cache']);
  });
});
