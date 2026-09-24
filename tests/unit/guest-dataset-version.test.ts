import { describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  checkin: { aggregate: vi.fn(), count: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { getGuestDatasetSnapshot } from '@/lib/guestDatasetVersion';

describe('guest dataset versions', () => {
  it('changes the check-in version when erasure clears special requests', async () => {
    prismaMock.checkin.aggregate.mockResolvedValue({
      _count: { _all: 3 },
      _max: { acceptedAt: new Date('2030-07-14T12:00:00Z') },
    });

    prismaMock.checkin.count.mockResolvedValue(2);
    const beforeErasure = await getGuestDatasetSnapshot('checkins');

    // Erasure nulls specialRequests but leaves row count and acceptedAt unchanged.
    prismaMock.checkin.count.mockResolvedValue(1);
    const afterErasure = await getGuestDatasetSnapshot('checkins');

    expect(afterErasure.rowCount).toBe(beforeErasure.rowCount);
    expect(afterErasure.version).not.toBe(beforeErasure.version);
  });
});
