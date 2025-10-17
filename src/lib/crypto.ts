import crypto from 'node:crypto';

// Cache generated dev secrets to persist across requests in same process
let generatedDevPepper: string | null = null;
let generatedDevEncKey: Buffer | null = null;

// Env keys: keep short, documented names
const PEPPER = getPepper();
const ENC_KEY_HEX = process.env.SECURITY_ENC_KEY_HEX; // 32 bytes hex for AES-256

// Key rotation support
const ENC_KEY_HEX_PREVIOUS = process.env.SECURITY_ENC_KEY_HEX_PREVIOUS; // Previous key for decryption during rotation

function getPepper(): string {
  const envPepper = process.env.SECURITY_PEPPER;
  
  if (envPepper) {
    return envPepper;
  }
  
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SECURITY_PEPPER environment variable is required in production');
  }
  
  // Generate cryptographically strong random pepper for development
  if (!generatedDevPepper) {
    generatedDevPepper = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️  Generated random SECURITY_PEPPER for development session');
    console.warn(`⚠️  Pepper preview: ${generatedDevPepper.slice(0, 16)}...`);
    console.warn('⚠️  Set SECURITY_PEPPER in .env to persist across restarts');
  }
  
  return generatedDevPepper;
}

function getEncKey(): Buffer {
  if (!ENC_KEY_HEX) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SECURITY_ENC_KEY_HEX must be set to a 64-char hex (32 bytes) in production');
    }
    // Generate cryptographically strong random encryption key for development
    if (!generatedDevEncKey) {
      generatedDevEncKey = crypto.randomBytes(32);
      console.warn('⚠️  Generated random SECURITY_ENC_KEY for development session');
      console.warn(`⚠️  Key preview: ${generatedDevEncKey.toString('hex').slice(0, 16)}...`);
      console.warn('⚠️  Set SECURITY_ENC_KEY_HEX in .env to persist across restarts');
    }
    return generatedDevEncKey;
  }
  const buf = Buffer.from(ENC_KEY_HEX, 'hex');
  if (buf.length !== 32) throw new Error('SECURITY_ENC_KEY_HEX must be 32 bytes (64 hex chars)');
  return buf;
}

function getPreviousEncKey(): Buffer | undefined {
  if (!ENC_KEY_HEX_PREVIOUS) {
    return undefined;
  }
  const buf = Buffer.from(ENC_KEY_HEX_PREVIOUS, 'hex');
  if (buf.length !== 32) throw new Error('SECURITY_ENC_KEY_HEX_PREVIOUS must be 32 bytes (64 hex chars)');
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
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  
  // Try current key first
  try {
    const key = getEncKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  } catch (primaryError) {
    // If current key fails, try previous key for backward compatibility during rotation
    const prevKey = getPreviousEncKey();
    if (prevKey) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', prevKey, iv);
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return JSON.parse(plaintext.toString('utf8')) as T;
      } catch {
        // Both keys failed, rethrow original error
        throw primaryError;
      }
    }
    // No previous key, rethrow original error
    throw primaryError;
  }
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
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  
  // Try current key first
  try {
    const key = getEncKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (primaryError) {
    // If current key fails, try previous key for backward compatibility during rotation
    const prevKey = getPreviousEncKey();
    if (prevKey) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', prevKey, iv);
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return plaintext.toString('utf8');
      } catch {
        // Both keys failed, rethrow original error
        throw primaryError;
      }
    }
    // No previous key, rethrow original error
    throw primaryError;
  }
}

// Key management utilities
export function rotateEncryptionKey(): { newKeyHex: string; oldKeyHex?: string } {
  // Generate new key
  const newKey = crypto.randomBytes(32);
  const newKeyHex = newKey.toString('hex');
  
  // Return new key and current key (if exists)
  return {
    newKeyHex,
    oldKeyHex: ENC_KEY_HEX
  };
}

export function validateKeyFormat(keyHex: string): boolean {
  if (keyHex.length !== 64) return false;
  return /^[0-9a-fA-F]+$/.test(keyHex);
}