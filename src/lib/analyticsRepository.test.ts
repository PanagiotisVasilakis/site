const queryRaw = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: queryRaw } }));

import { dailyNewPaths, dayBuckets, hourBuckets } from '@/lib/analyticsRepository';

describe('analytics UTC bucket queries', () => {
  beforeEach(() => queryRaw.mockReset().mockResolvedValue([]));

  it('pins hour, day, and first-seen buckets to UTC', async () => {
    await hourBuckets(2);
    await dayBuckets(2);
    await dailyNewPaths(2);

    expect(queryRaw).toHaveBeenCalledTimes(3);
    for (const [template] of queryRaw.mock.calls) {
      expect(template.join(' ')).toContain("AT TIME ZONE 'UTC'");
    }
  });
});
