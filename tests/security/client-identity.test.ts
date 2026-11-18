import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logger-enterprise';
import {
  ClientIdentityUnavailableError,
  createClientIdentityUnavailableResponse,
  requireCanonicalClientIp,
} from '@/lib/net/clientIdentity';
import { canonicalizeClientIp, getClientIp } from '@/lib/net/getClientIp';
import { mapApiErrorToUI } from '@/lib/userFacingErrors';
const CLIENT_IDENTITY_UNAVAILABLE = 'CLIENT_IDENTITY_UNAVAILABLE'; // response contract value

describe('canonical client identity', () => {
  const secret = '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2';

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['203.0.113.10', '203.0.113.10'],
    ['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
    ['::ffff:203.0.113.10', '203.0.113.10'],
  ] as const)('canonicalizes %s', (input, expected) => {
    expect(canonicalizeClientIp(input)).toBe(expected);
  });

  it.each([
    '',
    'unknown',
    ' 203.0.113.10',
    '203.0.113.10,198.51.100.20',
    '203.0.113.10:443',
    '[2001:db8::1]',
    'fe80::1%eth0',
    '1::2::3',
  ])('rejects %j', (input) => {
    expect(canonicalizeClientIp(input)).toBeNull();
  });

  it('preserves a valid configured single-address source and canonicalizes IPv6', () => {
    vi.stubEnv('ORIGIN_PROXY_SHARED_SECRET', secret);
    const request = new NextRequest('https://guest.test/api/auth', {
      headers: {
        'x-origin-verified-client-ip': '2001:0DB8:0000:0000:0000:0000:0000:0001',
        'x-origin-proxy-attestation': secret,
      },
    });

    expect(requireCanonicalClientIp(request)).toBe('2001:db8::1');
  });

  it('rejects a valid private IP paired with the wrong attestation', () => {
    vi.stubEnv('ORIGIN_PROXY_SHARED_SECRET', secret);
    const request = new NextRequest('https://guest.test/api/auth', {
      headers: {
        'x-origin-verified-client-ip': '203.0.113.10',
        'x-origin-proxy-attestation': 'fedcba9876543210'.repeat(4),
      },
    });

    expect(() => requireCanonicalClientIp(request)).toThrow(expect.objectContaining({
      code: CLIENT_IDENTITY_UNAVAILABLE,
      reason: 'attestation_rejected',
    }));
  });

  it.each([
    ['a valid attestation', secret],
    ['a wrong attestation', 'fedcba9876543210'.repeat(4)],
  ])('reports an absent client-IP header as missing, not as the sentinel, with %s', (_label, attestation) => {
    vi.stubEnv('ORIGIN_PROXY_SHARED_SECRET', secret);
    const request = new NextRequest('https://guest.test/api/auth', {
      headers: { 'x-origin-proxy-attestation': attestation },
    });

    expect(() => requireCanonicalClientIp(request)).toThrow(expect.objectContaining({
      code: CLIENT_IDENTITY_UNAVAILABLE,
      reason: 'missing',
    }));
  });

  it('keeps the sentinel reason for an upstream that sends the literal unknown', () => {
    vi.stubEnv('ORIGIN_PROXY_SHARED_SECRET', secret);
    const request = new NextRequest('https://guest.test/api/auth', {
      headers: {
        'x-origin-verified-client-ip': 'unknown',
        'x-origin-proxy-attestation': secret,
      },
    });

    expect(() => requireCanonicalClientIp(request)).toThrow(expect.objectContaining({
      code: CLIENT_IDENTITY_UNAVAILABLE,
      reason: 'sentinel',
    }));
  });

  it('keeps internal classification out of the shared public response', async () => {
    const response = createClientIdentityUnavailableResponse();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBeNull();
    expect(await response.json()).toEqual({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
    });
    expect(JSON.stringify(await createClientIdentityUnavailableResponse().json()))
      .not.toContain(CLIENT_IDENTITY_UNAVAILABLE);
  });

  it('is shown to an en guest as the unavailable message, not the generic one', async () => {
    const body = await createClientIdentityUnavailableResponse().json();
    const mapped = mapApiErrorToUI(body, 'en');

    expect(mapped.summary).toContain('temporarily unavailable');
    expect(mapped.summary).not.toBe(mapApiErrorToUI(null, 'en').summary);
  });

  it('logs only the bounded rejection reason at warn level', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    createClientIdentityUnavailableResponse(new ClientIdentityUnavailableError('missing'));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toEqual({ reason: 'missing' });
    const logged = JSON.stringify(warn.mock.calls);
    for (const value of ['x-origin', 'forwarded', CLIENT_IDENTITY_UNAVAILABLE]) {
      expect(logged).not.toContain(value);
    }
  });

  describe('trusted proxy IP extraction (getClientIp)', () => {
    function rawRequest(headers: Record<string, string>): NextRequest {
      return {
        headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      } as unknown as NextRequest;
    }

    it('canonicalizes attested IPv6 and IPv4-mapped IPv6 and ignores public candidates', () => {
      vi.stubEnv('ORIGIN_PROXY_SHARED_SECRET', secret);
      expect(getClientIp(rawRequest({
        'x-origin-verified-client-ip': '2001:0DB8:0000:0000:0000:0000:0000:0001',
        'x-origin-proxy-attestation': secret,
      }))).toBe('2001:db8::1');
      expect(getClientIp(rawRequest({
        'cf-connecting-ip': '198.51.100.1',
        'x-forwarded-for': '198.51.100.2',
        'x-real-ip': '198.51.100.3',
        forwarded: 'for=198.51.100.4',
        'x-origin-verified-client-ip': '::ffff:203.0.113.10',
        'x-origin-proxy-attestation': secret,
      }))).toBe('203.0.113.10');
    });

    it.each([
      ['missing attestation', { 'x-origin-verified-client-ip': '203.0.113.10' }],
      ['missing private IP', { 'x-origin-proxy-attestation': secret }],
      ['wrong attestation', { 'x-origin-verified-client-ip': '203.0.113.10', 'x-origin-proxy-attestation': 'fedcba9876543210'.repeat(4) }],
      ['duplicated attestation', { 'x-origin-verified-client-ip': '203.0.113.10', 'x-origin-proxy-attestation': `${secret}, ${secret}` }],
      ['IP with port', { 'x-origin-verified-client-ip': '203.0.113.10:443', 'x-origin-proxy-attestation': secret }],
      ['CF-Connecting-IP alone', { 'cf-connecting-ip': '203.0.113.195' }],
      ['X-Real-IP alone', { 'x-real-ip': '203.0.113.195' }],
      ['X-Forwarded-For alone', { 'x-forwarded-for': '203.0.113.195' }],
    ] as const)('returns unknown for %s', (_label, headers) => {
      vi.stubEnv('ORIGIN_PROXY_SHARED_SECRET', secret);
      expect(getClientIp(rawRequest(headers))).toBe('unknown');
    });
  });
});
