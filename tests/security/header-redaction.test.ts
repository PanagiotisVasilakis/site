import { describe, expect, it } from 'vitest';

import { isSensitiveFieldName } from '@/lib/redaction';

describe('trusted-ingress diagnostic redaction', () => {
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
