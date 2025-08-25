import { hourBuckets, dayBuckets } from '@/lib/analyticsStore';

export async function GET() {
  return Response.json({ hours: hourBuckets(), days: dayBuckets() });
}
