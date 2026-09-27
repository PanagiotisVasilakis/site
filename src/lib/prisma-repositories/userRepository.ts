import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import type { CountryOrigin } from '@/generated/prisma/client';

// No password hash: the admin read model and its cache never need it.
const userSelect = {
  id: true,
  email: true,
  phoneE164: true,
  countryOrigin: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type UserRecord = {
  id: string;
  email: string | null;
  phoneE164: string;
  countryOrigin: CountryOrigin;
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
