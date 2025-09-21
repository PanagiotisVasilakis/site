import crypto from 'node:crypto';

// Env keys: keep short, documented names
const PEPPER = process.env.SECURITY_PEPPER || 'dev-pepper-change-me';
const ENC_KEY_HEX = process.env.SECURITY_ENC_KEY_HEX; // 32 bytes hex for AES-256

function getEncKey(): Buffer {
  if (!ENC_KEY_HEX) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SECURITY_ENC_KEY_HEX must be set to a 64-char hex (32 bytes) in production');
    }
    // Derive a deterministic 32-byte key from pepper as dev fallback
    return crypto.createHash('sha256').update(PEPPER).digest();
  }
  const buf = Buffer.from(ENC_KEY_HEX, 'hex');
  if (buf.length !== 32) throw new Error('SECURITY_ENC_KEY_HEX must be 32 bytes (64 hex chars)');
  return buf;
}

export function hashSensitive(value: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.createHash('sha256').update(PEPPER + ':' + salt + ':' + value).digest('hex');
  return { hash: h, salt };
}

export function verifySensitive(value: string, salt: string, expectedHash: string): boolean {
  const h = crypto.createHash('sha256').update(PEPPER + ':' + salt + ':' + value).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(expectedHash, 'hex'));
}

export function encryptJSON<T>(obj: T): string {
  const key = getEncKey();
  const iv = crypto.randomBytes(12); // GCM 96-bit IV
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptJSON<T = unknown>(b64: string): T {
  const key = getEncKey();
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

export function maskLast4(value: string): string {
  const last = value.slice(-4);
  return last.padStart(value.length, '•');
}

// Deterministic HMAC for lookups (not reversible, keyed by PEPPER)
export function hmacDeterministic(value: string): string {
  return crypto.createHmac('sha256', PEPPER).update(value).digest('hex');
}

// Encrypt/decrypt small strings (AES-256-GCM)
export function encryptString(value: string): string {
  const key = getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(value, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptString(b64: string): string {
  const key = getEncKey();
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
