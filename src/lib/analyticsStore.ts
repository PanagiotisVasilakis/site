import crypto from 'node:crypto';
import { createStorageAdapter } from './storageAdapter';
import { logger } from '@/lib/logger';

export interface AnalyticsHit { path: string; ts: number; ua: string | null; locale?: string }

const hits: AnalyticsHit[] = [];
const firstSeen: Record<string, number> = {};
export type Vital = { name: string; value: number; id: string; ts: number };
const vitals: Vital[] = [];
let loaded = false;
let loading = false; // Prevent concurrent loading
let lastBackup = 0; // Track last backup time

const persistEnabled = process.env.ANALYTICS_PERSIST === '1' && !process.env.VERCEL; // opt-in persistence
const retentionDays = Math.max(1, parseInt(process.env.ANALYTICS_RETENTION_DAYS || '30', 10));
const storage = createStorageAdapter();
const hashPaths = process.env.ANALYTICS_HASH_PATHS === '1';
const backupIntervalMs = 24 * 60 * 60 * 1000; // 24 hours

function maybeHash(p: string) {
  if (!hashPaths) return p;
  return crypto.createHash('sha256').update(p).digest('hex').slice(0, 32); // shorten
}

export function loadHits() {
  if (loaded) return;
  if (loading) {
    // Wait for concurrent load to complete
    let attempts = 0;
    while (loading && attempts < 50) { // Max 500ms wait
      attempts++;
      // Use sync sleep to avoid async complications in this context
      const start = Date.now();
      while (Date.now() - start < 10) { /* busy wait 10ms */ }
    }
    return;
  }
  
  loading = true;
  
  try {
    if (!persistEnabled) return; // skip loading if not persisting
    
    const data = storage.load();
    
    // Validate loaded data structure
    if (data && typeof data === 'object') {
      if (Array.isArray(data.hits)) {
        // Additional validation for hit structure
        const validHits = data.hits.filter(h => 
          h && typeof h === 'object' && 
          typeof h.path === 'string' && 
          typeof h.ts === 'number' && 
          h.ts > 0 && 
          h.ts <= Date.now() + 86400000 // Not more than 1 day in future
        );
        hits.push(...validHits);
        
        if (validHits.length !== data.hits.length) {
          logger.warn(`Filtered invalid hits: ${data.hits.length - validHits.length} removed`);
        }
      }
      
      if (data.firstSeen && typeof data.firstSeen === 'object') {
        // Validate firstSeen entries
        for (const [path, timestamp] of Object.entries(data.firstSeen)) {
          if (typeof timestamp === 'number' && timestamp > 0 && timestamp <= Date.now()) {
            firstSeen[path] = timestamp;
          }
        }
      }
      
      if (Array.isArray(data.vitals)) {
        const validVitals = data.vitals.filter(v =>
          v && typeof v === 'object' &&
          typeof v.name === 'string' && v.name.length < 100 &&
          typeof v.value === 'number' && !isNaN(v.value) &&
          typeof v.id === 'string' && v.id.length < 100 &&
          typeof v.ts === 'number' && v.ts > 0 && v.ts <= Date.now() + 86400000
        );
        vitals.push(...validVitals.slice(-5000));
        
        if (validVitals.length !== data.vitals.length) {
          logger.warn(`Filtered invalid vitals: ${data.vitals.length - validVitals.length} removed`);
        }
      }
    }
    
    loaded = true;
    
  } catch (err) { 
    logger.error('loadHits failed', err);
    loaded = true; // Mark as loaded even on error to prevent infinite retries
  } finally {
    loading = false;
  }
}

function persist() {
  if (!persistEnabled) return;
  
  try {
    storage.save({ hits, vitals, firstSeen });
    
    // Trigger backup if enough time has passed
    const now = Date.now();
    if (storage.backup && (now - lastBackup) > backupIntervalMs) {
      storage.backup();
      lastBackup = now;
    }
    
  } catch (err) {
    logger.error('Analytics persistence failed', err);
  }
}

export function addHits(newHits: Array<Omit<AnalyticsHit, 'ua'>> , ua: string | null) {
  loadHits();
  
  let validHitsAdded = 0;
  
  for (const h of newHits) {
    if (!h.path || typeof h.path !== 'string') {
      logger.warn('Invalid hit path skipped', h);
      continue;
    }
    
    // Additional validation for hit data
    const timestamp = h.ts && typeof h.ts === 'number' ? h.ts : Date.now();
    const locale = h.locale && typeof h.locale === 'string' ? h.locale : undefined;
    
    // Validate timestamp is reasonable (not too far in past/future)
    const now = Date.now();
    if (timestamp < now - 86400000 * 30 || timestamp > now + 86400000) {
      logger.warn('Hit with invalid timestamp skipped', { path: h.path, ts: timestamp });
      continue;
    }
    
    const norm = maybeHash(h.path);
    hits.push({ path: norm, ts: timestamp, ua: hashPaths ? null : ua, locale });
    
    if (firstSeen[norm] == null) {
      firstSeen[norm] = timestamp; // Use hit timestamp, not current time
    }
    
    validHitsAdded++;
  }
  
  if (validHitsAdded === 0) {
    logger.warn('No valid hits were added from batch', newHits);
    return 0;
  }
  
  // Drop hits older than retentionDays for rolling retention (O(log n) performance)
  const cutoff = Date.now() - retentionDays * 86400_000;
  const firstValidIndex = hits.findIndex(h => h.ts >= cutoff);
  if (firstValidIndex > 0) {
    const removedCount = firstValidIndex;
    hits.splice(0, firstValidIndex);
    if (removedCount > 0) {
      logger.info(`Removed ${removedCount} expired hits older than ${retentionDays} days`);
    }
  }
  
  // Clean up vitals array to prevent unbounded growth
  if (vitals.length > 5000) {
    const removedCount = vitals.length - 5000;
    vitals.splice(0, vitals.length - 5000);
    if (removedCount > 0) {
      logger.info(`Removed ${removedCount} old vitals to maintain size limit`);
    }
  }
  
  // Clean up stale firstSeen entries to prevent memory leaks
  cleanupFirstSeen(cutoff);
  
  persist();
  return validHitsAdded;
}

// Helper function to clean up stale firstSeen entries
function cleanupFirstSeen(cutoff: number) {
  // Remove firstSeen entries for paths that haven't been hit recently
  const activePathsSet = new Set(hits.map(h => h.path));
  
  for (const [path, firstSeenTime] of Object.entries(firstSeen)) {
    // Remove if the path hasn't been seen recently AND it's not in current hits
    if (firstSeenTime < cutoff && !activePathsSet.has(path)) {
      delete firstSeen[path];
    }
  }
  
  // Limit firstSeen object size as a safety measure
  const entries = Object.entries(firstSeen);
  if (entries.length > 10000) {
    // Keep only the most recent 8000 entries
    entries.sort((a, b) => b[1] - a[1]);
    const toKeep = entries.slice(0, 8000);
    
    // Clear and repopulate
    for (const key of Object.keys(firstSeen)) {
      delete firstSeen[key];
    }
    for (const [path, time] of toKeep) {
      firstSeen[path] = time;
    }
  }
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
  // Validate vital data before adding
  if (!v || typeof v !== 'object') {
    logger.warn('Invalid vital object skipped', v);
    return;
  }
  
  if (typeof v.name !== 'string' || v.name.length === 0 || v.name.length > 100) {
    logger.warn('Invalid vital name skipped', v);
    return;
  }
  
  if (typeof v.value !== 'number' || isNaN(v.value) || !isFinite(v.value)) {
    logger.warn('Invalid vital value skipped', v);
    return;
  }
  
  if (typeof v.id !== 'string' || v.id.length === 0 || v.id.length > 100) {
    logger.warn('Invalid vital id skipped', v);
    return;
  }
  
  if (typeof v.ts !== 'number' || v.ts <= 0) {
    logger.warn('Invalid vital timestamp skipped', v);
    return;
  }
  
  // Validate timestamp is reasonable
  const now = Date.now();
  if (v.ts < now - 86400000 * 30 || v.ts > now + 86400000) {
    logger.warn('Vital with invalid timestamp skipped', v);
    return;
  }
  
  vitals.push(v);
  
  if (vitals.length > 5000) {
    const removedCount = vitals.length - 5000;
    vitals.splice(0, vitals.length - 5000);
    logger.info(`Removed ${removedCount} old vitals to maintain size limit`);
  }
  
  // Drop vitals older than retentionDays (O(log n) performance)
  const cutoff = Date.now() - retentionDays * 86400_000;
  const firstValidIndex = vitals.findIndex(v => v.ts >= cutoff);
  if (firstValidIndex > 0) {
    const removedCount = firstValidIndex;
    vitals.splice(0, firstValidIndex);
    if (removedCount > 0) {
      logger.info(`Removed ${removedCount} expired vitals older than ${retentionDays} days`);
    }
  }
  
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
