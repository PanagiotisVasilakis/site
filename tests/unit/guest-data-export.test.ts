import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Booking } from '@/lib/guestDataStore';

const guestStore = vi.hoisted(() => ({
  getAllBookings: vi.fn(),
  getAllUsers: vi.fn(),
  findBookingById: vi.fn(),
  findUserById: vi.fn(),
}));

// The client of the snapshot transaction behind the complete per-guest export.
const tx = vi.hoisted(() => ({
  booking: { findUnique: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  checkInRequest: { findMany: vi.fn() },
  termsAcceptance: { findMany: vi.fn() },
  privacyRequest: { findMany: vi.fn() },
  session: { findMany: vi.fn() },
}));
const transaction = vi.hoisted(() => vi.fn());

vi.mock('@/lib/guestDataStore', () => ({ guestStore }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: transaction } }));

import { guestDataExport } from '@/lib/guestDataExport';

// PostgreSQL DATE columns arrive from Prisma as UTC-midnight Dates.
function booking(id: string, start: string, end: string): Booking {
  return {
    id,
    source: 'EXTERNAL',
    startDate: new Date(`${start}T00:00:00Z`),
    endDate: new Date(`${end}T00:00:00Z`),
    userId: null,
    provider: 'test',
    externalReference: null,
    accessStatus: 'PENDING',
    claimedAt: null,
    createdAt: new Date(0),
  };
}

const bookings = [
  booking('starts-on-day', '2030-07-14', '2030-07-16'),
  booking('ends-on-day', '2030-07-10', '2030-07-14'),
  booking('spans-day', '2030-07-12', '2030-07-18'),
  booking('starts-on-range-end', '2030-07-20', '2030-07-22'),
  booking('outside', '2030-08-01', '2030-08-03'),
];

beforeEach(() => {
  guestStore.getAllBookings.mockResolvedValue(bookings);
  guestStore.getAllUsers.mockResolvedValue([]);
  guestStore.findBookingById.mockImplementation(async (id: string) => bookings.find((b) => b.id === id) ?? null);
  guestStore.findUserById.mockResolvedValue(null);
});

describe('guest data export date handling', () => {
  it('matches bookings that start, end or span a searched date', async () => {
    const result = await guestDataExport.searchBookingsByDateRange('2030-07-14');
    expect(result.map((entry) => entry.booking.id).sort()).toEqual(['ends-on-day', 'spans-day', 'starts-on-day']);
  });

  it('includes bookings starting on the last day of a searched range', async () => {
    const result = await guestDataExport.searchBookingsByDateRange('2030-07-14', '2030-07-20');
    expect(result.map((entry) => entry.booking.id).sort()).toEqual(['starts-on-day', 'starts-on-range-end']);
  });

  it('joins users from their list without per-booking lookups', async () => {
    guestStore.getAllBookings.mockResolvedValue([
      { ...booking('with-guest', '2030-07-14', '2030-07-16'), userId: 'user-1' },
      booking('without-guest', '2030-07-20', '2030-07-22'),
    ]);
    guestStore.getAllUsers.mockResolvedValue([
      { id: 'user-1', phoneE164: '+12025550100', createdAt: new Date(0), updatedAt: new Date(0) },
    ]);

    const result = await guestDataExport.getAllBookings();

    expect(result.map((entry) => [entry.booking.id, entry.user?.phone])).toEqual([
      ['with-guest', '+12025550100'],
      ['without-guest', undefined],
    ]);
    expect(guestStore.findBookingById).not.toHaveBeenCalled();
    expect(guestStore.findUserById).not.toHaveBeenCalled();
    expect(Object.keys(result[0].user ?? {}).sort()).toEqual(['createdAt', 'id', 'phone', 'updatedAt']);
  });
});

// Every key of a nested value, at any depth.
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => [key, ...keysOf(entry)]);
  }
  return [];
}

// What the export must never carry: password hashes, claim-token digests, refresh-token hashes,
// terms or subject digests and hashed network identifiers all match one of these words.
const SECRET_NAME = /hash|token|secret|digest|password/i;

describe('complete per-guest export', () => {
  const USER_ID = '77000000-0000-4000-8000-000000000001';
  const FIRST_STAY = '78000000-0000-4000-8000-000000000001';
  const SECOND_STAY = '78000000-0000-4000-8000-000000000002';
  const NOW = new Date('2030-08-01T09:30:00.000Z');

  // Values of the columns that a wider select would deliver. The mocked database returns them with
  // every row to show that the export copies named columns only.
  const PLANTED = {
    loginHash: '$2b$12$planted-login-hash-marker',
    claimDigest: 'planted-claim-digest-marker',
    refreshHash: 'planted-refresh-hash-marker',
    deviceHash: 'planted-device-hash-marker',
    addressHash: 'planted-address-hash-marker',
    termsHash: 'planted-terms-hash-marker',
    subjectDigest: 'planted-subject-digest-marker',
  };

  const userRow = {
    id: USER_ID,
    phoneE164: '+306912345678',
    createdAt: new Date('2030-07-01T10:00:00Z'),
    updatedAt: new Date('2030-07-02T10:00:00Z'),
    passwordHash: PLANTED.loginHash,
  };
  const firstStayRow = {
    id: FIRST_STAY,
    source: 'EXTERNAL',
    startDate: new Date('2030-07-14T00:00:00Z'),
    endDate: new Date('2030-07-18T00:00:00Z'),
    userId: USER_ID,
    provider: 'booking_com',
    externalReference: 'HM-FIRST',
    accessStatus: 'VERIFIED',
    claimedAt: new Date('2030-07-10T08:00:00Z'),
    createdAt: new Date('2030-06-01T08:00:00Z'),
    updatedAt: new Date('2030-07-10T08:00:00Z'),
    tokenDigest: PLANTED.claimDigest,
  };
  const secondStayRow = {
    ...firstStayRow,
    id: SECOND_STAY,
    source: 'ONSITE',
    startDate: new Date('2030-09-01T00:00:00Z'),
    endDate: new Date('2030-09-03T00:00:00Z'),
    provider: 'manual',
    externalReference: null,
    claimedAt: null,
    accessStatus: 'PENDING',
    createdAt: new Date('2030-07-20T08:00:00Z'),
    updatedAt: new Date('2030-07-20T08:00:00Z'),
  };
  const arrivalRow = {
    id: '79000000-0000-4000-8000-000000000001',
    bookingId: FIRST_STAY,
    userId: USER_ID,
    guestName: 'Maria Papadopoulou',
    guestEmail: 'maria@example.invalid',
    guestPhone: '+306912345678',
    requestedTime: '15:30',
    message: 'We land late, please leave the lockbox code at the door.',
    status: 'APPROVED',
    createdAt: new Date('2030-07-11T09:00:00Z'),
    updatedAt: new Date('2030-07-12T09:00:00Z'),
    ipHash: PLANTED.addressHash,
  };
  const termsRow = {
    bookingId: FIRST_STAY,
    termsVersion: '2030-01',
    acceptedAt: new Date('2030-07-10T08:00:00Z'),
    contentHash: PLANTED.termsHash,
  };
  const privacyRow = {
    id: '7a000000-0000-4000-8000-000000000001',
    bookingId: null,
    requestType: 'ERASURE',
    status: 'VERIFIED',
    requestedAt: new Date('2030-07-30T12:00:00Z'),
    completedAt: null,
    auditNote: 'Verified in person',
    subjectDigest: PLANTED.subjectDigest,
  };
  const sessionRow = {
    id: '7b000000-0000-4000-8000-000000000001',
    bookingId: FIRST_STAY,
    createdAt: new Date('2030-07-14T12:00:00Z'),
    expiresAt: new Date('2030-07-14T14:00:00Z'),
    revokedAt: null,
    tokenHash: PLANTED.refreshHash,
    deviceHash: PLANTED.deviceHash,
  };

  const exportedFirstStay = {
    id: FIRST_STAY,
    source: 'EXTERNAL',
    startDate: '2030-07-14T00:00:00.000Z',
    endDate: '2030-07-18T00:00:00.000Z',
    provider: 'booking_com',
    externalReference: 'HM-FIRST',
    accessStatus: 'VERIFIED',
    claimedAt: '2030-07-10T08:00:00.000Z',
    createdAt: '2030-06-01T08:00:00.000Z',
    updatedAt: '2030-07-10T08:00:00.000Z',
  };
  const exportedSecondStay = {
    id: SECOND_STAY,
    source: 'ONSITE',
    startDate: '2030-09-01T00:00:00.000Z',
    endDate: '2030-09-03T00:00:00.000Z',
    provider: 'manual',
    externalReference: null,
    accessStatus: 'PENDING',
    claimedAt: null,
    createdAt: '2030-07-20T08:00:00.000Z',
    updatedAt: '2030-07-20T08:00:00.000Z',
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    tx.booking.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (
      [firstStayRow, secondStayRow].find((row) => row.id === where.id) ?? null
    ));
    tx.booking.findMany.mockResolvedValue([firstStayRow, secondStayRow]);
    tx.user.findUnique.mockResolvedValue(userRow);
    tx.checkInRequest.findMany.mockResolvedValue([arrivalRow]);
    tx.termsAcceptance.findMany.mockResolvedValue([termsRow]);
    tx.privacyRequest.findMany.mockResolvedValue([privacyRow]);
    tx.session.findMany.mockResolvedValue([sessionRow]);
  });

  afterEach(() => vi.useRealTimers());

  it('returns the account, every booking, every arrival request and the records kept about them', async () => {
    const result = await guestDataExport.getCompleteGuestExport(SECOND_STAY);

    expect(result).toEqual({
      exportedAt: '2030-08-01T09:30:00.000Z',
      booking: exportedSecondStay,
      user: {
        id: USER_ID,
        phone: '+306912345678',
        createdAt: '2030-07-01T10:00:00.000Z',
        updatedAt: '2030-07-02T10:00:00.000Z',
      },
      bookings: [exportedFirstStay, exportedSecondStay],
      checkInRequests: [{
        id: arrivalRow.id,
        bookingId: FIRST_STAY,
        userId: USER_ID,
        guestName: 'Maria Papadopoulou',
        guestEmail: 'maria@example.invalid',
        guestPhone: '+306912345678',
        requestedTime: '15:30',
        message: 'We land late, please leave the lockbox code at the door.',
        status: 'APPROVED',
        createdAt: '2030-07-11T09:00:00.000Z',
        updatedAt: '2030-07-12T09:00:00.000Z',
      }],
      termsAcceptances: [{ bookingId: FIRST_STAY, termsVersion: '2030-01', acceptedAt: '2030-07-10T08:00:00.000Z' }],
      privacyRequests: [{
        id: privacyRow.id,
        bookingId: null,
        requestType: 'ERASURE',
        status: 'VERIFIED',
        requestedAt: '2030-07-30T12:00:00.000Z',
        completedAt: null,
        auditNote: 'Verified in person',
      }],
      portalSessions: [{
        bookingId: FIRST_STAY,
        createdAt: '2030-07-14T12:00:00.000Z',
        expiresAt: '2030-07-14T14:00:00.000Z',
        revokedAt: null,
      }],
    });
  });

  it('keeps the booking and user keys of the former single-booking export', async () => {
    const result = await guestDataExport.getCompleteGuestExport(FIRST_STAY);

    expect(result?.booking).toEqual(exportedFirstStay);
    expect(Object.keys(result?.user ?? {}).sort()).toEqual(['createdAt', 'id', 'phone', 'updatedAt']);
  });

  it('reads one snapshot and reaches the account\'s requests and every request on its bookings', async () => {
    await guestDataExport.getCompleteGuestExport(SECOND_STAY);

    expect(transaction).toHaveBeenCalledOnce();
    expect(transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'RepeatableRead' });
    expect(tx.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER_ID } }));
    expect(tx.checkInRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ userId: USER_ID }, { bookingId: { in: [FIRST_STAY, SECOND_STAY] } }] },
    }));
    for (const model of [tx.termsAcceptance, tx.privacyRequest, tx.session]) {
      expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER_ID } }));
    }
  });

  it('exports an unclaimed booking with the requests attached to it and nothing else', async () => {
    tx.booking.findUnique.mockResolvedValue({ ...firstStayRow, userId: null, accessStatus: 'PENDING', claimedAt: null });
    tx.checkInRequest.findMany.mockResolvedValue([
      { ...arrivalRow, userId: null, guestName: null, guestEmail: null, guestPhone: null, message: null },
    ]);

    const result = await guestDataExport.getCompleteGuestExport(FIRST_STAY);

    expect(result?.user).toBeNull();
    expect(result?.bookings.map((entry) => entry.id)).toEqual([FIRST_STAY]);
    expect(result?.checkInRequests).toEqual([expect.objectContaining({
      bookingId: FIRST_STAY, userId: null, guestName: null, guestEmail: null, guestPhone: null, message: null, requestedTime: '15:30',
    })]);
    expect(result).toMatchObject({ termsAcceptances: [], privacyRequests: [], portalSessions: [] });
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(tx.booking.findMany).not.toHaveBeenCalled();
    expect(tx.checkInRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ bookingId: { in: [FIRST_STAY] } }] },
    }));
    for (const model of [tx.termsAcceptance, tx.privacyRequest, tx.session]) {
      expect(model.findMany).not.toHaveBeenCalled();
    }
  });

  it('answers null for an unknown booking without reading anything else', async () => {
    tx.booking.findUnique.mockResolvedValue(null);

    expect(await guestDataExport.getCompleteGuestExport(FIRST_STAY)).toBeNull();
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(tx.checkInRequest.findMany).not.toHaveBeenCalled();
  });

  it('selects no secret column and returns no secret key or value', async () => {
    const result = await guestDataExport.getCompleteGuestExport(SECOND_STAY);

    const selects = [
      tx.booking.findUnique, tx.booking.findMany, tx.user.findUnique, tx.checkInRequest.findMany,
      tx.termsAcceptance.findMany, tx.privacyRequest.findMany, tx.session.findMany,
    ].map((query) => {
      expect(query).toHaveBeenCalledOnce();
      return (query.mock.calls[0][0] as { select: Record<string, boolean> }).select;
    });
    expect(selects.flatMap(keysOf).filter((key) => SECRET_NAME.test(key))).toEqual([]);

    expect(keysOf(result).filter((key) => SECRET_NAME.test(key))).toEqual([]);
    const text = JSON.stringify(result);
    for (const planted of Object.values(PLANTED)) expect(text).not.toContain(planted);
    // The session id is also the first half of a refresh token.
    expect(text).not.toContain(sessionRow.id);
  });

  // A model that points at a guest or a booking holds data about a guest. A new one fails here until
  // the export includes it or this list records why it stays out.
  it('accounts for every model that points at a user or a booking', () => {
    const exported = ['Booking', 'CheckInRequest', 'PrivacyRequest', 'Session', 'TermsAcceptance'];
    const leftOut = ['BookingClaimGrant', 'RefreshToken', 'RefreshTokenFamily'];
    const schema = readFileSync('prisma/schema.prisma', 'utf8');

    const pointingAtGuest = [...schema.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gmu)]
      .filter(([, , body]) => /^\s+\w+\s+(?:User|Booking)\??\s/mu.test(body))
      .map(([, name]) => name)
      .sort();

    expect(pointingAtGuest).toEqual([...exported, ...leftOut].sort());
  });
});
