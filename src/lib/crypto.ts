import crypto from 'node:crypto';

// Cache generated dev secrets across requests and module reloads
type DevSecretGlobal = typeof globalThis & {
  __devSecurityPepper?: string;
  __devSecurityEncKey?: Buffer;
  __devPepperWarned?: boolean;
  __devEncKeyWarned?: boolean;
};

const devSecretGlobal = globalThis as DevSecretGlobal;

let generatedDevPepper: string | null = devSecretGlobal.__devSecurityPepper ?? null;
let generatedDevEncKey: Buffer | null = devSecretGlobal.__devSecurityEncKey ?? null;
let loggedDevPepperWarning = devSecretGlobal.__devPepperWarned ?? false;
let loggedDevEncKeyWarning = devSecretGlobal.__devEncKeyWarned ?? false;

const currentNextPhase = process.env.NEXT_PHASE;
const isBuildPhase = currentNextPhase === 'phase-production-build' || currentNextPhase === 'phase-export';
const shouldLogDevWarnings = !isBuildPhase;

// Env keys: keep short, documented names
const PEPPER = getPepper();
const ENC_KEY_HEX = process.env.SECURITY_ENC_KEY_HEX; // 32 bytes hex for AES-256

// Key rotation support
const ENC_KEY_HEX_PREVIOUS = process.env.SECURITY_ENC_KEY_HEX_PREVIOUS; // Previous key for decryption during rotation

function isRuntimeProduction(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }

  // During `next build`, Next.js sets NEXT_PHASE=phase-production-build.
  // In that phase we allow fallbacks so the build can complete without production secrets.
  const nextPhase = process.env.NEXT_PHASE;
  if (nextPhase === 'phase-production-build' || nextPhase === 'phase-export') {
    return false;
  }

  return true;
}

function getPepper(): string {
  const envPepper = process.env.SECURITY_PEPPER;
  
  if (envPepper) {
    return envPepper;
  }
  
  if (isRuntimeProduction()) {
    throw new Error('SECURITY_PEPPER environment variable is required in production');
  }
  
  // Generate cryptographically strong random pepper for development
  if (!generatedDevPepper) {
    generatedDevPepper = crypto.randomBytes(32).toString('hex');
    devSecretGlobal.__devSecurityPepper = generatedDevPepper;
    if (!loggedDevPepperWarning && shouldLogDevWarnings) {
      loggedDevPepperWarning = true;
      devSecretGlobal.__devPepperWarned = true;
      console.warn('Generated an ephemeral SECURITY_PEPPER for this development process; set it in .env.local to preserve encrypted data across restarts.');
    }
  } else if (!loggedDevPepperWarning && shouldLogDevWarnings) {
    loggedDevPepperWarning = true;
    devSecretGlobal.__devPepperWarned = true;
    console.warn('⚠️  Using cached development SECURITY_PEPPER (set SECURITY_PEPPER in .env to persist)');
  }
  
  return generatedDevPepper;
}

function getEncKey(): Buffer {
  if (!ENC_KEY_HEX) {
    if (isRuntimeProduction()) {
      throw new Error('SECURITY_ENC_KEY_HEX must be set to a 64-char hex (32 bytes) in production');
    }
    // Generate cryptographically strong random encryption key for development
    if (!generatedDevEncKey) {
      generatedDevEncKey = crypto.randomBytes(32);
      devSecretGlobal.__devSecurityEncKey = generatedDevEncKey;
      if (!loggedDevEncKeyWarning && shouldLogDevWarnings) {
        loggedDevEncKeyWarning = true;
        devSecretGlobal.__devEncKeyWarned = true;
        console.warn('Generated an ephemeral SECURITY_ENC_KEY_HEX for this development process; set it in .env.local to preserve encrypted data across restarts.');
      }
    } else if (!loggedDevEncKeyWarning && shouldLogDevWarnings) {
      loggedDevEncKeyWarning = true;
      devSecretGlobal.__devEncKeyWarned = true;
      console.warn('⚠️  Using cached development SECURITY_ENC_KEY (set SECURITY_ENC_KEY_HEX in .env to persist)');
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
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) {
    return false;
  }

  const h = crypto.createHash('sha256').update(PEPPER + ':' + salt + ':' + value).digest('hex');
  const actual = Buffer.from(h, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
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
