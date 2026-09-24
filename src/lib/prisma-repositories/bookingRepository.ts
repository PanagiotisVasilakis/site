import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import { mapBookingFromDb } from '@/lib/mappers/domainMappers';

export type BookingRecord = {
  id: string;
  source: 'ONSITE' | 'EXTERNAL';
  reference?: string;
  start_date: string;
  end_date: string;
  user_id?: string;
  provider: string;
  external_reference?: string;
  access_status: 'PENDING' | 'VERIFIED';
  claimed_at?: number;
  created_at: number;
};

async function findByReference(reference: string): Promise<BookingRecord | undefined> {
  try {
    const bookings = await prisma.booking.findMany({
      where: {
        OR: [{ reference }, { externalReference: reference }],
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });
    if (bookings.length > 1) {
      throw new Error('AMBIGUOUS_BOOKING_REFERENCE');
    }
    return bookings[0] ? mapBookingFromDb(bookings[0]) : undefined;
  } catch (error) {
    logger.error('bookingRepository(prisma): findByReference failed', error);
    throw error;
  }
}

async function findById(id: string): Promise<BookingRecord | undefined> {
  try {
    const booking = await prisma.booking.findUnique({ where: { id } });
    return booking ? mapBookingFromDb(booking) : undefined;
  } catch (error) {
    logger.error('bookingRepository(prisma): findById failed', error);
    throw error;
  }
}

async function getAll(): Promise<BookingRecord[]> {
  try {
    const bookings = await prisma.booking.findMany({ orderBy: { createdAt: 'desc' } });
    return bookings.map(mapBookingFromDb);
  } catch (error) {
    logger.error('bookingRepository(prisma): getAll failed', error);
    throw error;
  }
}

export const bookingRepository = {
  findByReference,
  findById,
  getAll,
};
