import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const ORIGIN = 'https://guide.example';

// The proxy builds its security middleware when it is imported, from NODE_ENV,
// so each request re-imports it under the production configuration.
async function runProxy(path: string, cookie?: string) {
  vi.stubEnv('NODE_ENV', 'production');
  vi.resetModules();
  const { proxy } = await import('@/proxy');
  return proxy(new NextRequest(`${ORIGIN}${path}`, cookie === undefined ? undefined : { headers: { cookie } }));
}

describe('proxy redirects of the retired booking pages', () => {
  it.each([
    ['/en/book', '/en/availability'],
    ['/el/book/', '/el/availability'],
    ['/en/booking-details', '/en/availability'],
    ['/el/booking-details/', '/el/availability'],
    ['/en/book?checkin=2030-07-10&checkout=2030-07-12', '/en/availability'],
    ['/el/booking-details/?utm_source=x', '/el/availability'],
  ])('redirects %s permanently to %s without the query', async (path, target) => {
    const response = await runProxy(path);

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`${ORIGIN}${target}`);
  });

  it('sends the same security headers on the redirect as on a page', async () => {
    const page = await runProxy('/en/availability');
    const response = await runProxy('/en/book');

    const csp = response.headers.get('content-security-policy');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("'nonce-");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    for (const header of ['strict-transport-security', 'x-frame-options', 'referrer-policy', 'permissions-policy']) {
      expect(response.headers.get(header)).toBe(page.headers.get(header));
    }
  });

  it.each([
    '/en/bookings',
    '/en/book-now',
    '/en/booking',
    '/en/booking-details/x',
    '/en/book/x',
    '/el/availability',
  ])('does not redirect %s', async (path) => {
    const response = await runProxy(path);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it.each(['/book', '/book/', '/booking-details', '/booking-details/?checkin=2030-07-10'])(
    'sends the unlocalized %s to the availability page in the lang cookie locale',
    async (path) => {
      const response = await runProxy(path, 'lang=el');

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`${ORIGIN}/el/availability`);
      expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.cookies.get('lang')?.value).toBe('el');
    },
  );

  it('uses the default locale for an unlocalized retired page without a valid lang cookie', async () => {
    const response = await runProxy('/book', 'lang=fr');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/en/availability`);
  });

  it.each([
    ['/en/about', '/en#host'],
    ['/el/about', '/el#host'],
    ['/el/about/', '/el#host'],
    ['/en/about?utm_source=x', '/en#host'],
  ])('redirects the retired about page %s permanently to the host letter %s', async (path, target) => {
    const response = await runProxy(path);

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`${ORIGIN}${target}`);
  });

  it('sends the same security headers on the about redirect as on a page', async () => {
    const page = await runProxy('/el');
    const response = await runProxy('/el/about');

    expect(response.status).toBe(308);
    const csp = response.headers.get('content-security-policy');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("'nonce-");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    for (const header of ['strict-transport-security', 'x-frame-options', 'referrer-policy', 'permissions-policy']) {
      expect(response.headers.get(header)).toBe(page.headers.get(header));
    }
  });

  it.each(['/en/about-us', '/en/about/x', '/en/aboutx'])('does not treat %s as the about page', async (path) => {
    const response = await runProxy(path);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it.each(['/about', '/about/'])('sends the unlocalized %s to the host letter in the lang cookie locale', async (path) => {
    const response = await runProxy(path, 'lang=el');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/el#host`);
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('keeps the plain locale redirect for an unlocalized lookalike', async () => {
    const response = await runProxy('/bookings?x=1', 'lang=el');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/el/bookings?x=1`);
  });
});
