import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const executeRaw = vi.hoisted(() => vi.fn());
const privacyHmac = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: transaction, $executeRaw: executeRaw } }));
vi.mock('@/lib/privacyHash', () => ({ privacyHmac }));

import { checkSensitiveRateLimit, refundSensitiveIdentifierAttempt } from '@/lib/sensitiveRateLimit';
const CLIENT_IDENTITY_UNAVAILABLE = 'CLIENT_IDENTITY_UNAVAILABLE'; // response contract value

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

  it('refunds only the identifier dimension, with the key the check counted', async () => {
    executeRaw.mockResolvedValue(1);
    await checkSensitiveRateLimit(request('203.0.113.10'), {
      scope: 'portal-signin',
      identifier: '691 234 5678',
      limit: 3,
      windowMs: 60_000,
    });
    const [ipKey, identifierKey] = queryRaw.mock.calls.map((call) => call[1]);

    await refundSensitiveIdentifierAttempt({ scope: 'portal-signin', identifier: '+30 691 234 5678' });

    expect(executeRaw).toHaveBeenCalledOnce();
    const [sql, key] = executeRaw.mock.calls[0];
    expect(key).toBe(identifierKey);
    expect(key).not.toBe(ipKey);
    expect(sql.join('?')).toMatch(/GREATEST\("count" - 1, 0\)[\s\S]*"reset_time" > CURRENT_TIMESTAMP/);
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

  // normalizePhone, which sign-in and claim use, drops every JavaScript \s character and accepts a
  // '+' behind separators, so the limiter has to give all of those spellings one identifier bucket.
  async function identifierBucket(identifier: string) {
    privacyHmac.mockClear();
    queryRaw.mockClear();
    await checkSensitiveRateLimit(request('203.0.113.10'), {
      scope: 'portal-signin', identifier, limit: 3, windowMs: 60_000,
    });
    return {
      dimension: privacyHmac.mock.calls[1][0] as string,
      key: queryRaw.mock.calls[1][1] as string,
    };
  }

  it.each([
    ['a tab', '+30\t6912345678'],
    ['no-break spaces', '+30\u00a0691\u00a0234\u00a05678'],
    ['ideographic spaces', '+30\u3000691\u3000234\u30005678'],
    ['a parenthesised country code', '(+30) 691 234 5678'],
  ] as const)('maps a phone number written with %s to the same identifier bucket', async (_label, identifier) => {
    const reference = await identifierBucket('+30 691 234 5678');
    const spelled = await identifierBucket(identifier);

    expect(reference.dimension).toBe('portal-signin|identifier:+306912345678');
    expect(spelled).toEqual(reference);
  });

  it('maps a phone number separated by any JavaScript whitespace character to the same identifier bucket', async () => {
    const reference = await identifierBucket('+306912345678');
    const separators = Array.from({ length: 0x10000 }, (_, code) => code).filter((code) => /\s/.test(String.fromCharCode(code)));

    expect(separators).toContain(0xa0);
    for (const code of separators) {
      const separator = String.fromCharCode(code);
      const spelled = await identifierBucket(`+30${separator}691${separator}234${separator}5678`);
      expect(spelled, `U+${code.toString(16).padStart(4, '0')}`).toEqual(reference);
    }
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
      'portal-signin|ip6:2001:db8:0:0::/64',
      'sensitive-rate-limit:v1',
    );
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(decision.allowed).toBe(true);
  });

  async function addressDimension(ip: string, identifier?: string) {
    privacyHmac.mockClear();
    queryRaw.mockClear();
    await checkSensitiveRateLimit(request(ip), {
      scope: 'portal-signin', identifier, limit: 3, windowMs: 60_000,
    });
    return {
      dimension: privacyHmac.mock.calls[0][0] as string,
      key: queryRaw.mock.calls[0][1] as string,
      identifierKey: queryRaw.mock.calls[1]?.[1] as string | undefined,
    };
  }

  it('groups IPv6 clients by their /64 network for the address dimension', async () => {
    const first = await addressDimension('2001:db8:1:2::1');
    const rotated = await addressDimension('2001:db8:1:2:ffff::9');

    expect(first.dimension).toBe('portal-signin|ip6:2001:db8:1:2::/64');
    expect(rotated.dimension).toBe(first.dimension);
    expect(rotated.key).toBe(first.key);

    // Canonical IPv6 without a zero run stays uncompressed (no '::'), e.g. SLAAC/privacy addresses.
    const full = await addressDimension('2a02:587:c4a0:1b00:a1b2:c3d4:e5f6:789a');
    const fullRotated = await addressDimension('2a02:587:c4a0:1b00:1:2:3:4');

    expect(full.dimension).toBe('portal-signin|ip6:2a02:587:c4a0:1b00::/64');
    expect(fullRotated.key).toBe(full.key);
  });

  it.each([
    ['2001:db8:1:3::1', 'portal-signin|ip6:2001:db8:1:3::/64'],
    ['2001:db8::1:2:3:4', 'portal-signin|ip6:2001:db8:0:0::/64'],
    ['2001::1:2:3:4:5', 'portal-signin|ip6:2001:0:0:1::/64'],
  ] as const)('keeps %j outside the 2001:db8:1:2::/64 bucket', async (ip, expected) => {
    const reference = await addressDimension('2001:db8:1:2::1');
    const other = await addressDimension(ip);

    expect(other.dimension).toBe(expected);
    expect(other.key).not.toBe(reference.key);
  });

  it('expands compressed and fully written IPv6 forms to the same /64 key', async () => {
    const loopback = await addressDimension('::1');
    const expanded = await addressDimension('0000:0000:0000:0000:0000:0000:0000:0001');
    const sameNetwork = await addressDimension('0:0:0:0:1::');

    expect(loopback.dimension).toBe('portal-signin|ip6:0:0:0:0::/64');
    expect(expanded.key).toBe(loopback.key);
    expect(sameNetwork.key).toBe(loopback.key);
  });

  it('groups an IPv6 address written with an embedded IPv4 tail by its /64', async () => {
    const embedded = await addressDimension('64:ff9b::192.0.2.1');
    const sameNetwork = await addressDimension('64:ff9b::1');

    expect(embedded.dimension).toBe('portal-signin|ip6:64:ff9b:0:0::/64');
    expect(sameNetwork.key).toBe(embedded.key);
  });

  it('keeps IPv4 and IPv4-mapped IPv6 clients on the full IPv4 key', async () => {
    const ipv4 = await addressDimension('203.0.113.7');
    const mapped = await addressDimension('::ffff:203.0.113.7');

    expect(ipv4.dimension).toBe('portal-signin|ip:203.0.113.7');
    expect(mapped.dimension).toBe(ipv4.dimension);
    expect(mapped.key).toBe(ipv4.key);
  });

  it('leaves the identifier dimension and its refund independent of IPv6 grouping', async () => {
    executeRaw.mockResolvedValue(1);
    const ipv4 = await addressDimension('203.0.113.7', '691 234 5678');
    const ipv6 = await addressDimension('2001:db8:1:2::1', '691 234 5678');

    await refundSensitiveIdentifierAttempt({ scope: 'portal-signin', identifier: '+30 691 234 5678' });

    expect(ipv6.identifierKey).toBe(ipv4.identifierKey);
    expect(executeRaw).toHaveBeenCalledOnce();
    expect(executeRaw.mock.calls[0][1]).toBe(ipv6.identifierKey);
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
