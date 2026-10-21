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

// identity §12 R3-V9: a first visit without a `lang` cookie gets Greek when Accept-Language prefers it.
describe('proxy locale for a first visit (Accept-Language)', () => {
  it.each([
    ['el-GR,el;q=0.9,en;q=0.8', 'el'],
    ['EL-gr', 'el'],
    ['en-US,en;q=0.9,el;q=0.8', 'en'],
    ['en;q=0.5,el;q=0.8', 'el'],
    ['el;q=0.3,en;q=0.7', 'en'],
    ['de-DE,el;q=0.5', 'el'],
    ['fr,el;q=0', 'en'],
    ['*', 'en'],
    ['el;q=0.8,en;q=0.8', 'el'],
    ['en;q=0.8,el;q=0.8', 'en'],
    ['el;q=abc,en;q=0.5', 'en'],
  ])('sends "/" with Accept-Language %j to /%s and stores that choice', async (acceptLanguage, locale) => {
    const response = await runProxy('/', { 'accept-language': acceptLanguage });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/${locale}`);
    expect(response.cookies.get('lang')?.value).toBe(locale);
  });

  it('uses the default locale without an Accept-Language header', async () => {
    const response = await runProxy('/moments');

    expect(response.headers.get('location')).toBe(`${ORIGIN}/en/moments`);
  });

  it('applies the preference to unlocalized paths and keeps the query', async () => {
    const response = await runProxy('/moments?q=museum', { 'accept-language': 'el-GR' });

    expect(response.headers.get('location')).toBe(`${ORIGIN}/el/moments?q=museum`);
  });

  it('lets an existing lang cookie win over Accept-Language', async () => {
    const response = await runProxy('/', { 'accept-language': 'el-GR,el;q=0.9', cookie: 'lang=en' });

    expect(response.headers.get('location')).toBe(`${ORIGIN}/en`);
  });

  it('falls back to Accept-Language when the lang cookie is not a supported locale', async () => {
    const response = await runProxy('/', { 'accept-language': 'el', cookie: 'lang=fr' });

    expect(response.headers.get('location')).toBe(`${ORIGIN}/el`);
  });

  it.each(['/en', '/en/moments'])('never redirects an explicit locale path (%s)', async (path) => {
    const response = await runProxy(path, { 'accept-language': 'el-GR,el;q=0.9' });

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.cookies.get('lang')?.value).toBe('en');
  });
});

// PP-01: LanguageSwitch links to the other locale in the header and the footer. A prefetch of such a link
// is a request for the other locale's path, and must not rewrite the visitor's remembered language.
// Next removes its own flight headers (rsc, next-router-prefetch, ...) before the proxy runs, so only the
// browser-level headers below are visible to it; next/link prefetches are prevented at the source
// (`prefetch={false}` on the LanguageSwitch links, tests/components/language-switch-prefetch.test.tsx).
describe('proxy lang cookie and prefetch requests', () => {
  const prefetchHeaders: Array<[string, Record<string, string>]> = [
    ['Purpose: prefetch', { purpose: 'prefetch' }],
    ['Purpose: Prefetch', { purpose: 'Prefetch' }],
    ['Sec-Purpose: prefetch', { 'sec-purpose': 'prefetch' }],
    ['Sec-Purpose: prefetch;prerender', { 'sec-purpose': 'prefetch;prerender' }],
  ];

  it.each(prefetchHeaders)('does not rewrite the lang cookie on a %s of the other locale', async (_name, headers) => {
    const response = await runProxy('/el/apartment', { ...headers, cookie: 'lang=en' });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.cookies.get('lang')).toBeUndefined();
  });

  it.each(prefetchHeaders)('does not create a lang cookie on a %s without one', async (_name, headers) => {
    const response = await runProxy('/el', headers);

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('still redirects a prefetch of an unlocalized path by the cookie, without writing it', async () => {
    const response = await runProxy('/moments', { 'sec-purpose': 'prefetch', cookie: 'lang=el' });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/el/moments`);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('does not store the Accept-Language choice from a prefetch of an unlocalized path', async () => {
    const response = await runProxy('/', { purpose: 'prefetch', 'accept-language': 'el-GR' });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/el`);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('remembers the language of a real navigation to the other locale', async () => {
    const response = await runProxy('/el/apartment', { cookie: 'lang=en', 'accept-language': 'en-US' });

    expect(response.status).toBe(200);
    expect(response.cookies.get('lang')).toMatchObject({ value: 'el', path: '/', sameSite: 'lax', secure: true });
  });

  it('remembers the first language of a navigation without a cookie', async () => {
    const response = await runProxy('/en/apartment');

    expect(response.cookies.get('lang')?.value).toBe('en');
  });

  it('does not set the cookie again when it already follows the path', async () => {
    const response = await runProxy('/el/apartment', { cookie: 'lang=el' });

    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('keeps an explicit switch to Greek through the prefetches that follow it', async () => {
    // The visitor clicks "ΕΛ": a real navigation stores el. The browser then prefetches the English link of the
    // new page, sending el from now on, and "/" (the PWA start_url) still opens Greek.
    const switched = await runProxy('/el/apartment', { cookie: 'lang=en' });
    expect(switched.cookies.get('lang')?.value).toBe('el');

    const prefetched = await runProxy('/en/apartment', { 'sec-purpose': 'prefetch', cookie: 'lang=el' });
    expect(prefetched.headers.get('set-cookie')).toBeNull();

    const start = await runProxy('/', { 'accept-language': 'en-US', cookie: 'lang=el' });
    expect(start.headers.get('location')).toBe(`${ORIGIN}/el`);
  });
});

// EP-05: this 302 depends on the lang cookie and Accept-Language and may set a cookie.
describe('proxy locale redirect caching', () => {
  it.each(['/', '/moments', '/book', '/about'])('forbids shared caches to store the locale redirect of %s', async (path) => {
    const response = await runProxy(path, { 'accept-language': 'el-GR' });

    expect(response.status).toBe(302);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect((response.headers.get('vary') ?? '').split(',').map((field) => field.trim().toLowerCase())).toEqual(
      expect.arrayContaining(['accept-language', 'cookie']),
    );
  });

  it('keeps the security headers on the locale redirect', async () => {
    const response = await runProxy('/', { cookie: 'lang=el' });

    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('also forbids caching the locale redirect of a prefetch', async () => {
    const response = await runProxy('/', { purpose: 'prefetch', cookie: 'lang=en' });

    expect(response.status).toBe(302);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  // The policy belongs to the negotiation redirect only: a localized page does not depend on the cookie or on
  // Accept-Language for its content, so the proxy must not make it uncacheable or vary it by them.
  it.each(['/en', '/el/apartment'])('does not apply the redirect cache policy to the page request %s', async (path) => {
    const response = await runProxy(path);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control') ?? '').not.toContain('no-store');
    expect((response.headers.get('vary') ?? '').toLowerCase()).not.toContain('accept-language');
  });
});
