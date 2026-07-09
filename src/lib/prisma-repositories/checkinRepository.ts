import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import { mapCheckinFromDb } from '@/lib/mappers/domainMappers';

export type CheckinRecord = {
  booking_id: string;
  arrival_time: string;
  special_requests?: string;
  accepted_at: number;
};

async function upsert(bookingId: string, arrivalTime: string, specialRequests?: string): Promise<CheckinRecord> {
  try {
    const checkin = await prisma.checkin.upsert({
      where: { bookingId },
      update: {
        arrivalTime,
        specialRequests: specialRequests ?? null,
        acceptedAt: new Date(),
      },
      create: {
        bookingId,
        arrivalTime,
        specialRequests: specialRequests ?? null,
        acceptedAt: new Date(),
      },
    });

    logger.info('Checkin record upserted (prisma)', { bookingId });
    return mapCheckinFromDb(checkin);
  } catch (error) {
    logger.error('checkinRepository(prisma): upsert failed', error);
    throw error;
  }
}

async function getByBookingId(bookingId: string): Promise<CheckinRecord | undefined> {
  try {
    const checkin = await prisma.checkin.findUnique({ where: { bookingId } });
    return checkin ? mapCheckinFromDb(checkin) : undefined;
  } catch (error) {
    logger.error('checkinRepository(prisma): getByBookingId failed', error);
    throw error;
  }
}

async function getAll(): Promise<CheckinRecord[]> {
  try {
    const checkins = await prisma.checkin.findMany({ orderBy: { acceptedAt: 'desc' } });
    return checkins.map(mapCheckinFromDb);
  } catch (error) {
    logger.error('checkinRepository(prisma): getAll failed', error);
    throw error;
  }
}

export const checkinRepository = {
  upsert,
  getByBookingId,
  getAll,
};
