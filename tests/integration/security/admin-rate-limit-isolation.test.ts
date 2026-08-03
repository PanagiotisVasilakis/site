import { createHash } from 'node:crypto';
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
const ATTESTATION = '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2';
const ADMIN_CREDENTIAL = createHash('sha256')
  .update('rem-04-postgres-admin-credential-fixture', 'utf8')
  .digest('base64url');
const SOURCE_A = '203.0.113.41';
const SOURCE_B = '198.51.100.92';
const managedEnvironment = [
  'ADMIN_DASH_SECRET',
  'ADMIN_JWT_SECRET',
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
  process.env.ADMIN_DASH_SECRET = ADMIN_CREDENTIAL;
  process.env.ADMIN_JWT_SECRET = 'rem-04-postgres-admin-jwt-secret-32-byte-minimum';
  process.env.DATABASE_URL = databaseUrl;
  process.env.LOG_CONSOLE = 'false';
  process.env.ORIGIN_PROXY_SHARED_SECRET = ATTESTATION;
  process.env.PRISMA_AUTO_DISCONNECT = 'false';
  process.env.SECURITY_PEPPER = 'rem-04-postgres-security-pepper-fixture-only';
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

async function loadRouteModules() {
  return Promise.all([
    import('next/server'),
    import('@/app/api/admin/login/route'),
    import('@/lib/privacyHash'),
  ]);
}

function adminRequest(
  NextRequest: typeof import('next/server').NextRequest,
  source: string,
  token: string,
  publicForwardedSource = '192.0.2.200',
) {
  return new NextRequest('http://integration.invalid/api/admin/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-origin-verified-client-ip': source,
      'x-origin-proxy-attestation': ATTESTATION,
      'cf-connecting-ip': publicForwardedSource,
      'x-real-ip': publicForwardedSource,
      'x-forwarded-for': publicForwardedSource,
      forwarded: `for=${publicForwardedSource};proto=https`,
    },
    body: JSON.stringify({ token }),
  });
}

async function responseBody(response: Response): Promise<string> {
  return response.text();
}

describe.sequential('REM-04 admin source-budget isolation with live PostgreSQL', () => {
  afterAll(() => restoreApplicationEnvironment());

  it('keeps source B available after source A saturates and resets only A after expiry', async () => {
    const target = await createIsolatedDatabase(runtime, 'rem04_admin_source_isolation');
    try {
      await applyMigrationsFromEmpty(target);
      setApplicationEnvironment(target.databaseUrl);
      await resetApplicationPrismaSingleton();
      const [{ NextRequest }, adminRoute, { privacyHmac }] = await loadRouteModules();

      const invalidBodies: string[] = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await adminRoute.POST(
          adminRequest(
            NextRequest,
            SOURCE_A,
            `invalid-admin-credential-${attempt}`,
            `192.0.2.${attempt + 1}`,
          ),
          { params: Promise.resolve({}) },
        );
        expect(response.status).toBe(401);
        invalidBodies.push(await responseBody(response));
      }
      expect(new Set(invalidBodies)).toEqual(new Set(['{"error":"Unauthorized"}']));

      const sourceBResponse = await adminRoute.POST(
        adminRequest(NextRequest, SOURCE_B, ADMIN_CREDENTIAL, SOURCE_A),
        { params: Promise.resolve({}) },
      );
      expect(sourceBResponse.status).toBe(200);
      expect(await responseBody(sourceBResponse)).toBe('{"success":true}');
      expect(sourceBResponse.headers.get('set-cookie')).toContain('admin_jwt=');

      const sourceASixth = await adminRoute.POST(
        adminRequest(NextRequest, SOURCE_A, 'invalid-admin-credential-6', SOURCE_B),
        { params: Promise.resolve({}) },
      );
      expect(sourceASixth.status).toBe(429);
      expect(await responseBody(sourceASixth)).toBe('{"error":"Too many authentication attempts"}');

      const sourceAKey = `sensitive:${privacyHmac(
        `admin-login|ip:${SOURCE_A}`,
        'sensitive-rate-limit:v1',
      )}`;
      const sourceBKey = `sensitive:${privacyHmac(
        `admin-login|ip:${SOURCE_B}`,
        'sensitive-rate-limit:v1',
      )}`;
      const rows = await withTestPrismaClient(target, (prisma) => prisma.rateLimit.findMany({
        orderBy: { key: 'asc' },
      }));
      expect(new Map(rows.map((row) => [row.key, row.count]))).toEqual(new Map([
        [sourceAKey, 6],
        [sourceBKey, 1],
      ]));
      expect(await withTestPrismaClient(target, (prisma) => prisma.adminSession.count())).toBe(1);

      const persistedMaterial = JSON.stringify(rows);
      for (const forbidden of [SOURCE_A, SOURCE_B, ADMIN_CREDENTIAL, 'identifier:admin']) {
        expect(persistedMaterial).not.toContain(forbidden);
      }

      await withTestPrismaClient(target, (prisma) => prisma.rateLimit.update({
        where: { key: sourceAKey },
        data: { resetTime: new Date(Date.now() - 1_000) },
      }));
      const afterReset = await adminRoute.POST(
        adminRequest(NextRequest, SOURCE_A, 'invalid-admin-credential-after-reset'),
        { params: Promise.resolve({}) },
      );
      expect(afterReset.status).toBe(401);
      expect(await responseBody(afterReset)).toBe('{"error":"Unauthorized"}');
      expect(await withTestPrismaClient(target, async (prisma) => (
        (await prisma.rateLimit.findUniqueOrThrow({ where: { key: sourceAKey } })).count
      ))).toBe(1);
    } finally {
      await resetApplicationPrismaSingleton();
      await dropIsolatedDatabase(target);
    }
  });

  it('atomically limits concurrent attempts from A while preserving an independent B login', async () => {
    const target = await createIsolatedDatabase(runtime, 'rem04_admin_source_concurrency');
    try {
      await applyMigrationsFromEmpty(target);
      setApplicationEnvironment(target.databaseUrl);
      await resetApplicationPrismaSingleton();
      const [{ NextRequest }, adminRoute, { privacyHmac }] = await loadRouteModules();

      const attempts = await Promise.all(Array.from({ length: 6 }, (_, index) => (
        adminRoute.POST(
          adminRequest(
            NextRequest,
            SOURCE_A,
            `concurrent-invalid-admin-${index}`,
            `192.0.2.${index + 20}`,
          ),
          { params: Promise.resolve({}) },
        )
      )));
      expect(attempts.map((response) => response.status).sort()).toEqual([401, 401, 401, 401, 401, 429]);

      const sourceBResponse = await adminRoute.POST(
        adminRequest(NextRequest, SOURCE_B, ADMIN_CREDENTIAL, SOURCE_A),
        { params: Promise.resolve({}) },
      );
      expect(sourceBResponse.status).toBe(200);

      const sourceAKey = `sensitive:${privacyHmac(
        `admin-login|ip:${SOURCE_A}`,
        'sensitive-rate-limit:v1',
      )}`;
      const sourceBKey = `sensitive:${privacyHmac(
        `admin-login|ip:${SOURCE_B}`,
        'sensitive-rate-limit:v1',
      )}`;
      const rows = await withTestPrismaClient(target, (prisma) => prisma.rateLimit.findMany());
      expect(new Map(rows.map((row) => [row.key, row.count]))).toEqual(new Map([
        [sourceAKey, 6],
        [sourceBKey, 1],
      ]));
      expect(await withTestPrismaClient(target, (prisma) => prisma.adminSession.count())).toBe(1);
    } finally {
      await resetApplicationPrismaSingleton();
      await dropIsolatedDatabase(target);
    }
  });

  it('rolls back and returns a generic 503 when the source limiter write fails', async () => {
    const target = await createIsolatedDatabase(runtime, 'rem04_admin_source_failure');
    try {
      await applyMigrationsFromEmpty(target);
      setApplicationEnvironment(target.databaseUrl);
      await resetApplicationPrismaSingleton();
      const [{ NextRequest }, adminRoute, { privacyHmac }] = await loadRouteModules();
      const rejectedKey = `sensitive:${privacyHmac(
        `admin-login|ip:${SOURCE_A}`,
        'sensitive-rate-limit:v1',
      )}`;

      await withTestPrismaClient(target, (prisma) => prisma.$executeRawUnsafe(`
        CREATE FUNCTION rem04_reject_limiter_key() RETURNS trigger AS $$
        BEGIN
          IF NEW.key = '${rejectedKey}' THEN
            RAISE EXCEPTION 'synthetic private limiter diagnostics';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER rem04_reject_limiter_key_trigger
        BEFORE INSERT OR UPDATE ON rate_limits
        FOR EACH ROW EXECUTE FUNCTION rem04_reject_limiter_key();
      `));

      const response = await adminRoute.POST(
        adminRequest(NextRequest, SOURCE_A, ADMIN_CREDENTIAL),
        { params: Promise.resolve({}) },
      );
      const body = await responseBody(response);
      expect(response.status).toBe(503);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(body).toMatch(/temporarily unavailable/iu);
      expect(body).not.toMatch(/diagnostics|database|rate_limits|203\.0\.113/iu);
      expect(await withTestPrismaClient(target, (prisma) => prisma.rateLimit.count())).toBe(0);
      expect(await withTestPrismaClient(target, (prisma) => prisma.adminSession.count())).toBe(0);
    } finally {
      await resetApplicationPrismaSingleton();
      await dropIsolatedDatabase(target);
    }
  });
});
