import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: Record<string, unknown>) => void;

const ORIGIN = 'https://guide.example';

type RequestLike = { url: string } | string;

function createFakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const key = (input: RequestLike) => (typeof input === 'string' ? new URL(input, ORIGIN).href : input.url);
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      add: async (url: string) => { store.set(key(url), new Response(`precached ${url}`, { status: 200 })); },
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

function loadWorker(fetchImpl: (request: RequestLike) => Promise<Response>) {
  const handlers = new Map<string, Handler>();
  const fakeCaches = createFakeCaches();
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

  it('precaches only offline pages and icons in a build-specific cache', async () => {
    const { handlers, stores } = loadWorker(fetchImpl);
    await dispatch(handlers, 'install', {});

    expect([...stores.keys()]).toEqual(['guest-guide-build-2']);
    const precached = [...stores.get('guest-guide-build-2')!.keys()].map((url) => new URL(url).pathname);
    expect(precached).toContain('/en/offline');
    expect(precached).not.toContain('/');
    expect(precached).not.toContain('/en');
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

  it('deletes caches of previous builds on activation', async () => {
    const { handlers, stores } = loadWorker(fetchImpl);
    stores.set('guest-guide-build-1', new Map());
    stores.set('unrelated-cache', new Map());

    await dispatch(handlers, 'activate', {});

    expect([...stores.keys()]).toEqual(['unrelated-cache']);
  });
});
