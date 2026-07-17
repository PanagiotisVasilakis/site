import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const privacyHmac = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: transaction } }));
vi.mock('@/lib/privacyHash', () => ({ privacyHmac }));

import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';
import { CLIENT_IDENTITY_UNAVAILABLE } from '@/lib/net/clientIdentity';

const attestation = '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2';

function request(ip: string) {
  return new NextRequest('https://guest.test/api/auth', {
    headers: {
      'x-origin-verified-client-ip': ip,
      'x-origin-proxy-attestation': attestation,
    },
  });
}

function rawHeaderRequest(ip: string): NextRequest {
  return {
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'x-origin-verified-client-ip') return ip;
        if (name.toLowerCase() === 'x-origin-proxy-attestation') return attestation;
        return null;
      },
    },
  } as unknown as NextRequest;
}

describe('durable sensitive-operation rate limiting', () => {
  beforeEach(() => {
    vi.stubEnv('ORIGIN_PROXY_SHARED_SECRET', attestation);
    privacyHmac.mockImplementation((value: string, context: string) => {
      let hash = 2_166_136_261;
      for (const character of `${context}\0${value}`) {
        hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
      }
      return (hash >>> 0).toString(16).padStart(8, '0').repeat(8);
    });
    queryRaw.mockResolvedValue([{ count: 1, reset_time: new Date(Date.now() + 60_000) }]);
    transaction.mockImplementation(async (callback) => callback({ $queryRaw: queryRaw }));
  });

  it('uses both source-IP and normalized identifier dimensions', async () => {
    const decision = await checkSensitiveRateLimit(request('203.0.113.10'), {
      scope: 'portal-signin',
      identifier: '691 234 5678',
      limit: 3,
      windowMs: 60_000,
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledOnce();
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
    })).rejects.toMatchObject({ statusCode: 503, message: 'Service temporarily unavailable' });
  });

  it('keeps all dimensions inside one transaction and fails closed on storage error', async () => {
    queryRaw
      .mockResolvedValueOnce([{ count: 1, reset_time: new Date(Date.now() + 60_000) }])
      .mockRejectedValueOnce(new Error('synthetic storage failure'));

    await expect(checkSensitiveRateLimit(request('203.0.113.10'), {
      scope: 'portal-signin', identifier: 'account@example.test', limit: 3, windowMs: 60_000,
    })).rejects.toMatchObject({ statusCode: 503, message: 'Service temporarily unavailable' });
    expect(transaction).toHaveBeenCalledOnce();
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('fails before persistence instead of merging unknown callers into a universal IP bucket', async () => {
    const publicOnlyRequest = new NextRequest('https://guest.test/api/auth', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });

    await expect(checkSensitiveRateLimit(publicOnlyRequest, {
      scope: 'portal-signin',
      identifier: 'missing-identity@example.test',
      limit: 3,
      windowMs: 60_000,
    })).rejects.toMatchObject({ code: CLIENT_IDENTITY_UNAVAILABLE, reason: 'missing' });

    expect(queryRaw).not.toHaveBeenCalled();
    expect(privacyHmac).not.toHaveBeenCalled();
  });

  it('canonicalizes IPv6 before generating the limiter HMAC and persists normally', async () => {
    const decision = await checkSensitiveRateLimit(rawHeaderRequest(
      '2001:0DB8:0000:0000:0000:0000:0000:0001',
    ), {
      scope: 'portal-signin', limit: 3, windowMs: 60_000,
    });

    expect(privacyHmac).toHaveBeenCalledOnce();
    expect(privacyHmac).toHaveBeenCalledWith(
      'portal-signin|ip:2001:db8::1',
      'sensitive-rate-limit:v1',
    );
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(decision.allowed).toBe(true);
  });

  it.each([
    ['', 'missing'],
    ['   ', 'malformed'],
    ['unknown', 'sentinel'],
    [' 203.0.113.10', 'malformed'],
    ['203.0.113.10 ', 'malformed'],
    ['::::', 'unsupported_format'],
    ['203.0.113.10,198.51.100.20', 'multi_value'],
    ['203.0.113.10:443', 'unsupported_format'],
    ['guest.example.test', 'unsupported_format'],
    ['fe80::1%eth0', 'unsupported_format'],
  ] as const)('rejects non-canonical source %j before persistence', async (ip, reason) => {
    await expect(checkSensitiveRateLimit(rawHeaderRequest(ip), {
      scope: 'portal-signin', limit: 3, windowMs: 60_000,
    })).rejects.toMatchObject({ code: CLIENT_IDENTITY_UNAVAILABLE, reason });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(privacyHmac).not.toHaveBeenCalled();
  });
});
