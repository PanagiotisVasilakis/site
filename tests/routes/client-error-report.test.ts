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
