import { afterEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => {
  const model = () => ({ deleteMany: vi.fn((args: unknown) => ({ args })) });
  return {
    rateLimit: model(),
    session: model(),
    refreshToken: model(),
    refreshTokenFamily: model(),
    bookingClaimGrant: model(),
    analyticsHit: model(),
    analyticsVital: model(),
    securityAuditEvent: model(),
    metric: model(),
    log: model(),
    outboxEvent: model(),
    adminSession: model(),
    $transaction: vi.fn(async (operations: unknown[]) => operations.map((_, index) => ({ count: index }))),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { runRetention } from '@/lib/operationalMonitor';

afterEach(() => {
  vi.useRealTimers();
});

describe('operational retention', () => {
  it('removes administrator sessions 90 days after their absolute expiry', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-07-14T00:00:00Z'));

    const result = await runRetention();

    expect(prismaMock.adminSession.deleteMany).toHaveBeenCalledWith({
      where: { absoluteExpiresAt: { lt: new Date('2030-04-15T00:00:00Z') } },
    });
    expect(result.adminSessions).toBe(11);
  });
});
