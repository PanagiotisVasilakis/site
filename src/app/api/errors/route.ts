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
    url: z.url().max(500),
    timestamp: z.iso.datetime(),
    buildVersion: z.string().max(50).optional(),
  }).strict(),
  category: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/).optional(),
}).strict();

// One row per accepted report and no dedupe: the schema bounds what is accepted, these bound what is stored.
const STORED_MESSAGE_CHARS = 200;
const STORED_STACK_CHARS = 600;
const STORED_FILE_CHARS = 120;

export const POST = withErrorHandler(async (request: NextRequest, { signal }) => {
  const decision = await checkSensitiveRateLimit(request, {
    scope: 'client-error-report',
    limit: 10,
    windowMs: 60_000,
  });
  signal.throwIfAborted();
  if (!decision.allowed) throw new ApiError(ApiErrorCode.RATE_LIMITED, 'Too many error reports');
  // The body is validated before the shared budget is spent: a malformed request
  // writes no row, so it must not use up the budget that legitimate reports need.
  const report = await validateRequestBody(errorReportSchema, 16 * 1_024)(request);
  signal.throwIfAborted();
  // The limit above is per client address. This one is shared by all clients and
  // counts only requests that store a row, so many attested addresses together
  // cannot grow the audit table unbounded.
  const globalDecision = await checkSensitiveRateLimit(request, {
    scope: 'client-error-report-global',
    identifier: 'global',
    limit: 100,
    windowMs: 3_600_000,
  });
  signal.throwIfAborted();
  if (!globalDecision.allowed) throw new ApiError(ApiErrorCode.RATE_LIMITED, 'Too many error reports');

  const clientIp = getClientIp(request);
  const reportUrl = new URL(report.context.url);
  const path = reportUrl.pathname.slice(0, 512);
  const correlationId = logger.getContext()?.correlationId;
  const stack = report.error.stack
    ? redactSensitiveText(report.error.stack.split('\n').slice(0, 5).join('\n'), STORED_STACK_CHARS)
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
        name: redactSensitiveText(report.error.name, 100),
        message: redactSensitiveText(report.error.message, STORED_MESSAGE_CHARS),
        stack,
        fileName: report.error.fileName
          ? redactSensitiveText(report.error.fileName, STORED_FILE_CHARS).split('?')[0]
          : undefined,
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
  maxRequestBodySize: 16 * 1_024,
  requestTimeoutMs: 10_000,
});
