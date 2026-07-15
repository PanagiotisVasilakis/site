import crypto from 'node:crypto';

// Cache generated dev secrets across requests and module reloads
type DevSecretGlobal = typeof globalThis & {
  __devSecurityPepper?: string;
  __devPepperWarned?: boolean;
};

const devSecretGlobal = globalThis as DevSecretGlobal;

let generatedDevPepper: string | null = devSecretGlobal.__devSecurityPepper ?? null;
let loggedDevPepperWarning = devSecretGlobal.__devPepperWarned ?? false;

const currentNextPhase = process.env.NEXT_PHASE;
const isBuildPhase = currentNextPhase === 'phase-production-build' || currentNextPhase === 'phase-export';
const shouldLogDevWarnings = !isBuildPhase;

// Env keys: keep short, documented names
const PEPPER = getPepper();

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
