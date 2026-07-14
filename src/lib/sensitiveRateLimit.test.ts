import { NextRequest } from 'next/server';

import { checkSensitiveRateLimit, clearSensitiveRateLimitTestStore } from '@/lib/sensitiveRateLimit';

function request(ip: string) {
  return new NextRequest('http://localhost/api/auth', { headers: { 'x-forwarded-for': ip } });
}

describe('sensitive rate limiting dimensions', () => {
  beforeEach(() => {
    clearSensitiveRateLimitTestStore();
    process.env.TRUST_PROXY_MODE = 'hops';
    process.env.TRUST_PROXY_HOPS = '1';
  });

  afterEach(() => {
    delete process.env.TRUST_PROXY_MODE;
    delete process.env.TRUST_PROXY_HOPS;
  });

  it('enforces an IP bucket independently of the submitted identifier', async () => {
    const options = { scope: 'signin-test', identifier: 'first', limit: 1, windowMs: 60_000 };
    await expect(checkSensitiveRateLimit(request('203.0.113.10'), options)).resolves.toMatchObject({ allowed: true });
    await expect(checkSensitiveRateLimit(request('203.0.113.10'), { ...options, identifier: 'second' }))
      .resolves.toMatchObject({ allowed: false });
  });

  it('enforces an identifier bucket independently of source IP', async () => {
    const options = { scope: 'signin-test', identifier: 'same-account', limit: 1, windowMs: 60_000 };
    await expect(checkSensitiveRateLimit(request('203.0.113.11'), options)).resolves.toMatchObject({ allowed: true });
    await expect(checkSensitiveRateLimit(request('203.0.113.12'), options)).resolves.toMatchObject({ allowed: false });
  });
});
