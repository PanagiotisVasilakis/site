import fs from 'node:fs';
import path from 'node:path';
import { logger } from '@/lib/logger';
import type { AnalyticsHit, Vital } from './analyticsStore';

export interface AnalyticsPersistenceData {
  hits: AnalyticsHit[];
  vitals: Vital[];
  firstSeen: Record<string, number>;
}

export interface AnalyticsStorageAdapter {
  load(): AnalyticsPersistenceData;
  save(data: AnalyticsPersistenceData): void;
}

class NoopAdapter implements AnalyticsStorageAdapter {
  load(): AnalyticsPersistenceData { return { hits: [], vitals: [], firstSeen: {} }; }
  save(): void {/* noop */}
}

class FileAdapter implements AnalyticsStorageAdapter {
  private hitsFile = path.join(process.cwd(), 'analytics-log.json');
  private vitalsFile = path.join(process.cwd(), 'vitals-log.json');
  private firstSeenFile = path.join(process.cwd(), 'firstseen-log.json');
  load(): AnalyticsPersistenceData {
    const out: AnalyticsPersistenceData = { hits: [], vitals: [], firstSeen: {} };
    try {
      if (fs.existsSync(this.hitsFile)) {
        const data = JSON.parse(fs.readFileSync(this.hitsFile, 'utf-8'));
        if (Array.isArray(data)) out.hits = data;
      }
    } catch (err) { logger.error('FileAdapter load hits failed', err); }
    try {
      if (fs.existsSync(this.vitalsFile)) {
        const data = JSON.parse(fs.readFileSync(this.vitalsFile, 'utf-8'));
        if (Array.isArray(data)) out.vitals = data;
      }
    } catch (err) { logger.error('FileAdapter load vitals failed', err); }
    try {
      if (fs.existsSync(this.firstSeenFile)) {
        const data = JSON.parse(fs.readFileSync(this.firstSeenFile, 'utf-8'));
        if (data && typeof data === 'object') out.firstSeen = data;
      }
    } catch (err) { logger.error('FileAdapter load firstSeen failed', err); }
    return out;
  }
  save(data: AnalyticsPersistenceData) {
    try { fs.writeFileSync(this.hitsFile, JSON.stringify(data.hits.slice(-5000))); } catch (err) { logger.error('FileAdapter save hits failed', err); }
    try { fs.writeFileSync(this.vitalsFile, JSON.stringify(data.vitals.slice(-5000))); } catch (err) { logger.error('FileAdapter save vitals failed', err); }
    try { fs.writeFileSync(this.firstSeenFile, JSON.stringify(data.firstSeen)); } catch (err) { logger.error('FileAdapter save firstSeen failed', err); }
  }
}

interface KeyValueNamespace {
  get(key: string): string | null | undefined;
  put(key: string, value: string): void;
}

class KvAdapter implements AnalyticsStorageAdapter {
  private namespace: KeyValueNamespace | undefined;
  private key = 'analytics:data:v1';
  constructor() {
    // Expect a global binding (e.g., edge runtime) named ANALYTICS_KV or fallback to noop
    const globalWithKV = globalThis as typeof globalThis & { ANALYTICS_KV?: KeyValueNamespace };
    this.namespace = globalWithKV.ANALYTICS_KV;
  }
  load(): AnalyticsPersistenceData {
    if (!this.namespace?.get) return { hits: [], vitals: [], firstSeen: {} };
    try {
      const raw = this.namespace.get(this.key);
      if (!raw) return { hits: [], vitals: [], firstSeen: {} };
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') {
        return {
          hits: Array.isArray(parsed.hits) ? parsed.hits : [],
          vitals: Array.isArray(parsed.vitals) ? parsed.vitals : [],
          firstSeen: parsed.firstSeen && typeof parsed.firstSeen === 'object' ? parsed.firstSeen : {}
        };
      }
    } catch (err) { logger.error('KvAdapter load failed', err); }
    return { hits: [], vitals: [], firstSeen: {} };
  }
  save(data: AnalyticsPersistenceData) {
    if (!this.namespace?.put) return;
    try {
      this.namespace.put(this.key, JSON.stringify({
        hits: data.hits.slice(-5000),
        vitals: data.vitals.slice(-5000),
        firstSeen: data.firstSeen
      }));
    } catch (err) { logger.error('KvAdapter save failed', err); }
  }
}

export function createStorageAdapter(): AnalyticsStorageAdapter {
  const mode = process.env.ANALYTICS_STORAGE || 'file';
  if (process.env.VERCEL) return new NoopAdapter();
  if (mode === 'none') return new NoopAdapter();
  if (mode === 'kv') return new KvAdapter();
  // Future: implement 'kv' | 'cloud' adapters here
  return new FileAdapter();
}
