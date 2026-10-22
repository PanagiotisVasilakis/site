import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real feature-flag reader and the real routes: only persistence and the collaborators behind
// the flag check are replaced.
const mocks = vi.hoisted(() => ({
  settingFind: vi.fn(),
  bookingFind: vi.fn(),
  isAdminRequest: vi.fn(),
  verifyGuestSessionAccess: vi.fn(),
  rotateRefreshToken: vi.fn(),
  checkSensitiveRateLimit: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { operationalSetting: { findUnique: mocks.settingFind }, booking: { findUnique: mocks.bookingFind } },
}));
vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/guestSession', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/guestSession')>()),
  parseGuestSession: () => ({ sessionId: 'session' }),
  verifyGuestSessionAccess: mocks.verifyGuestSessionAccess,
}));
vi.mock('@/lib/guestDataStore', () => ({ guestStore: { rotateRefreshToken: mocks.rotateRefreshToken } }));
vi.mock('@/lib/portalAuthHttp', () => ({
  requestAuthContext: () => ({ deviceHint: 'device-hint', ipHint: 'ip-hint', ipHash: 'ip-hash' }),
}));
vi.mock('@/lib/sensitiveRateLimit', () => ({ checkSensitiveRateLimit: mocks.checkSensitiveRateLimit }));

import { POST as refreshPortalSession } from '@/app/api/portal/refresh/route';
import { GET as getCheckInPreferences } from '@/app/api/check-in/preferences/route';

const context = { params: Promise.resolve({}) };

function refresh() {
  return refreshPortalSession(new NextRequest('http://localhost:3000/api/portal/refresh', {
    method: 'POST',
    headers: { cookie: 'guest_rt=family-id.presented-secret' },
  }), context);
}

function preferences() {
  return getCheckInPreferences(new NextRequest('http://localhost:3000/api/check-in/preferences', {
    headers: { cookie: 'guest_session=signed' },
  }), context);
}

describe('routes that depend on a feature flag while the flags cannot be read', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.isAdminRequest.mockResolvedValue(false);
    mocks.verifyGuestSessionAccess.mockResolvedValue({ booking: { id: 'booking' }, user: { id: 'user' } });
    mocks.bookingFind.mockResolvedValue({
      startDate: new Date('2030-06-01T00:00:00.000Z'),
      endDate: new Date('2030-06-05T00:00:00.000Z'),
    });
    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true, limit: 60, remaining: 59, resetAt: new Date() });
  });

  it('answers 503, not the 404 of a switched-off portal, and rotates nothing', async () => {
    mocks.settingFind.mockRejectedValue(new Error('Connection terminated due to connection timeout'));

    const response = await refresh();

    expect(response.status).toBe(503);
    expect(response.headers.get('x-error-code')).toBe('SERVICE_UNAVAILABLE');
    expect(response.headers.get('retry-after')).toBe('5');
    expect(await response.json()).toMatchObject({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable', details: { retryAfterSeconds: 5 } },
    });
    expect(mocks.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('answers 503 for the check-in preferences too, and reads nothing else', async () => {
    mocks.settingFind.mockRejectedValue(new Error('Query read timeout'));

    const response = await preferences();

    expect(response.status).toBe(503);
    expect(response.headers.get('x-error-code')).toBe('SERVICE_UNAVAILABLE');
    expect(mocks.settingFind).toHaveBeenCalledTimes(1);
    expect(mocks.settingFind).toHaveBeenCalledWith({ where: { key: 'feature_flags' } });
    expect(mocks.verifyGuestSessionAccess).not.toHaveBeenCalled();
  });

  it('keeps the 404 for a portal that is really switched off', async () => {
    mocks.settingFind.mockResolvedValue({ value: { portalEnabled: false, checkinEnabled: true } });

    const response = await refresh();

    expect(response.status).toBe(404);
    expect(response.headers.get('retry-after')).toBeNull();
    expect(mocks.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('keeps the 404 for check-in that is switched off while the portal is on', async () => {
    mocks.settingFind.mockResolvedValue({ value: { portalEnabled: true, checkinEnabled: false } });

    const response = await preferences();

    expect(response.status).toBe(404);
  });

  it('serves the route when the flag is on', async () => {
    mocks.settingFind.mockImplementation(async ({ where }: { where: { key: string } }) => (
      where.key === 'feature_flags' ? { value: { portalEnabled: true, checkinEnabled: true } } : null
    ));

    const response = await preferences();

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ checkInTime: '15:00', checkOutTime: '11:00' });
  });
});
