import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  recordAnalyticsHits: vi.fn(),
  checkSensitiveRateLimit: vi.fn(),
}));

vi.mock('@/lib/analyticsRepository', () => ({
  recordAnalyticsHits: mocks.recordAnalyticsHits,
  recentAnalytics: vi.fn(),
  vitalsRecent: vi.fn(),
}));
vi.mock('@/lib/sensitiveRateLimit', () => ({ checkSensitiveRateLimit: mocks.checkSensitiveRateLimit }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/rbac', () => ({ isAdminRequest: vi.fn() }));

import { POST } from '@/app/api/analytics/route';

describe('analytics ingestion classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkSensitiveRateLimit.mockResolvedValue({
      allowed: true,
      limit: 120,
      remaining: 119,
      resetAt: new Date(Date.now() + 60_000),
    });
    mocks.recordAnalyticsHits.mockResolvedValue(1);
  });

  const request = (body: unknown) => new NextRequest('https://villa.test/api/analytics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  it('rejects an unknown custom event instead of counting it as a pageview', async () => {
    const response = await POST(request({ path: '/en', event: { name: 'unknown_event' } }));
    expect(response.status).toBe(422);
    expect(mocks.recordAnalyticsHits).not.toHaveBeenCalled();
  });

  it('still accepts an explicit pageview without an event field', async () => {
    const response = await POST(request({ path: '/en', eventId: 'pageview-123' }));
    expect(response.status).toBe(201);
    expect(mocks.recordAnalyticsHits).toHaveBeenCalledWith([
      expect.objectContaining({ path: '/en', eventId: 'pageview-123' }),
    ]);
  });
});
