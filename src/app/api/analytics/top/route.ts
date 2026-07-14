import { NextRequest } from 'next/server';
import { topPaths } from '@/lib/analyticsStore';
import { isAdminRequest } from '@/lib/rbac';

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return Response.json({ error: 'Admin credentials required' }, { status: 403 });
  const url = new URL(req.url);
  const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '10', 10) || 10);
  const sinceParam = url.searchParams.get('since');
  const since = sinceParam ? parseInt(sinceParam, 10) : undefined;
  return Response.json({ top: topPaths(limit, since) });
}
