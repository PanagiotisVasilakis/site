/**
 * Error reporting API endpoint
 * Receives client-side error reports and processes them securely
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, validateRequestBody, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';

// Client error report schema
const ErrorReportSchema = z.object({
  error: z.object({
    name: z.string().max(100),
    message: z.string().max(500),
    stack: z.string().max(5000).optional(),
    fileName: z.string().max(200).optional(),
    lineNumber: z.number().optional(),
    columnNumber: z.number().optional(),
  }),
  context: z.object({
    url: z.string().url().max(500),
    userAgent: z.string().max(500),
    timestamp: z.string().datetime(),
    userId: z.string().max(50).optional(),
    sessionId: z.string().max(100).optional(),
    buildVersion: z.string().max(50).optional(),
    environment: z.enum(['development', 'staging', 'production']).optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
  breadcrumbs: z.array(z.object({
    timestamp: z.string().datetime(),
    category: z.string().max(50),
    message: z.string().max(200),
    level: z.enum(['debug', 'info', 'warn', 'error']),
    data: z.record(z.string(), z.unknown()).optional(),
  })).max(20).optional(),
});

type ErrorReport = z.infer<typeof ErrorReportSchema>;

// Rate limiting for error reports (per IP)
const errorReportLimits = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REPORTS_PER_WINDOW = 10;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = errorReportLimits.get(ip);

  if (!limit || now > limit.resetTime) {
    errorReportLimits.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (limit.count >= MAX_REPORTS_PER_WINDOW) {
    return false;
  }

  limit.count++;
  return true;
}

function sanitizeErrorReport(report: ErrorReport): ErrorReport {
  // Remove potentially sensitive information
  const sanitized = { ...report };
  
  // Sanitize stack traces in production
  if (process.env.NODE_ENV === 'production' && sanitized.error.stack) {
    // Keep only the first few lines of stack trace to avoid exposing server paths
    const stackLines = sanitized.error.stack.split('\n');
    sanitized.error.stack = stackLines.slice(0, 5).join('\n');
  }

  // Sanitize URLs to remove query parameters that might contain sensitive data
  try {
    const url = new URL(sanitized.context.url);
    url.search = ''; // Remove query parameters
    sanitized.context.url = url.toString();
  } catch {
    // If URL parsing fails, keep original but log warning
    logger.warn('Failed to sanitize error report URL', { originalUrl: sanitized.context.url });
  }

  // Limit metadata size
  if (sanitized.metadata) {
    const metadataStr = JSON.stringify(sanitized.metadata);
    if (metadataStr.length > 2000) {
      sanitized.metadata = { _truncated: true, _originalSize: metadataStr.length };
    }
  }

  return sanitized;
}

async function processErrorReport(report: ErrorReport, correlationId: string): Promise<void> {
  const sanitizedReport = sanitizeErrorReport(report);

  // Log error with structured data
  logger.error('Client error reported', {
    clientError: {
      name: sanitizedReport.error.name,
      message: sanitizedReport.error.message,
      fileName: sanitizedReport.error.fileName,
      lineNumber: sanitizedReport.error.lineNumber,
      columnNumber: sanitizedReport.error.columnNumber,
    },
    context: sanitizedReport.context,
    metadata: sanitizedReport.metadata,
    breadcrumbsCount: sanitizedReport.breadcrumbs?.length || 0,
    correlationId,
  });

  // Here you would integrate with external error tracking services:
  // - Sentry
  // - Datadog
  // - New Relic
  // - Custom analytics
  
  // Example: Store in database for analysis
  // await storeErrorReport(sanitizedReport, correlationId);
  
  // Example: Send to external service
  // await sendToErrorTrackingService(sanitizedReport);
}

// POST endpoint for error reporting
export const POST = withErrorHandler(async (request: NextRequest) => {
  const correlationId = logger.getContext()?.correlationId || 'unknown';
  const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                   request.headers.get('x-real-ip') || 
                   'unknown';

  // Rate limiting
  if (!checkRateLimit(clientIP)) {
    logger.warn('Error report rate limit exceeded', { clientIP, correlationId });
    throw new ApiError(
      ApiErrorCode.RATE_LIMITED,
      'Too many error reports. Please try again later.',
      { limit: MAX_REPORTS_PER_WINDOW, windowMs: RATE_LIMIT_WINDOW },
      correlationId
    );
  }

  // Validate request body
  const validateBody = validateRequestBody(ErrorReportSchema);
  const errorReport = await validateBody(request);

  // Security checks
  if (errorReport.context.environment && 
      errorReport.context.environment !== process.env.NODE_ENV) {
    logger.warn('Environment mismatch in error report', {
      reported: errorReport.context.environment,
      actual: process.env.NODE_ENV,
      correlationId,
    });
  }

  // Process error report
  try {
    await processErrorReport(errorReport, correlationId);
    
    logger.info('Error report processed successfully', {
      errorType: errorReport.error.name,
      correlationId,
      clientIP,
    });

    return createSuccessResponse(
      { 
        received: true, 
        correlationId,
        message: 'Error report received and processed'
      },
      201,
      correlationId
    );

  } catch (processingError) {
    logger.error('Failed to process error report', {
      correlationId,
      processingError: processingError instanceof Error ? processingError.message : String(processingError),
    }, processingError instanceof Error ? processingError : new Error(String(processingError)));

    throw new ApiError(
      ApiErrorCode.INTERNAL_ERROR,
      'Failed to process error report',
      { correlationId },
      correlationId
    );
  }
}, {
  enableErrorLogging: true,
  enablePerformanceLogging: true,
  enableRequestLogging: false, // Don't log error report requests to avoid noise
  maxRequestBodySize: 50 * 1024, // 50KB max for error reports
  requestTimeoutMs: 10000, // 10 second timeout
});