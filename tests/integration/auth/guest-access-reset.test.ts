import { createHmac } from 'node:crypto';

import bcrypt from 'bcrypt';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';

import type { DisposableDatabaseTarget } from '../support/database-safety';
import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
} from '../support/database-lifecycle';
import { withTestPrismaClient } from '../support/fixtures';
import { applyMigrationsFromEmpty } from '../support/migrations';
import { readDisposablePostgresRuntime } from '../support/runtime';

const runtime = readDisposablePostgresRuntime();
const FIXED_NOW = new Date('2030-06-15T12:34:56.789Z');
const CLAIM_TOKEN_PEPPER = 'b2-access-reset-claim-pepper-only';
const SECURITY_PEPPER = 'b2-access-reset-security-pepper-only';
const GUEST_JWT_SECRET = 'b2-access-reset-jwt-secret-only';
const OWNER_PHONE = '+12025550501';
const OTHER_PHONE = '+12025550502';
const OLD_PASSWORD = 'b2-old-password-only';
const NEW_PASSWORD = 'b2-new-password-only';
const TAKEOVER_PASSWORD = 'b2-takeover-password-only';
const OWNER_ID = '15000000-0000-4000-8000-000000000001';
const OWNED_BOOKING_ID = '25000000-0000-4000-8000-000000000001';
const UNCLAIMED_BOOKING_ID = '25000000-0000-4000-8000-000000000002';
const UNCLAIMED_GRANT_ID = '35000000-0000-4000-8000-000000000001';
const ADMIN_SESSION_ID = '45000000-0000-4000-8000-000000000001';
const GUEST_SESSION_ID = '55000000-0000-4000-8000-000000000001';
const REFRESH_TOKEN_ID = '65000000-0000-4000-8000-000000000001';
const REFRESH_FAMILY_ID = 'b2-access-reset-family';
const UNCLAIMED_TOKEN = `claim_${'U'.repeat(43)}`;

const managedEnvironment = [
  'CLAIM_TOKEN_PEPPER',
  'DATABASE_URL',
  'GUEST_JWT_SECRET',
  'LOG_CONSOLE',
  'PRISMA_AUTO_DISCONNECT',
  'SECURITY_PEPPER',
] as const;

type ManagedEnvironmentName = typeof managedEnvironment[number];

let target: DisposableDatabaseTarget | undefined;
let applicationPrisma: PrismaClient | undefined;
const originalEnvironment = new Map<ManagedEnvironmentName, string | undefined>();

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Access reset database was not initialized.');
  return target;
}

function tokenDigest(token: string): string {
  return createHmac('sha256', CLAIM_TOKEN_PEPPER).update(token, 'utf8').digest('hex');
}

function utcDateOffset(now: Date, days: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
}

function setApplicationEnvironment(databaseUrl: string): void {
  for (const name of managedEnvironment) originalEnvironment.set(name, process.env[name]);
  process.env.CLAIM_TOKEN_PEPPER = CLAIM_TOKEN_PEPPER;
  process.env.DATABASE_URL = databaseUrl;
  process.env.GUEST_JWT_SECRET = GUEST_JWT_SECRET;
  process.env.LOG_CONSOLE = 'false';
  process.env.PRISMA_AUTO_DISCONNECT = 'false';
  process.env.SECURITY_PEPPER = SECURITY_PEPPER;
}

function restoreApplicationEnvironment(): void {
  for (const name of managedEnvironment) {
    const value = originalEnvironment.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

// A guest who claimed OWNED_BOOKING with OLD_PASSWORD and holds one session and
// one refresh family; an unrelated, unclaimed booking with an open grant.
async function seed(): Promise<void> {
  const now = new Date();
  const ownerHash = await bcrypt.hash(OLD_PASSWORD, 4);
  await withTestPrismaClient(requireTarget(), async (prisma) => {
    await prisma.adminSession.create({
      data: {
        id: ADMIN_SESSION_ID,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
        absoluteExpiresAt: new Date(now.getTime() + 8 * 60 * 60_000),
      },
    });
    await prisma.user.create({
      data: { id: OWNER_ID, phoneE164: OWNER_PHONE, passwordHash: ownerHash, countryOrigin: 'ABROAD' },
    });
    await prisma.booking.createMany({
      data: [
        {
          id: OWNED_BOOKING_ID,
          source: 'EXTERNAL',
          startDate: utcDateOffset(now, -1),
          endDate: utcDateOffset(now, 7),
          userId: OWNER_ID,
          provider: 'integration-access-reset',
          externalReference: 'access-reset-owned',
          accessStatus: 'VERIFIED',
          claimedAt: now,
        },
        {
          id: UNCLAIMED_BOOKING_ID,
          source: 'EXTERNAL',
          startDate: utcDateOffset(now, -1),
          endDate: utcDateOffset(now, 7),
          provider: 'integration-access-reset',
          externalReference: 'access-reset-unclaimed',
          accessStatus: 'PENDING',
        },
      ],
    });
    await prisma.bookingClaimGrant.create({
      data: {
        id: UNCLAIMED_GRANT_ID,
        bookingId: UNCLAIMED_BOOKING_ID,
        tokenDigest: tokenDigest(UNCLAIMED_TOKEN),
        channel: 'REMOTE',
        expiresAt: new Date(now.getTime() + 30 * 60_000),
      },
    });
    await prisma.session.create({
      data: {
        id: GUEST_SESSION_ID,
        userId: OWNER_ID,
        bookingId: OWNED_BOOKING_ID,
        expiresAt: new Date(now.getTime() + 2 * 60 * 60_000),
      },
    });
    await prisma.refreshTokenFamily.create({
      data: {
        id: REFRESH_FAMILY_ID,
        userId: OWNER_ID,
        absoluteExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
      },
    });
    await prisma.refreshToken.create({
      data: {
        id: REFRESH_TOKEN_ID,
        userId: OWNER_ID,
        tokenHash: 'b2-access-reset-token-hash',
        salt: 'b2-access-reset-salt',
        familyId: REFRESH_FAMILY_ID,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
      },
    });
  }, 'seed');
}

async function cleanup(): Promise<void> {
  await withTestPrismaClient(requireTarget(), async (prisma) => {
    await prisma.$transaction([
      prisma.refreshToken.deleteMany(),
      prisma.refreshTokenFamily.deleteMany(),
      prisma.session.deleteMany(),
      prisma.termsAcceptance.deleteMany(),
      prisma.bookingClaimGrant.deleteMany(),
      prisma.booking.deleteMany(),
      prisma.user.deleteMany(),
      prisma.adminSession.deleteMany(),
      prisma.securityAuditEvent.deleteMany(),
      prisma.rateLimit.deleteMany(),
    ]);
  }, 'cleanup');
}

async function readState() {
  return withTestPrismaClient(requireTarget(), async (prisma) => {
    const [users, bookings, grants, session, family, token, audits] = await Promise.all([
      prisma.user.findMany({ select: { id: true, phoneE164: true, passwordHash: true }, orderBy: { id: 'asc' } }),
      prisma.booking.findMany({ select: { id: true, userId: true, accessStatus: true }, orderBy: { id: 'asc' } }),
      prisma.bookingClaimGrant.findMany({
        select: { bookingId: true, consumedAt: true, revokedAt: true, issuedByAdminSessionId: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.session.findUniqueOrThrow({ where: { id: GUEST_SESSION_ID }, select: { revokedAt: true } }),
      prisma.refreshTokenFamily.findUniqueOrThrow({
        where: { id: REFRESH_FAMILY_ID },
        select: { revokedAt: true, revocationReason: true },
      }),
      prisma.refreshToken.findUniqueOrThrow({ where: { id: REFRESH_TOKEN_ID }, select: { revokedAt: true } }),
      prisma.securityAuditEvent.findMany({ select: { eventType: true, severity: true, details: true } }),
    ]);
    return { users, bookings, grants, session, family, token, audits };
  });
}

// Exchange + claim through the real route handlers, as the portal does.
async function claimThroughRoutes(input: { token: string; phone: string; password: string }): Promise<{
  status: number;
  errorCode: string | null;
  sessionCookie: boolean;
}> {
  const [{ NextRequest }, exchangeRoute, claimRoute] = await Promise.all([
    import('next/server'),
    import('@/app/api/portal/claim-exchange/route'),
    import('@/app/api/portal/claims/route'),
  ]);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'b2-access-reset-client',
    'x-origin-verified-client-ip': '198.51.100.91',
    'x-origin-proxy-attestation': process.env.ORIGIN_PROXY_SHARED_SECRET ?? '',
  };
  const exchange = await exchangeRoute.POST(
    new NextRequest('http://integration.invalid/api/portal/claim-exchange', {
      method: 'POST',
      headers,
      body: JSON.stringify({ claimToken: input.token }),
    }),
    { params: Promise.resolve({}) },
  );
  const exchangeCookie = exchange.cookies.get('booking_claim_exchange')?.value;
  if (!exchange.ok || !exchangeCookie) throw new Error(`Claim exchange failed with ${exchange.status}`);
  const response = await claimRoute.POST(
    new NextRequest('http://integration.invalid/api/portal/claims', {
      method: 'POST',
      headers: { ...headers, cookie: `booking_claim_exchange=${exchangeCookie}` },
      body: JSON.stringify({
        origin: 'ABROAD',
        phone: input.phone,
        password: input.password,
        remember: false,
        acceptTerms: true,
      }),
    }),
    { params: Promise.resolve({}) },
  );
  const parsed = await response.json() as { error?: { code?: string } };
  return {
    status: response.status,
    errorCode: parsed.error?.code ?? null,
    sessionCookie: Boolean(response.cookies.get('guest_session')?.value),
  };
}

describe.sequential('host access reset of a claimed booking', () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
    target = await createIsolatedDatabase(runtime, 'access_reset');
    await applyMigrationsFromEmpty(target);
    setApplicationEnvironment(target.databaseUrl);
    applicationPrisma = (await import('@/lib/prisma')).prisma;
  });

  afterEach(async () => {
    if (target) await cleanup();
  });

  afterAll(async () => {
    try {
      await applicationPrisma?.$disconnect();
      applicationPrisma = undefined;
    } finally {
      restoreApplicationEnvironment();
      if (target) await dropIsolatedDatabase(target);
      target = undefined;
      vi.useRealTimers();
    }
  });

  it('revokes the old credentials and lets the same phone set a new password with the reset token', async () => {
    await seed();
    const { authenticatePortalUser, resetGuestAccess } = await import('@/lib/portalAuthService');
    await expect(authenticatePortalUser({ phone: OWNER_PHONE, password: OLD_PASSWORD }))
      .resolves.toEqual({ userId: OWNER_ID, bookingId: OWNED_BOOKING_ID });

    const grant = await resetGuestAccess({ bookingId: OWNED_BOOKING_ID, adminSessionId: ADMIN_SESSION_ID });

    const afterReset = await readState();
    expect(afterReset.users).toEqual([{ id: OWNER_ID, phoneE164: OWNER_PHONE, passwordHash: null }]);
    expect(afterReset.session.revokedAt).not.toBeNull();
    expect(afterReset.family).toEqual({ revokedAt: expect.any(Date), revocationReason: 'admin_access_reset' });
    expect(afterReset.token.revokedAt).not.toBeNull();
    expect(afterReset.grants).toContainEqual({
      bookingId: OWNED_BOOKING_ID,
      consumedAt: null,
      revokedAt: null,
      issuedByAdminSessionId: ADMIN_SESSION_ID,
    });
    expect(afterReset.audits).toEqual([
      { eventType: 'portal.access_reset', severity: 'medium', details: { bookingId: OWNED_BOOKING_ID } },
    ]);
    await expect(authenticatePortalUser({ phone: OWNER_PHONE, password: OLD_PASSWORD }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    const claim = await claimThroughRoutes({ token: grant.token, phone: OWNER_PHONE, password: NEW_PASSWORD });

    expect(claim).toEqual({ status: 200, errorCode: null, sessionCookie: true });
    await expect(authenticatePortalUser({ phone: OWNER_PHONE, password: NEW_PASSWORD }))
      .resolves.toEqual({ userId: OWNER_ID, bookingId: OWNED_BOOKING_ID });
    await expect(authenticatePortalUser({ phone: OWNER_PHONE, password: OLD_PASSWORD }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const afterClaim = await readState();
    expect(afterClaim.bookings).toContainEqual({ id: OWNED_BOOKING_ID, userId: OWNER_ID, accessStatus: 'VERIFIED' });
    expect(afterClaim.users).toHaveLength(1);
  });

  it('refuses a claim token of another booking for the reset account and leaves everything unchanged', async () => {
    await seed();
    const { authenticatePortalUser, resetGuestAccess } = await import('@/lib/portalAuthService');
    await resetGuestAccess({ bookingId: OWNED_BOOKING_ID, adminSessionId: ADMIN_SESSION_ID });
    const before = await readState();

    const takeover = await claimThroughRoutes({ token: UNCLAIMED_TOKEN, phone: OWNER_PHONE, password: TAKEOVER_PASSWORD });

    expect(takeover).toEqual({ status: 401, errorCode: 'UNAUTHORIZED', sessionCookie: false });
    const after = await readState();
    expect(after.users).toEqual(before.users);
    expect(after.bookings).toEqual(before.bookings);
    expect(after.grants).toEqual(before.grants);
    await expect(authenticatePortalUser({ phone: OWNER_PHONE, password: TAKEOVER_PASSWORD }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('refuses the reset token for a different phone without creating an account', async () => {
    await seed();
    const { resetGuestAccess } = await import('@/lib/portalAuthService');
    const grant = await resetGuestAccess({ bookingId: OWNED_BOOKING_ID, adminSessionId: ADMIN_SESSION_ID });
    const before = await readState();

    const claim = await claimThroughRoutes({ token: grant.token, phone: OTHER_PHONE, password: TAKEOVER_PASSWORD });

    expect(claim).toEqual({ status: 409, errorCode: 'CONFLICT', sessionCookie: false });
    const after = await readState();
    expect(after.users).toEqual(before.users);
    expect(after.bookings).toEqual(before.bookings);
    expect(after.grants).toEqual(before.grants);
  });
});
