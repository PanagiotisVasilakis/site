import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyAdminSession: vi.fn(),
  resetGuestAccess: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({ verifyAdminSession: mocks.verifyAdminSession }));
vi.mock('@/lib/portalAuthService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/portalAuthService')>()),
  resetGuestAccess: mocks.resetGuestAccess,
}));

import { POST } from '@/app/api/admin/bookings/[id]/access-reset/route';
import { PortalAuthError } from '@/lib/portalAuthService';

const BOOKING_ID = '1826a63a-4b2f-405c-820a-4f5abf23c6cb';
const ADMIN_SESSION_ID = '0f8d6a55-2f5e-4c43-9a5e-1d6d0f3f9b11';
const TOKEN = `claim_${'R'.repeat(43)}`;
const SAME_ORIGIN = { origin: 'http://localhost:3000', host: 'localhost:3000' };

function reset(options: { id?: string; body?: unknown; headers?: Record<string, string>; cookie?: string | null } = {}) {
  const id = options.id ?? BOOKING_ID;
  const headers: Record<string, string> = { 'content-type': 'application/json', ...SAME_ORIGIN, ...options.headers };
  if (options.cookie !== null) headers.cookie = options.cookie ?? 'admin_jwt=signed';
  const request = new NextRequest(`http://0.0.0.0:3000/api/admin/bookings/${id}/access-reset`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options.body ?? { confirm: true }),
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

describe('admin guest access reset route', () => {
  beforeEach(() => {
    mocks.verifyAdminSession.mockResolvedValue({ session_id: ADMIN_SESSION_ID });
    mocks.resetGuestAccess.mockResolvedValue({ token: TOKEN, expiresAt: new Date('2030-01-01T00:30:00.000Z') });
  });

  it('returns the one-time token with no-store and no-referrer', async () => {
    const response = await reset({ body: { confirm: true, ttlMinutes: 60 } });

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await response.json()).toMatchObject({
      success: true,
      data: { claimToken: TOKEN, expiresAt: '2030-01-01T00:30:00.000Z', channel: 'REMOTE' },
    });
    expect(mocks.resetGuestAccess).toHaveBeenCalledWith({ bookingId: BOOKING_ID, ttlMinutes: 60, adminSessionId: ADMIN_SESSION_ID });
  });

  it.each([
    ['BOOKING_NOT_CLAIMED', 'use Issue claim'],
    ['BOOKING_NOT_IN_ACCESS_WINDOW', '7 days before check-in until the check-out date (UTC calendar dates)'],
  ] as const)('answers 409 with guidance for %s', async (code, guidance) => {
    mocks.resetGuestAccess.mockRejectedValue(new PortalAuthError(code));

    const response = await reset();

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain(guidance);
  });

  it('answers 404 for an unknown booking', async () => {
    mocks.resetGuestAccess.mockRejectedValue(new PortalAuthError('INVALID_CLAIM'));

    expect((await reset()).status).toBe(404);
  });

  it.each([
    ['no admin cookie', 401, { cookie: null }],
    ['an invalid admin session', 401, { cookie: 'admin_jwt=forged' }],
    ['a foreign origin', 403, { headers: { origin: 'https://evil.example' } }],
  ])('rejects %s with %i', async (label, status, options) => {
    if (label === 'an invalid admin session') mocks.verifyAdminSession.mockResolvedValue(null);

    const response = await reset(options);

    expect(response.status).toBe(status);
    expect(mocks.resetGuestAccess).not.toHaveBeenCalled();
  });

  it.each([
    ['no confirmation', {}],
    ['confirm other than true', { confirm: 'yes' }],
    ['an unknown field', { confirm: true, userId: 'x' }],
    ['a TTL above one day', { confirm: true, ttlMinutes: 1441 }],
  ])('rejects %s with 422', async (_label, body) => {
    const response = await reset({ body });

    expect(response.status).toBe(422);
    expect(mocks.resetGuestAccess).not.toHaveBeenCalled();
  });

  it('answers 404 for a booking id that is not a UUID without reaching the service', async () => {
    const response = await reset({ id: 'not-a-uuid' });

    expect(response.status).toBe(404);
    expect(mocks.resetGuestAccess).not.toHaveBeenCalled();
  });
});
