import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminSession: vi.fn(),
  signAdmin: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  logger: {
    setContext: vi.fn(),
    getContext: vi.fn(),
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/auth/admin', () => ({
  createAdminSession: mocks.createAdminSession,
  signAdmin: mocks.signAdmin,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: mocks.transaction },
}));

vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));

import { POST as adminLogin } from '@/app/api/admin/login/route';
import { privacyHmac } from '@/lib/privacyHash';

const ATTESTATION = '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2';
const ADMIN_CREDENTIAL = createHash('sha256')
  .update('rem-04-admin-credential-fixture', 'utf8')
  .digest('base64url');
const SOURCE_A = '203.0.113.41';
const SOURCE_B = '198.51.100.92';

function adminRequest(
  source: string,
  token: string,
  publicForwardedSource = '192.0.2.200',
  identifier?: string,
): NextRequest {
  return new NextRequest('https://admin.example.invalid/api/admin/login', {
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
    body: JSON.stringify({ token, ...(identifier ? { identifier } : {}) }),
  });
}

async function login(request: NextRequest): Promise<{ body: string; response: Response }> {
  const response = await adminLogin(request, { params: Promise.resolve({}) });
  return { response, body: await response.text() };
}

describe('admin login source-budget isolation', () => {
  const counts = new Map<string, number>();

  beforeEach(() => {
    counts.clear();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_DASH_SECRET', ADMIN_CREDENTIAL);
    vi.stubEnv('ADMIN_JWT_SECRET', 'rem-04-admin-jwt-secret-fixture-32-bytes-minimum');
    vi.stubEnv('ORIGIN_PROXY_SHARED_SECRET', ATTESTATION);
    vi.stubEnv('SECURITY_PEPPER', 'rem-04-security-pepper-fixture-only');

    mocks.createAdminSession.mockResolvedValue({ id: 'rem-04-admin-session', loginAt: 1_785_600_000 });
    mocks.signAdmin.mockReturnValue('rem-04-admin-jwt');
    mocks.queryRaw.mockImplementation(async (_query: TemplateStringsArray, key: string, resetAt: Date) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return [{ count, reset_time: resetAt }];
    });
    mocks.transaction.mockImplementation(async (callback) => callback({ $queryRaw: mocks.queryRaw }));
  });

  it('constrains source A without letting spoofed forwarding values lock out source B', async () => {
    const invalidBodies: string[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await login(adminRequest(
        SOURCE_A,
        `invalid-admin-credential-${attempt}`,
        `192.0.2.${attempt + 1}`,
      ));
      expect(result.response.status).toBe(401);
      invalidBodies.push(result.body);
    }
    expect(new Set(invalidBodies)).toEqual(new Set(['{"error":"Unauthorized"}']));

    const sourceB = await login(adminRequest(SOURCE_B, ADMIN_CREDENTIAL, SOURCE_A));
    expect(sourceB.response.status).toBe(200);
    expect(sourceB.body).toBe('{"success":true}');
    expect(sourceB.response.headers.get('set-cookie')).toContain('admin_jwt=rem-04-admin-jwt');

    const sourceASixth = await login(adminRequest(SOURCE_A, 'invalid-admin-credential-6', SOURCE_B));
    expect(sourceASixth.response.status).toBe(429);
    expect(sourceASixth.body).toBe('{"error":"Too many authentication attempts"}');

    const sourceAKey = `sensitive:${privacyHmac(
      `admin-login|ip:${SOURCE_A}`,
      'sensitive-rate-limit:v1',
    )}`;
    const sourceBKey = `sensitive:${privacyHmac(
      `admin-login|ip:${SOURCE_B}`,
      'sensitive-rate-limit:v1',
    )}`;
    expect(counts).toEqual(new Map([
      [sourceAKey, 6],
      [sourceBKey, 1],
    ]));
    expect(mocks.createAdminSession).toHaveBeenCalledOnce();
    expect(mocks.signAdmin).toHaveBeenCalledOnce();

    const persistedMaterial = JSON.stringify([...counts.keys()]);
    for (const forbidden of [SOURCE_A, SOURCE_B, ADMIN_CREDENTIAL, 'identifier:admin']) {
      expect(persistedMaterial).not.toContain(forbidden);
    }
    expect([...counts.keys()]).toEqual([
      expect.stringMatching(/^sensitive:[a-f0-9]{64}$/u),
      expect.stringMatching(/^sensitive:[a-f0-9]{64}$/u),
    ]);
  });

  it('ignores attacker-supplied administrator hints without changing invalid responses', async () => {
    const knownHint = await login(adminRequest(
      SOURCE_A,
      'same-length-invalid-token-a',
      '192.0.2.10',
      'known-administrator',
    ));
    const unknownHint = await login(adminRequest(
      SOURCE_B,
      'same-length-invalid-token-b',
      '192.0.2.11',
      'unknown-administrator',
    ));

    expect(knownHint.response.status).toBe(401);
    expect(unknownHint.response.status).toBe(401);
    expect(knownHint.body).toBe(unknownHint.body);
    expect(mocks.createAdminSession).not.toHaveBeenCalled();
    expect(counts).toHaveLength(2);
  });

  it('fails closed before session issuance when the limiter store fails', async () => {
    mocks.queryRaw.mockRejectedValueOnce(new Error('synthetic private database diagnostics'));

    const result = await login(adminRequest(SOURCE_A, ADMIN_CREDENTIAL));

    expect(result.response.status).toBe(503);
    expect(result.response.headers.get('set-cookie')).toBeNull();
    expect(result.body).toMatch(/temporarily unavailable/iu);
    expect(result.body).not.toMatch(/database|diagnostics|203\.0\.113/iu);
    expect(mocks.createAdminSession).not.toHaveBeenCalled();
    expect(mocks.signAdmin).not.toHaveBeenCalled();
  });
});
