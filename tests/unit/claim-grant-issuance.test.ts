import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => {
  const tx = {
    booking: { findUnique: vi.fn() },
    bookingClaimGrant: { updateMany: vi.fn(), create: vi.fn() },
  };
  return { tx, $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { issueBookingClaimGrant, PortalAuthError } from '@/lib/portalAuthService';

const NOW = new Date('2030-07-10T15:00:00.000Z');
const day = (offset: number) => new Date(Date.UTC(2030, 6, 10 + offset));

function issueFor(startOffset: number, endOffset: number) {
  prismaMock.tx.booking.findUnique.mockResolvedValue({
    id: 'booking-1', userId: null, accessStatus: 'PENDING', startDate: day(startOffset), endDate: day(endOffset),
  });
  return issueBookingClaimGrant({ bookingId: 'booking-1', channel: 'REMOTE', adminSessionId: 'admin-session' });
}

describe('claim grant issuance access window', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('CLAIM_TOKEN_PEPPER', 'claim-grant-issuance-test-pepper-0123456789');
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof prismaMock.tx) => unknown) => callback(prismaMock.tx));
    prismaMock.tx.bookingClaimGrant.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.tx.bookingClaimGrant.create.mockResolvedValue({});
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ['check-in today', 0, 3],
    ['check-in in 7 days', 7, 10],
    ['check-out today', -3, 0],
  ])('issues a token for a booking with %s', async (_label, start, end) => {
    await expect(issueFor(start, end)).resolves.toMatchObject({ token: expect.stringMatching(/^claim_/) });
    expect(prismaMock.tx.bookingClaimGrant.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['check-in in 8 days', 8, 12],
    ['a stay that ended yesterday', -4, -1],
  ])('refuses %s without creating a grant', async (_label, start, end) => {
    await expect(issueFor(start, end)).rejects.toEqual(new PortalAuthError('BOOKING_NOT_IN_ACCESS_WINDOW'));
    expect(prismaMock.tx.bookingClaimGrant.create).not.toHaveBeenCalled();
  });
});
