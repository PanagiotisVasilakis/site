// Simple, centralized logger with environment-aware behavior.
// Server: always log. Client: errors/warnings always; debug/info only in dev.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function nowIso(): string {
  try { return new Date().toISOString(); } catch { return ''; }
}

function shouldLog(level: LogLevel): boolean {
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (level === 'error' || level === 'warn') return true;
  return nodeEnv !== 'production';
}

function formatMessage(level: LogLevel, message: string) {
  return `[${nowIso()}] [${level.toUpperCase()}] ${message}`;
}

function safeSerialize(meta: unknown): unknown {
  if (!meta) return undefined;
  
  // Avoid expensive serialization for simple types
  if (typeof meta === 'string' || typeof meta === 'number' || typeof meta === 'boolean') {
    return meta;
  }
  
  // Fast-path for Error instances
  function toErrorJSON(err: unknown) {
    if (!err || typeof err !== 'object') return err;
    const anyErr = err as { name?: string; message?: string; stack?: string; code?: string | number; cause?: unknown };
    const includeStack = process.env.NODE_ENV !== 'production';
    return {
      name: anyErr.name || 'Error',
      message: String(anyErr.message || ''),
      ...(includeStack && anyErr.stack ? { stack: String(anyErr.stack) } : {}),
      ...(anyErr.code ? { code: anyErr.code } : {}),
      ...(anyErr.cause ? { cause: typeof anyErr.cause === 'object' ? { name: (anyErr.cause as { name?: string })?.name, message: (anyErr.cause as { message?: string })?.message } : String(anyErr.cause) } : {}),
    } as const;
  }

  // Handle root-level Error early to avoid empty object from JSON.stringify
  if (meta instanceof Error) {
    return toErrorJSON(meta);
  }

  // For objects, do lightweight validation and truncation to prevent memory issues
  if (typeof meta === 'object') {
    try {
      // JSON-stringify with a replacer that:
      // - Converts Error instances to plain objects
      // - Handles circular references
      const seen = new WeakSet<object>();
      const replacer = (_key: string, value: unknown) => {
        // Normalize Error instances anywhere in the structure
        if (value instanceof Error) {
          return toErrorJSON(value);
        }
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value as object)) return '[Circular]';
          seen.add(value as object);
        }
        return value as unknown;
      };
      // Quick size check to prevent serializing huge objects
  const stringified = JSON.stringify(meta, replacer);
      if (stringified.length > 1000) {
        // Truncate large objects to prevent memory/performance issues
        return `[Object too large: ${stringified.length} chars]`;
      }
      return JSON.parse(stringified); // Only do round-trip for validated small objects
    } catch { 
      return '[Unserializable object]'; 
    }
  }
  
  return String(meta);
}

export const logger = {
  debug(message: string, meta?: unknown) {
    if (!shouldLog('debug')) return;
    const data = safeSerialize(meta);
    if (isBrowser()) {
      console.debug(formatMessage('debug', message), data);
    } else {
      console.debug(formatMessage('debug', message), data);
    }
  },
  info(message: string, meta?: unknown) {
    if (!shouldLog('info')) return;
    const data = safeSerialize(meta);
    if (isBrowser()) {
      console.info(formatMessage('info', message), data);
    } else {
      console.info(formatMessage('info', message), data);
    }
  },
  warn(message: string, meta?: unknown) {
    const data = safeSerialize(meta);
    if (isBrowser()) {
      console.warn(formatMessage('warn', message), data);
    } else {
      console.warn(formatMessage('warn', message), data);
    }
  },
  error(message: string, meta?: unknown) {
    const data = safeSerialize(meta);
    if (isBrowser()) {
      console.error(formatMessage('error', message), data);
    } else {
      // In production, don't log stack traces to prevent information disclosure
      const sanitizedData = process.env.NODE_ENV === 'production' && data && typeof data === 'object' 
        ? { ...data, stack: undefined } 
        : data;
      console.error(formatMessage('error', message), sanitizedData);
    }
  }
};

export type Logger = typeof logger;


