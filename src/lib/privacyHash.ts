import crypto from 'node:crypto';

export function privacyHmac(value: string, context: string): string {
  const pepper = process.env.SECURITY_PEPPER;
  if (process.env.NODE_ENV === 'production' && !pepper) {
    throw new Error('SECURITY_PEPPER is required for privacy-preserving hashes');
  }
  return crypto
    .createHmac('sha256', pepper || 'development-only-privacy-hash-pepper')
    .update(`${context}\0${value}`)
    .digest('hex');
}
