// Custom error classes for better error handling
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly isOperational: boolean = true,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'VALIDATION_ERROR', 400, true, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(
    message: string = 'Authentication failed',
    details?: Record<string, unknown>
  ) {
    super(message, 'AUTHENTICATION_ERROR', 401, true, details);
  }
}

export class AuthorizationError extends AppError {
  constructor(
    message: string = 'Access denied',
    details?: Record<string, unknown>
  ) {
    super(message, 'AUTHORIZATION_ERROR', 403, true, details);
  }
}

export class NotFoundError extends AppError {
  constructor(
    message: string = 'Resource not found',
    details?: Record<string, unknown>
  ) {
    super(message, 'NOT_FOUND_ERROR', 404, true, details);
  }
}

export class RateLimitError extends AppError {
  constructor(
    message: string = 'Rate limit exceeded',
    details?: Record<string, unknown>
  ) {
    super(message, 'RATE_LIMIT_ERROR', 429, true, details);
  }
}

export class DatabaseError extends AppError {
  constructor(
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'DATABASE_ERROR', 500, false, details);
  }
}

export class ExternalServiceError extends AppError {
  constructor(
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'EXTERNAL_SERVICE_ERROR', 502, false, details);
  }
}

// Structured logging with context
import { logger } from '@/lib/logger-enterprise';

export interface LogContext {
  userId?: string;
  bookingId?: string;
  requestId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  [key: string]: unknown;
}

class StructuredLogger {
  private context: LogContext = {};

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    logger.debug(message, { ...this.context, ...meta });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    logger.info(message, { ...this.context, ...meta });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    logger.warn(message, { ...this.context, ...meta });
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    const errorMeta = error ? {
      error: {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
        ...(error instanceof AppError ? {
          code: error.code,
          statusCode: error.statusCode,
          isOperational: error.isOperational,
          details: error.details
        } : {})
      }
    } : {};

    logger.error(message, { ...this.context, ...errorMeta, ...meta });
  }
}

// Export singleton instance
export const structuredLogger = new StructuredLogger();

// Error handling utilities
export function handleError(error: unknown, context?: LogContext): AppError {
  if (error instanceof AppError) {
    // Already an AppError, just log it with context
    structuredLogger.error('Application error occurred', error, context);
    return error;
  }

  if (error instanceof Error) {
    // Regular Error, wrap it
    const appError = new AppError(
      error.message,
      'INTERNAL_ERROR',
      500,
      false,
      { originalError: error.name }
    );
    structuredLogger.error('Unexpected error occurred', error, context);
    return appError;
  }

  // Unknown error type
  const appError = new AppError(
    'An unexpected error occurred',
    'UNKNOWN_ERROR',
    500,
    false,
    { originalError: String(error) }
  );
  structuredLogger.error('Unknown error occurred', new Error(String(error)), context);
  return appError;
}

export function withErrorHandling<T>(fn: () => T, context?: LogContext): T {
  try {
    return fn();
  } catch (error) {
    throw handleError(error, context);
  }
}

export async function withAsyncErrorHandling<T>(fn: () => Promise<T>, context?: LogContext): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw handleError(error, context);
  }
}

// HTTP error response helpers
export function createErrorResponse(error: AppError): { error: { code: string; message: string; details?: Record<string, unknown> } } {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    }
  };
}

// Context provider for request-scoped logging
export class RequestContextProvider {
  private static instance: RequestContextProvider;
  private requestId: string | null = null;

  private constructor() {}

  static getInstance(): RequestContextProvider {
    if (!RequestContextProvider.instance) {
      RequestContextProvider.instance = new RequestContextProvider();
    }
    return RequestContextProvider.instance;
  }

  setRequestId(id: string): void {
    this.requestId = id;
    structuredLogger.setContext({ requestId: id });
  }

  getRequestId(): string | null {
    return this.requestId;
  }

  clear(): void {
    this.requestId = null;
    structuredLogger.clearContext();
  }
}