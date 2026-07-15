import jwt from 'jsonwebtoken';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';

import type { DisposableDatabaseTarget } from '../support/database-safety';
import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
} from '../support/database-lifecycle';
import { withTestPrismaClient } from '../support/fixtures';
import { applyMigrationsFromEmpty } from '../support/migrations';
import { readDisposablePostgresRuntime } from '../support/runtime';
import {
  ALTERNATE_BOOKING_FIXTURE,
  ISOLATED_AUTH_FIXTURE,
  REVOKED_SESSION_FIXTURE,
  expireRefreshFamilyForFixture,
  expireSessionForFixture,
  resetAuthFixtures,
  revokeSessionOnlyForFailureFixture,
  safeAuthStateSnapshot,
  seedAuthEligibilityFixtures,
  seedRevokedSessionEligibilityFixture,
} from './support/auth-fixtures';
import type { AuthPrincipalFixture } from './support/auth-fixtures';

const runtime = readDisposablePostgresRuntime();
const SYNTHETIC_SECURITY_PEPPER = 'pr02-integration-security-pepper-only';
const SYNTHETIC_JWT_SECRET = 'pr02-integration-jwt-secret-only';
const REFRESH_URL = 'http://integration.invalid/api/portal/refresh';
const LEGACY_TOKEN_ID = '33000000-0000-4000-8000-000000000001';
const LEGACY_FAMILY_ID = 'pr02a-unbound-legacy-family';
const LEGACY_REFRESH_SECRET = 'pr02a-synthetic-unbound-refresh-secret';
const REQUEST_HEADERS = {
  'user-agent': 'pr02-synthetic-refresh-client',
  'x-forwarded-for': '198.51.100.42',
} as const;

const managedEnvironment = [
  'DATABASE_URL',
  'SECURITY_PEPPER',
  'GUEST_JWT_SECRET',
  'PRISMA_AUTO_DISCONNECT',
] as const;

type ManagedEnvironmentName = typeof managedEnvironment[number];
type SessionModule = typeof import('@/lib/guestSession');
type RefreshRouteModule = typeof import('@/app/api/portal/refresh/route');
type RefreshResponse = Awaited<ReturnType<RefreshRouteModule['POST']>>;

interface AuthModules {
  NextRequest: typeof import('next/server').NextRequest;
  guestStore: typeof import('@/lib/guestDataStore').guestStore;
  sessionModule: SessionModule;
  requestAuthContext: typeof import('@/lib/portalAuthHttp').requestAuthContext;
  refreshRoute: RefreshRouteModule;
}

interface BoundAuthorizationChain {
  sessionId: string;
  sessionToken: string;
  refreshToken: string;
}

let target: DisposableDatabaseTarget | undefined;
let applicationPrisma: PrismaClient | undefined;
let databaseReady = false;
const originalEnvironment = new Map<ManagedEnvironmentName, string | undefined>();

function setApplicationEnvironment(databaseUrl: string): void {
  for (const name of managedEnvironment) originalEnvironment.set(name, process.env[name]);
  process.env.DATABASE_URL = databaseUrl;
  process.env.SECURITY_PEPPER = SYNTHETIC_SECURITY_PEPPER;
  process.env.GUEST_JWT_SECRET = SYNTHETIC_JWT_SECRET;
  process.env.PRISMA_AUTO_DISCONNECT = 'false';
}

function restoreApplicationEnvironment(): void {
  for (const name of managedEnvironment) {
    const value = originalEnvironment.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function loadAuthModules(): Promise<AuthModules> {
  const [nextServer, guestDataStore, sessionModule, portalAuthHttp, refreshRoute] =
    await Promise.all([
      import('next/server'),
      import('@/lib/guestDataStore'),
      import('@/lib/guestSession'),
      import('@/lib/portalAuthHttp'),
      import('@/app/api/portal/refresh/route'),
    ]);
  return {
    NextRequest: nextServer.NextRequest,
    guestStore: guestDataStore.guestStore,
    sessionModule,
    requestAuthContext: portalAuthHttp.requestAuthContext,
    refreshRoute,
  };
}

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Disposable auth database was not initialized.');
  return target;
}

function authContext(modules: AuthModules): { deviceHint: string; ipHint: string } {
  const request = new modules.NextRequest(REFRESH_URL, {
    method: 'POST',
    headers: REQUEST_HEADERS,
  });
  return modules.requestAuthContext(request);
}

async function issueBoundAuthorizationChain(
  modules: AuthModules,
  fixture: AuthPrincipalFixture,
): Promise<BoundAuthorizationChain> {
  const sessionToken = await modules.sessionModule.issueGuestSession(
    fixture.userId,
    fixture.bookingId,
  );
  const sessionId = modules.sessionModule.parseGuestSession(sessionToken)?.sid;
  if (!sessionId) throw new Error('Synthetic guest session did not expose a safe binding ID.');

  const context = authContext(modules);
  const issuedRefresh = await modules.guestStore.issueRefreshToken(fixture.userId, 7, {
    session_id: sessionId,
    family_id: fixture.familyId,
    device_hint: context.deviceHint,
    ip_hint: context.ipHint,
  });
  if (issuedRefresh.rec.id !== sessionId) {
    throw new Error('Synthetic refresh generation was not bound to its session generation.');
  }

  return {
    sessionId,
    sessionToken,
    refreshToken: issuedRefresh.token,
  };
}

function refreshRequest(
  modules: AuthModules,
  refreshToken: string,
  sessionToken?: string,
): InstanceType<AuthModules['NextRequest']> {
  const headers = new Headers(REQUEST_HEADERS);
  const cookies = [`guest_rt=${refreshToken}`];
  if (sessionToken !== undefined) cookies.unshift(`guest_session=${sessionToken}`);
  headers.set('cookie', cookies.join('; '));
  return new modules.NextRequest(REFRESH_URL, { method: 'POST', headers });
}

async function performRefresh(
  modules: AuthModules,
  refreshToken: string,
  sessionToken?: string,
): Promise<RefreshResponse> {
  return modules.refreshRoute.POST(
    refreshRequest(modules, refreshToken, sessionToken),
    { params: Promise.resolve({}) },
  );
}

async function safeFailureEvidence(
  response: RefreshResponse,
  sessionModule: SessionModule,
): Promise<{
  status: number;
  body: string;
  sessionCookie: { present: boolean; cleared: boolean; maxAge: number | null };
  refreshCookie: { present: boolean; cleared: boolean; maxAge: number | null };
  replacementSessionValid: boolean;
}> {
  const sessionCookie = response.cookies.get('guest_session');
  const refreshCookie = response.cookies.get('guest_rt');
  const replacementSession = sessionModule.parseGuestSession(sessionCookie?.value);
  return {
    status: response.status,
    body: await response.text(),
    sessionCookie: {
      present: Boolean(sessionCookie),
      cleared: sessionCookie?.value === '',
      maxAge: sessionCookie?.maxAge ?? null,
    },
    refreshCookie: {
      present: Boolean(refreshCookie),
      cleared: refreshCookie?.value === '',
      maxAge: refreshCookie?.maxAge ?? null,
    },
    replacementSessionValid: Boolean(
      await sessionModule.verifyGuestSessionAccess(replacementSession),
    ),
  };
}

async function safeSuccessEvidence(
  response: RefreshResponse,
  sessionModule: SessionModule,
): Promise<{
  status: number;
  sessionCookieSet: boolean;
  refreshCookieSet: boolean;
  replacementSessionValid: boolean;
}> {
  const sessionCookie = response.cookies.get('guest_session');
  const refreshCookie = response.cookies.get('guest_rt');
  return {
    status: response.status,
    sessionCookieSet: Boolean(sessionCookie?.value),
    refreshCookieSet: Boolean(refreshCookie?.value),
    replacementSessionValid: Boolean(
      await sessionModule.verifyGuestSessionAccess(
        sessionModule.parseGuestSession(sessionCookie?.value),
      ),
    ),
  };
}

const EXPECTED_UNAUTHORIZED = {
  status: 401,
  body: 'Unauthorized',
  sessionCookie: { present: true, cleared: true, maxAge: 0 },
  refreshCookie: { present: true, cleared: true, maxAge: 0 },
  replacementSessionValid: false,
} as const;

describe.sequential('refresh authorization generation regressions', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'revoked_session_refresh');
    await applyMigrationsFromEmpty(target);
    setApplicationEnvironment(target.databaseUrl);
    applicationPrisma = (await import('@/lib/prisma')).prisma;
    databaseReady = true;
  });

  afterEach(async () => {
    if (databaseReady && target) await resetAuthFixtures(target);
  });

  afterAll(async () => {
    databaseReady = false;
    try {
      await applicationPrisma?.$disconnect();
      applicationPrisma = undefined;
    } finally {
      restoreApplicationEnvironment();
      if (target) await dropIsolatedDatabase(target);
      target = undefined;
    }
  });

  it('rejects the confirmed revoked-session state without minting a descendant', async () => {
    const authTarget = requireTarget();
    const fixtureNow = new Date();
    await seedRevokedSessionEligibilityFixture(authTarget, fixtureNow);
    const modules = await loadAuthModules();
    const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);
    await revokeSessionOnlyForFailureFixture(authTarget, chain.sessionId, new Date());

    const before = await safeAuthStateSnapshot(authTarget, new Date());
    const response = await performRefresh(modules, chain.refreshToken, chain.sessionToken);
    const failure = await safeFailureEvidence(response, modules.sessionModule);
    const after = await safeAuthStateSnapshot(authTarget, new Date());

    expect(failure).toEqual(EXPECTED_UNAUTHORIZED);
    expect(before).toEqual({
      users: 1,
      bookings: 1,
      sessions: { total: 1, active: 0, expired: 0, revoked: 1 },
      refreshFamilies: { total: 1, active: 1, expired: 0, revoked: 0 },
      refreshTokens: {
        total: 1,
        active: 1,
        expired: 0,
        revoked: 0,
        descendants: 0,
        activeDescendants: 0,
      },
    });
    expect(after).toEqual({
      users: 1,
      bookings: 1,
      sessions: { total: 1, active: 0, expired: 0, revoked: 1 },
      refreshFamilies: { total: 1, active: 0, expired: 0, revoked: 1 },
      refreshTokens: {
        total: 1,
        active: 0,
        expired: 0,
        revoked: 1,
        descendants: 0,
        activeDescendants: 0,
      },
    });
  });

  it('cannot bypass a revoked DB-bound generation by omitting the short-session cookie', async () => {
    const authTarget = requireTarget();
    await seedRevokedSessionEligibilityFixture(authTarget, new Date());
    const modules = await loadAuthModules();
    const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);
    await revokeSessionOnlyForFailureFixture(authTarget, chain.sessionId, new Date());

    const before = await safeAuthStateSnapshot(authTarget, new Date());
    const response = await performRefresh(modules, chain.refreshToken);
    const failure = await safeFailureEvidence(response, modules.sessionModule);
    const after = await safeAuthStateSnapshot(authTarget, new Date());

    expect(failure).toEqual(EXPECTED_UNAUTHORIZED);
    expect(before.refreshFamilies).toEqual({ total: 1, active: 1, expired: 0, revoked: 0 });
    expect(before.refreshTokens).toEqual({
      total: 1,
      active: 1,
      expired: 0,
      revoked: 0,
      descendants: 0,
      activeDescendants: 0,
    });
    expect(after.sessions).toEqual({ total: 1, active: 0, expired: 0, revoked: 1 });
    expect(after.refreshFamilies).toEqual({ total: 1, active: 0, expired: 0, revoked: 1 });
    expect(after.refreshTokens).toEqual({
      total: 1,
      active: 0,
      expired: 0,
      revoked: 1,
      descendants: 0,
      activeDescendants: 0,
    });
  });

  it('fails closed for an unbound pre-cutover refresh generation', async () => {
    const authTarget = requireTarget();
    await seedRevokedSessionEligibilityFixture(authTarget, new Date());
    const modules = await loadAuthModules();
    const sessionToken = await modules.sessionModule.issueGuestSession(
      REVOKED_SESSION_FIXTURE.userId,
      REVOKED_SESSION_FIXTURE.bookingId,
    );
    const { hashSensitive } = await import('@/lib/crypto');
    const { hash, salt } = hashSensitive(LEGACY_REFRESH_SECRET);
    const now = new Date();
    await withTestPrismaClient(authTarget, async (prisma) => {
      await prisma.$transaction([
        prisma.refreshTokenFamily.create({
          data: {
            id: LEGACY_FAMILY_ID,
            userId: REVOKED_SESSION_FIXTURE.userId,
            absoluteExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
          },
        }),
        prisma.refreshToken.create({
          data: {
            id: LEGACY_TOKEN_ID,
            userId: REVOKED_SESSION_FIXTURE.userId,
            tokenHash: hash,
            salt,
            familyId: LEGACY_FAMILY_ID,
            expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
          },
        }),
      ]);
    }, 'failure-fixture');

    const before = await safeAuthStateSnapshot(authTarget, new Date());
    const response = await performRefresh(
      modules,
      `${LEGACY_TOKEN_ID}.${LEGACY_REFRESH_SECRET}`,
      sessionToken,
    );
    const failure = await safeFailureEvidence(response, modules.sessionModule);
    const after = await safeAuthStateSnapshot(authTarget, new Date());

    expect(failure).toEqual(EXPECTED_UNAUTHORIZED);
    expect(before.sessions).toEqual({ total: 1, active: 1, expired: 0, revoked: 0 });
    expect(before.refreshFamilies).toEqual({ total: 1, active: 1, expired: 0, revoked: 0 });
    expect(before.refreshTokens).toEqual({
      total: 1,
      active: 1,
      expired: 0,
      revoked: 0,
      descendants: 0,
      activeDescendants: 0,
    });
    expect(after.sessions).toEqual({ total: 1, active: 1, expired: 0, revoked: 0 });
    expect(after.refreshFamilies).toEqual({ total: 1, active: 0, expired: 0, revoked: 1 });
    expect(after.refreshTokens).toEqual({
      total: 1,
      active: 0,
      expired: 0,
      revoked: 1,
      descendants: 0,
      activeDescendants: 0,
    });
  });

  it('allows natural DB and JWT expiry when the signed generation binding is valid', async () => {
    const authTarget = requireTarget();
    const fixtureNow = new Date();
    await seedRevokedSessionEligibilityFixture(authTarget, fixtureNow);
    const modules = await loadAuthModules();
    const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);
    await expireSessionForFixture(authTarget, chain.sessionId, new Date());
    const expiredSignedSession = jwt.sign({
      type: 'guest',
      sid: chain.sessionId,
      user: { id: REVOKED_SESSION_FIXTURE.userId },
      booking: { id: REVOKED_SESSION_FIXTURE.bookingId },
    }, SYNTHETIC_JWT_SECRET, { algorithm: 'HS256', expiresIn: -60 });

    const before = await safeAuthStateSnapshot(authTarget, new Date());
    const response = await performRefresh(modules, chain.refreshToken, expiredSignedSession);
    const success = await safeSuccessEvidence(response, modules.sessionModule);
    const after = await safeAuthStateSnapshot(authTarget, new Date());

    expect(success).toEqual({
      status: 200,
      sessionCookieSet: true,
      refreshCookieSet: true,
      replacementSessionValid: true,
    });
    expect(before.sessions).toEqual({ total: 1, active: 0, expired: 1, revoked: 0 });
    expect(before.refreshFamilies).toEqual({ total: 1, active: 1, expired: 0, revoked: 0 });
    expect(before.refreshTokens).toEqual({
      total: 1,
      active: 1,
      expired: 0,
      revoked: 0,
      descendants: 0,
      activeDescendants: 0,
    });
    expect(after.sessions).toEqual({ total: 2, active: 1, expired: 0, revoked: 1 });
    expect(after.refreshFamilies).toEqual({ total: 1, active: 1, expired: 0, revoked: 0 });
    expect(after.refreshTokens).toEqual({
      total: 2,
      active: 1,
      expired: 0,
      revoked: 1,
      descendants: 1,
      activeDescendants: 1,
    });
  });

  it('allows refresh without a short-session cookie through the DB-bound generation', async () => {
    const authTarget = requireTarget();
    await seedRevokedSessionEligibilityFixture(authTarget, new Date());
    const modules = await loadAuthModules();
    const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);

    const response = await performRefresh(modules, chain.refreshToken);
    const success = await safeSuccessEvidence(response, modules.sessionModule);
    const after = await safeAuthStateSnapshot(authTarget, new Date());

    expect(success).toEqual({
      status: 200,
      sessionCookieSet: true,
      refreshCookieSet: true,
      replacementSessionValid: true,
    });
    expect(after.sessions).toEqual({ total: 2, active: 1, expired: 0, revoked: 1 });
    expect(after.refreshFamilies).toEqual({ total: 1, active: 1, expired: 0, revoked: 0 });
    expect(after.refreshTokens).toEqual({
      total: 2,
      active: 1,
      expired: 0,
      revoked: 1,
      descendants: 1,
      activeDescendants: 1,
    });
  });

  it('rejects a malformed short-session cookie and revokes only its refresh chain', async () => {
    const authTarget = requireTarget();
    await seedRevokedSessionEligibilityFixture(authTarget, new Date());
    const modules = await loadAuthModules();
    const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);

    const response = await performRefresh(
      modules,
      chain.refreshToken,
      'malformed-synthetic-session-cookie',
    );
    const failure = await safeFailureEvidence(response, modules.sessionModule);
    const after = await safeAuthStateSnapshot(authTarget, new Date());

    expect(failure).toEqual(EXPECTED_UNAUTHORIZED);
    expect(after.sessions).toEqual({ total: 1, active: 0, expired: 0, revoked: 1 });
    expect(after.refreshFamilies).toEqual({ total: 1, active: 0, expired: 0, revoked: 1 });
    expect(after.refreshTokens).toEqual({
      total: 1,
      active: 0,
      expired: 0,
      revoked: 1,
      descendants: 0,
      activeDescendants: 0,
    });
  });

  it('rejects a session cookie belonging to another user without touching that user', async () => {
    const authTarget = requireTarget();
    await seedAuthEligibilityFixtures(authTarget, new Date(), {
      includeIsolatedPrincipal: true,
    });
    const modules = await loadAuthModules();
    const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);
    const unrelatedSession = await modules.sessionModule.issueGuestSession(
      ISOLATED_AUTH_FIXTURE.userId,
      ISOLATED_AUTH_FIXTURE.bookingId,
    );

    const response = await performRefresh(modules, chain.refreshToken, unrelatedSession);
    const failure = await safeFailureEvidence(response, modules.sessionModule);
    const primaryAfter = await safeAuthStateSnapshot(authTarget, new Date(), {
      userId: REVOKED_SESSION_FIXTURE.userId,
    });
    const isolatedAfter = await safeAuthStateSnapshot(authTarget, new Date(), {
      userId: ISOLATED_AUTH_FIXTURE.userId,
    });

    expect(failure).toEqual(EXPECTED_UNAUTHORIZED);
    expect(primaryAfter.sessions).toEqual({ total: 1, active: 0, expired: 0, revoked: 1 });
    expect(primaryAfter.refreshFamilies).toEqual({ total: 1, active: 0, expired: 0, revoked: 1 });
    expect(primaryAfter.refreshTokens).toEqual({
      total: 1,
      active: 0,
      expired: 0,
      revoked: 1,
      descendants: 0,
      activeDescendants: 0,
    });
    expect(isolatedAfter).toEqual({
      users: 1,
      bookings: 1,
      sessions: { total: 1, active: 1, expired: 0, revoked: 0 },
      refreshFamilies: { total: 0, active: 0, expired: 0, revoked: 0 },
      refreshTokens: {
        total: 0,
        active: 0,
        expired: 0,
        revoked: 0,
        descendants: 0,
        activeDescendants: 0,
      },
    });
  });

  it('rejects a session cookie bound to another booking without revoking that session', async () => {
    const authTarget = requireTarget();
    await seedAuthEligibilityFixtures(authTarget, new Date(), {
      includeAlternateBooking: true,
    });
    const modules = await loadAuthModules();
    const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);
    const alternateSession = await modules.sessionModule.issueGuestSession(
      REVOKED_SESSION_FIXTURE.userId,
      ALTERNATE_BOOKING_FIXTURE.bookingId,
    );

    const response = await performRefresh(modules, chain.refreshToken, alternateSession);
    const failure = await safeFailureEvidence(response, modules.sessionModule);
    const after = await safeAuthStateSnapshot(authTarget, new Date(), {
      userId: REVOKED_SESSION_FIXTURE.userId,
    });

    expect(failure).toEqual(EXPECTED_UNAUTHORIZED);
    expect(after.users).toBe(1);
    expect(after.bookings).toBe(2);
    expect(after.sessions).toEqual({ total: 2, active: 1, expired: 0, revoked: 1 });
    expect(after.refreshFamilies).toEqual({ total: 1, active: 0, expired: 0, revoked: 1 });
    expect(after.refreshTokens).toEqual({
      total: 1,
      active: 0,
      expired: 0,
      revoked: 1,
      descendants: 0,
      activeDescendants: 0,
    });
  });

  it('rejects a session from another refresh family without touching that family', async () => {
    const authTarget = requireTarget();
    await seedRevokedSessionEligibilityFixture(authTarget, new Date());
    const modules = await loadAuthModules();
    const primaryChain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);
    const independentChain = await issueBoundAuthorizationChain(modules, {
      ...REVOKED_SESSION_FIXTURE,
      familyId: 'pr02a-same-booking-independent-family',
    });

    const primaryResponse = await performRefresh(
      modules,
      primaryChain.refreshToken,
      independentChain.sessionToken,
    );
    const primaryFailure = await safeFailureEvidence(primaryResponse, modules.sessionModule);
    const stateAfterRejection = await safeAuthStateSnapshot(authTarget, new Date());
    const independentResponse = await performRefresh(
      modules,
      independentChain.refreshToken,
      independentChain.sessionToken,
    );
    const independentSuccess = await safeSuccessEvidence(
      independentResponse,
      modules.sessionModule,
    );
    const finalState = await safeAuthStateSnapshot(authTarget, new Date());

    expect(primaryFailure).toEqual(EXPECTED_UNAUTHORIZED);
    expect(stateAfterRejection.sessions).toEqual({
      total: 2, active: 1, expired: 0, revoked: 1,
    });
    expect(stateAfterRejection.refreshFamilies).toEqual({
      total: 2, active: 1, expired: 0, revoked: 1,
    });
    expect(stateAfterRejection.refreshTokens).toEqual({
      total: 2,
      active: 1,
      expired: 0,
      revoked: 1,
      descendants: 0,
      activeDescendants: 0,
    });
    expect(independentSuccess).toEqual({
      status: 200,
      sessionCookieSet: true,
      refreshCookieSet: true,
      replacementSessionValid: true,
    });
    expect(finalState.sessions).toEqual({ total: 3, active: 1, expired: 0, revoked: 2 });
    expect(finalState.refreshFamilies).toEqual({ total: 2, active: 1, expired: 0, revoked: 1 });
    expect(finalState.refreshTokens).toEqual({
      total: 3,
      active: 1,
      expired: 0,
      revoked: 2,
      descendants: 1,
      activeDescendants: 1,
    });
  });

  it('rejects an already revoked family without creating replacement records', async () => {
    const authTarget = requireTarget();
    await seedRevokedSessionEligibilityFixture(authTarget, new Date());
    const modules = await loadAuthModules();
    const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);
    await expect(modules.guestStore.revokeRefreshFamily(chain.refreshToken)).resolves.toBe(true);
    const before = await safeAuthStateSnapshot(authTarget, new Date());

    const response = await performRefresh(modules, chain.refreshToken, chain.sessionToken);
    const failure = await safeFailureEvidence(response, modules.sessionModule);
    const after = await safeAuthStateSnapshot(authTarget, new Date());

    expect(failure).toEqual(EXPECTED_UNAUTHORIZED);
    expect(before).toEqual(after);
    expect(after.sessions).toEqual({ total: 1, active: 0, expired: 0, revoked: 1 });
    expect(after.refreshFamilies).toEqual({ total: 1, active: 0, expired: 0, revoked: 1 });
    expect(after.refreshTokens).toEqual({
      total: 1,
      active: 0,
      expired: 0,
      revoked: 1,
      descendants: 0,
      activeDescendants: 0,
    });
  });

  it('rejects natural family expiry without rewriting it as explicit revocation', async () => {
    const authTarget = requireTarget();
    await seedRevokedSessionEligibilityFixture(authTarget, new Date());
    const modules = await loadAuthModules();
    const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);
    await expireRefreshFamilyForFixture(
      authTarget,
      REVOKED_SESSION_FIXTURE.familyId,
      new Date(),
    );
    const before = await safeAuthStateSnapshot(authTarget, new Date());

    const response = await performRefresh(modules, chain.refreshToken, chain.sessionToken);
    const failure = await safeFailureEvidence(response, modules.sessionModule);
    const after = await safeAuthStateSnapshot(authTarget, new Date());

    expect(failure).toEqual(EXPECTED_UNAUTHORIZED);
    expect(after).toEqual(before);
    expect(after.sessions).toEqual({ total: 1, active: 1, expired: 0, revoked: 0 });
    expect(after.refreshFamilies).toEqual({ total: 1, active: 0, expired: 1, revoked: 0 });
    expect(after.refreshTokens).toEqual({
      total: 1,
      active: 1,
      expired: 0,
      revoked: 0,
      descendants: 0,
      activeDescendants: 0,
    });
  });

  it('keeps repeated rejected refresh attempts idempotent and non-enumerating', async () => {
    const authTarget = requireTarget();
    await seedRevokedSessionEligibilityFixture(authTarget, new Date());
    const modules = await loadAuthModules();
    const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);
    await revokeSessionOnlyForFailureFixture(authTarget, chain.sessionId, new Date());

    const firstResponse = await performRefresh(modules, chain.refreshToken, chain.sessionToken);
    const firstFailure = await safeFailureEvidence(firstResponse, modules.sessionModule);
    const stableState = await safeAuthStateSnapshot(authTarget, new Date());
    const repeatedSessionCookies: Array<string | undefined> = [
      chain.sessionToken,
      undefined,
      'malformed-synthetic-session-cookie',
    ];
    const repeatedFailures = [];
    for (const sessionCookie of repeatedSessionCookies) {
      const response = await performRefresh(modules, chain.refreshToken, sessionCookie);
      repeatedFailures.push(await safeFailureEvidence(response, modules.sessionModule));
      expect(await safeAuthStateSnapshot(authTarget, new Date())).toEqual(stableState);
    }

    expect(firstFailure).toEqual(EXPECTED_UNAUTHORIZED);
    expect(repeatedFailures).toEqual([
      EXPECTED_UNAUTHORIZED,
      EXPECTED_UNAUTHORIZED,
      EXPECTED_UNAUTHORIZED,
    ]);
    expect(stableState.sessions).toEqual({ total: 1, active: 0, expired: 0, revoked: 1 });
    expect(stableState.refreshFamilies).toEqual({ total: 1, active: 0, expired: 0, revoked: 1 });
    expect(stableState.refreshTokens).toEqual({
      total: 1,
      active: 0,
      expired: 0,
      revoked: 1,
      descendants: 0,
      activeDescendants: 0,
    });
  });

  it('keeps an independent user, booking, and family usable after targeted revocation', async () => {
    const authTarget = requireTarget();
    await seedAuthEligibilityFixtures(authTarget, new Date(), {
      includeIsolatedPrincipal: true,
    });
    const modules = await loadAuthModules();
    const primaryChain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);
    const isolatedChain = await issueBoundAuthorizationChain(modules, ISOLATED_AUTH_FIXTURE);
    await modules.sessionModule.revokeGuestSession(
      modules.sessionModule.parseGuestSession(primaryChain.sessionToken),
    );

    const primaryResponse = await performRefresh(
      modules,
      primaryChain.refreshToken,
      primaryChain.sessionToken,
    );
    const primaryFailure = await safeFailureEvidence(primaryResponse, modules.sessionModule);
    const isolatedResponse = await performRefresh(
      modules,
      isolatedChain.refreshToken,
      isolatedChain.sessionToken,
    );
    const isolatedSuccess = await safeSuccessEvidence(isolatedResponse, modules.sessionModule);
    const primaryAfter = await safeAuthStateSnapshot(authTarget, new Date(), {
      userId: REVOKED_SESSION_FIXTURE.userId,
    });
    const isolatedAfter = await safeAuthStateSnapshot(authTarget, new Date(), {
      userId: ISOLATED_AUTH_FIXTURE.userId,
    });

    expect(primaryFailure).toEqual(EXPECTED_UNAUTHORIZED);
    expect(isolatedSuccess).toEqual({
      status: 200,
      sessionCookieSet: true,
      refreshCookieSet: true,
      replacementSessionValid: true,
    });
    expect(primaryAfter.sessions).toEqual({ total: 1, active: 0, expired: 0, revoked: 1 });
    expect(primaryAfter.refreshFamilies).toEqual({ total: 1, active: 0, expired: 0, revoked: 1 });
    expect(primaryAfter.refreshTokens).toEqual({
      total: 1,
      active: 0,
      expired: 0,
      revoked: 1,
      descendants: 0,
      activeDescendants: 0,
    });
    expect(isolatedAfter.sessions).toEqual({ total: 2, active: 1, expired: 0, revoked: 1 });
    expect(isolatedAfter.refreshFamilies).toEqual({ total: 1, active: 1, expired: 0, revoked: 0 });
    expect(isolatedAfter.refreshTokens).toEqual({
      total: 2,
      active: 1,
      expired: 0,
      revoked: 1,
      descendants: 1,
      activeDescendants: 1,
    });
  });
});
