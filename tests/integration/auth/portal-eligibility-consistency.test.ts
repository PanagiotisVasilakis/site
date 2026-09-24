import { createHmac } from 'node:crypto';
import bcrypt from 'bcrypt';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';
import type { GuestSessionPayload } from '@/lib/guestSession';

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
const CLAIM_BOOKING_ID = '24000000-0000-4000-8000-000000000001';
const CLAIM_GRANT_ID = '34000000-0000-4000-8000-000000000001';
const CLAIM_TOKEN = `claim_${'C'.repeat(43)}`;
const CLAIM_PHONE = '+12025550131';
const CLAIM_PASSWORD = 'pr02c-claim-password-only';
const AUTH_USER_ID = '14000000-0000-4000-8000-000000000001';
const AUTH_BOOKING_ID = '24000000-0000-4000-8000-000000000002';
const VALID_AUTH_BOOKING_ID = '24000000-0000-4000-8000-000000000003';
const AUTH_SESSION_ID = '34000000-0000-4000-8000-000000000002';
const AUTH_FAMILY_ID = 'pr02c-eligibility-family';
const AUTH_PHONE = '+12025550132';
const AUTH_PASSWORD = 'pr02c-auth-password-only';
const REFRESH_SECRET = 'pr02c-refresh-secret-only';
const DEVICE_HASH = 'd'.repeat(64);
const IP_HASH = 'e'.repeat(64);
const CLAIM_TOKEN_PEPPER = 'pr02c-eligibility-claim-pepper-only';
const SECURITY_PEPPER = 'pr02c-eligibility-security-pepper-only';
const GUEST_JWT_SECRET = 'pr02c-eligibility-jwt-secret-only';

const managedEnvironment = [
  'CLAIM_TOKEN_PEPPER',
  'DATABASE_URL',
  'GUEST_JWT_SECRET',
  'LOG_CONSOLE',
  'PRISMA_AUTO_DISCONNECT',
  'SECURITY_PEPPER',
] as const;

type ManagedEnvironmentName = typeof managedEnvironment[number];
type PortalAuthModule = typeof import('@/lib/portalAuthService');
type GuestStoreModule = typeof import('@/lib/guestDataStore');
type GuestSessionModule = typeof import('@/lib/guestSession');
type CryptoModule = typeof import('@/lib/crypto');

interface EligibilityModules {
  portalAuth: PortalAuthModule;
  guestStore: GuestStoreModule['guestStore'];
  guestSession: GuestSessionModule;
  hashSensitive: CryptoModule['hashSensitive'];
}

interface BoundaryCase {
  label: string;
  startOffset: number;
  endOffset: number;
  eligible: boolean;
}

const boundaryCases: BoundaryCase[] = [
  { label: 'ended yesterday', startOffset: -5, endOffset: -1, eligible: false },
  { label: 'ends today', startOffset: -5, endOffset: 0, eligible: true },
  { label: 'starts today', startOffset: 0, endOffset: 3, eligible: true },
  { label: 'starts in one day', startOffset: 1, endOffset: 4, eligible: true },
  { label: 'starts in seven days', startOffset: 7, endOffset: 10, eligible: true },
  { label: 'starts in eight days', startOffset: 8, endOffset: 12, eligible: false },
  { label: 'has an inverted range', startOffset: 1, endOffset: 0, eligible: false },
];

let target: DisposableDatabaseTarget | undefined;
let applicationPrisma: PrismaClient | undefined;
let modules: EligibilityModules | undefined;
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
  if (!target) throw new Error('Disposable eligibility database was not initialized.');
  return target;
}

function requireModules(): EligibilityModules {
  if (!modules) throw new Error('Eligibility modules were not initialized.');
  return modules;
}

async function loadModules(): Promise<EligibilityModules> {
  const [portalAuth, guestDataStore, guestSession, cryptoModule] = await Promise.all([
    import('@/lib/portalAuthService'),
    import('@/lib/guestDataStore'),
    import('@/lib/guestSession'),
    import('@/lib/crypto'),
  ]);
  return {
    portalAuth,
    guestStore: guestDataStore.guestStore,
    guestSession,
    hashSensitive: cryptoModule.hashSensitive,
  };
}

async function seedBoundary(
  targetDatabase: DisposableDatabaseTarget,
  boundary: BoundaryCase,
  loadedModules: EligibilityModules,
): Promise<void> {
  const now = new Date();
  const startDate = utcDateOffset(now, boundary.startOffset);
  const endDate = utcDateOffset(now, boundary.endOffset);
  const claimTokenDigest = createHmac('sha256', CLAIM_TOKEN_PEPPER)
    .update(CLAIM_TOKEN, 'utf8')
    .digest('hex');
  const passwordHash = await bcrypt.hash(AUTH_PASSWORD, 4);
  const refreshHash = loadedModules.hashSensitive(REFRESH_SECRET);

  await withTestPrismaClient(targetDatabase, async (prisma) => {
    await prisma.user.create({
      data: {
        id: AUTH_USER_ID,
        phoneE164: AUTH_PHONE,
        passwordHash,
        countryOrigin: 'ABROAD',
      },
    });
    await prisma.booking.createMany({
      data: [
        {
          id: CLAIM_BOOKING_ID,
          source: 'EXTERNAL',
          startDate,
          endDate,
          provider: 'pr02c-claim-consistency',
          externalReference: `claim-${boundary.label}`,
          accessStatus: 'PENDING',
        },
        {
          id: AUTH_BOOKING_ID,
          source: 'EXTERNAL',
          startDate,
          endDate,
          userId: AUTH_USER_ID,
          provider: 'pr02c-auth-consistency',
          externalReference: `auth-${boundary.label}`,
          accessStatus: 'VERIFIED',
          claimedAt: now,
        },
      ],
    });
    await prisma.bookingClaimGrant.create({
      data: {
        id: CLAIM_GRANT_ID,
        bookingId: CLAIM_BOOKING_ID,
        tokenDigest: claimTokenDigest,
        channel: 'REMOTE',
        expiresAt: new Date(now.getTime() + 60 * 60_000),
      },
    });
    await prisma.session.create({
      data: {
        id: AUTH_SESSION_ID,
        userId: AUTH_USER_ID,
        bookingId: AUTH_BOOKING_ID,
        expiresAt: new Date(now.getTime() + 2 * 60 * 60_000),
      },
    });
    await prisma.refreshTokenFamily.create({
      data: {
        id: AUTH_FAMILY_ID,
        userId: AUTH_USER_ID,
        absoluteExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
        deviceHash: DEVICE_HASH,
        ipHash: IP_HASH,
      },
    });
    await prisma.refreshToken.create({
      data: {
        id: AUTH_SESSION_ID,
        userId: AUTH_USER_ID,
        tokenHash: refreshHash.hash,
        salt: refreshHash.salt,
        familyId: AUTH_FAMILY_ID,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000),
        deviceHint: DEVICE_HASH,
        ipHint: IP_HASH,
      },
    });
  }, 'seed');
}

async function resetEligibilityState(targetDatabase: DisposableDatabaseTarget): Promise<void> {
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
    ]);
  }, 'cleanup');
}

async function claimDecision(loadedModules: EligibilityModules): Promise<string> {
  try {
    await loadedModules.portalAuth.consumeBookingClaimGrant({
      tokenDigest: createHmac('sha256', CLAIM_TOKEN_PEPPER)
        .update(CLAIM_TOKEN, 'utf8')
        .digest('hex'),
      phone: CLAIM_PHONE,
      origin: 'ABROAD',
      password: CLAIM_PASSWORD,
    });
    return 'allow';
  } catch (error) {
    if (error instanceof loadedModules.portalAuth.PortalAuthError) return error.code;
    throw error;
  }
}

async function loginDecision(loadedModules: EligibilityModules): Promise<string> {
  try {
    await loadedModules.portalAuth.authenticatePortalUser({
      phone: AUTH_PHONE,
      password: AUTH_PASSWORD,
    });
    return 'allow';
  } catch (error) {
    if (error instanceof loadedModules.portalAuth.PortalAuthError) return error.code;
    throw error;
  }
}

async function safeState(targetDatabase: DisposableDatabaseTarget): Promise<{
  claim: {
    userCreated: boolean;
    ownerSet: boolean;
    verified: boolean;
    consumed: boolean;
    terms: number;
    successAudits: number;
  };
  refresh: {
    familyRevoked: boolean;
    reason: string | null;
    originalSessionRevoked: boolean;
    originalTokenRevoked: boolean;
    descendants: number;
  };
}> {
  return withTestPrismaClient(targetDatabase, async (prisma) => {
    const [claimUser, claimBooking, claimGrant, terms, successAudits, family, session, token, descendants] =
      await Promise.all([
        prisma.user.findUnique({ where: { phoneE164: CLAIM_PHONE } }),
        prisma.booking.findUniqueOrThrow({ where: { id: CLAIM_BOOKING_ID } }),
        prisma.bookingClaimGrant.findUniqueOrThrow({ where: { id: CLAIM_GRANT_ID } }),
        prisma.termsAcceptance.count({ where: { bookingId: CLAIM_BOOKING_ID } }),
        prisma.securityAuditEvent.count({ where: { eventType: 'portal.booking_claimed' } }),
        prisma.refreshTokenFamily.findUniqueOrThrow({ where: { id: AUTH_FAMILY_ID } }),
        prisma.session.findUniqueOrThrow({ where: { id: AUTH_SESSION_ID } }),
        prisma.refreshToken.findUniqueOrThrow({ where: { id: AUTH_SESSION_ID } }),
        prisma.refreshToken.count({ where: { rotatedFromId: AUTH_SESSION_ID } }),
      ]);

    return {
      claim: {
        userCreated: Boolean(claimUser),
        ownerSet: claimBooking.userId === claimUser?.id,
        verified: claimBooking.accessStatus === 'VERIFIED',
        consumed: Boolean(claimGrant.consumedAt),
        terms,
        successAudits,
      },
      refresh: {
        familyRevoked: Boolean(family.revokedAt),
        reason: family.revocationReason,
        originalSessionRevoked: Boolean(session.revokedAt),
        originalTokenRevoked: Boolean(token.revokedAt),
        descendants,
      },
    };
  });
}

describe.sequential('portal temporal eligibility consistency', () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
    target = await createIsolatedDatabase(runtime, 'portal_eligibility');
    await applyMigrationsFromEmpty(target);
    setApplicationEnvironment(target.databaseUrl);
    applicationPrisma = (await import('@/lib/prisma')).prisma;
    modules = await loadModules();
  });

  afterEach(async () => {
    if (target) await resetEligibilityState(target);
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
      vi.useRealTimers();
    }
  });

  it.each(boundaryCases)('$label produces one temporal decision across every auth flow', async (
    boundary,
  ) => {
    const eligibilityTarget = requireTarget();
    const loadedModules = requireModules();
    await seedBoundary(eligibilityTarget, boundary, loadedModules);

    const sessionPayload: GuestSessionPayload = {
      type: 'guest',
      sid: AUTH_SESSION_ID,
      user: { id: AUTH_USER_ID },
      booking: { id: AUTH_BOOKING_ID },
    };
    const claim = await claimDecision(loadedModules);
    const login = await loginDecision(loadedModules);
    const session = Boolean(
      await loadedModules.guestSession.verifyGuestSessionAccess(sessionPayload),
    );
    const refresh = await loadedModules.guestStore.rotateRefreshToken(
      `${AUTH_SESSION_ID}.${REFRESH_SECRET}`,
      7,
      {
        device_hint: DEVICE_HASH,
        ip_hint: IP_HASH,
        presented_session: {
          status: 'present',
          sessionId: AUTH_SESSION_ID,
          userId: AUTH_USER_ID,
          bookingId: AUTH_BOOKING_ID,
        },
      },
    );
    const state = await safeState(eligibilityTarget);

    expect({ claim, login, session, refresh: refresh.status }).toEqual(boundary.eligible
      ? { claim: 'allow', login: 'allow', session: true, refresh: 'rotated' }
      : {
        claim: 'INVALID_CLAIM',
        login: 'NO_ELIGIBLE_BOOKING',
        session: false,
        refresh: 'invalid',
      });
    expect(state.claim).toEqual(boundary.eligible
      ? {
        userCreated: true,
        ownerSet: true,
        verified: true,
        consumed: true,
        terms: 1,
        successAudits: 1,
      }
      : {
        userCreated: false,
        ownerSet: false,
        verified: false,
        consumed: false,
        terms: 0,
        successAudits: 0,
      });
    expect(state.refresh).toEqual(boundary.eligible
      ? {
        familyRevoked: false,
        reason: null,
        originalSessionRevoked: true,
        originalTokenRevoked: true,
        descendants: 1,
      }
      : {
        familyRevoked: true,
        reason: 'booking_ineligible',
        originalSessionRevoked: true,
        originalTokenRevoked: true,
        descendants: 0,
      });
  });

  it('skips an earlier inverted booking when a later owned booking is eligible', async () => {
    const eligibilityTarget = requireTarget();
    const loadedModules = requireModules();
    await seedBoundary(eligibilityTarget, {
      label: 'earlier-inverted-candidate',
      startOffset: 1,
      endOffset: 0,
      eligible: false,
    }, loadedModules);
    const now = new Date();
    await withTestPrismaClient(eligibilityTarget, async (prisma) => {
      await prisma.booking.create({
        data: {
          id: VALID_AUTH_BOOKING_ID,
          source: 'EXTERNAL',
          startDate: utcDateOffset(now, 2),
          endDate: utcDateOffset(now, 5),
          userId: AUTH_USER_ID,
          provider: 'pr02c-auth-consistency',
          externalReference: 'later-valid-booking',
          accessStatus: 'VERIFIED',
          claimedAt: now,
        },
      });
    }, 'seed');

    const login = await loadedModules.portalAuth.authenticatePortalUser({
      phone: AUTH_PHONE,
      password: AUTH_PASSWORD,
    });
    expect(login).toEqual({ userId: AUTH_USER_ID, bookingId: VALID_AUTH_BOOKING_ID });
  });
});
