import { NextRequest } from 'next/server';
import { topPaths } from '@/lib/analyticsStore';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '10', 10) || 10);
  const sinceParam = url.searchParams.get('since');
  const since = sinceParam ? parseInt(sinceParam, 10) : undefined;
  return Response.json({ top: topPaths(limit, since) });
}
