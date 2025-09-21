import { sign, verify, JwtPayload, SignOptions } from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { guestStore } from '@/lib/guestDataStore';

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
  } catch {
    return null;
  }
}

export async function getGuestSessionFromCookies(): Promise<GuestSessionPayload | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    return parseGuestSession(token || null);
  } catch {
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
  const rec = guestStore.verifyRefreshToken(refresh);
  if (!rec) return { session: current };
  // Rotation on use
  const rotated = guestStore.rotateRefreshToken(refresh);
  const rt = rotated.token;
  // Build a minimal session; in full flow, refresh API would attach booking context. Here we only restore user identity.
  const u = guestStore.findUserById(rec.user_id);
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
