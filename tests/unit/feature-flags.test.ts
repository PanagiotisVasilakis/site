import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  operationalSetting: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { getFeatureFlagsAsync, setFeatureFlags } from '@/lib/featureFlags';

describe('feature flag coupling', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  it.each([
    [true, true, { portalEnabled: true, checkinEnabled: true }],
    [true, false, { portalEnabled: true, checkinEnabled: false }],
    [false, true, { portalEnabled: false, checkinEnabled: false }],
    [false, false, { portalEnabled: false, checkinEnabled: false }],
  ])('stored portal=%s check-in=%s is effective as %j', async (portalEnabled, checkinEnabled, expected) => {
    prismaMock.operationalSetting.findUnique.mockResolvedValue({ value: { portalEnabled, checkinEnabled } });

    expect(await getFeatureFlagsAsync()).toEqual(expected);
  });

  it('keeps the stored check-in value and applies it again when the portal is re-enabled', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ value: { portalEnabled: true, checkinEnabled: true } }]);

    expect(await setFeatureFlags({ portalEnabled: true })).toEqual({ portalEnabled: true, checkinEnabled: true });
    const serialized = String(prismaMock.$queryRaw.mock.calls[0]?.slice(1));
    expect(serialized).toContain('"portalEnabled":true');
    expect(serialized).not.toContain('checkinEnabled');
  });

  it('keeps both features off by default in production', async () => {
    prismaMock.operationalSetting.findUnique.mockResolvedValue(null);

    expect(await getFeatureFlagsAsync()).toEqual({ portalEnabled: false, checkinEnabled: false });
  });
});
