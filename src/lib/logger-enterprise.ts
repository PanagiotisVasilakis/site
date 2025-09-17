/**
 * Enterprise-grade structured logging system
 * Features: Correlation IDs, Performance monitoring, Error context, Sanitization
 */

// Edge Runtime compatible async context storage
// Use simple fallback implementation to avoid Node.js specific APIs
const asyncLocalStorage = {
  getStore: (): LogContext | null => null,
  run: <T>(context: Partial<LogContext>, callback: () => T): T => callback(),
  enterWith: (context: Partial<LogContext>) => {
    // No-op in Edge Runtime fallback
    void context;
  },
};

export interface LogContext {
  correlationId: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  userAgent?: string;
  ip?: string;
  route?: string;
  traceId?: string;
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string | number;
    cause?: unknown;
  };
  performance?: {
    duration?: number;
    memory?: {
      used: number;
      total: number;
    };
    cpu?: number;
  };
  source?: {
    file?: string;
    function?: string;
    line?: number;
  };
}

interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableStructured: boolean;
  enablePerformanceMetrics: boolean;
  maxMetadataSize: number;
  sensitiveFields: string[];
  redactionPlaceholder: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
} as const;

class EnterpriseLogger {
  private config: LoggerConfig;
  private startTime: number = Date.now();

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      enableConsole: process.env.LOG_CONSOLE !== 'false',
      enableStructured: process.env.LOG_STRUCTURED === 'true',
      enablePerformanceMetrics: process.env.LOG_PERFORMANCE === 'true',
      maxMetadataSize: parseInt(process.env.LOG_MAX_METADATA_SIZE || '1000', 10),
      sensitiveFields: ['password', 'token', 'secret', 'key', 'authorization', 'cookie', 'session'],
      redactionPlaceholder: '[REDACTED]',
      ...config,
    };
  }

  /**
   * Set correlation context for the current async execution
   */
  setContext(context: Partial<LogContext>): void {
    const existing = asyncLocalStorage.getStore() || { correlationId: this.generateCorrelationId() };
    asyncLocalStorage.enterWith({ ...existing, ...context });
  }

  /**
   * Run function with logging context
   */
  withContext<T>(context: Partial<LogContext>, fn: () => T): T {
    const fullContext = { 
      correlationId: this.generateCorrelationId(), 
      ...context 
    };
    return asyncLocalStorage.run(fullContext, fn);
  }

  /**
   * Generate unique correlation ID
   */
  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current logging context
   */
  getContext(): LogContext | undefined {
    return asyncLocalStorage.getStore() || undefined;
  }

  /**
   * Check if log level should be emitted
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  /**
   * Sanitize and redact sensitive information
   */
  private sanitizeMetadata(metadata: unknown): Record<string, unknown> {
    if (!metadata || typeof metadata !== 'object') {
      return {};
    }

    const sanitized = { ...metadata as Record<string, unknown> };
    
    // Redact sensitive fields
    const redactRecursively = (obj: Record<string, unknown>): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        const isSensitive = this.config.sensitiveFields.some(field => 
          lowerKey.includes(field.toLowerCase())
        );
        
        if (isSensitive) {
          result[key] = this.config.redactionPlaceholder;
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = redactRecursively(value as Record<string, unknown>);
        } else {
          result[key] = value;
        }
      }
      
      return result;
    };

    const redacted = redactRecursively(sanitized);
    
    // Truncate if too large
    const serialized = JSON.stringify(redacted);
    if (serialized.length > this.config.maxMetadataSize) {
      return {
        ...redacted,
        _truncated: true,
        _originalSize: serialized.length,
      };
    }

    return redacted;
  }

  /**
   * Get performance metrics
   */
  private getPerformanceMetrics(): LogEntry['performance'] | undefined {
    if (!this.config.enablePerformanceMetrics) return undefined;

    try {
      // Check if we're in Node.js environment with memory monitoring
      if (typeof process !== 'undefined' && process.env?.NODE_ENV !== undefined && 
          typeof globalThis.process?.memoryUsage === 'function') {
        const memUsage = globalThis.process.memoryUsage();
        return {
          memory: {
            used: memUsage.heapUsed,
            total: memUsage.heapTotal,
          },
          duration: Date.now() - this.startTime,
        };
      } else {
        // Fallback for Edge Runtime
        return {
          memory: {
            used: 0,
            total: 0,
          },
          duration: Date.now() - this.startTime,
        };
      }
    } catch {
      return undefined;
    }
  }

  /**
   * Get source information from stack trace
   */
  private getSourceInfo(): LogEntry['source'] | undefined {
    try {
      const stack = new Error().stack;
      if (!stack) return undefined;

      const lines = stack.split('\n');
      // Skip logger internal calls to find actual caller
      const callerLine = lines.find(line => 
        line.includes('.tsx') || line.includes('.ts') && 
        !line.includes('logger.ts') && 
        !line.includes('node_modules')
      );

      if (!callerLine) return undefined;

      const match = callerLine.match(/at\s+(.+)\s+\((.+):(\d+):\d+\)/);
      if (match) {
        return {
          function: match[1],
          file: match[2],
          line: parseInt(match[3], 10),
        };
      }
    } catch {
      // Ignore source info errors
    }
    return undefined;
  }

  /**
   * Format error for logging
   */
  private formatError(error: unknown): LogEntry['error'] | undefined {
    if (!error) return undefined;

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
        code: (error as unknown as { code?: string | number }).code,
        cause: (error as unknown as { cause?: unknown }).cause,
      };
    }

    if (typeof error === 'string') {
      return {
        name: 'StringError',
        message: error,
      };
    }

    return {
      name: 'UnknownError',
      message: String(error),
    };
  }

  /**
   * Create structured log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    error?: unknown
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.getContext(),
      metadata: metadata ? this.sanitizeMetadata(metadata) : undefined,
      error: this.formatError(error),
      performance: this.getPerformanceMetrics(),
      source: this.getSourceInfo(),
    };
  }

  /**
   * Output log entry
   */
  private output(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    if (this.config.enableConsole) {
      const consoleMethod = entry.level === 'fatal' ? 'error' : entry.level;
      const method = console[consoleMethod] || console.log;

      if (this.config.enableStructured) {
        method(JSON.stringify(entry, null, 2));
      } else {
        const parts = [
          `[${entry.timestamp}]`,
          `[${entry.level.toUpperCase()}]`,
          entry.context?.correlationId ? `[${entry.context.correlationId}]` : '',
          entry.message,
        ].filter(Boolean);

        const args: unknown[] = [parts.join(' ')];
        if (entry.metadata && Object.keys(entry.metadata).length > 0) {
          args.push(entry.metadata);
        }
        if (entry.error) {
          args.push(entry.error);
        }
        method.apply(console, args as []);
      }
    }

    // Here you could add integrations with external logging services:
    // - Datadog, New Relic, Sentry, etc.
    // - Custom log aggregation endpoints
    // - File-based logging for server environments
  }

  // Public logging methods
  trace(message: string, metadata?: Record<string, unknown>): void {
    this.output(this.createLogEntry('trace', message, metadata));
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.output(this.createLogEntry('debug', message, metadata));
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.output(this.createLogEntry('info', message, metadata));
  }

  warn(message: string, metadata?: Record<string, unknown>, error?: unknown): void {
    this.output(this.createLogEntry('warn', message, metadata, error));
  }

  error(message: string, metadata?: Record<string, unknown>, error?: unknown): void {
    this.output(this.createLogEntry('error', message, metadata, error));
  }

  fatal(message: string, metadata?: Record<string, unknown>, error?: unknown): void {
    this.output(this.createLogEntry('fatal', message, metadata, error));
  }

  /**
   * Performance timing helper
   */
  time<T>(label: string, fn: () => T): T;
  time<T>(label: string, fn: () => Promise<T>): Promise<T>;
  time<T>(label: string, fn: () => T | Promise<T>): T | Promise<T> {
    const start = performance.now();
    
    const logTiming = (duration: number) => {
      this.info(`Performance: ${label}`, { 
        performance: { duration: Math.round(duration * 100) / 100 },
        operation: label,
      });
    };

    try {
      const result = fn();
      
      if (result instanceof Promise) {
        return result
          .then(value => {
            logTiming(performance.now() - start);
            return value;
          })
          .catch(error => {
            logTiming(performance.now() - start);
            this.error(`Performance: ${label} (failed)`, { 
              performance: { duration: Math.round((performance.now() - start) * 100) / 100 },
              operation: label,
            }, error);
            throw error;
          });
      } else {
        logTiming(performance.now() - start);
        return result;
      }
    } catch (error) {
      logTiming(performance.now() - start);
      this.error(`Performance: ${label} (failed)`, { 
        performance: { duration: Math.round((performance.now() - start) * 100) / 100 },
        operation: label,
      }, error);
      throw error;
    }
  }

  /**
   * Create child logger with additional context
   */
  child(context: Partial<LogContext>): EnterpriseLogger {
    const childLogger = new EnterpriseLogger(this.config);
    const currentContext = this.getContext() || { correlationId: this.generateCorrelationId() };
    childLogger.setContext({ ...currentContext, ...context });
    return childLogger;
  }
}

// Export singleton instance
export const logger = new EnterpriseLogger();

// Export class for custom instances
export { EnterpriseLogger };

// Utility types
export type Logger = typeof logger;