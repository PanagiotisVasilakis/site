import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const ORIGIN = 'https://guide.example';

// The proxy builds its security middleware when it is imported, from NODE_ENV,
// so each request re-imports it under the production configuration.
async function runProxy(path: string, headers: Record<string, string> = {}) {
  vi.stubEnv('NODE_ENV', 'production');
  vi.resetModules();
  const { proxy } = await import('@/proxy');
  return proxy(new NextRequest(`${ORIGIN}${path}`, { headers }));
}

// PS-05: the first path segment used to be compared with the locales case-sensitively, so /EN/phones was an
// unknown first segment and became the 404 /en/EN/phones, with a lang cookie set on the way.
describe('proxy redirects a supported locale in another letter case', () => {
  it.each([
    ['/EN', '/en'],
    ['/EL', '/el'],
    ['/El', '/el'],
    ['/eL', '/el'],
    ['/En', '/en'],
    ['/EN/phones', '/en/phones'],
    ['/El/phones', '/el/phones'],
    ['/eL/guide/category/item', '/el/guide/category/item'],
    ['/EN/phones/', '/en/phones/'],
    ['/EL/%CE%B1%CE%B2%CE%B3', '/el/%CE%B1%CE%B2%CE%B3'],
    ['/EN/a%2Fb', '/en/a%2Fb'],
    ['/EN/Phones/Mixed-Case', '/en/Phones/Mixed-Case'],
  ])('sends %s permanently to %s', async (path, target) => {
    const response = await runProxy(path);

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`${ORIGIN}${target}`);
  });

  it.each([
    ['/EN/phones?x=1&y=a%20b', '/en/phones?x=1&y=a%20b'],
    ['/El?utm_source=qr', '/el?utm_source=qr'],
    ['/EN/phones/?q=museum', '/en/phones/?q=museum'],
  ])('keeps the query when it sends %s to %s', async (path, target) => {
    const response = await runProxy(path);

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`${ORIGIN}${target}`);
  });

  it.each([
    [undefined, undefined],
    ['lang=el', undefined],
    ['lang=en', undefined],
    ['lang=fr', undefined],
    [undefined, 'el-GR,el;q=0.9'],
  ])('does not touch the lang cookie (cookie %j, Accept-Language %j)', async (cookie, acceptLanguage) => {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    if (acceptLanguage) headers['accept-language'] = acceptLanguage;

    const response = await runProxy('/EN/phones', headers);

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/en/phones`);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.cookies.get('lang')).toBeUndefined();
  });

  it('follows the locale in the path, not the lang cookie or the browser', async () => {
    const response = await runProxy('/EL/phones', { cookie: 'lang=en', 'accept-language': 'en-US' });

    expect(response.headers.get('location')).toBe(`${ORIGIN}/el/phones`);
  });

  it('sends the same security headers on the redirect as on a page', async () => {
    const page = await runProxy('/en/phones');
    const response = await runProxy('/EN/phones');

    expect(response.status).toBe(308);
    const csp = response.headers.get('content-security-policy');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("'nonce-");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    for (const header of ['strict-transport-security', 'x-frame-options', 'referrer-policy', 'permissions-policy']) {
      expect(response.headers.get(header)).toBe(page.headers.get(header));
    }
  });

  it('moves the first segment only, whatever case the rest of the path has', async () => {
    const response = await runProxy('/EN/EN/EL');

    expect(response.headers.get('location')).toBe(`${ORIGIN}/en/EN/EL`);
  });

  it('ends at the lowercase locale: the redirect target is not redirected again', async () => {
    const target = new URL((await runProxy('/El/phones/x?y=1')).headers.get('location') as string);
    const response = await runProxy(`${target.pathname}${target.search}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('answers a malformed escape under an uppercase locale with the 400, not a redirect', async () => {
    const response = await runProxy('/EN/%zz');

    expect(response.status).toBe(400);
    expect(response.headers.get('location')).toBeNull();
  });
});

describe('proxy keeps its handling of every other first segment', () => {
  it.each([
    ['/fr/x', '/en/fr/x'],
    ['/FR/x', '/en/FR/x'],
    ['/ENX/phones', '/en/ENX/phones'],
    ['/elx', '/en/elx'],
    ['/e/phones', '/en/e/phones'],
    ['/En-US/phones', '/en/En-US/phones'],
    ['/e%6E/phones', '/en/e%6E/phones'],
    ['/%45N/phones', '/en/%45N/phones'],
    ['/Phones', '/en/Phones'],
    ['/EN.json', '/en/EN.json'],
    ['/moments?q=1', '/en/moments?q=1'],
  ])('sends the unlocalized %s to %s with the temporary redirect and the lang cookie', async (path, target) => {
    const response = await runProxy(path);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}${target}`);
    expect(response.cookies.get('lang')?.value).toBe('en');
  });

  it('uses the lang cookie locale for an unknown first segment', async () => {
    const response = await runProxy('/FR/x', { cookie: 'lang=el' });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/el/FR/x`);
    expect(response.cookies.get('lang')?.value).toBe('el');
  });

  it.each(['/en', '/el', '/en/phones', '/el/phones/x?y=1'])('does not redirect the lowercase %s', async (path) => {
    const response = await runProxy(path);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.cookies.get('lang')?.value).toBe(path.startsWith('/el') ? 'el' : 'en');
  });

  it.each(['/api/health/live', '/admin', '/admin/login', '/offline'])('passes %s through unchanged', async (path) => {
    const response = await runProxy(path);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('still sends the root to the default locale', async () => {
    const response = await runProxy('/');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/en`);
    expect(response.cookies.get('lang')?.value).toBe('en');
  });

  it('still moves the lowercase retired pages in one hop', async () => {
    const response = await runProxy('/el/book');

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/el/availability`);
  });
});
