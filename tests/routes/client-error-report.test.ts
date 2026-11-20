import { createHash } from 'node:crypto';

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkSensitiveRateLimit: vi.fn(),
  securityAuditEventCreate: vi.fn(),
}));

vi.mock('@/lib/sensitiveRateLimit', () => ({ checkSensitiveRateLimit: mocks.checkSensitiveRateLimit }));
vi.mock('@/lib/prisma', () => ({
  prisma: { securityAuditEvent: { create: mocks.securityAuditEventCreate } },
}));

import { POST } from '@/app/api/errors/route';
import { errorReporter } from '@/lib/errorReporting';
import { privacyHmac } from '@/lib/privacyHash';

afterEach(() => {
  vi.unstubAllGlobals();
});

function validReportRequest(): NextRequest {
  return new NextRequest('https://guest-guide.test/api/errors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      error: { name: 'Error', message: 'boom' },
      context: { url: 'https://guest-guide.test/en', timestamp: new Date().toISOString() },
    }),
  });
}

describe('client error report contract', () => {
  it('stores a report whose stack exceeds the server stack limit', async () => {
    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true });
    mocks.securityAuditEventCreate.mockResolvedValue({});

    // Browser bundles inline NODE_ENV as production or development, never 'test'.
    vi.stubEnv('NODE_ENV', 'production');
    let sentBody = '';
    vi.stubGlobal('window', { location: { href: 'https://guest-guide.test/en/book' } });
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      sentBody = String(init?.body);
      return new Response(null, { status: 201 });
    }));

    const error = new Error('Render failed');
    error.stack = ['Error: Render failed', ...Array.from({ length: 60 }, (_, index) => (
      `    at Component${index} (https://guest-guide.test/_next/static/chunks/${'a'.repeat(80)}.js:1:${index})`
    ))].join('\n');
    expect(error.stack.length).toBeGreaterThan(5_000);

    await expect(errorReporter.reportError(error, { category: 'globalError' })).resolves.toBe(true);

    const response = await POST(new NextRequest('https://guest-guide.test/api/errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: sentBody,
    }), { params: Promise.resolve({}) });

    expect(response.status).toBeLessThan(300);
    expect(mocks.securityAuditEventCreate).toHaveBeenCalledTimes(1);
  });

  it('stores the inlined bundle build version with the report', async () => {
    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true });
    mocks.securityAuditEventCreate.mockResolvedValue({});
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_BUILD_VERSION', '0123456789abcdef0123456789abcdef01234567');
    let sentBody = '';
    vi.stubGlobal('window', { location: { href: 'https://guest-guide.test/en' } });
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      sentBody = String(init?.body);
      return new Response(null, { status: 201 });
    }));

    await expect(errorReporter.reportError(new Error('boom'), { category: 'globalError' })).resolves.toBe(true);
    expect(JSON.parse(sentBody).context).not.toHaveProperty('environment');
    const response = await POST(new NextRequest('https://guest-guide.test/api/errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: sentBody,
    }), { params: Promise.resolve({}) });

    expect(response.status).toBeLessThan(300);
    const data = mocks.securityAuditEventCreate.mock.calls[0][0].data as { details: { buildVersion?: string } };
    expect(data.details.buildVersion).toBe('0123456789abcdef0123456789abcdef01234567');
  });

  it('checks the per-address limit first and then a limit shared by all clients', async () => {
    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true });
    mocks.securityAuditEventCreate.mockResolvedValue({});

    const response = await POST(validReportRequest(), { params: Promise.resolve({}) });

    expect(response.status).toBeLessThan(300);
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.checkSensitiveRateLimit.mock.calls[0][1]).toEqual({ scope: 'client-error-report', limit: 10, windowMs: 60_000 });
    expect(mocks.checkSensitiveRateLimit.mock.calls[1][1]).toEqual({
      scope: 'client-error-report-global', identifier: 'global', limit: 500, windowMs: 3_600_000,
    });
  });

  it('answers 429 without storing when the shared limit is exhausted', async () => {
    mocks.checkSensitiveRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });

    const response = await POST(validReportRequest(), { params: Promise.resolve({}) });

    expect(response.status).toBe(429);
    expect(mocks.securityAuditEventCreate).not.toHaveBeenCalled();
  });

  it('does not count a report against the shared limit when the per-address limit denies it', async () => {
    mocks.checkSensitiveRateLimit.mockResolvedValueOnce({ allowed: false });

    const response = await POST(validReportRequest(), { params: Promise.resolve({}) });

    expect(response.status).toBe(429);
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.securityAuditEventCreate).not.toHaveBeenCalled();
  });

  it('stores the client IP only as the keyed security-event hash', async () => {
    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true });
    mocks.securityAuditEventCreate.mockResolvedValue({});
    vi.stubEnv('ORIGIN_PROXY_SHARED_SECRET', 'a'.repeat(64));

    const response = await POST(new NextRequest('https://guest-guide.test/api/errors', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-origin-verified-client-ip': '203.0.113.7',
        'x-origin-proxy-attestation': 'a'.repeat(64),
      },
      body: JSON.stringify({
        error: { name: 'Error', message: 'boom' },
        context: { url: 'https://guest-guide.test/en', timestamp: new Date().toISOString() },
      }),
    }), { params: Promise.resolve({}) });

    expect(response.status).toBeLessThan(300);
    const data = mocks.securityAuditEventCreate.mock.calls[0][0].data as { ipHash: string | null };
    expect(data.ipHash).toBe(privacyHmac('203.0.113.7', 'security-event-ip:v1'));
    expect(data.ipHash).not.toBe(createHash('sha256').update('203.0.113.7').digest('hex'));
  });

  it('reads file, line and column from a Safari or Firefox stack', async () => {
    let sentBody = '';
    vi.stubGlobal('window', { location: { href: 'https://guest-guide.test/en' } });
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      sentBody = String(init?.body);
      return new Response(null, { status: 201 });
    }));

    const error = new Error('Safari frame failed');
    error.stack = 'render@https://guest-guide.test/_next/static/chunks/app.js:12:34\nglobal code@https://guest-guide.test/en:1:1';

    await expect(errorReporter.reportError(error)).resolves.toBe(true);
    expect(JSON.parse(sentBody).error).toMatchObject({
      fileName: 'https://guest-guide.test/_next/static/chunks/app.js',
      lineNumber: 12,
      columnNumber: 34,
    });
  });

  it('sends one report per distinct error and at most ten per page', async () => {
    vi.resetModules();
    const { errorReporter: fresh } = await import('@/lib/errorReporting');
    vi.stubGlobal('window', { location: { href: 'https://guest-guide.test/en' } });
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const same = new Error('same failure');
    await expect(fresh.reportError(same)).resolves.toBe(true);
    await expect(fresh.reportError(same)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 12; i += 1) {
      await fresh.reportError(new Error(`distinct ${i}`));
    }
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});
