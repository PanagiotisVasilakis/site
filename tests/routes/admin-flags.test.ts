import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  getFeatureFlagsAsync: vi.fn(),
  setFeatureFlags: vi.fn(),
}));

vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/featureFlags', () => ({
  getFeatureFlagsAsync: mocks.getFeatureFlagsAsync,
  setFeatureFlags: mocks.setFeatureFlags,
}));

import { GET, POST } from '@/app/api/admin/flags/route';

const FLAGS = { portalEnabled: true, checkinEnabled: true };

function post(body: unknown): Promise<Response> {
  return POST(new NextRequest('http://localhost:3000/api/admin/flags', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({}) });
}

function get(): Promise<Response> {
  return GET(new NextRequest('http://localhost:3000/api/admin/flags'), { params: Promise.resolve({}) });
}

describe('admin feature flags route', () => {
  beforeEach(() => {
    mocks.isAdminRequest.mockResolvedValue(true);
    mocks.getFeatureFlagsAsync.mockResolvedValue(FLAGS);
    mocks.setFeatureFlags.mockImplementation(async (partial: Record<string, boolean>) => ({ ...FLAGS, ...partial }));
  });

  it('answers 401 to a non-admin GET and POST without touching the flags', async () => {
    mocks.isAdminRequest.mockResolvedValue(false);

    expect((await get()).status).toBe(401);
    expect((await post({ portalEnabled: false })).status).toBe(401);
    expect(mocks.getFeatureFlagsAsync).not.toHaveBeenCalled();
    expect(mocks.setFeatureFlags).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty object', {}],
    ['a non-boolean flag', { portalEnabled: 'false' }],
  ])('answers 422 for %s without writing', async (_label, body) => {
    const response = await post(body);

    expect(response.status).toBe(422);
    expect(mocks.setFeatureFlags).not.toHaveBeenCalled();
  });

  it('writes exactly the posted flags and returns the updated set', async () => {
    const response = await post({ checkinEnabled: false });

    expect(response.status).toBe(200);
    expect(mocks.setFeatureFlags).toHaveBeenCalledTimes(1);
    expect(mocks.setFeatureFlags).toHaveBeenCalledWith({ checkinEnabled: false });
    expect((await response.json()).data).toEqual({ portalEnabled: true, checkinEnabled: false });
  });

  it('returns the current flags to an admin GET', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(FLAGS);
  });
});
