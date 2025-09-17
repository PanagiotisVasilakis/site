/**
 * Enterprise-grade API error handling middleware
 * Features: Structured error responses, correlation tracking, rate limiting, validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger-enterprise';
import { z } from 'zod';

// Standard API error codes
export enum ApiErrorCode {
  // Client errors (4xx)
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
  CONFLICT = 'CONFLICT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  
  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
}

// Standard HTTP status codes
const HttpStatusCodes = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

// Error code to HTTP status mapping
const ERROR_STATUS_MAP: Record<ApiErrorCode, number> = {
  [ApiErrorCode.BAD_REQUEST]: HttpStatusCodes.BAD_REQUEST,
  [ApiErrorCode.UNAUTHORIZED]: HttpStatusCodes.UNAUTHORIZED,
  [ApiErrorCode.FORBIDDEN]: HttpStatusCodes.FORBIDDEN,
  [ApiErrorCode.NOT_FOUND]: HttpStatusCodes.NOT_FOUND,
  [ApiErrorCode.METHOD_NOT_ALLOWED]: HttpStatusCodes.METHOD_NOT_ALLOWED,
  [ApiErrorCode.CONFLICT]: HttpStatusCodes.CONFLICT,
  [ApiErrorCode.VALIDATION_ERROR]: HttpStatusCodes.UNPROCESSABLE_ENTITY,
  [ApiErrorCode.RATE_LIMITED]: HttpStatusCodes.TOO_MANY_REQUESTS,
  [ApiErrorCode.PAYLOAD_TOO_LARGE]: HttpStatusCodes.PAYLOAD_TOO_LARGE,
  [ApiErrorCode.INTERNAL_ERROR]: HttpStatusCodes.INTERNAL_SERVER_ERROR,
  [ApiErrorCode.NOT_IMPLEMENTED]: HttpStatusCodes.NOT_IMPLEMENTED,
  [ApiErrorCode.SERVICE_UNAVAILABLE]: HttpStatusCodes.SERVICE_UNAVAILABLE,
  [ApiErrorCode.GATEWAY_TIMEOUT]: HttpStatusCodes.GATEWAY_TIMEOUT,
  [ApiErrorCode.DATABASE_ERROR]: HttpStatusCodes.INTERNAL_SERVER_ERROR,
  [ApiErrorCode.EXTERNAL_SERVICE_ERROR]: HttpStatusCodes.BAD_GATEWAY,
};

// Structured API error class
export class ApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly correlationId?: string;

  constructor(
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>,
    correlationId?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = ERROR_STATUS_MAP[code];
    this.details = details;
    this.correlationId = correlationId;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        correlationId: this.correlationId,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// Validation error for Zod schema failures
export class ValidationError extends ApiError {
  constructor(
    issues: z.ZodIssue[],
    correlationId?: string
  ) {
    const details = {
      validationErrors: issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
  expected: (issue as unknown as { expected?: unknown }).expected,
      })),
    };

    super(
      ApiErrorCode.VALIDATION_ERROR,
      'Validation failed',
      details,
      correlationId
    );
  }
}

// Rate limiting error
export class RateLimitError extends ApiError {
  constructor(
    limit: number,
    windowMs: number,
    retryAfter: number,
    correlationId?: string
  ) {
    const details = {
      limit,
      windowMs,
      retryAfter,
    };

    super(
      ApiErrorCode.RATE_LIMITED,
      `Rate limit exceeded. Limit: ${limit} requests per ${windowMs}ms`,
      details,
      correlationId
    );
  }
}

// Request timeout error
export class TimeoutError extends ApiError {
  constructor(timeoutMs: number, correlationId?: string) {
    super(
      ApiErrorCode.GATEWAY_TIMEOUT,
      `Request timeout after ${timeoutMs}ms`,
      { timeoutMs },
      correlationId
    );
  }
}

// Standard API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    correlationId?: string;
    timestamp: string;
  };
  meta?: {
    correlationId: string;
    timestamp: string;
    version: string;
    processingTime: number;
  };
}

// API route handler type compatible with Next.js 15
export type ApiRouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => Promise<NextResponse> | NextResponse;

// Error handling middleware configuration
export interface ErrorHandlerConfig {
  enableErrorLogging?: boolean;
  enablePerformanceLogging?: boolean;
  enableRequestLogging?: boolean;
  maxRequestBodySize?: number;
  requestTimeoutMs?: number;
  rateLimitConfig?: {
    windowMs: number;
    maxRequests: number;
  };
}

const DEFAULT_CONFIG: Required<ErrorHandlerConfig> = {
  enableErrorLogging: true,
  enablePerformanceLogging: true,
  enableRequestLogging: false,
  maxRequestBodySize: 1024 * 1024, // 1MB
  requestTimeoutMs: 30000, // 30 seconds
  rateLimitConfig: {
    windowMs: 60000, // 1 minute
    maxRequests: 100,
  },
};

/**
 * Error handling middleware wrapper
 */
export function withErrorHandler(
  handler: ApiRouteHandler,
  config: ErrorHandlerConfig = {}
): ApiRouteHandler {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return async (request: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    const startTime = performance.now();
    const correlationId = generateCorrelationId();
    const method = request.method;
    const url = request.url;

    // Set logging context
    logger.setContext({
      correlationId,
      requestId: correlationId,
      route: new URL(url).pathname,
      userAgent: request.headers.get('user-agent') || undefined,
      ip: getClientIP(request),
    });

    try {
      // Request logging
      if (mergedConfig.enableRequestLogging) {
        logger.info('API request started', {
          method,
          url,
          headers: sanitizeHeaders(request.headers),
        });
      }

      // Request size validation
      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > mergedConfig.maxRequestBodySize) {
        throw new ApiError(
          ApiErrorCode.PAYLOAD_TOO_LARGE,
          `Request body too large. Maximum size: ${mergedConfig.maxRequestBodySize} bytes`,
          { contentLength: parseInt(contentLength), maxSize: mergedConfig.maxRequestBodySize },
          correlationId
        );
      }

      // Request timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new TimeoutError(mergedConfig.requestTimeoutMs, correlationId));
        }, mergedConfig.requestTimeoutMs);
      });

      // Execute handler with timeout
      const handlerPromise = handler(request, context);
      const response = await Promise.race([handlerPromise, timeoutPromise]);

      // Performance logging
      if (mergedConfig.enablePerformanceLogging) {
        const duration = performance.now() - startTime;
        logger.info('API request completed', {
          method,
          url,
          status: response.status,
          duration: Math.round(duration * 100) / 100,
        });
      }

      return response;

    } catch (error) {
      const duration = performance.now() - startTime;
      
      // Handle known API errors
  if (error instanceof ApiError) {
        if (mergedConfig.enableErrorLogging) {
          logger.warn('API error occurred', {
            method,
            url,
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
            duration: Math.round(duration * 100) / 100,
          });
        }

        const headers: Record<string, string> = {
          'X-Correlation-ID': correlationId,
          'X-Error-Code': error.code,
        };
        // Provide Retry-After for rate limit errors when available
        if (error instanceof RateLimitError && typeof error.details?.retryAfter === 'number') {
          headers['Retry-After'] = String(error.details.retryAfter);
        }

        return NextResponse.json(
          error.toJSON(),
          { 
            status: error.statusCode,
            headers,
          }
        );
      }

      // Handle Zod validation errors
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError(error.issues, correlationId);
        
        if (mergedConfig.enableErrorLogging) {
          logger.warn('Validation error occurred', {
            method,
            url,
            validationErrors: validationError.details,
            duration: Math.round(duration * 100) / 100,
          });
        }

        return NextResponse.json(
          validationError.toJSON(),
          { 
            status: validationError.statusCode,
            headers: {
              'X-Correlation-ID': correlationId,
              'X-Error-Code': validationError.code,
            },
          }
        );
      }

      // Handle unexpected errors
      const internalError = new ApiError(
        ApiErrorCode.INTERNAL_ERROR,
        process.env.NODE_ENV === 'production' 
          ? 'An internal server error occurred'
          : error instanceof Error ? error.message : String(error),
        process.env.NODE_ENV !== 'production' ? {
          originalError: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        } : undefined,
        correlationId
      );

      if (mergedConfig.enableErrorLogging) {
        logger.error('Unexpected API error', {
          method,
          url,
          duration: Math.round(duration * 100) / 100,
        }, error instanceof Error ? error : new Error(String(error)));
      }

      return NextResponse.json(
        internalError.toJSON(),
        { 
          status: internalError.statusCode,
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Error-Code': internalError.code,
          },
        }
      );
    }
  };
}

/**
 * Success response helper
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = HttpStatusCodes.OK,
  correlationId?: string
): NextResponse {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      correlationId: correlationId || generateCorrelationId(),
      timestamp: new Date().toISOString(),
      version: '1.0',
      processingTime: 0, // Would be calculated by middleware
    },
  };

  return NextResponse.json(response, { 
    status,
    headers: {
      'X-Correlation-ID': response.meta?.correlationId || '',
    },
  });
}

/**
 * Validation middleware for request bodies
 */
export function validateRequestBody<T>(schema: z.ZodSchema<T>) {
  return async (request: NextRequest): Promise<T> => {
    const correlationId = logger.getContext()?.correlationId;
    
    try {
      const body = await request.json();
      return schema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues, correlationId);
      }
      
      throw new ApiError(
        ApiErrorCode.BAD_REQUEST,
        'Invalid JSON in request body',
        undefined,
        correlationId
      );
    }
  };
}

/**
 * Helper functions
 */
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfIP = request.headers.get('cf-connecting-ip');
  
  return forwarded?.split(',')[0]?.trim() || realIP || cfIP || 'unknown';
}

function sanitizeHeaders(headers: Headers): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
  
  headers.forEach((value, key) => {
    if (sensitiveHeaders.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  });
  
  return sanitized;
}

// Export utility functions for route handlers
export {
  HttpStatusCodes as HttpStatus,
  createSuccessResponse as success,
  ApiError as error,
  ValidationError as validationError,
  RateLimitError as rateLimitError,
  TimeoutError as timeoutError,
};