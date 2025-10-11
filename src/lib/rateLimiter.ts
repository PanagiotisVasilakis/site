import { getDatabase } from './database';
import { logger } from '@/lib/logger';

interface RateLimitEntry {
  key: string;
  count: number;
  reset_time: number;
}

export class RateLimiter {
  private db: Awaited<ReturnType<typeof getDatabase>> | null = null;
  
  async initialize(): Promise<void> {
    try {
      this.db = await getDatabase();
      
      // Create rate limits table if it doesn't exist
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          count INTEGER NOT NULL,
          reset_time INTEGER NOT NULL
        )
      `);
      
      // Create index for better performance
      await this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_time ON rate_limits(reset_time)
      `);
      
      logger.info('Rate limiter initialized');
    } catch (error) {
      logger.error('Failed to initialize rate limiter', error);
      throw error;
    }
  }
  
  async isRateLimited(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    if (!this.db) {
      await this.initialize();
    }
    
    const now = Date.now();
    const resetTime = now + windowMs;
    
    try {
      // Get existing entry
      const entry = await this.db!.get(
        'SELECT * FROM rate_limits WHERE key = ?',
        key
      ) as RateLimitEntry | undefined;
      
      if (!entry) {
        // Create new entry
        await this.db!.run(
          'INSERT INTO rate_limits (key, count, reset_time) VALUES (?, ?, ?)',
          key,
          1,
          resetTime
        );
        
        return {
          allowed: true,
          remaining: limit - 1,
          resetTime
        };
      }
      
      // Check if window has expired
      if (entry.reset_time <= now) {
        // Reset counter
        await this.db!.run(
          'UPDATE rate_limits SET count = 1, reset_time = ? WHERE key = ?',
          resetTime,
          key
        );
        
        return {
          allowed: true,
          remaining: limit - 1,
          resetTime
        };
      }
      
      // Check if limit exceeded
      if (entry.count >= limit) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: entry.reset_time
        };
      }
      
      // Increment counter
      await this.db!.run(
        'UPDATE rate_limits SET count = count + 1 WHERE key = ?',
        key
      );
      
      return {
        allowed: true,
        remaining: limit - entry.count - 1,
        resetTime: entry.reset_time
      };
    } catch (error) {
      logger.error('Rate limiter check failed', { error, key });
      // Fail open - allow request if rate limiter fails
      return {
        allowed: true,
        remaining: limit,
        resetTime
      };
    }
  }
  
  async resetRateLimit(key: string): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
    
    try {
      await this.db!.run(
        'DELETE FROM rate_limits WHERE key = ?',
        key
      );
      
      logger.info('Rate limit reset', { key });
    } catch (error) {
      logger.error('Rate limiter reset failed', { error, key });
    }
  }
  
  async cleanupExpiredEntries(): Promise<number> {
    if (!this.db) {
      await this.initialize();
    }
    
    try {
      const now = Date.now();
      const result = await this.db!.run(
        'DELETE FROM rate_limits WHERE reset_time < ?',
        now
      );
      
  const removed = result.changes ?? 0;
      if (removed > 0) {
        logger.info('Expired rate limit entries cleaned up', { count: removed });
      }
      
      return removed;
    } catch (error) {
      logger.error('Rate limiter cleanup failed', { error });
      return 0;
    }
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();