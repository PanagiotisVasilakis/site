import { getDatabase } from './database';
import { logger } from '@/lib/logger';

interface MetricEntry {
  id: string;
  metric_name: string;
  value: number;
  tags: string; // JSON serialized
  recorded_at: number;
}

interface LogEntry {
  id: string;
  level: string;
  message: string;
  meta: string; // JSON serialized
  timestamp: number;
}

export class Monitor {
  private db: Awaited<ReturnType<typeof getDatabase>> | null = null;
  
  async initialize(): Promise<void> {
    try {
      this.db = await getDatabase();
      
      // Create metrics table if it doesn't exist
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS metrics (
          id TEXT PRIMARY KEY,
          metric_name TEXT NOT NULL,
          value REAL NOT NULL,
          tags TEXT NOT NULL, -- JSON serialized
          recorded_at INTEGER NOT NULL
        )
      `);
      
      // Create logs table if it doesn't exist
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS logs (
          id TEXT PRIMARY KEY,
          level TEXT NOT NULL,
          message TEXT NOT NULL,
          meta TEXT NOT NULL, -- JSON serialized
          timestamp INTEGER NOT NULL
        )
      `);
      
      // Create indexes for better performance
      await this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
        CREATE INDEX IF NOT EXISTS idx_metrics_recorded_at ON metrics(recorded_at);
        CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
      `);
      
      logger.info('Monitor initialized');
    } catch (error) {
  logger.error('Failed to initialize monitor', { error });
      throw error;
    }
  }
  
  async recordMetric(name: string, value: number, tags: Record<string, string> = {}): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
    
    try {
      const id = this.generateId('metric');
      const serializedTags = JSON.stringify(tags);
      const recordedAt = Date.now();
      
      await this.db!.run(
        'INSERT INTO metrics (id, metric_name, value, tags, recorded_at) VALUES (?, ?, ?, ?, ?)',
        id,
        name,
        value,
        serializedTags,
        recordedAt
      );
      
      logger.debug('Metric recorded', { name, value, tags });
    } catch (error) {
      logger.error('Metric recording failed', { error, name, value, tags });
    }
  }
  
  async log(level: string, message: string, meta: Record<string, unknown> = {}): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
    
    try {
      const id = this.generateId('log');
      const serializedMeta = JSON.stringify(meta);
      const timestamp = Date.now();
      
      await this.db!.run(
        'INSERT INTO logs (id, level, message, meta, timestamp) VALUES (?, ?, ?, ?, ?)',
        id,
        level,
        message,
        serializedMeta,
        timestamp
      );
      
      logger[level.toLowerCase() as keyof typeof logger]?.(message, meta);
    } catch (error) {
      // Fall back to regular logger if database logging fails
      logger.error('Database logging failed', { error, level, message, meta });
      logger[level.toLowerCase() as keyof typeof logger]?.(message, meta);
    }
  }
  
  async getMetrics(
    name: string, 
    since: number = Date.now() - 24 * 60 * 60 * 1000, 
    until: number = Date.now()
  ): Promise<MetricEntry[]> {
    if (!this.db) {
      await this.initialize();
    }
    
    try {
      const rows = await this.db!.all(
        'SELECT * FROM metrics WHERE metric_name = ? AND recorded_at BETWEEN ? AND ? ORDER BY recorded_at DESC LIMIT 1000',
        name,
        since,
        until
      ) as MetricEntry[];
      
      return rows;
    } catch (error) {
      logger.error('Getting metrics failed', { error, name, since, until });
      return [];
    }
  }
  
  async getLogs(
    level?: string,
    since: number = Date.now() - 24 * 60 * 60 * 1000,
    until: number = Date.now(),
    limit: number = 100
  ): Promise<LogEntry[]> {
    if (!this.db) {
      await this.initialize();
    }
    
    try {
      let query = 'SELECT * FROM logs WHERE timestamp BETWEEN ? AND ?';
  const params: Array<string | number> = [since, until];
      
      if (level) {
        query += ' AND level = ?';
        params.push(level);
      }
      
      query += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);
      
  const rows = await this.db!.all(query, ...params) as LogEntry[];
      
  return rows;
    } catch (error) {
      logger.error('Getting logs failed', { error, level, since, until, limit });
      return [];
    }
  }
  
  async cleanupOldEntries(maxAgeDays: number = 30): Promise<{ metricsRemoved: number; logsRemoved: number }> {
    if (!this.db) {
      await this.initialize();
    }
    
    try {
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      
  const metricResult = await this.db!.run(
        'DELETE FROM metrics WHERE recorded_at < ?',
        cutoff
      );
      
  const logResult = await this.db!.run(
        'DELETE FROM logs WHERE timestamp < ?',
        cutoff
      );
      
  const metricsRemoved = metricResult.changes ?? 0;
  const logsRemoved = logResult.changes ?? 0;
      
      if (metricsRemoved > 0 || logsRemoved > 0) {
        logger.info('Old monitoring entries cleaned up', { 
          metricsRemoved, 
          logsRemoved, 
          maxAgeDays 
        });
      }
      
      return { metricsRemoved, logsRemoved };
    } catch (error) {
      logger.error('Monitoring cleanup failed', { error });
      return { metricsRemoved: 0, logsRemoved: 0 };
    }
  }
  
  private generateId(prefix: string = 'id'): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// Export singleton instance
export const monitor = new Monitor();

// Convenience functions for common metrics
export async function recordResponseTime(method: string, path: string, durationMs: number): Promise<void> {
  await monitor.recordMetric('http_response_time', durationMs, { method, path });
}

export async function recordError(errorType: string, errorMessage: string): Promise<void> {
  await monitor.recordMetric('error_count', 1, { type: errorType, message: errorMessage });
}

export async function recordUserAction(action: string, userId?: string): Promise<void> {
  await monitor.recordMetric('user_action', 1, { action, userId: userId || 'anonymous' });
}