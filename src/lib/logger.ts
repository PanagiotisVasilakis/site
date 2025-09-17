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
  
  // For objects, do lightweight validation and truncation to prevent memory issues
  if (typeof meta === 'object') {
    try {
      // Quick size check to prevent serializing huge objects
      const stringified = JSON.stringify(meta);
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


