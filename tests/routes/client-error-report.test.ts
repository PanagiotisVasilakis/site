import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

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

  it('inlines the release commit as the build version in the image build', () => {
    const builderStage = readFileSync('docker/Dockerfile.security', 'utf8').split(/^FROM /mu)[1];
    const lines = builderStage.split('\n');
    const envIndex = lines.indexOf('ENV NEXT_PUBLIC_BUILD_VERSION=${GIT_COMMIT}');
    expect(envIndex).toBeGreaterThan(lines.indexOf('ARG GIT_COMMIT'));
    expect(envIndex).toBeLessThan(lines.indexOf('RUN npm run build'));
  });

  it('checks the per-address limit first and then a limit shared by all clients', async () => {
    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true });
    mocks.securityAuditEventCreate.mockResolvedValue({});

    const response = await POST(validReportRequest(), { params: Promise.resolve({}) });

    expect(response.status).toBeLessThan(300);
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.checkSensitiveRateLimit.mock.calls[0][1]).toEqual({ scope: 'client-error-report', limit: 10, windowMs: 60_000 });
    expect(mocks.checkSensitiveRateLimit.mock.calls[1][1]).toEqual({
      scope: 'client-error-report-global', identifier: 'global', limit: 100, windowMs: 3_600_000,
    });
  });

  it.each([
    ['malformed JSON', '{x}'],
    ['an empty body', ''],
    ['a body that fails the schema', JSON.stringify({ error: { name: 'Error' } })],
    ['a body with an unknown key', JSON.stringify({
      error: { name: 'Error', message: 'boom' },
      context: { url: 'https://guest-guide.test/en', timestamp: new Date().toISOString() },
      extra: true,
    })],
  ])('rejects %s without spending the shared budget', async (_label, body) => {
    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true });

    const response = await POST(new NextRequest('https://guest-guide.test/api/errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }), { params: Promise.resolve({}) });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.checkSensitiveRateLimit.mock.calls[0][1]).toMatchObject({ scope: 'client-error-report' });
    expect(mocks.securityAuditEventCreate).not.toHaveBeenCalled();
  });

  it('still stores a well-formed report after a flood of malformed ones used up no shared budget', async () => {
    const used = new Map<string, number>();
    mocks.checkSensitiveRateLimit.mockImplementation(async (_request: unknown, options: { scope: string; limit: number }) => {
      const count = (used.get(options.scope) ?? 0) + 1;
      used.set(options.scope, count);
      // The per-address scope is not exhausted: every malformed request comes from a fresh address.
      return { allowed: options.scope.endsWith('-global') ? count <= options.limit : true };
    });
    mocks.securityAuditEventCreate.mockResolvedValue({});

    for (let index = 0; index < 150; index += 1) {
      const response = await POST(new NextRequest('https://guest-guide.test/api/errors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{x}',
      }), { params: Promise.resolve({}) });
      expect(response.status).toBe(400);
    }
    const response = await POST(validReportRequest(), { params: Promise.resolve({}) });

    expect(response.status).toBe(201);
    expect(used.get('client-error-report-global')).toBe(1);
    expect(mocks.securityAuditEventCreate).toHaveBeenCalledTimes(1);
  });

  it('keeps a stored row small even when every field of the report is at its accepted limit', async () => {
    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true });
    mocks.securityAuditEventCreate.mockResolvedValue({});

    const response = await POST(new NextRequest('https://guest-guide.test/api/errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: {
          name: 'N'.repeat(100),
          message: 'm '.repeat(250),
          stack: Array.from({ length: 5 }, (_, index) => `    at f${index} (https://guest-guide.test/_next/static/chunks/${'a'.repeat(300)}.js:1:${index})`).join('\n'),
          fileName: `https://guest-guide.test/_next/static/chunks/${'f'.repeat(150)}.js`,
          lineNumber: 123456,
          columnNumber: 654321,
        },
        context: {
          url: 'https://guest-guide.test/en',
          timestamp: new Date().toISOString(),
          buildVersion: '0123456789abcdef0123456789abcdef01234567',
        },
        category: 'globalError',
      }),
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(201);
    const data = mocks.securityAuditEventCreate.mock.calls[0][0].data as { details: Record<string, unknown> };
    expect(JSON.stringify(data.details).length).toBeLessThan(1_300);
  });

  describe('stored text', () => {
    const HOST = 'https://guest-guide.test';

    async function storedDetails(error: Record<string, unknown>, context: Record<string, unknown> = {}) {
      mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true });
      mocks.securityAuditEventCreate.mockResolvedValue({});

      const response = await POST(new NextRequest('https://guest-guide.test/api/errors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          error: { name: 'Error', message: 'boom', ...error },
          context: { url: 'https://guest-guide.test/en', timestamp: new Date().toISOString(), ...context },
        }),
      }), { params: Promise.resolve({}) });

      expect(response.status).toBe(201);
      return mocks.securityAuditEventCreate.mock.calls[0][0].data.details as Record<string, string | undefined>;
    }

    it('drops the query string and fragment of every stack frame and keeps the path and position', async () => {
      const details = await storedDetails({
        stack: [
          'TypeError: x is not a function',
          `    at load (${HOST}/_next/static/chunks/app.js?claim=SECRETCLAIMVALUE&t=1#frag:10:20)`,
          `    at ${HOST}/_next/static/chunks/page.js?access_token=SECRETTOKENVALUE:7:9`,
          `    at run@${HOST}/_next/static/chunks/main.js#state=SECRETSTATEVALUE:3:4`,
        ].join('\n'),
      });

      expect(details.stack).toBe([
        'TypeError: x is not a function',
        `    at load (${HOST}/_next/static/chunks/app.js:10:20)`,
        `    at ${HOST}/_next/static/chunks/page.js:7:9`,
        `    at run@${HOST}/_next/static/chunks/main.js:3:4`,
      ].join('\n'));
      expect(JSON.stringify(details)).not.toMatch(/SECRET|claim=|access_token|state=/u);
    });

    it.each([
      ['a query string', `${HOST}/_next/static/chunks/app.js?token=SECRETVALUE`],
      ['a fragment', `${HOST}/_next/static/chunks/app.js#SECRETVALUE`],
      ['both', `${HOST}/_next/static/chunks/app.js?a=SECRETVALUE#b`],
      ['a relative name', 'app.js?SECRETVALUE'],
    ])('stores a file name with %s as the path alone', async (_label, fileName) => {
      const details = await storedDetails({ fileName });

      expect(details.fileName).not.toContain('SECRETVALUE');
      expect(details.fileName).not.toMatch(/[?#]/u);
      expect(details.fileName).toMatch(/app\.js$/u);
    });

    it.each([
      ['a query string', '?token=SECRETVALUE'],
      ['a fragment', '#SECRETVALUE'],
    ])('stores nothing of a file name that is only %s', async (_label, fileName) => {
      const details = await storedDetails({ fileName });

      expect(details.fileName ?? '').toBe('');
      expect(JSON.stringify(details)).not.toContain('SECRETVALUE');
    });

    it('drops the query of a URL inside the message', async () => {
      const details = await storedDetails({ message: `Failed to fetch ${HOST}/api/portal/claims?claim=SECRETVALUE` });

      expect(details.message).toBe(`Failed to fetch ${HOST}/api/portal/claims`);
    });

    it('stores no control, zero-width or bidi character in any text, so the JSON column cannot reject the row', async () => {
      const bidiOverride = String.fromCodePoint(0x202e);
      const zeroWidth = String.fromCodePoint(0x200b);
      const byteOrderMark = String.fromCodePoint(0xfeff);
      const details = await storedDetails({
        name: `Err${zeroWidth}or`,
        message: `Bad\u0000 input${bidiOverride}gpj.exe`,
        stack: `Error: boom\r\n    at f (${HOST}/a.js:1:2)\u001B[31m`,
        fileName: `${byteOrderMark}${HOST}/a.js`,
      }, { buildVersion: `1.2${zeroWidth}.3\u0000` });

      expect(details).toMatchObject({
        name: 'Error',
        message: 'Bad inputgpj.exe',
        stack: `Error: boom\n    at f (${HOST}/a.js:1:2)[31m`,
        fileName: `${HOST}/a.js`,
        buildVersion: '1.2.3',
      });
    });

    it('keeps the redaction of addresses and tokens', async () => {
      const details = await storedDetails({ message: 'Sign-in failed for guest@example.com on +30 691 234 5678' });

      expect(details.message).toBe('Sign-in failed for [REDACTED_EMAIL] on [REDACTED_PHONE]');
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
});
