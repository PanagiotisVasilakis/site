import bcrypt from 'bcrypt';
import { fork } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';
import { GUEST_TERMS_CONTENT_HASH, GUEST_TERMS_VERSION } from '@/lib/guestTerms';

import type { DisposableDatabaseTarget } from '../support/database-safety';
import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
} from '../support/database-lifecycle';
import { withTestPrismaClient } from '../support/fixtures';
import { applyMigrationsFromEmpty } from '../support/migrations';
import {
  readDisposablePostgresRuntime,
  REPOSITORY_ROOT,
  safeChildEnvironment,
} from '../support/runtime';
import {
  claimRaceClaimant,
  CLAIM_RACE_BOOKING_ID,
  CLAIM_RACE_GRANT_ID,
  CLAIM_RACE_JWT_SECRET,
  CLAIM_RACE_SECURITY_PEPPER,
  CLAIM_RACE_SIBLING_GRANT_ID,
  CLAIM_RACE_SIBLING_TOKEN,
  CLAIM_RACE_TOKEN,
  CLAIM_RACE_TOKEN_PEPPER,
  type ClaimRaceActor,
  type ClaimRaceScenario,
  type SafeClaimRaceWorkerEvidence,
} from './support/claim-route-worker';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

interface BlockedActivity {
  applicationName: string;
  pid: number;
  waitEventType: string | null;
  query: string;
  blockingPids: number[];
}

interface ClaimWorkerMessage {
  type: 'claim-race-result';
  evidence: SafeClaimRaceWorkerEvidence;
}

interface ClaimWorkerFailureMessage {
  type: 'claim-race-worker-failure';
  phase: string;
  errorCode: string | null;
}

interface ClaimWorkerResult {
  evidence: SafeClaimRaceWorkerEvidence;
  diagnosticsRedacted: boolean;
}

interface ClaimWorkerHandle {
  result: Promise<ClaimWorkerResult>;
  terminate: () => void;
}

interface SafeClaimRaceState {
  users: number;
  ownerUserId: string | null;
  ownerPhone: string | null;
  ownerPasswordHash: string | null;
  bookingVerified: boolean;
  bookingClaimed: boolean;
  targetGrantConsumed: boolean;
  targetGrantRevoked: boolean;
  siblingGrantConsumed: boolean;
  siblingGrantRevoked: boolean;
  terms: number;
  termsBoundToOwner: boolean;
  termsContractCurrent: boolean;
  audits: number;
  auditBoundToBooking: boolean;
  auditIpHashed: boolean;
  sessions: number;
  families: number;
  tokens: number;
  activeSessions: number;
  activeFamilies: number;
  activeTokens: number;
  generationPaired: boolean;
  graphBoundToOwnerAndBooking: boolean;
  contextHashesBound: boolean;
  descendants: number;
  rateLimitRecords: number;
  rateLimitCounts: number[];
}

interface ClaimRaceResult {
  workers: [ClaimWorkerResult, ClaimWorkerResult];
  barrierWaiters: number;
  state: SafeClaimRaceState;
}

const runtime = readDisposablePostgresRuntime();
const CLAIM_WORKER_PATH = fileURLToPath(new URL('./support/claim-route-worker.ts', import.meta.url));
const CLAIM_WORKER_TIMEOUT_MS = 30_000;
const DATABASE_BARRIER_TIMEOUT_MS = 8_000;
const MAX_WORKER_OUTPUT_BYTES = 128 * 1_024;
const A2_REPETITIONS = 15;
const A3_REPETITIONS = 15;

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

function tokenDigest(token: string): string {
  return createHmac('sha256', CLAIM_RACE_TOKEN_PEPPER)
    .update(token, 'utf8')
    .digest('hex');
}

async function seedClaimRace(target: DisposableDatabaseTarget): Promise<void> {
  const now = new Date();
  await withTestPrismaClient(target, async (prisma) => {
    await prisma.$transaction(async (tx) => {
      await tx.booking.create({
        data: {
          id: CLAIM_RACE_BOOKING_ID,
          source: 'EXTERNAL',
          startDate: utcDateOffset(now, -1),
          endDate: utcDateOffset(now, 7),
          provider: 'pr02b-claim-race',
          externalReference: 'one-winner-booking',
          accessStatus: 'PENDING',
        },
      });
      await tx.bookingClaimGrant.createMany({
        data: [
          {
            id: CLAIM_RACE_GRANT_ID,
            bookingId: CLAIM_RACE_BOOKING_ID,
            tokenDigest: tokenDigest(CLAIM_RACE_TOKEN),
            channel: 'REMOTE',
            expiresAt: new Date(now.getTime() + 30 * 60_000),
          },
          {
            id: CLAIM_RACE_SIBLING_GRANT_ID,
            bookingId: CLAIM_RACE_BOOKING_ID,
            tokenDigest: tokenDigest(CLAIM_RACE_SIBLING_TOKEN),
            channel: 'REMOTE',
            expiresAt: new Date(now.getTime() + 30 * 60_000),
          },
        ],
      });
    });
  }, 'seed');
}

function databaseUrlWithApplicationName(
  target: DisposableDatabaseTarget,
  applicationName: string,
): string {
  const url = new URL(target.databaseUrl);
  url.searchParams.set('application_name', applicationName);
  return url.toString();
}

function isWorkerResultMessage(message: unknown): message is ClaimWorkerMessage {
  return Boolean(message
    && typeof message === 'object'
    && (message as { type?: unknown }).type === 'claim-race-result'
    && (message as { evidence?: unknown }).evidence
    && typeof (message as { evidence?: unknown }).evidence === 'object');
}

function isWorkerFailureMessage(message: unknown): message is ClaimWorkerFailureMessage {
  return Boolean(message
    && typeof message === 'object'
    && (message as { type?: unknown }).type === 'claim-race-worker-failure');
}

function spawnClaimWorker(
  target: DisposableDatabaseTarget,
  scenario: ClaimRaceScenario,
  actor: ClaimRaceActor,
  applicationName: string,
): ClaimWorkerHandle {
  const child = fork(CLAIM_WORKER_PATH, [], {
    cwd: REPOSITORY_ROOT,
    env: {
      ...safeChildEnvironment(),
      CLAIM_RACE_ACTOR: actor,
      CLAIM_RACE_SCENARIO: scenario,
      CLAIM_RACE_WORKER: '1',
      CLAIM_TOKEN_PEPPER: CLAIM_RACE_TOKEN_PEPPER,
      DATABASE_URL: databaseUrlWithApplicationName(target, applicationName),
      GUEST_JWT_SECRET: CLAIM_RACE_JWT_SECRET,
      LOG_CONSOLE: 'false',
      PRISMA_AUTO_DISCONNECT: 'false',
      SECURITY_PEPPER: CLAIM_RACE_SECURITY_PEPPER,
      // safeChildEnvironment deliberately strips application configuration.
      // Re-declare the private ingress attestation for these route workers.
      ORIGIN_PROXY_SHARED_SECRET:
        '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2',
    },
    execArgv: ['--import', 'tsx'],
    serialization: 'json',
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  const claimant = claimRaceClaimant(scenario, actor);
  const forbiddenDiagnostics = [
    CLAIM_RACE_TOKEN,
    CLAIM_RACE_SIBLING_TOKEN,
    CLAIM_RACE_TOKEN_PEPPER,
    CLAIM_RACE_SECURITY_PEPPER,
    CLAIM_RACE_JWT_SECRET,
    claimant.phone,
    claimant.password,
    target.databaseUrl,
    target.runtime.password,
    target.runtime.user,
  ];
  const output: Buffer[] = [];
  let outputBytes = 0;
  let outputOverflow = false;
  let receivedEvidence: SafeClaimRaceWorkerEvidence | undefined;
  let receivedFailure: ClaimWorkerFailureMessage | undefined;
  let settled = false;

  const captureOutput = (chunk: Buffer) => {
    if (outputOverflow) return;
    if (outputBytes + chunk.byteLength > MAX_WORKER_OUTPUT_BYTES) {
      outputOverflow = true;
      child.kill('SIGKILL');
      return;
    }
    output.push(chunk);
    outputBytes += chunk.byteLength;
  };
  child.stdout?.on('data', captureOutput);
  child.stderr?.on('data', captureOutput);

  const result = new Promise<ClaimWorkerResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error('Claim race worker exceeded its bounded deadline.'));
    }, CLAIM_WORKER_TIMEOUT_MS);

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    child.on('message', (message: unknown) => {
      if (isWorkerResultMessage(message)) receivedEvidence = message.evidence;
      else if (isWorkerFailureMessage(message)) receivedFailure = message;
      else fail(new Error('Claim race worker returned an invalid IPC message.'));
    });
    child.once('error', () => fail(new Error('Claim race worker could not start.')));
    child.once('exit', (code, signal) => {
      if (settled) return;
      if (outputOverflow) {
        fail(new Error('Claim race worker exceeded its diagnostic output limit.'));
        return;
      }
      if (receivedFailure) {
        fail(new Error(
          `Claim race worker failed in ${receivedFailure.phase} (${receivedFailure.errorCode ?? 'no-code'}).`,
        ));
        return;
      }
      if (code !== 0 || signal || !receivedEvidence) {
        fail(new Error('Claim race worker exited without safe result evidence.'));
        return;
      }

      settled = true;
      clearTimeout(timeout);
      const diagnosticText = Buffer.concat(output).toString('utf8');
      resolve({
        evidence: receivedEvidence,
        diagnosticsRedacted: forbiddenDiagnostics.every(
          (secret) => !diagnosticText.includes(secret),
        ),
      });
    });
  });

  return {
    result,
    terminate: () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    },
  };
}

async function waitForBlockedWorkers(
  monitor: PrismaClient,
  applicationNames: readonly string[],
  blockerPid: number,
  scenario: ClaimRaceScenario,
): Promise<number> {
  const deadline = Date.now() + DATABASE_BARRIER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const rows = await monitor.$queryRaw<BlockedActivity[]>`
      SELECT
        activity."application_name" AS "applicationName",
        activity."pid" AS "pid",
        activity."wait_event_type" AS "waitEventType",
        activity."query" AS "query",
        pg_blocking_pids(activity."pid") AS "blockingPids"
      FROM "pg_stat_activity" AS activity
      WHERE activity."datname" = current_database()
        AND activity."state" = 'active'
        AND activity."pid" <> pg_backend_pid()
    `;
    const workerRows = rows.filter((row) => (
      applicationNames.includes(row.applicationName)
      && row.waitEventType === 'Lock'
      && (scenario === 'a2'
        ? /UPDATE[\s\S]*"booking_claim_grants"/i.test(row.query)
        : /INSERT[\s\S]*"users"/i.test(row.query))
    ));
    const workerPids = new Set(workerRows.map((row) => row.pid));
    const blockedApplications = new Set(workerRows.filter((row) => (
      row.blockingPids.some((pid) => pid === blockerPid || workerPids.has(pid))
    )).map((row) => row.applicationName));
    const blockerAnchorsWaitGraph = workerRows.some((row) => (
      row.blockingPids.includes(blockerPid)
    ));
    if (blockerAnchorsWaitGraph
      && applicationNames.every((name) => blockedApplications.has(name))) {
      return blockedApplications.size;
    }

    // Yield only; PostgreSQL lock ownership, not elapsed time, opens the barrier.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for the database-observed ${scenario.toUpperCase()} claim barrier.`);
}

async function readSafeClaimRaceState(
  target: DisposableDatabaseTarget,
): Promise<SafeClaimRaceState> {
  return withTestPrismaClient(target, async (prisma) => {
    const now = new Date();
    const [
      users,
      booking,
      targetGrant,
      siblingGrant,
      terms,
      audits,
      sessions,
      families,
      tokens,
      rateLimits,
    ] = await Promise.all([
      prisma.user.findMany({ select: { id: true, phoneE164: true, passwordHash: true } }),
      prisma.booking.findUniqueOrThrow({ where: { id: CLAIM_RACE_BOOKING_ID } }),
      prisma.bookingClaimGrant.findUniqueOrThrow({ where: { id: CLAIM_RACE_GRANT_ID } }),
      prisma.bookingClaimGrant.findUniqueOrThrow({ where: { id: CLAIM_RACE_SIBLING_GRANT_ID } }),
      prisma.termsAcceptance.findMany({
        where: { bookingId: CLAIM_RACE_BOOKING_ID },
        select: {
          bookingId: true,
          userId: true,
          termsVersion: true,
          contentHash: true,
        },
      }),
      prisma.securityAuditEvent.findMany({
        where: { eventType: 'portal.booking_claimed' },
        select: { details: true, ipHash: true, path: true },
      }),
      prisma.session.findMany({
        select: {
          id: true,
          userId: true,
          bookingId: true,
          expiresAt: true,
          revokedAt: true,
        },
      }),
      prisma.refreshTokenFamily.findMany({
        select: {
          id: true,
          userId: true,
          absoluteExpiresAt: true,
          revokedAt: true,
          deviceHash: true,
          ipHash: true,
        },
      }),
      prisma.refreshToken.findMany({
        select: {
          id: true,
          userId: true,
          familyId: true,
          expiresAt: true,
          revokedAt: true,
          rotatedFromId: true,
          deviceHint: true,
          ipHint: true,
        },
      }),
      prisma.rateLimit.findMany({ select: { count: true } }),
    ]);
    const owner = users.find((user) => user.id === booking.userId);
    const session = sessions[0];
    const family = families[0];
    const token = tokens[0];
    const auditDetails = audits[0]?.details;
    const auditRecord = auditDetails
      && typeof auditDetails === 'object'
      && !Array.isArray(auditDetails)
      ? auditDetails as Record<string, unknown>
      : undefined;

    return {
      users: users.length,
      ownerUserId: owner?.id ?? null,
      ownerPhone: owner?.phoneE164 ?? null,
      ownerPasswordHash: owner?.passwordHash ?? null,
      bookingVerified: booking.accessStatus === 'VERIFIED',
      bookingClaimed: Boolean(booking.claimedAt),
      targetGrantConsumed: Boolean(targetGrant.consumedAt),
      targetGrantRevoked: Boolean(targetGrant.revokedAt),
      siblingGrantConsumed: Boolean(siblingGrant.consumedAt),
      siblingGrantRevoked: Boolean(siblingGrant.revokedAt),
      terms: terms.length,
      termsBoundToOwner: terms.length === 1
        && terms[0]?.bookingId === booking.id
        && terms[0]?.userId === owner?.id,
      termsContractCurrent: terms.length === 1
        && terms[0]?.termsVersion === GUEST_TERMS_VERSION
        && terms[0]?.contentHash === GUEST_TERMS_CONTENT_HASH,
      audits: audits.length,
      auditBoundToBooking: audits.length === 1
        && audits[0]?.path === '/api/portal/claims'
        && auditRecord?.bookingId === booking.id
        && auditRecord.channel === 'REMOTE',
      auditIpHashed: audits.length === 1 && audits[0]?.ipHash?.length === 64,
      sessions: sessions.length,
      families: families.length,
      tokens: tokens.length,
      activeSessions: sessions.filter(
        (record) => !record.revokedAt && record.expiresAt > now,
      ).length,
      activeFamilies: families.filter(
        (record) => !record.revokedAt && record.absoluteExpiresAt > now,
      ).length,
      activeTokens: tokens.filter(
        (record) => !record.revokedAt && record.expiresAt > now,
      ).length,
      generationPaired: Boolean(
        session && token && session.id === token.id,
      ),
      graphBoundToOwnerAndBooking: Boolean(
        owner
        && session
        && family
        && token
        && session.userId === owner.id
        && session.bookingId === booking.id
        && family.userId === owner.id
        && token.userId === owner.id
        && token.familyId === family.id,
      ),
      contextHashesBound: Boolean(
        family
        && token
        && family.deviceHash?.length === 64
        && family.ipHash?.length === 64
        && token.deviceHint === family.deviceHash
        && token.ipHint === family.ipHash,
      ),
      descendants: tokens.filter((record) => Boolean(record.rotatedFromId)).length,
      rateLimitRecords: rateLimits.length,
      rateLimitCounts: rateLimits.map((record) => record.count).sort((left, right) => left - right),
    };
  });
}

async function executeClaimRace(
  target: DisposableDatabaseTarget,
  scenario: ClaimRaceScenario,
  repetition: number,
): Promise<ClaimRaceResult> {
  return withTestPrismaClient(target, async (blocker) => (
    withTestPrismaClient(target, async (monitor) => {
      const blockerReady = createDeferred<number>();
      const releaseBlocker = createDeferred<void>();
      const applicationNames = [
        `pr02b_${scenario}_${repetition}_a`,
        `pr02b_${scenario}_${repetition}_b`,
      ] as const;
      let workers: [ClaimWorkerHandle, ClaimWorkerHandle] | undefined;

      const blockerPromise = blocker.$transaction(async (tx) => {
        const backend = await tx.$queryRaw<Array<{ pid: number }>>`
          SELECT pg_backend_pid() AS "pid"
        `;
        if (backend.length !== 1) throw new Error('Claim race blocker backend is ambiguous.');

        if (scenario === 'a2') {
          const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "booking_claim_grants"
            WHERE "id" = ${CLAIM_RACE_GRANT_ID}::uuid
            FOR UPDATE
          `;
          if (locked.length !== 1) throw new Error('A2 blocker did not lock the claim grant.');
        } else {
          await tx.$executeRawUnsafe('LOCK TABLE "users" IN SHARE MODE');
        }
        blockerReady.resolve(backend[0].pid);
        await releaseBlocker.promise;
      }, { timeout: 20_000 });
      void blockerPromise.catch((error: unknown) => blockerReady.reject(error));

      try {
        const blockerPid = await blockerReady.promise;
        workers = [
          spawnClaimWorker(target, scenario, 'a', applicationNames[0]),
          spawnClaimWorker(target, scenario, 'b', applicationNames[1]),
        ];
        for (const worker of workers) void worker.result.catch(() => undefined);

        const barrierWaiters = await waitForBlockedWorkers(
          monitor,
          applicationNames,
          blockerPid,
          scenario,
        );
        releaseBlocker.resolve(undefined);
        const [workerA, workerB] = await Promise.all([
          workers[0].result,
          workers[1].result,
          blockerPromise,
        ]).then(([first, second]) => [first, second] as const);

        return {
          workers: [workerA, workerB],
          barrierWaiters,
          state: await readSafeClaimRaceState(target),
        };
      } finally {
        releaseBlocker.resolve(undefined);
        await Promise.allSettled([
          blockerPromise,
          ...(workers?.map((worker) => worker.result) ?? []),
        ]);
        workers?.forEach((worker) => worker.terminate());
      }
    })
  ));
}

async function runFreshClaimRace(
  scenario: ClaimRaceScenario,
  repetition: number,
): Promise<ClaimRaceResult> {
  const target = await createIsolatedDatabase(runtime, `${scenario}_claim_${repetition}`);
  try {
    await applyMigrationsFromEmpty(target);
    await seedClaimRace(target);
    return await executeClaimRace(target, scenario, repetition);
  } finally {
    await dropIsolatedDatabase(target);
  }
}

function successfulWorker(result: ClaimRaceResult): ClaimWorkerResult {
  const winners = result.workers.filter((worker) => worker.evidence.status === 200);
  expect(winners).toHaveLength(1);
  return winners[0];
}

function losingWorker(result: ClaimRaceResult): ClaimWorkerResult {
  const losers = result.workers.filter((worker) => worker.evidence.status !== 200);
  expect(losers).toHaveLength(1);
  return losers[0];
}

async function expectOneWinnerGraph(
  result: ClaimRaceResult,
  scenario: ClaimRaceScenario,
): Promise<void> {
  const winner = successfulWorker(result);
  const winnerClaimant = claimRaceClaimant(scenario, winner.evidence.actor);
  expect(result.barrierWaiters).toBe(2);
  expect(result.workers.every((worker) => worker.diagnosticsRedacted)).toBe(true);
  expect(result.workers.every((worker) => worker.evidence.responseRedacted)).toBe(true);
  expect(winner.evidence).toEqual({
    actor: winner.evidence.actor,
    status: 200,
    success: true,
    errorCode: null,
    errorMessage: null,
    bookingId: CLAIM_RACE_BOOKING_ID,
    sessionCookie: {
      present: true,
      cleared: false,
      maxAge: 7_200,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    },
    refreshCookie: {
      present: true,
      cleared: false,
      maxAge: 7 * 24 * 60 * 60,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    },
    sessionBinding: {
      sessionId: winner.evidence.sessionBinding?.sessionId,
      userId: result.state.ownerUserId,
      bookingId: CLAIM_RACE_BOOKING_ID,
    },
    refreshGenerationId: winner.evidence.sessionBinding?.sessionId,
    responseRedacted: true,
  });
  expect(result.state).toMatchObject({
    users: 1,
    ownerPhone: winnerClaimant.phone,
    bookingVerified: true,
    bookingClaimed: true,
    targetGrantConsumed: true,
    targetGrantRevoked: false,
    siblingGrantConsumed: false,
    siblingGrantRevoked: true,
    terms: 1,
    termsBoundToOwner: true,
    termsContractCurrent: true,
    audits: 1,
    auditBoundToBooking: true,
    auditIpHashed: true,
    sessions: 1,
    families: 1,
    tokens: 1,
    activeSessions: 1,
    activeFamilies: 1,
    activeTokens: 1,
    generationPaired: true,
    graphBoundToOwnerAndBooking: true,
    contextHashesBound: true,
    descendants: 0,
  });
  expect(result.state.ownerPasswordHash).not.toBeNull();
  expect(await bcrypt.compare(
    winnerClaimant.password,
    result.state.ownerPasswordHash ?? '',
  )).toBe(true);
}

describe.sequential('booking claim concurrency characterization', () => {
  it(`A2 produces one different-identity winner across ${A2_REPETITIONS} fresh databases`, async () => {
    for (let repetition = 1; repetition <= A2_REPETITIONS; repetition += 1) {
      const result = await runFreshClaimRace('a2', repetition);
      await expectOneWinnerGraph(result, 'a2');
      const loser = losingWorker(result);
      const loserClaimant = claimRaceClaimant('a2', loser.evidence.actor);

      expect(loser.evidence).toEqual({
        actor: loser.evidence.actor,
        status: 401,
        success: false,
        errorCode: 'UNAUTHORIZED',
        errorMessage: 'The claim token or account credentials are invalid',
        bookingId: null,
        sessionCookie: {
          present: false,
          cleared: false,
          maxAge: null,
          httpOnly: false,
          sameSite: null,
          path: null,
        },
        refreshCookie: {
          present: false,
          cleared: false,
          maxAge: null,
          httpOnly: false,
          sameSite: null,
          path: null,
        },
        sessionBinding: null,
        refreshGenerationId: null,
        responseRedacted: true,
      });
      expect(result.state.ownerPhone).not.toBe(loserClaimant.phone);
      expect(result.state.rateLimitRecords).toBe(4);
      expect(result.state.rateLimitCounts).toEqual([1, 1, 2, 2]);
    }
  });

  it(`A3 pins one identical-claim winner and generic 401 loser across ${A3_REPETITIONS} fresh databases`, async () => {
    for (let repetition = 1; repetition <= A3_REPETITIONS; repetition += 1) {
      const result = await runFreshClaimRace('a3', repetition);
      await expectOneWinnerGraph(result, 'a3');
      const loser = losingWorker(result);

      expect(loser.evidence).toEqual({
        actor: loser.evidence.actor,
        status: 401,
        success: false,
        errorCode: 'UNAUTHORIZED',
        errorMessage: 'The claim token or account credentials are invalid',
        bookingId: null,
        sessionCookie: {
          present: false,
          cleared: false,
          maxAge: null,
          httpOnly: false,
          sameSite: null,
          path: null,
        },
        refreshCookie: {
          present: false,
          cleared: false,
          maxAge: null,
          httpOnly: false,
          sameSite: null,
          path: null,
        },
        sessionBinding: null,
        refreshGenerationId: null,
        responseRedacted: true,
      });
      expect(result.state.rateLimitRecords).toBe(3);
      expect(result.state.rateLimitCounts).toEqual([2, 2, 2]);
    }
  });
});
