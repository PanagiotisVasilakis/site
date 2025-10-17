import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export type IdentityRecord = {
  user_id: string;
  type: 'AFM' | 'PASSPORT';
  value_hash: string;
  salt: string;
  last4_mask: string;
  verified_at?: number;
};

function mapIdentity(identity: {
  userId: string;
  type: 'AFM' | 'PASSPORT';
  valueHash: string;
  salt: string;
  last4Mask: string;
  verifiedAt: Date | null;
}): IdentityRecord {
  return {
    user_id: identity.userId,
    type: identity.type,
    value_hash: identity.valueHash,
    salt: identity.salt,
    last4_mask: identity.last4Mask,
    verified_at: identity.verifiedAt ? identity.verifiedAt.getTime() : undefined,
  };
}

async function upsert(
  userId: string,
  type: 'AFM' | 'PASSPORT',
  hash: string,
  salt: string,
  last4Mask: string,
): Promise<IdentityRecord> {
  try {
    const identity = await prisma.identity.upsert({
      where: {
        userId_type: { userId, type },
      },
      update: {
        valueHash: hash,
        salt,
        last4Mask,
        verifiedAt: new Date(),
      },
      create: {
        userId,
        type,
        valueHash: hash,
        salt,
        last4Mask,
        verifiedAt: new Date(),
      },
    });

    logger.info('Identity upserted (prisma)', { userId, type });
    return mapIdentity(identity);
  } catch (error) {
    logger.error('identityRepository(prisma): upsert failed', error);
    throw error;
  }
}

async function getAll(): Promise<IdentityRecord[]> {
  try {
    const identities = await prisma.identity.findMany({
      orderBy: [{ userId: 'asc' }, { type: 'asc' }],
    });

    return identities.map(mapIdentity);
  } catch (error) {
    logger.error('identityRepository(prisma): getAll failed', error);
    throw error;
  }
}

export const identityRepository = {
  upsert,
  getAll,
};
