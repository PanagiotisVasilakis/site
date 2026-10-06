import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const ORIGIN = 'https://guide.example';

async function runProxy(path: string) {
  vi.stubEnv('NODE_ENV', 'production');
  vi.resetModules();
  const { proxy } = await import('@/proxy');
  return proxy(new NextRequest(`${ORIGIN}${path}`, { headers: { cookie: 'NEXT_LOCALE=en' } }));
}

describe('proxy per-page headers', () => {
  it.each(['/en/check-in', '/el/check-in/'])('marks %s as noindex', async (path) => {
    expect((await runProxy(path)).headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it.each(['/en/guest', '/el/guest/'])('sends no referrer from %s', async (path) => {
    expect((await runProxy(path)).headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('leaves other pages indexable with the default referrer policy', async () => {
    const response = await runProxy('/el/check-in/extra');

    expect(response.headers.get('x-robots-tag')).toBeNull();
    expect(response.headers.get('referrer-policy')).not.toBe('no-referrer');
  });

  it.each([
    ['/el/availability', 'el'],
    ['/el', 'el'],
    ['/en/availability', 'en'],
    ['/elx', 'en'],
  ])('forwards the path locale of %s as x-locale %s', async (path, locale) => {
    expect((await runProxy(path)).headers.get('x-middleware-request-x-locale')).toBe(locale);
  });

  it('forwards the response CSP and its nonce to the page request', async () => {
    const response = await runProxy('/en/availability');
    const csp = response.headers.get('content-security-policy');
    const nonce = response.headers.get('x-middleware-request-x-nonce');

    expect(nonce).toBeTruthy();
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
