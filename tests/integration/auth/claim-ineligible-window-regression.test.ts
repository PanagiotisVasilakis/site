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
const BOOKING_ID = '23000000-0000-4000-8000-000000000001';
const GRANT_ID = '33000000-0000-4000-8000-000000000001';
const CLAIM_TOKEN = `claim_${'A'.repeat(43)}`;
const CLAIM_TOKEN_PEPPER = 'pr02b-ineligible-claim-pepper-only';
const SECURITY_PEPPER = 'pr02b-ineligible-security-pepper-only';
const GUEST_JWT_SECRET = 'pr02b-ineligible-jwt-secret-only';
const SYNTHETIC_PHONE = '+12025550123';
const SYNTHETIC_PASSWORD = 'pr02b-synthetic-password-only';
const EXISTING_USER_ID = '13000000-0000-4000-8000-000000000001';
const FIXED_NOW = new Date('2030-06-15T12:34:56.789Z');

const managedEnvironment = [
  'CLAIM_TOKEN_PEPPER',
  'DATABASE_URL',
  'GUEST_JWT_SECRET',
  'LOG_CONSOLE',
  'PRISMA_AUTO_DISCONNECT',
  'SECURITY_PEPPER',
] as const;

type ManagedEnvironmentName = typeof managedEnvironment[number];

interface SafeClaimState {
  users: number;
  existingUser: null | {
    present: boolean;
    passwordUnchanged: boolean;
    originUnchanged: boolean;
  };
  booking: {
    ownerPresent: boolean;
    accessStatus: 'PENDING' | 'VERIFIED';
    claimed: boolean;
  };
  grant: {
    consumed: boolean;
    revoked: boolean;
  };
  termsAcceptances: number;
  bookingClaimAuditEvents: number;
  sessions: number;
  refreshFamilies: number;
  refreshTokens: number;
  rateLimitRecords: number;
}

interface SafeHttpEvidence {
  status: number;
  success: boolean;
  errorCode: string | null;
  sessionCookieSet: boolean;
  refreshCookieSet: boolean;
}

interface ExistingUserExpectation {
  id: string;
  passwordHash: string;
}

type GrantState = 'active' | 'expired' | 'revoked' | 'consumed';

interface ClaimSeedOptions {
  startOffset: number;
  endOffset: number;
  includeExistingUser?: boolean;
  grantState?: GrantState;
}

let target: DisposableDatabaseTarget | undefined;
let applicationPrisma: PrismaClient | undefined;
const originalEnvironment = new Map<ManagedEnvironmentName, string | undefined>();

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
  if (!target) throw new Error('Disposable claim regression database was not initialized.');
  return target;
}

async function seedClaim(
  targetDatabase: DisposableDatabaseTarget,
  options: ClaimSeedOptions,
): Promise<ExistingUserExpectation | undefined> {
  const now = new Date();
  const grantState = options.grantState ?? 'active';
  const tokenDigest = createHmac('sha256', CLAIM_TOKEN_PEPPER)
    .update(CLAIM_TOKEN, 'utf8')
    .digest('hex');
  const passwordHash = options.includeExistingUser
    ? await bcrypt.hash(SYNTHETIC_PASSWORD, 4)
    : undefined;

  await withTestPrismaClient(targetDatabase, async (prisma) => {
    if (passwordHash) {
      await prisma.user.create({
        data: {
          id: EXISTING_USER_ID,
          phoneE164: SYNTHETIC_PHONE,
          passwordHash,
          countryOrigin: 'ABROAD',
        },
      });
    }
    await prisma.booking.create({
      data: {
        id: BOOKING_ID,
        source: 'EXTERNAL',
        startDate: utcDateOffset(now, options.startOffset),
        endDate: utcDateOffset(now, options.endOffset),
        provider: 'integration-claim-regression',
        externalReference: 'far-future-booking',
        accessStatus: 'PENDING',
      },
    });
    await prisma.bookingClaimGrant.create({
      data: {
        id: GRANT_ID,
        bookingId: BOOKING_ID,
        tokenDigest,
        channel: 'REMOTE',
        expiresAt: grantState === 'expired'
          ? new Date(now.getTime() - 60_000)
          : new Date(now.getTime() + 30 * 60_000),
        consumedAt: grantState === 'consumed' ? now : null,
        revokedAt: grantState === 'revoked' ? now : null,
      },
    });
  }, 'seed');

  return passwordHash ? { id: EXISTING_USER_ID, passwordHash } : undefined;
}

async function safeClaimState(
  targetDatabase: DisposableDatabaseTarget,
  existingUserExpectation?: ExistingUserExpectation,
): Promise<SafeClaimState> {
  return withTestPrismaClient(targetDatabase, async (prisma) => {
    const [
      users,
      booking,
      grant,
      termsAcceptances,
      bookingClaimAuditEvents,
      sessions,
      refreshFamilies,
      refreshTokens,
      rateLimitRecords,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.booking.findUniqueOrThrow({ where: { id: BOOKING_ID } }),
      prisma.bookingClaimGrant.findUniqueOrThrow({ where: { id: GRANT_ID } }),
      prisma.termsAcceptance.count(),
      prisma.securityAuditEvent.count({
        where: { eventType: 'portal.booking_claimed' },
      }),
      prisma.session.count(),
      prisma.refreshTokenFamily.count(),
      prisma.refreshToken.count(),
      prisma.rateLimit.count(),
    ]);
    const existingUser = existingUserExpectation
      ? await prisma.user.findUnique({ where: { id: existingUserExpectation.id } })
      : null;

    return {
      users,
      existingUser: existingUserExpectation ? {
        present: Boolean(existingUser),
        passwordUnchanged: existingUser?.passwordHash === existingUserExpectation.passwordHash,
        originUnchanged: existingUser?.countryOrigin === 'ABROAD',
      } : null,
      booking: {
        ownerPresent: Boolean(booking.userId),
        accessStatus: booking.accessStatus,
        claimed: Boolean(booking.claimedAt),
      },
      grant: {
        consumed: Boolean(grant.consumedAt),
        revoked: Boolean(grant.revokedAt),
      },
      termsAcceptances,
      bookingClaimAuditEvents,
      sessions,
      refreshFamilies,
      refreshTokens,
      rateLimitRecords,
    };
  });
}

async function resetClaimState(targetDatabase: DisposableDatabaseTarget): Promise<void> {
  await withTestPrismaClient(targetDatabase, async (prisma) => {
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

async function performClaimRequest(options: {
  remember: boolean;
  token?: string;
}): Promise<{
  response: Awaited<ReturnType<typeof import('@/app/api/portal/claims/route')['POST']>>;
  responseText: string;
  http: SafeHttpEvidence;
}> {
  const [{ NextRequest }, claimRoute] = await Promise.all([
    import('next/server'),
    import('@/app/api/portal/claims/route'),
  ]);
  const request = new NextRequest(CLAIM_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'pr02b-synthetic-claim-client',
      'x-forwarded-for': '198.51.100.51',
    },
    body: JSON.stringify({
      claimToken: options.token ?? CLAIM_TOKEN,
      origin: 'ABROAD',
      phone: SYNTHETIC_PHONE,
      password: SYNTHETIC_PASSWORD,
      remember: options.remember,
      acceptTerms: true,
    }),
  });

  const response = await claimRoute.POST(request, { params: Promise.resolve({}) });
  const responseText = await response.text();
  const responseBody = JSON.parse(responseText) as {
    success?: boolean;
    error?: { code?: string };
  };
  return {
    response,
    responseText,
    http: {
      status: response.status,
      success: responseBody.success === true,
      errorCode: responseBody.error?.code ?? null,
      sessionCookieSet: Boolean(response.cookies.get('guest_session')?.value),
      refreshCookieSet: Boolean(response.cookies.get('guest_rt')?.value),
    },
  };
}

async function successfulRememberState(
  targetDatabase: DisposableDatabaseTarget,
): Promise<{
  userCreated: boolean;
  bookingClaimed: boolean;
  grantConsumed: boolean;
  termsAcceptances: number;
  successAudits: number;
  sessions: number;
  refreshFamilies: number;
  refreshTokens: number;
  generationPaired: boolean;
}> {
  return withTestPrismaClient(targetDatabase, async (prisma) => {
    const [user, booking, grant, termsAcceptances, successAudits, sessions, families, tokens] =
      await Promise.all([
        prisma.user.findUnique({ where: { phoneE164: SYNTHETIC_PHONE } }),
        prisma.booking.findUniqueOrThrow({ where: { id: BOOKING_ID } }),
        prisma.bookingClaimGrant.findUniqueOrThrow({ where: { id: GRANT_ID } }),
        prisma.termsAcceptance.count({ where: { bookingId: BOOKING_ID } }),
        prisma.securityAuditEvent.count({ where: { eventType: 'portal.booking_claimed' } }),
        prisma.session.findMany({ select: { id: true } }),
        prisma.refreshTokenFamily.findMany({ select: { revokedAt: true } }),
        prisma.refreshToken.findMany({ select: { id: true, revokedAt: true } }),
      ]);

    return {
      userCreated: Boolean(user),
      bookingClaimed: booking.userId === user?.id
        && booking.accessStatus === 'VERIFIED'
        && Boolean(booking.claimedAt),
      grantConsumed: Boolean(grant.consumedAt),
      termsAcceptances,
      successAudits,
      sessions: sessions.length,
      refreshFamilies: families.filter((family) => !family.revokedAt).length,
      refreshTokens: tokens.filter((token) => !token.revokedAt).length,
      generationPaired: sessions.length === 1
        && tokens.length === 1
        && sessions[0]?.id === tokens[0]?.id,
    };
  });
}

describe.sequential('booking claim eligibility-window defect gate', () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
    target = await createIsolatedDatabase(runtime, 'claim_window_gate');
    await applyMigrationsFromEmpty(target);
    setApplicationEnvironment(target.databaseUrl);
    applicationPrisma = (await import('@/lib/prisma')).prisma;
  });

  afterEach(async () => {
    if (target) await resetClaimState(target);
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

  it.each([
    ['new identity without remember-me', false, false],
    ['new identity with remember-me', false, true],
    ['existing identity without remember-me', true, false],
    ['existing identity with remember-me', true, true],
  ])('rejects a +30-day grant for %s without side effects', async (
    _label,
    includeExistingUser,
    remember,
  ) => {
    const claimTarget = requireTarget();
    const existingUserExpectation = await seedClaim(claimTarget, {
      startOffset: 30,
      endOffset: 37,
      includeExistingUser,
    });
    const before = await safeClaimState(claimTarget, existingUserExpectation);
    const { responseText, http } = await performClaimRequest({ remember });
    const after = await safeClaimState(claimTarget, existingUserExpectation);

    expect(responseText).not.toContain(CLAIM_TOKEN);
    expect(responseText).not.toContain(SYNTHETIC_PHONE);
    expect(responseText).not.toContain(SYNTHETIC_PASSWORD);
    expect(responseText).not.toContain(claimTarget.databaseUrl);

    expect({ before, http, after }).toEqual({
      before: {
        users: includeExistingUser ? 1 : 0,
        existingUser: includeExistingUser ? {
          present: true,
          passwordUnchanged: true,
          originUnchanged: true,
        } : null,
        booking: { ownerPresent: false, accessStatus: 'PENDING', claimed: false },
        grant: { consumed: false, revoked: false },
        termsAcceptances: 0,
        bookingClaimAuditEvents: 0,
        sessions: 0,
        refreshFamilies: 0,
        refreshTokens: 0,
        rateLimitRecords: 0,
      },
      http: {
        status: 401,
        success: false,
        errorCode: 'UNAUTHORIZED',
        sessionCookieSet: false,
        refreshCookieSet: false,
      },
      after: {
        users: includeExistingUser ? 1 : 0,
        existingUser: includeExistingUser ? {
          present: true,
          passwordUnchanged: true,
          originUnchanged: true,
        } : null,
        booking: { ownerPresent: false, accessStatus: 'PENDING', claimed: false },
        grant: { consumed: false, revoked: false },
        termsAcceptances: 0,
        bookingClaimAuditEvents: 0,
        sessions: 0,
        refreshFamilies: 0,
        refreshTokens: 0,
        rateLimitRecords: 2,
      },
    });
  });

  it('allows the inclusive +7 boundary with remember-me and preserves session-token pairing', async () => {
    const claimTarget = requireTarget();
    await seedClaim(claimTarget, { startOffset: 7, endOffset: 14 });

    const { responseText, http } = await performClaimRequest({ remember: true });
    const state = await successfulRememberState(claimTarget);

    expect(responseText).not.toContain(CLAIM_TOKEN);
    expect(responseText).not.toContain(SYNTHETIC_PHONE);
    expect(responseText).not.toContain(SYNTHETIC_PASSWORD);
    expect(responseText).not.toContain(claimTarget.databaseUrl);
    expect({ http, state }).toEqual({
      http: {
        status: 200,
        success: true,
        errorCode: null,
        sessionCookieSet: true,
        refreshCookieSet: true,
      },
      state: {
        userCreated: true,
        bookingClaimed: true,
        grantConsumed: true,
        termsAcceptances: 1,
        successAudits: 1,
        sessions: 1,
        refreshFamilies: 1,
        refreshTokens: 1,
        generationPaired: true,
      },
    });
  });

  it.each([
    ['expired', 'expired', CLAIM_TOKEN, 401, 'UNAUTHORIZED', 2],
    ['revoked', 'revoked', CLAIM_TOKEN, 401, 'UNAUTHORIZED', 2],
    ['consumed', 'consumed', CLAIM_TOKEN, 401, 'UNAUTHORIZED', 2],
    ['unknown', 'active', `claim_${'U'.repeat(43)}`, 401, 'UNAUTHORIZED', 2],
    ['malformed', 'active', 'short', 422, 'VALIDATION_ERROR', 0],
  ] as const)(
    'preserves the existing generic failure contract for a %s grant token',
    async (_label, grantState, token, status, errorCode, rateLimitRecords) => {
      const claimTarget = requireTarget();
      await seedClaim(claimTarget, {
        startOffset: 0,
        endOffset: 7,
        grantState,
      });
      const before = await safeClaimState(claimTarget);

      const { responseText, http } = await performClaimRequest({ remember: false, token });
      const after = await safeClaimState(claimTarget);

      expect(responseText).not.toContain(CLAIM_TOKEN);
      expect(responseText).not.toContain(token);
      expect(responseText).not.toContain(SYNTHETIC_PHONE);
      expect(responseText).not.toContain(SYNTHETIC_PASSWORD);
      expect(responseText).not.toContain(claimTarget.databaseUrl);
      expect(http).toEqual({
        status,
        success: false,
        errorCode,
        sessionCookieSet: false,
        refreshCookieSet: false,
      });
      expect({ ...after, rateLimitRecords: before.rateLimitRecords }).toEqual(before);
      expect(after.rateLimitRecords).toBe(rateLimitRecords);
    },
  );
});
