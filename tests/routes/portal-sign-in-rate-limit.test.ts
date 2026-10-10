import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkSensitiveRateLimit: vi.fn(),
  refundSensitiveIdentifierAttempt: vi.fn(),
  authenticatePortalUser: vi.fn(),
  attachPortalAuthCookies: vi.fn(),
}));

vi.mock('@/lib/featureFlags', () => ({ getFeatureFlagsAsync: async () => ({ portalEnabled: true }) }));
vi.mock('@/lib/sensitiveRateLimit', () => ({
  checkSensitiveRateLimit: mocks.checkSensitiveRateLimit,
  refundSensitiveIdentifierAttempt: mocks.refundSensitiveIdentifierAttempt,
}));
vi.mock('@/lib/portalAuthService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/portalAuthService')>()),
  authenticatePortalUser: mocks.authenticatePortalUser,
}));
vi.mock('@/lib/portalAuthHttp', () => ({ attachPortalAuthCookies: mocks.attachPortalAuthCookies }));

import { POST } from '@/app/api/portal/sessions/route';
import { PortalAuthError } from '@/lib/portalAuthService';
import { logger } from '@/lib/logger-enterprise';

const PHONE = '+30 691 234 5678';

function signIn(body: Record<string, unknown> = { phone: PHONE, password: 'correct horse battery' }) {
  return POST(new NextRequest('http://localhost:3000/api/portal/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({}) });
}

describe('portal sign-in rate limit', () => {
  beforeEach(() => {
    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true, limit: 5, remaining: 4, resetAt: new Date() });
    mocks.refundSensitiveIdentifierAttempt.mockResolvedValue(undefined);
    mocks.attachPortalAuthCookies.mockResolvedValue(undefined);
  });

  it('gives the phone number its attempt back after a successful sign-in', async () => {
    mocks.authenticatePortalUser.mockResolvedValue({ userId: 'user-1', bookingId: 'booking-1' });

    const response = await signIn();

    expect(response.status).toBe(200);
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ scope: 'portal-session', identifier: PHONE }));
    expect(mocks.refundSensitiveIdentifierAttempt).toHaveBeenCalledExactlyOnceWith({ scope: 'portal-session', identifier: PHONE });
  });

  it('keeps counting a failed sign-in', async () => {
    mocks.authenticatePortalUser.mockRejectedValue(new PortalAuthError('INVALID_CREDENTIALS'));

    const response = await signIn();

    expect(response.status).toBe(401);
    expect(mocks.refundSensitiveIdentifierAttempt).not.toHaveBeenCalled();
  });

  it('still signs the guest in when the refund cannot be written', async () => {
    mocks.authenticatePortalUser.mockResolvedValue({ userId: 'user-1', bookingId: 'booking-1' });
    mocks.refundSensitiveIdentifierAttempt.mockRejectedValue(new Error('database unavailable'));
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const response = await signIn();

    expect(response.status).toBe(200);
    expect(warn).toHaveBeenCalledWith('portal_session.rate_limit_refund_failed', { error: 'Error' });
  });

  it('answers 422 for an unknown body key before the rate limit or the credential check', async () => {
    const response = await signIn({ phone: PHONE, password: 'correct horse battery', rememberMe: true });

    expect(response.status).toBe(422);
    expect((await response.json()).error.details.validationErrors).toEqual([expect.objectContaining({ code: 'unrecognized_keys' })]);
    expect(mocks.checkSensitiveRateLimit).not.toHaveBeenCalled();
    expect(mocks.authenticatePortalUser).not.toHaveBeenCalled();
    expect(mocks.attachPortalAuthCookies).not.toHaveBeenCalled();
  });
});
