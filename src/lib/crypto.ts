import crypto from 'node:crypto';

import { requirePepper } from '@/lib/pepper';

// Read at each call, never at import: `next build` imports this module without a pepper.
function digest(value: string, salt: string): string {
  return crypto.createHash('sha256').update(`${requirePepper('SECURITY_PEPPER')}:${salt}:${value}`).digest('hex');
}

export function hashSensitive(value: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  return { hash: digest(value, salt), salt };
}

export function verifySensitive(value: string, salt: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) {
    return false;
  }

  const actual = Buffer.from(digest(value, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
