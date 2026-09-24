import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError, ApiErrorCode, createSuccessResponse, validateRequestBody, withErrorHandler } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';
import { getClientIp } from '@/lib/net/getClientIp';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';
import { privacyHmac } from '@/lib/privacyHash';
import { redactSensitiveText } from '@/lib/redaction';

const errorReportSchema = z.object({
  error: z.object({
    name: z.string().max(100),
    message: z.string().max(500),
    stack: z.string().max(2_000).optional(),
    fileName: z.string().max(200).optional(),
    lineNumber: z.number().int().nonnegative().optional(),
    columnNumber: z.number().int().nonnegative().optional(),
  }).strict(),
  context: z.object({
    url: z.string().url().max(500),
    timestamp: z.string().datetime(),
    buildVersion: z.string().max(50).optional(),
    environment: z.enum(['development', 'staging', 'production']).optional(),
  }).strict(),
  category: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/).optional(),
}).strict();

function redact(value: string): string {
  return redactSensitiveText(value, 2_000);
}

export const POST = withErrorHandler(async (request: NextRequest, { signal }) => {
  const decision = await checkSensitiveRateLimit(request, {
    scope: 'client-error-report',
    limit: 10,
    windowMs: 60_000,
  });
  signal.throwIfAborted();
  if (!decision.allowed) throw new ApiError(ApiErrorCode.RATE_LIMITED, 'Too many error reports');

  const report = await validateRequestBody(errorReportSchema, 16 * 1_024)(request);
  signal.throwIfAborted();
  const clientIp = getClientIp(request);
  const reportUrl = new URL(report.context.url);
  const path = reportUrl.pathname.slice(0, 512);
  const correlationId = logger.getContext()?.correlationId;
  const stack = report.error.stack
    ? redact(report.error.stack.split('\n').slice(0, 5).join('\n')).slice(0, 2_000)
    : undefined;

  const { prisma } = await import('@/lib/prisma');
  signal.throwIfAborted();
  await prisma.securityAuditEvent.create({
    data: {
      id: crypto.randomUUID(),
      eventType: 'client.error',
      severity: 'low',
      correlationId: correlationId?.slice(0, 128),
      ipHash: clientIp === 'unknown' ? null : privacyHmac(clientIp, 'security-event-ip:v1'),
      path,
      details: {
        name: redact(report.error.name),
        message: redact(report.error.message),
        stack,
        fileName: report.error.fileName ? redact(report.error.fileName).split('?')[0] : undefined,
        lineNumber: report.error.lineNumber,
        columnNumber: report.error.columnNumber,
        buildVersion: report.context.buildVersion,
        category: report.category,
      },
    },
  });

  logger.warn('Client error report stored', { path, category: report.category, correlationId });
  return createSuccessResponse({ received: true, correlationId }, 201, correlationId);
}, {
  enableRequestLogging: false,
  maxRequestBodySize: 16 * 1_024,
  requestTimeoutMs: 10_000,
});
