import { hourBuckets, dayBuckets } from '@/lib/analyticsRepository';
import { NextRequest } from 'next/server';
import { isAdminRequest } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) return Response.json({ error: 'Admin credentials required' }, { status: 403 });
  const [hours, days] = await Promise.all([hourBuckets(), dayBuckets()]);
  return Response.json({ hours, days }, { headers: { 'cache-control': 'no-store, private' } });
}
