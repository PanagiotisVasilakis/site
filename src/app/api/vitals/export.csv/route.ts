import { vitalsSummary, vitalsRecent } from '@/lib/analyticsStore';

export const dynamic = 'force-dynamic';

export function GET() {
  const summary = vitalsSummary();
  const recent = vitalsRecent(100); // up to 100 recent per metric
  let csv = 'metric,avg,p90,count\n';
  for (const v of summary) {
    csv += `${v.name},${v.avg.toFixed(3)},${v.p90?.toFixed(3)},${v.count}\n`;
  }
  csv += '\nmetric,id,timestamp,value\n';
  for (const [name, list] of Object.entries(recent)) {
    for (const v of list) {
      csv += `${name},${v.id},${new Date(v.ts).toISOString()},${v.value}\n`;
    }
  }
  return new Response(csv, { headers: { 'content-type': 'text/csv', 'cache-control': 'no-store' } });
}
