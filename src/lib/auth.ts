import { sign, verify, JwtPayload, SignOptions } from 'jsonwebtoken';

// Lazy JWT secret initialization to avoid build-time issues
function getJwtSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET;
  
  // In production, we must have a secure secret
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error('ADMIN_JWT_SECRET environment variable is required in production');
  }
  
  // In development, warn if using default secret
  if (!secret && process.env.NODE_ENV !== 'production') {
    console.warn('⚠️  Using default JWT secret in development. Set ADMIN_JWT_SECRET for production.');
    return 'dev-secret-change-me';
  }
  
  return secret!;
}

export function signAdmin(payload: Record<string, unknown>, expiresIn: NonNullable<SignOptions['expiresIn']> = '2h'): string {
  return sign(payload, getJwtSecret(), { expiresIn });
}

export function verifyAdmin(token: string): (JwtPayload & Record<string, unknown>) | null {
  try {
    return verify(token, getJwtSecret()) as JwtPayload & Record<string, unknown>;
  } catch {
    return null;
  }
}
