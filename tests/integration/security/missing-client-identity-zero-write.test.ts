import { afterAll, describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';

import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
} from '../support/database-lifecycle';
import { withTestPrismaClient } from '../support/fixtures';
import { applyMigrationsFromEmpty } from '../support/migrations';
import { readDisposablePostgresRuntime } from '../support/runtime';

const runtime = readDisposablePostgresRuntime();
const managedEnvironment = [
  'BOOKING_REQUEST_WEBHOOK_URL',
  'DATABASE_URL',
  'LOG_CONSOLE',
  'ORIGIN_PROXY_SHARED_SECRET',
  'PRISMA_AUTO_DISCONNECT',
  'SECURITY_PEPPER',
] as const;
const originalEnvironment = new Map<string, string | undefined>();
type PrismaGlobal = typeof globalThis & { __prisma__?: PrismaClient };

interface DurableState {
  auditEvents: number;
  outboxEvents: number;
  privacyRequests: number;
  rateLimits: number;
  refreshFamilies: number;
  refreshTokens: number;
  sessions: number;
  stayRequests: number;
}

const EMPTY_DURABLE_STATE: DurableState = {
  auditEvents: 0,
  outboxEvents: 0,
  privacyRequests: 0,
  rateLimits: 0,
  refreshFamilies: 0,
  refreshTokens: 0,
  sessions: 0,
  stayRequests: 0,
};

function setApplicationEnvironment(databaseUrl: string): void {
  for (const name of managedEnvironment) {
    if (!originalEnvironment.has(name)) originalEnvironment.set(name, process.env[name]);
  }
  process.env.BOOKING_REQUEST_WEBHOOK_URL = 'https://webhook.example.invalid/booking';
  process.env.DATABASE_URL = databaseUrl;
  process.env.LOG_CONSOLE = 'false';
  process.env.PRISMA_AUTO_DISCONNECT = 'false';
  process.env.SECURITY_PEPPER = 'd1a-integration-security-pepper-only';
  process.env.ORIGIN_PROXY_SHARED_SECRET =
    '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2';
}

function restoreApplicationEnvironment(): void {
  for (const name of managedEnvironment) {
    const value = originalEnvironment.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function resetApplicationPrismaSingleton(): Promise<void> {
  const prismaGlobal = globalThis as PrismaGlobal;
  await prismaGlobal.__prisma__?.$disconnect();
  delete prismaGlobal.__prisma__;
  vi.resetModules();
}

async function durableState(prisma: PrismaClient): Promise<DurableState> {
  const [
    auditEvents,
    outboxEvents,
    privacyRequests,
    rateLimits,
    refreshFamilies,
    refreshTokens,
    sessions,
    stayRequests,
  ] = await Promise.all([
    prisma.securityAuditEvent.count(),
    prisma.outboxEvent.count(),
    prisma.privacyRequest.count(),
    prisma.rateLimit.count(),
    prisma.refreshTokenFamily.count(),
    prisma.refreshToken.count(),
    prisma.session.count(),
    prisma.stayRequest.count(),
  ]);
  return {
    auditEvents,
    outboxEvents,
    privacyRequests,
    rateLimits,
    refreshFamilies,
    refreshTokens,
    sessions,
    stayRequests,
  };
}

function bookingPayload(sequence: number): Record<string, unknown> {
  return {
    propertyName: 'D1A integration property',
    locale: 'en',
    dateRange: {
      from: '2030-06-01T00:00:00.000Z',
      to: '2030-06-08T00:00:00.000Z',
    },
    guest: {
      firstName: 'Integration',
      lastName: 'Guest',
      email: `d1a-${sequence}@example.invalid`,
      phone: '+12025550999',
    },
  };
}

describe.sequential('D1A missing client identity with live PostgreSQL', () => {
  afterAll(() => restoreApplicationEnvironment());

  it('leaves limiter and domain state untouched in three clean migrated databases', async () => {
    for (const sequence of [1, 2, 3]) {
      const target = await createIsolatedDatabase(runtime, `d1a_missing_identity_${sequence}`);
      try {
        await applyMigrationsFromEmpty(target);
        setApplicationEnvironment(target.databaseUrl);
        await resetApplicationPrismaSingleton();

        const [{ NextRequest }, bookingRoute] = await Promise.all([
          import('next/server'),
          import('@/app/api/booking-requests/route'),
        ]);

        const before = await withTestPrismaClient(target, durableState);
        expect(before).toEqual(EMPTY_DURABLE_STATE);

        const response = await bookingRoute.POST(new NextRequest(
          'http://integration.invalid/api/booking-requests',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': `d1a-missing-identity-${sequence}`,
              'user-agent': 'd1a-integration-client',
            },
            body: JSON.stringify(bookingPayload(sequence)),
          },
        ));
        const responseBody = await response.text();

        expect(response.status).toBe(503);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('retry-after')).toBeNull();
        expect(response.headers.get('set-cookie')).toBeNull();
        expect(responseBody).not.toMatch(/CLIENT_IDENTITY_UNAVAILABLE|x-forwarded-for|cf-connecting-ip|booking-request|198\.51\.100/iu);

        const afterUnavailable = await withTestPrismaClient(target, durableState);
        expect(afterUnavailable).toEqual(before);

        const { checkSensitiveRateLimit } = await import('@/lib/sensitiveRateLimit');
        const canonicalDecision = await checkSensitiveRateLimit(new NextRequest(
          'http://integration.invalid/api/canonical-control',
          { headers: {
            'x-origin-verified-client-ip': '198.51.100.240',
            'x-origin-proxy-attestation': process.env.ORIGIN_PROXY_SHARED_SECRET ?? '',
          } },
        ), {
          scope: `d1a-canonical-control-${sequence}`,
          limit: 3,
          windowMs: 60_000,
        });
        expect(canonicalDecision.allowed).toBe(true);

        const afterCanonicalControl = await withTestPrismaClient(target, durableState);
        expect(afterCanonicalControl).toEqual({ ...EMPTY_DURABLE_STATE, rateLimits: 1 });
      } finally {
        await resetApplicationPrismaSingleton();
        await dropIsolatedDatabase(target);
      }
    }
  });
});
