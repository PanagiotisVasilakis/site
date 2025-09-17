import { NextRequest, NextResponse } from 'next/server';
import { getItem } from '@/lib/data';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// Note: In Next.js 15 the "params" passed to route handlers can be a Promise in type defs.
// We accept a Promise form to satisfy the RouteHandlerConfig typing.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ category: string; slug: string }> }) {
  try {
    const { category, slug } = await params; // Await in case it's a Promise per Next.js types
    
    // Validate input parameters to prevent path traversal and injection attacks
    if (!category || !slug || 
        typeof category !== 'string' || typeof slug !== 'string' ||
        category.length > 50 || slug.length > 100 ||
        /[^a-z0-9\-_]/.test(category) || /[^a-z0-9\-_]/.test(slug) ||
        category.includes('..') || slug.includes('..')) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
    }
    
    const item = getItem(category, slug);
    if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const { id, name, summary, address, phone, location, categoryId } = item;
    return new NextResponse(JSON.stringify({ item: { id, slug: item.slug, name, summary, address, phone, location, categoryId } }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=30, stale-while-revalidate=120'
      }
    });
  } catch (error) {
    logger.error('Failed to fetch item details', { 
      error: error instanceof Error ? error.message : String(error), 
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/categories/[category]/items/[slug]'
    });
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 });
  }
}
