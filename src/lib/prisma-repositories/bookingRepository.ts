import { prisma } from '@/lib/prisma';

// The admin read model needs these columns only.
const bookingSelect = {
  id: true,
  source: true,
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
  const bookings = await prisma.booking.findMany({
    where: { externalReference: reference },
    orderBy: { createdAt: 'desc' },
    take: 2,
    select: bookingSelect,
  });
  if (bookings.length > 1) {
    throw new Error('AMBIGUOUS_BOOKING_REFERENCE');
  }
  return bookings[0];
}

async function findById(id: string): Promise<BookingRecord | undefined> {
  return (await prisma.booking.findUnique({ where: { id }, select: bookingSelect })) ?? undefined;
}

async function getAll(): Promise<BookingRecord[]> {
  return await prisma.booking.findMany({ orderBy: { createdAt: 'desc' }, select: bookingSelect });
}

async function findByUserId(userId: string): Promise<BookingRecord[]> {
  return await prisma.booking.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: bookingSelect,
  });
}

async function findOnDate(date: Date): Promise<BookingRecord[]> {
  return await prisma.booking.findMany({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
    },
    orderBy: { createdAt: 'desc' },
    select: bookingSelect,
  });
}

async function countStatistics(): Promise<{ totalBookings: number; totalClaimedBookings: number }> {
  const [totalBookings, totalClaimedBookings] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where: { accessStatus: 'VERIFIED' } }),
  ]);
  return { totalBookings, totalClaimedBookings };
}

export const bookingRepository = {
  findByReference,
  findById,
  getAll,
  findByUserId,
  findOnDate,
  countStatistics,
};
