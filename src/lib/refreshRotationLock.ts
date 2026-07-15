import { createHash } from 'node:crypto';

const DATABASE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCK_KEY_DOMAIN = 'portal-refresh-generation-advisory-lock:v1\0';

/**
 * Maps one immutable refresh-generation UUID into PostgreSQL's signed 64-bit
 * advisory-lock key space. The raw refresh credential is never accepted or
 * included in the key derivation.
 */
export function refreshGenerationAdvisoryLockKey(generationId: string): bigint {
  if (!DATABASE_UUID_PATTERN.test(generationId)) {
    throw new Error('Refresh generation lock requires a database UUID');
  }

  const digest = createHash('sha256')
    .update(LOCK_KEY_DOMAIN, 'utf8')
    .update(generationId.toLowerCase(), 'utf8')
    .digest();
  return digest.readBigInt64BE(0);
}
