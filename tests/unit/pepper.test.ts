import { afterEach, describe, expect, it, vi } from 'vitest';

import { requirePepper } from '@/lib/pepper';
import { privacyHmac } from '@/lib/privacyHash';

describe('HMAC keys have no fallback', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['development', 'production'] as const)('refuses a missing claim-token pepper in %s', (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('SECURITY_PEPPER', 's'.repeat(32));
    vi.stubEnv('CLAIM_TOKEN_PEPPER', '');

    expect(() => requirePepper('CLAIM_TOKEN_PEPPER')).toThrow('CLAIM_TOKEN_PEPPER is required');
  });

  it('does not use the security pepper for claim tokens', () => {
    vi.stubEnv('SECURITY_PEPPER', 's'.repeat(32));
    vi.stubEnv('CLAIM_TOKEN_PEPPER', 'c'.repeat(32));

    expect(requirePepper('CLAIM_TOKEN_PEPPER')).toBe('c'.repeat(32));
  });

  it('refuses privacy hashes without SECURITY_PEPPER outside production too', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SECURITY_PEPPER', '');

    expect(() => privacyHmac('203.0.113.7', 'security-event-ip:v1')).toThrow('SECURITY_PEPPER is required');
  });

  it('keys privacy hashes with SECURITY_PEPPER', () => {
    vi.stubEnv('SECURITY_PEPPER', 'a'.repeat(32));
    const first = privacyHmac('203.0.113.7', 'ctx');
    vi.stubEnv('SECURITY_PEPPER', 'b'.repeat(32));

    expect(privacyHmac('203.0.113.7', 'ctx')).not.toBe(first);
  });
});
