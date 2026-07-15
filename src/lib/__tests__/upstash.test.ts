

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

  it('increments and assigns the TTL atomically with one Redis script', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: [1, 15000] }), { status: 200 }));

    const upstash = await import('../upstash');

    const result = await upstash.incrWithExpire('my-key', 15000);

    expect(result).toEqual({ count: 1, resetAfterMs: 15000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(BASE);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(options.body))).toEqual([
      'EVAL',
      expect.stringContaining("redis.call('PEXPIRE'"),
      1,
      'my-key',
      15000,
    ]);
  });

  it('returns subsequent atomic increment results', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: [5, 42000] }), { status: 200 }));

    const upstash = await import('../upstash');

    const result = await upstash.incrWithExpire('another-key', 60000);

    expect(result).toEqual({ count: 5, resetAfterMs: 42000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed counter responses instead of failing open', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: ['not-a-number', 1000] }), { status: 200 }));
    const upstash = await import('../upstash');
    await expect(upstash.incrWithExpire('invalid-key', 60000)).rejects.toThrow('invalid rate-limit count');
  });

  it('rejects malformed TTL responses instead of inventing reset headers', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ result: [2, -1] }), { status: 200 }));
    const upstash = await import('../upstash');
    await expect(upstash.incrWithExpire('invalid-ttl', 60000)).rejects.toThrow('invalid rate-limit TTL');
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
