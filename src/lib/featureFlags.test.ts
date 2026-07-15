const mocks = vi.hoisted(() => ({
  operationalSetting: { findUnique: vi.fn() },
  queryRaw: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { operationalSetting: mocks.operationalSetting, $queryRaw: mocks.queryRaw } }));
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
    mocks.operationalSetting.findUnique.mockResolvedValue({
      value: { portalEnabled: false, checkinEnabled: true },
    });
    await expect(getFeatureFlagsAsync()).resolves.toEqual({ portalEnabled: false, checkinEnabled: true });
    expect(getFeatureFlags()).toEqual({ portalEnabled: false, checkinEnabled: true });
  });

  it('persists a partial update without discarding the other flag', async () => {
    mocks.queryRaw.mockResolvedValue([{ value: { portalEnabled: true, checkinEnabled: false } }]);
    await expect(setFeatureFlags({ checkinEnabled: false })).resolves.toEqual({
      portalEnabled: true,
      checkinEnabled: false,
    });
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.queryRaw.mock.calls[0][0].join(' ')).toContain('|| EXCLUDED.');
  });

  it('fails closed in production if the shared store is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.operationalSetting.findUnique.mockRejectedValue(new Error('database unavailable'));
    resetFeatureFlags();
    await expect(getFeatureFlagsAsync()).resolves.toEqual({ portalEnabled: false, checkinEnabled: false });
  });
});
