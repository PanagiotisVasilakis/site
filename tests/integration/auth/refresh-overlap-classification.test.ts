import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
type OverlapKind =
  | 'same-context'
  | 'same-context-invalid-binding'
  | 'different-context'
  | 'different-context-owner-rollback'
  | 'completed-replay-contention';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

interface DatabaseLockObservation {
  pid: number;
  waitEventType: string | null;
  waitEvent: string | null;
  blockingPids: number[];
  advisoryGranted: boolean;
}

interface SafeRotationEvidence {
  status: RotationResult['status'];
  familyId?: string;
  oldId?: string;
  replacementId?: string;
  sessionId?: string;
  sessionTokenIssued?: boolean;
}

interface AuthorizationState {
  primary: {
    familyRevoked: boolean;
    familyReason: string | null;
    tokenCount: number;
    activeTokenCount: number;
    revokedTokenCount: number;
    descendantCount: number;
    activeDescendantCount: number;
    sessionCount: number;
    activeSessionCount: number;
    revokedSessionCount: number;
    generationSessionPairingValid: boolean;
    rootUsable: boolean;
    replacementUsable: boolean;
    contenderUsable: boolean;
  };
  isolated: {
    familyRevoked: boolean;
    tokenCount: number;
    activeTokenCount: number;
    sessionCount: number;
    activeSessionCount: number;
    usable: boolean;
  };
}

interface OverlapResult {
  owner: SafeRotationEvidence | { status: 'rolled-back'; safeError: string };
  contender: SafeRotationEvidence;
  ownerLockObserved: boolean;
  contenderWaitObserved: boolean;
  state: AuthorizationState;
}

interface FamilyRotationState {
  familyRevoked: boolean;
  tokenCount: number;
  activeTokenCount: number;
  descendantCount: number;
  sessionCount: number;
  activeSessionCount: number;
  rootUsable: boolean;
  replacementUsable: boolean;
  generationSessionPairingValid: boolean;
}

interface FamilyIsolationResult {
  primary: SafeRotationEvidence;
  secondarySameUserOtherBooking: SafeRotationEvidence;
  isolatedOtherUser: SafeRotationEvidence;
  primaryMarkerObserved: boolean;
  secondaryMarkerObserved: boolean;
  isolatedCompletedWhilePrimaryUserBlocked: boolean;
  states: {
    primary: FamilyRotationState;
    secondarySameUserOtherBooking: FamilyRotationState;
    isolatedOtherUser: FamilyRotationState;
  };
}

interface GenerationIsolationResult {
  rotation: SafeRotationEvidence;
  predecessorMarkerHeldThroughCompletion: boolean;
  state: FamilyRotationState;
  isolatedState: FamilyRotationState;
}

interface RollbackRetryResult {
  failedOwner: { status: 'rolled-back'; safeError: string };
  markerReleased: boolean;
  retry: SafeRotationEvidence;
  state: AuthorizationState;
}

const runtime = readDisposablePostgresRuntime();
const DATABASE_OBSERVATION_TIMEOUT_MS = 4_000;
const PROMISE_TIMEOUT_MS = 4_000;
const TEST_SECURITY_PEPPER = 'pr02d-overlap-integration-security-pepper-only';
const PRIMARY_USER_ID = '13000000-0000-4000-8000-000000000001';
const PRIMARY_BOOKING_ID = '23000000-0000-4000-8000-000000000001';
const ROOT_GENERATION_ID = '33000000-0000-4000-8000-000000000001';
const WINNER_GENERATION_ID = '33000000-0000-4000-8000-000000000002';
const CONTENDER_GENERATION_ID = '33000000-0000-4000-8000-000000000003';
const NEXT_GENERATION_ID = '33000000-0000-4000-8000-000000000005';
const SECONDARY_ROOT_GENERATION_ID = '33000000-0000-4000-8000-000000000006';
const SECONDARY_REPLACEMENT_GENERATION_ID = '33000000-0000-4000-8000-000000000007';
const ISOLATED_REPLACEMENT_GENERATION_ID = '33000000-0000-4000-8000-000000000008';
const PRIMARY_FAMILY_ID = 'pr02d-overlap-primary-family';
const ROOT_SECRET = 'pr02d-synthetic-root-refresh-secret';
const WINNER_SECRET = 'pr02d-synthetic-winner-refresh-secret';
const CONTENDER_SECRET = 'pr02d-synthetic-contender-refresh-secret';
const NEXT_SECRET = 'pr02d-synthetic-next-refresh-secret';
const SECONDARY_ROOT_SECRET = 'pr02d-synthetic-secondary-root-refresh-secret';
const SECONDARY_REPLACEMENT_SECRET = 'pr02d-synthetic-secondary-replacement-refresh-secret';
const ISOLATED_REPLACEMENT_SECRET = 'pr02d-synthetic-isolated-replacement-refresh-secret';
const ROOT_SALT = '31313131313131313131313131313131';
const WINNER_SALT = '32323232323232323232323232323232';
const CONTENDER_SALT = '33333333333333333333333333333333';
const NEXT_SALT = '35353535353535353535353535353535';
const SECONDARY_ROOT_SALT = '36363636363636363636363636363636';
const SECONDARY_REPLACEMENT_SALT = '37373737373737373737373737373737';
const ISOLATED_REPLACEMENT_SALT = '38383838383838383838383838383838';
const APPROVED_DEVICE_HASH = '5'.repeat(64);
const APPROVED_IP_HASH = '6'.repeat(64);
const SUSPICIOUS_DEVICE_HASH = '7'.repeat(64);
const SUSPICIOUS_IP_HASH = '8'.repeat(64);

const ISOLATED_USER_ID = '13000000-0000-4000-8000-000000000002';
const ISOLATED_BOOKING_ID = '23000000-0000-4000-8000-000000000002';
const ISOLATED_GENERATION_ID = '33000000-0000-4000-8000-000000000004';
const ISOLATED_FAMILY_ID = 'pr02d-overlap-isolated-family';
const ISOLATED_SECRET = 'pr02d-synthetic-isolated-refresh-secret';
const ISOLATED_SALT = '34343434343434343434343434343434';
const SECONDARY_BOOKING_ID = '23000000-0000-4000-8000-000000000003';
const SECONDARY_FAMILY_ID = 'pr02d-overlap-secondary-same-user-family';

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

function safeRotationEvidence(result: RotationResult): SafeRotationEvidence {
  if (result.status === 'rotated') {
    return {
      status: result.status,
      familyId: result.rec.family_id,
      oldId: result.old.id,
      replacementId: result.rec.id,
      sessionId: result.session.id,
      sessionTokenIssued: Boolean(result.sessionToken),
    };
  }
  if (result.status === 'concurrent' || result.status === 'replayed') {
    return { status: result.status, familyId: result.familyId };
  }
  return { status: result.status };
}

async function withDeadline<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for bounded ${label}.`));
    }, PROMISE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function seedAuthorizationFamilies(
  target: DisposableDatabaseTarget,
  now: Date,
): Promise<void> {
  await withTestPrismaClient(target, async (client) => {
    await client.$transaction(async (tx) => {
      await tx.user.createMany({
        data: [
          {
            id: PRIMARY_USER_ID,
            email: 'overlap-primary@example.invalid',
            phoneE164: '+12025550301',
            countryOrigin: 'ABROAD',
          },
          {
            id: ISOLATED_USER_ID,
            email: 'overlap-isolated@example.invalid',
            phoneE164: '+12025550302',
            countryOrigin: 'ABROAD',
          },
        ],
      });
      await tx.booking.createMany({
        data: [
          {
            id: PRIMARY_BOOKING_ID,
            source: 'EXTERNAL',
            startDate: utcDateOffset(now, -1),
            endDate: utcDateOffset(now, 7),
            userId: PRIMARY_USER_ID,
            provider: 'integration-overlap',
            externalReference: 'overlap-primary-booking',
            accessStatus: 'VERIFIED',
            claimedAt: now,
          },
          {
            id: ISOLATED_BOOKING_ID,
            source: 'EXTERNAL',
            startDate: utcDateOffset(now, -1),
            endDate: utcDateOffset(now, 7),
            userId: ISOLATED_USER_ID,
            provider: 'integration-overlap',
            externalReference: 'overlap-isolated-booking',
            accessStatus: 'VERIFIED',
            claimedAt: now,
          },
        ],
      });
      await tx.session.createMany({
        data: [
          {
            id: ROOT_GENERATION_ID,
            userId: PRIMARY_USER_ID,
            bookingId: PRIMARY_BOOKING_ID,
            expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
          },
          {
            id: ISOLATED_GENERATION_ID,
            userId: ISOLATED_USER_ID,
            bookingId: ISOLATED_BOOKING_ID,
            expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
          },
        ],
      });
      await tx.refreshTokenFamily.createMany({
        data: [
          {
            id: PRIMARY_FAMILY_ID,
            userId: PRIMARY_USER_ID,
            absoluteExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
            deviceHash: APPROVED_DEVICE_HASH,
            ipHash: APPROVED_IP_HASH,
          },
          {
            id: ISOLATED_FAMILY_ID,
            userId: ISOLATED_USER_ID,
            absoluteExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
            deviceHash: APPROVED_DEVICE_HASH,
            ipHash: APPROVED_IP_HASH,
          },
        ],
      });
      await tx.refreshToken.createMany({
        data: [
          {
            id: ROOT_GENERATION_ID,
            userId: PRIMARY_USER_ID,
            tokenHash: hashSecret(ROOT_SECRET, ROOT_SALT),
            salt: ROOT_SALT,
            familyId: PRIMARY_FAMILY_ID,
            expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
            deviceHint: APPROVED_DEVICE_HASH,
            ipHint: APPROVED_IP_HASH,
          },
          {
            id: ISOLATED_GENERATION_ID,
            userId: ISOLATED_USER_ID,
            tokenHash: hashSecret(ISOLATED_SECRET, ISOLATED_SALT),
            salt: ISOLATED_SALT,
            familyId: ISOLATED_FAMILY_ID,
            expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
            deviceHint: APPROVED_DEVICE_HASH,
            ipHint: APPROVED_IP_HASH,
          },
        ],
      });
    });
  }, 'seed');
}

async function seedSecondarySameUserFamily(
  target: DisposableDatabaseTarget,
  now: Date,
): Promise<void> {
  await withTestPrismaClient(target, async (client) => {
    await client.$transaction(async (tx) => {
      await tx.booking.create({
        data: {
          id: SECONDARY_BOOKING_ID,
          source: 'EXTERNAL',
          startDate: utcDateOffset(now, -1),
          endDate: utcDateOffset(now, 7),
          userId: PRIMARY_USER_ID,
          provider: 'integration-overlap',
          externalReference: 'overlap-secondary-same-user-booking',
          accessStatus: 'VERIFIED',
          claimedAt: now,
        },
      });
      await tx.session.create({
        data: {
          id: SECONDARY_ROOT_GENERATION_ID,
          userId: PRIMARY_USER_ID,
          bookingId: SECONDARY_BOOKING_ID,
          expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
        },
      });
      await tx.refreshTokenFamily.create({
        data: {
          id: SECONDARY_FAMILY_ID,
          userId: PRIMARY_USER_ID,
          absoluteExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
          deviceHash: APPROVED_DEVICE_HASH,
          ipHash: APPROVED_IP_HASH,
        },
      });
      await tx.refreshToken.create({
        data: {
          id: SECONDARY_ROOT_GENERATION_ID,
          userId: PRIMARY_USER_ID,
          tokenHash: hashSecret(SECONDARY_ROOT_SECRET, SECONDARY_ROOT_SALT),
          salt: SECONDARY_ROOT_SALT,
          familyId: SECONDARY_FAMILY_ID,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
          deviceHint: APPROVED_DEVICE_HASH,
          ipHint: APPROVED_IP_HASH,
        },
      });
    });
  }, 'seed');
}

async function advancePrimaryFamilyToGenerationNPlusOne(
  target: DisposableDatabaseTarget,
  now: Date,
): Promise<void> {
  await withTestPrismaClient(target, async (client) => {
    await client.$transaction(async (tx) => {
      const revokedToken = await tx.refreshToken.updateMany({
        where: { id: ROOT_GENERATION_ID, revokedAt: null },
        data: { revokedAt: now, lastUsedAt: now },
      });
      const revokedSession = await tx.session.updateMany({
        where: { id: ROOT_GENERATION_ID, revokedAt: null },
        data: { revokedAt: now },
      });
      if (revokedToken.count !== 1 || revokedSession.count !== 1) {
        throw new Error('Synthetic generation advancement did not revoke exactly one root pair.');
      }
      await tx.session.create({
        data: {
          id: WINNER_GENERATION_ID,
          userId: PRIMARY_USER_ID,
          bookingId: PRIMARY_BOOKING_ID,
          expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
        },
      });
      await tx.refreshToken.create({
        data: {
          id: WINNER_GENERATION_ID,
          userId: PRIMARY_USER_ID,
          tokenHash: hashSecret(WINNER_SECRET, WINNER_SALT),
          salt: WINNER_SALT,
          familyId: PRIMARY_FAMILY_ID,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
          rotatedFromId: ROOT_GENERATION_ID,
          deviceHint: APPROVED_DEVICE_HASH,
          ipHint: APPROVED_IP_HASH,
        },
      });
    });
  }, 'seed');
}

async function waitForUserLockOwner(
  monitor: PrismaClient,
  blockerPid: number,
  excludedPid?: number,
): Promise<DatabaseLockObservation> {
  const deadline = Date.now() + DATABASE_OBSERVATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const rows = await monitor.$queryRaw<DatabaseLockObservation[]>`
      SELECT
        activity."pid" AS "pid",
        activity."wait_event_type" AS "waitEventType",
        activity."wait_event" AS "waitEvent",
        pg_blocking_pids(activity."pid") AS "blockingPids",
        EXISTS (
          SELECT 1
          FROM "pg_locks" AS held_lock
          WHERE held_lock."pid" = activity."pid"
            AND held_lock."locktype" = 'advisory'
            AND held_lock."granted"
        ) AS "advisoryGranted"
      FROM "pg_stat_activity" AS activity
      WHERE activity."datname" = current_database()
        AND activity."pid" <> pg_backend_pid()
        AND activity."state" = 'active'
        AND activity."query" LIKE '%"users"%'
        AND activity."query" ~* 'FOR[[:space:]]+UPDATE'
    `;
    const owner = rows.find((row) => row.waitEventType === 'Lock'
      && (row.blockingPids.includes(blockerPid)
        || (excludedPid !== undefined && row.blockingPids.includes(excludedPid)))
      && row.pid !== excludedPid
      && row.advisoryGranted);
    if (owner) return owner;

    // Yield only; PostgreSQL lock ownership is the synchronization condition.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Timed out observing the generation owner blocked on the User row.');
}

async function waitForUserLockContender(
  monitor: PrismaClient,
  blockerPid: number,
  ownerPid: number,
): Promise<DatabaseLockObservation> {
  const deadline = Date.now() + DATABASE_OBSERVATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const rows = await monitor.$queryRaw<DatabaseLockObservation[]>`
      SELECT
        activity."pid" AS "pid",
        activity."wait_event_type" AS "waitEventType",
        activity."wait_event" AS "waitEvent",
        pg_blocking_pids(activity."pid") AS "blockingPids",
        EXISTS (
          SELECT 1
          FROM "pg_locks" AS held_lock
          WHERE held_lock."pid" = activity."pid"
            AND held_lock."locktype" = 'advisory'
            AND held_lock."granted"
        ) AS "advisoryGranted"
      FROM "pg_stat_activity" AS activity
      WHERE activity."datname" = current_database()
        AND activity."pid" <> pg_backend_pid()
        AND activity."state" = 'active'
        AND activity."query" LIKE '%"users"%'
        AND activity."query" ~* 'FOR[[:space:]]+UPDATE'
    `;
    const contender = rows.find((row) => row.waitEventType === 'Lock'
      && row.pid !== ownerPid
      && (row.blockingPids.includes(blockerPid) || row.blockingPids.includes(ownerPid))
      && !row.advisoryGranted);
    if (contender) return contender;

    // Yield only; PostgreSQL lock ownership is the synchronization condition.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Timed out observing the different-context User-row cleanup contender.');
}

async function advisoryLockIsHeld(client: PrismaClient, pid: number): Promise<boolean> {
  const rows = await client.$queryRaw<Array<{ held: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM "pg_locks"
      WHERE "pid" = ${pid}
        AND "locktype" = 'advisory'
        AND "granted"
    ) AS "held"
  `;
  return rows.length === 1 && rows[0].held;
}

function createReplacement(
  now: Date,
  generationId: string,
  secret: string,
  salt: string,
  context: 'approved' | 'suspicious',
  rollBackOwner = false,
) {
  return {
    id: generationId,
    tokenHash: hashSecret(secret, salt),
    salt,
    tokenExpiresAt: now.getTime() + 7 * 24 * 60 * 60 * 1_000,
    sessionExpiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
    deviceHash: context === 'approved' ? APPROVED_DEVICE_HASH : SUSPICIOUS_DEVICE_HASH,
    ipHash: context === 'approved' ? APPROVED_IP_HASH : SUSPICIOUS_IP_HASH,
    presentedSession: { status: 'missing' as const },
    createSessionToken: () => {
      if (rollBackOwner) throw new Error('Synthetic rotation rollback after overlap ownership');
      return 'synthetic-session-token-issued';
    },
  };
}

async function readAuthorizationState(
  client: PrismaClient,
  repository: RefreshTokenRepository,
): Promise<AuthorizationState> {
  const [primaryFamily, primaryTokens, primarySessions, isolatedFamily, isolatedTokens,
    isolatedSessions, rootVerification, replacementVerification, contenderVerification,
    isolatedVerification] =
    await Promise.all([
      client.refreshTokenFamily.findUnique({ where: { id: PRIMARY_FAMILY_ID } }),
      client.refreshToken.findMany({
        where: { familyId: PRIMARY_FAMILY_ID },
        orderBy: { createdAt: 'asc' },
      }),
      client.session.findMany({
        where: {
          id: {
            in: [ROOT_GENERATION_ID, WINNER_GENERATION_ID, CONTENDER_GENERATION_ID],
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      client.refreshTokenFamily.findUnique({ where: { id: ISOLATED_FAMILY_ID } }),
      client.refreshToken.findMany({ where: { familyId: ISOLATED_FAMILY_ID } }),
      client.session.findMany({ where: { userId: ISOLATED_USER_ID } }),
      repository.verify(`${ROOT_GENERATION_ID}.${ROOT_SECRET}`),
      repository.verify(`${WINNER_GENERATION_ID}.${WINNER_SECRET}`),
      repository.verify(`${CONTENDER_GENERATION_ID}.${CONTENDER_SECRET}`),
      repository.verify(`${ISOLATED_GENERATION_ID}.${ISOLATED_SECRET}`),
    ]);

  const sessionsById = new Map(primarySessions.map((session) => [session.id, session]));
  const generationSessionPairingValid = primaryTokens.every((token) => {
    const session = sessionsById.get(token.id);
    return Boolean(session
      && session.userId === token.userId
      && session.bookingId === PRIMARY_BOOKING_ID
      && Boolean(session.revokedAt) === Boolean(token.revokedAt));
  });

  return {
    primary: {
      familyRevoked: Boolean(primaryFamily?.revokedAt),
      familyReason: primaryFamily?.revocationReason ?? null,
      tokenCount: primaryTokens.length,
      activeTokenCount: primaryTokens.filter((token) => !token.revokedAt).length,
      revokedTokenCount: primaryTokens.filter((token) => Boolean(token.revokedAt)).length,
      descendantCount: primaryTokens.filter((token) => Boolean(token.rotatedFromId)).length,
      activeDescendantCount: primaryTokens.filter(
        (token) => Boolean(token.rotatedFromId) && !token.revokedAt,
      ).length,
      sessionCount: primarySessions.length,
      activeSessionCount: primarySessions.filter((session) => !session.revokedAt).length,
      revokedSessionCount: primarySessions.filter((session) => Boolean(session.revokedAt)).length,
      generationSessionPairingValid,
      rootUsable: Boolean(rootVerification),
      replacementUsable: Boolean(replacementVerification),
      contenderUsable: Boolean(contenderVerification),
    },
    isolated: {
      familyRevoked: Boolean(isolatedFamily?.revokedAt),
      tokenCount: isolatedTokens.length,
      activeTokenCount: isolatedTokens.filter((token) => !token.revokedAt).length,
      sessionCount: isolatedSessions.length,
      activeSessionCount: isolatedSessions.filter((session) => !session.revokedAt).length,
      usable: Boolean(isolatedVerification),
    },
  };
}

async function readFamilyRotationState(
  client: PrismaClient,
  repository: RefreshTokenRepository,
  fixture: {
    familyId: string;
    bookingId: string;
    rootId: string;
    rootSecret: string;
    replacementId: string;
    replacementSecret: string;
  },
): Promise<FamilyRotationState> {
  const [family, tokens, rootVerification, replacementVerification] = await Promise.all([
    client.refreshTokenFamily.findUnique({ where: { id: fixture.familyId } }),
    client.refreshToken.findMany({
      where: { familyId: fixture.familyId },
      orderBy: { createdAt: 'asc' },
    }),
    repository.verify(`${fixture.rootId}.${fixture.rootSecret}`),
    repository.verify(`${fixture.replacementId}.${fixture.replacementSecret}`),
  ]);
  const sessions = await client.session.findMany({
    where: { id: { in: tokens.map((token) => token.id) } },
  });
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));

  return {
    familyRevoked: Boolean(family?.revokedAt),
    tokenCount: tokens.length,
    activeTokenCount: tokens.filter((token) => !token.revokedAt).length,
    descendantCount: tokens.filter((token) => Boolean(token.rotatedFromId)).length,
    sessionCount: sessions.length,
    activeSessionCount: sessions.filter((session) => !session.revokedAt).length,
    rootUsable: Boolean(rootVerification),
    replacementUsable: Boolean(replacementVerification),
    generationSessionPairingValid: tokens.every((token) => {
      const session = sessionsById.get(token.id);
      return Boolean(session
        && session.userId === token.userId
        && session.bookingId === fixture.bookingId
        && Boolean(session.revokedAt) === Boolean(token.revokedAt));
    }),
  };
}

async function executeOverlap(
  target: DisposableDatabaseTarget,
  kind: OverlapKind,
  now: Date,
): Promise<OverlapResult> {
  const { createRefreshTokenRepository } = await import(
    '@/lib/prisma-repositories/refreshTokenRepository'
  );

  return withTestPrismaClient(target, async (blockerClient) => (
    withTestPrismaClient(target, async (ownerClient) => (
      withTestPrismaClient(target, async (contenderClient) => (
        withTestPrismaClient(target, async (monitorClient) => {
          const ownerRepository = createRefreshTokenRepository(ownerClient);
          const contenderRepository = createRefreshTokenRepository(contenderClient);
          const monitorRepository = createRefreshTokenRepository(monitorClient);
          const blockerReady = createDeferred<number>();
          const releaseBlocker = createDeferred<void>();
          let ownerPromise: Promise<RotationResult> | undefined;
          let contenderPromise: Promise<RotationResult> | undefined;

          if (kind === 'completed-replay-contention') {
            const committedRotation = await ownerRepository.rotate(
              `${ROOT_GENERATION_ID}.${ROOT_SECRET}`,
              createReplacement(
                now,
                WINNER_GENERATION_ID,
                WINNER_SECRET,
                WINNER_SALT,
                'approved',
              ),
            );
            if (committedRotation.status !== 'rotated') {
              throw new Error('Completed-replay fixture did not commit its initial rotation.');
            }
          }

          const blockerPromise = blockerClient.$transaction(async (tx) => {
            const backendRows = await tx.$queryRaw<Array<{ pid: number }>>`
              SELECT pg_backend_pid() AS "pid"
            `;
            const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
              SELECT "id"
              FROM "users"
              WHERE "id" = ${PRIMARY_USER_ID}::uuid
              FOR UPDATE
            `;
            if (backendRows.length !== 1 || lockedRows.length !== 1) {
              throw new Error('Synthetic User-row blocker did not lock exactly one principal.');
            }
            blockerReady.resolve(backendRows[0].pid);
            await releaseBlocker.promise;
          }, { timeout: 12_000 });
          void blockerPromise.catch((error: unknown) => blockerReady.reject(error));

          try {
            const blockerPid = await blockerReady.promise;
            ownerPromise = ownerRepository.rotate(
              `${ROOT_GENERATION_ID}.${ROOT_SECRET}`,
              createReplacement(
                now,
                kind === 'completed-replay-contention'
                  ? NEXT_GENERATION_ID
                  : WINNER_GENERATION_ID,
                kind === 'completed-replay-contention' ? NEXT_SECRET : WINNER_SECRET,
                kind === 'completed-replay-contention' ? NEXT_SALT : WINNER_SALT,
                'approved',
                kind === 'different-context-owner-rollback',
              ),
            );
            void ownerPromise.catch(() => undefined);

            const ownerLock = await waitForUserLockOwner(monitorClient, blockerPid);
            const contenderReplacement = createReplacement(
                now,
                CONTENDER_GENERATION_ID,
                CONTENDER_SECRET,
                CONTENDER_SALT,
                kind === 'same-context'
                  || kind === 'same-context-invalid-binding'
                  || kind === 'completed-replay-contention'
                  ? 'approved'
                  : 'suspicious',
              );
            contenderPromise = contenderRepository.rotate(
              `${ROOT_GENERATION_ID}.${ROOT_SECRET}`,
              kind === 'same-context-invalid-binding'
                ? { ...contenderReplacement, presentedSession: { status: 'invalid' as const } }
                : contenderReplacement,
            );
            void contenderPromise.catch(() => undefined);

            let contenderWaitObserved = false;
            let contenderResult: RotationResult;
            if (kind === 'same-context') {
              contenderResult = await withDeadline(
                contenderPromise,
                'same-context concurrent classification',
              );
            } else {
              const contenderLock = await waitForUserLockContender(
                monitorClient,
                blockerPid,
                ownerLock.pid,
              );
              contenderWaitObserved = contenderLock.blockingPids.includes(blockerPid)
                || contenderLock.blockingPids.includes(ownerLock.pid);
              releaseBlocker.resolve(undefined);
              contenderResult = await withDeadline(
                contenderPromise,
                'different-context fail-closed classification',
              );
            }

            releaseBlocker.resolve(undefined);
            let ownerEvidence: OverlapResult['owner'];
            if (kind === 'different-context-owner-rollback') {
              const ownerSettlement = await ownerPromise.then(
                (value) => ({ status: 'fulfilled' as const, value }),
                (error: unknown) => ({ status: 'rejected' as const, error }),
              );
              if (ownerSettlement.status !== 'rejected') {
                throw new Error('Synthetic overlap owner was expected to roll back.');
              }
              ownerEvidence = {
                status: 'rolled-back',
                safeError: ownerSettlement.error instanceof Error
                  ? ownerSettlement.error.message
                  : 'non-error rejection',
              };
            } else {
              ownerEvidence = safeRotationEvidence(await withDeadline(
                ownerPromise,
                'overlap owner completion',
              ));
            }
            await blockerPromise;

            return {
              owner: ownerEvidence,
              contender: safeRotationEvidence(contenderResult),
              ownerLockObserved: ownerLock.advisoryGranted
                && ownerLock.blockingPids.includes(blockerPid),
              contenderWaitObserved,
              state: await readAuthorizationState(monitorClient, monitorRepository),
            };
          } finally {
            releaseBlocker.resolve(undefined);
            await Promise.allSettled([
              blockerPromise,
              ...(ownerPromise ? [ownerPromise] : []),
              ...(contenderPromise ? [contenderPromise] : []),
            ]);
          }
        })
      ))
    ))
  ));
}

async function executeFamilyIsolation(
  target: DisposableDatabaseTarget,
  now: Date,
): Promise<FamilyIsolationResult> {
  const { createRefreshTokenRepository } = await import(
    '@/lib/prisma-repositories/refreshTokenRepository'
  );

  return withTestPrismaClient(target, async (blockerClient) => (
    withTestPrismaClient(target, async (primaryClient) => (
      withTestPrismaClient(target, async (secondaryClient) => (
        withTestPrismaClient(target, async (isolatedClient) => (
          withTestPrismaClient(target, async (monitorClient) => {
            const primaryRepository = createRefreshTokenRepository(primaryClient);
            const secondaryRepository = createRefreshTokenRepository(secondaryClient);
            const isolatedRepository = createRefreshTokenRepository(isolatedClient);
            const monitorRepository = createRefreshTokenRepository(monitorClient);
            const blockerReady = createDeferred<number>();
            const releaseBlocker = createDeferred<void>();
            let primaryPromise: Promise<RotationResult> | undefined;
            let secondaryPromise: Promise<RotationResult> | undefined;
            let isolatedPromise: Promise<RotationResult> | undefined;

            const blockerPromise = blockerClient.$transaction(async (tx) => {
              const backendRows = await tx.$queryRaw<Array<{ pid: number }>>`
                SELECT pg_backend_pid() AS "pid"
              `;
              const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id"
                FROM "users"
                WHERE "id" = ${PRIMARY_USER_ID}::uuid
                FOR UPDATE
              `;
              if (backendRows.length !== 1 || lockedRows.length !== 1) {
                throw new Error('Family-isolation blocker did not lock the primary User row.');
              }
              blockerReady.resolve(backendRows[0].pid);
              await releaseBlocker.promise;
            }, { timeout: 12_000 });
            void blockerPromise.catch((error: unknown) => blockerReady.reject(error));

            try {
              const blockerPid = await blockerReady.promise;
              primaryPromise = primaryRepository.rotate(
                `${ROOT_GENERATION_ID}.${ROOT_SECRET}`,
                createReplacement(
                  now,
                  WINNER_GENERATION_ID,
                  WINNER_SECRET,
                  WINNER_SALT,
                  'approved',
                ),
              );
              void primaryPromise.catch(() => undefined);
              const primaryLock = await waitForUserLockOwner(monitorClient, blockerPid);

              secondaryPromise = secondaryRepository.rotate(
                `${SECONDARY_ROOT_GENERATION_ID}.${SECONDARY_ROOT_SECRET}`,
                createReplacement(
                  now,
                  SECONDARY_REPLACEMENT_GENERATION_ID,
                  SECONDARY_REPLACEMENT_SECRET,
                  SECONDARY_REPLACEMENT_SALT,
                  'approved',
                ),
              );
              void secondaryPromise.catch(() => undefined);
              const secondaryLock = await waitForUserLockOwner(
                monitorClient,
                blockerPid,
                primaryLock.pid,
              );

              isolatedPromise = isolatedRepository.rotate(
                `${ISOLATED_GENERATION_ID}.${ISOLATED_SECRET}`,
                createReplacement(
                  now,
                  ISOLATED_REPLACEMENT_GENERATION_ID,
                  ISOLATED_REPLACEMENT_SECRET,
                  ISOLATED_REPLACEMENT_SALT,
                  'approved',
                ),
              );
              void isolatedPromise.catch(() => undefined);
              const isolatedResult = await withDeadline(
                isolatedPromise,
                'other-user family rotation while the primary User row is blocked',
              );
              const isolatedCompletedWhilePrimaryUserBlocked = await advisoryLockIsHeld(
                monitorClient,
                primaryLock.pid,
              );

              releaseBlocker.resolve(undefined);
              const [primaryResult, secondaryResult] = await Promise.all([
                withDeadline(primaryPromise, 'primary family-isolation rotation'),
                withDeadline(secondaryPromise, 'same-user family-isolation rotation'),
              ]);
              await blockerPromise;

              const [primaryState, secondaryState, isolatedState] = await Promise.all([
                readFamilyRotationState(monitorClient, monitorRepository, {
                  familyId: PRIMARY_FAMILY_ID,
                  bookingId: PRIMARY_BOOKING_ID,
                  rootId: ROOT_GENERATION_ID,
                  rootSecret: ROOT_SECRET,
                  replacementId: WINNER_GENERATION_ID,
                  replacementSecret: WINNER_SECRET,
                }),
                readFamilyRotationState(monitorClient, monitorRepository, {
                  familyId: SECONDARY_FAMILY_ID,
                  bookingId: SECONDARY_BOOKING_ID,
                  rootId: SECONDARY_ROOT_GENERATION_ID,
                  rootSecret: SECONDARY_ROOT_SECRET,
                  replacementId: SECONDARY_REPLACEMENT_GENERATION_ID,
                  replacementSecret: SECONDARY_REPLACEMENT_SECRET,
                }),
                readFamilyRotationState(monitorClient, monitorRepository, {
                  familyId: ISOLATED_FAMILY_ID,
                  bookingId: ISOLATED_BOOKING_ID,
                  rootId: ISOLATED_GENERATION_ID,
                  rootSecret: ISOLATED_SECRET,
                  replacementId: ISOLATED_REPLACEMENT_GENERATION_ID,
                  replacementSecret: ISOLATED_REPLACEMENT_SECRET,
                }),
              ]);

              return {
                primary: safeRotationEvidence(primaryResult),
                secondarySameUserOtherBooking: safeRotationEvidence(secondaryResult),
                isolatedOtherUser: safeRotationEvidence(isolatedResult),
                primaryMarkerObserved: primaryLock.advisoryGranted,
                secondaryMarkerObserved: secondaryLock.advisoryGranted,
                isolatedCompletedWhilePrimaryUserBlocked,
                states: {
                  primary: primaryState,
                  secondarySameUserOtherBooking: secondaryState,
                  isolatedOtherUser: isolatedState,
                },
              };
            } finally {
              releaseBlocker.resolve(undefined);
              await Promise.allSettled([
                blockerPromise,
                ...(primaryPromise ? [primaryPromise] : []),
                ...(secondaryPromise ? [secondaryPromise] : []),
                ...(isolatedPromise ? [isolatedPromise] : []),
              ]);
            }
          })
        ))
      ))
    ))
  ));
}

async function executeGenerationIsolation(
  target: DisposableDatabaseTarget,
  now: Date,
): Promise<GenerationIsolationResult> {
  const [{ createRefreshTokenRepository }, { refreshGenerationAdvisoryLockKey }] =
    await Promise.all([
      import('@/lib/prisma-repositories/refreshTokenRepository'),
      import('@/lib/refreshRotationLock'),
    ]);
  const predecessorMarkerKey = refreshGenerationAdvisoryLockKey(ROOT_GENERATION_ID);

  return withTestPrismaClient(target, async (markerClient) => (
    withTestPrismaClient(target, async (rotationClient) => (
      withTestPrismaClient(target, async (monitorClient) => {
        const rotationRepository = createRefreshTokenRepository(rotationClient);
        const monitorRepository = createRefreshTokenRepository(monitorClient);
        const markerReady = createDeferred<number>();
        const releaseMarker = createDeferred<void>();
        let rotationPromise: Promise<RotationResult> | undefined;

        const markerPromise = markerClient.$transaction(async (tx) => {
          const backendRows = await tx.$queryRaw<Array<{ pid: number }>>`
            SELECT pg_backend_pid() AS "pid"
          `;
          const heldRows = await tx.$queryRaw<Array<{ held: boolean }>>`
            SELECT TRUE AS "held"
            FROM (
              SELECT pg_advisory_xact_lock(${predecessorMarkerKey}::bigint)
            ) AS generation_marker
          `;
          if (backendRows.length !== 1 || heldRows.length !== 1 || !heldRows[0].held) {
            throw new Error('Synthetic predecessor generation marker was not acquired.');
          }
          markerReady.resolve(backendRows[0].pid);
          await releaseMarker.promise;
        }, { timeout: 12_000 });
        void markerPromise.catch((error: unknown) => markerReady.reject(error));

        try {
          const markerPid = await markerReady.promise;
          if (!(await advisoryLockIsHeld(monitorClient, markerPid))) {
            throw new Error('PostgreSQL did not expose the predecessor generation marker.');
          }

          rotationPromise = rotationRepository.rotate(
            `${WINNER_GENERATION_ID}.${WINNER_SECRET}`,
            createReplacement(
              now,
              NEXT_GENERATION_ID,
              NEXT_SECRET,
              NEXT_SALT,
              'approved',
            ),
          );
          void rotationPromise.catch(() => undefined);
          const rotationResult = await withDeadline(
            rotationPromise,
            'generation N+1 rotation while generation N marker is held',
          );
          const predecessorMarkerHeldThroughCompletion = await advisoryLockIsHeld(
            monitorClient,
            markerPid,
          );

          releaseMarker.resolve(undefined);
          await markerPromise;
          const [state, isolatedState] = await Promise.all([
            readFamilyRotationState(monitorClient, monitorRepository, {
              familyId: PRIMARY_FAMILY_ID,
              bookingId: PRIMARY_BOOKING_ID,
              rootId: WINNER_GENERATION_ID,
              rootSecret: WINNER_SECRET,
              replacementId: NEXT_GENERATION_ID,
              replacementSecret: NEXT_SECRET,
            }),
            readFamilyRotationState(monitorClient, monitorRepository, {
              familyId: ISOLATED_FAMILY_ID,
              bookingId: ISOLATED_BOOKING_ID,
              rootId: ISOLATED_GENERATION_ID,
              rootSecret: ISOLATED_SECRET,
              replacementId: ISOLATED_REPLACEMENT_GENERATION_ID,
              replacementSecret: ISOLATED_REPLACEMENT_SECRET,
            }),
          ]);

          return {
            rotation: safeRotationEvidence(rotationResult),
            predecessorMarkerHeldThroughCompletion,
            state,
            isolatedState,
          };
        } finally {
          releaseMarker.resolve(undefined);
          await Promise.allSettled([
            markerPromise,
            ...(rotationPromise ? [rotationPromise] : []),
          ]);
        }
      })
    ))
  ));
}

async function executeRollbackThenRetry(
  target: DisposableDatabaseTarget,
  now: Date,
): Promise<RollbackRetryResult> {
  const { createRefreshTokenRepository } = await import(
    '@/lib/prisma-repositories/refreshTokenRepository'
  );

  return withTestPrismaClient(target, async (blockerClient) => (
    withTestPrismaClient(target, async (ownerClient) => (
      withTestPrismaClient(target, async (retryClient) => (
        withTestPrismaClient(target, async (monitorClient) => {
          const ownerRepository = createRefreshTokenRepository(ownerClient);
          const retryRepository = createRefreshTokenRepository(retryClient);
          const monitorRepository = createRefreshTokenRepository(monitorClient);
          const blockerReady = createDeferred<number>();
          const releaseBlocker = createDeferred<void>();
          let ownerPromise: Promise<RotationResult> | undefined;
          let retryPromise: Promise<RotationResult> | undefined;

          const blockerPromise = blockerClient.$transaction(async (tx) => {
            const backendRows = await tx.$queryRaw<Array<{ pid: number }>>`
              SELECT pg_backend_pid() AS "pid"
            `;
            const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
              SELECT "id"
              FROM "users"
              WHERE "id" = ${PRIMARY_USER_ID}::uuid
              FOR UPDATE
            `;
            if (backendRows.length !== 1 || lockedRows.length !== 1) {
              throw new Error('Rollback/retry blocker did not lock the primary User row.');
            }
            blockerReady.resolve(backendRows[0].pid);
            await releaseBlocker.promise;
          }, { timeout: 12_000 });
          void blockerPromise.catch((error: unknown) => blockerReady.reject(error));

          try {
            const blockerPid = await blockerReady.promise;
            ownerPromise = ownerRepository.rotate(
              `${ROOT_GENERATION_ID}.${ROOT_SECRET}`,
              createReplacement(
                now,
                WINNER_GENERATION_ID,
                WINNER_SECRET,
                WINNER_SALT,
                'approved',
                true,
              ),
            );
            void ownerPromise.catch(() => undefined);
            const ownerLock = await waitForUserLockOwner(monitorClient, blockerPid);

            releaseBlocker.resolve(undefined);
            const ownerSettlement = await ownerPromise.then(
              (value) => ({ status: 'fulfilled' as const, value }),
              (error: unknown) => ({ status: 'rejected' as const, error }),
            );
            await blockerPromise;
            if (ownerSettlement.status !== 'rejected') {
              throw new Error('Synthetic rollback owner unexpectedly committed.');
            }
            const markerReleased = !(await advisoryLockIsHeld(monitorClient, ownerLock.pid));

            retryPromise = retryRepository.rotate(
              `${ROOT_GENERATION_ID}.${ROOT_SECRET}`,
              createReplacement(
                now,
                CONTENDER_GENERATION_ID,
                CONTENDER_SECRET,
                CONTENDER_SALT,
                'approved',
              ),
            );
            void retryPromise.catch(() => undefined);
            const retryResult = await withDeadline(
              retryPromise,
              'legal rotation after owner rollback',
            );

            return {
              failedOwner: {
                status: 'rolled-back',
                safeError: ownerSettlement.error instanceof Error
                  ? ownerSettlement.error.message
                  : 'non-error rejection',
              },
              markerReleased,
              retry: safeRotationEvidence(retryResult),
              state: await readAuthorizationState(monitorClient, monitorRepository),
            };
          } finally {
            releaseBlocker.resolve(undefined);
            await Promise.allSettled([
              blockerPromise,
              ...(ownerPromise ? [ownerPromise] : []),
              ...(retryPromise ? [retryPromise] : []),
            ]);
          }
        })
      ))
    ))
  ));
}

async function runFreshOverlap(kind: OverlapKind, repetition: number): Promise<OverlapResult> {
  const target = await createIsolatedDatabase(runtime, `${kind}_${repetition}`);
  try {
    await applyMigrationsFromEmpty(target);
    const now = new Date();
    await seedAuthorizationFamilies(target, now);
    return await executeOverlap(target, kind, now);
  } finally {
    await dropIsolatedDatabase(target);
  }
}

async function runFreshFamilyIsolation(): Promise<FamilyIsolationResult> {
  const target = await createIsolatedDatabase(runtime, 'family_isolation');
  try {
    await applyMigrationsFromEmpty(target);
    const now = new Date();
    await seedAuthorizationFamilies(target, now);
    await seedSecondarySameUserFamily(target, now);
    return await executeFamilyIsolation(target, now);
  } finally {
    await dropIsolatedDatabase(target);
  }
}

async function runFreshGenerationIsolation(): Promise<GenerationIsolationResult> {
  const target = await createIsolatedDatabase(runtime, 'generation_isolation');
  try {
    await applyMigrationsFromEmpty(target);
    const now = new Date();
    await seedAuthorizationFamilies(target, now);
    await advancePrimaryFamilyToGenerationNPlusOne(target, now);
    return await executeGenerationIsolation(target, now);
  } finally {
    await dropIsolatedDatabase(target);
  }
}

async function runFreshRollbackThenRetry(): Promise<RollbackRetryResult> {
  const target = await createIsolatedDatabase(runtime, 'rollback_then_retry');
  try {
    await applyMigrationsFromEmpty(target);
    const now = new Date();
    await seedAuthorizationFamilies(target, now);
    return await executeRollbackThenRetry(target, now);
  } finally {
    await dropIsolatedDatabase(target);
  }
}

const ACTIVE_ISOLATED_FAMILY = {
  familyRevoked: false,
  tokenCount: 1,
  activeTokenCount: 1,
  sessionCount: 1,
  activeSessionCount: 1,
  usable: true,
} as const;

beforeAll(() => {
  originalSecurityPepper = process.env.SECURITY_PEPPER;
  process.env.SECURITY_PEPPER = TEST_SECURITY_PEPPER;
});

afterAll(() => {
  if (originalSecurityPepper === undefined) delete process.env.SECURITY_PEPPER;
  else process.env.SECURITY_PEPPER = originalSecurityPepper;
});

describe.sequential('refresh overlap classification through PostgreSQL contention', () => {
  it('classifies 20 same-context overlaps as one rotation plus one concurrent result', async () => {
    for (let repetition = 1; repetition <= 20; repetition += 1) {
      const result = await runFreshOverlap('same-context', repetition);
      expect(result, `same-context overlap repetition ${repetition}`).toEqual({
        owner: {
          status: 'rotated',
          familyId: PRIMARY_FAMILY_ID,
          oldId: ROOT_GENERATION_ID,
          replacementId: WINNER_GENERATION_ID,
          sessionId: WINNER_GENERATION_ID,
          sessionTokenIssued: true,
        },
        contender: { status: 'concurrent', familyId: PRIMARY_FAMILY_ID },
        ownerLockObserved: true,
        contenderWaitObserved: false,
        state: {
          primary: {
            familyRevoked: false,
            familyReason: null,
            tokenCount: 2,
            activeTokenCount: 1,
            revokedTokenCount: 1,
            descendantCount: 1,
            activeDescendantCount: 1,
            sessionCount: 2,
            activeSessionCount: 1,
            revokedSessionCount: 1,
            generationSessionPairingValid: true,
            rootUsable: false,
            replacementUsable: true,
            contenderUsable: false,
          },
          isolated: ACTIVE_ISOLATED_FAMILY,
        },
      });
    }
  }, 600_000);

  it('revokes after 15 different-context overlaps while preserving the approved winner result', async () => {
    for (let repetition = 1; repetition <= 15; repetition += 1) {
      const result = await runFreshOverlap('different-context', repetition);
      expect(result, `different-context overlap repetition ${repetition}`).toEqual({
        owner: {
          status: 'rotated',
          familyId: PRIMARY_FAMILY_ID,
          oldId: ROOT_GENERATION_ID,
          replacementId: WINNER_GENERATION_ID,
          sessionId: WINNER_GENERATION_ID,
          sessionTokenIssued: true,
        },
        contender: { status: 'replayed', familyId: PRIMARY_FAMILY_ID },
        ownerLockObserved: true,
        contenderWaitObserved: true,
        state: {
          primary: {
            familyRevoked: true,
            familyReason: 'suspicious_refresh_overlap',
            tokenCount: 2,
            activeTokenCount: 0,
            revokedTokenCount: 2,
            descendantCount: 1,
            activeDescendantCount: 0,
            sessionCount: 2,
            activeSessionCount: 0,
            revokedSessionCount: 2,
            generationSessionPairingValid: true,
            rootUsable: false,
            replacementUsable: false,
            contenderUsable: false,
          },
          isolated: ACTIVE_ISOLATED_FAMILY,
        },
      });
    }
  }, 600_000);

  it('does not let an invalid same-context session binding use the 409 shortcut', async () => {
    const result = await runFreshOverlap('same-context-invalid-binding', 1);
    expect(result).toEqual({
      owner: {
        status: 'rotated',
        familyId: PRIMARY_FAMILY_ID,
        oldId: ROOT_GENERATION_ID,
        replacementId: WINNER_GENERATION_ID,
        sessionId: WINNER_GENERATION_ID,
        sessionTokenIssued: true,
      },
      contender: { status: 'replayed', familyId: PRIMARY_FAMILY_ID },
      ownerLockObserved: true,
      contenderWaitObserved: true,
      state: {
        primary: {
          familyRevoked: true,
          familyReason: 'suspicious_refresh_overlap',
          tokenCount: 2,
          activeTokenCount: 0,
          revokedTokenCount: 2,
          descendantCount: 1,
          activeDescendantCount: 0,
          sessionCount: 2,
          activeSessionCount: 0,
          revokedSessionCount: 2,
          generationSessionPairingValid: true,
          rootUsable: false,
          replacementUsable: false,
          contenderUsable: false,
        },
        isolated: ACTIVE_ISOLATED_FAMILY,
      },
    });
  }, 120_000);

  it('never returns concurrent when two same-context replays start after the winner commit', async () => {
    const result = await runFreshOverlap('completed-replay-contention', 1);
    expect([result.owner.status, result.contender.status].sort()).toEqual([
      'invalid',
      'replayed',
    ]);
    expect({
      ownerLockObserved: result.ownerLockObserved,
      contenderWaitObserved: result.contenderWaitObserved,
      state: result.state,
    }).toEqual({
      ownerLockObserved: true,
      contenderWaitObserved: true,
      state: {
        primary: {
          familyRevoked: true,
          familyReason: 'refresh_token_replay',
          tokenCount: 2,
          activeTokenCount: 0,
          revokedTokenCount: 2,
          descendantCount: 1,
          activeDescendantCount: 0,
          sessionCount: 2,
          activeSessionCount: 0,
          revokedSessionCount: 2,
          generationSessionPairingValid: true,
          rootUsable: false,
          replacementUsable: false,
          contenderUsable: false,
        },
        isolated: ACTIVE_ISOLATED_FAMILY,
      },
    });
  }, 120_000);

  it('isolates simultaneous rotations by family, booking, and user', async () => {
    const result = await runFreshFamilyIsolation();
    const expectedRotatedFamilyState = {
      familyRevoked: false,
      tokenCount: 2,
      activeTokenCount: 1,
      descendantCount: 1,
      sessionCount: 2,
      activeSessionCount: 1,
      rootUsable: false,
      replacementUsable: true,
      generationSessionPairingValid: true,
    } as const;

    expect(result).toEqual({
      primary: {
        status: 'rotated',
        familyId: PRIMARY_FAMILY_ID,
        oldId: ROOT_GENERATION_ID,
        replacementId: WINNER_GENERATION_ID,
        sessionId: WINNER_GENERATION_ID,
        sessionTokenIssued: true,
      },
      secondarySameUserOtherBooking: {
        status: 'rotated',
        familyId: SECONDARY_FAMILY_ID,
        oldId: SECONDARY_ROOT_GENERATION_ID,
        replacementId: SECONDARY_REPLACEMENT_GENERATION_ID,
        sessionId: SECONDARY_REPLACEMENT_GENERATION_ID,
        sessionTokenIssued: true,
      },
      isolatedOtherUser: {
        status: 'rotated',
        familyId: ISOLATED_FAMILY_ID,
        oldId: ISOLATED_GENERATION_ID,
        replacementId: ISOLATED_REPLACEMENT_GENERATION_ID,
        sessionId: ISOLATED_REPLACEMENT_GENERATION_ID,
        sessionTokenIssued: true,
      },
      primaryMarkerObserved: true,
      secondaryMarkerObserved: true,
      isolatedCompletedWhilePrimaryUserBlocked: true,
      states: {
        primary: expectedRotatedFamilyState,
        secondarySameUserOtherBooking: expectedRotatedFamilyState,
        isolatedOtherUser: expectedRotatedFamilyState,
      },
    });
  }, 120_000);

  it('does not let generation N marker block rotation of active generation N+1', async () => {
    const result = await runFreshGenerationIsolation();
    expect(result).toEqual({
      rotation: {
        status: 'rotated',
        familyId: PRIMARY_FAMILY_ID,
        oldId: WINNER_GENERATION_ID,
        replacementId: NEXT_GENERATION_ID,
        sessionId: NEXT_GENERATION_ID,
        sessionTokenIssued: true,
      },
      predecessorMarkerHeldThroughCompletion: true,
      state: {
        familyRevoked: false,
        tokenCount: 3,
        activeTokenCount: 1,
        descendantCount: 2,
        sessionCount: 3,
        activeSessionCount: 1,
        rootUsable: false,
        replacementUsable: true,
        generationSessionPairingValid: true,
      },
      isolatedState: {
        familyRevoked: false,
        tokenCount: 1,
        activeTokenCount: 1,
        descendantCount: 0,
        sessionCount: 1,
        activeSessionCount: 1,
        rootUsable: true,
        replacementUsable: false,
        generationSessionPairingValid: true,
      },
    });
  }, 120_000);

  it('releases a rolled-back owner marker and permits the next legal refresh', async () => {
    const result = await runFreshRollbackThenRetry();
    expect(result).toEqual({
      failedOwner: {
        status: 'rolled-back',
        safeError: 'Synthetic rotation rollback after overlap ownership',
      },
      markerReleased: true,
      retry: {
        status: 'rotated',
        familyId: PRIMARY_FAMILY_ID,
        oldId: ROOT_GENERATION_ID,
        replacementId: CONTENDER_GENERATION_ID,
        sessionId: CONTENDER_GENERATION_ID,
        sessionTokenIssued: true,
      },
      state: {
        primary: {
          familyRevoked: false,
          familyReason: null,
          tokenCount: 2,
          activeTokenCount: 1,
          revokedTokenCount: 1,
          descendantCount: 1,
          activeDescendantCount: 1,
          sessionCount: 2,
          activeSessionCount: 1,
          revokedSessionCount: 1,
          generationSessionPairingValid: true,
          rootUsable: false,
          replacementUsable: false,
          contenderUsable: true,
        },
        isolated: ACTIVE_ISOLATED_FAMILY,
      },
    });
  }, 120_000);

  it('keeps fail-closed overlap revocation when the advisory-lock owner rolls back', async () => {
    const result = await runFreshOverlap('different-context-owner-rollback', 1);
    expect(result).toEqual({
      owner: {
        status: 'rolled-back',
        safeError: 'Synthetic rotation rollback after overlap ownership',
      },
      contender: { status: 'replayed', familyId: PRIMARY_FAMILY_ID },
      ownerLockObserved: true,
      contenderWaitObserved: true,
      state: {
        primary: {
          familyRevoked: true,
          familyReason: 'suspicious_refresh_overlap',
          tokenCount: 1,
          activeTokenCount: 0,
          revokedTokenCount: 1,
          descendantCount: 0,
          activeDescendantCount: 0,
          sessionCount: 1,
          activeSessionCount: 0,
          revokedSessionCount: 1,
          generationSessionPairingValid: true,
          rootUsable: false,
          replacementUsable: false,
          contenderUsable: false,
        },
        isolated: ACTIVE_ISOLATED_FAMILY,
      },
    });
  }, 120_000);
});
