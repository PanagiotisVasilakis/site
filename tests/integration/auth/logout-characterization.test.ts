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
  ISOLATED_AUTH_FIXTURE,
  REVOKED_SESSION_FIXTURE,
  resetAuthFixtures,
  seedAuthEligibilityFixtures,
} from './support/auth-fixtures';
import type { AuthPrincipalFixture } from './support/auth-fixtures';

const runtime = readDisposablePostgresRuntime();
const LOGOUT_URL = 'http://integration.invalid/api/portal/logout';
const REFRESH_URL = 'http://integration.invalid/api/portal/refresh';
const SYNTHETIC_SECURITY_PEPPER = 'pr02b-logout-security-pepper-only';
const SYNTHETIC_JWT_SECRET = 'pr02b-logout-jwt-secret-only';
const REQUEST_HEADERS = {
  'user-agent': 'pr02b-synthetic-logout-client',
  'x-origin-verified-client-ip': '198.51.100.73',
  'x-origin-proxy-attestation': '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2',
} as const;
const THIRD_CONTROL_FIXTURE: AuthPrincipalFixture = {
  userId: '11000000-0000-4000-8000-000000000004',
  bookingId: '21000000-0000-4000-8000-000000000004',
  familyId: 'pr02b-logout-third-control-family',
  email: 'logout-third-control@example.invalid',
  phoneE164: '+12025550104',
  provider: 'integration-auth-fixture',
  externalReference: 'logout-third-control-booking-004',
};

const managedEnvironment = [
  'DATABASE_URL',
  'GUEST_JWT_SECRET',
  'LOG_CONSOLE',
  'PRISMA_AUTO_DISCONNECT',
  'SECURITY_PEPPER',
] as const;

type ManagedEnvironmentName = typeof managedEnvironment[number];
type SessionModule = typeof import('@/lib/guestSession');
type LogoutRouteModule = typeof import('@/app/api/portal/logout/route');
type RefreshRouteModule = typeof import('@/app/api/portal/refresh/route');
type LogoutResponse = Awaited<ReturnType<LogoutRouteModule['POST']>>;
type RefreshResponse = Awaited<ReturnType<RefreshRouteModule['POST']>>;

interface AuthModules {
  NextRequest: typeof import('next/server').NextRequest;
  guestStore: typeof import('@/lib/guestDataStore').guestStore;
  requestAuthContext: typeof import('@/lib/portalAuthHttp').requestAuthContext;
  sessionModule: SessionModule;
  logoutRoute: LogoutRouteModule;
  refreshRoute: RefreshRouteModule;
}

interface BoundAuthorizationChain {
  sessionId: string;
  sessionToken: string;
  refreshToken: string;
}

interface SafeGraphState {
  sessions: {
    total: number;
    active: number;
    revoked: number;
  };
  families: {
    total: number;
    active: number;
    revoked: number;
  };
  tokens: {
    total: number;
    active: number;
    revoked: number;
    descendants: number;
  };
  pairedGenerations: number;
  generationPairingValid: boolean;
}

interface CookieClearEvidence {
  present: boolean;
  cleared: boolean;
  httpOnly: boolean;
  sameSiteLax: boolean;
  rootPath: boolean;
  maxAge: number | null;
}

let target: DisposableDatabaseTarget | undefined;
let applicationPrisma: PrismaClient | undefined;
let modules: AuthModules | undefined;
const originalEnvironment = new Map<ManagedEnvironmentName, string | undefined>();

const ACTIVE_BOUND_GRAPH: SafeGraphState = {
  sessions: { total: 1, active: 1, revoked: 0 },
  families: { total: 1, active: 1, revoked: 0 },
  tokens: { total: 1, active: 1, revoked: 0, descendants: 0 },
  pairedGenerations: 1,
  generationPairingValid: true,
};

const REVOKED_BOUND_GRAPH: SafeGraphState = {
  sessions: { total: 1, active: 0, revoked: 1 },
  families: { total: 1, active: 0, revoked: 1 },
  tokens: { total: 1, active: 0, revoked: 1, descendants: 0 },
  pairedGenerations: 1,
  generationPairingValid: true,
};

const EXPECTED_LOGOUT = {
  status: 204,
  body: '',
  sessionCookie: {
    present: true,
    cleared: true,
    httpOnly: true,
    sameSiteLax: true,
    rootPath: true,
    maxAge: 0,
  },
  refreshCookie: {
    present: true,
    cleared: true,
    httpOnly: true,
    sameSiteLax: true,
    rootPath: true,
    maxAge: 0,
  },
} as const;

const EXPECTED_REFRESH_DENIAL = {
  status: 401,
  body: 'Unauthorized',
  sessionCookie: { present: true, cleared: true, maxAge: 0 },
  refreshCookie: { present: true, cleared: true, maxAge: 0 },
} as const;

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Disposable logout database was not initialized.');
  return target;
}

function requireModules(): AuthModules {
  if (!modules) throw new Error('Logout characterization modules were not initialized.');
  return modules;
}

function setApplicationEnvironment(databaseUrl: string): void {
  for (const name of managedEnvironment) originalEnvironment.set(name, process.env[name]);
  process.env.DATABASE_URL = databaseUrl;
  process.env.GUEST_JWT_SECRET = SYNTHETIC_JWT_SECRET;
  process.env.LOG_CONSOLE = 'false';
  process.env.PRISMA_AUTO_DISCONNECT = 'false';
  process.env.SECURITY_PEPPER = SYNTHETIC_SECURITY_PEPPER;
}

function restoreApplicationEnvironment(): void {
  for (const name of managedEnvironment) {
    const value = originalEnvironment.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
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

async function loadAuthModules(): Promise<AuthModules> {
  const [nextServer, guestDataStore, portalAuthHttp, sessionModule, logoutRoute, refreshRoute] =
    await Promise.all([
      import('next/server'),
      import('@/lib/guestDataStore'),
      import('@/lib/portalAuthHttp'),
      import('@/lib/guestSession'),
      import('@/app/api/portal/logout/route'),
      import('@/app/api/portal/refresh/route'),
    ]);
  return {
    NextRequest: nextServer.NextRequest,
    guestStore: guestDataStore.guestStore,
    requestAuthContext: portalAuthHttp.requestAuthContext,
    sessionModule,
    logoutRoute,
    refreshRoute,
  };
}

async function seedThirdControlPrincipal(
  targetDatabase: DisposableDatabaseTarget,
  now: Date,
): Promise<void> {
  await withTestPrismaClient(targetDatabase, async (prisma) => {
    await prisma.user.create({
      data: {
        id: THIRD_CONTROL_FIXTURE.userId,
        email: THIRD_CONTROL_FIXTURE.email,
        phoneE164: THIRD_CONTROL_FIXTURE.phoneE164,
        countryOrigin: 'ABROAD',
      },
    });
    await prisma.booking.create({
      data: {
        id: THIRD_CONTROL_FIXTURE.bookingId,
        source: 'EXTERNAL',
        startDate: utcDateOffset(now, -1),
        endDate: utcDateOffset(now, 7),
        userId: THIRD_CONTROL_FIXTURE.userId,
        provider: THIRD_CONTROL_FIXTURE.provider,
        externalReference: THIRD_CONTROL_FIXTURE.externalReference,
        accessStatus: 'VERIFIED',
        claimedAt: now,
      },
    });
  }, 'seed');
}

function authContext(loadedModules: AuthModules): { deviceHint: string; ipHint: string } {
  return loadedModules.requestAuthContext(new loadedModules.NextRequest(REFRESH_URL, {
    method: 'POST',
    headers: REQUEST_HEADERS,
  }));
}

async function issueBoundAuthorizationChain(
  loadedModules: AuthModules,
  fixture: AuthPrincipalFixture,
): Promise<BoundAuthorizationChain> {
  const sessionToken = await loadedModules.sessionModule.issueGuestSession(
    fixture.userId,
    fixture.bookingId,
  );
  const sessionId = loadedModules.sessionModule.parseGuestSession(sessionToken)?.sid;
  if (!sessionId) throw new Error('Synthetic guest session did not expose a safe binding ID.');

  const context = authContext(loadedModules);
  const refresh = await loadedModules.guestStore.issueRefreshToken(fixture.userId, 7, {
    session_id: sessionId,
    family_id: fixture.familyId,
    device_hint: context.deviceHint,
    ip_hint: context.ipHint,
  });
  if (refresh.rec.id !== sessionId) {
    throw new Error('Synthetic refresh generation was not paired with its session.');
  }

  return { sessionId, sessionToken, refreshToken: refresh.token };
}

async function issueSessionOnly(
  loadedModules: AuthModules,
  fixture: AuthPrincipalFixture,
): Promise<{ sessionId: string; sessionToken: string }> {
  const sessionToken = await loadedModules.sessionModule.issueGuestSession(
    fixture.userId,
    fixture.bookingId,
  );
  const sessionId = loadedModules.sessionModule.parseGuestSession(sessionToken)?.sid;
  if (!sessionId) throw new Error('Synthetic session-only credential did not expose a safe ID.');
  return { sessionId, sessionToken };
}

function requestWithCookies(
  loadedModules: AuthModules,
  url: string,
  input: { sessionToken?: string; refreshToken?: string },
): InstanceType<AuthModules['NextRequest']> {
  const headers = new Headers(REQUEST_HEADERS);
  const cookies: string[] = [];
  if (input.sessionToken !== undefined) cookies.push(`guest_session=${input.sessionToken}`);
  if (input.refreshToken !== undefined) cookies.push(`guest_rt=${input.refreshToken}`);
  if (cookies.length > 0) headers.set('cookie', cookies.join('; '));
  return new loadedModules.NextRequest(url, { method: 'POST', headers });
}

async function performLogout(
  loadedModules: AuthModules,
  input: { sessionToken?: string; refreshToken?: string },
): Promise<LogoutResponse> {
  return loadedModules.logoutRoute.POST(
    requestWithCookies(loadedModules, LOGOUT_URL, input),
    { params: Promise.resolve({}) },
  );
}

async function performRefresh(
  loadedModules: AuthModules,
  input: { sessionToken?: string; refreshToken?: string },
): Promise<RefreshResponse> {
  return loadedModules.refreshRoute.POST(
    requestWithCookies(loadedModules, REFRESH_URL, input),
    { params: Promise.resolve({}) },
  );
}

function cookieClearEvidence(
  response: LogoutResponse,
  name: 'guest_session' | 'guest_rt',
): CookieClearEvidence {
  const serializedCookies = response.headers.getSetCookie();
  const cookie = serializedCookies.find((value) => value.startsWith(`${name}=`));
  const maxAge = cookie?.match(/(?:^|;\s*)Max-Age=(-?\d+)/i)?.[1];
  return {
    present: Boolean(cookie),
    cleared: Boolean(cookie?.startsWith(`${name}=;`)),
    httpOnly: Boolean(cookie && /(?:^|;\s*)HttpOnly(?:;|$)/i.test(cookie)),
    sameSiteLax: Boolean(cookie && /(?:^|;\s*)SameSite=Lax(?:;|$)/i.test(cookie)),
    rootPath: Boolean(cookie && /(?:^|;\s*)Path=\/(?:;|$)/i.test(cookie)),
    maxAge: maxAge === undefined ? null : Number.parseInt(maxAge, 10),
  };
}

async function safeLogoutEvidence(response: LogoutResponse): Promise<{
  status: number;
  body: string;
  sessionCookie: CookieClearEvidence;
  refreshCookie: CookieClearEvidence;
}> {
  return {
    status: response.status,
    body: await response.text(),
    sessionCookie: cookieClearEvidence(response, 'guest_session'),
    refreshCookie: cookieClearEvidence(response, 'guest_rt'),
  };
}

async function safeRefreshDenial(response: RefreshResponse): Promise<{
  status: number;
  body: string;
  sessionCookie: { present: boolean; cleared: boolean; maxAge: number | null };
  refreshCookie: { present: boolean; cleared: boolean; maxAge: number | null };
}> {
  const sessionCookie = response.cookies.get('guest_session');
  const refreshCookie = response.cookies.get('guest_rt');
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
  };
}

async function safeRefreshSuccess(
  response: RefreshResponse,
  sessionModule: SessionModule,
): Promise<{
  status: number;
  sessionCookieSet: boolean;
  refreshCookieSet: boolean;
  generationPaired: boolean;
  replacementSessionValid: boolean;
}> {
  const sessionCookie = response.cookies.get('guest_session')?.value;
  const refreshCookie = response.cookies.get('guest_rt')?.value;
  const parsedSession = sessionModule.parseGuestSession(sessionCookie);
  return {
    status: response.status,
    sessionCookieSet: Boolean(sessionCookie),
    refreshCookieSet: Boolean(refreshCookie),
    generationPaired: Boolean(
      parsedSession?.sid
      && refreshCookie?.split('.', 1)[0] === parsedSession.sid,
    ),
    replacementSessionValid: Boolean(
      await sessionModule.verifyGuestSessionAccess(parsedSession),
    ),
  };
}

async function safeGraphState(
  targetDatabase: DisposableDatabaseTarget,
  fixture: AuthPrincipalFixture,
): Promise<SafeGraphState> {
  return withTestPrismaClient(targetDatabase, async (prisma) => {
    const [sessions, families, tokens] = await Promise.all([
      prisma.session.findMany({
        where: { userId: fixture.userId, bookingId: fixture.bookingId },
        select: { id: true, userId: true, bookingId: true, revokedAt: true },
      }),
      prisma.refreshTokenFamily.findMany({
        where: { userId: fixture.userId },
        select: { id: true, revokedAt: true },
      }),
      prisma.refreshToken.findMany({
        where: { userId: fixture.userId },
        select: {
          id: true,
          userId: true,
          familyId: true,
          revokedAt: true,
          rotatedFromId: true,
        },
      }),
    ]);
    const sessionsById = new Map(sessions.map((session) => [session.id, session]));
    const familyIds = new Set(families.map((family) => family.id));
    const pairedGenerations = tokens.filter((token) => {
      const session = sessionsById.get(token.id);
      return Boolean(
        session
        && session.userId === token.userId
        && session.bookingId === fixture.bookingId
        && familyIds.has(token.familyId)
        && Boolean(session.revokedAt) === Boolean(token.revokedAt),
      );
    }).length;

    return {
      sessions: {
        total: sessions.length,
        active: sessions.filter((session) => !session.revokedAt).length,
        revoked: sessions.filter((session) => Boolean(session.revokedAt)).length,
      },
      families: {
        total: families.length,
        active: families.filter((family) => !family.revokedAt).length,
        revoked: families.filter((family) => Boolean(family.revokedAt)).length,
      },
      tokens: {
        total: tokens.length,
        active: tokens.filter((token) => !token.revokedAt).length,
        revoked: tokens.filter((token) => Boolean(token.revokedAt)).length,
        descendants: tokens.filter((token) => Boolean(token.rotatedFromId)).length,
      },
      pairedGenerations,
      generationPairingValid: pairedGenerations === tokens.length,
    };
  });
}

describe.sequential('portal logout authorization characterization', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'logout_characterization');
    await applyMigrationsFromEmpty(target);
    setApplicationEnvironment(target.databaseUrl);
    applicationPrisma = (await import('@/lib/prisma')).prisma;
    modules = await loadAuthModules();
  });

  afterEach(async () => {
    if (target) await resetAuthFixtures(target);
  });

  afterAll(async () => {
    try {
      await applicationPrisma?.$disconnect();
      applicationPrisma = undefined;
      modules = undefined;
    } finally {
      restoreApplicationEnvironment();
      if (target) await dropIsolatedDatabase(target);
      target = undefined;
    }
  });

  it('revokes a session-only credential, clears both cookies, and remains idempotent', async () => {
    const authTarget = requireTarget();
    const loadedModules = requireModules();
    await seedAuthEligibilityFixtures(authTarget, new Date());
    const session = await issueSessionOnly(loadedModules, REVOKED_SESSION_FIXTURE);
    const before = await safeGraphState(authTarget, REVOKED_SESSION_FIXTURE);

    const firstLogout = await safeLogoutEvidence(await performLogout(loadedModules, {
      sessionToken: session.sessionToken,
    }));
    const afterFirst = await safeGraphState(authTarget, REVOKED_SESSION_FIXTURE);
    const repeatedLogout = await safeLogoutEvidence(await performLogout(loadedModules, {
      sessionToken: session.sessionToken,
    }));
    const refreshDenial = await safeRefreshDenial(await performRefresh(loadedModules, {
      sessionToken: session.sessionToken,
    }));
    const finalState = await safeGraphState(authTarget, REVOKED_SESSION_FIXTURE);

    expect(before).toEqual({
      sessions: { total: 1, active: 1, revoked: 0 },
      families: { total: 0, active: 0, revoked: 0 },
      tokens: { total: 0, active: 0, revoked: 0, descendants: 0 },
      pairedGenerations: 0,
      generationPairingValid: true,
    });
    expect(firstLogout).toEqual(EXPECTED_LOGOUT);
    expect(afterFirst).toEqual({
      sessions: { total: 1, active: 0, revoked: 1 },
      families: { total: 0, active: 0, revoked: 0 },
      tokens: { total: 0, active: 0, revoked: 0, descendants: 0 },
      pairedGenerations: 0,
      generationPairingValid: true,
    });
    expect(repeatedLogout).toEqual(EXPECTED_LOGOUT);
    expect(refreshDenial).toEqual(EXPECTED_REFRESH_DENIAL);
    expect(finalState).toEqual(afterFirst);
  });

  it('revokes a matching session and refresh family without affecting an independent family', async () => {
    const authTarget = requireTarget();
    const loadedModules = requireModules();
    await seedAuthEligibilityFixtures(authTarget, new Date(), { includeIsolatedPrincipal: true });
    const primary = await issueBoundAuthorizationChain(loadedModules, REVOKED_SESSION_FIXTURE);
    await issueBoundAuthorizationChain(loadedModules, ISOLATED_AUTH_FIXTURE);
    const isolatedBefore = await safeGraphState(authTarget, ISOLATED_AUTH_FIXTURE);

    const logout = await safeLogoutEvidence(await performLogout(loadedModules, {
      sessionToken: primary.sessionToken,
      refreshToken: primary.refreshToken,
    }));
    const primaryAfter = await safeGraphState(authTarget, REVOKED_SESSION_FIXTURE);
    const isolatedAfter = await safeGraphState(authTarget, ISOLATED_AUTH_FIXTURE);
    const refreshDenial = await safeRefreshDenial(await performRefresh(loadedModules, {
      sessionToken: primary.sessionToken,
      refreshToken: primary.refreshToken,
    }));
    const primaryFinal = await safeGraphState(authTarget, REVOKED_SESSION_FIXTURE);

    expect(logout).toEqual(EXPECTED_LOGOUT);
    expect(primaryAfter).toEqual(REVOKED_BOUND_GRAPH);
    expect(isolatedBefore).toEqual(ACTIVE_BOUND_GRAPH);
    expect(isolatedAfter).toEqual(isolatedBefore);
    expect(refreshDenial).toEqual(EXPECTED_REFRESH_DENIAL);
    expect(primaryFinal).toEqual(primaryAfter);
  });

  it('treats malformed cookies as an idempotent logout without touching valid graphs', async () => {
    const authTarget = requireTarget();
    const loadedModules = requireModules();
    await seedAuthEligibilityFixtures(authTarget, new Date(), { includeIsolatedPrincipal: true });
    await issueBoundAuthorizationChain(loadedModules, REVOKED_SESSION_FIXTURE);
    await issueBoundAuthorizationChain(loadedModules, ISOLATED_AUTH_FIXTURE);
    const primaryBefore = await safeGraphState(authTarget, REVOKED_SESSION_FIXTURE);
    const isolatedBefore = await safeGraphState(authTarget, ISOLATED_AUTH_FIXTURE);

    const logout = await safeLogoutEvidence(await performLogout(loadedModules, {
      sessionToken: 'synthetic-malformed-session-cookie',
      refreshToken: 'synthetic-malformed-refresh-cookie',
    }));
    const malformedRefresh = await safeRefreshDenial(await performRefresh(loadedModules, {
      sessionToken: 'synthetic-malformed-session-cookie',
      refreshToken: 'synthetic-malformed-refresh-cookie',
    }));
    const primaryAfter = await safeGraphState(authTarget, REVOKED_SESSION_FIXTURE);
    const isolatedAfter = await safeGraphState(authTarget, ISOLATED_AUTH_FIXTURE);

    expect(logout).toEqual(EXPECTED_LOGOUT);
    expect(malformedRefresh).toEqual(EXPECTED_REFRESH_DENIAL);
    expect(primaryBefore).toEqual(ACTIVE_BOUND_GRAPH);
    expect(isolatedBefore).toEqual(ACTIVE_BOUND_GRAPH);
    expect(primaryAfter).toEqual(primaryBefore);
    expect(isolatedAfter).toEqual(isolatedBefore);
  });

  it('keeps logout of an already revoked authorization graph state-idempotent', async () => {
    const authTarget = requireTarget();
    const loadedModules = requireModules();
    await seedAuthEligibilityFixtures(authTarget, new Date(), { includeIsolatedPrincipal: true });
    const primary = await issueBoundAuthorizationChain(loadedModules, REVOKED_SESSION_FIXTURE);
    await issueBoundAuthorizationChain(loadedModules, ISOLATED_AUTH_FIXTURE);
    await expect(loadedModules.guestStore.revokeRefreshFamily(primary.refreshToken)).resolves.toBe(true);
    const stablePrimary = await safeGraphState(authTarget, REVOKED_SESSION_FIXTURE);
    const stableIsolated = await safeGraphState(authTarget, ISOLATED_AUTH_FIXTURE);

    const logout = await safeLogoutEvidence(await performLogout(loadedModules, {
      sessionToken: primary.sessionToken,
      refreshToken: primary.refreshToken,
    }));
    const refreshDenial = await safeRefreshDenial(await performRefresh(loadedModules, {
      sessionToken: primary.sessionToken,
      refreshToken: primary.refreshToken,
    }));
    const primaryAfter = await safeGraphState(authTarget, REVOKED_SESSION_FIXTURE);
    const isolatedAfter = await safeGraphState(authTarget, ISOLATED_AUTH_FIXTURE);

    expect(stablePrimary).toEqual(REVOKED_BOUND_GRAPH);
    expect(stableIsolated).toEqual(ACTIVE_BOUND_GRAPH);
    expect(logout).toEqual(EXPECTED_LOGOUT);
    expect(refreshDenial).toEqual(EXPECTED_REFRESH_DENIAL);
    expect(primaryAfter).toEqual(stablePrimary);
    expect(isolatedAfter).toEqual(stableIsolated);
  });

  it('revokes both mismatched valid graphs while preserving a third control family', async () => {
    const authTarget = requireTarget();
    const loadedModules = requireModules();
    const now = new Date();
    await seedAuthEligibilityFixtures(authTarget, now, { includeIsolatedPrincipal: true });
    await seedThirdControlPrincipal(authTarget, now);
    const primary = await issueBoundAuthorizationChain(loadedModules, REVOKED_SESSION_FIXTURE);
    const mismatchedRefresh = await issueBoundAuthorizationChain(
      loadedModules,
      ISOLATED_AUTH_FIXTURE,
    );
    const control = await issueBoundAuthorizationChain(loadedModules, THIRD_CONTROL_FIXTURE);
    const controlBefore = await safeGraphState(authTarget, THIRD_CONTROL_FIXTURE);

    const logout = await safeLogoutEvidence(await performLogout(loadedModules, {
      sessionToken: primary.sessionToken,
      refreshToken: mismatchedRefresh.refreshToken,
    }));
    const primaryAfter = await safeGraphState(authTarget, REVOKED_SESSION_FIXTURE);
    const mismatchedAfter = await safeGraphState(authTarget, ISOLATED_AUTH_FIXTURE);
    const controlAfter = await safeGraphState(authTarget, THIRD_CONTROL_FIXTURE);
    const primaryDenial = await safeRefreshDenial(await performRefresh(loadedModules, {
      sessionToken: primary.sessionToken,
      refreshToken: primary.refreshToken,
    }));
    const mismatchedDenial = await safeRefreshDenial(await performRefresh(loadedModules, {
      sessionToken: mismatchedRefresh.sessionToken,
      refreshToken: mismatchedRefresh.refreshToken,
    }));
    const controlRefreshResponse = await performRefresh(loadedModules, {
      sessionToken: control.sessionToken,
      refreshToken: control.refreshToken,
    });
    const controlRefresh = await safeRefreshSuccess(
      controlRefreshResponse,
      loadedModules.sessionModule,
    );
    const controlFinal = await safeGraphState(authTarget, THIRD_CONTROL_FIXTURE);

    expect(logout).toEqual(EXPECTED_LOGOUT);
    expect(primaryAfter).toEqual(REVOKED_BOUND_GRAPH);
    expect(mismatchedAfter).toEqual(REVOKED_BOUND_GRAPH);
    expect(controlBefore).toEqual(ACTIVE_BOUND_GRAPH);
    expect(controlAfter).toEqual(controlBefore);
    expect(primaryDenial).toEqual(EXPECTED_REFRESH_DENIAL);
    expect(mismatchedDenial).toEqual(EXPECTED_REFRESH_DENIAL);
    expect(controlRefresh).toEqual({
      status: 200,
      sessionCookieSet: true,
      refreshCookieSet: true,
      generationPaired: true,
      replacementSessionValid: true,
    });
    expect(controlFinal).toEqual({
      sessions: { total: 2, active: 1, revoked: 1 },
      families: { total: 1, active: 1, revoked: 0 },
      tokens: { total: 2, active: 1, revoked: 1, descendants: 1 },
      pairedGenerations: 2,
      generationPairingValid: true,
    });
  });

  it('keeps repeated matching logout responses and database state idempotent', async () => {
    const authTarget = requireTarget();
    const loadedModules = requireModules();
    await seedAuthEligibilityFixtures(authTarget, new Date(), { includeIsolatedPrincipal: true });
    const primary = await issueBoundAuthorizationChain(loadedModules, REVOKED_SESSION_FIXTURE);
    await issueBoundAuthorizationChain(loadedModules, ISOLATED_AUTH_FIXTURE);

    const first = await safeLogoutEvidence(await performLogout(loadedModules, {
      sessionToken: primary.sessionToken,
      refreshToken: primary.refreshToken,
    }));
    const stablePrimary = await safeGraphState(authTarget, REVOKED_SESSION_FIXTURE);
    const stableIsolated = await safeGraphState(authTarget, ISOLATED_AUTH_FIXTURE);
    const second = await safeLogoutEvidence(await performLogout(loadedModules, {
      sessionToken: primary.sessionToken,
      refreshToken: primary.refreshToken,
    }));
    const primaryAfterRepeat = await safeGraphState(authTarget, REVOKED_SESSION_FIXTURE);
    const isolatedAfterRepeat = await safeGraphState(authTarget, ISOLATED_AUTH_FIXTURE);
    const refreshDenial = await safeRefreshDenial(await performRefresh(loadedModules, {
      sessionToken: primary.sessionToken,
      refreshToken: primary.refreshToken,
    }));
    const primaryFinal = await safeGraphState(authTarget, REVOKED_SESSION_FIXTURE);

    expect(first).toEqual(EXPECTED_LOGOUT);
    expect(second).toEqual(EXPECTED_LOGOUT);
    expect(stablePrimary).toEqual(REVOKED_BOUND_GRAPH);
    expect(stableIsolated).toEqual(ACTIVE_BOUND_GRAPH);
    expect(primaryAfterRepeat).toEqual(stablePrimary);
    expect(isolatedAfterRepeat).toEqual(stableIsolated);
    expect(refreshDenial).toEqual(EXPECTED_REFRESH_DENIAL);
    expect(primaryFinal).toEqual(stablePrimary);
  });
});
