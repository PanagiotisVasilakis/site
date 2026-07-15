import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: queryRaw } }));

import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';

function request(ip: string) {
  return new NextRequest('https://guest.test/api/auth', { headers: { 'x-forwarded-for': ip } });
}

describe('durable sensitive-operation rate limiting', () => {
  beforeEach(() => {
    vi.stubEnv('TRUST_PROXY_MODE', 'hops');
    vi.stubEnv('TRUST_PROXY_HOPS', '1');
    queryRaw.mockResolvedValue([{ count: 1, reset_time: new Date(Date.now() + 60_000) }]);
  });

  it('uses both source-IP and normalized identifier dimensions', async () => {
    const decision = await checkSensitiveRateLimit(request('203.0.113.10'), {
      scope: 'portal-signin',
      identifier: '691 234 5678',
      limit: 3,
      windowMs: 60_000,
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    const keys = queryRaw.mock.calls.map((call) => call[1]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^sensitive:[a-f0-9]{64}$/);
    expect(keys[1]).toMatch(/^sensitive:[a-f0-9]{64}$/);
    expect(keys[0]).not.toBe(keys[1]);
    expect(decision).toEqual(expect.objectContaining({ allowed: true, limit: 3, remaining: 2 }));
  });

  it('maps equivalent Greek phone formats to the same identifier bucket', async () => {
    await checkSensitiveRateLimit(request('203.0.113.10'), {
      scope: 'portal-signin', identifier: '691 234 5678', limit: 3, windowMs: 60_000,
    });
    const firstIdentifierKey = queryRaw.mock.calls[1][1];
    queryRaw.mockClear();
    queryRaw.mockResolvedValue([{ count: 1, reset_time: new Date(Date.now() + 60_000) }]);
    await checkSensitiveRateLimit(request('203.0.113.11'), {
      scope: 'portal-signin', identifier: '+30 691-234-5678', limit: 3, windowMs: 60_000,
    });
    expect(queryRaw.mock.calls[1][1]).toBe(firstIdentifierKey);
  });

  it('denies when any dimension exceeds the limit and returns the strictest reset', async () => {
    const firstReset = new Date(Date.now() + 30_000);
    const secondReset = new Date(Date.now() + 60_000);
    queryRaw
      .mockResolvedValueOnce([{ count: 2, reset_time: firstReset }])
      .mockResolvedValueOnce([{ count: 5, reset_time: secondReset }]);
    const decision = await checkSensitiveRateLimit(request('203.0.113.10'), {
      scope: 'portal-signin', identifier: 'account@example.test', limit: 3, windowMs: 60_000,
    });
    expect(decision).toEqual({
      allowed: false,
      limit: 3,
      remaining: 0,
      resetAt: secondReset,
    });
  });

  it('fails closed when persistence returns no decision', async () => {
    queryRaw.mockResolvedValue([]);
    await expect(checkSensitiveRateLimit(request('203.0.113.10'), {
      scope: 'portal-signin', limit: 3, windowMs: 60_000,
    })).rejects.toThrow('Rate limiter did not return a decision');
  });
});
