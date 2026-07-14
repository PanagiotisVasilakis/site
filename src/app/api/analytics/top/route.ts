import { NextRequest } from 'next/server';
import { topPaths } from '@/lib/analyticsRepository';
import { isAdminRequest } from '@/lib/rbac';

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return Response.json({ error: 'Admin credentials required' }, { status: 403 });
  const url = new URL(req.url);
  const requestedLimit = Number.parseInt(url.searchParams.get('limit') || '10', 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, requestedLimit)) : 10;
  const sinceParam = url.searchParams.get('since');
  const parsedSince = sinceParam ? parseInt(sinceParam, 10) : undefined;
  const since = parsedSince !== undefined && Number.isFinite(parsedSince) && parsedSince > 0 ? parsedSince : undefined;
  return Response.json({ top: await topPaths(limit, since) }, { headers: { 'cache-control': 'no-store, private' } });
}
