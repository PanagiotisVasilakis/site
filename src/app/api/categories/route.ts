import { NextResponse } from 'next/server';
import { getCategoriesWithCounts } from '@/lib/data';
import { logger } from '@/lib/logger';

// Force dynamic so data reflects any file changes without a full rebuild (dev/edge friendly)
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const categories = getCategoriesWithCounts().map(({ id, slug, title, count }) => ({ id, slug, title, count }));
    return new NextResponse(JSON.stringify({ categories }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // Allow intermediate caching briefly while still being dynamic
        'cache-control': 'public, max-age=30, stale-while-revalidate=120'
      }
    });
  } catch (error) {
    logger.error('Failed to fetch categories', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 });
  }
}
