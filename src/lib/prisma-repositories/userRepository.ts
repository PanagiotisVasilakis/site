import { prisma } from '@/lib/prisma';

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
  return (await prisma.user.findUnique({ where: { phoneE164: phone }, select: userSelect })) ?? undefined;
}

async function findById(id: string): Promise<UserRecord | undefined> {
  return (await prisma.user.findUnique({ where: { id }, select: userSelect })) ?? undefined;
}

async function getAll(): Promise<UserRecord[]> {
  return await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, select: userSelect });
}

export const userRepository = {
  findByPhone,
  findById,
  getAll,
};
