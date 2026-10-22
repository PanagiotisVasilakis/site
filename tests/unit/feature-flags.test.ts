import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  operationalSetting: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { ApiError } from '@/lib/apiErrorHandler';
import {
  FeatureFlagsUnavailableError,
  getFeatureFlagsAsync,
  getFeatureFlagsOrOff,
  setFeatureFlags,
} from '@/lib/featureFlags';

afterEach(() => {
  vi.useRealTimers();
});

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

describe('feature flag read failures', () => {
  it.each(['production', 'development'])(
    'reports an unavailable read as 503 and returns no flags in %s, so no feature can be switched on by the failure',
    async (environment) => {
      vi.stubEnv('NODE_ENV', environment);
      prismaMock.operationalSetting.findUnique.mockRejectedValue(new Error('Connection terminated due to connection timeout'));

      const failure = await getFeatureFlagsAsync().then(() => undefined, (error: unknown) => error);

      expect(failure).toBeInstanceOf(FeatureFlagsUnavailableError);
      expect(failure).toBeInstanceOf(ApiError);
      expect(failure).toMatchObject({
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable',
        details: { retryAfterSeconds: 5 },
      });
    },
  );

  it('reports a client that cannot even start a query (no database configured) as unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    prismaMock.operationalSetting.findUnique.mockImplementation(() => {
      throw new Error('Prisma client is not initialized. DATABASE_URL must be configured on the server.');
    });

    await expect(getFeatureFlagsAsync()).rejects.toBeInstanceOf(FeatureFlagsUnavailableError);
  });

  it('tells a switched-off feature (stored false) from an unreadable flag', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    prismaMock.operationalSetting.findUnique.mockResolvedValue({ value: { portalEnabled: false, checkinEnabled: false } });

    await expect(getFeatureFlagsAsync()).resolves.toEqual({ portalEnabled: false, checkinEnabled: false });
  });

  it('stops waiting for a read that never answers after three seconds', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NODE_ENV', 'production');
    prismaMock.operationalSetting.findUnique.mockReturnValue(new Promise(() => undefined));
    let settled = false;
    const outcome = getFeatureFlagsAsync().then(() => 'flags', (error: unknown) => error).finally(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(2_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await outcome).toBeInstanceOf(FeatureFlagsUnavailableError);
  });

  it('does not leave an unhandled rejection when the abandoned read fails later', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NODE_ENV', 'production');
    let failRead: (error: Error) => void = () => undefined;
    prismaMock.operationalSetting.findUnique.mockReturnValue(new Promise((_, reject) => { failRead = reject; }));
    const outcome = getFeatureFlagsAsync().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await outcome).toBeInstanceOf(FeatureFlagsUnavailableError);

    // The pool's own query_timeout ends the read much later; vitest fails the run on an unhandled rejection.
    failRead(new Error('Query read timeout'));
    await vi.advanceTimersByTimeAsync(25_000);
  });

  it('clears the deadline timer once the flags were read', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NODE_ENV', 'production');
    prismaMock.operationalSetting.findUnique.mockResolvedValue({ value: { portalEnabled: true, checkinEnabled: true } });

    await expect(getFeatureFlagsAsync()).resolves.toEqual({ portalEnabled: true, checkinEnabled: true });

    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps both features off for a page that renders without the flags, also outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    prismaMock.operationalSetting.findUnique.mockRejectedValue(new Error('Query read timeout'));

    await expect(getFeatureFlagsOrOff()).resolves.toEqual({ portalEnabled: false, checkinEnabled: false });
  });

  it('gives that page the stored flags when the read works', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    prismaMock.operationalSetting.findUnique.mockResolvedValue({ value: { portalEnabled: true, checkinEnabled: false } });

    await expect(getFeatureFlagsOrOff()).resolves.toEqual({ portalEnabled: true, checkinEnabled: false });
  });
});
