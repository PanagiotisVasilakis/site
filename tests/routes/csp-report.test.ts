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

function report(body: unknown): Promise<Response> {
  return POST(new NextRequest('https://guide.example/api/security/csp-report', {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report' },
    body: JSON.stringify(body),
  }));
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
      effectiveDirective: 'script-src-elem',
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

  it('rejects a malformed report without storing it', async () => {
    const response = await report({ 'csp-report': { ...chromiumReport['csp-report'], 'line-number': 'twelve' } });

    expect(response.status).toBe(400);
    expect(mocks.securityAuditEventCreate).not.toHaveBeenCalled();
  });
});
