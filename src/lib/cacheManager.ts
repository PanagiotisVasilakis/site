import { getDatabase } from './database';
import { logger } from '@/lib/logger';

interface CacheEntry {
  key: string;
  value: string; // JSON serialized
  expires_at: number;
}

export class CacheManager {
  private db: Awaited<ReturnType<typeof getDatabase>> | null = null;
  
  async initialize(): Promise<void> {
    try {
      this.db = await getDatabase();
      
      // Create cache table if it doesn't exist
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS cache (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);
      
      // Create index for better performance
      await this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at)
      `);
      
      logger.info('Cache manager initialized');
    } catch (error) {
      logger.error('Failed to initialize cache manager', error);
      throw error;
    }
  }
  
  async get<T>(key: string): Promise<T | null> {
    if (!this.db) {
      await this.initialize();
    }
    
    try {
      const now = Date.now();
      const entry = await this.db!.get(
        'SELECT * FROM cache WHERE key = ? AND expires_at > ?',
        key,
        now
      ) as CacheEntry | undefined;
      
      if (!entry) {
        return null;
      }
      
      return JSON.parse(entry.value) as T;
    } catch (error) {
      logger.error('Cache get failed', { error, key });
      return null;
    }
  }
  
  async set<T>(key: string, value: T, ttlMs: number = 300000): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
    
    try {
      const serializedValue = JSON.stringify(value);
      const expiresAt = Date.now() + ttlMs;
      
      await this.db!.run(
        'INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)',
        key,
        serializedValue,
        expiresAt
      );
      
      logger.debug('Cache set', { key, ttlMs });
    } catch (error) {
      logger.error('Cache set failed', { error, key });
    }
  }
  
  async del(key: string): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
    
    try {
      await this.db!.run(
        'DELETE FROM cache WHERE key = ?',
        key
      );
      
      logger.debug('Cache delete', { key });
    } catch (error) {
      logger.error('Cache delete failed', { error, key });
    }
  }
  
  async cleanupExpiredEntries(): Promise<number> {
    if (!this.db) {
      await this.initialize();
    }
    
    try {
      const now = Date.now();
      const result = await this.db!.run(
        'DELETE FROM cache WHERE expires_at < ?',
        now
      );
      
  const removed = result.changes ?? 0;
      if (removed > 0) {
        logger.info('Expired cache entries cleaned up', { count: removed });
      }
      
      return removed;
    } catch (error) {
      logger.error('Cache cleanup failed', { error });
      return 0;
    }
  }
  
  async clearAll(): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
    
    try {
      await this.db!.run('DELETE FROM cache');
      logger.info('All cache entries cleared');
    } catch (error) {
      logger.error('Cache clear all failed', { error });
    }
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();