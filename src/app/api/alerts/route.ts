import { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError, ApiErrorCode, createSuccessResponse, readJsonBody, ValidationError, withErrorHandler } from '@/lib/apiErrorHandler';
import { isAdminRequest } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: NextRequest) {
  if (!(await isAdminRequest(request))) throw new ApiError(ApiErrorCode.FORBIDDEN, 'Admin credentials required');
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin(request);
  const { prisma } = await import('@/lib/prisma');
  const type = request.nextUrl.searchParams.get('type') || 'active';
  if (type === 'rules') {
    const rules = await prisma.alertRule.findMany({ orderBy: { name: 'asc' } });
    return createSuccessResponse({
      rules,
      count: rules.length,
      enabled: rules.filter((rule) => rule.enabled).length,
      disabled: rules.filter((rule) => !rule.enabled).length,
    });
  }

  if (type !== 'active' && type !== 'history') {
    throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'type must be active, history, or rules');
  }
  const hours = Math.min(Math.max(Number.parseInt(request.nextUrl.searchParams.get('hours') || '24', 10), 1), 720);
  const alerts = await prisma.alert.findMany({
    where: type === 'active'
      ? { status: { in: ['OPEN', 'ACKNOWLEDGED'] } }
      : { openedAt: { gte: new Date(Date.now() - hours * 60 * 60_000) } },
    include: { rule: true },
    orderBy: { openedAt: 'desc' },
  });
  return createSuccessResponse({
    alerts,
    count: alerts.length,
    severityCounts: {
      critical: alerts.filter((alert) => alert.rule.severity === 'critical').length,
      high: alerts.filter((alert) => alert.rule.severity === 'high').length,
      medium: alerts.filter((alert) => alert.rule.severity === 'medium').length,
      low: alerts.filter((alert) => alert.rule.severity === 'low').length,
    },
    ...(type === 'history' ? { timeRange: hours } : {}),
  });
});

const ruleUpdateSchema = z.object({
  comparison: z.enum(['gt', 'gte', 'lt', 'lte']),
  threshold: z.number().finite(),
  windowMinutes: z.number().int().min(1).max(43_200),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  enabled: z.boolean(),
}).partial().refine((value) => Object.keys(value).length > 0, 'At least one update is required');

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin(request);
  const { prisma } = await import('@/lib/prisma');
  const body = await readJsonBody(request, 16 * 1_024) as { action?: unknown; data?: unknown } | null;
  if (body?.action === 'acknowledge') {
    const parsed = z.object({ alertId: z.string().uuid() }).safeParse(body.data);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const result = await prisma.alert.updateMany({
      where: { id: parsed.data.alertId, status: 'OPEN' },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    });
    if (result.count !== 1) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Open alert not found');
    return createSuccessResponse({ alertId: parsed.data.alertId, acknowledgedAt: new Date().toISOString() });
  }
  throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'action must be acknowledge');
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin(request);
  const { prisma } = await import('@/lib/prisma');
  const body = await readJsonBody(request, 16 * 1_024) as { ruleId?: unknown; updates?: unknown } | null;
  const id = z.string().uuid().safeParse(body?.ruleId);
  const updates = ruleUpdateSchema.safeParse(body?.updates);
  if (!id.success) throw new ValidationError(id.error.issues);
  if (!updates.success) throw new ValidationError(updates.error.issues);
  const result = await prisma.alertRule.updateMany({ where: { id: id.data }, data: updates.data });
  if (result.count !== 1) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Alert rule not found');
  return createSuccessResponse({ rule: await prisma.alertRule.findUnique({ where: { id: id.data } }) });
});

export const DELETE = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin(request);
  throw new ApiError(ApiErrorCode.METHOD_NOT_ALLOWED, 'Built-in alert rules cannot be deleted; disable the rule instead');
});
