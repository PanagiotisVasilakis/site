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

async function create(
  userId: string,
  tokenHash: string,
  salt: string,
  familyId: string,
  expiresAt: number,
  opts?: { deviceHint?: string; ipHint?: string }
): Promise<GuestRefreshTokenRec> {
  try {
    const token = await prisma.refreshToken.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        tokenHash,
        salt,
        familyId,
        expiresAt: new Date(expiresAt),
        deviceHint: opts?.deviceHint ?? null,
        ipHint: opts?.ipHint ?? null,
      },
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
    const activeTokens = await prisma.refreshToken.findMany({
      where: {
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = Date.now();
    for (const candidate of activeTokens) {
      if (verifySensitive(token, candidate.salt, candidate.tokenHash)) {
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

async function updateRotatedFromId(id: string, rotatedFromId: string): Promise<void> {
  try {
    await prisma.refreshToken.update({
      where: { id },
      data: { rotatedFromId },
    });
  } catch (error) {
    logger.error('refreshTokenRepository(prisma): updateRotatedFromId failed', error);
    throw error;
  }
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
  updateRotatedFromId,
  purgeExpired,
};
