import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logger: {
    warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), getContext: vi.fn(), setContext: vi.fn(),
  },
}));

vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));

const ORIGIN = 'https://guide.example';
const FOREIGN = 'https://evil.example';

type Environment = { nodeEnv?: string; allowedOrigins?: string };

// The security middleware reads NODE_ENV and ALLOWED_ORIGINS when its modules load, so every request
// re-imports the real proxy under the configuration the case names.
async function runProxy(url: string, init: { method?: string; headers?: Record<string, string> }, environment: Environment = {}) {
  vi.stubEnv('NODE_ENV', environment.nodeEnv ?? 'production');
  vi.stubEnv('ALLOWED_ORIGINS', environment.allowedOrigins ?? '');
  vi.resetModules();
  const { proxy } = await import('@/proxy');
  return proxy(new NextRequest(url, init));
}

function preflight(origin: string | null, environment?: Environment, path = '/api/admin/rate-periods/1') {
  return runProxy(`${ORIGIN}${path}`, {
    method: 'OPTIONS',
    headers: origin === null ? {} : { origin, 'access-control-request-method': 'PATCH' },
  }, environment);
}

function allowOriginHeaders(response: Response) {
  return [
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-allow-credentials',
    'access-control-max-age',
  ].filter((name) => response.headers.has(name));
}

// TQ-06: the CORS preflight gate of src/lib/security-middleware-edge.ts, through the real proxy.
describe('proxy CORS preflight origin gate', () => {
  beforeEach(() => {
    mocks.logger.warn.mockReset();
  });

  it('answers a same-origin preflight of an API route with the origin, the methods, the headers and the cache age', async () => {
    const response = await preflight(ORIGIN);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, PUT, PATCH, DELETE, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type');
    expect(response.headers.get('access-control-max-age')).toBe('86400');
  });

  it('ends the preflight in the proxy instead of forwarding it to the route', async () => {
    const response = await preflight(ORIGIN);

    expect(response.headers.get('x-middleware-next')).toBeNull();
  });

  it.each([
    ['a foreign origin', FOREIGN],
    ['the opaque origin "null"', 'null'],
    ['the same host over another scheme', 'http://guide.example'],
    ['a subdomain', 'https://www.guide.example'],
    ['a lookalike that starts with the host', 'https://guide.example.evil.example'],
    ['the same host on another port', 'https://guide.example:8443'],
  ])('never names %s as an allowed origin', async (_name, origin) => {
    const response = await preflight(origin);

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    for (const [, value] of response.headers) expect(value).not.toBe(origin);
    // A foreign preflight is not a CORS violation to log: the browser blocks the call itself.
    expect(mocks.logger.warn).not.toHaveBeenCalled();
  });

  it('names no allowed origin when the request carries none', async () => {
    const response = await preflight(null);

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows an origin that is only the public host behind the bind address (Host header, same scheme)', async () => {
    const allowed = await runProxy('http://localhost:3000/api/admin/rate-periods/1', {
      method: 'OPTIONS',
      headers: { origin: 'http://guide.example', host: 'guide.example' },
    });
    const otherScheme = await runProxy('http://localhost:3000/api/admin/rate-periods/1', {
      method: 'OPTIONS',
      headers: { origin: 'https://guide.example', host: 'guide.example' },
    });
    const otherHost = await runProxy('http://localhost:3000/api/admin/rate-periods/1', {
      method: 'OPTIONS',
      headers: { origin: 'http://evil.example', host: 'guide.example' },
    });

    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://guide.example');
    expect(otherScheme.headers.get('access-control-allow-origin')).toBeNull();
    expect(otherHost.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not trust a forwarded protocol that no attested proxy sent', async () => {
    const response = await runProxy('http://localhost:3000/api/admin/rate-periods/1', {
      method: 'OPTIONS',
      headers: { origin: 'https://guide.example', host: 'guide.example', 'x-forwarded-proto': 'https' },
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  describe('with ALLOWED_ORIGINS in production', () => {
    const environment = { allowedOrigins: ' https://partner.example , https://other.example ' };

    it.each(['https://partner.example', 'https://other.example'])('allows the configured origin %s', async (origin) => {
      const response = await preflight(origin, environment);

      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
      expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, PUT, PATCH, DELETE, OPTIONS');
    });

    it.each([FOREIGN, 'http://partner.example', 'https://partner.example.evil.example', 'https://partner.example/'])(
      'still refuses %s',
      async (origin) => {
        const response = await preflight(origin, environment);

        expect(response.headers.get('access-control-allow-origin')).toBeNull();
      },
    );

    it('still allows the own origin', async () => {
      const response = await preflight(ORIGIN, environment);

      expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    });
  });

  it('allows only the own origin when ALLOWED_ORIGINS is empty in production', async () => {
    const own = await preflight(ORIGIN, { allowedOrigins: '' });
    const localhost = await preflight('http://localhost:3000', { allowedOrigins: '' });

    expect(own.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(localhost.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows the local development origins only in development', async () => {
    const development = await preflight('http://localhost:3000', { nodeEnv: 'development' });
    const developmentLoopback = await preflight('http://127.0.0.1:3000', { nodeEnv: 'development' });
    const developmentForeign = await preflight(FOREIGN, { nodeEnv: 'development' });
    const production = await preflight('http://localhost:3000', { nodeEnv: 'production' });

    expect(development.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(developmentLoopback.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:3000');
    expect(developmentForeign.headers.get('access-control-allow-origin')).toBeNull();
    expect(production.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers a preflight only for API paths', async () => {
    for (const path of ['/en', '/el/apartment', '/admin/login', '/offline']) {
      const response = await preflight(FOREIGN, undefined, path);

      expect(allowOriginHeaders(response)).toEqual([]);
      expect(response.headers.get('x-middleware-next')).toBe('1');
    }
    const sameOriginPage = await preflight(ORIGIN, undefined, '/en');
    expect(allowOriginHeaders(sameOriginPage)).toEqual([]);
  });

  it.each(['/api/health/live', '/api/health/ready'])('gives the health probe %s no CORS surface', async (path) => {
    const options = await preflight(FOREIGN, undefined, path);
    const get = await runProxy(`${ORIGIN}${path}`, { headers: { origin: FOREIGN } });

    // Neither a 403 nor a preflight answer, whatever the Origin says.
    for (const response of [options, get]) {
      expect(response.status).toBe(200);
      expect(allowOriginHeaders(response)).toEqual([]);
      expect(response.headers.get('vary')).toBeNull();
      expect(response.headers.get('x-middleware-next')).toBe('1');
    }
    // An attacker-controlled Origin must not turn a direct probe into a log line or an audit write.
    expect(mocks.logger.warn).not.toHaveBeenCalled();
  });

  it('answers an actual request of an allowed origin with the origin, Vary and credentials, not the preflight headers', async () => {
    const response = await runProxy(`${ORIGIN}/api/admin/rate-periods/1`, { method: 'PATCH', headers: { origin: ORIGIN } });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.has('access-control-allow-methods')).toBe(false);
    expect(response.headers.has('access-control-max-age')).toBe(false);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('adds no CORS headers to an actual API request without an Origin', async () => {
    const response = await runProxy(`${ORIGIN}/api/admin/rate-periods/1`, { method: 'PATCH' });

    expect(response.status).toBe(200);
    expect(allowOriginHeaders(response)).toEqual([]);
    expect(response.headers.get('vary')).toBeNull();
  });
});
