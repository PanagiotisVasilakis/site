import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import type { CountryOrigin } from '@/generated/prisma/client';
import { mapUserFromDb } from '@/lib/mappers/domainMappers';

export type UserRecord = {
  id: string;
  email?: string;
  phone_e164: string;
  password_hash?: string;
  country_origin: CountryOrigin;
  created_at: number;
  updated_at: number;
};

async function findByPhone(phone: string): Promise<UserRecord | undefined> {
  try {
    const user = await prisma.user.findUnique({ where: { phoneE164: phone } });
    return user ? mapUserFromDb(user) : undefined;
  } catch (error) {
    logger.error('userRepository(prisma): findByPhone failed', error);
    throw error;
  }
}

async function findById(id: string): Promise<UserRecord | undefined> {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    return user ? mapUserFromDb(user) : undefined;
  } catch (error) {
    logger.error('userRepository(prisma): findById failed', error);
    throw error;
  }
}

async function getAll(): Promise<UserRecord[]> {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return users.map(mapUserFromDb);
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
