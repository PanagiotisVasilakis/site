import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';

// No password hash: the admin read model never needs it.
const userSelect = {
  id: true,
  phoneE164: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type UserRecord = {
  id: string;
  phoneE164: string;
  createdAt: Date;
  updatedAt: Date;
};

async function findByPhone(phone: string): Promise<UserRecord | undefined> {
  try {
    return (await prisma.user.findUnique({ where: { phoneE164: phone }, select: userSelect })) ?? undefined;
  } catch (error) {
    logger.error('userRepository(prisma): findByPhone failed', error);
    throw error;
  }
}

async function findById(id: string): Promise<UserRecord | undefined> {
  try {
    return (await prisma.user.findUnique({ where: { id }, select: userSelect })) ?? undefined;
  } catch (error) {
    logger.error('userRepository(prisma): findById failed', error);
    throw error;
  }
}

async function getAll(): Promise<UserRecord[]> {
  try {
    return await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, select: userSelect });
  } catch (error) {
    logger.error('userRepository(prisma): getAll failed', error);
    throw error;
  }
}

export const userRepository = {
  findByPhone,
  findById,
  getAll,
};
