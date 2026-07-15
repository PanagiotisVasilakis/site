import { checkOfflineAssets, resolveOfflineOrigin } from '../check-offline-assets';

const validBodies: Record<string, { contentType: string; body: string }> = {
  '/sw.js': {
    contentType: 'text/javascript; charset=utf-8',
    body: "self.addEventListener('install', () => undefined);",
  },
  '/precache.json': {
    contentType: 'application/json',
    body: JSON.stringify(['/en']),
  },
  '/critical-precache.json': {
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(['/en']),
  },
  '/version.json': {
    contentType: 'application/json',
    body: JSON.stringify({
      version: '1.0.0',
      timestamp: '2026-07-15T00:00:00.000Z',
      precacheHash: 'a'.repeat(64),
    }),
  },
  '/app.webmanifest': {
    contentType: 'application/manifest+json',
    body: JSON.stringify({ name: 'Guide', start_url: '/', icons: [{ src: '/icon.png' }] }),
  },
};

function validFetch(overrides: Partial<Record<string, Response>> = {}): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const override = overrides[url.pathname];
    if (override) return override;
    const fixture = validBodies[url.pathname];
    if (!fixture) return new Response('missing', { status: 404 });
    return new Response(fixture.body, {
      status: 200,
      headers: { 'content-type': fixture.contentType },
    });
  }) as typeof fetch;
}

describe('offline asset verification', () => {
  it('checks every asset against one exact origin and validates its payload', async () => {
    const fetchImpl = validFetch();
    const results = await checkOfflineAssets('https://guide.example', fetchImpl);

    expect(results).toHaveLength(5);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(vi.mocked(fetchImpl).mock.calls.every(([input]) => new URL(String(input)).origin === 'https://guide.example')).toBe(true);
  });

  it('fails closed on redirects and HTML fallbacks', async () => {
    const fetchImpl = validFetch({
      '/sw.js': new Response('', { status: 302, headers: { location: '/en' } }),
      '/precache.json': new Response('<html>fallback</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    });
    const results = await checkOfflineAssets('https://guide.example', fetchImpl);

    expect(results.find((result) => result.path === '/sw.js')).toMatchObject({
      ok: false,
      status: 302,
      error: 'expected HTTP 200, received 302',
    });
    expect(results.find((result) => result.path === '/precache.json')).toMatchObject({
      ok: false,
      status: 200,
      error: 'unexpected content-type text/html',
    });
  });

  it('accepts only a bare HTTP(S) origin', () => {
    expect(resolveOfflineOrigin({ OFFLINE_CHECK_ORIGIN: 'https://guide.example' })).toBe('https://guide.example');
    expect(resolveOfflineOrigin({ OFFLINE_CHECK_HOST: 'http://127.0.0.1:3100' })).toBe('http://127.0.0.1:3100');
    expect(() => resolveOfflineOrigin({ OFFLINE_CHECK_ORIGIN: 'https://guide.example/path' })).toThrow(/must be an origin/);
  });
});
