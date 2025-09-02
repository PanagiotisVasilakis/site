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
  try { return JSON.parse(JSON.stringify(meta)); } catch { return String(meta); }
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
      console.error(formatMessage('error', message), data);
    }
  }
};

export type Logger = typeof logger;


