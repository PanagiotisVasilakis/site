import { NextRequest, NextResponse } from 'next/server';
import { getItemsByCategory } from '@/lib/data';

export const dynamic = 'force-dynamic';

// Align with Next.js 15 typings where params may be wrapped in a Promise.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ category: string }> }) {
  try {
  const { category } = await params;
    const items = getItemsByCategory(category).map(({ id, slug, name, summary, categoryId }) => ({ id, slug, name, summary, categoryId }));
    return new NextResponse(JSON.stringify({ items }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=30, stale-while-revalidate=120'
      }
    });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
