import { beforeEach, describe, expect, it, vi } from 'vitest';

const transaction = vi.fn();
const ping = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: transaction },
}));
vi.mock('@/lib/upstash', () => ({ ping }));

describe('readiness probe amplification guard', () => {
  beforeEach(() => {
    vi.resetModules();
    transaction.mockReset().mockResolvedValue([{ migration_name: '20260715110000_remove_unused_legacy_models' }]);
    ping.mockReset().mockResolvedValue(true);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RATE_LIMIT_BACKEND', 'redis');
  });

  it('coalesces and caches repeated dependency probes', async () => {
    const route = await import('./route');
    const [first, second] = await Promise.all([route.GET(), route.GET()]);
    const third = await route.HEAD();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
  });
});
