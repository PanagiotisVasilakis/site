import jwt from 'jsonwebtoken';
import type { JwtPayload, SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger-enterprise';
import type {
  RefreshSessionBinding,
  RefreshSessionRecord,
} from '@/lib/prisma-repositories/refreshTokenRepository';
import {
  createPortalBookingEligibilityWindow,
  isPortalBookingTemporallyEligible,
} from '@/lib/portalBookingEligibility';
import { readRuntimeCredential } from '@/lib/runtime-credentials.js';

const { sign, verify } = jwt;

// Minimal JWT payload: only identifiers and exp (from JWT). No PII.
export interface GuestSessionPayload extends JwtPayload {
  type: 'guest';
  sid?: string;
  user?: { id: string };
  booking?: { id?: string };
}

export const GUEST_SESSION_COOKIE = 'guest_session';
export const GUEST_REFRESH_COOKIE = 'guest_rt';
let generatedDevSecret: string | null = null;

function getGuestJwtSecret(): string {
  const secret = readRuntimeCredential('GUEST_JWT_SECRET');
  if (secret) return secret;
  if (!generatedDevSecret) {
    generatedDevSecret = crypto.randomBytes(32).toString('base64url');
  }
  return generatedDevSecret;
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

/**
 * Parses the short-session assertion without treating natural JWT expiry as a
 * security revocation. The repository compares this assertion with the
 * generation-bound DB session inside the refresh transaction.
 */
export function parseGuestSessionBinding(
  token: string | undefined | null,
): RefreshSessionBinding {
  const secret = getGuestJwtSecret();
  if (!token) return { status: 'missing' };
  try {
    const payload = verify(token, secret, {
      algorithms: ['HS256'],
      ignoreExpiration: true,
    }) as GuestSessionPayload;
    const sessionId = payload.sid;
    const userId = payload.user?.id;
    const bookingId = payload.booking?.id;
    if (payload.type !== 'guest'
      || typeof sessionId !== 'string'
      || typeof userId !== 'string'
      || typeof bookingId !== 'string') {
      return { status: 'invalid' };
    }
    return { status: 'present', sessionId, userId, bookingId };
  } catch {
    return { status: 'invalid' };
  }
}

async function getGuestSessionFromCookies(): Promise<GuestSessionPayload | null> {
  try {
    const jar = await cookies();
    const token = jar.get(GUEST_SESSION_COOKIE)?.value;
    return parseGuestSession(token || null);
  } catch (error) {
    logger.warn('Failed to get guest session from cookies', { error });
    return null;
  }
}

export const GUEST_SESSION_TTL_SECONDS = 2 * 60 * 60;

export function createGuestSessionToken(session: RefreshSessionRecord): string {
  const expiresIn = Math.max(
    1,
    Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
  );
  return signGuestSession({
    sid: session.id,
    user: { id: session.userId },
    booking: { id: session.bookingId },
  }, expiresIn);
}

export async function issueGuestSession(userId: string, bookingId: string): Promise<string> {
  // Validate the signer before any database mutation. Startup validation is the
  // primary guard; this keeps direct invocation fail-closed as well.
  getGuestJwtSecret();
  const { prisma } = await import('@/lib/prisma');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + GUEST_SESSION_TTL_SECONDS * 1000);
  const session = await prisma.session.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      bookingId,
      expiresAt,
    },
  });

  return createGuestSessionToken(session);
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
  const eligibilityWindow = createPortalBookingEligibilityWindow(now);
  const [sessionRecord, booking] = await Promise.all([
    prisma.session.findUnique({ where: { id: sessionId } }),
    prisma.booking.findUnique({ where: { id: bookingId } }),
  ]);

  if (!sessionRecord
    || sessionRecord.userId !== userId
    || sessionRecord.bookingId !== bookingId
    || sessionRecord.revokedAt
    || sessionRecord.expiresAt <= now
    || !booking
    || booking.accessStatus !== 'VERIFIED'
    || booking.userId !== userId
    || !isPortalBookingTemporallyEligible(booking, eligibilityWindow)) {
    return null;
  }

  return session;
}

export async function getVerifiedGuestSessionFromCookies(): Promise<GuestSessionPayload | null> {
  return verifyGuestSessionAccess(await getGuestSessionFromCookies());
}

export async function revokeGuestSessionById(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  const { refreshTokenRepository } = await import('@/lib/prisma-repositories/refreshTokenRepository');
  await refreshTokenRepository.revokeAuthorizationForSession(sessionId);
}

type GuestCookie = {
  name: string;
  value: string;
  options: { httpOnly: boolean; sameSite: 'lax'; secure: boolean; path: string; maxAge: number };
};

function guestCookie(name: string, value: string, maxAge: number): GuestCookie {
  return {
    name,
    value,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge,
    },
  };
}

export function createSessionCookie(token: string): GuestCookie {
  return guestCookie(GUEST_SESSION_COOKIE, token, GUEST_SESSION_TTL_SECONDS);
}

export function clearSessionCookie(): GuestCookie {
  return guestCookie(GUEST_SESSION_COOKIE, '', 0);
}

// Refresh cookie helpers
export function createRefreshCookie(token: string, maxAgeDays = 7): GuestCookie {
  return guestCookie(GUEST_REFRESH_COOKIE, token, maxAgeDays * 24 * 60 * 60);
}

export function clearRefreshCookie(): GuestCookie {
  return guestCookie(GUEST_REFRESH_COOKIE, '', 0);
}
