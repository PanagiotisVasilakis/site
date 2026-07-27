import bcrypt from 'bcrypt';
import crypto from 'node:crypto';

import { prisma } from '@/lib/prisma';
import { normalizePhone, type Origin } from '@/lib/phone';
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
  | 'NO_ELIGIBLE_BOOKING';

export class PortalAuthError extends Error {
  constructor(readonly code: PortalAuthFailureCode) {
    super(code);
    this.name = 'PortalAuthError';
  }
}

function claimTokenPepper(): string {
  const value = process.env.CLAIM_TOKEN_PEPPER || process.env.SECURITY_PEPPER;
  if (process.env.NODE_ENV === 'production' && !value) {
    throw new Error('CLAIM_TOKEN_PEPPER is required in production');
  }
  return value || 'development-only-claim-token-pepper';
}

function digestClaimToken(rawToken: string): string {
  return crypto.createHmac('sha256', claimTokenPepper()).update(rawToken, 'utf8').digest('hex');
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

    await tx.bookingClaimGrant.updateMany({
      where: {
        bookingId: input.bookingId,
        channel: input.channel,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now },
    });
    await tx.bookingClaimGrant.create({
      data: {
        id: crypto.randomUUID(),
        bookingId: input.bookingId,
        tokenDigest,
        channel: input.channel,
        expiresAt,
        issuedByAdminSessionId: input.adminSessionId,
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
  token?: string;
  tokenDigest?: string;
  phone: string;
  origin: Origin;
  password: string;
  correlationId?: string;
  ipHash?: string;
}): Promise<{ userId: string; bookingId: string }> {
  const normalized = normalizePhone(input.phone, input.origin);
  if (!normalized) throw new PortalAuthError('INVALID_CLAIM');

  const hasRawToken = typeof input.token === 'string';
  const hasTokenDigest = typeof input.tokenDigest === 'string';
  if (hasRawToken === hasTokenDigest) throw new PortalAuthError('INVALID_CLAIM');
  const tokenDigest = hasTokenDigest
    ? input.tokenDigest!
    : digestClaimToken(input.token!.trim());
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
        await tx.user.update({
          where: { id: existingUser.id },
          data: { passwordHash: newPasswordHash, countryOrigin: input.origin },
        });
      }
      userId = existingUser.id;
    } else {
      userId = crypto.randomUUID();
      await tx.user.create({
        data: {
          id: userId,
          phoneE164: normalized.e164,
          countryOrigin: input.origin,
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
  const primaryPhone = normalizePhone(input.phone);
  if (!primaryPhone) throw new PortalAuthError('INVALID_CREDENTIALS');
  const now = new Date();
  const eligibilityWindow = createPortalBookingEligibilityWindow(now);

  // Preserve the existing international-without-plus interpretation first,
  // then support the local 10-digit format used by Greek guests at claim time.
  // The fallback only runs when the primary identifier has no account, keeping
  // account selection deterministic if both canonical numbers exist.
  const greekLocalPhone = normalizePhone(input.phone, 'GR');
  let user = await prisma.user.findUnique({ where: { phoneE164: primaryPhone.e164 } });
  if (!user && greekLocalPhone && greekLocalPhone.e164 !== primaryPhone.e164) {
    user = await prisma.user.findUnique({ where: { phoneE164: greekLocalPhone.e164 } });
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
