import { topPaths, hourBuckets, dayBuckets, rollingAverage, percentile, vitalsSummary, stats, dailyNewPaths, vitalsRecent } from '@/lib/analyticsStore';
import AdminSessionManager from '@/components/AdminSessionManager';
import { verifyAdmin } from '@/lib/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AnalyticsAdminPage() {
  // Server-side JWT verification (Node.js runtime compatible)
  const cookieStore = await cookies();
  const jwtCookie = cookieStore.get('admin_jwt');
  
  if (!jwtCookie?.value || !verifyAdmin(jwtCookie.value)) {
    // JWT is missing or invalid, redirect to login
    redirect('/admin/login?error=session_expired');
  }
  
  // If we reach here, both secret (from middleware) and JWT are valid
  const top = topPaths(20);
  const summary = stats();
  const newPaths = dailyNewPaths(14);
  const vitals = vitalsSummary();
  const recentVitals = vitalsRecent(30);
  const hoursRaw = hourBuckets();
  const daysRaw = dayBuckets();
  const hours = rollingAverage(hoursRaw, 3);
  const days = rollingAverage(daysRaw, 7);
  const hourCounts = hoursRaw.map(h => h.count);
  const p50 = percentile(hourCounts, 0.5);
  const p90 = percentile(hourCounts, 0.9);
  const p99 = percentile(hourCounts, 0.99);
  return (
    <div className="mx-auto max-w-4xl p-6 space-y-8">
      <AdminSessionManager />
  <h1 className="text-2xl font-semibold" style={{color:'var(--text-accent)'}}>Analytics Overview</h1>
      <section className="grid gap-4 md:grid-cols-2">
  <div className="p-3 rounded border-soft" style={{background:'var(--layer-surface)'}}>
          <div className="text-xs uppercase tracking-wide" style={{color:'var(--text-accent-subtle)'}}>Unique Paths</div>
          <div className="text-2xl font-semibold" style={{color:'var(--text-accent)'}}>{summary.uniquePaths}</div>
        </div>
        <div className="p-3 rounded border border-emerald-200 bg-emerald-50">
          <div className="text-xs uppercase tracking-wide text-emerald-600">Daily New Paths (14d)</div>
          <div className="flex items-end gap-1 h-12">
            {newPaths.map(b => <div key={b.start} title={new Date(b.start).toISOString().slice(0,10)} className="bg-emerald-500/70" style={{height: (b.new?4+Math.min(40,b.new*4):4), width:'6px'}} />)}
          </div>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-medium mb-2">Top Paths</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b"><th className="py-1 pr-4">Path</th><th className="py-1">Hits</th></tr></thead>
            <tbody>
              {top.map(r => <tr key={r.path} className="border-b last:border-0"><td className="py-1 pr-4 font-mono break-all">{r.path}</td><td className="py-1">{r.count}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-medium mb-2">Web Vitals (Rolling)</h2>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead><tr className="text-left border-b"><th className="py-1 pr-4">Metric</th><th className="py-1 pr-4">Avg</th><th className="py-1 pr-4">P90</th><th className="py-1">Samples</th></tr></thead>
            <tbody>
              {vitals.map(v => <tr key={v.name} className="border-b last:border-0"><td className="py-1 pr-4 font-mono">{v.name}</td><td className="py-1 pr-4">{v.avg.toFixed(2)}</td><td className="py-1 pr-4">{v.p90?.toFixed(2)}</td><td className="py-1">{v.count}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {Object.entries(recentVitals).map(([name, list]) => {
            const max = Math.max(...list.map(v=>v.value), 0.0001);
            const values = list.map(v=>v.value).sort((a,b)=>a-b);
            const pick = (p:number) => values.length? values[Math.min(values.length-1, Math.floor(p*(values.length-1)))] : 0;
            const p50 = pick(0.5), p90 = pick(0.9), p99 = pick(0.99);
            return (
              <div key={name} className="p-2 border rounded bg-white shadow-sm">
                <div className="text-xs font-medium mb-1">{name}</div>
                <div className="relative h-16 flex items-end gap-[2px]">
                  <div className="absolute left-0 right-0" style={{bottom: `${(p50/max)*100}%`}}>
                    <div className="h-[1px] bg-emerald-400/70" />
                  </div>
                  <div className="absolute left-0 right-0" style={{bottom: `${(p90/max)*100}%`}}>
                    <div className="h-[1px] bg-amber-400/70" />
                  </div>
                  <div className="absolute left-0 right-0" style={{bottom: `${(p99/max)*100}%`}}>
                    <div className="h-[1px] bg-rose-400/70" />
                  </div>
                  {list.map(v => <div key={v.id} title={new Date(v.ts).toISOString()+` value:${v.value.toFixed(2)}`} style={{height: `${(v.value/max)*100}%`, background:'color-mix(in srgb, var(--brand-500) 70%, transparent)', width:'4px'}} />)}
                </div>
                <div className="text-[10px] text-gray-500 mt-1 flex flex-wrap gap-2">max {max.toFixed(2)} <span className="text-emerald-500">p50 {p50.toFixed(2)}</span> <span className="text-amber-500">p90 {p90.toFixed(2)}</span> <span className="text-rose-500">p99 {p99.toFixed(2)}</span></div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium mb-2">Last 24 Hours (UTC)</h2>
        <div className="text-xs text-gray-600">P50: {p50} • P90: {p90} • P99: {p99}</div>
        <div className="flex gap-1 items-end h-32">
          {hours.map(b => <div key={b.start} title={`${new Date(b.start).toISOString()} avg:${b.avg.toFixed(1)}`} style={{background:'color-mix(in srgb, var(--brand-600) 70%, transparent)', height: (b.count ? 4 + Math.min(80, b.count)*4 : 4), width: '12px'}} className="relative hover:brightness-110">
            <div className="absolute bottom-0 left-0 right-0 bg-emerald-400/70" style={{height: `${Math.min(100, b.avg*4)}%`}} />
          </div>)}
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-medium mb-2">Last 30 Days (UTC)</h2>
        <div className="flex gap-1 items-end h-32 overflow-x-auto">
          {days.map(b => <div key={b.start} title={`${new Date(b.start).toISOString().slice(0,10)} avg:${b.avg.toFixed(1)}`} style={{background:'color-mix(in srgb, var(--brand-400) 70%, transparent)', height: (b.count ? 4 + Math.min(80, b.count)*2 : 4), width: '10px'}} className="relative hover:brightness-110">
            <div className="absolute bottom-0 left-0 right-0 bg-emerald-300/70" style={{height: `${Math.min(100, b.avg*2)}%`}} />
          </div>)}
        </div>
      </section>
  <p className="text-xs text-gray-500">Paths may be hashed & UA omitted if anonymization enabled. Vitals are client-reported (CLS, INP, LCP, FID, TTFB).</p>
  </div>
  );
}
