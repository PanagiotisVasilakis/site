import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { verifySensitive } from '@/lib/crypto';
import { logger } from '@/lib/logger-enterprise';
import { prisma } from '@/lib/prisma';
import { refreshGenerationAdvisoryLockKey } from '@/lib/refreshRotationLock';
import {
  createPortalBookingEligibilityWindow,
  isPortalBookingTemporallyEligible,
  type PortalBookingEligibilityWindow,
} from '@/lib/portalBookingEligibility';

export type GuestRefreshTokenRec = {
  id: string;
  user_id: string;
  token_hash: string;
  salt: string;
  family_id: string;
  created_at: number;
  expires_at: number;
  revoked_at?: number;
  rotated_from_id?: string;
  last_used_at?: number;
  device_hint?: string;
  ip_hint?: string;
};

export type RefreshSessionBinding =
  | { status: 'missing' }
  | { status: 'invalid' }
  | {
    status: 'present';
    sessionId: string;
    userId: string;
    bookingId: string;
  };

export type RefreshSessionRecord = {
  id: string;
  userId: string;
  bookingId: string;
  expiresAt: Date;
};

// Durable schema-free authorization binding: every remember-me generation uses
// one UUID for both RefreshToken.id and Session.id. Session expiry is natural;
// explicit revocation invalidates the exact family graph resolved through it.

type RefreshTokenRotationResult =
  | {
    status: 'rotated';
    old: GuestRefreshTokenRec;
    rec: GuestRefreshTokenRec;
    session: RefreshSessionRecord;
    sessionToken: string;
  }
  | { status: 'invalid' }
  | { status: 'concurrent'; familyId: string }
  | { status: 'replayed'; familyId: string };

type RefreshGenerationContention = {
  status: 'generation_contended';
  familyId: string;
  disposition: 'suspicious' | 'authoritative_recheck';
};

type RefreshTokenReplacement = {
  id: string;
  tokenHash: string;
  salt: string;
  tokenExpiresAt: number;
  sessionExpiresAt: Date;
  deviceHash?: string;
  ipHash?: string;
  presentedSession: RefreshSessionBinding;
  createSessionToken: (session: RefreshSessionRecord) => string;
};

const REFRESH_FAMILY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ROTATION_TRANSACTION_MAX_WAIT_MS = 2_000;
const ROTATION_TRANSACTION_TIMEOUT_MS = 10_000;
const CONTENTION_CLEANUP_TRANSACTION_TIMEOUT_MS = 15_000;

function mapToken(token: {
  id: string;
  userId: string;
  tokenHash: string;
  salt: string;
  familyId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  rotatedFromId: string | null;
  lastUsedAt: Date | null;
  deviceHint: string | null;
  ipHint: string | null;
}): GuestRefreshTokenRec {
  return {
    id: token.id,
    user_id: token.userId,
    token_hash: token.tokenHash,
    salt: token.salt,
    family_id: token.familyId,
    created_at: token.createdAt.getTime(),
    expires_at: token.expiresAt.getTime(),
    revoked_at: token.revokedAt ? token.revokedAt.getTime() : undefined,
    rotated_from_id: token.rotatedFromId ?? undefined,
    last_used_at: token.lastUsedAt ? token.lastUsedAt.getTime() : undefined,
    device_hint: token.deviceHint ?? undefined,
    ip_hint: token.ipHint ?? undefined,
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseCompositeToken(token: string): { id?: string; secret: string } | null {
  const normalized = token.trim();
  if (!normalized) return null;

  const separatorIndex = normalized.indexOf('.');
  if (separatorIndex <= 0) {
    return { secret: normalized };
  }

  const id = normalized.slice(0, separatorIndex);
  const secret = normalized.slice(separatorIndex + 1);
  if (!UUID_REGEX.test(id) || !secret) return null;
  return { id, secret };
}

async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "users"
    WHERE "id" = ${userId}::uuid
    FOR UPDATE
  `;
  return rows.length === 1;
}

// Every issuance, rotation, and revocation path acquires shared rows in the
// same user -> family order so PostgreSQL provides the cross-instance
// linearization boundary without an in-memory mutex.

async function lockFamily(tx: Prisma.TransactionClient, familyId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "refresh_token_families"
    WHERE "id" = ${familyId}
    FOR UPDATE
  `;
  return rows.length === 1;
}

async function tryLockRefreshGeneration(
  tx: Prisma.TransactionClient,
  lockKey: bigint,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_xact_lock(${lockKey}::bigint) AS "acquired"
  `;
  return rows.length === 1 && rows[0].acquired;
}

async function configureContentionLockTimeout(tx: Prisma.TransactionClient): Promise<void> {
  // A normal rotation transaction is bounded to ten seconds. The cleanup
  // transaction starts later and receives one extra second for the owner to
  // release its canonical row locks, while remaining bounded independently.
  await tx.$executeRaw`SET LOCAL lock_timeout = '11s'`;
}

async function revokeFamilyGraph(
  tx: Prisma.TransactionClient,
  familyId: string,
  now: Date,
  reason: string,
): Promise<void> {
  await tx.refreshTokenFamily.updateMany({
    where: { id: familyId, revokedAt: null },
    data: { revokedAt: now, revocationReason: reason },
  });
  await tx.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: now },
  });
  await tx.$executeRaw`
    UPDATE "sessions"
    SET "revoked_at" = ${now}
    WHERE "revoked_at" IS NULL
      AND "id" IN (
        SELECT "id"
        FROM "refresh_tokens"
        WHERE "family_id" = ${familyId}
      )
  `;
}

function bookingIsEligible(booking: {
  userId: string | null;
  accessStatus: string;
  startDate: Date;
  endDate: Date;
}, userId: string, eligibilityWindow: PortalBookingEligibilityWindow): boolean {
  return booking.userId === userId
    && booking.accessStatus === 'VERIFIED'
    && isPortalBookingTemporallyEligible(booking, eligibilityWindow);
}

async function create(
  database: PrismaClient,
  userId: string,
  tokenId: string,
  tokenHash: string,
  salt: string,
  familyId: string,
  expiresAt: number,
  opts?: { deviceHint?: string; ipHint?: string },
): Promise<GuestRefreshTokenRec> {
  try {
    const token = await database.$transaction(async (tx) => {
      if (!(await lockUser(tx, userId))) {
        throw new Error('Refresh authorization user does not exist');
      }

      const now = new Date();
      const eligibilityWindow = createPortalBookingEligibilityWindow(now);
      const session = await tx.session.findUnique({ where: { id: tokenId } });
      if (!session
        || session.userId !== userId
        || session.revokedAt
        || session.expiresAt <= now) {
        throw new Error('Refresh authorization session is invalid');
      }
      const booking = await tx.booking.findUnique({ where: { id: session.bookingId } });
      if (!booking || !bookingIsEligible(booking, userId, eligibilityWindow)) {
        throw new Error('Refresh authorization booking is invalid');
      }
      if (await tx.refreshTokenFamily.findUnique({ where: { id: familyId } })) {
        throw new Error('Refresh token family already exists');
      }

      const family = await tx.refreshTokenFamily.create({
        data: {
          id: familyId,
          userId,
          absoluteExpiresAt: new Date(now.getTime() + REFRESH_FAMILY_TTL_MS),
          deviceHash: opts?.deviceHint ?? null,
          ipHash: opts?.ipHint ?? null,
        },
      });
      return tx.refreshToken.create({
        data: {
          id: tokenId,
          userId,
          tokenHash,
          salt,
          familyId,
          expiresAt: new Date(Math.min(expiresAt, family.absoluteExpiresAt.getTime())),
          deviceHint: opts?.deviceHint ?? null,
          ipHint: opts?.ipHint ?? null,
        },
      });
    });

    logger.info('Refresh token created (prisma)', { tokenId: token.id, userId, familyId });
    return mapToken(token);
  } catch (error) {
    logger.error('refreshTokenRepository(prisma): create failed', error);
    throw error;
  }
}

async function verify(
  database: PrismaClient,
  token: string,
): Promise<GuestRefreshTokenRec | undefined> {
  try {
    const parsed = parseCompositeToken(token);
    if (!parsed) return undefined;
    const now = Date.now();

    if (parsed.id) {
      const candidate = await database.refreshToken.findUnique({
        where: { id: parsed.id },
        include: { family: true },
      });
      const session = candidate
        ? await database.session.findUnique({ where: { id: candidate.id } })
        : null;
      if (!candidate
        || !session
        || session.userId !== candidate.userId
        || session.revokedAt
        || candidate.revokedAt
        || candidate.expiresAt.getTime() <= now
        || candidate.family.revokedAt
        || candidate.family.absoluteExpiresAt.getTime() <= now
        || !verifySensitive(parsed.secret, candidate.salt, candidate.tokenHash)) {
        return undefined;
      }

      await database.refreshToken.update({
        where: { id: candidate.id },
        data: { lastUsedAt: new Date(now) },
      });
      return mapToken({ ...candidate, lastUsedAt: new Date(now) });
    }

    if (process.env.GUEST_REFRESH_ALLOW_LEGACY_SECRET_ONLY !== '1') {
      logger.warn('Rejected legacy secret-only refresh token; enable GUEST_REFRESH_ALLOW_LEGACY_SECRET_ONLY=1 only during migration');
      return undefined;
    }

    const activeTokens = await database.refreshToken.findMany({
      where: {
        revokedAt: null,
        family: { revokedAt: null, absoluteExpiresAt: { gt: new Date() } },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const candidate of activeTokens) {
      const session = await database.session.findUnique({ where: { id: candidate.id } });
      if (session
        && session.userId === candidate.userId
        && !session.revokedAt
        && verifySensitive(parsed.secret, candidate.salt, candidate.tokenHash)) {
        await database.refreshToken.update({
          where: { id: candidate.id },
          data: { lastUsedAt: new Date(now) },
        });
        return mapToken({ ...candidate, lastUsedAt: new Date(now) });
      }
    }
    return undefined;
  } catch (error) {
    logger.error('refreshTokenRepository(prisma): verify failed', error);
    throw error;
  }
}

async function revoke(database: PrismaClient, id: string): Promise<boolean> {
  try {
    const initial = await database.refreshToken.findUnique({ where: { id } });
    if (!initial) return false;
    const revoked = await database.$transaction(async (tx) => {
      if (!(await lockUser(tx, initial.userId)) || !(await lockFamily(tx, initial.familyId))) {
        return false;
      }
      const token = await tx.refreshToken.findUnique({ where: { id } });
      if (!token || token.userId !== initial.userId || token.familyId !== initial.familyId) {
        return false;
      }
      const family = await tx.refreshTokenFamily.findUnique({ where: { id: token.familyId } });
      if (!family || family.userId !== token.userId) return false;
      await revokeFamilyGraph(tx, token.familyId, new Date(), 'refresh_token_revoked');
      return true;
    });
    if (revoked) {
      logger.info('Refresh token revoked (prisma)', { tokenId: id });
      return true;
    }
    return false;
  } catch (error) {
    logger.error('refreshTokenRepository(prisma): revoke failed', error);
    throw error;
  }
}

async function rotate(
  database: PrismaClient,
  token: string,
  replacement: RefreshTokenReplacement,
): Promise<RefreshTokenRotationResult> {
  const parsed = parseCompositeToken(token);
  if (!parsed?.id) return { status: 'invalid' };

  const initial = await database.refreshToken.findUnique({
    where: { id: parsed.id },
    include: { family: true },
  });
  if (!initial
    || initial.family.userId !== initial.userId
    || !verifySensitive(parsed.secret, initial.salt, initial.tokenHash)) {
    return { status: 'invalid' };
  }

  const initialNow = new Date();
  const initialSession = await database.session.findUnique({ where: { id: initial.id } });
  const initialBooking = initialSession
    ? await database.booking.findUnique({ where: { id: initialSession.bookingId } })
    : null;
  const initialGenerationActive = !initial.revokedAt
    && !initial.family.revokedAt
    && initial.expiresAt > initialNow
    && initial.family.absoluteExpiresAt > initialNow;
  const initialBindingApproved = replacement.presentedSession.status === 'missing'
    || (replacement.presentedSession.status === 'present'
      && initialSession?.id === replacement.presentedSession.sessionId
      && initialSession.userId === replacement.presentedSession.userId
      && initialSession.bookingId === replacement.presentedSession.bookingId);
  const initialAuthorizationApproved = initialGenerationActive
    && initialSession !== null
    && initialSession.userId === initial.userId
    && !initialSession.revokedAt
    && initialBooking !== null
    && bookingIsEligible(
      initialBooking,
      initial.userId,
      createPortalBookingEligibilityWindow(initialNow),
    )
    && initialBindingApproved;
  const generationLockKey = refreshGenerationAdvisoryLockKey(initial.id);
  const sameRefreshContext = !!replacement.deviceHash
    && replacement.deviceHash === initial.family.deviceHash
    && (!initial.family.ipHash || replacement.ipHash === initial.family.ipHash);

  try {
    const result: RefreshTokenRotationResult | RefreshGenerationContention =
      await database.$transaction(async (tx) => {
      const ownsGeneration = await tryLockRefreshGeneration(tx, generationLockKey);
      if (!ownsGeneration) {
        if (sameRefreshContext && initialAuthorizationApproved) {
          logger.info('Concurrent refresh observed through database contention', {
            tokenId: initial.id,
            familyId: initial.familyId,
          });
          return { status: 'concurrent', familyId: initial.familyId } as const;
        }

        return {
          status: 'generation_contended',
          familyId: initial.familyId,
          disposition: initialGenerationActive ? 'suspicious' : 'authoritative_recheck',
        } as const;
      }

      if (!(await lockUser(tx, initial.userId)) || !(await lockFamily(tx, initial.familyId))) {
        return { status: 'invalid' } as const;
      }

      const candidate = await tx.refreshToken.findUnique({
        where: { id: parsed.id },
        include: { family: true },
      });
      if (!candidate
        || candidate.userId !== initial.userId
        || candidate.familyId !== initial.familyId
        || candidate.family.userId !== candidate.userId
        || !verifySensitive(parsed.secret, candidate.salt, candidate.tokenHash)) {
        return { status: 'invalid' } as const;
      }

      const now = new Date();
      const eligibilityWindow = createPortalBookingEligibilityWindow(now);
      if (candidate.family.revokedAt) {
        await revokeFamilyGraph(tx, candidate.familyId, now, 'authorization_chain_revoked');
        return { status: 'invalid' } as const;
      }
      if (candidate.family.absoluteExpiresAt <= now) return { status: 'invalid' } as const;

      if (candidate.revokedAt) {
        await revokeFamilyGraph(tx, candidate.familyId, now, 'refresh_token_replay');
        logger.warn('Refresh token replay detected; family revoked', {
          tokenId: candidate.id,
          familyId: candidate.familyId,
        });
        return { status: 'replayed', familyId: candidate.familyId } as const;
      }

      if (candidate.expiresAt <= now) return { status: 'invalid' } as const;

      const session = await tx.session.findUnique({ where: { id: candidate.id } });
      if (!session || session.userId !== candidate.userId) {
        // Pre-binding generations cannot be associated with one exact booking,
        // session, or family without guessing. Revoke them fail-closed and
        // require a one-time sign-in instead of accepting cookie substitution.
        await revokeFamilyGraph(tx, candidate.familyId, now, 'unbound_refresh_token');
        return { status: 'invalid' } as const;
      }

      const binding = replacement.presentedSession;
      if (binding.status === 'invalid'
        || (binding.status === 'present'
          && (binding.sessionId !== session.id
            || binding.userId !== session.userId
            || binding.bookingId !== session.bookingId))) {
        await revokeFamilyGraph(tx, candidate.familyId, now, 'session_binding_mismatch');
        return { status: 'invalid' } as const;
      }
      if (session.revokedAt) {
        await revokeFamilyGraph(tx, candidate.familyId, now, 'session_revoked');
        return { status: 'invalid' } as const;
      }

      const booking = await tx.booking.findUnique({ where: { id: session.bookingId } });
      if (!booking || !bookingIsEligible(booking, candidate.userId, eligibilityWindow)) {
        await revokeFamilyGraph(tx, candidate.familyId, now, 'booking_ineligible');
        return { status: 'invalid' } as const;
      }

      const revokedToken = await tx.refreshToken.updateMany({
        where: { id: candidate.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now, lastUsedAt: now },
      });
      const revokedSession = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (revokedToken.count !== 1 || revokedSession.count !== 1) {
        await revokeFamilyGraph(tx, candidate.familyId, now, 'authorization_race');
        return { status: 'replayed', familyId: candidate.familyId } as const;
      }

      const createdSession = await tx.session.create({
        data: {
          id: replacement.id,
          userId: candidate.userId,
          bookingId: session.bookingId,
          expiresAt: replacement.sessionExpiresAt,
        },
      });
      const createdToken = await tx.refreshToken.create({
        data: {
          id: replacement.id,
          userId: candidate.userId,
          tokenHash: replacement.tokenHash,
          salt: replacement.salt,
          familyId: candidate.familyId,
          expiresAt: new Date(Math.min(
            replacement.tokenExpiresAt,
            candidate.family.absoluteExpiresAt.getTime(),
          )),
          rotatedFromId: candidate.id,
          deviceHint: candidate.deviceHint,
          ipHint: candidate.ipHint,
        },
      });

      const rotatedSession = {
        id: createdSession.id,
        userId: createdSession.userId,
        bookingId: createdSession.bookingId,
        expiresAt: createdSession.expiresAt,
      };
      const sessionToken = replacement.createSessionToken(rotatedSession);

      return {
        status: 'rotated',
        old: mapToken({ ...candidate, revokedAt: now, lastUsedAt: now }),
        rec: mapToken(createdToken),
        session: rotatedSession,
        sessionToken,
      } as const;
    }, {
      isolationLevel: 'ReadCommitted',
      maxWait: ROTATION_TRANSACTION_MAX_WAIT_MS,
      timeout: ROTATION_TRANSACTION_TIMEOUT_MS,
    });

    if (result.status !== 'generation_contended') return result;

    // The try-lock transaction held no User/Family rows and has now ended.
    // A separate, longer bounded transaction preserves User -> Family order
    // for the authoritative fail-closed recheck and revocation. It does not
    // wait for the advisory marker: if it reaches User first, the owner later
    // observes the revoked family; if the owner reaches User first, cleanup
    // waits and revokes every committed descendant before returning.
    return await database.$transaction(async (tx) => {
      await configureContentionLockTimeout(tx);
      if (!(await lockUser(tx, initial.userId)) || !(await lockFamily(tx, initial.familyId))) {
        return { status: 'invalid' } as const;
      }

      const candidate = await tx.refreshToken.findUnique({
        where: { id: parsed.id },
        include: { family: true },
      });
      if (!candidate
        || candidate.userId !== initial.userId
        || candidate.familyId !== initial.familyId
        || candidate.family.userId !== candidate.userId
        || !verifySensitive(parsed.secret, candidate.salt, candidate.tokenHash)) {
        return { status: 'invalid' } as const;
      }

      const now = new Date();
      if (result.disposition === 'suspicious') {
        await revokeFamilyGraph(tx, candidate.familyId, now, 'suspicious_refresh_overlap');
        logger.warn('Unapproved refresh overlap detected; family revoked', {
          tokenId: candidate.id,
          familyId: candidate.familyId,
        });
        return { status: 'replayed', familyId: candidate.familyId } as const;
      }

      if (candidate.family.revokedAt) {
        await revokeFamilyGraph(tx, candidate.familyId, now, 'authorization_chain_revoked');
        return { status: 'invalid' } as const;
      }
      if (candidate.family.absoluteExpiresAt <= now || candidate.expiresAt <= now) {
        return { status: 'invalid' } as const;
      }
      if (candidate.revokedAt) {
        await revokeFamilyGraph(tx, candidate.familyId, now, 'refresh_token_replay');
        logger.warn('Refresh token replay detected after generation contention; family revoked', {
          tokenId: candidate.id,
          familyId: candidate.familyId,
        });
        return { status: 'replayed', familyId: candidate.familyId } as const;
      }

      // An initially inactive generation cannot become active while the
      // immutable predecessor row and its family remain the same. Refuse any
      // unexpected state transition instead of issuing a credential.
      return { status: 'invalid' } as const;
    }, {
      isolationLevel: 'ReadCommitted',
      maxWait: ROTATION_TRANSACTION_MAX_WAIT_MS,
      timeout: CONTENTION_CLEANUP_TRANSACTION_TIMEOUT_MS,
    });
  } catch (error) {
    logger.error('refreshTokenRepository(prisma): rotate failed', error);
    throw error;
  }
}

async function revokeAuthorizationForSession(
  database: PrismaClient,
  sessionId: string,
  reason = 'session_revoked',
): Promise<boolean> {
  try {
    return await database.$transaction(async (tx) => {
      const initialSession = await tx.session.findUnique({ where: { id: sessionId } });
      if (!initialSession || !(await lockUser(tx, initialSession.userId))) return false;

      const session = await tx.session.findUnique({ where: { id: sessionId } });
      if (!session) return false;
      const token = await tx.refreshToken.findUnique({ where: { id: sessionId } });
      if (!token || token.userId !== session.userId || !(await lockFamily(tx, token.familyId))) {
        await tx.session.updateMany({
          where: { id: sessionId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return true;
      }

      const family = await tx.refreshTokenFamily.findUnique({ where: { id: token.familyId } });
      if (!family || family.userId !== token.userId) {
        await tx.session.updateMany({
          where: { id: sessionId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.refreshToken.updateMany({
          where: { id: token.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return true;
      }

      await revokeFamilyGraph(tx, token.familyId, new Date(), reason);
      return true;
    });
  } catch (error) {
    logger.error('refreshTokenRepository(prisma): session authorization revoke failed', error);
    throw error;
  }
}

async function revokeFamilyForToken(
  database: PrismaClient,
  token: string,
  reason = 'logout',
): Promise<boolean> {
  const parsed = parseCompositeToken(token);
  if (!parsed?.id) return false;
  const initial = await database.refreshToken.findUnique({
    where: { id: parsed.id },
    include: { family: true },
  });
  if (!initial
    || initial.family.userId !== initial.userId
    || !verifySensitive(parsed.secret, initial.salt, initial.tokenHash)) return false;

  return database.$transaction(async (tx) => {
    if (!(await lockUser(tx, initial.userId)) || !(await lockFamily(tx, initial.familyId))) {
      return false;
    }
    const candidate = await tx.refreshToken.findUnique({
      where: { id: parsed.id },
      include: { family: true },
    });
    if (!candidate
      || candidate.family.userId !== candidate.userId
      || !verifySensitive(parsed.secret, candidate.salt, candidate.tokenHash)) {
      return false;
    }
    await revokeFamilyGraph(tx, candidate.familyId, new Date(), reason);
    return true;
  });
}

async function purgeExpired(
  database: PrismaClient,
  maxAgeDaysPastExpiry = 30,
): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - maxAgeDaysPastExpiry * 24 * 60 * 60 * 1000);
    const result = await database.refreshToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    if (result.count > 0) logger.info('Expired refresh tokens purged (prisma)', { count: result.count });
    return result.count;
  } catch (error) {
    logger.error('refreshTokenRepository(prisma): purgeExpired failed', error);
    throw error;
  }
}

export function createRefreshTokenRepository(database: PrismaClient) {
  return {
    create: create.bind(undefined, database),
    verify: verify.bind(undefined, database),
    revoke: revoke.bind(undefined, database),
    rotate: rotate.bind(undefined, database),
    revokeAuthorizationForSession: revokeAuthorizationForSession.bind(undefined, database),
    revokeFamilyForToken: revokeFamilyForToken.bind(undefined, database),
    purgeExpired: purgeExpired.bind(undefined, database),
  };
}

export const refreshTokenRepository = createRefreshTokenRepository(prisma);
