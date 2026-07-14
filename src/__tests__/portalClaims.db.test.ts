import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

import { prisma } from '@/lib/prisma';
import {
  PortalAuthError,
  authenticatePortalUser,
  consumeBookingClaimGrant,
  issueBookingClaimGrant,
} from '@/lib/portalAuthService';
import { issueGuestSession } from '@/lib/guestSession';

const ids = {
  adminSession: crypto.randomUUID(),
  booking: crypto.randomUUID(),
  correlation: crypto.randomUUID(),
};
const phone = `+3069${String(Date.now()).slice(-8)}`;

describe('portal booking claims (database)', () => {
  beforeAll(async () => {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setUTCDate(startDate.getUTCDate() + 5);
    const endDate = new Date(now);
    endDate.setUTCDate(endDate.getUTCDate() + 12);

    await prisma.adminSession.create({
      data: {
        id: ids.adminSession,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
        absoluteExpiresAt: new Date(now.getTime() + 2 * 60 * 60_000),
      },
    });
    await prisma.booking.create({
      data: {
        id: ids.booking,
        source: 'EXTERNAL',
        reference: `CLAIM-${Date.now()}`,
        provider: 'test-provider',
        externalReference: ids.booking,
        startDate,
        endDate,
      },
    });
  });

  afterAll(async () => {
    const booking = await prisma.booking.findUnique({ where: { id: ids.booking }, select: { userId: true } });
    await prisma.securityAuditEvent.deleteMany({ where: { correlationId: ids.correlation } });
    await prisma.booking.deleteMany({ where: { id: ids.booking } });
    if (booking?.userId) await prisma.user.deleteMany({ where: { id: booking.userId } });
    await prisma.adminSession.deleteMany({ where: { id: ids.adminSession } });
  });

  it('stores only a digest, consumes once, claims atomically, and records terms', async () => {
    const grant = await issueBookingClaimGrant({
      bookingId: ids.booking,
      channel: 'REMOTE',
      adminSessionId: ids.adminSession,
      ttlMinutes: 10,
    });
    const storedBefore = await prisma.bookingClaimGrant.findFirstOrThrow({ where: { bookingId: ids.booking } });
    expect(storedBefore.tokenDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(storedBefore.tokenDigest).not.toContain(grant.token);

    const claimed = await consumeBookingClaimGrant({
      token: grant.token,
      phone,
      origin: 'GR',
      password: 'a-strong-test-password',
      correlationId: ids.correlation,
      ipHash: crypto.createHash('sha256').update('127.0.0.1').digest('hex'),
    });
    expect(claimed.bookingId).toBe(ids.booking);

    const [booking, consumedGrant, terms] = await Promise.all([
      prisma.booking.findUniqueOrThrow({ where: { id: ids.booking } }),
      prisma.bookingClaimGrant.findUniqueOrThrow({ where: { id: storedBefore.id } }),
      prisma.termsAcceptance.findFirst({ where: { bookingId: ids.booking, userId: claimed.userId } }),
    ]);
    expect(booking).toMatchObject({ userId: claimed.userId, accessStatus: 'VERIFIED' });
    expect(booking.claimedAt).toBeInstanceOf(Date);
    expect(consumedGrant.consumedAt).toBeInstanceOf(Date);
    expect(terms?.contentHash).toMatch(/^[0-9a-f]{64}$/);

    await expect(consumeBookingClaimGrant({
      token: grant.token,
      phone,
      origin: 'GR',
      password: 'a-strong-test-password',
    })).rejects.toMatchObject({ code: 'INVALID_CLAIM' } satisfies Partial<PortalAuthError>);

    await expect(authenticatePortalUser({ phone, password: 'a-strong-test-password' }))
      .resolves.toEqual({ userId: claimed.userId, bookingId: ids.booking });
  });

  it('withholds Wi-Fi credentials until 24 hours before the stay', async () => {
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: ids.booking } });
    if (!booking.userId) throw new Error('The claim setup did not link a user');
    const session = await issueGuestSession(booking.userId, booking.id);
    const request = () => new NextRequest('http://localhost/api/check-in/preferences', {
      headers: { cookie: `guest_session=${session}` },
    });
    process.env.GUEST_WIFI_NETWORK = 'IntegrationNetwork';
    process.env.GUEST_WIFI_PASSWORD = 'integration-password';
    const { GET } = await import('@/app/api/check-in/preferences/route');

    const earlyResponse = await GET(request(), { params: Promise.resolve({}) });
    expect((await earlyResponse.json()).data).toMatchObject({ wifi: null });

    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await prisma.booking.update({ where: { id: ids.booking }, data: { startDate: tomorrow } });
    const eligibleResponse = await GET(request(), { params: Promise.resolve({}) });
    expect((await eligibleResponse.json()).data.wifi).toEqual({
      network: 'IntegrationNetwork',
      password: 'integration-password',
    });
  });
});
