import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import { mapAccessFromDb } from '@/lib/mappers/domainMappers';

export type AccessRecord = {
  user_id: string;
  booking_id: string;
  status: 'PENDING' | 'VERIFIED';
  created_at: number;
  updated_at: number;
};

async function set(userId: string, bookingId: string, status: 'PENDING' | 'VERIFIED'): Promise<AccessRecord> {
  try {
    const access = await prisma.access.upsert({
      where: {
        userId_bookingId: { userId, bookingId },
      },
      update: {
        status,
        updatedAt: new Date(),
      },
      create: {
        userId,
        bookingId,
        status,
      },
    });

    logger.info('Access record upserted (prisma)', { userId, bookingId, status });
    return mapAccessFromDb(access);
  } catch (error) {
    logger.error('accessRepository(prisma): set failed', error);
    throw error;
  }
}

async function listByUser(userId: string): Promise<AccessRecord[]> {
  try {
    const records = await prisma.access.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return records.map(mapAccessFromDb);
  } catch (error) {
    logger.error('accessRepository(prisma): listByUser failed', error);
    throw error;
  }
}

async function getAll(): Promise<AccessRecord[]> {
  try {
    const records = await prisma.access.findMany({ orderBy: { updatedAt: 'desc' } });
    return records.map(mapAccessFromDb);
  } catch (error) {
    logger.error('accessRepository(prisma): getAll failed', error);
    throw error;
  }
}

export const accessRepository = {
  set,
  listByUser,
  getAll,
};
