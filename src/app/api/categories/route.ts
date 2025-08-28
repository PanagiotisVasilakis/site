import { NextResponse } from 'next/server';
import { getCategoriesWithCounts } from '@/lib/data';

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
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
