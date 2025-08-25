import { topPaths, hourBuckets, dayBuckets, dailyNewPaths } from '@/lib/analyticsStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const top = topPaths(100);
  const hours = hourBuckets();
  const days = dayBuckets();
  const newPaths = dailyNewPaths();
  let csv = 'section,type,value,count\n';
  for (const r of top) csv += `top,path,${r.path},${r.count}\n`;
  for (const h of hours) csv += `hour,start,${new Date(h.start).toISOString()},${h.count}\n`;
  for (const d of days) csv += `day,start,${new Date(d.start).toISOString()},${d.count}\n`;
  for (const n of newPaths) csv += `new_paths,start,${new Date(n.start).toISOString()},${n.new}\n`;
  return new Response(csv, { headers: { 'content-type': 'text/csv', 'cache-control': 'no-store' } });
}