import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

function parseLcovSummary(lcovPath: string) {
  try {
    if (!fs.existsSync(lcovPath)) return null;
    const data = fs.readFileSync(lcovPath, 'utf-8');
    // Look for end_of_record groups with lines coverage: LH: x, LF: y
    let linesPct: number | null = null;
    const lines = data.split(/\n+/);
    let metrics: Record<string, number> = {};
    for (const line of lines) {
      if (/^end_of_record/.test(line)) {
        if (metrics.LH != null && metrics.LF) {
          linesPct = Math.round((metrics.LH / metrics.LF) * 100);
        }
        metrics = {};
      } else if (line.includes(':')) {
        const [k,v] = line.split(':');
        const num = parseInt(v, 10);
        if (!isNaN(num)) metrics[k] = num;
      }
    }
    return linesPct;
  } catch { return null; }
}

export async function GET() {
  const pct = parseLcovSummary(path.join(process.cwd(), 'coverage', 'lcov.info'));
  const value = pct != null ? `${pct}%` : 'n/a';
  const badge = {
    schemaVersion: 1,
    label: 'coverage',
    message: value,
    color: pct == null ? 'lightgrey' : pct > 85 ? 'brightgreen' : pct > 70 ? 'yellowgreen' : 'orange'
  };
  return new Response(JSON.stringify(badge), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}