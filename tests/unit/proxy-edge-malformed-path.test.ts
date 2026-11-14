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

// The proxy lets a request through to Next with `x-middleware-next`; Next's router then throws a DecodeError for a
// malformed escape and, with no /400 page in the App Router, answers a bare 500 without headers (PS-04 / SF-10).
describe('proxy rejects a path with a malformed percent-escape', () => {
  it.each([
    '/en/%E0%A4%A',
    '/en/%zz/phones',
    '/%zz/x',
    '/en/a%2/b',
    '/en/phones/%zz',
    '/en/%',
    '/en/%E0%A4',
    '/en/%C0%AF',
    '/el/%FF',
    '/en/a%2',
    '/%zz',
    '/%',
    '/EN/%zz',
    '/fr/%zz',
    '/api/%zz',
    '/api/health/%E0%A4%A',
    '/admin/%zz',
    '/offline/%zz',
  ])('answers %s with a plain 400', async (path) => {
    const response = await runProxy(path);

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('Bad Request');
  });

  it('does not let the request continue to Next or redirect it', async () => {
    const response = await runProxy('/en/phones/%zz');

    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('location')).toBeNull();
    expect([...response.headers.keys()].filter((name) => name.startsWith('x-middleware-'))).toEqual([]);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.cookies.get('lang')).toBeUndefined();
  });

  it('does not store a language choice for an unlocalized malformed path', async () => {
    const response = await runProxy('/%zz', { 'accept-language': 'el-GR' });

    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('location')).toBeNull();
  });

  it('puts no internal detail in the body', async () => {
    const body = await (await runProxy('/en/%E0%A4%A')).text();

    expect(body).toBe('Bad Request');
    expect(body).not.toMatch(/URIError|DecodeError|decode|stack|at |node_modules|\.next/iu);
  });
});

describe('proxy leaves a path with valid percent-escapes as it was', () => {
  it.each([
    '/en/%CE%A4%CE%B1',
    '/el/%CE%B1%CE%B2%CE%B3',
    '/en/a%20b',
    '/en/a%2Fb',
    '/en/a%2fb',
    '/en/a%252Fb',
    '/en/%25zz',
    '/en/%00',
    '/api/health/live',
    '/api/a%20b',
    '/admin',
    '/admin/login',
    '/offline',
  ])('passes %s through to Next', async (path) => {
    const response = await runProxy(path);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
  });

  it('treats a malformed escape in the query string as it did before', async () => {
    for (const path of ['/en?q=%zz', '/en/phones?x=%E0%A4%A', '/api/health/live?x=%zz']) {
      const response = await runProxy(path);

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
    }
  });

  it('still sends an unlocalized path with valid escapes to the locale of the browser', async () => {
    const response = await runProxy('/%CE%B1?x=1', { 'accept-language': 'el-GR' });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/el/%CE%B1?x=1`);
    expect(response.cookies.get('lang')?.value).toBe('el');
  });

  it('still stores the language of a localized path with valid escapes', async () => {
    const response = await runProxy('/el/%CE%B1%CE%B2');

    expect(response.status).toBe(200);
    expect(response.cookies.get('lang')?.value).toBe('el');
  });

  it('keeps the page headers of the localized check-in route', async () => {
    const response = await runProxy('/en/check-in');

    expect(response.status).toBe(200);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });
});
