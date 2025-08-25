import crypto from 'node:crypto';
import { createStorageAdapter } from './storageAdapter';

export interface AnalyticsHit { path: string; ts: number; ua: string | null; locale?: string }

const hits: AnalyticsHit[] = [];
const firstSeen: Record<string, number> = {};
export type Vital = { name: string; value: number; id: string; ts: number };
const vitals: Vital[] = [];
let loaded = false;

const persistEnabled = process.env.ANALYTICS_PERSIST === '1' && !process.env.VERCEL; // opt-in persistence
const retentionDays = Math.max(1, parseInt(process.env.ANALYTICS_RETENTION_DAYS || '30', 10));
const storage = createStorageAdapter();
const hashPaths = process.env.ANALYTICS_HASH_PATHS === '1';

function maybeHash(p: string) {
  if (!hashPaths) return p;
  return crypto.createHash('sha256').update(p).digest('hex').slice(0, 32); // shorten
}

export function loadHits() {
  if (loaded) return;
  loaded = true;
  if (!persistEnabled) return; // skip loading if not persisting
  try {
    const data = storage.load();
    if (Array.isArray(data.hits)) hits.push(...data.hits);
    Object.assign(firstSeen, data.firstSeen || {});
    if (Array.isArray(data.vitals)) vitals.push(...data.vitals.slice(-5000));
  } catch {}
}

function persist() {
  if (!persistEnabled) return;
  storage.save({ hits, vitals, firstSeen });
}

export function addHits(newHits: Array<Omit<AnalyticsHit, 'ua'>> , ua: string | null) {
  loadHits();
  for (const h of newHits) {
    if (!h.path) continue;
  const norm = maybeHash(h.path);
  hits.push({ path: norm, ts: h.ts || Date.now(), ua: hashPaths ? null : ua, locale: h.locale });
  if (firstSeen[norm] == null) firstSeen[norm] = Date.now();
  }
  // Drop hits older than 30 days for rolling retention
  const cutoff = Date.now() - retentionDays * 86400_000;
  while (hits.length && hits[0].ts < cutoff) hits.shift();
  if (newHits.length) persist();
  return newHits.length;
}

export function getHits() {
  loadHits();
  return hits;
}

export function topPaths(limit = 10, since?: number) {
  loadHits();
  const agg = new Map<string, number>();
  for (const h of hits) {
    if (since && h.ts < since) continue;
    agg.set(h.path, (agg.get(h.path) || 0) + 1);
  }
  return [...agg.entries()].sort((a,b) => b[1]-a[1]).slice(0, limit).map(([path,count]) => ({ path, count }));
}

// Time-bucket stats (UTC)
export function hourBuckets(lastHours = 24) {
  loadHits();
  const now = Date.now();
  const hourMs = 3600_000;
  const currentHourStart = Math.floor(now / hourMs) * hourMs;
  const buckets: Array<{ start: number; count: number }> = [];
  for (let i = lastHours - 1; i >= 0; i--) {
    const start = currentHourStart - i * hourMs;
    buckets.push({ start, count: 0 });
  }
  const startThreshold = currentHourStart - (lastHours - 1) * hourMs;
  for (const h of hits) {
    if (h.ts < startThreshold) continue;
    const index = Math.floor((h.ts - startThreshold) / hourMs);
    if (index >= 0 && index < buckets.length) buckets[index].count++;
  }
  return buckets;
}

export function dayBuckets(lastDays = 30) {
  loadHits();
  const now = Date.now();
  const dayMs = 86400_000;
  const currentDayStart = Math.floor(now / dayMs) * dayMs;
  const buckets: Array<{ start: number; count: number }> = [];
  for (let i = lastDays - 1; i >= 0; i--) {
    const start = currentDayStart - i * dayMs;
    buckets.push({ start, count: 0 });
  }
  const startThreshold = currentDayStart - (lastDays - 1) * dayMs;
  for (const h of hits) {
    if (h.ts < startThreshold) continue;
    const index = Math.floor((h.ts - startThreshold) / dayMs);
    if (index >= 0 && index < buckets.length) buckets[index].count++;
  }
  return buckets;
}

export function stats() {
  return { hours: hourBuckets(), days: dayBuckets(), uniquePaths: Object.keys(firstSeen).length };
}

// Rolling average utilities
export function rollingAverage(buckets: Array<{ start: number; count: number }>, window: number) {
  const out: Array<{ start: number; count: number; avg: number }> = [];
  let sum = 0;
  const q: number[] = [];
  for (const b of buckets) {
    q.push(b.count); sum += b.count;
    if (q.length > window) sum -= q.shift()!;
    const avg = sum / q.length;
    out.push({ ...b, avg });
  }
  return out;
}

export function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a,b)=>a-b);
  const idx = Math.min(sorted.length-1, Math.floor(p * (sorted.length - 1)));
  return sorted[idx];
}

export function dailyNewPaths(lastDays = 30) {
  const dayMs = 86400_000;
  const now = Date.now();
  const currentDayStart = Math.floor(now / dayMs) * dayMs;
  const buckets: Array<{ start: number; new: number }> = [];
  for (let i = lastDays - 1; i >= 0; i--) {
    const start = currentDayStart - i * dayMs;
    buckets.push({ start, new: 0 });
  }
  const startThreshold = currentDayStart - (lastDays - 1) * dayMs;
  for (const ts of Object.values(firstSeen)) {
    if (ts < startThreshold) continue;
    const index = Math.floor((ts - startThreshold) / dayMs);
    if (index >= 0 && index < buckets.length) buckets[index].new++;
  }
  return buckets;
}

export function addVital(v: Vital) {
  vitals.push(v);
  if (vitals.length > 5000) vitals.splice(0, vitals.length - 5000);
  // Drop vitals older than 30 days
  const cutoff = Date.now() - retentionDays * 86400_000;
  while (vitals.length && vitals[0].ts < cutoff) vitals.shift();
  persist();
}

export function vitalsSummary() {
  const byName: Record<string, { count: number; sum: number; p90?: number }> = {};
  for (const v of vitals) {
    const bucket = byName[v.name] || (byName[v.name] = { count: 0, sum: 0 });
    bucket.count++; bucket.sum += v.value;
  }
  for (const k of Object.keys(byName)) {
    const vals = vitals.filter(v => v.name === k).map(v => v.value);
    byName[k].p90 = percentile(vals, 0.9);
  }
  return Object.entries(byName).map(([name, d]) => ({ name, avg: d.sum / d.count, count: d.count, p90: d.p90 }));
}

export function vitalsRecent(limitPerMetric = 40) {
  const byName: Record<string, Vital[]> = {};
  for (let i = vitals.length - 1; i >= 0; i--) {
    const v = vitals[i];
    const arr = byName[v.name] || (byName[v.name] = []);
    if (arr.length < limitPerMetric) arr.push(v); // reverse chronological push
  }
  // reverse each to chronological order
  for (const k of Object.keys(byName)) byName[k].reverse();
  return byName;
}
