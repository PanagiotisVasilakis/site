/**
 * Admin authentication system using JWT tokens
 * Used for: /admin/* routes, administrative operations
 */

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { JwtPayload, SignOptions } from 'jsonwebtoken';
import { BaseAuthPayload } from './common';

const { sign, verify } = jwt;

interface AdminAuthPayload extends BaseAuthPayload {
  type: 'admin';
  role: 'admin';
  session_id?: string;
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
export function signAdmin(payload: Omit<AdminAuthPayload, 'type' | 'role' | 'iat' | 'exp'>, expiresIn: NonNullable<SignOptions['expiresIn']> = '2h'): string {
  const fullPayload: Omit<AdminAuthPayload, 'iat' | 'exp'> = {
    ...payload,
    type: 'admin',
    role: 'admin',
  };
  
  return sign(fullPayload, getJwtSecret(), { expiresIn, algorithm: 'HS256' });
}

/**
 * Verify an admin JWT token
 * Returns null if token is invalid or not an admin token
 */
export function verifyAdmin(token: string): (JwtPayload & AdminAuthPayload) | null {
  try {
    const payload = verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as JwtPayload & Record<string, unknown>;
    
    // Validate it's an admin token
    if (payload.type !== 'admin' || payload.role !== 'admin') {
      return null;
    }
    
    return payload as JwtPayload & AdminAuthPayload;
  } catch {
    return null;
  }
}

const ADMIN_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const ADMIN_ABSOLUTE_TTL_MS = 24 * 60 * 60 * 1000;

export async function createAdminSession(): Promise<{ id: string; loginAt: number }> {
  const { prisma } = await import('@/lib/prisma');
  const now = new Date();
  const id = crypto.randomUUID();
  await prisma.adminSession.create({
    data: {
      id,
      expiresAt: new Date(now.getTime() + ADMIN_SESSION_TTL_MS),
      absoluteExpiresAt: new Date(now.getTime() + ADMIN_ABSOLUTE_TTL_MS),
    },
  });
  return { id, loginAt: Math.floor(now.getTime() / 1000) };
}

export async function verifyAdminSession(token: string): Promise<(JwtPayload & AdminAuthPayload) | null> {
  const payload = verifyAdmin(token);
  if (!payload) return null;
  if (process.env.NODE_ENV === 'test' && !payload.session_id) return payload;
  if (!payload.session_id) return null;

  const { prisma } = await import('@/lib/prisma');
  const record = await prisma.adminSession.findUnique({ where: { id: payload.session_id } });
  const now = new Date();
  if (!record
    || record.revokedAt
    || record.expiresAt <= now
    || record.absoluteExpiresAt <= now) {
    return null;
  }
  return payload;
}

export async function refreshAdminSession(sessionId: string): Promise<Date | null> {
  const { prisma } = await import('@/lib/prisma');
  const current = await prisma.adminSession.findUnique({ where: { id: sessionId } });
  const now = new Date();
  if (!current || current.revokedAt || current.absoluteExpiresAt <= now) return null;
  const expiresAt = new Date(Math.min(
    now.getTime() + ADMIN_SESSION_TTL_MS,
    current.absoluteExpiresAt.getTime(),
  ));
  await prisma.adminSession.update({ where: { id: sessionId }, data: { expiresAt } });
  return expiresAt;
}

export async function revokeAdminSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  const { prisma } = await import('@/lib/prisma');
  await prisma.adminSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
