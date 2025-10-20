import { sign, verify, JwtPayload, SignOptions } from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger-enterprise';

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
