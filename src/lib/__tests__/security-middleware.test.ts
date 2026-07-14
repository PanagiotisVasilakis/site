

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  process.env.TRUST_PROXY_HOPS = '1';
  process.env.TRUST_PROXY_MODE = 'hops';
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
});

afterEach(() => {
  delete process.env.RATE_LIMIT_BACKEND;
  delete process.env.TRUST_PROXY_HOPS;
  delete process.env.TRUST_PROXY_MODE;
  delete process.env.UPSTASH_REDIS_REST_URL;
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

    const incr = vi.fn().mockResolvedValue(1);
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
  });

  it('blocks requests when over limit and sets headers', async () => {
    process.env.RATE_LIMIT_BACKEND = 'redis';

    const incr = vi.fn().mockResolvedValue(10);
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

  it('does not rate-limit page navigations', async () => {
    const mod = await import('../security-middleware-edge');
    const mw = new mod.RateLimitMiddleware();
    (mw as any).config = { enabled: true, windowMs: 1000, maxRequests: 0, standardHeaders: true, legacyHeaders: false };

    expect(await mw.handle(makeReq('/en/apartment'))).toBeNull();
  });

  it('skips the general limiter when no trusted client IP exists', async () => {
    delete process.env.TRUST_PROXY_HOPS;
    delete process.env.TRUST_PROXY_MODE;
    process.env.RATE_LIMIT_BACKEND = 'redis';
    const incr = vi.fn().mockResolvedValue(100);
    vi.doMock('@/lib/upstash', () => ({ incrWithExpire: incr }));

    const mod = await import('../security-middleware-edge');
    const mw = new mod.RateLimitMiddleware();
    (mw as any).config = { enabled: true, windowMs: 1000, maxRequests: 1, standardHeaders: true, legacyHeaders: false };

    expect(await mw.handle(makeReq('/api/no-client-ip'))).toBeNull();
    expect(incr).not.toHaveBeenCalled();
  });
});
