import bcrypt from 'bcrypt';
import crypto from 'node:crypto';

import type { Prisma } from '@/generated/prisma/client';

import { requirePepper } from '@/lib/pepper';
import { prisma } from '@/lib/prisma';
import { normalizePhone, phoneLookupCandidates, type Origin } from '@/lib/phone';
import { GUEST_TERMS_CONTENT_HASH, GUEST_TERMS_VERSION } from '@/lib/guestTerms';
import {
  createPortalBookingEligibilityWindow,
  isPortalBookingTemporallyEligible,
  portalBookingTemporalWhere,
} from '@/lib/portalBookingEligibility';

const CLAIM_TOKEN_TTL_MINUTES = 30;
const BCRYPT_ROUNDS = 12;
const SERIALIZABLE_ATTEMPTS = 3;

export type PortalAuthFailureCode =
  | 'INVALID_CLAIM'
  | 'BOOKING_ALREADY_CLAIMED'
  | 'INVALID_CREDENTIALS'
  | 'NO_ELIGIBLE_BOOKING'
  | 'BOOKING_NOT_IN_ACCESS_WINDOW'
  | 'BOOKING_NOT_CLAIMED';

export class PortalAuthError extends Error {
  constructor(readonly code: PortalAuthFailureCode) {
    super(code);
    this.name = 'PortalAuthError';
  }
}

function digestClaimToken(rawToken: string): string {
  return crypto.createHmac('sha256', requirePepper('CLAIM_TOKEN_PEPPER')).update(rawToken, 'utf8').digest('hex');
}

function isSerializationConflict(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'P2034';
}

export async function issueBookingClaimGrant(input: {
  bookingId: string;
  channel: 'REMOTE' | 'ONSITE';
  adminSessionId: string;
  ttlMinutes?: number;
}): Promise<{ token: string; expiresAt: Date }> {
  const ttlMinutes = Math.min(Math.max(input.ttlMinutes ?? CLAIM_TOKEN_TTL_MINUTES, 5), 24 * 60);
  const token = `claim_${crypto.randomBytes(32).toString('base64url')}`;
  const tokenDigest = digestClaimToken(token);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
    if (!booking) throw new PortalAuthError('INVALID_CLAIM');
    if (booking.userId && booking.accessStatus === 'VERIFIED') {
      throw new PortalAuthError('BOOKING_ALREADY_CLAIMED');
    }
    // The exchange and the claim enforce the same window; a token issued
    // outside it could never be used.
    if (!isPortalBookingTemporallyEligible(booking, createPortalBookingEligibilityWindow(now))) {
      throw new PortalAuthError('BOOKING_NOT_IN_ACCESS_WINDOW');
    }
    await replaceOpenClaimGrant(tx, { ...input, tokenDigest, expiresAt, now });
  });

  return { token, expiresAt };
}

async function replaceOpenClaimGrant(
  tx: Prisma.TransactionClient,
  input: {
    bookingId: string;
    channel: 'REMOTE' | 'ONSITE';
    adminSessionId: string;
    tokenDigest: string;
    expiresAt: Date;
    now: Date;
  },
): Promise<void> {
  await tx.bookingClaimGrant.updateMany({
    where: {
      bookingId: input.bookingId,
      channel: input.channel,
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: input.now },
    },
    data: { revokedAt: input.now },
  });
  await tx.bookingClaimGrant.create({
    data: {
      id: crypto.randomUUID(),
      bookingId: input.bookingId,
      tokenDigest: input.tokenDigest,
      channel: input.channel,
      expiresAt: input.expiresAt,
      issuedByAdminSessionId: input.adminSessionId,
    },
  });
}

/**
 * Host-initiated access reset for a guest who lost the password of an already
 * claimed booking: clears the password, revokes every session and refresh
 * family of the guest, and issues a fresh claim token for the same booking.
 * Claiming it with the same phone sets a new password (null-hash branch of
 * consumeBookingClaimGrant); a different phone is refused as already claimed.
 */
export async function resetGuestAccess(input: {
  bookingId: string;
  adminSessionId: string;
  ttlMinutes?: number;
}): Promise<{ token: string; expiresAt: Date }> {
  const ttlMinutes = Math.min(Math.max(input.ttlMinutes ?? CLAIM_TOKEN_TTL_MINUTES, 5), 24 * 60);
  const token = `claim_${crypto.randomBytes(32).toString('base64url')}`;
  const tokenDigest = digestClaimToken(token);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
    if (!booking) throw new PortalAuthError('INVALID_CLAIM');
    if (!booking.userId || booking.accessStatus !== 'VERIFIED') throw new PortalAuthError('BOOKING_NOT_CLAIMED');
    if (!isPortalBookingTemporallyEligible(booking, createPortalBookingEligibilityWindow(now))) {
      throw new PortalAuthError('BOOKING_NOT_IN_ACCESS_WINDOW');
    }
    const userId = booking.userId;
    await tx.user.update({ where: { id: userId }, data: { passwordHash: null } });
    await tx.refreshTokenFamily.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revocationReason: 'admin_access_reset' },
    });
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    await replaceOpenClaimGrant(tx, {
      bookingId: input.bookingId,
      channel: 'REMOTE',
      adminSessionId: input.adminSessionId,
      tokenDigest,
      expiresAt,
      now,
    });
    await tx.securityAuditEvent.create({
      data: {
        id: crypto.randomUUID(),
        eventType: 'portal.access_reset',
        severity: 'medium',
        path: '/api/admin/bookings/access-reset',
        details: { bookingId: input.bookingId },
      },
    });
  });

  return { token, expiresAt };
}

export async function prepareBookingClaimExchange(
  rawToken: string,
): Promise<{ tokenDigest: string; expiresAt: Date }> {
  const tokenDigest = digestClaimToken(rawToken.trim());
  const now = new Date();
  const eligibilityWindow = createPortalBookingEligibilityWindow(now);
  const grant = await prisma.bookingClaimGrant.findUnique({
    where: { tokenDigest },
    include: { booking: true },
  });
  if (!grant
    || grant.consumedAt
    || grant.revokedAt
    || grant.expiresAt <= now
    || !isPortalBookingTemporallyEligible(grant.booking, eligibilityWindow)) {
    throw new PortalAuthError('INVALID_CLAIM');
  }
  return { tokenDigest, expiresAt: grant.expiresAt };
}

export async function consumeBookingClaimGrant(input: {
  tokenDigest: string;
  phone: string;
  origin: Origin;
  password: string;
  correlationId?: string;
  ipHash?: string;
}): Promise<{ userId: string; bookingId: string }> {
  const normalized = normalizePhone(input.phone, input.origin);
  if (!normalized) throw new PortalAuthError('INVALID_CLAIM');

  const { tokenDigest } = input;
  if (!/^[a-f0-9]{64}$/u.test(tokenDigest)) throw new PortalAuthError('INVALID_CLAIM');
  const newPasswordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const now = new Date();
  const eligibilityWindow = createPortalBookingEligibilityWindow(now);

  const consume = () => prisma.$transaction(async (tx) => {
    const grant = await tx.bookingClaimGrant.findUnique({
      where: { tokenDigest },
      include: { booking: true },
    });
    if (!grant
      || grant.consumedAt
      || grant.revokedAt
      || grant.expiresAt <= now
      || !isPortalBookingTemporallyEligible(grant.booking, eligibilityWindow)) {
      throw new PortalAuthError('INVALID_CLAIM');
    }

    const existingUser = await tx.user.findUnique({ where: { phoneE164: normalized.e164 } });
    let userId: string;
    if (existingUser) {
      if (existingUser.passwordHash) {
        const matches = await bcrypt.compare(input.password, existingUser.passwordHash);
        if (!matches) throw new PortalAuthError('INVALID_CREDENTIALS');
      } else {
        // A password-less account (after a host access reset) may set a new
        // password only through a grant for a booking it already owns;
        // otherwise any claim token plus the guest's phone would take it over.
        if (grant.booking.userId !== existingUser.id) throw new PortalAuthError('INVALID_CREDENTIALS');
        await tx.user.update({
          where: { id: existingUser.id },
          data: { passwordHash: newPasswordHash },
        });
      }
      userId = existingUser.id;
    } else {
      userId = crypto.randomUUID();
      await tx.user.create({
        data: {
          id: userId,
          phoneE164: normalized.e164,
          passwordHash: newPasswordHash,
        },
      });
    }

    if (grant.booking.userId && grant.booking.userId !== userId) {
      throw new PortalAuthError('BOOKING_ALREADY_CLAIMED');
    }

    const consumed = await tx.bookingClaimGrant.updateMany({
      where: {
        id: grant.id,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) throw new PortalAuthError('INVALID_CLAIM');

    const claimed = await tx.booking.updateMany({
      where: {
        id: grant.bookingId,
        OR: [{ userId: null }, { userId }],
      },
      data: { userId, accessStatus: 'VERIFIED', claimedAt: now },
    });
    if (claimed.count !== 1) throw new PortalAuthError('BOOKING_ALREADY_CLAIMED');

    await tx.bookingClaimGrant.updateMany({
      where: { bookingId: grant.bookingId, id: { not: grant.id }, consumedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.termsAcceptance.upsert({
      where: {
        bookingId_userId_termsVersion: {
          bookingId: grant.bookingId,
          userId,
          termsVersion: GUEST_TERMS_VERSION,
        },
      },
      create: {
        id: crypto.randomUUID(),
        bookingId: grant.bookingId,
        userId,
        termsVersion: GUEST_TERMS_VERSION,
        contentHash: GUEST_TERMS_CONTENT_HASH,
      },
      update: { contentHash: GUEST_TERMS_CONTENT_HASH, acceptedAt: now },
    });
    await tx.securityAuditEvent.create({
      data: {
        id: crypto.randomUUID(),
        eventType: 'portal.booking_claimed',
        severity: 'low',
        correlationId: input.correlationId ?? null,
        ipHash: input.ipHash ?? null,
        path: '/api/portal/claims',
        details: { bookingId: grant.bookingId, channel: grant.channel },
      },
    });

    return { userId, bookingId: grant.bookingId };
  }, { isolationLevel: 'Serializable' });

  for (let attempt = 1; attempt <= SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await consume();
    } catch (error) {
      if (!isSerializationConflict(error) || attempt === SERIALIZABLE_ATTEMPTS) throw error;
    }
  }
  throw new Error('Unreachable claim transaction state');
}

export async function authenticatePortalUser(input: {
  phone: string;
  password: string;
}): Promise<{ userId: string; bookingId: string }> {
  const phoneCandidates = phoneLookupCandidates(input.phone);
  if (phoneCandidates.length === 0) throw new PortalAuthError('INVALID_CREDENTIALS');
  const now = new Date();
  const eligibilityWindow = createPortalBookingEligibilityWindow(now);

  // Preserve the existing international-without-plus interpretation first,
  // then support the local 10-digit format used by Greek guests at claim time.
  // The fallback only runs when the primary identifier has no account, keeping
  // account selection deterministic if both canonical numbers exist.
  let user = null;
  for (const phoneE164 of phoneCandidates) {
    user = await prisma.user.findUnique({ where: { phoneE164 } });
    if (user) break;
  }
  if (!user?.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new PortalAuthError('INVALID_CREDENTIALS');
  }

  const bookingCandidates = await prisma.booking.findMany({
    where: {
      userId: user.id,
      accessStatus: 'VERIFIED',
      ...portalBookingTemporalWhere(eligibilityWindow),
    },
    orderBy: { startDate: 'asc' },
  });
  const booking = bookingCandidates.find((candidate) => (
    isPortalBookingTemporallyEligible(candidate, eligibilityWindow)
  ));
  if (!booking) {
    throw new PortalAuthError('NO_ELIGIBLE_BOOKING');
  }
  return { userId: user.id, bookingId: booking.id };
}
