import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError, ApiErrorCode, createSuccessResponse, readJsonBody, ValidationError, withErrorHandler } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';

const webhookSchema = z.object({
  alert: z.object({
    id: z.string().min(1).max(128),
    rule: z.string().min(1).max(128),
    metric: z.string().min(1).max(128),
    value: z.number().finite(),
    threshold: z.number().finite().optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    status: z.enum(['active', 'resolved', 'acknowledged']),
    message: z.string().max(1_000),
    timestamp: z.number().int().positive(),
  }).strict(),
  timestamp: z.number().int().positive(),
}).strict();

function bearerMatches(request: NextRequest, expected: string): boolean {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const expected = process.env.ALERT_WEBHOOK_TOKEN;
  if (!expected) throw new ApiError(ApiErrorCode.SERVICE_UNAVAILABLE, 'Webhook token is not configured');
  const decision = await checkSensitiveRateLimit(request, {
    scope: 'alert-webhook-ingest', limit: 30, windowMs: 60_000,
  });
  if (!decision.allowed) throw new ApiError(ApiErrorCode.RATE_LIMITED, 'Too many webhook requests');
  if (!bearerMatches(request, expected)) throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Invalid webhook token');

  const parsed = webhookSchema.safeParse(await readJsonBody(request, 32 * 1_024));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const alert = parsed.data.alert;
  const { prisma } = await import('@/lib/prisma');
  await prisma.securityAuditEvent.create({
    data: {
      id: crypto.randomUUID(),
      eventType: 'external.alert.received',
      severity: alert.severity,
      details: {
        externalId: alert.id,
        rule: alert.rule,
        metric: alert.metric,
        value: alert.value,
        threshold: alert.threshold,
        status: alert.status,
        message: alert.message,
        sourceTimestamp: alert.timestamp,
      },
    },
  });
  logger.info('External alert stored', { alertId: alert.id, severity: alert.severity, status: alert.status });
  return createSuccessResponse({ alertId: alert.id, processed: true });
});

export const GET = withErrorHandler(async () => createSuccessResponse({
  status: 'healthy',
  accepts: ['POST'],
  authentication: 'Bearer token required',
}));
