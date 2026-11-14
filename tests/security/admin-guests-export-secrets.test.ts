import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  transaction: vi.fn(),
  tx: {
    booking: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    checkInRequest: { findMany: vi.fn() },
    termsAcceptance: { findMany: vi.fn() },
    privacyRequest: { findMany: vi.fn() },
    session: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/guestDataStore', () => ({ guestStore: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));

import { GET } from '@/app/api/admin/guests/route';

const BOOKING_ID = '4c939e37-ef9f-4fb2-8231-319896c89080';
const USER_ID = '5d4a0f48-f0a0-4c93-9342-42a9a7a9a191';

// Values of the columns that hold secrets. A wider query would hand them over with the row.
const PLANTED = {
  loginHash: '$2b$12$planted-login-hash-marker',
  claimDigest: 'planted-claim-digest-marker',
  refreshHash: 'planted-refresh-hash-marker',
  deviceHash: 'planted-device-hash-marker',
  addressHash: 'planted-address-hash-marker',
  termsHash: 'planted-terms-hash-marker',
  subjectDigest: 'planted-subject-digest-marker',
};
const SECRET_NAME = /hash|token|secret|digest|password/i;

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => [key, ...keysOf(entry)]);
  }
  return [];
}

describe('admin guest export response', () => {
  beforeEach(() => {
    mocks.isAdminRequest.mockResolvedValue(true);
    mocks.transaction.mockImplementation(async (callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx));
    const booking = {
      id: BOOKING_ID,
      source: 'EXTERNAL',
      startDate: new Date('2030-07-14T00:00:00Z'),
      endDate: new Date('2030-07-18T00:00:00Z'),
      userId: USER_ID,
      provider: 'booking_com',
      externalReference: 'HM-SECRETS',
      accessStatus: 'VERIFIED',
      claimedAt: new Date('2030-07-10T08:00:00Z'),
      createdAt: new Date('2030-06-01T08:00:00Z'),
      updatedAt: new Date('2030-07-10T08:00:00Z'),
      tokenDigest: PLANTED.claimDigest,
    };
    mocks.tx.booking.findUnique.mockResolvedValue(booking);
    mocks.tx.booking.findMany.mockResolvedValue([booking]);
    mocks.tx.user.findUnique.mockResolvedValue({
      id: USER_ID,
      phoneE164: '+306912345678',
      createdAt: new Date('2030-07-01T10:00:00Z'),
      updatedAt: new Date('2030-07-02T10:00:00Z'),
      passwordHash: PLANTED.loginHash,
    });
    mocks.tx.checkInRequest.findMany.mockResolvedValue([{
      id: '79000000-0000-4000-8000-000000000001',
      bookingId: BOOKING_ID,
      userId: USER_ID,
      guestName: 'Maria Papadopoulou',
      guestEmail: 'maria@example.invalid',
      guestPhone: '+306912345678',
      requestedTime: '15:30',
      message: 'We land late.',
      status: 'PENDING',
      createdAt: new Date('2030-07-11T09:00:00Z'),
      updatedAt: new Date('2030-07-11T09:00:00Z'),
      ipHash: PLANTED.addressHash,
    }]);
    mocks.tx.termsAcceptance.findMany.mockResolvedValue([{
      bookingId: BOOKING_ID, termsVersion: '2030-01', acceptedAt: new Date('2030-07-10T08:00:00Z'), contentHash: PLANTED.termsHash,
    }]);
    mocks.tx.privacyRequest.findMany.mockResolvedValue([{
      id: '7a000000-0000-4000-8000-000000000001',
      bookingId: null,
      requestType: 'ERASURE',
      status: 'VERIFIED',
      requestedAt: new Date('2030-07-30T12:00:00Z'),
      completedAt: null,
      auditNote: 'Verified in person',
      subjectDigest: PLANTED.subjectDigest,
    }]);
    mocks.tx.session.findMany.mockResolvedValue([{
      bookingId: BOOKING_ID,
      createdAt: new Date('2030-07-14T12:00:00Z'),
      expiresAt: new Date('2030-07-14T14:00:00Z'),
      revokedAt: null,
      tokenHash: PLANTED.refreshHash,
      deviceHash: PLANTED.deviceHash,
    }]);
  });

  it('carries the arrival request and the other records of the guest, and no secret key or value', async () => {
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/admin/guests?action=export&bookingId=${BOOKING_ID}`),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const text = await response.text();
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'booking', 'bookings', 'checkInRequests', 'exportedAt', 'portalSessions', 'privacyRequests', 'termsAcceptances', 'user',
    ]);
    expect(body.checkInRequests).toEqual([expect.objectContaining({
      guestName: 'Maria Papadopoulou', guestEmail: 'maria@example.invalid', requestedTime: '15:30', message: 'We land late.', status: 'PENDING',
    })]);

    expect(keysOf(body).filter((key) => SECRET_NAME.test(key))).toEqual([]);
    for (const planted of Object.values(PLANTED)) expect(text).not.toContain(planted);
  });
});
