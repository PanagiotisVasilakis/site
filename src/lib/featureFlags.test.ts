const operationalSetting = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { operationalSetting } }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: { error: vi.fn() } }));

import {
  getFeatureFlags,
  getFeatureFlagsAsync,
  resetFeatureFlags,
  setFeatureFlags,
} from './featureFlags';

describe('shared feature flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFeatureFlags();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads and normalizes the shared database value', async () => {
    operationalSetting.findUnique.mockResolvedValue({
      value: { portalEnabled: false, checkinEnabled: true },
    });
    await expect(getFeatureFlagsAsync()).resolves.toEqual({ portalEnabled: false, checkinEnabled: true });
    expect(getFeatureFlags()).toEqual({ portalEnabled: false, checkinEnabled: true });
  });

  it('persists a partial update without discarding the other flag', async () => {
    operationalSetting.findUnique.mockResolvedValue({
      value: { portalEnabled: true, checkinEnabled: true },
    });
    operationalSetting.upsert.mockResolvedValue({});
    await expect(setFeatureFlags({ checkinEnabled: false })).resolves.toEqual({
      portalEnabled: true,
      checkinEnabled: false,
    });
    expect(operationalSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { value: { portalEnabled: true, checkinEnabled: false } },
    }));
  });

  it('fails closed in production if the shared store is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    operationalSetting.findUnique.mockRejectedValue(new Error('database unavailable'));
    resetFeatureFlags();
    await expect(getFeatureFlagsAsync()).resolves.toEqual({ portalEnabled: false, checkinEnabled: false });
  });
});
