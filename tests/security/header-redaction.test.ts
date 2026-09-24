import { describe, expect, it } from 'vitest';

import { sanitizeRequestHeaders } from '@/lib/apiErrorHandler';
import { isSensitiveFieldName } from '@/lib/redaction';

describe('trusted-ingress diagnostic redaction', () => {
  it('redacts every public and private identity header while preserving safe fields', () => {
    const headers = new Headers({
      authorization: 'Bearer secret',
      cookie: 'session=secret',
      'cf-connecting-ip': '203.0.113.1',
      'x-forwarded-for': '203.0.113.1, 198.51.100.1',
      'x-real-ip': '203.0.113.1',
      forwarded: 'for=203.0.113.1',
      'x-origin-verified-client-ip': '203.0.113.1',
      'x-origin-proxy-attestation': 'attestation-value',
      'cf-ray': 'bounded-correlation-id',
      'user-agent': 'Mozilla/5.0 (synthetic)',
      accept: 'application/json',
    });

    expect(sanitizeRequestHeaders(headers)).toEqual({
      accept: 'application/json',
      authorization: '[REDACTED]',
      'cf-connecting-ip': '[REDACTED]',
      'cf-ray': 'bounded-correlation-id',
      cookie: '[REDACTED]',
      forwarded: '[REDACTED]',
      'x-forwarded-for': '[REDACTED]',
      'x-origin-proxy-attestation': '[REDACTED]',
      'x-origin-verified-client-ip': '[REDACTED]',
      'x-real-ip': '[REDACTED]',
      'user-agent': '[REDACTED]',
    });
  });

  it.each([
    'cfConnectingIp',
    'x-forwarded-for',
    'xRealIp',
    'xOriginVerifiedClientIp',
    'xOriginProxyAttestation',
  ])('classifies %s as sensitive metadata', (field) => {
    expect(isSensitiveFieldName(field)).toBe(true);
  });
});
