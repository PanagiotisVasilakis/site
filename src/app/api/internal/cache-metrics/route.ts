import { NextRequest } from 'next/server';
import { guestDataCache } from '@/lib/guestDataCache';
import { getGuestDatasetSnapshots } from '@/lib/guestDatasetVersion';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';

export const dynamic = 'force-dynamic';

const guard = createAPISecurityMiddleware({ requireAPIKey: true, requiredScopes: ['internal'] });

export async function GET(request: NextRequest) {
  const early = guard(request);
  if (early) return early;

  const [metrics, snapshots] = await Promise.all([
    Promise.resolve(guestDataCache.metrics()),
    getGuestDatasetSnapshots(),
  ]);

  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      cache: metrics,
      datasets: snapshots,
    },
    {
      headers: {
        'cache-control': 'no-store, private',
      },
    },
  );
}
