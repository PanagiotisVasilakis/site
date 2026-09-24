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
  'LOG_CONSOLE',
  'ORIGIN_PROXY_SHARED_SECRET',
  'PRISMA_AUTO_DISCONNECT',
  'SECURITY_PEPPER',
] as const;
const originalEnvironment = new Map<string, string | undefined>();
type PrismaGlobal = typeof globalThis & { __prisma__?: PrismaClient };

function setApplicationEnvironment(databaseUrl: string): void {
  for (const name of managedEnvironment) {
    if (!originalEnvironment.has(name)) originalEnvironment.set(name, process.env[name]);
  }
  process.env.DATABASE_URL = databaseUrl;
  process.env.LOG_CONSOLE = 'false';
  process.env.PRISMA_AUTO_DISCONNECT = 'false';
  process.env.SECURITY_PEPPER = 'a3-integration-security-pepper-only';
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

describe.sequential('A3 layered rate limiting with live PostgreSQL', () => {
  afterAll(() => restoreApplicationEnvironment());

  it('keeps public reads write-free and rolls back every limiter dimension on failure', async () => {
    const target = await createIsolatedDatabase(runtime, 'a3_layered_rate_limiting');
    try {
      await applyMigrationsFromEmpty(target);
      setApplicationEnvironment(target.databaseUrl);
      await resetApplicationPrismaSingleton();

      const [
        { NextRequest },
        liveRoute,
        readinessRoute,
        limiterModule,
        privacyModule,
        operationalModule,
      ] = await Promise.all([
        import('next/server'),
        import('@/app/api/health/live/route'),
        import('@/app/api/health/ready/route'),
        import('@/lib/sensitiveRateLimit'),
        import('@/lib/privacyHash'),
        import('@/lib/operationalMonitor'),
      ]);

      expect(await withTestPrismaClient(target, (prisma) => prisma.rateLimit.count())).toBe(0);
      expect(liveRoute.GET().status).toBe(200);
      expect(await withTestPrismaClient(target, (prisma) => prisma.rateLimit.count())).toBe(0);
      expect((await readinessRoute.GET()).status).toBe(200);
      expect(await withTestPrismaClient(target, (prisma) => prisma.rateLimit.count())).toBe(0);

      const headers = {
        'x-origin-verified-client-ip': '198.51.100.73',
        'x-origin-proxy-attestation': process.env.ORIGIN_PROXY_SHARED_SECRET ?? '',
      };
      const allowed = await limiterModule.checkSensitiveRateLimit(new NextRequest(
        'http://integration.invalid/api/sensitive-control',
        { headers },
      ), { scope: 'a3-control', limit: 3, windowMs: 60_000 });
      expect(allowed.allowed).toBe(true);
      expect(await withTestPrismaClient(target, (prisma) => prisma.rateLimit.count())).toBe(1);

      await withTestPrismaClient(target, async (prisma) => {
        await prisma.rateLimit.updateMany({ data: { resetTime: new Date(Date.now() - 1_000) } });
        await prisma.rateLimit.create({
          data: { key: 'a3-retention-future', count: 1, resetTime: new Date(Date.now() + 60_000) },
        });
      });
      expect((await operationalModule.runRetention()).rateLimits).toBe(1);
      expect(await withTestPrismaClient(target, (prisma) => prisma.rateLimit.count())).toBe(1);

      await withTestPrismaClient(target, async (prisma) => {
        await prisma.rateLimit.deleteMany();
        const rejectedKey = `sensitive:${privacyModule.privacyHmac(
          'a3-rollback|identifier:rollback@example.invalid',
          'sensitive-rate-limit:v1',
        )}`;
        await prisma.$executeRawUnsafe(`
          CREATE FUNCTION a3_reject_limiter_key() RETURNS trigger AS $$
          BEGIN
            IF NEW.key = '${rejectedKey}' THEN
              RAISE EXCEPTION 'synthetic limiter failure';
            END IF;
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
          CREATE TRIGGER a3_reject_limiter_key_trigger
          BEFORE INSERT OR UPDATE ON rate_limits
          FOR EACH ROW EXECUTE FUNCTION a3_reject_limiter_key();
        `);
      });

      await expect(limiterModule.checkSensitiveRateLimit(new NextRequest(
        'http://integration.invalid/api/sensitive-rollback',
        { headers },
      ), {
        scope: 'a3-rollback',
        identifier: 'rollback@example.invalid',
        limit: 3,
        windowMs: 60_000,
      })).rejects.toMatchObject({ statusCode: 503, message: 'Service temporarily unavailable' });

      expect(await withTestPrismaClient(target, (prisma) => prisma.rateLimit.count())).toBe(0);
    } finally {
      await resetApplicationPrismaSingleton();
      await dropIsolatedDatabase(target);
    }
  });
});
