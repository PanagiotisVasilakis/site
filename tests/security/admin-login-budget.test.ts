import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminSession: vi.fn(),
  signAdmin: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  auditCreate: vi.fn(),
  auditCreateMany: vi.fn(),
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
  prisma: {
    $transaction: mocks.transaction,
    $executeRaw: mocks.executeRaw,
    securityAuditEvent: { create: mocks.auditCreate, createMany: mocks.auditCreateMany },
  },
}));
vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));

import { POST as adminLogin } from '@/app/api/admin/login/route';
import { privacyHmac } from '@/lib/privacyHash';

const ATTESTATION = '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2';
const ADMIN_CREDENTIAL = createHash('sha256').update('admin-login-budget-credential-fixture', 'utf8').digest('base64url');
const NOW = new Date('2030-03-01T10:00:00.000Z');
const WINDOW_MS = 15 * 60_000;
const SOURCE = '203.0.113.41';

function request(source: string, token: string): NextRequest {
  return new NextRequest('https://admin.example.invalid/api/admin/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-origin-verified-client-ip': source,
      'x-origin-proxy-attestation': ATTESTATION,
    },
    body: JSON.stringify({ token }),
  });
}

function login(source: string, token: string): Promise<Response> {
  return adminLogin(request(source, token), { params: Promise.resolve({}) });
}

describe('admin login budget', () => {
  // The limiter's rows, keyed like the real ones: a count and the end of the window.
  const counts = new Map<string, number>();
  const resets = new Map<string, Date>();

  beforeEach(() => {
    counts.clear();
    resets.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_DASH_SECRET', ADMIN_CREDENTIAL);
    vi.stubEnv('ORIGIN_PROXY_SHARED_SECRET', ATTESTATION);
    vi.stubEnv('SECURITY_PEPPER', 'admin-login-budget-security-pepper-fixture-only');

    mocks.createAdminSession.mockResolvedValue({ id: 'admin-session', loginAt: 1_785_600_000 });
    mocks.signAdmin.mockReturnValue('admin-login-budget-jwt');
    mocks.logger.getContext.mockReturnValue({ correlationId: 'correlation-1' });
    mocks.queryRaw.mockImplementation(async (_query: TemplateStringsArray, key: string, resetAt: Date) => {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!resets.has(key)) resets.set(key, resetAt);
      return [{ count: counts.get(key), reset_time: resets.get(key) }];
    });
    mocks.executeRaw.mockImplementation(async (_query: TemplateStringsArray, key: string) => {
      counts.set(key, Math.max(0, (counts.get(key) ?? 0) - 1));
      return 1;
    });
    mocks.transaction.mockImplementation(async (callback) => callback({ $queryRaw: mocks.queryRaw }));
    mocks.auditCreate.mockResolvedValue({});
    mocks.auditCreateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => vi.useRealTimers());

  describe('successful sign-ins', () => {
    it('never use up the budget: ten correct tokens in a row all sign in', async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await login(SOURCE, ADMIN_CREDENTIAL);
        expect(response.status, `sign-in ${attempt + 1}`).toBe(200);
      }

      expect([...counts.values()]).toEqual([0]);
      expect(mocks.createAdminSession).toHaveBeenCalledTimes(10);
      expect(mocks.executeRaw).toHaveBeenCalledTimes(10);
    });

    it('do not hide the wrong tokens that came before: the failure budget stays whole', async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) expect((await login(SOURCE, `wrong-${attempt}`)).status).toBe(401);
      expect((await login(SOURCE, ADMIN_CREDENTIAL)).status).toBe(200);
      expect([...counts.values()]).toEqual([4]);

      // The fifth wrong token is still allowed, the sixth attempt is not.
      expect((await login(SOURCE, 'wrong-4')).status).toBe(401);
      expect((await login(SOURCE, 'wrong-5')).status).toBe(429);
    });

    it('still cannot get past an exhausted budget: even a correct token is refused until the window ends', async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) await login(SOURCE, `wrong-${attempt}`);

      const refused = await login(SOURCE, ADMIN_CREDENTIAL);

      expect(refused.status).toBe(429);
      expect(refused.headers.get('set-cookie')).toBeNull();
      expect(mocks.createAdminSession).not.toHaveBeenCalled();
      expect(mocks.executeRaw).not.toHaveBeenCalled();
    });

    it('are signed in even when the refund cannot be written, and the failure is logged without detail', async () => {
      mocks.executeRaw.mockRejectedValue(new Error('database unavailable: postgres://user:secret@db/app'));

      const response = await login(SOURCE, ADMIN_CREDENTIAL);

      expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')).toContain('admin_jwt=admin-login-budget-jwt');
      expect(mocks.logger.warn).toHaveBeenCalledWith('admin_login.rate_limit_refund_failed', { error: 'Error' });
      expect(JSON.stringify(mocks.logger.warn.mock.calls)).not.toContain('secret');
    });

    it('only ever refund a window that is still open', async () => {
      await login(SOURCE, ADMIN_CREDENTIAL);

      const sql = (mocks.executeRaw.mock.calls[0][0] as TemplateStringsArray).join('?').replace(/\s+/gu, ' ');
      expect(sql).toContain('GREATEST("count" - 1, 0)');
      expect(sql).toContain('"reset_time" > CURRENT_TIMESTAMP');
      expect(sql).toContain('WHERE "key" = ?');
    });
  });

  describe('the budget row that a refund lowers', () => {
    it.each([
      ['an IPv4 address', ['203.0.113.41']],
      ['two addresses of one IPv6 /64, which share one row', ['2001:db8:1:2::1', '2001:db8:1:2:ffff::9']],
      ['an IPv6 address written out in full', ['2001:db8:0:0:0:0:0:7']],
      ['an IPv4-mapped IPv6 address', ['::ffff:203.0.113.9']],
    ])('is the row the limiter counted, for %s', async (_label, sources) => {
      const rows = new Set<string>();
      for (const source of sources) {
        mocks.queryRaw.mockClear();
        mocks.executeRaw.mockClear();

        expect((await login(source, ADMIN_CREDENTIAL)).status).toBe(200);

        const counted = mocks.queryRaw.mock.calls[0][1] as string;
        const refunded = mocks.executeRaw.mock.calls[0][1] as string;
        expect(refunded).toBe(counted);
        expect(counted).toMatch(/^sensitive:[a-f0-9]{64}$/u);
        rows.add(counted);
      }

      expect(rows.size).toBe(1);
      expect([...counts.values()]).toEqual([0]);
    });

    it('is the per-address row of the admin-login scope, never a row shared by all sources', async () => {
      await login('203.0.113.41', ADMIN_CREDENTIAL);
      await login('198.51.100.92', ADMIN_CREDENTIAL);

      const expected = ['203.0.113.41', '198.51.100.92'].map((source) => (
        `sensitive:${privacyHmac(`admin-login|ip:${source}`, 'sensitive-rate-limit:v1')}`
      ));
      expect([...counts.keys()]).toEqual(expected);
    });
  });

  describe('the refusal', () => {
    async function refusal(): Promise<Response> {
      for (let attempt = 0; attempt < 5; attempt += 1) await login(SOURCE, `wrong-${attempt}`);
      return login(SOURCE, 'wrong-5');
    }

    it('uses the shared API error envelope, as the other routes do', async () => {
      const response = await refusal();

      expect(response.status).toBe(429);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('x-error-code')).toBe('RATE_LIMITED');
      expect(response.headers.get('x-correlation-id')).toBe('correlation-1');
      expect(await response.json()).toEqual({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many authentication attempts',
          details: { retryAfter: WINDOW_MS / 1_000 },
          correlationId: 'correlation-1',
          timestamp: NOW.toISOString(),
        },
      });
    });

    it('tells the client how long to wait: the seconds left in the window, rounded up', async () => {
      const first = await refusal();
      expect(first.headers.get('retry-after')).toBe(String(WINDOW_MS / 1_000));

      vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000 + 500));
      const later = await login(SOURCE, 'wrong-6');

      expect(later.status).toBe(429);
      expect(later.headers.get('retry-after')).toBe('300');
      expect((await later.json()).error.details.retryAfter).toBe(300);
    });

    it('never asks for less than one second, even at the very end of the window', async () => {
      await refusal();
      vi.setSystemTime(new Date(NOW.getTime() + WINDOW_MS - 1));

      const response = await login(SOURCE, 'wrong-6');

      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('1');
    });

    it('does not name the token, the address or the limiter, and still records one rate-limited audit event', async () => {
      const response = await refusal();

      const text = await response.text();
      expect(text).not.toMatch(/wrong-|203\.0\.113|sensitive:|admin-login\|/u);
      expect(mocks.auditCreateMany).toHaveBeenCalledOnce();
      expect(mocks.auditCreateMany.mock.calls[0][0].data[0]).toMatchObject({ eventType: 'admin.login_rate_limited', severity: 'medium' });
    });

    it('omits the correlation header when the request has no correlation id', async () => {
      mocks.logger.getContext.mockReturnValue(undefined);

      const response = await refusal();

      expect(response.status).toBe(429);
      expect(response.headers.get('x-correlation-id')).toBeNull();
      expect((await response.json()).error).not.toHaveProperty('correlationId', expect.anything());
    });

    it('is not a refund: wrong tokens and refused requests give nothing back', async () => {
      await refusal();

      expect(mocks.executeRaw).not.toHaveBeenCalled();
      expect([...counts.values()]).toEqual([6]);
    });
  });
});
