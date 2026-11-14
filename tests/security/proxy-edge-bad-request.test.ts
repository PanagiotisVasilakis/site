import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const ORIGIN = 'https://guide.example';

// The proxy builds its security middleware when it is imported, from NODE_ENV,
// so each request re-imports it under the production configuration.
async function runProxy(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  vi.stubEnv('NODE_ENV', 'production');
  vi.resetModules();
  const { proxy } = await import('@/proxy');
  return proxy(new NextRequest(`${ORIGIN}${path}`, init));
}

const STABLE_SECURITY_HEADERS = [
  'strict-transport-security',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'cross-origin-embedder-policy',
  'x-dns-prefetch-control',
  'x-permitted-cross-domain-policies',
];

// PS-04 / SF-10: Next answered a malformed escape with a bare 500 that had none of these headers.
describe('proxy 400 for a malformed percent-escape carries the security headers', () => {
  it.each(['/en/%E0%A4%A', '/en/phones/%zz', '/%zz', '/api/%zz', '/admin/%zz', '/offline/%zz'])(
    'sends the headers of a page on %s',
    async (path) => {
      const page = await runProxy('/en/availability');
      const response = await runProxy(path);

      expect(response.status).toBe(400);
      const csp = response.headers.get('content-security-policy');
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=_-]+'/u);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      for (const header of STABLE_SECURITY_HEADERS) {
        expect(response.headers.get(header), header).toBe(page.headers.get(header));
      }
    },
  );

  it('uses a fresh nonce for every rejection', async () => {
    const first = await runProxy('/en/%zz');
    const second = await runProxy('/en/%zz');

    expect(first.headers.get('content-security-policy')).not.toBe(second.headers.get('content-security-policy'));
  });

  it('forwards nothing to Next: no request header overrides and no continue marker', async () => {
    const response = await runProxy('/en/%E0%A4%A');

    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(response.headers.get('x-middleware-override-headers')).toBeNull();
    expect(response.headers.get('x-middleware-request-x-nonce')).toBeNull();
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBeNull();
    expect(response.headers.get('x-middleware-request-x-locale')).toBeNull();
  });

  it('is not cached and sets no cookie', async () => {
    const response = await runProxy('/en/%zz');

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('answers a request that carries a lang cookie without touching it', async () => {
    const response = await runProxy('/el/%zz', { headers: { cookie: 'lang=en' } });

    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});

describe('proxy 400 for a malformed percent-escape on the API keeps the CORS rules', () => {
  it('lets the same-origin page read the 400', async () => {
    const response = await runProxy('/api/%zz', { headers: { origin: ORIGIN } });

    expect(response.status).toBe(400);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('vary')).toContain('Origin');
  });

  it('does not answer a foreign origin with CORS headers', async () => {
    const response = await runProxy('/api/%zz', { method: 'POST', headers: { origin: 'https://evil.example' } });

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('keeps the preflight answer for a malformed API path', async () => {
    const response = await runProxy('/api/%zz', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('proxy leaves a valid path to the security headers it always had', () => {
  it.each(['/en/%CE%A4%CE%B1', '/en/a%2Fb', '/api/health/live', '/admin', '/offline'])(
    'passes %s through with the headers and the nonce for the page',
    async (path) => {
      const response = await runProxy(path);
      const csp = response.headers.get('content-security-policy');
      const nonce = response.headers.get('x-middleware-request-x-nonce');

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(nonce).toBeTruthy();
      expect(csp).toContain(`'nonce-${nonce}'`);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    },
  );
});
