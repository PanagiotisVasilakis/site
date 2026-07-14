import crypto from 'node:crypto';

import { verifySensitive } from '@/lib/crypto';
import { logger } from '@/lib/logger-enterprise';
import { prisma } from '@/lib/prisma';

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

export type RefreshTokenRotationResult =
  | { status: 'rotated'; old: GuestRefreshTokenRec; rec: GuestRefreshTokenRec }
  | { status: 'invalid' }
  | { status: 'concurrent'; familyId: string }
  | { status: 'replayed'; familyId: string };

type RefreshTokenReplacement = {
  tokenHash: string;
  salt: string;
  expiresAt: number;
  deviceHash?: string;
  ipHash?: string;
};

const REFRESH_FAMILY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CONCURRENT_ROTATION_GRACE_MS = 5_000;

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
    // Legacy token format (secret only)
    return { secret: normalized };
  }

  const id = normalized.slice(0, separatorIndex);
  const secret = normalized.slice(separatorIndex + 1);
  if (!UUID_REGEX.test(id) || !secret) {
    return null;
  }

  return { id, secret };
}

async function create(
  userId: string,
  tokenHash: string,
  salt: string,
  familyId: string,
  expiresAt: number,
  opts?: { deviceHint?: string; ipHint?: string }
): Promise<GuestRefreshTokenRec> {
  try {
    const token = await prisma.$transaction(async (tx) => {
      const now = new Date();
      let family = await tx.refreshTokenFamily.findUnique({ where: { id: familyId } });
      if (!family) {
        family = await tx.refreshTokenFamily.create({
          data: {
            id: familyId,
            userId,
            absoluteExpiresAt: new Date(now.getTime() + REFRESH_FAMILY_TTL_MS),
            deviceHash: opts?.deviceHint ?? null,
            ipHash: opts?.ipHint ?? null,
          },
        });
      }
      if (family.userId !== userId || family.revokedAt || family.absoluteExpiresAt <= now) {
        throw new Error('Refresh token family is invalid or expired');
      }
      return tx.refreshToken.create({
        data: {
          id: crypto.randomUUID(),
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

async function verify(token: string): Promise<GuestRefreshTokenRec | undefined> {
  try {
    const parsed = parseCompositeToken(token);
    if (!parsed) return undefined;

    const now = Date.now();

    // O(1) path for modern token format: <token-id>.<secret>
    if (parsed.id) {
      const candidate = await prisma.refreshToken.findUnique({
        where: { id: parsed.id },
        include: { family: true },
      });
      if (!candidate
        || candidate.revokedAt
        || candidate.expiresAt.getTime() <= now
        || candidate.family.revokedAt
        || candidate.family.absoluteExpiresAt.getTime() <= now) {
        return undefined;
      }

      if (!verifySensitive(parsed.secret, candidate.salt, candidate.tokenHash)) {
        return undefined;
      }

      await prisma.refreshToken.update({
        where: { id: candidate.id },
        data: { lastUsedAt: new Date(now) },
      });
      return mapToken({ ...candidate, lastUsedAt: new Date(now) });
    }

    // Backward-compatible path for legacy tokens (secret-only format).
    // Keep this off by default because it requires scanning all active tokens.
    if (process.env.GUEST_REFRESH_ALLOW_LEGACY_SECRET_ONLY !== '1') {
      logger.warn('Rejected legacy secret-only refresh token; enable GUEST_REFRESH_ALLOW_LEGACY_SECRET_ONLY=1 only during migration');
      return undefined;
    }

    const activeTokens = await prisma.refreshToken.findMany({
      where: {
        revokedAt: null,
        family: { revokedAt: null, absoluteExpiresAt: { gt: new Date() } },
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const candidate of activeTokens) {
      if (verifySensitive(parsed.secret, candidate.salt, candidate.tokenHash)) {
        await prisma.refreshToken.update({
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

async function revoke(id: string): Promise<boolean> {
  try {
    const result = await prisma.refreshToken.updateMany({
      where: {
        id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (result.count > 0) {
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
  token: string,
  replacement: RefreshTokenReplacement,
): Promise<RefreshTokenRotationResult> {
  const parsed = parseCompositeToken(token);
  if (!parsed?.id) {
    return { status: 'invalid' };
  }

  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const candidate = await tx.refreshToken.findUnique({
        where: { id: parsed.id },
        include: { family: true },
      });
      if (!candidate || !verifySensitive(parsed.secret, candidate.salt, candidate.tokenHash)) {
        return { status: 'invalid' } as const;
      }

      if (candidate.family.revokedAt || candidate.family.absoluteExpiresAt <= now) {
        return { status: 'invalid' } as const;
      }

      if (candidate.revokedAt) {
        const sameDevice = !!replacement.deviceHash
          && replacement.deviceHash === candidate.family.deviceHash
          && (!candidate.family.ipHash || replacement.ipHash === candidate.family.ipHash);
        if (sameDevice && now.getTime() - candidate.revokedAt.getTime() <= CONCURRENT_ROTATION_GRACE_MS) {
          logger.info('Concurrent refresh within same-device grace window', {
            tokenId: candidate.id,
            familyId: candidate.familyId,
          });
          return { status: 'concurrent', familyId: candidate.familyId } as const;
        }
        await tx.refreshTokenFamily.update({
          where: { id: candidate.familyId },
          data: { revokedAt: now, revocationReason: 'refresh_token_replay' },
        });
        await tx.refreshToken.updateMany({
          where: { familyId: candidate.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        logger.warn('Refresh token replay detected; family revoked', {
          tokenId: candidate.id,
          familyId: candidate.familyId,
        });
        return { status: 'replayed', familyId: candidate.familyId } as const;
      }

      if (candidate.expiresAt.getTime() <= now.getTime()) {
        return { status: 'invalid' } as const;
      }

      const revoked = await tx.refreshToken.updateMany({
        where: {
          id: candidate.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now, lastUsedAt: now },
      });

      if (revoked.count !== 1) {
        await tx.refreshTokenFamily.update({
          where: { id: candidate.familyId },
          data: { revokedAt: now, revocationReason: 'concurrent_rotation_conflict' },
        });
        await tx.refreshToken.updateMany({
          where: { familyId: candidate.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        logger.warn('Concurrent refresh token replay detected; family revoked', {
          tokenId: candidate.id,
          familyId: candidate.familyId,
        });
        return { status: 'replayed', familyId: candidate.familyId } as const;
      }

      const created = await tx.refreshToken.create({
        data: {
          id: crypto.randomUUID(),
          userId: candidate.userId,
          tokenHash: replacement.tokenHash,
          salt: replacement.salt,
          familyId: candidate.familyId,
          expiresAt: new Date(Math.min(replacement.expiresAt, candidate.family.absoluteExpiresAt.getTime())),
          rotatedFromId: candidate.id,
          deviceHint: candidate.deviceHint,
          ipHint: candidate.ipHint,
        },
      });

      return {
        status: 'rotated',
        old: mapToken({ ...candidate, revokedAt: now, lastUsedAt: now }),
        rec: mapToken(created),
      } as const;
    });
  } catch (error) {
    logger.error('refreshTokenRepository(prisma): rotate failed', error);
    throw error;
  }
}

async function revokeFamilyForToken(token: string, reason = 'logout'): Promise<boolean> {
  const parsed = parseCompositeToken(token);
  if (!parsed?.id) return false;
  const candidate = await prisma.refreshToken.findUnique({ where: { id: parsed.id } });
  if (!candidate || !verifySensitive(parsed.secret, candidate.salt, candidate.tokenHash)) return false;
  const now = new Date();
  await prisma.$transaction([
    prisma.refreshTokenFamily.updateMany({
      where: { id: candidate.familyId, revokedAt: null },
      data: { revokedAt: now, revocationReason: reason },
    }),
    prisma.refreshToken.updateMany({
      where: { familyId: candidate.familyId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  return true;
}

async function purgeExpired(maxAgeDaysPastExpiry: number = 30): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - maxAgeDaysPastExpiry * 24 * 60 * 60 * 1000);
    const result = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: cutoff,
        },
      },
    });

    if (result.count > 0) {
      logger.info('Expired refresh tokens purged (prisma)', { count: result.count });
    }

    return result.count;
  } catch (error) {
    logger.error('refreshTokenRepository(prisma): purgeExpired failed', error);
    throw error;
  }
}

export const refreshTokenRepository = {
  create,
  verify,
  revoke,
  rotate,
  revokeFamilyForToken,
  purgeExpired,
};
