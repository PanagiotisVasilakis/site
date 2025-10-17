import { sign, verify, JwtPayload, SignOptions } from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { guestStore } from '@/lib/guestDataStore';
import { logger } from '@/lib/logger-enterprise';
import { rateLimiter } from '@/lib/rateLimiter';

export type BookingSource = 'ONSITE' | 'EXTERNAL';
export type BookingStatus = 'PENDING' | 'VERIFIED' | 'NONE';

// Minimal JWT payload: only identifiers and exp (from JWT). No PII.
export interface GuestSessionPayload extends JwtPayload {
  user?: { id: string };
  booking?: { id?: string };
}

const COOKIE_NAME = 'guest_session';
const REFRESH_COOKIE = 'guest_rt';

function getGuestJwtSecret(): string {
  const secret = process.env.GUEST_JWT_SECRET || process.env.ADMIN_JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error('GUEST_JWT_SECRET (or ADMIN_JWT_SECRET) is required in production');
  }
  return secret || 'dev-guest-secret-change-me';
}

export function signGuestSession(payload: GuestSessionPayload, expiresIn: NonNullable<SignOptions['expiresIn']> = '2h'): string {
  return sign(payload, getGuestJwtSecret(), { expiresIn });
}

export function parseGuestSession(token: string | undefined | null): GuestSessionPayload | null {
  if (!token) return null;
  try {
    return verify(token, getGuestJwtSecret()) as GuestSessionPayload;
  } catch (error) {
    logger.warn('Failed to parse guest session token', { error });
    return null;
  }
}

export async function getGuestSessionFromCookies(): Promise<GuestSessionPayload | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    return parseGuestSession(token || null);
  } catch (error) {
    logger.warn('Failed to get guest session from cookies', { error });
    return null;
  }
}

export function hasVerifiedBookingSession(session: GuestSessionPayload | null | undefined): boolean {
  return !!(session && session.booking && session.booking.id);
}

export function createSessionCookie(token: string): { name: string; value: string; options: { httpOnly: boolean; sameSite: 'lax'; secure: boolean; path: string; maxAge: number } } {
  return {
    name: COOKIE_NAME,
    value: token,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 2, // 2h
    },
  };
}

// Variant that allows customizing cookie maxAge (in seconds). Useful for short-lived booking sessions.
export function createSessionCookieWithMaxAge(token: string, maxAgeSeconds: number): { name: string; value: string; options: { httpOnly: boolean; sameSite: 'lax'; secure: boolean; path: string; maxAge: number } } {
  return {
    name: COOKIE_NAME,
    value: token,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: Math.max(1, Math.floor(maxAgeSeconds)),
    },
  };
}

export function clearSessionCookie(): { name: string; value: string; options: { httpOnly: boolean; sameSite: 'lax'; secure: boolean; path: string; maxAge: number } } {
  return {
    name: COOKIE_NAME,
    value: '',
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    },
  };
}

// Refresh cookie helpers
export function createRefreshCookie(token: string, maxAgeDays = 60): { name: string; value: string; options: { httpOnly: boolean; sameSite: 'lax'; secure: boolean; path: string; maxAge: number } } {
  return {
    name: REFRESH_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: maxAgeDays * 24 * 60 * 60, // seconds
    },
  };
}

export function clearRefreshCookie(): { name: string; value: string; options: { httpOnly: boolean; sameSite: 'lax'; secure: boolean; path: string; maxAge: number } } {
  return {
    name: REFRESH_COOKIE,
    value: '',
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    },
  };
}

// Session management with token revocation
export class SessionManager {
  async createSession(userId: string, bookingId?: string, ttlHours: number = 2): Promise<{ sessionToken: string; refreshToken: string; sessionCookie: ReturnType<typeof createSessionCookie>; refreshCookie: ReturnType<typeof createRefreshCookie> }> {
    try {
      // Rate limit session creation
      const rateLimitKey = `session:create:${userId}`;
      const rateLimitResult = await rateLimiter.isRateLimited(rateLimitKey, 10, 60 * 60 * 1000); // 10 sessions per hour
      if (!rateLimitResult.allowed) {
        throw new Error('Rate limit exceeded for session creation');
      }
      
      // Create session payload
      const payload: GuestSessionPayload = {
        user: { id: userId },
        booking: bookingId ? { id: bookingId } : undefined,
      };
      
      // Sign session token
      const sessionToken = signGuestSession(payload, `${ttlHours}h`);
      
      // Issue refresh token
      const { rec: refreshTokenRec, token: refreshToken } = await guestStore.issueRefreshToken(userId, 60, {
        family_id: `sess_${userId}_${Date.now()}`,
        device_hint: 'web',
        ip_hint: 'unknown'
      });
      
      // Create cookies
      const sessionCookie = createSessionCookie(sessionToken);
      const refreshCookie = createRefreshCookie(refreshToken);
      
      logger.info('Session created', { userId, bookingId, sessionId: refreshTokenRec.id });
      
      return {
        sessionToken,
        refreshToken,
        sessionCookie,
        refreshCookie
      };
    } catch (error) {
      logger.error('Failed to create session', { error, userId, bookingId });
      throw error;
    }
  }
  
  async validateSession(token: string): Promise<GuestSessionPayload | null> {
    try {
      return parseGuestSession(token);
    } catch (error) {
      logger.warn('Failed to validate session', { error });
      return null;
    }
  }
  
  async revokeSession(sessionId: string): Promise<boolean> {
    try {
      // Revoke refresh token
      const result = await guestStore.revokeRefreshToken(sessionId);
      
      if (result) {
        logger.info('Session revoked', { sessionId });
      }
      
      return result;
    } catch (error) {
      logger.error('Failed to revoke session', { error, sessionId });
      return false;
    }
  }
  
  async rotateSession(oldRefreshToken: string): Promise<{ sessionToken?: string; refreshToken?: string; sessionCookie?: ReturnType<typeof createSessionCookie>; refreshCookie?: ReturnType<typeof createRefreshCookie> } | null> {
    try {
      // Rotate refresh token
      const { rec: newRefreshTokenRec, token: newRefreshToken } = await guestStore.rotateRefreshToken(oldRefreshToken);
      
      if (!newRefreshTokenRec || !newRefreshToken) {
        return null;
      }
      
      // Create new session token
      const payload: GuestSessionPayload = {
        user: { id: newRefreshTokenRec.user_id },
      };
      
      const sessionToken = signGuestSession(payload, '2h');
      
      // Create cookies
      const sessionCookie = createSessionCookie(sessionToken);
      const refreshCookie = createRefreshCookie(newRefreshToken);
      
      logger.info('Session rotated', { oldTokenId: newRefreshTokenRec.rotated_from_id, newTokenId: newRefreshTokenRec.id });
      
      return {
        sessionToken,
        refreshToken: newRefreshToken,
        sessionCookie,
        refreshCookie
      };
    } catch (error) {
      logger.error('Failed to rotate session', { error });
      return null;
    }
  }
  
  async cleanupExpiredSessions(): Promise<number> {
    try {
      // Purge expired refresh tokens
      const removed = await guestStore.purgeExpiredRefreshTokens(30);
      
      if (removed > 0) {
        logger.info('Expired sessions cleaned up', { count: removed });
      }
      
      return removed;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', { error });
      return 0;
    }
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();

// SSR auto-refresh: if no valid guest_session, try guest_rt to mint a new session JWT and set cookie.
export async function tryAutoMintSessionFromRefresh(): Promise<{ session: GuestSessionPayload | null; responseHeaders?: HeadersInit; cookies?: Array<{ name: string; value: string; options: { httpOnly: boolean; sameSite: 'lax'; secure: boolean; path: string; maxAge: number } }> }> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const current = parseGuestSession(token);
  if (current && hasVerifiedBookingSession(current)) {
    return { session: current };
  }
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!refresh) return { session: current };
  const rec = await guestStore.verifyRefreshToken(refresh);
  if (!rec) return { session: current };
  // Rotation on use
  const rotated = await guestStore.rotateRefreshToken(refresh);
  const rt = rotated.token;
  // Build a minimal session; in full flow, refresh API would attach booking context. Here we only restore user identity.
  const u = await guestStore.findUserById(rec.user_id);
  const payload: GuestSessionPayload = {
    user: u ? { id: u.id } : undefined,
  };
  const jwt = signGuestSession(payload);
  // Prepare Set-Cookie headers for both session and refresh rotation
  const sessionCookie = createSessionCookie(jwt);
  const refreshCookie = rt ? createRefreshCookie(rt) : undefined;
  const headers: HeadersInit = {
    'Set-Cookie': serializeCookies([
      `${sessionCookie.name}=${sessionCookie.value}; Path=${sessionCookie.options.path}; HttpOnly; SameSite=Lax; Max-Age=${sessionCookie.options.maxAge};${sessionCookie.options.secure ? ' Secure;' : ''}`,
      ...(refreshCookie ? [`${refreshCookie.name}=${refreshCookie.value}; Path=${refreshCookie.options.path}; HttpOnly; SameSite=Lax; Max-Age=${refreshCookie.options.maxAge};${refreshCookie.options.secure ? ' Secure;' : ''}`] : []),
    ].filter(Boolean) as string[]),
  };
  const cookiesArr = [sessionCookie, ...(refreshCookie ? [refreshCookie] : [])];
  return { session: parseGuestSession(jwt), responseHeaders: headers, cookies: cookiesArr };
}

function serializeCookies(parts: string[]): string {
  // Multiple Set-Cookie headers are better, but in NextResponse we can set multiple via append.
  // Here we join as a single header value for convenience; callers can split to append.
  return parts.join('\nSet-Cookie: ');
}