import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  logger: {
    warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), getContext: vi.fn(), setContext: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));
vi.mock('@/lib/featureFlags', () => ({ getFeatureFlagsAsync: async () => ({ portalEnabled: true }) }));

import { POST as claimPost } from '@/app/api/portal/claims/route';
import { createSecurityMiddleware } from '@/lib/security-middleware-edge';

describe('pre-authentication security diagnostics', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@127.0.0.1:1/db');
    mocks.transaction.mockResolvedValue(undefined);
  });

  it('rejects a forged Origin on any API path with a log line and no database write', async () => {
    const response = await createSecurityMiddleware()(new NextRequest('https://guide.example/api/does-not-exist', {
      headers: { origin: 'https://evil.example', host: 'guide.example' },
    }));

    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalledWith('Security diagnostic', expect.objectContaining({
      type: 'cors_violation',
      path: '/api/does-not-exist',
    }));
  });

  it('rejects a wrong content type on a JSON route with a 415 JSON envelope, a log line and no database write', async () => {
    const response = await claimPost(new NextRequest('https://guide.example/api/portal/claims', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x',
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalledWith('Security diagnostic', expect.objectContaining({
      type: 'api_security_violation',
      details: expect.objectContaining({ violationType: 'invalid_content_type' }),
    }));
  });
});
