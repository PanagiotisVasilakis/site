import crypto from 'node:crypto';

import { requirePepper } from '@/lib/pepper';

export function privacyHmac(value: string, context: string): string {
  return crypto
    .createHmac('sha256', requirePepper('SECURITY_PEPPER'))
    .update(`${context}\0${value}`)
    .digest('hex');
}
