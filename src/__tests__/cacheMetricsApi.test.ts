import { NextRequest } from 'next/server';

vi.mock('@/lib/guestDataCache', () => ({
  guestDataCache: {
    metrics: vi.fn(() => ({ hits: 1, misses: 0 })),
  },
}));

vi.mock('@/lib/guestDatasetVersion', () => ({
  getGuestDatasetSnapshots: vi.fn(async () => []),
}));

describe('GET /api/internal/cache-metrics', () => {
  const readKey = '0123456789abcdef0123456789abcdef';
  const internalKey = 'fedcba9876543210fedcba9876543210';

  beforeEach(() => {
    vi.stubEnv('VALID_API_KEYS', readKey);
    vi.stubEnv('INTERNAL_API_KEYS', internalKey);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires an API key', async () => {
    const { GET } = await import('@/app/api/internal/cache-metrics/route');
    const response = await GET(new NextRequest('https://example.com/api/internal/cache-metrics'));

    expect(response.status).toBe(401);
  });

  it('rejects a valid key without internal scope', async () => {
    const { GET } = await import('@/app/api/internal/cache-metrics/route');
    const request = new NextRequest('https://example.com/api/internal/cache-metrics', {
      headers: { 'x-api-key': readKey },
    });

    expect((await GET(request)).status).toBe(403);
  });

  it('returns private metrics for the dedicated internal key', async () => {
    const { GET } = await import('@/app/api/internal/cache-metrics/route');
    const request = new NextRequest('https://example.com/api/internal/cache-metrics', {
      headers: { 'x-api-key': internalKey },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(await response.json()).toMatchObject({
      cache: { hits: 1, misses: 0 },
      datasets: [],
    });
  });
});
