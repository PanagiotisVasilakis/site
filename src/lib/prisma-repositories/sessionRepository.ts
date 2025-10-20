import crypto from 'node:crypto';

import type { Session } from '@prisma/client';

import { logger } from '@/lib/logger-enterprise';
import { prisma } from '@/lib/prisma';

export type SessionRecord = {
  id: string;
  user_id: string;
  booking_id: string;
  expires_at: number;
  revoked_at?: number;
  created_at: number;
};

function mapSession(session: Session): SessionRecord {
  return {
    id: session.id,
    user_id: session.userId,
    booking_id: session.bookingId,
    expires_at: session.expiresAt.getTime(),
    revoked_at: session.revokedAt ? session.revokedAt.getTime() : undefined,
    created_at: session.createdAt.getTime(),
  };
}

export async function create(userId: string, bookingId: string, expiresAt: number): Promise<SessionRecord> {
  try {
    const id = crypto.randomUUID();
    const session = await prisma.session.create({
      data: {
        id,
        userId,
        bookingId,
        expiresAt: new Date(expiresAt),
      },
    });

    logger.info('Session created (prisma)', { sessionId: id, userId, bookingId });
    return mapSession(session);
  } catch (error) {
    logger.error('sessionRepository(prisma): create failed', error);
    throw error;
  }
}

export async function revoke(id: string): Promise<boolean> {
  try {
    const result = await prisma.session.updateMany({
      where: {
        id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (result.count > 0) {
      logger.info('Session revoked (prisma)', { sessionId: id });
      return true;
    }

    return false;
  } catch (error) {
    logger.error('sessionRepository(prisma): revoke failed', error);
    throw error;
  }
}
