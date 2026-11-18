import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  getAllBookings: vi.fn(),
  getBookingDetails: vi.fn(),
  searchBookingsByDateRange: vi.fn(),
  eraseGuestByAdmin: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/guestDataExport', () => ({
  guestDataExport: {
    getAllBookings: mocks.getAllBookings,
    getBookingDetails: mocks.getBookingDetails,
    searchBookingsByDateRange: mocks.searchBookingsByDateRange,
  },
}));
vi.mock('@/lib/privacyService', () => ({ eraseGuestByAdmin: mocks.eraseGuestByAdmin }));
vi.mock('@/lib/logger-enterprise', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/logger-enterprise')>();
  return {
    ...actual,
    logger: {
      ...actual.logger,
      error: mocks.loggerError,
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      getContext: actual.logger.getContext.bind(actual.logger),
      setContext: actual.logger.setContext.bind(actual.logger),
    },
  };
});

import { GET } from '@/app/api/admin/guests/route';
import { POST as erasePost } from '@/app/api/admin/guests/[userId]/erase/route';

const UUID = '4c939e37-ef9f-4fb2-8231-319896c89080';

function getGuests(query: string): Promise<Response> {
  return GET(
    new NextRequest(`http://localhost:3000/api/admin/guests?${query}`),
    { params: Promise.resolve({}) },
  );
}

function eraseGuest(body: unknown, options: { userId?: string; origin?: string } = {}): Promise<Response> {
  return erasePost(new NextRequest(`http://0.0.0.0:3000/api/admin/guests/${options.userId ?? UUID}/erase`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'localhost:3000',
      origin: options.origin ?? 'http://localhost:3000',
    },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ userId: options.userId ?? UUID }) });
}

describe('GET /api/admin/guests', () => {
  beforeEach(() => {
    mocks.isAdminRequest.mockResolvedValue(true);
    mocks.getBookingDetails.mockResolvedValue({ id: UUID });
    mocks.searchBookingsByDateRange.mockResolvedValue([]);
  });

  it('exports a booking for a valid UUID and rejects malformed or unknown ids with 404', async () => {
    const malformed = await getGuests('action=export&bookingId=not-a-uuid');
    expect(malformed.status).toBe(404);
    expect(mocks.getBookingDetails).not.toHaveBeenCalled();

    const exported = await getGuests(`action=export&bookingId=${UUID}`);
    expect(exported.status).toBe(200);
    expect(mocks.getBookingDetails).toHaveBeenCalledWith(UUID);
    expect(exported.headers.get('content-disposition')).toContain(`booking_${UUID}_`);
    expect(exported.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(exported.headers.get('cache-control')).toBe('no-store');

    mocks.getBookingDetails.mockResolvedValueOnce(null);
    expect((await getGuests(`action=export&bookingId=${UUID}`)).status).toBe(404);
  });

  it.each([
    ['an unknown action', 'action=delete'],
    ['a missing action', ''],
    ['an export without bookingId', 'action=export'],
  ])('answers 422 for %s', async (_label, query) => {
    const response = await getGuests(query);

    expect(response.status).toBe(422);
    expect(mocks.getBookingDetails).not.toHaveBeenCalled();
  });

  it('validates search dates and forwards valid startDate queries', async () => {
    const invalid = await getGuests('action=search&startDate=2026-10-5');
    expect(invalid.status).toBe(422);
    expect(mocks.searchBookingsByDateRange).not.toHaveBeenCalled();

    const valid = await getGuests('action=search&startDate=2026-10-05');
    expect(valid.status).toBe(200);
    expect(mocks.searchBookingsByDateRange).toHaveBeenLastCalledWith('2026-10-05');
  });

  it.each(['action=list', `action=export&bookingId=${UUID}`])(
    'answers 401 to a non-admin (%s) without reading guest data',
    async (query) => {
      mocks.isAdminRequest.mockResolvedValue(false);
      // Resolved value ensures a missing auth gate fails as 200 rather than a TypeError.
      mocks.getAllBookings.mockResolvedValue([]);

      const response = await getGuests(query);

      expect(response.status).toBe(401);
      expect(mocks.isAdminRequest).toHaveBeenCalledOnce();
      expect(mocks.getAllBookings).not.toHaveBeenCalled();
      expect(mocks.getBookingDetails).not.toHaveBeenCalled();
    },
  );

  it('logs unexpected failures at error level without echoing internal messages', async () => {
    mocks.getAllBookings.mockRejectedValue(new Error('relation "bookings" does not exist'));

    const response = await GET(
      new NextRequest('https://guest-guide.test/api/admin/guests?action=list'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('does not exist');
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Unexpected API error',
      expect.any(Object),
      expect.objectContaining({ message: 'relation "bookings" does not exist' }),
    );
  });
});

describe('POST /api/admin/guests/[userId]/erase', () => {
  beforeEach(() => {
    mocks.isAdminRequest.mockResolvedValue(true);
    mocks.eraseGuestByAdmin.mockResolvedValue({
      id: 'request-1',
      status: 'COMPLETED',
      completedAt: new Date('2030-01-01T00:00:00.000Z'),
    });
  });

  it('erases the guest with the audit note', async () => {
    const response = await eraseGuest({ confirm: true, auditNote: 'Guest asked by email on 2030-01-01' });

    expect(response.status).toBe(200);
    expect(mocks.eraseGuestByAdmin).toHaveBeenCalledWith(UUID, 'Guest asked by email on 2030-01-01');
    expect((await response.json()).data).toMatchObject({ requestId: 'request-1', status: 'COMPLETED' });
  });

  it('rejects non-admins, cross-origin calls, unknown ids and unconfirmed requests before erasing', async () => {
    mocks.isAdminRequest.mockResolvedValueOnce(false);
    expect((await eraseGuest({ confirm: true, auditNote: 'reason' })).status).toBe(401);
    expect((await eraseGuest({ confirm: true, auditNote: 'reason' }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await eraseGuest({ confirm: true, auditNote: 'reason' }, { userId: 'not-a-uuid' })).status).toBe(404);
    expect((await eraseGuest({ auditNote: 'reason' })).status).toBe(422);
    expect((await eraseGuest({ confirm: true, auditNote: 'x' })).status).toBe(422);
    expect(mocks.eraseGuestByAdmin).not.toHaveBeenCalled();
  });

  it.each([
    ['ERASURE_BLOCKED_BY_ACTIVE_DELIVERY', 409],
    ['ERASURE_SUBJECT_NOT_FOUND', 404],
    ['ERASURE_REQUEST_NOT_VERIFIED', 409],
  ])('maps %s to %i', async (code, status) => {
    mocks.eraseGuestByAdmin.mockRejectedValue(new Error(code));

    expect((await eraseGuest({ confirm: true, auditNote: 'reason' })).status).toBe(status);
  });
});
