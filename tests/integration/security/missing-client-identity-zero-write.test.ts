import type { NextRequest } from 'next/server';
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
  'DATABASE_URL',
  'ORIGIN_PROXY_SHARED_SECRET',
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
}

const EMPTY_DURABLE_STATE: DurableState = {
  auditEvents: 0,
  outboxEvents: 0,
  privacyRequests: 0,
  rateLimits: 0,
  refreshFamilies: 0,
  refreshTokens: 0,
  sessions: 0,
};

function setApplicationEnvironment(databaseUrl: string): void {
  for (const name of managedEnvironment) {
    if (!originalEnvironment.has(name)) originalEnvironment.set(name, process.env[name]);
  }
  process.env.DATABASE_URL = databaseUrl;
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
  ] = await Promise.all([
    prisma.securityAuditEvent.count(),
    prisma.outboxEvent.count(),
    prisma.privacyRequest.count(),
    prisma.rateLimit.count(),
    prisma.refreshTokenFamily.count(),
    prisma.refreshToken.count(),
    prisma.session.count(),
  ]);
  return {
    auditEvents,
    outboxEvents,
    privacyRequests,
    rateLimits,
    refreshFamilies,
    refreshTokens,
    sessions,
  };
}

// Unauthenticated public writes: each stores a security_audit_events row only
// after its per-address and global limiter calls.
const PUBLIC_WRITE_ROUTES: ReadonlyArray<{
  path: string;
  tag: string;
  contentType: string;
  body: (sequence: number) => Record<string, unknown>;
  load: () => Promise<(request: NextRequest) => Promise<Response>>;
}> = [
  {
    path: '/api/errors',
    tag: 'errors',
    contentType: 'application/json',
    body: (sequence) => ({
      error: { name: 'Error', message: `d1a integration report ${sequence}` },
      context: { url: 'http://integration.invalid/en', timestamp: new Date().toISOString() },
    }),
    load: async () => {
      const { POST } = await import('@/app/api/errors/route');
      return (request) => POST(request, { params: Promise.resolve({}) });
    },
  },
  {
    path: '/api/security/csp-report',
    tag: 'csp',
    contentType: 'application/csp-report',
    body: (sequence) => ({
      'csp-report': {
        'document-uri': 'http://integration.invalid/en',
        'violated-directive': 'script-src-elem',
        'blocked-uri': `https://cdn.example.invalid/d1a-${sequence}.js`,
      },
    }),
    load: async () => {
      const { POST } = await import('@/app/api/security/csp-report/route');
      return (request) => POST(request);
    },
  },
];

describe.sequential('D1A missing client identity with live PostgreSQL', () => {
  afterAll(() => restoreApplicationEnvironment());

  it.each(PUBLIC_WRITE_ROUTES)('leaves limiter and audit state untouched for $path in three clean migrated databases', async (route) => {
    for (const sequence of [1, 2, 3]) {
      const target = await createIsolatedDatabase(runtime, `d1a_noid_${route.tag}_${sequence}`);
      try {
        await applyMigrationsFromEmpty(target);
        setApplicationEnvironment(target.databaseUrl);
        await resetApplicationPrismaSingleton();

        const [{ NextRequest }, post] = await Promise.all([
          import('next/server'),
          route.load(),
        ]);

        const before = await withTestPrismaClient(target, durableState);
        expect(before).toEqual(EMPTY_DURABLE_STATE);

        const response = await post(new NextRequest(
          `http://integration.invalid${route.path}`,
          {
            method: 'POST',
            headers: {
              'content-type': route.contentType,
              'user-agent': 'd1a-integration-client',
            },
            body: JSON.stringify(route.body(sequence)),
          },
        ));
        const responseBody = await response.text();

        expect(response.status).toBe(503);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('retry-after')).toBeNull();
        expect(response.headers.get('set-cookie')).toBeNull();
        expect(responseBody).not.toMatch(/CLIENT_IDENTITY_UNAVAILABLE|x-forwarded-for|cf-connecting-ip|client-error-report|csp-report|198\.51\.100/iu);

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
