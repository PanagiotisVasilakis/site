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

// The admin area, the offline page and the API are not localized: no locale redirect, and no lang cookie
// (an admin visit must not overwrite the language a guest chose on the same browser).
describe('proxy pass-through of the routes without a locale', () => {
  const passThroughPaths = [
    '/admin',
    '/admin/',
    '/admin/login',
    '/admin/bookings/42',
    '/offline',
    '/offline/',
    '/api/health/live',
    '/api/health/ready',
    '/api/portal/claims',
    '/api/does-not-exist',
  ];

  it.each(passThroughPaths)('lets %s through without a locale redirect', async (path) => {
    const response = await runProxy(path, { 'accept-language': 'el-GR,el;q=0.9' });

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    // NextResponse.next(): the request continues to the route unchanged.
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each(passThroughPaths)('sets no lang cookie on %s, with or without one', async (path) => {
    const withoutCookie = await runProxy(path, { 'accept-language': 'el' });
    const withOtherCookie = await runProxy(path, { cookie: 'lang=en' });
    const withInvalidCookie = await runProxy(path, { cookie: 'lang=fr' });

    for (const response of [withoutCookie, withOtherCookie, withInvalidCookie]) {
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.cookies.get('lang')).toBeUndefined();
    }
  });

  it.each(['/admin/login', '/offline', '/api/portal/claims'])('still applies the nonce CSP and security headers on %s', async (path) => {
    const response = await runProxy(path);

    const csp = response.headers.get('content-security-policy');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("'nonce-");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('strict-transport-security')).toContain('max-age=');
  });

  // These routes never negotiate a locale, so the Vary of the locale redirect (EP-05) does not apply to them.
  it.each(['/admin', '/offline', '/api/portal/claims'])('does not vary %s by the language preference', async (path) => {
    const response = await runProxy(path);

    expect((response.headers.get('vary') ?? '').toLowerCase()).not.toContain('accept-language');
  });

  // The exclusion is an exact segment: a lookalike is an unlocalized page like any other.
  it.each([
    ['/adminx', '/en/adminx'],
    ['/administrator', '/en/administrator'],
    ['/offlinex', '/en/offlinex'],
    ['/offline-guide', '/en/offline-guide'],
  ])('does not treat the lookalike %s as an excluded route', async (path, target) => {
    const response = await runProxy(path);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}${target}`);
  });
});
