import { NextRequest } from 'next/server';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { metrics } from '@/lib/metrics-collector';
import { logger } from '@/lib/logger-enterprise';

export const dynamic = 'force-dynamic';

function requireDevAndSecret(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'This endpoint is only available in non-production environments');
  }
  const secret = process.env.ADMIN_DASH_SECRET;
  if (secret) {
    const provided = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('token') || '';
    if (provided !== secret) {
      throw new ApiError(ApiErrorCode.FORBIDDEN, 'Invalid admin secret for dev endpoint');
    }
  }
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  requireDevAndSecret(req);

  const cfg = metrics.getVerificationFailedAlertConfig();
  return createSuccessResponse({
    env: process.env.NODE_ENV,
    alert: {
      verification_failed: cfg,
    },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireDevAndSecret(req);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const count = Math.max(1, Math.min(1000, Number((body as { count?: unknown }).count) || 25));
  const delayMs = Math.max(0, Math.min(1000, Number((body as { delayMs?: unknown }).delayMs) || 0));
  const threshold = (body as { threshold?: unknown }).threshold as number | undefined;
  const windowMs = (body as { windowMs?: unknown }).windowMs as number | undefined;

  if ((threshold !== undefined && (!Number.isFinite(threshold) || threshold <= 0)) ||
      (windowMs !== undefined && (!Number.isFinite(windowMs) || windowMs <= 0))) {
    throw new ApiError(ApiErrorCode.BAD_REQUEST, 'threshold and windowMs must be positive numbers');
  }

  if (threshold !== undefined || windowMs !== undefined) {
    metrics.setVerificationFailedAlertConfig({ threshold, windowMs });
  }

  logger.info('Generating synthetic verification_failed spike', { count, delayMs, threshold, windowMs });

  // Emit the requested number of failure metrics
  for (let i = 0; i < count; i++) {
    metrics.counter('verification_failed', 1, { reason: 'synthetic_spike' });
    if (delayMs > 0) await new Promise((res) => setTimeout(res, delayMs));
  }

  const cfg = metrics.getVerificationFailedAlertConfig();
  return createSuccessResponse({
    generated: count,
    delayMs,
    alert: { verification_failed: cfg },
  }, 201);
});
