/**
 * Enterprise-grade structured logging system
 * Features: Correlation IDs, Error context, Sanitization
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

import { isSensitiveFieldName } from '@/lib/redaction';

// AsyncLocalStorage for proper context propagation across async operations
// Note: This requires Node.js runtime (not Edge). For Edge routes, use fallback.
const asyncLocalStorage = new AsyncLocalStorage<Partial<LogContext>>();

interface LogContext {
  correlationId: string;
  route?: string;
}

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
// Levels this logger emits; 'trace' remains a valid configured threshold.
type EmittedLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: EmittedLevel;
  message: string;
  context?: Partial<LogContext>;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string | number;
    cause?: unknown;
  };
}

interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableStructured: boolean;
  maxMetadataSize: number;
}

const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'key',
  'authorization',
  'cookie',
  'session',
  'attestation',
  'forwarded',
  'connecting-ip',
  'real-ip',
  'verified-client-ip',
];

const REDACTION_PLACEHOLDER = '[REDACTED]';

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
} as const;

class EnterpriseLogger {
  private config: LoggerConfig;

  constructor() {
    const configuredLevel = process.env.LOG_LEVEL;
    this.config = {
      // An unknown LOG_LEVEL is ignored: the workers do not run the environment schema, and a
      // threshold outside LOG_LEVELS would silence every line, errors included.
      level: configuredLevel !== undefined && Object.hasOwn(LOG_LEVELS, configuredLevel)
        ? configuredLevel as LogLevel
        : (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      enableConsole: process.env.LOG_CONSOLE !== 'false',
      enableStructured: process.env.LOG_STRUCTURED === 'true',
      maxMetadataSize: parseInt(process.env.LOG_MAX_METADATA_SIZE || '1000', 10),
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
   * Generate unique correlation ID
   */
  private generateCorrelationId(): string {
    return crypto.randomUUID();
  }

  /**
   * Get current logging context
   */
  getContext(): Partial<LogContext> | undefined {
    return asyncLocalStorage.getStore();
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

    const seen = new WeakSet<object>();
    const redactRecursively = (value: unknown, key = ''): unknown => {
      const lowerKey = key.toLowerCase();
      // Union of the shared classifier and this list: a key that was redacted before stays redacted.
      const isSensitive = isSensitiveFieldName(key)
        || SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()));
      if (isSensitive) return REDACTION_PLACEHOLDER;
      if (value instanceof Error) return { name: value.name, message: value.message };
      if (!value || typeof value !== 'object') return value;
      if (seen.has(value)) return '[CIRCULAR]';
      seen.add(value);
      if (Array.isArray(value)) return value.map((item) => redactRecursively(item));

      const result: Record<string, unknown> = {};
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        result[childKey] = redactRecursively(childValue, childKey);
      }
      return result;
    };

    const redacted = redactRecursively(metadata) as Record<string, unknown>;
    
    // Truncate if too large
    const serialized = JSON.stringify(redacted);
    if (serialized.length > this.config.maxMetadataSize) {
      const previewBudget = Math.max(0, this.config.maxMetadataSize - 120);
      return {
        _truncated: true,
        _originalSize: serialized.length,
        _preview: serialized.slice(0, previewBudget),
      };
    }

    return redacted;
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
    level: EmittedLevel,
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
    };
  }

  /**
   * Output log entry
   */
  private output(entry: LogEntry): void {
    if (this.config.enableConsole) {
      const method = console[entry.level] || console.log;

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
  }

  // Public logging methods (the level check runs before any entry is built)
  debug(message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) return;
    this.output(this.createLogEntry('debug', message, metadata));
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return;
    this.output(this.createLogEntry('info', message, metadata));
  }

  // Supported forms: (message), (message, error) and (message, metadata, error?)
  warn(message: string): void;
  warn(message: string, error: unknown): void;
  warn(message: string, metadata: Record<string, unknown>, error?: unknown): void;
  warn(message: string, metadataOrError?: Record<string, unknown> | unknown, error?: unknown): void {
    if (!this.shouldLog('warn')) return;
    // No second argument - simple message only
    if (metadataOrError === undefined) {
      this.output(this.createLogEntry('warn', message));
      return;
    }
    // If second arg looks like an Error/unknown and third arg is undefined, it's the old signature
    if (error === undefined && metadataOrError !== undefined && 
        (metadataOrError instanceof Error || typeof metadataOrError !== 'object' || metadataOrError === null || Array.isArray(metadataOrError))) {
      this.output(this.createLogEntry('warn', message, undefined, metadataOrError));
    } else {
      this.output(this.createLogEntry('warn', message, metadataOrError as Record<string, unknown>, error));
    }
  }

  // Supported forms: (message), (message, error) and (message, metadata, error?)
  error(message: string): void;
  error(message: string, error: unknown): void;
  error(message: string, metadata: Record<string, unknown>, error?: unknown): void;
  error(message: string, metadataOrError?: Record<string, unknown> | unknown, error?: unknown): void {
    if (!this.shouldLog('error')) return;
    // No second argument - simple message only
    if (metadataOrError === undefined) {
      this.output(this.createLogEntry('error', message));
      return;
    }
    // If second arg looks like an Error/unknown and third arg is undefined, it's the old signature
    if (error === undefined && metadataOrError !== undefined && 
        (metadataOrError instanceof Error || typeof metadataOrError !== 'object' || metadataOrError === null || Array.isArray(metadataOrError))) {
      this.output(this.createLogEntry('error', message, undefined, metadataOrError));
    } else {
      this.output(this.createLogEntry('error', message, metadataOrError as Record<string, unknown>, error));
    }
  }

}

// Export singleton instance
export const logger = new EnterpriseLogger();
