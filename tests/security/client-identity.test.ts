import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CLIENT_IDENTITY_UNAVAILABLE,
  canonicalizeClientIp,
  createClientIdentityUnavailableResponse,
  requireCanonicalClientIp,
} from '@/lib/net/clientIdentity';

describe('canonical client identity', () => {
  const secret = '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2';

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['203.0.113.10', '203.0.113.10'],
    ['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
    ['2001:db8::2', '2001:db8::2'],
    ['::ffff:203.0.113.10', '203.0.113.10'],
    ['::ffff:cb00:710a', '203.0.113.10'],
  ] as const)('canonicalizes %s', (input, expected) => {
    expect(canonicalizeClientIp(input)).toBe(expected);
  });

  it.each([
    '',
    'unknown',
    ' 203.0.113.10',
    '203.0.113.10 ',
    '203.0.113.10,198.51.100.20',
    '203.0.113.10:443',
    '[2001:db8::1]',
    '[2001:db8::1]:443',
    'guest.example.test',
    'fe80::1%eth0',
    '::::',
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
    }));
  });

  it('keeps internal classification out of the shared public response', async () => {
    const response = createClientIdentityUnavailableResponse();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBeNull();
    expect(await response.json()).toEqual({
      success: false,
      error: { message: 'Service temporarily unavailable' },
    });
    expect(JSON.stringify(await createClientIdentityUnavailableResponse().json()))
      .not.toContain(CLIENT_IDENTITY_UNAVAILABLE);
  });
});
