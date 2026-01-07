
export { };


const DATASET_KEYS = ['bookings', 'users', 'identities', 'checkins', 'access'] as const;

type GuestDatasetKey = typeof DATASET_KEYS[number];
type GuestDatasetSnapshot = {
  key: GuestDatasetKey;
  version: string;
  rowCount: number;
  latestChange: string | null;
  error?: string;
};

vi.mock('@/lib/guestDatasetVersion', () => {
  return {
    GUEST_DATASET_KEYS: DATASET_KEYS,
    getGuestDatasetSnapshot: vi.fn(),
  };
});

process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://user:pass@localhost:5432/testdb';

const { createGuestDataCache } = await import('@/lib/guestDataCache');

describe('GuestDataCache', () => {
  it('reuses cached values until dataset version changes', async () => {
    const rowCounts: Record<GuestDatasetKey, number> = {
      bookings: 2,
      users: 0,
      identities: 0,
      checkins: 0,
      access: 0,
    };
    const versionTokens: Record<GuestDatasetKey, string> = {
      bookings: 'v1',
      users: 'v0',
      identities: 'v0',
      checkins: 'v0',
      access: 'v0',
    };

    const config = Object.fromEntries(
      DATASET_KEYS.map((key) => [
        key,
        async () => ({
          key,
          rowCount: rowCounts[key],
          latestChange: null,
          version: `${rowCounts[key]}:${versionTokens[key]}`,
        } satisfies GuestDatasetSnapshot),
      ])
    ) as Partial<Record<GuestDatasetKey, () => Promise<GuestDatasetSnapshot>>>;

    const cache = createGuestDataCache(config);

    const loader = vi.fn(async () => ['alpha', 'beta']);

    const first = await cache.get('bookings', loader);
    expect(first).toEqual(['alpha', 'beta']);
    expect(loader).toHaveBeenCalledTimes(1);

    const second = await cache.get('bookings', loader);
    expect(second).toEqual(['alpha', 'beta']);
    expect(loader).toHaveBeenCalledTimes(1); // hit from cache

    const metricsAfterHit = cache.metrics();
    expect(metricsAfterHit.hits).toBeGreaterThanOrEqual(1);
    expect(metricsAfterHit.misses).toBeGreaterThanOrEqual(1);
    expect(metricsAfterHit.entries.bookings.cached).toBe(true);
    expect(metricsAfterHit.entries.bookings.size).toBe(2);

    // Simulate dataset change by updating version token
    rowCounts.bookings = 3;
    versionTokens.bookings = 'v2';

    const third = await cache.get('bookings', loader);
    expect(third).toEqual(['alpha', 'beta']);
    expect(loader).toHaveBeenCalledTimes(2);

    // Explicit invalidation clears the entry
    cache.invalidate(['bookings']);
    const metricsAfterInvalidate = cache.metrics();
    expect(metricsAfterInvalidate.entries.bookings.cached).toBe(false);
    expect(metricsAfterInvalidate.invalidations).toBeGreaterThanOrEqual(1);
  });
});
