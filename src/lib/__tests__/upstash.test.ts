import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

const BASE = 'https://example.upstash.io';

describe('Upstash wrapper', () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // set env before importing the module (module reads env at load time)
    process.env.UPSTASH_REDIS_REST_URL = BASE;
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
  (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetAllMocks();
  });

  it('incrWithExpire should call incr then expire when count === 1', async () => {
    // first call: incr -> returns { result: 1 }
    // second call: expire -> returns {} (ok)
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: true }), { status: 200 }));

    const upstash = await import('../upstash');

    const count = await upstash.incrWithExpire('my-key', 15000);

    expect(count).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0] as any[])[0]).toBe(`${BASE}/incr/my-key`);
    expect((fetchMock.mock.calls[1] as any[])[0]).toMatch(new RegExp(`^${BASE}/expire/my-key/`));
  });

  it('incrWithExpire should not call expire when count > 1', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: 5 }), { status: 200 }));

    const upstash = await import('../upstash');

    const count = await upstash.incrWithExpire('another-key', 60000);

    expect(count).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as any[])[0]).toBe(`${BASE}/incr/another-key`);
  });

  it('get should return number or null', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: 3 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: null }), { status: 200 }));

    const upstash = await import('../upstash');

    const v1 = await upstash.get('k1');
    expect(v1).toBe(3);

    const v2 = await upstash.get('k2');
    expect(v2).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('del should call del endpoint with POST', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: 1 }), { status: 200 }));
    const upstash = await import('../upstash');

    await expect(upstash.del('key-to-del')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as any;
    expect(url).toBe(`${BASE}/del/key-to-del`);
    expect(opts.method).toBe('POST');
  });

  it('ping should return true on success and false on failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: 'PONG' }), { status: 200 }));
    const upstash = await import('../upstash');
    await expect(upstash.ping()).resolves.toBe(true);

    // simulate network/server error
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(upstash.ping()).resolves.toBe(false);
  });
});
