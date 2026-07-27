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
const CLAIM_URL = 'http://integration.invalid/api/portal/claims';
const FIXED_NOW = new Date('2030-06-15T12:34:56.789Z');
const CLAIM_TOKEN_PEPPER = 'pr02b-lifecycle-claim-pepper-only';
const SECURITY_PEPPER = 'pr02b-lifecycle-security-pepper-only';
const GUEST_JWT_SECRET = 'pr02b-lifecycle-jwt-secret-only';
const CLAIMANT_PHONE = '+12025550401';
const CLAIMANT_PASSWORD = 'pr02b-lifecycle-password-only';
const WRONG_PASSWORD = 'pr02b-wrong-password-only';
const OWNER_PHONE = '+12025550402';
const PRIMARY_BOOKING_ID = '24000000-0000-4000-8000-000000000001';
const OTHER_BOOKING_ID = '24000000-0000-4000-8000-000000000002';
const PRIMARY_GRANT_ID = '34000000-0000-4000-8000-000000000001';
const SIBLING_GRANT_ID = '34000000-0000-4000-8000-000000000002';
const EXISTING_USER_ID = '14000000-0000-4000-8000-000000000001';
const OWNER_USER_ID = '14000000-0000-4000-8000-000000000002';
const EXISTING_SESSION_ID = '44000000-0000-4000-8000-000000000001';
const PRIMARY_TOKEN = `claim_${'L'.repeat(43)}`;
const SIBLING_TOKEN = `claim_${'S'.repeat(43)}`;

const managedEnvironment = [
  'CLAIM_TOKEN_PEPPER',
  'DATABASE_URL',
  'GUEST_JWT_SECRET',
  'LOG_CONSOLE',
  'PRISMA_AUTO_DISCONNECT',
  'SECURITY_PEPPER',
] as const;

type ManagedEnvironmentName = typeof managedEnvironment[number];

interface ClaimHttpEvidence {
  status: number;
  success: boolean;
  errorCode: string | null;
  sessionCookie: boolean;
  refreshCookie: boolean;
  refreshCookieCleared: boolean;
}

interface ClaimGraph {
  users: Array<{
    id: string;
    phoneE164: string;
    passwordHash: string | null;
    countryOrigin: 'GR' | 'ABROAD';
  }>;
  bookings: Array<{
    id: string;
    userId: string | null;
    accessStatus: 'PENDING' | 'VERIFIED';
    claimed: boolean;
  }>;
  grants: Array<{
    id: string;
    consumed: boolean;
    revoked: boolean;
  }>;
  terms: Array<{ bookingId: string; userId: string }>;
  audits: Array<{ eventType: string; bookingId: string | null }>;
  sessions: Array<{
    id: string;
    userId: string;
    bookingId: string;
    revoked: boolean;
  }>;
  families: Array<{ id: string; userId: string; revoked: boolean }>;
  tokens: Array<{
    id: string;
    userId: string;
    familyId: string;
    revoked: boolean;
  }>;
}

interface SeedOptions {
  existingClaimant?: boolean;
  ownerId?: string;
  includeClaimantBookingAndSession?: boolean;
}

let target: DisposableDatabaseTarget | undefined;
let applicationPrisma: PrismaClient | undefined;
const originalEnvironment = new Map<ManagedEnvironmentName, string | undefined>();

function tokenDigest(token: string): string {
  return createHmac('sha256', CLAIM_TOKEN_PEPPER).update(token, 'utf8').digest('hex');
}

function utcDateOffset(now: Date, days: number): Date {
  const date = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  date.setUTCDate(date.getUTCDate() + days);
  return date;
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

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Claim lifecycle database was not initialized.');
  return target;
}

async function seedClaimLifecycle(options: SeedOptions = {}): Promise<{
  claimantPasswordHash?: string;
  claimantSessionToken?: string;
}> {
  const now = new Date();
  const claimantPasswordHash = options.existingClaimant
    ? await bcrypt.hash(CLAIMANT_PASSWORD, 4)
    : undefined;
  const ownerPasswordHash = options.ownerId
    ? await bcrypt.hash('pr02b-owner-password-only', 4)
    : undefined;

  await withTestPrismaClient(requireTarget(), async (prisma) => {
    if (options.ownerId && ownerPasswordHash) {
      await prisma.user.create({
        data: {
          id: options.ownerId,
          phoneE164: OWNER_PHONE,
          passwordHash: ownerPasswordHash,
          countryOrigin: 'ABROAD',
        },
      });
    }
    if (claimantPasswordHash) {
      await prisma.user.create({
        data: {
          id: EXISTING_USER_ID,
          phoneE164: CLAIMANT_PHONE,
          passwordHash: claimantPasswordHash,
          countryOrigin: 'ABROAD',
        },
      });
    }

    await prisma.booking.create({
      data: {
        id: PRIMARY_BOOKING_ID,
        source: 'EXTERNAL',
        startDate: utcDateOffset(now, -1),
        endDate: utcDateOffset(now, 7),
        userId: options.ownerId ?? null,
        provider: 'integration-claim-lifecycle',
        externalReference: 'claim-lifecycle-primary',
        accessStatus: options.ownerId ? 'VERIFIED' : 'PENDING',
        claimedAt: options.ownerId ? now : null,
      },
    });
    await prisma.bookingClaimGrant.createMany({
      data: [
        {
          id: PRIMARY_GRANT_ID,
          bookingId: PRIMARY_BOOKING_ID,
          tokenDigest: tokenDigest(PRIMARY_TOKEN),
          channel: 'REMOTE',
          expiresAt: new Date(now.getTime() + 30 * 60_000),
        },
        {
          id: SIBLING_GRANT_ID,
          bookingId: PRIMARY_BOOKING_ID,
          tokenDigest: tokenDigest(SIBLING_TOKEN),
          channel: 'ONSITE',
          expiresAt: new Date(now.getTime() + 30 * 60_000),
        },
      ],
    });

    if (options.includeClaimantBookingAndSession) {
      if (!claimantPasswordHash) {
        throw new Error('Cross-booking fixture requires an existing claimant.');
      }
      await prisma.booking.create({
        data: {
          id: OTHER_BOOKING_ID,
          source: 'EXTERNAL',
          startDate: utcDateOffset(now, -1),
          endDate: utcDateOffset(now, 7),
          userId: EXISTING_USER_ID,
          provider: 'integration-claim-lifecycle',
          externalReference: 'claim-lifecycle-other',
          accessStatus: 'VERIFIED',
          claimedAt: now,
        },
      });
      await prisma.session.create({
        data: {
          id: EXISTING_SESSION_ID,
          userId: EXISTING_USER_ID,
          bookingId: OTHER_BOOKING_ID,
          expiresAt: new Date(now.getTime() + 2 * 60 * 60_000),
        },
      });
    }
  }, 'seed');

  if (!options.includeClaimantBookingAndSession) return { claimantPasswordHash };
  const { createGuestSessionToken } = await import('@/lib/guestSession');
  return {
    claimantPasswordHash,
    claimantSessionToken: createGuestSessionToken({
      id: EXISTING_SESSION_ID,
      userId: EXISTING_USER_ID,
      bookingId: OTHER_BOOKING_ID,
      expiresAt: new Date(now.getTime() + 2 * 60 * 60_000),
    }),
  };
}

async function resetClaimLifecycle(): Promise<void> {
  await withTestPrismaClient(requireTarget(), async (prisma) => {
    await prisma.$transaction([
      prisma.refreshToken.deleteMany(),
      prisma.refreshTokenFamily.deleteMany(),
      prisma.session.deleteMany(),
      prisma.termsAcceptance.deleteMany(),
      prisma.bookingClaimGrant.deleteMany(),
      prisma.booking.deleteMany(),
      prisma.user.deleteMany(),
      prisma.securityAuditEvent.deleteMany(),
      prisma.rateLimit.deleteMany(),
    ]);
  }, 'cleanup');
}

async function readClaimGraph(): Promise<ClaimGraph> {
  return withTestPrismaClient(requireTarget(), async (prisma) => {
    const [users, bookings, grants, terms, audits, sessions, families, tokens] =
      await Promise.all([
        prisma.user.findMany({
          select: {
            id: true,
            phoneE164: true,
            passwordHash: true,
            countryOrigin: true,
          },
          orderBy: { id: 'asc' },
        }),
        prisma.booking.findMany({
          select: { id: true, userId: true, accessStatus: true, claimedAt: true },
          orderBy: { id: 'asc' },
        }),
        prisma.bookingClaimGrant.findMany({
          select: { id: true, consumedAt: true, revokedAt: true },
          orderBy: { id: 'asc' },
        }),
        prisma.termsAcceptance.findMany({
          select: { bookingId: true, userId: true },
          orderBy: { id: 'asc' },
        }),
        prisma.securityAuditEvent.findMany({
          where: { eventType: 'portal.booking_claimed' },
          select: { eventType: true, details: true },
          orderBy: { occurredAt: 'asc' },
        }),
        prisma.session.findMany({
          select: { id: true, userId: true, bookingId: true, revokedAt: true },
          orderBy: { id: 'asc' },
        }),
        prisma.refreshTokenFamily.findMany({
          select: { id: true, userId: true, revokedAt: true },
          orderBy: { id: 'asc' },
        }),
        prisma.refreshToken.findMany({
          select: { id: true, userId: true, familyId: true, revokedAt: true },
          orderBy: { id: 'asc' },
        }),
      ]);

    return {
      users,
      bookings: bookings.map((booking) => ({
        id: booking.id,
        userId: booking.userId,
        accessStatus: booking.accessStatus,
        claimed: Boolean(booking.claimedAt),
      })),
      grants: grants.map((grant) => ({
        id: grant.id,
        consumed: Boolean(grant.consumedAt),
        revoked: Boolean(grant.revokedAt),
      })),
      terms,
      audits: audits.map((audit) => ({
        eventType: audit.eventType,
        bookingId: typeof audit.details === 'object'
          && audit.details !== null
          && 'bookingId' in audit.details
          && typeof audit.details.bookingId === 'string'
          ? audit.details.bookingId
          : null,
      })),
      sessions: sessions.map((session) => ({
        id: session.id,
        userId: session.userId,
        bookingId: session.bookingId,
        revoked: Boolean(session.revokedAt),
      })),
      families: families.map((family) => ({
        id: family.id,
        userId: family.userId,
        revoked: Boolean(family.revokedAt),
      })),
      tokens: tokens.map((token) => ({
        id: token.id,
        userId: token.userId,
        familyId: token.familyId,
        revoked: Boolean(token.revokedAt),
      })),
    };
  });
}

async function performClaim(input: {
  token?: string;
  phone?: string;
  password?: string;
  remember: boolean;
  sessionCookie?: string;
}): Promise<{
  http: ClaimHttpEvidence;
  body: string;
  credentials: { sessionToken: string; refreshToken: string } | null;
}> {
  const [{ NextRequest }, exchangeRoute, claimRoute] = await Promise.all([
    import('next/server'),
    import('@/app/api/portal/claim-exchange/route'),
    import('@/app/api/portal/claims/route'),
  ]);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'pr02b-claim-lifecycle-client',
    'x-origin-verified-client-ip': '198.51.100.81',
    'x-origin-proxy-attestation': process.env.ORIGIN_PROXY_SHARED_SECRET ?? '',
  };
  if (input.sessionCookie) headers.cookie = `guest_session=${input.sessionCookie}`;
  const exchangeRequest = new NextRequest(
    'http://integration.invalid/api/portal/claim-exchange',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ claimToken: input.token ?? PRIMARY_TOKEN }),
    },
  );
  const exchangeResponse = await exchangeRoute.POST(
    exchangeRequest,
    { params: Promise.resolve({}) },
  );
  if (!exchangeResponse.ok) {
    const body = await exchangeResponse.text();
    const parsed = JSON.parse(body) as { success?: boolean; error?: { code?: string } };
    return {
      body,
      credentials: null,
      http: {
        status: exchangeResponse.status,
        success: parsed.success === true,
        errorCode: parsed.error?.code ?? null,
        sessionCookie: false,
        refreshCookie: false,
        refreshCookieCleared: false,
      },
    };
  }
  const exchangeCookie = exchangeResponse.cookies.get('booking_claim_exchange')?.value;
  if (!exchangeCookie) throw new Error('Claim exchange did not issue its short-lived cookie');
  headers.cookie = [
    `booking_claim_exchange=${exchangeCookie}`,
    input.sessionCookie ? `guest_session=${input.sessionCookie}` : '',
  ].filter(Boolean).join('; ');
  const request = new NextRequest(CLAIM_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      origin: 'ABROAD',
      phone: input.phone ?? CLAIMANT_PHONE,
      password: input.password ?? CLAIMANT_PASSWORD,
      remember: input.remember,
      acceptTerms: true,
    }),
  });
  const response = await claimRoute.POST(request, { params: Promise.resolve({}) });
  const body = await response.text();
  const parsed = JSON.parse(body) as { success?: boolean; error?: { code?: string } };
  const sessionCookie = response.cookies.get('guest_session');
  const refreshCookie = response.cookies.get('guest_rt');
  return {
    body,
    credentials: sessionCookie?.value && refreshCookie?.value
      ? { sessionToken: sessionCookie.value, refreshToken: refreshCookie.value }
      : null,
    http: {
      status: response.status,
      success: parsed.success === true,
      errorCode: parsed.error?.code ?? null,
      sessionCookie: Boolean(sessionCookie?.value),
      refreshCookie: Boolean(refreshCookie?.value),
      refreshCookieCleared: refreshCookie?.value === '' && refreshCookie.maxAge === 0,
    },
  };
}

async function performRefresh(credentials: {
  sessionToken: string;
  refreshToken: string;
}): Promise<{
  status: number;
  body: string;
  sessionToken: string | null;
  refreshToken: string | null;
}> {
  const [{ NextRequest }, refreshRoute] = await Promise.all([
    import('next/server'),
    import('@/app/api/portal/refresh/route'),
  ]);
  const request = new NextRequest('http://integration.invalid/api/portal/refresh', {
    method: 'POST',
    headers: {
      cookie: `guest_session=${credentials.sessionToken}; guest_rt=${credentials.refreshToken}`,
      'user-agent': 'pr02b-claim-lifecycle-client',
      'x-origin-verified-client-ip': '198.51.100.81',
      'x-origin-proxy-attestation': process.env.ORIGIN_PROXY_SHARED_SECRET ?? '',
    },
  });
  const response = await refreshRoute.POST(request, { params: Promise.resolve({}) });
  return {
    status: response.status,
    body: await response.text(),
    sessionToken: response.cookies.get('guest_session')?.value ?? null,
    refreshToken: response.cookies.get('guest_rt')?.value ?? null,
  };
}

function expectSafeBody(body: string, targetDatabase: DisposableDatabaseTarget): void {
  expect(body).not.toContain(PRIMARY_TOKEN);
  expect(body).not.toContain(SIBLING_TOKEN);
  expect(body).not.toContain(CLAIMANT_PHONE);
  expect(body).not.toContain(CLAIMANT_PASSWORD);
  expect(body).not.toContain(WRONG_PASSWORD);
  expect(body).not.toContain(targetDatabase.databaseUrl);
}

function expectSuccessfulGraph(
  graph: ClaimGraph,
  remember: boolean,
  expectedUserId?: string,
): void {
  expect(graph.users).toHaveLength(1);
  const user = graph.users[0];
  expect(user.id).toBe(expectedUserId ?? user.id);
  expect(user.phoneE164).toBe(CLAIMANT_PHONE);
  expect(user.passwordHash).toBeTruthy();
  expect(user.countryOrigin).toBe('ABROAD');
  expect(graph.bookings).toEqual([{
    id: PRIMARY_BOOKING_ID,
    userId: user.id,
    accessStatus: 'VERIFIED',
    claimed: true,
  }]);
  expect(graph.grants).toEqual([
    { id: PRIMARY_GRANT_ID, consumed: true, revoked: false },
    { id: SIBLING_GRANT_ID, consumed: false, revoked: true },
  ]);
  expect(graph.terms).toEqual([{ bookingId: PRIMARY_BOOKING_ID, userId: user.id }]);
  expect(graph.audits).toEqual([{
    eventType: 'portal.booking_claimed',
    bookingId: PRIMARY_BOOKING_ID,
  }]);
  expect(graph.sessions).toHaveLength(1);
  expect(graph.sessions[0]).toMatchObject({
    userId: user.id,
    bookingId: PRIMARY_BOOKING_ID,
    revoked: false,
  });
  if (!remember) {
    expect(graph.families).toEqual([]);
    expect(graph.tokens).toEqual([]);
    return;
  }
  expect(graph.families).toHaveLength(1);
  expect(graph.families[0]).toMatchObject({ userId: user.id, revoked: false });
  expect(graph.tokens).toEqual([{
    id: graph.sessions[0].id,
    userId: user.id,
    familyId: graph.families[0].id,
    revoked: false,
  }]);
}

describe.sequential('booking claim lifecycle characterization', () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
    target = await createIsolatedDatabase(runtime, 'claim_lifecycle');
    await applyMigrationsFromEmpty(target);
    setApplicationEnvironment(target.databaseUrl);
    applicationPrisma = (await import('@/lib/prisma')).prisma;
  });

  afterEach(async () => {
    if (target) await resetClaimLifecycle();
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

  it.each([false, true])(
    'A1 creates one new-user authorization graph with remember=%s and denies its sibling',
    async (remember) => {
      const claimTarget = requireTarget();
      await seedClaimLifecycle();

      const success = await performClaim({ remember });
      expectSafeBody(success.body, claimTarget);
      expect(success.http).toEqual({
        status: 200,
        success: true,
        errorCode: null,
        sessionCookie: true,
        refreshCookie: remember,
        refreshCookieCleared: !remember,
      });
      const afterSuccess = await readClaimGraph();
      expectSuccessfulGraph(afterSuccess, remember);

      const sibling = await performClaim({ token: SIBLING_TOKEN, remember });
      expectSafeBody(sibling.body, claimTarget);
      expect(sibling.http).toEqual({
        status: 401,
        success: false,
        errorCode: 'UNAUTHORIZED',
        sessionCookie: false,
        refreshCookie: false,
        refreshCookieCleared: false,
      });
      expect(await readClaimGraph()).toEqual(afterSuccess);
    },
  );

  it('B1 rotates a real remember-enabled claim into exactly one paired descendant', async () => {
    const claimTarget = requireTarget();
    await seedClaimLifecycle();
    const claim = await performClaim({ remember: true });
    if (!claim.credentials) throw new Error('Remember-enabled claim did not issue both credentials.');

    const [{ parseGuestSession }, { guestStore }] = await Promise.all([
      import('@/lib/guestSession'),
      import('@/lib/guestDataStore'),
    ]);
    const predecessorSession = parseGuestSession(claim.credentials.sessionToken);
    const predecessorId = claim.credentials.refreshToken.split('.', 1)[0];
    expect(predecessorSession?.sid).toBe(predecessorId);

    const refresh = await performRefresh(claim.credentials);
    expect(refresh.status).toBe(200);
    expect(refresh.sessionToken).toBeTruthy();
    expect(refresh.refreshToken).toBeTruthy();
    expect(refresh.body).not.toContain(PRIMARY_TOKEN);
    expect(refresh.body).not.toContain(claim.credentials.sessionToken);
    expect(refresh.body).not.toContain(claim.credentials.refreshToken);
    expect(refresh.body).not.toContain(claimTarget.databaseUrl);
    if (!refresh.sessionToken || !refresh.refreshToken) {
      throw new Error('Successful refresh did not issue a complete replacement pair.');
    }

    const replacementSession = parseGuestSession(refresh.sessionToken);
    const replacementId = refresh.refreshToken.split('.', 1)[0];
    expect(replacementSession?.sid).toBe(replacementId);
    const graph = await withTestPrismaClient(claimTarget, async (prisma) => {
      const [booking, sessions, family, tokens] = await Promise.all([
        prisma.booking.findUniqueOrThrow({ where: { id: PRIMARY_BOOKING_ID } }),
        prisma.session.findMany({ orderBy: { createdAt: 'asc' } }),
        prisma.refreshTokenFamily.findFirstOrThrow(),
        prisma.refreshToken.findMany({ orderBy: { createdAt: 'asc' } }),
      ]);
      return { booking, sessions, family, tokens };
    });
    const predecessorToken = graph.tokens.find((token) => token.id === predecessorId);
    const descendantToken = graph.tokens.find((token) => token.id === replacementId);
    const predecessorSessionRow = graph.sessions.find((session) => session.id === predecessorId);
    const replacementSessionRow = graph.sessions.find((session) => session.id === replacementId);
    expect({
      familyActive: !graph.family.revokedAt,
      tokenCount: graph.tokens.length,
      sessionCount: graph.sessions.length,
      predecessorTokenRevoked: Boolean(predecessorToken?.revokedAt),
      predecessorSessionRevoked: Boolean(predecessorSessionRow?.revokedAt),
      descendantActive: Boolean(descendantToken && !descendantToken.revokedAt),
      replacementSessionActive: Boolean(replacementSessionRow && !replacementSessionRow.revokedAt),
      descendantFromPredecessor: descendantToken?.rotatedFromId === predecessorId,
      descendantPaired: descendantToken?.id === replacementSessionRow?.id,
      userBinding: descendantToken?.userId === graph.booking.userId
        && replacementSessionRow?.userId === graph.booking.userId
        && graph.family.userId === graph.booking.userId,
      bookingBinding: replacementSessionRow?.bookingId === PRIMARY_BOOKING_ID,
      familyBinding: descendantToken?.familyId === graph.family.id,
    }).toEqual({
      familyActive: true,
      tokenCount: 2,
      sessionCount: 2,
      predecessorTokenRevoked: true,
      predecessorSessionRevoked: true,
      descendantActive: true,
      replacementSessionActive: true,
      descendantFromPredecessor: true,
      descendantPaired: true,
      userBinding: true,
      bookingBinding: true,
      familyBinding: true,
    });
    await expect(guestStore.verifyRefreshToken(claim.credentials.refreshToken)).resolves
      .toBeUndefined();
    await expect(guestStore.verifyRefreshToken(refresh.refreshToken)).resolves
      .toMatchObject({ id: replacementId, family_id: graph.family.id });
  });

  it.each([false, true])(
    'A4 reuses the existing user with unchanged password and remember=%s',
    async (remember) => {
      const claimTarget = requireTarget();
      const { claimantPasswordHash } = await seedClaimLifecycle({ existingClaimant: true });
      const result = await performClaim({ remember });
      expectSafeBody(result.body, claimTarget);
      expect(result.http).toEqual({
        status: 200,
        success: true,
        errorCode: null,
        sessionCookie: true,
        refreshCookie: remember,
        refreshCookieCleared: !remember,
      });
      const graph = await readClaimGraph();
      expectSuccessfulGraph(graph, remember, EXISTING_USER_ID);
      expect(graph.users[0].passwordHash).toBe(claimantPasswordHash);
    },
  );

  it('A5 rejects a wrong existing-user password without domain side effects', async () => {
    const claimTarget = requireTarget();
    const { claimantPasswordHash } = await seedClaimLifecycle({ existingClaimant: true });
    const before = await readClaimGraph();
    const result = await performClaim({ password: WRONG_PASSWORD, remember: true });
    expectSafeBody(result.body, claimTarget);
    expect(result.http).toEqual({
      status: 401,
      success: false,
      errorCode: 'UNAUTHORIZED',
      sessionCookie: false,
      refreshCookie: false,
      refreshCookieCleared: false,
    });
    const after = await readClaimGraph();
    expect(after).toEqual(before);
    expect(after.users[0].passwordHash).toBe(claimantPasswordHash);
  });

  it('A6 denies a new identity from claiming a booking owned by another user', async () => {
    const claimTarget = requireTarget();
    await seedClaimLifecycle({ ownerId: OWNER_USER_ID });
    const before = await readClaimGraph();
    const result = await performClaim({ remember: true });
    expectSafeBody(result.body, claimTarget);
    expect(result.http).toEqual({
      status: 409,
      success: false,
      errorCode: 'CONFLICT',
      sessionCookie: false,
      refreshCookie: false,
      refreshCookieCleared: false,
    });
    expect(await readClaimGraph()).toEqual(before);
  });

  it('A6 denies an existing user with another booking/session from an owned booking', async () => {
    const claimTarget = requireTarget();
    const { claimantSessionToken } = await seedClaimLifecycle({
      existingClaimant: true,
      ownerId: OWNER_USER_ID,
      includeClaimantBookingAndSession: true,
    });
    const before = await readClaimGraph();
    const result = await performClaim({
      remember: true,
      sessionCookie: claimantSessionToken,
    });
    expectSafeBody(result.body, claimTarget);
    expect(result.http).toEqual({
      status: 409,
      success: false,
      errorCode: 'CONFLICT',
      sessionCookie: false,
      refreshCookie: false,
      refreshCookieCleared: false,
    });
    expect(await readClaimGraph()).toEqual(before);
  });
});
