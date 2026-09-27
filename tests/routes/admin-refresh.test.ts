import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyAdminSession: vi.fn(),
  refreshAdminSession: vi.fn(),
}));

vi.mock('@/lib/auth/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/admin')>()),
  verifyAdminSession: mocks.verifyAdminSession,
  refreshAdminSession: mocks.refreshAdminSession,
}));

import { POST } from '@/app/api/admin/refresh/route';

const NOW = new Date('2030-03-01T10:00:00.000Z');
const SESSION_ID = '0f8d6a55-2f5e-4c43-9a5e-1d6d0f3f9b11';

function refresh() {
  return POST(new NextRequest('http://localhost:3000/api/admin/refresh', {
    method: 'POST',
    headers: { cookie: 'admin_jwt=signed' },
  }), { params: Promise.resolve({}) });
}

describe('admin session refresh route', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mocks.verifyAdminSession.mockResolvedValue({
      type: 'admin', role: 'admin', session_id: SESSION_ID, login_at: Math.floor(NOW.getTime() / 1000) - 3600,
    });
  });
  afterEach(() => vi.useRealTimers());

  it('returns the new server-side expiry and a cookie that lasts until it', async () => {
    mocks.refreshAdminSession.mockResolvedValue(new Date(NOW.getTime() + 2 * 60 * 60_000));

    const response = await refresh();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, expiresAt: '2030-03-01T12:00:00.000Z' });
    expect(response.cookies.get('admin_jwt')?.maxAge).toBe(7200);
  });

  it('answers 401 when the session reached its absolute limit', async () => {
    mocks.refreshAdminSession.mockResolvedValue(null);

    const response = await refresh();

    expect(response.status).toBe(401);
    expect(response.cookies.get('admin_jwt')).toBeUndefined();
  });
});
