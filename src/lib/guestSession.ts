import jwt from 'jsonwebtoken';
import type { JwtPayload, SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger-enterprise';

const { sign, verify } = jwt;

// Minimal JWT payload: only identifiers and exp (from JWT). No PII.
export interface GuestSessionPayload extends JwtPayload {
  type: 'guest';
  sid?: string;
  user?: { id: string };
  booking?: { id?: string };
}

const COOKIE_NAME = 'guest_session';
const REFRESH_COOKIE = 'guest_rt';

function getGuestJwtSecret(): string {
  const secret = process.env.GUEST_JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error('GUEST_JWT_SECRET is required in production');
  }
  return secret || 'dev-guest-secret-change-me';
}

function signGuestSession(
  payload: Omit<GuestSessionPayload, 'type'> & { type?: 'guest' },
  expiresIn: NonNullable<SignOptions['expiresIn']> = '2h',
): string {
  return sign({ ...payload, type: 'guest' }, getGuestJwtSecret(), {
    expiresIn,
    algorithm: 'HS256',
  });
}

export function parseGuestSession(token: string | undefined | null): GuestSessionPayload | null {
  if (!token) return null;
  try {
    const payload = verify(token, getGuestJwtSecret(), { algorithms: ['HS256'] }) as GuestSessionPayload;
    if (payload.type !== 'guest') return null;
    return payload;
  } catch (error) {
    logger.warn('Failed to parse guest session token', { error });
    return null;
  }
}

async function getGuestSessionFromCookies(): Promise<GuestSessionPayload | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    return parseGuestSession(token || null);
  } catch (error) {
    logger.warn('Failed to get guest session from cookies', { error });
    return null;
  }
}

const SESSION_TTL_SECONDS = 2 * 60 * 60;

export async function issueGuestSession(userId: string, bookingId: string): Promise<string> {
  const { prisma } = await import('@/lib/prisma');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const session = await prisma.session.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      bookingId,
      expiresAt,
    },
  });

  return signGuestSession({
    sid: session.id,
    user: { id: userId },
    booking: { id: bookingId },
  }, SESSION_TTL_SECONDS);
}

export async function verifyGuestSessionAccess(
  session: GuestSessionPayload | null | undefined,
): Promise<GuestSessionPayload | null> {
  const userId = session?.user?.id;
  const bookingId = session?.booking?.id;
  const sessionId = session?.sid;
  if (!userId || !bookingId || !sessionId) return null;

  const { prisma } = await import('@/lib/prisma');
  const now = new Date();
  const [sessionRecord, booking] = await Promise.all([
    prisma.session.findUnique({ where: { id: sessionId } }),
    prisma.booking.findUnique({ where: { id: bookingId } }),
  ]);

  const accessWindowStart = new Date(booking?.startDate ?? now);
  accessWindowStart.setUTCDate(accessWindowStart.getUTCDate() - 7);
  const today = new Date(now.toISOString().slice(0, 10));

  if (!sessionRecord
    || sessionRecord.userId !== userId
    || sessionRecord.bookingId !== bookingId
    || sessionRecord.revokedAt
    || sessionRecord.expiresAt <= now
    || !booking
    || booking.accessStatus !== 'VERIFIED'
    || booking.userId !== userId
    || now < accessWindowStart
    || booking.endDate < today) {
    return null;
  }

  return session;
}

export async function getVerifiedGuestSessionFromCookies(): Promise<GuestSessionPayload | null> {
  return verifyGuestSessionAccess(await getGuestSessionFromCookies());
}

export async function revokeGuestSession(session: GuestSessionPayload | null | undefined): Promise<void> {
  if (!session?.sid) return;
  const { prisma } = await import('@/lib/prisma');
  await prisma.session.updateMany({
    where: { id: session.sid, revokedAt: null },
    data: { revokedAt: new Date() },
  });
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
export function createRefreshCookie(token: string, maxAgeDays = 7): { name: string; value: string; options: { httpOnly: boolean; sameSite: 'lax'; secure: boolean; path: string; maxAge: number } } {
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
