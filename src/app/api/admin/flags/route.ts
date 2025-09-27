import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { isAdminRequest } from '@/lib/rbac';
import { getFeatureFlags, setFeatureFlags, type FeatureFlags } from '@/lib/featureFlags';
import { metrics } from '@/lib/metrics-collector';
import { logger } from '@/lib/logger-enterprise';

export const dynamic = 'force-dynamic';

const schema = z.object({
  portalEnabled: z.boolean().optional(),
  checkinEnabled: z.boolean().optional(),
}).refine((obj) => Object.keys(obj).length > 0, { message: 'At least one flag must be provided' });

export const GET = withErrorHandler(async (req: NextRequest) => {
  if (!isAdminRequest(req)) throw new ApiError(ApiErrorCode.FORBIDDEN, 'Admin credentials required');
  const flags = getFeatureFlags();
  return createSuccessResponse<FeatureFlags>(flags) as NextResponse;
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  if (!isAdminRequest(req)) throw new ApiError(ApiErrorCode.FORBIDDEN, 'Admin credentials required');
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'Invalid flags payload', { issues: parsed.error.issues });
  }
  const before = getFeatureFlags();
  const updated = setFeatureFlags(parsed.data);

  // Determine which flags actually changed
  const changed: string[] = [];
  if (typeof parsed.data.portalEnabled === 'boolean' && before.portalEnabled !== updated.portalEnabled) {
    changed.push('portalEnabled');
  }
  if (typeof parsed.data.checkinEnabled === 'boolean' && before.checkinEnabled !== updated.checkinEnabled) {
    changed.push('checkinEnabled');
  }

  // Emit observability signals (best-effort)
  try {
    metrics.counter('feature_flags.updated', 1, {
      changed: changed.join(',') || 'none',
      endpoint: '/api/admin/flags',
      method: 'POST',
    });
  metrics.trackEvent('feature_flags_updated', { changed, before, after: updated });
    logger.info('Feature flags updated', { changed, before, after: updated });
  } catch {}

  return createSuccessResponse<FeatureFlags>(updated) as NextResponse;
});
