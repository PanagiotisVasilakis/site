import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkSensitiveRateLimit: vi.fn(),
  securityAuditEventCreate: vi.fn(),
  executeRawUnsafe: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/sensitiveRateLimit', () => ({ checkSensitiveRateLimit: mocks.checkSensitiveRateLimit }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));

import { POST } from '@/app/api/security/csp-report/route';

// Shape of a Chromium `report-uri` body (CSP3 deprecated serialization).
const chromiumReport = {
  'csp-report': {
    'document-uri': 'https://guide.example/en/check-in?session=private',
    referrer: 'https://guide.example/en/guest?flash=private',
    'violated-directive': 'script-src-elem',
    'effective-directive': 'script-src-elem',
    'original-policy': "default-src 'self'; report-uri /api/security/csp-report",
    disposition: 'enforce',
    'blocked-uri': 'https://cdn.example/lib.js?token=secret-token',
    'status-code': 200,
    'script-sample': '',
    'source-file': 'https://guide.example/_next/static/chunk.js?v=secret-token',
    'line-number': 12,
    'column-number': 34,
  },
};

function reportRaw(body: string): Promise<Response> {
  return POST(new NextRequest('https://guide.example/api/security/csp-report', {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report' },
    body,
  }));
}

function report(body: unknown): Promise<Response> {
  return reportRaw(JSON.stringify(body));
}

function storedDetails(): Record<string, unknown> {
  return mocks.securityAuditEventCreate.mock.calls[0][0].data.details as Record<string, unknown>;
}

describe('CSP report endpoint', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@127.0.0.1:1/db');
    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true });
    mocks.securityAuditEventCreate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      $executeRawUnsafe: mocks.executeRawUnsafe,
      securityAuditEvent: { create: mocks.securityAuditEventCreate },
    }));
  });

  it('accepts a real browser report and stores it without query strings or the referrer', async () => {
    const response = await report(chromiumReport);

    expect(response.status).toBe(204);
    expect(mocks.securityAuditEventCreate).toHaveBeenCalledTimes(1);
    const data = mocks.securityAuditEventCreate.mock.calls[0][0].data as { path: string; details: Record<string, unknown> };
    expect(data.path).toBe('/en/check-in');
    expect(data.details).toMatchObject({
      violatedDirective: 'script-src-elem',
      disposition: 'enforce',
      statusCode: 200,
      blockedURI: 'https://cdn.example/lib.js',
      sourceFile: 'https://guide.example/_next/static/chunk.js',
    });
    const stored = JSON.stringify(data);
    expect(stored).not.toContain('secret-token');
    expect(stored).not.toContain('private');
  });

  it.each([
    ['inline', 'inline'],
    ['data:image/png;base64,AAAA', 'data:'],
  ])('keeps the CSP keyword or scheme for blocked-uri %s', async (blocked, expected) => {
    const response = await report({ 'csp-report': { ...chromiumReport['csp-report'], 'blocked-uri': blocked } });

    expect(response.status).toBe(204);
    expect(mocks.securityAuditEventCreate.mock.calls[0][0].data.details.blockedURI).toBe(expected);
  });

  it('checks the per-address limit first and then a limit shared by all clients', async () => {
    const response = await report(chromiumReport);

    expect(response.status).toBe(204);
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.checkSensitiveRateLimit.mock.calls[0][1]).toEqual({ scope: 'csp-report', limit: 30, windowMs: 60_000 });
    expect(mocks.checkSensitiveRateLimit.mock.calls[1][1]).toEqual({
      scope: 'csp-report-global', identifier: 'global', limit: 100, windowMs: 3_600_000,
    });
  });

  it('stores neither the static original policy nor an absent field as the text "undefined"', async () => {
    const response = await report(chromiumReport);

    expect(response.status).toBe(204);
    const details = storedDetails();
    expect(details).not.toHaveProperty('originalPolicy');
    expect(Object.values(details)).not.toContain('undefined');
    expect(JSON.stringify(details)).not.toContain('default-src');
    // Chromium repeats the violated directive as the effective one: stored once.
    expect(details).not.toHaveProperty('effectiveDirective');
    expect(details.violatedDirective).toBe('script-src-elem');
  });

  it('stores only the fields a sparse report carries', async () => {
    const response = await report({ 'csp-report': { 'violated-directive': 'img-src' } });

    expect(response.status).toBe(204);
    expect(storedDetails()).toEqual({ violatedDirective: 'img-src' });
    expect(JSON.stringify(mocks.securityAuditEventCreate.mock.calls[0][0].data)).not.toContain('undefined');
  });

  it('keeps an effective directive that differs from the violated one', async () => {
    const response = await report({ 'csp-report': {
      'violated-directive': "script-src 'self'",
      'effective-directive': 'script-src',
    } });

    expect(response.status).toBe(204);
    expect(storedDetails()).toEqual({ violatedDirective: "script-src 'self'", effectiveDirective: 'script-src' });
  });

  it('keeps a stored row under 1 KB even when every bounded field is at its limit', async () => {
    const response = await report({ 'csp-report': {
      'document-uri': `https://guide.example/${'p'.repeat(1_900)}`,
      referrer: 'r'.repeat(2_000),
      'violated-directive': 'v'.repeat(500),
      'effective-directive': 'e'.repeat(500),
      'blocked-uri': `https://cdn.example/${'b'.repeat(1_900)}`,
      'original-policy': 'o'.repeat(3_000),
      disposition: 'enforce',
      'status-code': 200,
      'script-sample': 's'.repeat(256),
      'source-file': `https://guide.example/${'f'.repeat(1_900)}`,
      'line-number': 123456,
      'column-number': 654321,
    } });

    expect(response.status).toBe(204);
    expect(JSON.stringify(storedDetails()).length).toBeLessThan(1_024);
  });

  it.each([
    ['an empty object', {}],
    ['an empty csp-report', { 'csp-report': {} }],
    ['a report without any directive', { 'csp-report': {
      'document-uri': 'https://guide.example/en',
      referrer: 'https://guide.example/',
      'original-policy': "default-src 'self'",
      'blocked-uri': 'inline',
    } }],
    ['empty directive strings', { 'csp-report': { 'violated-directive': '', 'effective-directive': '' } }],
  ])('answers 204 without storing or spending the shared budget for %s', async (_label, body) => {
    const response = await report(body);

    expect(response.status).toBe(204);
    expect(mocks.securityAuditEventCreate).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.checkSensitiveRateLimit.mock.calls[0][1]).toMatchObject({ scope: 'csp-report' });
  });

  it('stores a report that names only the effective directive', async () => {
    const response = await report({ 'csp-report': { 'effective-directive': 'img-src' } });

    expect(response.status).toBe(204);
    expect(storedDetails()).toEqual({ effectiveDirective: 'img-src' });
  });

  it.each(['{x}', '', 'null', '[]'])('rejects the malformed body %j without spending the shared budget', async (body) => {
    const response = await reportRaw(body);

    expect(response.status).toBe(400);
    expect(mocks.securityAuditEventCreate).not.toHaveBeenCalled();
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.checkSensitiveRateLimit.mock.calls[0][1]).toMatchObject({ scope: 'csp-report' });
  });

  it('still stores a well-formed report after a flood of malformed and empty ones', async () => {
    const used = new Map<string, number>();
    mocks.checkSensitiveRateLimit.mockImplementation(async (_request: unknown, options: { scope: string; limit: number }) => {
      const count = (used.get(options.scope) ?? 0) + 1;
      used.set(options.scope, count);
      // The per-address scope is not exhausted: every request comes from a fresh address.
      return { allowed: options.scope.endsWith('-global') ? count <= options.limit : true };
    });

    for (let index = 0; index < 150; index += 1) {
      expect((await reportRaw('{x}')).status).toBe(400);
      expect((await report({})).status).toBe(204);
    }
    const response = await report(chromiumReport);

    expect(response.status).toBe(204);
    expect(used.get('csp-report-global')).toBe(1);
    expect(mocks.securityAuditEventCreate).toHaveBeenCalledTimes(1);
  });

  it('answers 429 without storing when the shared limit is exhausted', async () => {
    mocks.checkSensitiveRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });

    const response = await report(chromiumReport);

    expect(response.status).toBe(429);
    expect(mocks.securityAuditEventCreate).not.toHaveBeenCalled();
  });

  it('does not count a report against the shared limit when the per-address limit denies it', async () => {
    mocks.checkSensitiveRateLimit.mockResolvedValueOnce({ allowed: false });

    const response = await report(chromiumReport);

    expect(response.status).toBe(429);
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.securityAuditEventCreate).not.toHaveBeenCalled();
  });

  it('rejects a malformed report without storing it', async () => {
    const response = await report({ 'csp-report': { ...chromiumReport['csp-report'], 'line-number': 'twelve' } });

    expect(response.status).toBe(400);
    expect(mocks.securityAuditEventCreate).not.toHaveBeenCalled();
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledTimes(1);
  });
});
