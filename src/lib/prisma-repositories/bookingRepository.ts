import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import crypto from 'node:crypto';
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

function generateId(): string {
  // PostgreSQL UUID column requires pure UUID format (no prefix)
  return crypto.randomUUID();
}

async function create(params: Omit<BookingRecord, 'id' | 'created_at'>): Promise<BookingRecord> {
  try {
    const id = generateId();
    const booking = await prisma.booking.create({
      data: {
        id,
        source: params.source,
        reference: params.reference ?? null,
        startDate: new Date(params.start_date),
        endDate: new Date(params.end_date),
        userId: params.user_id ?? null,
        provider: params.provider,
        externalReference: params.external_reference ?? null,
        accessStatus: params.access_status,
        claimedAt: params.claimed_at ? new Date(params.claimed_at) : null,
      },
    });

    logger.info('Booking created (prisma)', { bookingId: id });
    return mapBookingFromDb(booking);
  } catch (error) {
    logger.error('bookingRepository(prisma): create failed', error);
    throw error;
  }
}

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

async function findByProviderReference(provider: string, externalReference: string): Promise<BookingRecord | undefined> {
  try {
    const booking = await prisma.booking.findUnique({
      where: { provider_externalReference: { provider, externalReference } },
    });
    return booking ? mapBookingFromDb(booking) : undefined;
  } catch (error) {
    logger.error('bookingRepository(prisma): findByProviderReference failed', error);
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

async function findEligibleForUser(userId: string, nowDateISO: string): Promise<BookingRecord | undefined> {
  try {
    const today = new Date(nowDateISO);
    const accessWindowEnd = new Date(today);
    accessWindowEnd.setUTCDate(accessWindowEnd.getUTCDate() + 7);
    const booking = await prisma.booking.findFirst({
      where: {
        userId,
        accessStatus: 'VERIFIED',
        startDate: {
          lte: accessWindowEnd,
        },
        endDate: {
          gte: today,
        },
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    return booking ? mapBookingFromDb(booking) : undefined;
  } catch (error) {
    logger.error('bookingRepository(prisma): findEligibleForUser failed', error);
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
  create,
  findByReference,
  findByProviderReference,
  findById,
  findEligibleForUser,
  getAll,
};
