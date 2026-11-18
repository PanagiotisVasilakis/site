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

async function findManyByIds(ids: readonly string[]): Promise<UserRecord[]> {
  if (ids.length === 0) return [];
  return await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: userSelect,
  });
}

async function count(): Promise<number> {
  return await prisma.user.count();
}

export const userRepository = {
  findByPhone,
  findById,
  findManyByIds,
  count,
};
