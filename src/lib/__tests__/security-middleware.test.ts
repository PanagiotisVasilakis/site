

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  process.env.TRUST_PROXY_HOPS = '1';
  process.env.TRUST_PROXY_MODE = 'hops';
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token-that-is-long-enough';
  process.env.SECURITY_PEPPER = 'test-security-pepper';
  process.env.RATE_LIMIT_NAMESPACE = 'vitest';
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.RATE_LIMIT_BACKEND;
  delete process.env.TRUST_PROXY_HOPS;
  delete process.env.TRUST_PROXY_MODE;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.SECURITY_PEPPER;
  delete process.env.RATE_LIMIT_NAMESPACE;
});

function makeReq(path = '/'): any {
  const headers = new Headers();
  headers.set('x-forwarded-for', '1.2.3.4');
  headers.set('user-agent', 'vitest');
  return {
    headers,
    nextUrl: { pathname: path, toString: () => `https://example.test${path}` },
    method: 'GET'
  } as any;
}

describe('RateLimitMiddleware', () => {
  it('allows requests when under limit using Upstash', async () => {
    process.env.RATE_LIMIT_BACKEND = 'redis';

    const incr = vi.fn().mockResolvedValue({ count: 1, resetAfterMs: 60_000 });
    const get = vi.fn().mockResolvedValue(1);

    vi.doMock('@/lib/upstash', () => ({ incrWithExpire: incr, get }));

    const mod = await import('../security-middleware-edge');
    const { RateLimitMiddleware } = mod;

    const mw = new RateLimitMiddleware();
    // override config for deterministic test
    (mw as any).config = { enabled: true, windowMs: 60000, maxRequests: 5, standardHeaders: true, legacyHeaders: true };

    const res = await mw.handle(makeReq('/api/test'));
    expect(res).toBeNull();
    expect(incr).toHaveBeenCalled();
    const [key] = incr.mock.calls[0];
    expect(key).toMatch(/^rl:v1:[0-9a-f]{64}$/);
    expect(key).not.toContain('1.2.3.4');
    expect(key).not.toContain('/api/test');
  });

  it('blocks requests when over limit and sets headers', async () => {
    process.env.RATE_LIMIT_BACKEND = 'redis';

    const incr = vi.fn().mockResolvedValue({ count: 10, resetAfterMs: 12_345 });
    const get = vi.fn().mockResolvedValue(10);

    vi.doMock('@/lib/upstash', () => ({ incrWithExpire: incr, get }));

    const mod = await import('../security-middleware-edge');
    const { RateLimitMiddleware } = mod;

    const mw = new RateLimitMiddleware();
    (mw as any).config = { enabled: true, windowMs: 60000, maxRequests: 5, standardHeaders: true, legacyHeaders: true };

    const res = await mw.handle(makeReq('/api/blocked'));
    expect(res).not.toBeNull();
    expect((res as any).status).toBe(429);
    expect((res as any).headers.get('X-RateLimit-Limit')).toBe('5');
    expect((res as any).headers.get('Retry-After')).toBe('13');
    expect((res as any).headers.get('RateLimit-Reset')).toBe('13');
  });

  it('fails closed when the configured Upstash backend errors', async () => {
    process.env.RATE_LIMIT_BACKEND = 'redis';

    const incr = vi.fn().mockRejectedValue(new Error('network'));
    const get = vi.fn().mockRejectedValue(new Error('network'));

    vi.doMock('@/lib/upstash', () => ({ incrWithExpire: incr, get }));

    const mod = await import('../security-middleware-edge');
    const { RateLimitMiddleware } = mod;

    const mw = new RateLimitMiddleware();
    (mw as any).config = { enabled: true, windowMs: 1000, maxRequests: 2, standardHeaders: true, legacyHeaders: false };

    const response = await mw.handle(makeReq('/api/mem'));
    expect(response).not.toBeNull();
    expect((response as any).status).toBe(503);
    expect((response as any).headers.get('Retry-After')).toBe('5');
  });

  it('fails closed in production when no distributed backend is selected', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.RATE_LIMIT_BACKEND;

    const mod = await import('../security-middleware-edge');
    const mw = new mod.RateLimitMiddleware();
    (mw as any).config = { enabled: true, windowMs: 1000, maxRequests: 2, standardHeaders: true, legacyHeaders: false };

    const response = await mw.handle(makeReq('/api/production'));
    expect(response?.status).toBe(503);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.get('Retry-After')).toBe('5');
  });

  it('fails closed when Redis is selected without both credentials', async () => {
    process.env.RATE_LIMIT_BACKEND = 'redis';
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const mod = await import('../security-middleware-edge');
    const mw = new mod.RateLimitMiddleware();
    (mw as any).config = { enabled: true, windowMs: 1000, maxRequests: 2, standardHeaders: true, legacyHeaders: false };

    expect((await mw.handle(makeReq('/api/misconfigured')))?.status).toBe(503);
  });

  it('retains the in-memory backend for development and tests only', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    delete process.env.RATE_LIMIT_BACKEND;

    const mod = await import('../security-middleware-edge');
    const mw = new mod.RateLimitMiddleware();
    (mw as any).config = { enabled: true, windowMs: 1000, maxRequests: 1, standardHeaders: true, legacyHeaders: false };

    expect(await mw.handle(makeReq('/api/local'))).toBeNull();
    expect((await mw.handle(makeReq('/api/local')))?.status).toBe(429);
  });

  it('does not rate-limit page navigations', async () => {
    const mod = await import('../security-middleware-edge');
    const mw = new mod.RateLimitMiddleware();
    (mw as any).config = { enabled: true, windowMs: 1000, maxRequests: 0, standardHeaders: true, legacyHeaders: false };

    expect(await mw.handle(makeReq('/en/apartment'))).toBeNull();
  });

  it('keeps direct runtime health probes independent of proxy client identity', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.TRUST_PROXY_HOPS;
    delete process.env.TRUST_PROXY_MODE;
    delete process.env.RATE_LIMIT_BACKEND;

    const mod = await import('../security-middleware-edge');
    const mw = new mod.RateLimitMiddleware();
    (mw as any).config = { enabled: true, windowMs: 1000, maxRequests: 0, standardHeaders: true, legacyHeaders: false };

    expect(await mw.handle(makeReq('/api/health/ready'))).toBeNull();
  });

  it('does not let health-like prefixes bypass the limiter', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.TRUST_PROXY_HOPS;
    delete process.env.TRUST_PROXY_MODE;
    process.env.RATE_LIMIT_BACKEND = 'redis';

    const mod = await import('../security-middleware-edge');
    const mw = new mod.RateLimitMiddleware();
    (mw as any).config = { enabled: true, windowMs: 1000, maxRequests: 1, standardHeaders: true, legacyHeaders: false };

    expect((await mw.handle(makeReq('/api/health-expensive')))?.status).toBe(503);
  });

  it('skips the general limiter when no trusted client IP exists', async () => {
    delete process.env.TRUST_PROXY_HOPS;
    delete process.env.TRUST_PROXY_MODE;
    process.env.RATE_LIMIT_BACKEND = 'redis';
    const incr = vi.fn().mockResolvedValue({ count: 100, resetAfterMs: 1_000 });
    vi.doMock('@/lib/upstash', () => ({ incrWithExpire: incr }));

    const mod = await import('../security-middleware-edge');
    const mw = new mod.RateLimitMiddleware();
    (mw as any).config = { enabled: true, windowMs: 1000, maxRequests: 1, standardHeaders: true, legacyHeaders: false };

    expect(await mw.handle(makeReq('/api/no-client-ip'))).toBeNull();
    expect(incr).not.toHaveBeenCalled();
  });

  it('fails closed when production cannot derive a trusted client identity', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.TRUST_PROXY_HOPS;
    delete process.env.TRUST_PROXY_MODE;
    process.env.RATE_LIMIT_BACKEND = 'redis';
    const incr = vi.fn().mockResolvedValue({ count: 1, resetAfterMs: 1_000 });
    vi.doMock('@/lib/upstash', () => ({ incrWithExpire: incr }));

    const mod = await import('../security-middleware-edge');
    const mw = new mod.RateLimitMiddleware();
    (mw as any).config = { enabled: true, windowMs: 1000, maxRequests: 1, standardHeaders: true, legacyHeaders: false };

    expect((await mw.handle(makeReq('/api/no-production-ip')))?.status).toBe(503);
    expect(incr).not.toHaveBeenCalled();
  });
});
