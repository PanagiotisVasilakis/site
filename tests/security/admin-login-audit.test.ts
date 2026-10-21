import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminSession: vi.fn(),
  signAdmin: vi.fn(),
  queryRaw: vi.fn(),
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
    securityAuditEvent: { create: mocks.auditCreate, createMany: mocks.auditCreateMany },
  },
}));

vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));

import { POST as adminLogin } from '@/app/api/admin/login/route';
import { privacyHmac } from '@/lib/privacyHash';

const ATTESTATION = '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2';
const ADMIN_CREDENTIAL = createHash('sha256')
  .update('admin-login-audit-credential-fixture', 'utf8')
  .digest('base64url');
const ADMIN_SESSION_ID = '0f8d6a55-2f5e-4c43-9a5e-1d6d0f3f9b11';
const SOURCE_A = '203.0.113.41';
const SOURCE_B = '198.51.100.92';
// Two addresses of one IPv6 /64: the limiter gives them one budget.
const SOURCE_V6_ONE = '2001:db8:1:2::1';
const SOURCE_V6_TWO = '2001:db8:1:2:ffff::9';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const NOW = new Date('2030-03-01T10:00:00.000Z');
const WINDOW_MS = 15 * 60_000;

function request(source: string | null, token: string): NextRequest {
  const identity: Record<string, string> = source === null
    ? {}
    : { 'x-origin-verified-client-ip': source, 'x-origin-proxy-attestation': ATTESTATION };
  return new NextRequest('https://admin.example.invalid/api/admin/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...identity,
      // Forwarding headers a client can set: neither selects the stored address.
      'cf-connecting-ip': '192.0.2.200',
      'x-forwarded-for': '192.0.2.200',
    },
    body: JSON.stringify({ token }),
  });
}

function login(source: string | null, token: string): Promise<Response> {
  return adminLogin(request(source, token), { params: Promise.resolve({}) });
}

function keyedHash(source: string): string {
  return privacyHmac(source, 'security-event-ip:v1');
}

// Every row handed to the database for an audit event, including those the database would reject as duplicates.
function writtenRows(): Array<Record<string, unknown>> {
  return [
    ...mocks.auditCreate.mock.calls.map(([args]) => args.data as Record<string, unknown>),
    ...mocks.auditCreateMany.mock.calls.flatMap(([args]) => args.data as Array<Record<string, unknown>>),
  ];
}

function loggedText(): string {
  return JSON.stringify(Object.values(mocks.logger).flatMap((logMock) => logMock.mock.calls));
}

describe('admin sign-in audit events', () => {
  // The limiter's counters and window ends, keyed like its rows: one per address (IPv4) or /64 (IPv6).
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
    vi.stubEnv('SECURITY_PEPPER', 'admin-login-audit-security-pepper-fixture-only');

    mocks.createAdminSession.mockResolvedValue({ id: ADMIN_SESSION_ID, loginAt: 1_785_600_000 });
    mocks.signAdmin.mockReturnValue('admin-login-audit-jwt');
    mocks.logger.getContext.mockReturnValue({ correlationId: 'correlation-1' });
    mocks.queryRaw.mockImplementation(async (_query: TemplateStringsArray, key: string, resetAt: Date) => {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!resets.has(key)) resets.set(key, resetAt);
      return [{ count: counts.get(key), reset_time: resets.get(key) }];
    });
    mocks.transaction.mockImplementation(async (callback) => callback({ $queryRaw: mocks.queryRaw }));
    mocks.auditCreate.mockResolvedValue({});
    mocks.auditCreateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => vi.useRealTimers());

  it('records a successful sign-in with the keyed address hash and the session it created', async () => {
    const response = await login(SOURCE_A, ADMIN_CREDENTIAL);

    expect(response.status).toBe(200);
    expect(mocks.auditCreate).toHaveBeenCalledOnce();
    expect(mocks.auditCreate.mock.calls[0][0]).toEqual({
      data: {
        id: expect.stringMatching(UUID),
        eventType: 'admin.login_succeeded',
        severity: 'low',
        correlationId: 'correlation-1',
        ipHash: keyedHash(SOURCE_A),
        path: '/api/admin/login',
        details: { adminSessionId: ADMIN_SESSION_ID },
      },
    });
    expect(mocks.auditCreateMany).not.toHaveBeenCalled();
    // The event is stored after the session exists, so it never names a session that was not issued.
    expect(mocks.createAdminSession.mock.invocationCallOrder[0]).toBeLessThan(mocks.auditCreate.mock.invocationCallOrder[0]);
  });

  it('records each failed sign-in with the attempts that remain, and answers as before', async () => {
    const first = await login(SOURCE_A, 'wrong-guess-one');
    const second = await login(SOURCE_A, 'wrong-guess-two');

    for (const response of [first, second]) {
      expect(response.status).toBe(401);
      expect(await response.text()).toBe('{"error":"Unauthorized"}');
    }
    expect(writtenRows()).toEqual([
      expect.objectContaining({
        eventType: 'admin.login_failed', severity: 'medium', ipHash: keyedHash(SOURCE_A), path: '/api/admin/login', details: { remainingAttempts: 4 },
      }),
      expect.objectContaining({ eventType: 'admin.login_failed', details: { remainingAttempts: 3 } }),
    ]);
    expect(mocks.createAdminSession).not.toHaveBeenCalled();
  });

  it('records one rate-limited event for the sources that share a budget and window, however many attempts are refused', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await login(SOURCE_V6_ONE, `wrong-guess-${attempt}`);
    expect(mocks.auditCreate).toHaveBeenCalledTimes(5);

    const refused = [
      await login(SOURCE_V6_ONE, 'wrong-guess-five'),
      await login(SOURCE_V6_ONE, 'wrong-guess-six'),
      await login(SOURCE_V6_TWO, 'wrong-guess-seven'),
    ];

    for (const response of refused) {
      expect(response.status).toBe(429);
      expect(await response.text()).toBe('{"error":"Too many authentication attempts"}');
    }
    // A refusal never uses `create`: the id of the window's one event decides, and the database skips the duplicates.
    expect(mocks.auditCreate).toHaveBeenCalledTimes(5);
    expect(mocks.auditCreateMany).toHaveBeenCalledTimes(3);
    const calls = mocks.auditCreateMany.mock.calls.map(([args]) => args);
    for (const args of calls) {
      expect(args.skipDuplicates).toBe(true);
      expect(args.data).toHaveLength(1);
      expect(args.data[0]).toMatchObject({
        eventType: 'admin.login_rate_limited',
        severity: 'medium',
        path: '/api/admin/login',
        details: { limit: 5, windowMinutes: 15, windowEndsAt: new Date(NOW.getTime() + WINDOW_MS).toISOString() },
      });
      expect(args.data[0].id).toMatch(UUID);
    }
    // One id for the /64 and window, although the second address hashes differently.
    expect(new Set(calls.map((args) => args.data[0].id)).size).toBe(1);
    expect(calls[0].data[0].ipHash).toBe(keyedHash(SOURCE_V6_ONE));
    expect(calls[2].data[0].ipHash).toBe(keyedHash(SOURCE_V6_TWO));
  });

  it('gives the refusals of the next window another event id, and other sources theirs', async () => {
    const refusalId = async (source: string) => {
      for (let attempt = 0; attempt < 5; attempt += 1) await login(source, `wrong-guess-${attempt}`);
      expect((await login(source, 'wrong-guess-refused')).status).toBe(429);
      return mocks.auditCreateMany.mock.calls.at(-1)?.[0].data[0].id as string;
    };

    const first = await refusalId(SOURCE_A);
    // Another source, whose window opens a few milliseconds later.
    vi.setSystemTime(new Date(NOW.getTime() + 5));
    const otherSource = await refusalId(SOURCE_B);
    // The first window ends: the limiter starts a new one.
    vi.setSystemTime(new Date(NOW.getTime() + WINDOW_MS + 1_000));
    counts.clear();
    resets.clear();
    const nextWindow = await refusalId(SOURCE_A);

    expect(new Set([first, otherSource, nextWindow]).size).toBe(3);
  });

  it('never writes or logs the submitted token, its length or any part of it', async () => {
    const submitted = 'ZQ9-submitted-value-0123456789-marker';
    expect(submitted).toHaveLength(37);

    for (let attempt = 0; attempt < 6; attempt += 1) await login(SOURCE_A, submitted);
    await login(SOURCE_B, ADMIN_CREDENTIAL);

    expect(mocks.auditCreate).toHaveBeenCalled();
    expect(mocks.auditCreateMany).toHaveBeenCalled();
    const everything = JSON.stringify(writtenRows()) + loggedText();
    for (let length = 3; length <= submitted.length; length += 1) {
      expect(everything).not.toContain(submitted.slice(0, length));
    }
    expect(everything).not.toContain(ADMIN_CREDENTIAL);
    expect(everything).not.toMatch(/\b37\b/u);
    // Only the keyed hash of an address is stored, never the address or a header that carried one.
    for (const raw of [SOURCE_A, SOURCE_B, '192.0.2.200']) expect(everything).not.toContain(raw);
    for (const source of [SOURCE_A, SOURCE_B]) {
      expect(writtenRows().some((row) => row.ipHash === keyedHash(source))).toBe(true);
    }
  });

  it.each([
    ['administrator login is disabled', async () => {
      vi.stubEnv('ADMIN_DASH_SECRET', '');
      return login(SOURCE_A, ADMIN_CREDENTIAL);
    }, 503],
    ['the body is not valid', async () => login(SOURCE_A, ''), 422],
    ['the body is larger than 4 KiB', async () => login(SOURCE_A, 'x'.repeat(4 * 1_024)), 413],
    ['the proxy attested no client address', async () => login(null, ADMIN_CREDENTIAL), 503],
  ])('writes no event and spends no budget when %s', async (_label, send, status) => {
    const response = await send();

    expect(response.status).toBe(status);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreateMany).not.toHaveBeenCalled();
    expect(counts.size).toBe(0);
  });

  it('writes no event when the limiter store fails', async () => {
    mocks.queryRaw.mockRejectedValueOnce(new Error('synthetic private database diagnostics'));

    const response = await login(SOURCE_A, ADMIN_CREDENTIAL);

    expect(response.status).toBe(503);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreateMany).not.toHaveBeenCalled();
  });

  it('keeps answering when an event cannot be stored, and logs it without the token', async () => {
    mocks.auditCreate.mockRejectedValue(new Error('audit store unavailable'));
    mocks.auditCreateMany.mockRejectedValue(new Error('audit store unavailable'));
    const wrong = 'ZQ9-value-that-must-not-be-logged';

    const succeeded = await login(SOURCE_B, ADMIN_CREDENTIAL);
    const failed = await login(SOURCE_A, wrong);
    for (let attempt = 0; attempt < 4; attempt += 1) await login(SOURCE_A, wrong);
    const refused = await login(SOURCE_A, wrong);

    expect(succeeded.status).toBe(200);
    expect(succeeded.headers.get('set-cookie')).toContain('admin_jwt=admin-login-audit-jwt');
    expect(failed.status).toBe(401);
    expect(refused.status).toBe(429);
    expect(mocks.logger.error).toHaveBeenCalledWith('Admin login audit event could not be stored', {
      outcome: 'succeeded', error: 'audit store unavailable',
    });
    expect(mocks.logger.error).toHaveBeenCalledWith('Admin login audit event could not be stored', {
      outcome: 'rate_limited', error: 'audit store unavailable',
    });
    expect(loggedText()).not.toContain(wrong);
  });
});
