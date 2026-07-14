import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';

export const GUEST_DATASET_KEYS = ['bookings', 'users', 'checkins'] as const;
export type GuestDatasetKey = typeof GUEST_DATASET_KEYS[number];

export type GuestDatasetSnapshot = {
  key: GuestDatasetKey;
  version: string;
  rowCount: number;
  latestChange: string | null;
  error?: string;
};

function formatSnapshot(
  key: GuestDatasetKey,
  rowCount: number,
  latestChange: Date | null | undefined
): GuestDatasetSnapshot {
  const latestChangeMs = latestChange ? latestChange.getTime() : 0;
  return {
    key,
    rowCount,
    latestChange: latestChange ? latestChange.toISOString() : null,
    version: `${rowCount}:${latestChangeMs}`,
  };
}

async function computeBookingSnapshot(): Promise<GuestDatasetSnapshot> {
  const aggregate = await prisma.booking.aggregate({
    _count: { _all: true },
    _max: { createdAt: true },
  });
  return formatSnapshot('bookings', aggregate._count?._all ?? 0, aggregate._max?.createdAt);
}

async function computeUserSnapshot(): Promise<GuestDatasetSnapshot> {
  const aggregate = await prisma.user.aggregate({
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  return formatSnapshot('users', aggregate._count?._all ?? 0, aggregate._max?.updatedAt);
}

async function computeCheckinSnapshot(): Promise<GuestDatasetSnapshot> {
  const aggregate = await prisma.checkin.aggregate({
    _count: { _all: true },
    _max: { acceptedAt: true },
  });
  return formatSnapshot('checkins', aggregate._count?._all ?? 0, aggregate._max?.acceptedAt);
}

const COMPUTE_SNAPSHOT: Record<GuestDatasetKey, () => Promise<GuestDatasetSnapshot>> = {
  bookings: computeBookingSnapshot,
  users: computeUserSnapshot,
  checkins: computeCheckinSnapshot,
};

export async function getGuestDatasetSnapshot(key: GuestDatasetKey): Promise<GuestDatasetSnapshot> {
  try {
    return await COMPUTE_SNAPSHOT[key]();
  } catch (error) {
    logger.error('guestDatasetVersion: failed to compute snapshot', { key, error });
    return {
      key,
      version: `error:${Date.now()}`,
      rowCount: -1,
      latestChange: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getGuestDatasetSnapshots(
  keys: GuestDatasetKey[] = [...GUEST_DATASET_KEYS]
): Promise<Record<GuestDatasetKey, GuestDatasetSnapshot>> {
  const entries = await Promise.all(keys.map(async (key) => [key, await getGuestDatasetSnapshot(key)] as const));
  return Object.fromEntries(entries) as Record<GuestDatasetKey, GuestDatasetSnapshot>;
}
