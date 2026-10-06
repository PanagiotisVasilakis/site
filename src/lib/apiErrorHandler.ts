/**
 * Enterprise-grade API error handling middleware
 * Features: Structured error responses, correlation tracking, validation
 */

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger-enterprise';
import { z } from 'zod';
import type { ApiErrorCode } from './apiErrorTypes';
import { ApiErrorCode as ErrorCodes } from './apiErrorTypes';
import {
  createClientIdentityUnavailableResponse,
  isClientIdentityUnavailableError,
} from './net/clientIdentity';
import { getClientIp } from './net/getClientIp';
import { logSecurityDiagnostic } from './security-monitoring';

// Public error-code enum for route handlers
export { ErrorCodes as ApiErrorCode };

// Standard HTTP status codes
const HttpStatusCodes = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

// Error code to HTTP status mapping
const ERROR_STATUS_MAP: Record<ApiErrorCode, number> = {
  [ErrorCodes.BAD_REQUEST]: HttpStatusCodes.BAD_REQUEST,
  [ErrorCodes.UNAUTHORIZED]: HttpStatusCodes.UNAUTHORIZED,
  [ErrorCodes.FORBIDDEN]: HttpStatusCodes.FORBIDDEN,
  [ErrorCodes.NOT_FOUND]: HttpStatusCodes.NOT_FOUND,
  [ErrorCodes.CONFLICT]: HttpStatusCodes.CONFLICT,
  [ErrorCodes.VALIDATION_ERROR]: HttpStatusCodes.UNPROCESSABLE_ENTITY,
  [ErrorCodes.RATE_LIMITED]: HttpStatusCodes.TOO_MANY_REQUESTS,
  [ErrorCodes.PAYLOAD_TOO_LARGE]: HttpStatusCodes.PAYLOAD_TOO_LARGE,
  [ErrorCodes.UNSUPPORTED_MEDIA_TYPE]: HttpStatusCodes.UNSUPPORTED_MEDIA_TYPE,
  [ErrorCodes.INTERNAL_ERROR]: HttpStatusCodes.INTERNAL_SERVER_ERROR,
  [ErrorCodes.SERVICE_UNAVAILABLE]: HttpStatusCodes.SERVICE_UNAVAILABLE,
  [ErrorCodes.GATEWAY_TIMEOUT]: HttpStatusCodes.GATEWAY_TIMEOUT,
  [ErrorCodes.EXTERNAL_SERVICE_ERROR]: HttpStatusCodes.BAD_GATEWAY,
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
      ErrorCodes.VALIDATION_ERROR,
      'Validation failed',
      details,
      correlationId
    );
  }
}

// Request timeout error
class TimeoutError extends ApiError {
  constructor(timeoutMs: number, correlationId?: string) {
    super(
      ErrorCodes.GATEWAY_TIMEOUT,
      `Request timeout after ${timeoutMs}ms`,
      { timeoutMs },
      correlationId
    );
  }
}

// Standard API response types
interface ApiResponse<T = unknown> {
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
  };
}

interface ApiRouteHandlerContext {
  params: Promise<Record<string, string>>;
  /**
   * Aborted when the client disconnects or the configured request deadline is
   * reached. Long-running handlers must pass this signal to cancellable I/O and
   * call throwIfAborted() before starting irreversible work. Once an irreversible
   * mutation has started, return its actual outcome rather than converting an
   * already-committed operation into a timeout.
   */
  signal: AbortSignal;
}

// API route handler type compatible with Next.js route handlers. The wrapper
// enriches Next's context with a cooperative cancellation signal.
export type ApiRouteHandler = (
  request: NextRequest,
  context: ApiRouteHandlerContext,
) => Promise<NextResponse> | NextResponse;

type NextRouteContext = Omit<ApiRouteHandlerContext, 'signal'>;
type WrappedApiRouteHandler = (
  request: NextRequest,
  context: NextRouteContext,
) => Promise<NextResponse>;

// Error handling middleware configuration
export interface ErrorHandlerConfig {
  maxRequestBodySize?: number;
  requestTimeoutMs?: number;
}

const DEFAULT_CONFIG: Required<ErrorHandlerConfig> = {
  maxRequestBodySize: 1024 * 1024, // 1MB
  requestTimeoutMs: 30000, // 30 seconds
};

/**
 * Error handling middleware wrapper
 */
export function withErrorHandler(
  handler: ApiRouteHandler,
  config: ErrorHandlerConfig = {}
): WrappedApiRouteHandler {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  if (!Number.isSafeInteger(mergedConfig.requestTimeoutMs) || mergedConfig.requestTimeoutMs <= 0) {
    throw new RangeError('requestTimeoutMs must be a positive integer');
  }

  return async (request: NextRequest, context: NextRouteContext) => {
    const startTime = performance.now();
    const correlationId = generateCorrelationId();
    const method = request.method;
    const url = request.nextUrl.pathname;

    // Set logging context
    logger.setContext({
      correlationId,
      route: url,
    });

    try {
      // Request size validation
      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > mergedConfig.maxRequestBodySize) {
        throw new ApiError(
          ErrorCodes.PAYLOAD_TOO_LARGE,
          `Request body too large. Maximum size: ${mergedConfig.maxRequestBodySize} bytes`,
          { contentLength: parseInt(contentLength), maxSize: mergedConfig.maxRequestBodySize },
          correlationId
        );
      }

      // Request deadline. Safe/read-only methods may return a 504 immediately.
      // Mutation methods abort cooperatively but await handler settlement, so a
      // client is never told that a still-running mutation timed out and then
      // tempted to retry while its first write can still commit.
      const deadlineController = new AbortController();
      const canReturnBeforeSettlement = ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
      const forwardClientAbort = () => {
        if (!deadlineController.signal.aborted) {
          deadlineController.abort(request.signal.reason);
        }
      };
      if (request.signal.aborted) {
        forwardClientAbort();
      } else {
        request.signal.addEventListener('abort', forwardClientAbort, { once: true });
      }

      let rejectTimeout: ((reason: TimeoutError) => void) | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        rejectTimeout = reject;
      });
      const timeoutHandle = setTimeout(() => {
        const timeoutError = new TimeoutError(mergedConfig.requestTimeoutMs, correlationId);
        if (!deadlineController.signal.aborted) {
          deadlineController.abort(timeoutError);
        }
        if (canReturnBeforeSettlement) {
          rejectTimeout?.(timeoutError);
        }
      }, mergedConfig.requestTimeoutMs);

      // Pass the deadline signal through the Request as well as the explicit
      // context. This makes body readers and any handler code that forwards
      // request.signal cooperative without every route needing bespoke wiring.
      const deadlineRequest = new NextRequest(request, {
        signal: deadlineController.signal,
      });
      const handlerPromise = Promise.resolve()
        .then(() => handler(deadlineRequest, { ...context, signal: deadlineController.signal }))
        .catch((error: unknown) => {
          const abortReason = deadlineController.signal.reason;
          const isAbortError = error instanceof DOMException && error.name === 'AbortError';
          if (abortReason instanceof TimeoutError && (error === abortReason || isAbortError)) {
            throw abortReason;
          }
          throw error;
        });
      let response: NextResponse;
      try {
        response = canReturnBeforeSettlement
          ? await Promise.race([handlerPromise, timeoutPromise])
          : await handlerPromise;
      } finally {
        clearTimeout(timeoutHandle);
        request.signal.removeEventListener('abort', forwardClientAbort);
      }

      // Performance logging
      const duration = performance.now() - startTime;
      logger.info('API request completed', {
        method,
        url,
        status: response.status,
        duration: Math.round(duration * 100) / 100,
      });

      return response;

    } catch (error) {
      const duration = performance.now() - startTime;
      const identityUnavailable = isClientIdentityUnavailableError(error);

      if (identityUnavailable) {
        // The helper logs the bounded reason at warn level.
        return createClientIdentityUnavailableResponse(error);
      }
      
      // Handle known API errors
      if (error instanceof ApiError) {
        if (error.code === ErrorCodes.UNSUPPORTED_MEDIA_TYPE || error.code === ErrorCodes.PAYLOAD_TOO_LARGE) {
          // Request-shape violations are logged, never persisted (O11).
          logSecurityDiagnostic({
            type: 'api_security_violation',
            severity: 'medium',
            timestamp: new Date().toISOString(),
            ip: getClientIp(request),
            url,
            details: {
              violationType: error.code === ErrorCodes.UNSUPPORTED_MEDIA_TYPE ? 'invalid_content_type' : 'payload_too_large',
              method,
            },
          });
        }
        // A handled 4xx is a client outcome, not an application warning. The
        // status/code remain observable through counters and response logs.
        logger.debug('API client error', {
          method,
          url,
          status: error.statusCode,
          code: error.code,
          duration: Math.round(duration * 100) / 100,
        });

        const headers: Record<string, string> = {
          'X-Correlation-ID': correlationId,
          'X-Error-Code': error.code,
        };

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
        
        logger.debug('Validation error occurred', {
          method,
          url,
          duration: Math.round(duration * 100) / 100,
        });

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
        ErrorCodes.INTERNAL_ERROR,
        'An internal server error occurred',
        undefined,
        correlationId
      );

      logger.error('Unexpected API error', {
        method,
        url,
        duration: Math.round(duration * 100) / 100,
      }, error instanceof Error ? error : new Error(String(error)));

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
export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_CONFIG.maxRequestBodySize,
  allowedMediaTypes: readonly string[] = ['application/json'],
): Promise<unknown> {
  const mediaType = (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (!allowedMediaTypes.includes(mediaType)) {
    throw new ApiError(ErrorCodes.UNSUPPORTED_MEDIA_TYPE, 'Unsupported media type');
  }
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new ApiError(ErrorCodes.BAD_REQUEST, 'Invalid content length');
    }
    if (parsedLength > maxBytes) {
      throw new ApiError(ErrorCodes.PAYLOAD_TOO_LARGE, `Request body too large. Maximum size: ${maxBytes} bytes`);
    }
  }

  if (!request.body) throw new ApiError(ErrorCodes.BAD_REQUEST, 'Invalid JSON in request body');
  const reader = request.body.getReader();
  const signal = request.signal;
  const chunks: Uint8Array[] = [];
  let total = 0;
  const cancelOnAbort = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  try {
    signal.throwIfAborted();
    signal.addEventListener('abort', cancelOnAbort, { once: true });
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ApiError(ErrorCodes.PAYLOAD_TOO_LARGE, `Request body too large. Maximum size: ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', cancelOnAbort);
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
  } catch {
    throw new ApiError(ErrorCodes.BAD_REQUEST, 'Invalid JSON in request body');
  }
}

export function validateRequestBody<T>(schema: z.ZodSchema<T>, maxBytes = DEFAULT_CONFIG.maxRequestBodySize) {
  return async (request: NextRequest): Promise<T> => {
    const correlationId = logger.getContext()?.correlationId;
    
    try {
      const body = await readJsonBody(request, maxBytes);
      return schema.parse(body);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues, correlationId);
      }
      
      throw new ApiError(
        ErrorCodes.BAD_REQUEST,
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
  return crypto.randomUUID();
}
