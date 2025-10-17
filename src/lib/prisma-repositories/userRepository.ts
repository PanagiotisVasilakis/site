import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import crypto from 'node:crypto';
import type { User as PrismaUser, CountryOrigin } from '@prisma/client';

export type UserRecord = {
  id: string;
  email?: string;
  phone_e164: string;
  password_hash?: string;
  country_origin: CountryOrigin;
  created_at: number;
  updated_at: number;
};

function mapUser(user: PrismaUser): UserRecord {
  return {
    id: user.id,
    email: user.email ?? undefined,
    phone_e164: user.phoneE164,
    password_hash: user.passwordHash ?? undefined,
    country_origin: user.countryOrigin,
    created_at: user.createdAt.getTime(),
    updated_at: user.updatedAt.getTime(),
  };
}

async function create(input: Omit<UserRecord, 'id' | 'created_at' | 'updated_at'>): Promise<UserRecord> {
  try {
    const id = crypto.randomUUID();
    const user = await prisma.user.create({
      data: {
        id,
        email: input.email ?? null,
        phoneE164: input.phone_e164,
        passwordHash: input.password_hash ?? null,
        countryOrigin: input.country_origin,
      },
    });

    logger.info('User created (prisma)', { userId: id });
    return mapUser(user);
  } catch (error) {
    logger.error('userRepository(prisma): create failed', error);
    throw error;
  }
}

async function findByPhone(phone: string): Promise<UserRecord | undefined> {
  try {
    const user = await prisma.user.findFirst({ where: { phoneE164: phone } });
    return user ? mapUser(user) : undefined;
  } catch (error) {
    logger.error('userRepository(prisma): findByPhone failed', error);
    throw error;
  }
}

async function findById(id: string): Promise<UserRecord | undefined> {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    return user ? mapUser(user) : undefined;
  } catch (error) {
    logger.error('userRepository(prisma): findById failed', error);
    throw error;
  }
}

async function updatePassword(userId: string, password_hash: string): Promise<UserRecord | undefined> {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: password_hash,
      },
    });

    return mapUser(user);
  } catch (error) {
    logger.error('userRepository(prisma): updatePassword failed', error);
    throw error;
  }
}

async function getAll(): Promise<UserRecord[]> {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return users.map(mapUser);
  } catch (error) {
    logger.error('userRepository(prisma): getAll failed', error);
    throw error;
  }
}

export const userRepository = {
  create,
  findByPhone,
  findById,
  updatePassword,
  getAll,
};
