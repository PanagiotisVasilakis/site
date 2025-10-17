import { NextRequest, NextResponse } from 'next/server';
import { getItemsByCategory } from '@/lib/data';
import { logger } from '@/lib/logger-enterprise';

export const dynamic = 'force-dynamic';

// Align with Next.js 15 typings where params may be wrapped in a Promise.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ category: string }> }) {
  try {
    const { category } = await params;
    
    // Validate input parameter to prevent path traversal and injection attacks
    if (!category || typeof category !== 'string' || 
        category.length > 50 || 
        /[^a-z0-9\-_]/.test(category) || 
        category.includes('..')) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
    }
    
    const items = getItemsByCategory(category).map(({ id, slug, name, summary, categoryId }) => ({ id, slug, name, summary, categoryId }));
    return new NextResponse(JSON.stringify({ items }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=30, stale-while-revalidate=120'
      }
    });
  } catch (error) {
    logger.error('Failed to fetch category items', { 
      error: error instanceof Error ? error.message : String(error), 
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/categories/[category]/items'
    });
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 });
  }
}
