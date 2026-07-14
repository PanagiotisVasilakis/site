import { hourBuckets, dayBuckets } from '@/lib/analyticsStore';
import { NextRequest } from 'next/server';
import { isAdminRequest } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) return Response.json({ error: 'Admin credentials required' }, { status: 403 });
  return Response.json({ hours: hourBuckets(), days: dayBuckets() });
}
