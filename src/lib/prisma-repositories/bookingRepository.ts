import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import crypto from 'node:crypto';

export type BookingRecord = {
  id: string;
  source: 'ONSITE' | 'EXTERNAL';
  reference?: string;
  last_name_hash?: string;
  last_name_salt?: string;
  last_name_token?: string;
  last_name_token_nows?: string;
  start_date: string;
  end_date: string;
  user_id?: string;
  created_at: number;
};

function mapBooking(booking: {
  id: string;
  source: 'ONSITE' | 'EXTERNAL';
  reference: string | null;
  lastNameHash: string | null;
  lastNameSalt: string | null;
  lastNameToken: string | null;
  lastNameTokenNoWs: string | null;
  startDate: Date;
  endDate: Date;
  userId: string | null;
  createdAt: Date;
}): BookingRecord {
  return {
    id: booking.id,
    source: booking.source,
    reference: booking.reference ?? undefined,
    last_name_hash: booking.lastNameHash ?? undefined,
    last_name_salt: booking.lastNameSalt ?? undefined,
    last_name_token: booking.lastNameToken ?? undefined,
    last_name_token_nows: booking.lastNameTokenNoWs ?? undefined,
    start_date: booking.startDate.toISOString(),
    end_date: booking.endDate.toISOString(),
    user_id: booking.userId ?? undefined,
    created_at: booking.createdAt.getTime(),
  };
}

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
        lastNameHash: params.last_name_hash ?? null,
        lastNameSalt: params.last_name_salt ?? null,
        lastNameToken: params.last_name_token ?? null,
        lastNameTokenNoWs: params.last_name_token_nows ?? null,
        startDate: new Date(params.start_date),
        endDate: new Date(params.end_date),
        userId: params.user_id ?? null,
      },
    });

    logger.info('Booking created (prisma)', { bookingId: id });
    return mapBooking(booking);
  } catch (error) {
    logger.error('bookingRepository(prisma): create failed', error);
    throw error;
  }
}

async function findByReferenceAndLastName(
  reference: string,
  lastNameTokenCandidates: string[],
): Promise<BookingRecord | undefined> {
  try {
    if (lastNameTokenCandidates.length === 0) {
      return undefined;
    }

    const clauses = [] as { lastNameToken?: string; lastNameTokenNoWs?: string }[];

    for (const token of lastNameTokenCandidates) {
      clauses.push({ lastNameToken: token });
      clauses.push({ lastNameTokenNoWs: token });
    }

    const booking = await prisma.booking.findFirst({
      where: {
        reference,
        OR: clauses.length > 0 ? clauses : undefined,
      },
    });

    return booking ? mapBooking(booking) : undefined;
  } catch (error) {
    logger.error('bookingRepository(prisma): findByReferenceAndLastName failed', error);
    throw error;
  }
}

async function findById(id: string): Promise<BookingRecord | undefined> {
  try {
    const booking = await prisma.booking.findUnique({ where: { id } });
    return booking ? mapBooking(booking) : undefined;
  } catch (error) {
    logger.error('bookingRepository(prisma): findById failed', error);
    throw error;
  }
}

async function findEligibleForUser(userId: string, nowDateISO: string): Promise<BookingRecord | undefined> {
  try {
    const booking = await prisma.booking.findFirst({
      where: {
        userId,
        endDate: {
          gte: new Date(nowDateISO),
        },
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    return booking ? mapBooking(booking) : undefined;
  } catch (error) {
    logger.error('bookingRepository(prisma): findEligibleForUser failed', error);
    throw error;
  }
}

async function getAll(): Promise<BookingRecord[]> {
  try {
    const bookings = await prisma.booking.findMany({ orderBy: { createdAt: 'desc' } });
    return bookings.map(mapBooking);
  } catch (error) {
    logger.error('bookingRepository(prisma): getAll failed', error);
    throw error;
  }
}

export const bookingRepository = {
  create,
  findByReferenceAndLastName,
  findById,
  findEligibleForUser,
  getAll,
};
