/**
 * Admin authentication system using JWT tokens
 * Used for: /admin/* routes, administrative operations
 */

import crypto from 'node:crypto';
import { sign, verify, JwtPayload, SignOptions } from 'jsonwebtoken';
import { BaseAuthPayload } from './common';

interface AdminAuthPayload extends BaseAuthPayload {
  type: 'admin';
  role: 'admin';
  jti?: string;
  login_at?: number;
  refreshed_at?: number;
}

// Cache generated dev secret to persist across requests in same process
let generatedDevSecret: string | null = null;

/**
 * Get JWT secret with production safety checks
 * In development, generates a cryptographically strong random secret
 */
function getJwtSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET;
  
  // In production, we must have a secure secret
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error('ADMIN_JWT_SECRET environment variable is required in production');
  }
  
  // In development, generate a cryptographically strong random secret
  if (!secret && process.env.NODE_ENV !== 'production') {
    if (!generatedDevSecret) {
      generatedDevSecret = crypto.randomBytes(32).toString('hex');
      console.warn('⚠️  Generated random JWT secret for development session');
      console.warn(`⚠️  Secret preview: ${generatedDevSecret.slice(0, 16)}...`);
      console.warn('⚠️  Set ADMIN_JWT_SECRET in .env to persist across restarts');
    }
    return generatedDevSecret;
  }
  
  return secret!;
}

/**
 * Sign an admin JWT token
 */
export function signAdmin(payload: Omit<AdminAuthPayload, 'type' | 'role' | 'iat' | 'exp'> & Partial<Pick<AdminAuthPayload, 'type' | 'role'>>, expiresIn: NonNullable<SignOptions['expiresIn']> = '2h'): string {
  const fullPayload: Omit<AdminAuthPayload, 'iat' | 'exp'> = {
    type: 'admin',
    role: 'admin',
    ...payload,
  };
  
  return sign(fullPayload, getJwtSecret(), { expiresIn });
}

/**
 * Verify an admin JWT token
 * Returns null if token is invalid or not an admin token
 */
export function verifyAdmin(token: string): (JwtPayload & AdminAuthPayload) | null {
  try {
    const payload = verify(token, getJwtSecret()) as JwtPayload & Record<string, unknown>;
    
    // Validate it's an admin token
    if (payload.role !== 'admin') {
      return null;
    }
    
    return payload as JwtPayload & AdminAuthPayload;
  } catch {
    return null;
  }
}

