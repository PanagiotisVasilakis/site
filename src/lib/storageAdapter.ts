import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger } from '@/lib/logger';
import type { AnalyticsHit, Vital } from './analyticsStore';

export interface AnalyticsPersistenceData {
  hits: AnalyticsHit[];
  vitals: Vital[];
  firstSeen: Record<string, number>;
  _version?: string;
  _checksum?: string;
  _saved?: number;
}

export interface AnalyticsStorageAdapter {
  load(): AnalyticsPersistenceData;
  save(data: AnalyticsPersistenceData): void;
  backup?(): void;
  restore?(backupName: string): AnalyticsPersistenceData | null;
  listBackups?(): string[];
}

class NoopAdapter implements AnalyticsStorageAdapter {
  load(): AnalyticsPersistenceData { return { hits: [], vitals: [], firstSeen: {} }; }
  save(): void {/* noop */}
  backup(): void {/* noop */}
  restore(): null { return null; }
  listBackups(): string[] { return []; }
}

// Data validation schemas
function validateAnalyticsData(data: unknown): AnalyticsPersistenceData {
  const defaultData: AnalyticsPersistenceData = { hits: [], vitals: [], firstSeen: {} };
  
  if (!data || typeof data !== 'object') return defaultData;
  const d = data as Record<string, unknown>;
  
  return {
    hits: Array.isArray(d.hits) ? (d.hits as unknown[]).filter((h): h is AnalyticsHit => {
      const hv = h as Record<string, unknown>;
      return !!h && typeof h === 'object' && 
        typeof hv.path === 'string' && 
        typeof hv.ts === 'number' && 
        hv.ts > 0;
    }) : [],
    vitals: Array.isArray(d.vitals) ? (d.vitals as unknown[]).filter((v): v is Vital => {
      const vv = v as Record<string, unknown>;
      return !!v && typeof v === 'object' &&
        typeof vv.name === 'string' &&
        typeof vv.value === 'number' &&
        typeof vv.id === 'string' &&
        typeof vv.ts === 'number' &&
        vv.ts > 0;
    }) : [],
    firstSeen: d.firstSeen && typeof d.firstSeen === 'object' ? 
      Object.fromEntries(
        Object.entries(d.firstSeen as Record<string, unknown>).filter(([k, v]) => 
          typeof k === 'string' && typeof v === 'number' && (v as number) > 0
        )
      ) as Record<string, number> : {},
    _version: typeof d._version === 'string' ? d._version : undefined,
    _checksum: typeof d._checksum === 'string' ? d._checksum : undefined,
    _saved: typeof d._saved === 'number' ? d._saved : undefined
  };
}

function calculateChecksum(data: AnalyticsPersistenceData): string {
  const payload = {
    hits: data.hits,
    vitals: data.vitals,
    firstSeen: data.firstSeen
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function verifyChecksum(data: AnalyticsPersistenceData): boolean {
  if (!data._checksum) return true; // Allow data without checksum for backward compatibility
  const calculated = calculateChecksum(data);
  return calculated === data._checksum;
}

class FileAdapter implements AnalyticsStorageAdapter {
  private dataFile = path.join(process.cwd(), 'analytics-data.json');
  private tempFile = path.join(process.cwd(), 'analytics-data.json.tmp');
  private backupDir = path.join(process.cwd(), 'analytics-backups');
  private maxBackups = 5; // Keep last 5 backups

  constructor() {
    // Ensure backup directory exists
    try {
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }
    } catch (err) {
      logger.warn('Failed to create backup directory', err);
    }
  }

  load(): AnalyticsPersistenceData {
    const defaultData: AnalyticsPersistenceData = { hits: [], vitals: [], firstSeen: {} };
    
    try {
      if (fs.existsSync(this.dataFile)) {
        const raw = fs.readFileSync(this.dataFile, 'utf-8');
        const parsed = JSON.parse(raw);
        const validated = validateAnalyticsData(parsed);
        
        // Verify data integrity
        if (!verifyChecksum(validated)) {
          logger.error('Data corruption detected: checksum mismatch');
          return this.attemptRecovery();
        }
        
        return validated;
      }
    } catch (err) { 
      logger.error('FileAdapter load failed', err);
      return this.attemptRecovery();
    }
    return defaultData;
  }

  private attemptRecovery(): AnalyticsPersistenceData {
    const defaultData: AnalyticsPersistenceData = { hits: [], vitals: [], firstSeen: {} };
    
    // Try to recover from temp file
    try {
      if (fs.existsSync(this.tempFile)) {
        const backupData = JSON.parse(fs.readFileSync(this.tempFile, 'utf-8'));
        const validated = validateAnalyticsData(backupData);
        logger.warn('Recovered analytics data from temp file');
        return validated;
      }
    } catch (tempErr) {
      logger.error('Temp file recovery failed', tempErr);
    }
    
    // Try to recover from latest backup
    try {
      const backups = this.listBackups();
      if (backups.length > 0) {
        const latest = backups[0]; // Sorted by date desc
        const recovered = this.restore(latest);
        if (recovered) {
          logger.warn(`Recovered analytics data from backup: ${latest}`);
          return recovered;
        }
      }
    } catch (backupErr) {
      logger.error('Backup recovery failed', backupErr);
    }
    
    return defaultData;
  }

  save(data: AnalyticsPersistenceData) {
    try {
      // Validate input data
      const validatedData = validateAnalyticsData(data);
      
      // Add metadata for integrity checking
      const payload = {
        ...validatedData,
        hits: validatedData.hits.slice(-5000), // Limit size but warn about truncation
        vitals: validatedData.vitals.slice(-5000),
        _version: '1.0',
        _saved: Date.now()
      };
      
      // Add checksum for integrity verification
      payload._checksum = calculateChecksum(payload);
      
      // Log data truncation if it occurred
      if (data.hits.length > 5000) {
        logger.warn(`Analytics hits truncated from ${data.hits.length} to 5000 entries`);
      }
      if (data.vitals.length > 5000) {
        logger.warn(`Analytics vitals truncated from ${data.vitals.length} to 5000 entries`);
      }
      
      // Write to temporary file first
      fs.writeFileSync(this.tempFile, JSON.stringify(payload));
      
      // Atomic rename operation - this is atomic on most filesystems
      fs.renameSync(this.tempFile, this.dataFile);
      
    } catch (err) { 
      logger.error('FileAdapter atomic save failed', err);
      // Clean up temp file if it exists
      try {
        if (fs.existsSync(this.tempFile)) {
          fs.unlinkSync(this.tempFile);
        }
      } catch (cleanupErr) {
        logger.error('Temp file cleanup failed', cleanupErr);
      }
    }
  }

  backup(): void {
    try {
      if (!fs.existsSync(this.dataFile)) return;
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `analytics-backup-${timestamp}.json`;
      const backupPath = path.join(this.backupDir, backupName);
      
      fs.copyFileSync(this.dataFile, backupPath);
      logger.info(`Created backup: ${backupName}`);
      
      // Clean up old backups
      this.cleanupOldBackups();
      
    } catch (err) {
      logger.error('Backup creation failed', err);
    }
  }

  private cleanupOldBackups(): void {
    try {
      const backups = this.listBackups();
      if (backups.length > this.maxBackups) {
        const toDelete = backups.slice(this.maxBackups);
        for (const backup of toDelete) {
          const backupPath = path.join(this.backupDir, backup);
          fs.unlinkSync(backupPath);
          logger.info(`Deleted old backup: ${backup}`);
        }
      }
    } catch (err) {
      logger.error('Backup cleanup failed', err);
    }
  }

  restore(backupName: string): AnalyticsPersistenceData | null {
    try {
      const backupPath = path.join(this.backupDir, backupName);
      if (!fs.existsSync(backupPath)) return null;
      
      const raw = fs.readFileSync(backupPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return validateAnalyticsData(parsed);
      
    } catch (err) {
      logger.error(`Restore from backup ${backupName} failed`, err);
      return null;
    }
  }

  listBackups(): string[] {
    try {
      if (!fs.existsSync(this.backupDir)) return [];
      
      return fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('analytics-backup-') && file.endsWith('.json'))
        .sort()
        .reverse(); // Most recent first
        
    } catch (err) {
      logger.error('Failed to list backups', err);
      return [];
    }
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
