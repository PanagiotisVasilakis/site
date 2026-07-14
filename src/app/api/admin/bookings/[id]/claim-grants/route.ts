import { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError, ApiErrorCode, createSuccessResponse, readJsonBody, ValidationError, withErrorHandler } from '@/lib/apiErrorHandler';
import { verifyAdminSession } from '@/lib/auth/admin';
import { issueBookingClaimGrant, PortalAuthError } from '@/lib/portalAuthService';

export const dynamic = 'force-dynamic';

const schema = z.object({
  channel: z.enum(['REMOTE', 'ONSITE']),
  ttlMinutes: z.number().int().min(5).max(1440).optional(),
});

export const POST = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => {
  const token = request.cookies.get('admin_jwt')?.value;
  const admin = token ? await verifyAdminSession(token) : null;
  if (!admin?.session_id) throw new ApiError(ApiErrorCode.FORBIDDEN, 'Admin credentials required');

  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Cross-origin admin mutation rejected');
  }
  const parsed = schema.safeParse(await readJsonBody(request, 8 * 1_024));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const { id } = await context.params;

  try {
    const grant = await issueBookingClaimGrant({
      bookingId: id,
      channel: parsed.data.channel,
      ttlMinutes: parsed.data.ttlMinutes,
      adminSessionId: admin.session_id,
    });
    return createSuccessResponse({
      claimToken: grant.token,
      expiresAt: grant.expiresAt.toISOString(),
      channel: parsed.data.channel,
    }, 201);
  } catch (error) {
    if (error instanceof PortalAuthError) {
      if (error.code === 'BOOKING_ALREADY_CLAIMED') {
        throw new ApiError(ApiErrorCode.CONFLICT, 'Booking is already claimed');
      }
      throw new ApiError(ApiErrorCode.NOT_FOUND, 'Booking not found');
    }
    throw error;
  }
});
