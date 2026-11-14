import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  session: { findUnique: vi.fn() },
  booking: { findUnique: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { verifyGuestSessionAccess, type GuestSessionPayload } from '@/lib/guestSession';

type Row = Record<string, unknown>;

const NOW = new Date('2030-07-10T15:00:00.000Z');
const day = (offset: number) => new Date(Date.UTC(2030, 6, 10 + offset));
const SESSION_ID = '4e000000-0000-4000-8000-000000000001';
const USER_ID = '4e000000-0000-4000-8000-000000000002';
const BOOKING_ID = '4e000000-0000-4000-8000-000000000003';
const OTHER_ID = '4e000000-0000-4000-8000-000000000004';

const payload: GuestSessionPayload = {
  type: 'guest',
  sid: SESSION_ID,
  user: { id: USER_ID },
  booking: { id: BOOKING_ID },
};

function arrange(session: Row | null = {}, booking: Row | null = {}) {
  prismaMock.session.findUnique.mockResolvedValue(session && {
    id: SESSION_ID,
    userId: USER_ID,
    bookingId: BOOKING_ID,
    revokedAt: null,
    expiresAt: new Date(NOW.getTime() + 60 * 60_000),
    ...session,
  });
  prismaMock.booking.findUnique.mockResolvedValue(booking && {
    id: BOOKING_ID,
    userId: USER_ID,
    accessStatus: 'VERIFIED',
    startDate: day(-1),
    endDate: day(3),
    ...booking,
  });
}

describe('verifyGuestSessionAccess', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    arrange();
  });
  afterEach(() => vi.useRealTimers());

  it('grants the session when the database session and booking both belong to the same guest', async () => {
    await expect(verifyGuestSessionAccess(payload)).resolves.toBe(payload);

    expect(prismaMock.session.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { id: SESSION_ID } });
    expect(prismaMock.booking.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { id: BOOKING_ID } });
  });

  it.each([
    ['no payload', null],
    ['an undefined payload', undefined],
    ['a payload without a session id', { ...payload, sid: undefined }],
    ['a payload without a user', { ...payload, user: undefined }],
    ['a payload without a booking', { ...payload, booking: {} }],
  ] as const)('denies %s without reading the database', async (_label, session) => {
    await expect(verifyGuestSessionAccess(session)).resolves.toBeNull();

    expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.booking.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown to the database', null],
    ['revoked', { revokedAt: new Date(NOW.getTime() - 60_000) }],
    ['expired a moment ago', { expiresAt: new Date(NOW.getTime() - 1) }],
    ['expiring at this very instant', { expiresAt: NOW }],
    ["another user's", { userId: OTHER_ID }],
    ['bound to another booking', { bookingId: OTHER_ID }],
  ] as const)('denies a session that is %s', async (_label, session) => {
    arrange(session);

    await expect(verifyGuestSessionAccess(payload)).resolves.toBeNull();
  });

  it.each([
    ['unknown to the database', null],
    ['owned by another guest', { userId: OTHER_ID }],
    ['not owned by anyone', { userId: null }],
    ['not verified', { accessStatus: 'PENDING' }],
    ['a stay that ended yesterday', { startDate: day(-4), endDate: day(-1) }],
    ['a check-in more than 7 days away', { startDate: day(8), endDate: day(12) }],
  ] as const)('denies a booking that is %s', async (_label, booking) => {
    arrange({}, booking);

    await expect(verifyGuestSessionAccess(payload)).resolves.toBeNull();
  });

  it.each([
    ['a session that expires in a millisecond', { expiresAt: new Date(NOW.getTime() + 1) }, {}],
    ['the last day of the stay', {}, { startDate: day(-3), endDate: day(0) }],
    ['exactly 7 days before check-in', {}, { startDate: day(7), endDate: day(10) }],
  ] as const)('still grants %s', async (_label, session, booking) => {
    arrange(session, booking);

    await expect(verifyGuestSessionAccess(payload)).resolves.toBe(payload);
  });

  it.each(['session', 'booking'] as const)('rejects instead of granting when the %s lookup fails', async (table) => {
    const failure = new Error('connection terminated');
    prismaMock[table].findUnique.mockRejectedValue(failure);

    await expect(verifyGuestSessionAccess(payload)).rejects.toBe(failure);
  });
});
