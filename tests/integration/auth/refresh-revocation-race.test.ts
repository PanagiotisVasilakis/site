import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';
import type {
  createRefreshTokenRepository as CreateRefreshTokenRepository,
} from '@/lib/prisma-repositories/refreshTokenRepository';

import type { DisposableDatabaseTarget } from '../support/database-safety';
import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
} from '../support/database-lifecycle';
import { withTestPrismaClient } from '../support/fixtures';
import { applyMigrationsFromEmpty } from '../support/migrations';
import { readDisposablePostgresRuntime } from '../support/runtime';

type RefreshTokenRepository = ReturnType<typeof CreateRefreshTokenRepository>;
type RotationResult = Awaited<ReturnType<RefreshTokenRepository['rotate']>>;
type RaceOrdering = 'revoke-first' | 'refresh-first';

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

interface RaceState {
  familyRevoked: boolean;
  familyReason: string | null;
  tokenCount: number;
  activeTokenCount: number;
  revokedTokenCount: number;
  descendantCount: number;
  sessionCount: number;
  activeSessionCount: number;
  revokedSessionCount: number;
  rootUsable: boolean;
  replacementUsable: boolean;
}

interface RaceResult {
  revocationResult: boolean;
  rotationResult: RotationResult;
  state: RaceState;
}

const runtime = readDisposablePostgresRuntime();
const REPETITIONS = 5;
const DATABASE_WAIT_TIMEOUT_MS = 4_000;
const TEST_SECURITY_PEPPER = 'pr02a-race-integration-security-pepper-only';
const ROOT_SECRET = 'pr02a-synthetic-root-refresh-secret';
const REPLACEMENT_SECRET = 'pr02a-synthetic-replacement-refresh-secret';
const ROOT_SALT = '10101010101010101010101010101010';
const REPLACEMENT_SALT = '20202020202020202020202020202020';
const USER_ID = '12000000-0000-4000-8000-000000000001';
const BOOKING_ID = '22000000-0000-4000-8000-000000000001';
const ROOT_CREDENTIAL_ID = '32000000-0000-4000-8000-000000000001';
const REPLACEMENT_CREDENTIAL_ID = '32000000-0000-4000-8000-000000000002';
const FAMILY_ID = 'pr02a-revocation-race-family';
const DEVICE_HASH = '3'.repeat(64);
const IP_HASH = '4'.repeat(64);

let originalSecurityPepper: string | undefined;

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function hashSecret(secret: string, salt: string): string {
  return createHash('sha256')
    .update(`${TEST_SECURITY_PEPPER}:${salt}:${secret}`)
    .digest('hex');
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

async function seedBoundAuthorizationChain(
  target: DisposableDatabaseTarget,
  now: Date,
): Promise<void> {
  await withTestPrismaClient(target, async (client) => {
    await client.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: USER_ID,
          email: 'revocation-race-guest@example.invalid',
          phoneE164: '+12025550201',
          countryOrigin: 'ABROAD',
        },
      });
      await tx.booking.create({
        data: {
          id: BOOKING_ID,
          source: 'EXTERNAL',
          startDate: utcDateOffset(now, -1),
          endDate: utcDateOffset(now, 7),
          userId: USER_ID,
          provider: 'integration-auth-race',
          externalReference: 'revocation-race-booking',
          accessStatus: 'VERIFIED',
          claimedAt: now,
        },
      });
      await tx.session.create({
        data: {
          id: ROOT_CREDENTIAL_ID,
          userId: USER_ID,
          bookingId: BOOKING_ID,
          expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
        },
      });
      await tx.refreshTokenFamily.create({
        data: {
          id: FAMILY_ID,
          userId: USER_ID,
          absoluteExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
          deviceHash: DEVICE_HASH,
          ipHash: IP_HASH,
        },
      });
      await tx.refreshToken.create({
        data: {
          id: ROOT_CREDENTIAL_ID,
          userId: USER_ID,
          tokenHash: hashSecret(ROOT_SECRET, ROOT_SALT),
          salt: ROOT_SALT,
          familyId: FAMILY_ID,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
          deviceHint: DEVICE_HASH,
          ipHint: IP_HASH,
        },
      });
    });
  }, 'seed');
}

async function waitForDatabaseLock(
  monitor: PrismaClient,
  expectedRelation: 'users' | 'refresh_token_families',
  blockedByPid: number,
  label: string,
): Promise<LockActivity> {
  const deadline = Date.now() + DATABASE_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
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
    const match = rows.find((row) => row.waitEventType === 'Lock'
      && row.blockingPids.includes(blockedByPid)
      && row.query.includes(`"${expectedRelation}"`)
      && /FOR\s+UPDATE/i.test(row.query));
    if (match) return match;

    // Yield the event loop only; progress is determined by PostgreSQL lock state.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for the database-observable ${label} lock barrier.`);
}

async function readRaceState(
  client: PrismaClient,
  repository: RefreshTokenRepository,
): Promise<RaceState> {
  const [family, tokens, sessions, rootVerification, replacementVerification] = await Promise.all([
    client.refreshTokenFamily.findUnique({ where: { id: FAMILY_ID } }),
    client.refreshToken.findMany({
      where: { familyId: FAMILY_ID },
      orderBy: { createdAt: 'asc' },
    }),
    client.session.findMany({
      where: { id: { in: [ROOT_CREDENTIAL_ID, REPLACEMENT_CREDENTIAL_ID] } },
      orderBy: { createdAt: 'asc' },
    }),
    repository.verify(`${ROOT_CREDENTIAL_ID}.${ROOT_SECRET}`),
    repository.verify(`${REPLACEMENT_CREDENTIAL_ID}.${REPLACEMENT_SECRET}`),
  ]);

  return {
    familyRevoked: Boolean(family?.revokedAt),
    familyReason: family?.revocationReason ?? null,
    tokenCount: tokens.length,
    activeTokenCount: tokens.filter((token) => !token.revokedAt).length,
    revokedTokenCount: tokens.filter((token) => Boolean(token.revokedAt)).length,
    descendantCount: tokens.filter((token) => Boolean(token.rotatedFromId)).length,
    sessionCount: sessions.length,
    activeSessionCount: sessions.filter((session) => !session.revokedAt).length,
    revokedSessionCount: sessions.filter((session) => Boolean(session.revokedAt)).length,
    rootUsable: Boolean(rootVerification),
    replacementUsable: Boolean(replacementVerification),
  };
}

async function executeRace(
  target: DisposableDatabaseTarget,
  ordering: RaceOrdering,
  now: Date,
): Promise<RaceResult> {
  const { createRefreshTokenRepository } = await import(
    '@/lib/prisma-repositories/refreshTokenRepository'
  );

  return withTestPrismaClient(target, async (refreshClient) => (
    withTestPrismaClient(target, async (revokeClient) => (
      withTestPrismaClient(target, async (blockerAndMonitorClient) => {
        const refreshRepository = createRefreshTokenRepository(refreshClient);
        const revokeRepository = createRefreshTokenRepository(revokeClient);
        const blockerReady = createDeferred<number>();
        const releaseBlocker = createDeferred<void>();
        let rotationPromise: Promise<RotationResult> | undefined;
        let revocationPromise: Promise<boolean> | undefined;

        const blockerPromise = blockerAndMonitorClient.$transaction(async (tx) => {
          const backendRows = await tx.$queryRaw<Array<{ pid: number }>>`
            SELECT pg_backend_pid() AS "pid"
          `;
          const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "refresh_token_families"
            WHERE "id" = ${FAMILY_ID}
            FOR UPDATE
          `;
          if (backendRows.length !== 1 || lockedRows.length !== 1) {
            throw new Error('Synthetic family-lock blocker did not lock exactly one family.');
          }
          blockerReady.resolve(backendRows[0].pid);
          await releaseBlocker.promise;
        }, { timeout: 10_000 });
        void blockerPromise.catch((error: unknown) => blockerReady.reject(error));

        try {
          const blockerPid = await blockerReady.promise;
          const replacement = {
            id: REPLACEMENT_CREDENTIAL_ID,
            tokenHash: hashSecret(REPLACEMENT_SECRET, REPLACEMENT_SALT),
            salt: REPLACEMENT_SALT,
            tokenExpiresAt: now.getTime() + 7 * 24 * 60 * 60 * 1_000,
            sessionExpiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
            deviceHash: DEVICE_HASH,
            ipHash: IP_HASH,
            presentedSession: { status: 'missing' as const },
            createSessionToken: () => 'synthetic-race-session-token',
          };

          if (ordering === 'revoke-first') {
            revocationPromise = revokeRepository.revokeAuthorizationForSession(
              ROOT_CREDENTIAL_ID,
              'race_test_revocation',
            );
          } else {
            rotationPromise = refreshRepository.rotate(
              `${ROOT_CREDENTIAL_ID}.${ROOT_SECRET}`,
              replacement,
            );
          }
          const firstPromise = ordering === 'revoke-first'
            ? revocationPromise
            : rotationPromise;
          if (!firstPromise) throw new Error('The first race operation did not start.');
          void firstPromise.catch(() => undefined);

          const firstWait = await waitForDatabaseLock(
            blockerAndMonitorClient,
            'refresh_token_families',
            blockerPid,
            `${ordering} first-operation family`,
          );

          if (ordering === 'revoke-first') {
            rotationPromise = refreshRepository.rotate(
              `${ROOT_CREDENTIAL_ID}.${ROOT_SECRET}`,
              replacement,
            );
          } else {
            revocationPromise = revokeRepository.revokeAuthorizationForSession(
              ROOT_CREDENTIAL_ID,
              'race_test_revocation',
            );
          }
          const secondPromise = ordering === 'revoke-first'
            ? rotationPromise
            : revocationPromise;
          if (!secondPromise) throw new Error('The second race operation did not start.');
          void secondPromise.catch(() => undefined);

          const secondWait = await waitForDatabaseLock(
            blockerAndMonitorClient,
            'users',
            firstWait.pid,
            `${ordering} second-operation user`,
          );
          expect(firstWait.blockingPids).toContain(blockerPid);
          expect(secondWait.blockingPids).toContain(firstWait.pid);

          releaseBlocker.resolve(undefined);
          const [revocationResult, rotationResult] = await Promise.all([
            revocationPromise,
            rotationPromise,
          ]);
          await blockerPromise;
          if (revocationResult === undefined || rotationResult === undefined) {
            throw new Error('Both race operations must produce a result.');
          }

          return {
            revocationResult,
            rotationResult,
            state: await readRaceState(
              blockerAndMonitorClient,
              refreshRepository,
            ),
          };
        } finally {
          releaseBlocker.resolve(undefined);
          await Promise.allSettled([
            blockerPromise,
            ...(rotationPromise ? [rotationPromise] : []),
            ...(revocationPromise ? [revocationPromise] : []),
          ]);
        }
      })
    ))
  ));
}

async function runFreshRace(ordering: RaceOrdering, repetition: number): Promise<RaceResult> {
  const target = await createIsolatedDatabase(runtime, `${ordering}_${repetition}`);
  try {
    await applyMigrationsFromEmpty(target);
    const now = new Date();
    await seedBoundAuthorizationChain(target, now);
    return await executeRace(target, ordering, now);
  } finally {
    await dropIsolatedDatabase(target);
  }
}

async function runSigningFailureRollback(): Promise<RaceState> {
  const target = await createIsolatedDatabase(runtime, 'signing_failure_rollback');
  try {
    await applyMigrationsFromEmpty(target);
    const now = new Date();
    await seedBoundAuthorizationChain(target, now);
    const { createRefreshTokenRepository } = await import(
      '@/lib/prisma-repositories/refreshTokenRepository'
    );
    return await withTestPrismaClient(target, async (client) => {
      const repository = createRefreshTokenRepository(client);
      const { logger } = await import('@/lib/logger-enterprise');
      const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      try {
        await expect(repository.rotate(
          `${ROOT_CREDENTIAL_ID}.${ROOT_SECRET}`,
          {
            id: REPLACEMENT_CREDENTIAL_ID,
            tokenHash: hashSecret(REPLACEMENT_SECRET, REPLACEMENT_SALT),
            salt: REPLACEMENT_SALT,
            tokenExpiresAt: now.getTime() + 7 * 24 * 60 * 60 * 1_000,
            sessionExpiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
            deviceHash: DEVICE_HASH,
            ipHash: IP_HASH,
            presentedSession: { status: 'missing' },
            createSessionToken: () => {
              throw new Error('Synthetic response-credential construction failure');
            },
          },
        )).rejects.toThrow('Synthetic response-credential construction failure');
        const diagnostics = errorLog.mock.calls.flat().map((value) => (
          value instanceof Error ? `${value.name}:${value.message}` : JSON.stringify(value)
        )).join(' ');
        expect(errorLog).toHaveBeenCalled();
        expect(diagnostics).not.toContain(ROOT_SECRET);
        expect(diagnostics).not.toContain(REPLACEMENT_SECRET);
        expect(diagnostics).not.toMatch(/eyJ[A-Za-z0-9_-]*\./);
        expect(diagnostics).not.toMatch(/postgres(?:ql)?:\/\//i);
        expect(diagnostics).not.toMatch(/\+1\d{10}/);
      } finally {
        errorLog.mockRestore();
      }
      return readRaceState(client, repository);
    });
  } finally {
    await dropIsolatedDatabase(target);
  }
}

beforeAll(() => {
  originalSecurityPepper = process.env.SECURITY_PEPPER;
  process.env.SECURITY_PEPPER = TEST_SECURITY_PEPPER;
});

afterAll(() => {
  if (originalSecurityPepper === undefined) delete process.env.SECURITY_PEPPER;
  else process.env.SECURITY_PEPPER = originalSecurityPepper;
});

describe.sequential('refresh revocation linearization', () => {
  it('rolls back the complete generation when response credential construction fails', async () => {
    await expect(runSigningFailureRollback()).resolves.toEqual({
      familyRevoked: false,
      familyReason: null,
      tokenCount: 1,
      activeTokenCount: 1,
      revokedTokenCount: 0,
      descendantCount: 0,
      sessionCount: 1,
      activeSessionCount: 1,
      revokedSessionCount: 0,
      rootUsable: true,
      replacementUsable: false,
    });
  });

  it('lets a family revocation that reaches the family lock first deny rotation', async () => {
    for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
      const result = await runFreshRace('revoke-first', repetition);
      expect(result, `revoke-first repetition ${repetition}`).toEqual({
        revocationResult: true,
        rotationResult: { status: 'invalid' },
        state: {
          familyRevoked: true,
          familyReason: 'race_test_revocation',
          tokenCount: 1,
          activeTokenCount: 0,
          revokedTokenCount: 1,
          descendantCount: 0,
          sessionCount: 1,
          activeSessionCount: 0,
          revokedSessionCount: 1,
          rootUsable: false,
          replacementUsable: false,
        },
      });
    }
  });

  it('lets a later family revocation invalidate a rotation that commits first', async () => {
    for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
      const result = await runFreshRace('refresh-first', repetition);
      expect(result.revocationResult, `refresh-first revoke repetition ${repetition}`).toBe(true);
      expect(result.rotationResult, `refresh-first rotate repetition ${repetition}`).toEqual({
        status: 'rotated',
        old: expect.objectContaining({ id: ROOT_CREDENTIAL_ID }),
        rec: expect.objectContaining({
          id: REPLACEMENT_CREDENTIAL_ID,
          rotated_from_id: ROOT_CREDENTIAL_ID,
        }),
        session: expect.objectContaining({
          id: REPLACEMENT_CREDENTIAL_ID,
          userId: USER_ID,
          bookingId: BOOKING_ID,
        }),
        sessionToken: 'synthetic-race-session-token',
      });
      expect(result.state, `refresh-first final state repetition ${repetition}`).toEqual({
        familyRevoked: true,
        familyReason: 'race_test_revocation',
        tokenCount: 2,
        activeTokenCount: 0,
        revokedTokenCount: 2,
        descendantCount: 1,
        sessionCount: 2,
        activeSessionCount: 0,
        revokedSessionCount: 2,
        rootUsable: false,
        replacementUsable: false,
      });
    }
  });
});
