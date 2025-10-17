/**
 * Browser-safe logger for client components
 * Does NOT use Node.js APIs like async_hooks
 * 
 * Use this in:
 * - Client components ("use client")
 * - Browser-only code
 * 
 * Use logger-enterprise.ts in:
 * - Server components
 * - API routes
 * - Middleware
 * - Server-side utilities
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMetadata {
  [key: string]: unknown;
}

class ClientLogger {
  private isDev = process.env.NODE_ENV === 'development';

  private log(level: LogLevel, message: string, meta?: LogMetadata | Error) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    // Format metadata
    let metaStr = '';
    if (meta) {
      if (meta instanceof Error) {
        metaStr = `\n  Error: ${meta.message}\n  Stack: ${meta.stack}`;
      } else {
        metaStr = Object.keys(meta).length > 0 
          ? `\n  ${JSON.stringify(meta, null, 2)}`
          : '';
      }
    }

    const fullMessage = `${prefix} ${message}${metaStr}`;

    // Console output based on level
    switch (level) {
      case 'debug':
        if (this.isDev) console.debug(fullMessage);
        break;
      case 'info':
        console.info(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      case 'error':
        console.error(fullMessage);
        break;
    }
  }

  debug(message: string, meta?: LogMetadata) {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: LogMetadata) {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: LogMetadata | Error) {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: LogMetadata | Error) {
    this.log('error', message, meta);
  }
}

export const logger = new ClientLogger();
