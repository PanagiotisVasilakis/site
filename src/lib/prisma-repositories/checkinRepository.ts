import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export type CheckinRecord = {
  booking_id: string;
  arrival_time: string;
  special_requests?: string;
  accepted_at: number;
};

function mapCheckin(checkin: {
  bookingId: string;
  arrivalTime: string;
  specialRequests: string | null;
  acceptedAt: Date;
}): CheckinRecord {
  return {
    booking_id: checkin.bookingId,
    arrival_time: checkin.arrivalTime,
    special_requests: checkin.specialRequests ?? undefined,
    accepted_at: checkin.acceptedAt.getTime(),
  };
}

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
    return mapCheckin(checkin);
  } catch (error) {
    logger.error('checkinRepository(prisma): upsert failed', error);
    throw error;
  }
}

async function getByBookingId(bookingId: string): Promise<CheckinRecord | undefined> {
  try {
    const checkin = await prisma.checkin.findUnique({ where: { bookingId } });
    return checkin ? mapCheckin(checkin) : undefined;
  } catch (error) {
    logger.error('checkinRepository(prisma): getByBookingId failed', error);
    throw error;
  }
}

async function getAll(): Promise<CheckinRecord[]> {
  try {
    const checkins = await prisma.checkin.findMany({ orderBy: { acceptedAt: 'desc' } });
    return checkins.map(mapCheckin);
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
