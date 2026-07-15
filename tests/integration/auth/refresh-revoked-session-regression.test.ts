import jwt from 'jsonwebtoken';
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
const DIFFERENT_CONTEXT_HEADERS = {
  'user-agent': 'pr02d-suspicious-refresh-client',
  'x-forwarded-for': '203.0.113.99',
} as const;
const CONTROLLED_REPLAY_NOW = new Date('2030-06-15T12:34:56.789Z');
const DATABASE_WAIT_TIMEOUT_MS = 4_000;
const RESPONSE_WAIT_TIMEOUT_MS = 4_000;

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

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

interface LockActivity {
  pid: number;
  waitEventType: string | null;
  waitEvent: string | null;
  query: string;
  blockingPids: number[];
}

let target: DisposableDatabaseTarget | undefined;
let applicationPrisma: PrismaClient | undefined;
let databaseReady = false;
const originalEnvironment = new Map<ManagedEnvironmentName, string | undefined>();

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function withBoundedWait<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Timed out waiting for ${label}.`));
        }, RESPONSE_WAIT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitForDatabaseLock(
  monitor: PrismaClient,
  predicate: (activity: LockActivity) => boolean,
  label: string,
): Promise<LockActivity> {
  const deadline = performance.now() + DATABASE_WAIT_TIMEOUT_MS;
  while (performance.now() < deadline) {
    const rows = await monitor.$queryRaw<LockActivity[]>`
      SELECT
        activity."pid" AS "pid",
        activity."wait_event_type" AS "waitEventType",
        activity."wait_event" AS "waitEvent",
        activity."query" AS "query",
        pg_blocking_pids(activity."pid") AS "blockingPids"
      FROM "pg_stat_activity" AS activity
      WHERE activity."datname" = current_database()
        AND activity."pid" <> pg_backend_pid()
        AND activity."state" = 'active'
    `;
    const match = rows.find((row) => row.waitEventType === 'Lock' && predicate(row));
    if (match) return match;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for the database-observed ${label} barrier.`);
}

async function advisoryLocksHeld(monitor: PrismaClient, pid: number): Promise<number> {
  const rows = await monitor.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS "count"
    FROM "pg_locks"
    WHERE "pid" = ${pid}
      AND "locktype" = 'advisory'
      AND "granted" = TRUE
  `;
  return rows[0]?.count ?? 0;
}

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

function authContext(
  modules: AuthModules,
  requestHeaders: HeadersInit = REQUEST_HEADERS,
): { deviceHint: string; ipHint: string } {
  const request = new modules.NextRequest(REFRESH_URL, {
    method: 'POST',
    headers: requestHeaders,
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
  requestHeaders: HeadersInit = REQUEST_HEADERS,
): InstanceType<AuthModules['NextRequest']> {
  const headers = new Headers(requestHeaders);
  const cookies = [`guest_rt=${refreshToken}`];
  if (sessionToken !== undefined) cookies.unshift(`guest_session=${sessionToken}`);
  headers.set('cookie', cookies.join('; '));
  return new modules.NextRequest(REFRESH_URL, { method: 'POST', headers });
}

async function performRefresh(
  modules: AuthModules,
  refreshToken: string,
  sessionToken?: string,
  requestHeaders: HeadersInit = REQUEST_HEADERS,
): Promise<RefreshResponse> {
  return modules.refreshRoute.POST(
    refreshRequest(modules, refreshToken, sessionToken, requestHeaders),
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

async function safeConcurrentEvidence(response: RefreshResponse): Promise<{
  status: number;
  retryAfter: string | null;
  errorCode: string | null;
  retryable: boolean;
  sessionCookiePresent: boolean;
  refreshCookiePresent: boolean;
}> {
  const body = JSON.parse(await response.text()) as {
    error?: { code?: string; details?: { retryable?: boolean } };
  };
  return {
    status: response.status,
    retryAfter: response.headers.get('retry-after'),
    errorCode: body.error?.code ?? null,
    retryable: body.error?.details?.retryable === true,
    sessionCookiePresent: Boolean(response.cookies.get('guest_session')),
    refreshCookiePresent: Boolean(response.cookies.get('guest_rt')),
  };
}

function safeIssuedCookieEvidence(
  response: RefreshResponse,
  sessionModule: SessionModule,
): {
  status: number;
  sessionCookieSet: boolean;
  refreshCookieSet: boolean;
  generationPaired: boolean;
} {
  const sessionCookie = response.cookies.get('guest_session')?.value;
  const refreshCookie = response.cookies.get('guest_rt')?.value;
  const sessionId = sessionModule.parseGuestSession(sessionCookie)?.sid;
  const refreshId = refreshCookie?.split('.', 1)[0];
  return {
    status: response.status,
    sessionCookieSet: Boolean(sessionCookie),
    refreshCookieSet: Boolean(refreshCookie),
    generationPaired: Boolean(sessionId && refreshId && sessionId === refreshId),
  };
}

async function executeRouteOverlap(
  authTarget: DisposableDatabaseTarget,
  modules: AuthModules,
  chain: BoundAuthorizationChain,
  mode: 'same-context' | 'different-context' | 'invalid-binding',
): Promise<{
  winnerResponse: RefreshResponse;
  loserResponse: RefreshResponse;
  markerLocksObserved: number;
  stateWhileWinnerBlocked: Awaited<ReturnType<typeof safeAuthStateSnapshot>>;
}> {
  return withTestPrismaClient(authTarget, async (blocker) => (
    withTestPrismaClient(authTarget, async (monitor) => {
      const blockerReady = createDeferred<number>();
      const releaseBlocker = createDeferred<void>();
      let winnerPromise: Promise<RefreshResponse> | undefined;
      let loserPromise: Promise<RefreshResponse> | undefined;

      const blockerPromise = blocker.$transaction(async (tx) => {
        const backendRows = await tx.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid() AS "pid"
        `;
        const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "users"
          WHERE "id" = ${REVOKED_SESSION_FIXTURE.userId}::uuid
          FOR UPDATE
        `;
        if (backendRows.length !== 1 || lockedRows.length !== 1) {
          throw new Error('Synthetic route-overlap blocker did not lock exactly one user.');
        }
        blockerReady.resolve(backendRows[0].pid);
        await releaseBlocker.promise;
      }, { timeout: 10_000 });
      void blockerPromise.catch((error: unknown) => blockerReady.reject(error));

      try {
        const blockerPid = await blockerReady.promise;
        winnerPromise = performRefresh(modules, chain.refreshToken, chain.sessionToken);
        void winnerPromise.catch(() => undefined);
        const winnerWait = await waitForDatabaseLock(
          monitor,
          (activity) => activity.blockingPids.includes(blockerPid)
            && activity.query.includes('"users"')
            && /FOR\s+UPDATE/i.test(activity.query),
          'winner User-row',
        );
        const markerLocksObserved = await advisoryLocksHeld(monitor, winnerWait.pid);
        if (markerLocksObserved < 1) {
          throw new Error('Winner reached the User row without owning a generation marker.');
        }

        loserPromise = performRefresh(
          modules,
          chain.refreshToken,
          mode === 'invalid-binding' ? 'synthetic-malformed-session-cookie' : chain.sessionToken,
          mode === 'different-context' ? DIFFERENT_CONTEXT_HEADERS : REQUEST_HEADERS,
        );
        void loserPromise.catch(() => undefined);

        const stateWhileWinnerBlocked = await safeAuthStateSnapshot(authTarget, new Date());
        let loserResponse: RefreshResponse;
        if (mode !== 'same-context') {
          await waitForDatabaseLock(
            monitor,
            (activity) => activity.pid !== winnerWait.pid
              && (activity.blockingPids.includes(blockerPid)
                || activity.blockingPids.includes(winnerWait.pid))
              && activity.query.includes('"users"')
              && /FOR\s+UPDATE/i.test(activity.query),
            'unapproved contender User-row cleanup',
          );
          releaseBlocker.resolve(undefined);
          [loserResponse] = await Promise.all([
            withBoundedWait(loserPromise, 'unapproved loser response'),
            withBoundedWait(winnerPromise, 'approved winner response'),
          ]);
        } else {
          loserResponse = await withBoundedWait(loserPromise, 'same-context loser response');
          releaseBlocker.resolve(undefined);
        }

        const winnerResponse = await withBoundedWait(winnerPromise, 'winner response');
        await blockerPromise;
        return {
          winnerResponse,
          loserResponse,
          markerLocksObserved,
          stateWhileWinnerBlocked,
        };
      } finally {
        releaseBlocker.resolve(undefined);
        await Promise.allSettled([
          blockerPromise,
          ...(winnerPromise ? [winnerPromise] : []),
          ...(loserPromise ? [loserPromise] : []),
        ]);
      }
    })
  ));
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

  it('revokes the family when a predecessor is replayed after its rotation completed', async () => {
    const authTarget = requireTarget();
    await seedRevokedSessionEligibilityFixture(authTarget, new Date());
    const modules = await loadAuthModules();
    const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);

    const rotationResponse = await performRefresh(
      modules,
      chain.refreshToken,
      chain.sessionToken,
    );
    const rotation = await safeSuccessEvidence(rotationResponse, modules.sessionModule);
    const rotationBody = await rotationResponse.text();
    const beforeReplay = await safeAuthStateSnapshot(authTarget, new Date());

    const replayResponse = await performRefresh(
      modules,
      chain.refreshToken,
      chain.sessionToken,
    );
    const replay = await safeFailureEvidence(replayResponse, modules.sessionModule);
    const afterReplay = await safeAuthStateSnapshot(authTarget, new Date());

    expect(rotationBody).not.toContain(chain.refreshToken);
    expect({ rotation, beforeReplay, replay, afterReplay }).toEqual({
      rotation: {
        status: 200,
        sessionCookieSet: true,
        refreshCookieSet: true,
        replacementSessionValid: true,
      },
      beforeReplay: {
        users: 1,
        bookings: 1,
        sessions: { total: 2, active: 1, expired: 0, revoked: 1 },
        refreshFamilies: { total: 1, active: 1, expired: 0, revoked: 0 },
        refreshTokens: {
          total: 2,
          active: 1,
          expired: 0,
          revoked: 1,
          descendants: 1,
          activeDescendants: 1,
        },
      },
      replay: EXPECTED_UNAUTHORIZED,
      afterReplay: {
        users: 1,
        bookings: 1,
        sessions: { total: 2, active: 0, expired: 0, revoked: 2 },
        refreshFamilies: { total: 1, active: 0, expired: 0, revoked: 1 },
        refreshTokens: {
          total: 2,
          active: 0,
          expired: 0,
          revoked: 2,
          descendants: 1,
          activeDescendants: 0,
        },
      },
    });
  });

  it.each([
    ['immediately after commit', 0],
    ['inside the former grace window', 4_999],
    ['at the former grace boundary', 5_000],
    ['after the former grace window', 5_001],
  ])('classifies completed replay %s without using revokedAt age', async (_label, ageMs) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(CONTROLLED_REPLAY_NOW);
    try {
      const authTarget = requireTarget();
      await seedRevokedSessionEligibilityFixture(authTarget, new Date());
      const modules = await loadAuthModules();
      const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);
      const rotationResponse = await performRefresh(
        modules,
        chain.refreshToken,
        chain.sessionToken,
      );
      const rotation = await safeSuccessEvidence(rotationResponse, modules.sessionModule);
      await withTestPrismaClient(authTarget, async (prisma) => {
        await prisma.refreshToken.update({
          where: { id: chain.sessionId },
          data: { revokedAt: new Date(CONTROLLED_REPLAY_NOW.getTime() - ageMs) },
        });
      }, 'failure-fixture');

      const replayResponse = await performRefresh(
        modules,
        chain.refreshToken,
        chain.sessionToken,
      );
      const replay = await safeFailureEvidence(replayResponse, modules.sessionModule);
      const afterReplay = await safeAuthStateSnapshot(authTarget, new Date());

      expect({ rotation, replay, afterReplay }).toEqual({
        rotation: {
          status: 200,
          sessionCookieSet: true,
          refreshCookieSet: true,
          replacementSessionValid: true,
        },
        replay: EXPECTED_UNAUTHORIZED,
        afterReplay: {
          users: 1,
          bookings: 1,
          sessions: { total: 2, active: 0, expired: 0, revoked: 2 },
          refreshFamilies: { total: 1, active: 0, expired: 0, revoked: 1 },
          refreshTokens: {
            total: 2,
            active: 0,
            expired: 0,
            revoked: 2,
            descendants: 1,
            activeDescendants: 0,
          },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns 200 plus cookie-free 409 only for database-observed same-context overlap', async () => {
    const authTarget = requireTarget();
    await seedRevokedSessionEligibilityFixture(authTarget, new Date());
    const modules = await loadAuthModules();
    const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);

    const overlap = await executeRouteOverlap(authTarget, modules, chain, 'same-context');
    const winner = safeIssuedCookieEvidence(overlap.winnerResponse, modules.sessionModule);
    const loser = await safeConcurrentEvidence(overlap.loserResponse);
    const winnerRefresh = overlap.winnerResponse.cookies.get('guest_rt')?.value;
    const winnerRefreshValid = Boolean(
      winnerRefresh && await modules.guestStore.verifyRefreshToken(winnerRefresh),
    );
    const after = await safeAuthStateSnapshot(authTarget, new Date());

    expect({
      markerObserved: overlap.markerLocksObserved > 0,
      whileBlocked: overlap.stateWhileWinnerBlocked,
      winner,
      loser,
      winnerRefreshValid,
      after,
    }).toEqual({
      markerObserved: true,
      whileBlocked: {
        users: 1,
        bookings: 1,
        sessions: { total: 1, active: 1, expired: 0, revoked: 0 },
        refreshFamilies: { total: 1, active: 1, expired: 0, revoked: 0 },
        refreshTokens: {
          total: 1,
          active: 1,
          expired: 0,
          revoked: 0,
          descendants: 0,
          activeDescendants: 0,
        },
      },
      winner: {
        status: 200,
        sessionCookieSet: true,
        refreshCookieSet: true,
        generationPaired: true,
      },
      loser: {
        status: 409,
        retryAfter: '1',
        errorCode: 'REFRESH_IN_PROGRESS',
        retryable: true,
        sessionCookiePresent: false,
        refreshCookiePresent: false,
      },
      winnerRefreshValid: true,
      after: {
        users: 1,
        bookings: 1,
        sessions: { total: 2, active: 1, expired: 0, revoked: 1 },
        refreshFamilies: { total: 1, active: 1, expired: 0, revoked: 0 },
        refreshTokens: {
          total: 2,
          active: 1,
          expired: 0,
          revoked: 1,
          descendants: 1,
          activeDescendants: 1,
        },
      },
    });
  });

  it('waits out a different-context overlap, revokes the winner graph, and returns 401', async () => {
    const authTarget = requireTarget();
    await seedRevokedSessionEligibilityFixture(authTarget, new Date());
    const modules = await loadAuthModules();
    const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);

    const overlap = await executeRouteOverlap(authTarget, modules, chain, 'different-context');
    const winner = safeIssuedCookieEvidence(overlap.winnerResponse, modules.sessionModule);
    const loser = await safeFailureEvidence(overlap.loserResponse, modules.sessionModule);
    const winnerSession = modules.sessionModule.parseGuestSession(
      overlap.winnerResponse.cookies.get('guest_session')?.value,
    );
    const winnerRefresh = overlap.winnerResponse.cookies.get('guest_rt')?.value;
    const winnerCredentialsValidAfter = {
      session: Boolean(await modules.sessionModule.verifyGuestSessionAccess(winnerSession)),
      refresh: Boolean(winnerRefresh && await modules.guestStore.verifyRefreshToken(winnerRefresh)),
    };
    const after = await safeAuthStateSnapshot(authTarget, new Date());

    expect({ winner, loser, winnerCredentialsValidAfter, after }).toEqual({
      winner: {
        status: 200,
        sessionCookieSet: true,
        refreshCookieSet: true,
        generationPaired: true,
      },
      loser: EXPECTED_UNAUTHORIZED,
      winnerCredentialsValidAfter: { session: false, refresh: false },
      after: {
        users: 1,
        bookings: 1,
        sessions: { total: 2, active: 0, expired: 0, revoked: 2 },
        refreshFamilies: { total: 1, active: 0, expired: 0, revoked: 1 },
        refreshTokens: {
          total: 2,
          active: 0,
          expired: 0,
          revoked: 2,
          descendants: 1,
          activeDescendants: 0,
        },
      },
    });
  });

  it('rejects same-context overlap with an invalid session binding instead of returning 409', async () => {
    const authTarget = requireTarget();
    await seedRevokedSessionEligibilityFixture(authTarget, new Date());
    const modules = await loadAuthModules();
    const chain = await issueBoundAuthorizationChain(modules, REVOKED_SESSION_FIXTURE);

    const overlap = await executeRouteOverlap(authTarget, modules, chain, 'invalid-binding');
    const winner = safeIssuedCookieEvidence(overlap.winnerResponse, modules.sessionModule);
    const loser = await safeFailureEvidence(overlap.loserResponse, modules.sessionModule);
    const winnerSession = modules.sessionModule.parseGuestSession(
      overlap.winnerResponse.cookies.get('guest_session')?.value,
    );
    const winnerRefresh = overlap.winnerResponse.cookies.get('guest_rt')?.value;
    const winnerCredentialsValidAfter = {
      session: Boolean(await modules.sessionModule.verifyGuestSessionAccess(winnerSession)),
      refresh: Boolean(winnerRefresh && await modules.guestStore.verifyRefreshToken(winnerRefresh)),
    };
    const after = await safeAuthStateSnapshot(authTarget, new Date());

    expect({ winner, loser, winnerCredentialsValidAfter, after }).toEqual({
      winner: {
        status: 200,
        sessionCookieSet: true,
        refreshCookieSet: true,
        generationPaired: true,
      },
      loser: EXPECTED_UNAUTHORIZED,
      winnerCredentialsValidAfter: { session: false, refresh: false },
      after: {
        users: 1,
        bookings: 1,
        sessions: { total: 2, active: 0, expired: 0, revoked: 2 },
        refreshFamilies: { total: 1, active: 0, expired: 0, revoked: 1 },
        refreshTokens: {
          total: 2,
          active: 0,
          expired: 0,
          revoked: 2,
          descendants: 1,
          activeDescendants: 0,
        },
      },
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
