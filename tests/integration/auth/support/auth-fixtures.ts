import type { PrismaClient } from '@/generated/prisma/client';

import type { DisposableDatabaseTarget } from '../../support/database-safety';
import { withTestPrismaClient } from '../../support/fixtures';

export interface AuthPrincipalFixture {
  userId: string;
  bookingId: string;
  familyId: string;
  email: string;
  phoneE164: string;
  provider: string;
  externalReference: string;
}

export const REVOKED_SESSION_FIXTURE: AuthPrincipalFixture = {
  userId: '11000000-0000-4000-8000-000000000001',
  bookingId: '21000000-0000-4000-8000-000000000001',
  familyId: 'pr02a-primary-refresh-family',
  email: 'revoked-session-guest@example.invalid',
  phoneE164: '+12025550101',
  provider: 'integration-auth-fixture',
  externalReference: 'revoked-session-booking-001',
};

export const ISOLATED_AUTH_FIXTURE: AuthPrincipalFixture = {
  userId: '11000000-0000-4000-8000-000000000002',
  bookingId: '21000000-0000-4000-8000-000000000002',
  familyId: 'pr02a-isolated-refresh-family',
  email: 'isolated-session-guest@example.invalid',
  phoneE164: '+12025550102',
  provider: 'integration-auth-fixture',
  externalReference: 'isolated-session-booking-002',
};

export const ALTERNATE_BOOKING_FIXTURE = {
  bookingId: '21000000-0000-4000-8000-000000000003',
  provider: 'integration-auth-fixture',
  externalReference: 'alternate-session-booking-003',
} as const;

export interface SafeAuthStateSnapshot {
  users: number;
  bookings: number;
  sessions: {
    total: number;
    active: number;
    expired: number;
    revoked: number;
  };
  refreshFamilies: {
    total: number;
    active: number;
    expired: number;
    revoked: number;
  };
  refreshTokens: {
    total: number;
    active: number;
    expired: number;
    revoked: number;
    descendants: number;
    activeDescendants: number;
  };
}

export interface AuthFixtureSeedOptions {
  includeAlternateBooking?: boolean;
  includeIsolatedPrincipal?: boolean;
}

export interface SafeAuthSnapshotScope {
  userId?: string;
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

async function createPrincipal(
  prisma: PrismaClient,
  fixture: AuthPrincipalFixture,
  now: Date,
): Promise<void> {
  await prisma.user.create({
    data: {
      id: fixture.userId,
      email: fixture.email,
      phoneE164: fixture.phoneE164,
      countryOrigin: 'ABROAD',
    },
  });
  await prisma.booking.create({
    data: {
      id: fixture.bookingId,
      source: 'EXTERNAL',
      startDate: utcDateOffset(now, -1),
      endDate: utcDateOffset(now, 7),
      userId: fixture.userId,
      provider: fixture.provider,
      externalReference: fixture.externalReference,
      accessStatus: 'VERIFIED',
      claimedAt: now,
    },
  });
}

export async function seedAuthEligibilityFixtures(
  target: DisposableDatabaseTarget,
  now: Date,
  options: AuthFixtureSeedOptions = {},
): Promise<void> {
  await withTestPrismaClient(target, async (prisma: PrismaClient) => {
    await createPrincipal(prisma, REVOKED_SESSION_FIXTURE, now);

    if (options.includeAlternateBooking) {
      await prisma.booking.create({
        data: {
          id: ALTERNATE_BOOKING_FIXTURE.bookingId,
          source: 'EXTERNAL',
          startDate: utcDateOffset(now, 1),
          endDate: utcDateOffset(now, 8),
          userId: REVOKED_SESSION_FIXTURE.userId,
          provider: ALTERNATE_BOOKING_FIXTURE.provider,
          externalReference: ALTERNATE_BOOKING_FIXTURE.externalReference,
          accessStatus: 'VERIFIED',
          claimedAt: now,
        },
      });
    }

    if (options.includeIsolatedPrincipal) {
      await createPrincipal(prisma, ISOLATED_AUTH_FIXTURE, now);
    }
  }, 'seed');
}

export async function seedRevokedSessionEligibilityFixture(
  target: DisposableDatabaseTarget,
  now: Date,
): Promise<void> {
  await seedAuthEligibilityFixtures(target, now);
}

export async function expireSessionForFixture(
  target: DisposableDatabaseTarget,
  sessionId: string,
  asOf: Date,
): Promise<void> {
  await withTestPrismaClient(target, async (prisma: PrismaClient) => {
    const updated = await prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { expiresAt: new Date(asOf.getTime() - 60_000) },
    });
    if (updated.count !== 1) {
      throw new Error('Synthetic session-expiry fixture did not match exactly one session.');
    }
  }, 'seed');
}

export async function expireRefreshFamilyForFixture(
  target: DisposableDatabaseTarget,
  familyId: string,
  asOf: Date,
): Promise<void> {
  await withTestPrismaClient(target, async (prisma: PrismaClient) => {
    const updated = await prisma.refreshTokenFamily.updateMany({
      where: { id: familyId, revokedAt: null },
      data: { absoluteExpiresAt: new Date(asOf.getTime() - 60_000) },
    });
    if (updated.count !== 1) {
      throw new Error('Synthetic family-expiry fixture did not match exactly one family.');
    }
  }, 'seed');
}

export async function revokeSessionOnlyForFailureFixture(
  target: DisposableDatabaseTarget,
  sessionId: string,
  revokedAt: Date,
): Promise<void> {
  await withTestPrismaClient(target, async (prisma: PrismaClient) => {
    const updated = await prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt },
    });
    if (updated.count !== 1) {
      throw new Error('Synthetic revoked-session failure fixture did not match exactly one session.');
    }
  }, 'failure-fixture');
}

export async function resetAuthFixtures(
  target: DisposableDatabaseTarget,
): Promise<void> {
  await withTestPrismaClient(target, async (prisma: PrismaClient) => {
    await prisma.$transaction([
      prisma.refreshToken.deleteMany(),
      prisma.refreshTokenFamily.deleteMany(),
      prisma.session.deleteMany(),
      prisma.booking.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  }, 'cleanup');
}

export async function safeAuthStateSnapshot(
  target: DisposableDatabaseTarget,
  asOf: Date,
  scope: SafeAuthSnapshotScope = {},
): Promise<SafeAuthStateSnapshot> {
  return withTestPrismaClient(target, async (prisma: PrismaClient) => {
    const userWhere = scope.userId ? { id: scope.userId } : undefined;
    const relatedWhere = scope.userId ? { userId: scope.userId } : undefined;
    const [
      users,
      bookings,
      sessions,
      refreshFamilies,
      refreshTokens,
    ] = await Promise.all([
      prisma.user.count({ where: userWhere }),
      prisma.booking.count({ where: relatedWhere }),
      prisma.session.findMany({
        where: relatedWhere,
        select: { expiresAt: true, revokedAt: true },
      }),
      prisma.refreshTokenFamily.findMany({
        where: relatedWhere,
        select: { absoluteExpiresAt: true, revokedAt: true },
      }),
      prisma.refreshToken.findMany({
        where: relatedWhere,
        select: { expiresAt: true, revokedAt: true, rotatedFromId: true },
      }),
    ]);

    return {
      users,
      bookings,
      sessions: {
        total: sessions.length,
        active: sessions.filter((session) => !session.revokedAt && session.expiresAt > asOf).length,
        expired: sessions.filter((session) => !session.revokedAt && session.expiresAt <= asOf).length,
        revoked: sessions.filter((session) => Boolean(session.revokedAt)).length,
      },
      refreshFamilies: {
        total: refreshFamilies.length,
        active: refreshFamilies.filter(
          (family) => !family.revokedAt && family.absoluteExpiresAt > asOf,
        ).length,
        expired: refreshFamilies.filter(
          (family) => !family.revokedAt && family.absoluteExpiresAt <= asOf,
        ).length,
        revoked: refreshFamilies.filter((family) => Boolean(family.revokedAt)).length,
      },
      refreshTokens: {
        total: refreshTokens.length,
        active: refreshTokens.filter((token) => !token.revokedAt && token.expiresAt > asOf).length,
        expired: refreshTokens.filter((token) => !token.revokedAt && token.expiresAt <= asOf).length,
        revoked: refreshTokens.filter((token) => Boolean(token.revokedAt)).length,
        descendants: refreshTokens.filter((token) => Boolean(token.rotatedFromId)).length,
        activeDescendants: refreshTokens.filter(
          (token) => Boolean(token.rotatedFromId) && !token.revokedAt && token.expiresAt > asOf,
        ).length,
      },
    };
  });
}
