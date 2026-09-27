import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';

// The admin read model needs these columns only.
const bookingSelect = {
  id: true,
  source: true,
  reference: true,
  startDate: true,
  endDate: true,
  userId: true,
  provider: true,
  externalReference: true,
  accessStatus: true,
  claimedAt: true,
  createdAt: true,
} as const;

export type BookingRecord = {
  id: string;
  source: 'ONSITE' | 'EXTERNAL';
  reference: string | null;
  startDate: Date;
  endDate: Date;
  userId: string | null;
  provider: string;
  externalReference: string | null;
  accessStatus: 'PENDING' | 'VERIFIED';
  claimedAt: Date | null;
  createdAt: Date;
};

async function findByReference(reference: string): Promise<BookingRecord | undefined> {
  try {
    const bookings = await prisma.booking.findMany({
      where: {
        OR: [{ reference }, { externalReference: reference }],
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: bookingSelect,
    });
    if (bookings.length > 1) {
      throw new Error('AMBIGUOUS_BOOKING_REFERENCE');
    }
    return bookings[0];
  } catch (error) {
    logger.error('bookingRepository(prisma): findByReference failed', error);
    throw error;
  }
}

async function findById(id: string): Promise<BookingRecord | undefined> {
  try {
    return (await prisma.booking.findUnique({ where: { id }, select: bookingSelect })) ?? undefined;
  } catch (error) {
    logger.error('bookingRepository(prisma): findById failed', error);
    throw error;
  }
}

async function getAll(): Promise<BookingRecord[]> {
  try {
    return await prisma.booking.findMany({ orderBy: { createdAt: 'desc' }, select: bookingSelect });
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
