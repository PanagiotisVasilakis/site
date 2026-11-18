import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const ORIGIN = 'https://guide.example';

// proxy() caches production security middleware per module load, so each call reloads cleanly.
async function runProxy(path: string, headers: Record<string, string> = {}) {
  vi.stubEnv('NODE_ENV', 'production');
  vi.resetModules();
  const { proxy } = await import('@/proxy');
  return proxy(new NextRequest(`${ORIGIN}${path}`, { headers }));
}

describe('proxy locale for a first visit (Accept-Language)', () => {
  it.each([
    ['el-GR,el;q=0.9,en;q=0.8', 'el'],
    ['EL-gr', 'el'],
    ['en-US,en;q=0.9,el;q=0.8', 'en'],
    ['en;q=0.5,el;q=0.8', 'el'],
    ['de-DE,el;q=0.5', 'el'],
    ['fr,el;q=0', 'en'],
    ['*', 'en'],
    ['el;q=0.8,en;q=0.8', 'el'],
    ['el;q=abc,en;q=0.5', 'en'],
  ])('sends "/" with Accept-Language %j to /%s and stores that choice', async (acceptLanguage, locale) => {
    const response = await runProxy('/', { 'accept-language': acceptLanguage });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/${locale}`);
    expect(response.cookies.get('lang')?.value).toBe(locale);
  });

  it('uses the default locale without an Accept-Language header and preserves query strings', async () => {
    expect((await runProxy('/moments')).headers.get('location')).toBe(`${ORIGIN}/en/moments`);
    expect((await runProxy('/moments?q=museum', { 'accept-language': 'el-GR' })).headers.get('location'))
      .toBe(`${ORIGIN}/el/moments?q=museum`);
  });

  it('lets a valid lang cookie override Accept-Language and ignores unsupported cookie values', async () => {
    expect((await runProxy('/', { 'accept-language': 'el-GR,el;q=0.9', cookie: 'lang=en' })).headers.get('location'))
      .toBe(`${ORIGIN}/en`);
    expect((await runProxy('/', { 'accept-language': 'el', cookie: 'lang=fr' })).headers.get('location'))
      .toBe(`${ORIGIN}/el`);
  });

  it('never redirects an explicit locale path (/en)', async () => {
    const response = await runProxy('/en', { 'accept-language': 'el-GR,el;q=0.9' });

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.cookies.get('lang')?.value).toBe('en');
  });
});

describe('proxy per-page security headers', () => {
  const withLocaleCookie = (path: string) => runProxy(path, { cookie: 'NEXT_LOCALE=en' });

  it.each(['/en/check-in', '/el/check-in/'])('marks %s as noindex', async (path) => {
    expect((await withLocaleCookie(path)).headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it.each(['/en/guest', '/el/guest/'])('sends no referrer from %s', async (path) => {
    expect((await withLocaleCookie(path)).headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('leaves other pages indexable with the default referrer policy', async () => {
    const response = await withLocaleCookie('/el/check-in/extra');

    expect(response.headers.get('x-robots-tag')).toBeNull();
    expect(response.headers.get('referrer-policy')).not.toBe('no-referrer');
  });

  it.each([
    ['/el/availability', 'el'],
    ['/el', 'el'],
    ['/en/availability', 'en'],
    ['/elx', 'en'],
  ])('forwards the path locale of %s as x-locale %s', async (path, locale) => {
    expect((await withLocaleCookie(path)).headers.get('x-middleware-request-x-locale')).toBe(locale);
  });

  it('forwards the response CSP and its nonce to the page request', async () => {
    const response = await withLocaleCookie('/en/availability');
    const csp = response.headers.get('content-security-policy');
    const nonce = response.headers.get('x-middleware-request-x-nonce');

    expect(nonce).toBeTruthy();
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
