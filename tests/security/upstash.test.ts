import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadUpstash() {
  vi.resetModules();
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token-that-is-long-enough');
  return import('@/lib/upstash');
}

describe('Upstash rate-limit adapter', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));

  it('increments and attaches expiry atomically through one EVAL request', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ result: [2, 4_500] }), { status: 200 }));
    const { incrWithExpire } = await loadUpstash();
    await expect(incrWithExpire('scope:key', 5_000)).resolves.toEqual({ count: 2, resetAfterMs: 4_500 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const command = JSON.parse(String(init?.body)) as unknown[];
    expect(command[0]).toBe('EVAL');
    expect(command).toEqual(expect.arrayContaining(['scope:key', 5_000]));
    expect(init?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer redis-token-that-is-long-enough' }));
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid windows before network I/O: %s', async (windowMs) => {
    const { incrWithExpire } = await loadUpstash();
    await expect(incrWithExpire('scope:key', windowMs)).rejects.toThrow('positive integer');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [{ result: 'invalid' }, 'invalid rate-limit result'],
    [{ result: [0, 500] }, 'invalid rate-limit count'],
    [{ result: [1, 0] }, 'invalid rate-limit TTL'],
    [{ result: [1, 6_000] }, 'invalid rate-limit TTL'],
  ])('rejects malformed Redis response %#', async (payload, message) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    const { incrWithExpire } = await loadUpstash();
    await expect(incrWithExpire('scope:key', 5_000)).rejects.toThrow(message);
  });

  it('surfaces bounded upstream failures', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('forbidden', { status: 403 }));
    const { incrWithExpire } = await loadUpstash();
    await expect(incrWithExpire('scope:key', 5_000)).rejects.toThrow('Upstash error 403: forbidden');
  });

  it('reports ping health without throwing', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: 'PONG' }), { status: 200 }))
      .mockRejectedValueOnce(new Error('offline'));
    const { ping } = await loadUpstash();
    await expect(ping()).resolves.toBe(true);
    await expect(ping()).resolves.toBe(false);
  });

  it('fails clearly when credentials are absent', async () => {
    vi.resetModules();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const { incrWithExpire, ping } = await import('@/lib/upstash');
    await expect(incrWithExpire('scope:key', 5_000)).rejects.toThrow('UPSTASH_REDIS_REST_URL');
    await expect(ping()).resolves.toBe(false);
  });
});
