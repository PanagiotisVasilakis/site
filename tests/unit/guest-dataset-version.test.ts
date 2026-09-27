import { describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  booking: { aggregate: vi.fn() },
  user: { aggregate: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { GUEST_DATASET_KEYS, getGuestDatasetSnapshot } from '@/lib/guestDatasetVersion';

describe('guest dataset versions', () => {
  it('tracks bookings and users only', () => {
    expect(GUEST_DATASET_KEYS).toEqual(['bookings', 'users']);
  });

  it('changes the booking version when a booking is updated', async () => {
    prismaMock.booking.aggregate.mockResolvedValue({ _count: { _all: 3 }, _max: { updatedAt: new Date('2030-07-14T12:00:00Z') } });
    const before = await getGuestDatasetSnapshot('bookings');

    prismaMock.booking.aggregate.mockResolvedValue({ _count: { _all: 3 }, _max: { updatedAt: new Date('2030-07-14T12:05:00Z') } });
    const after = await getGuestDatasetSnapshot('bookings');

    expect(after.rowCount).toBe(before.rowCount);
    expect(after.version).not.toBe(before.version);
  });

  it('reports an error version instead of throwing when the query fails', async () => {
    prismaMock.user.aggregate.mockRejectedValue(new Error('database unavailable'));

    const snapshot = await getGuestDatasetSnapshot('users');

    expect(snapshot).toMatchObject({ key: 'users', rowCount: -1, error: 'database unavailable' });
    expect(snapshot.version).toMatch(/^error:/u);
  });
});
