import { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError, ApiErrorCode, assertSameOriginMutation, createSuccessResponse, readJsonBody, ValidationError, withErrorHandler } from '@/lib/apiErrorHandler';
import { verifyAdminSession } from '@/lib/auth/admin';
import { PortalAuthError, resetGuestAccess } from '@/lib/portalAuthService';
import { setClaimTransportResponseHeaders } from '@/lib/portalClaimExchange';

export const dynamic = 'force-dynamic';

const schema = z.object({
  confirm: z.literal(true),
}).strict();

// Resets a claimed guest's password and sessions and returns a one-time claim
// token for the same booking (see resetGuestAccess).
export const POST = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => {
  const token = request.cookies.get('admin_jwt')?.value;
  const admin = token ? await verifyAdminSession(token) : null;
  if (!admin?.session_id) throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Admin credentials required');

  assertSameOriginMutation(request);
  const parsed = schema.safeParse(await readJsonBody(request, 4 * 1_024));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Booking not found');

  try {
    const grant = await resetGuestAccess({
      bookingId: id,
      adminSessionId: admin.session_id,
    });
    const response = createSuccessResponse({
      claimToken: grant.token,
      expiresAt: grant.expiresAt.toISOString(),
      channel: 'REMOTE',
    }, 201);
    setClaimTransportResponseHeaders(response);
    return response;
  } catch (error) {
    if (error instanceof PortalAuthError) {
      if (error.code === 'BOOKING_NOT_CLAIMED') {
        throw new ApiError(ApiErrorCode.CONFLICT, 'This booking has no guest account yet; use Issue claim');
      }
      if (error.code === 'BOOKING_NOT_IN_ACCESS_WINDOW') {
        throw new ApiError(ApiErrorCode.CONFLICT, 'Access can be reset from 7 days before check-in until the check-out date (UTC calendar dates)');
      }
      throw new ApiError(ApiErrorCode.NOT_FOUND, 'Booking not found');
    }
    throw error;
  }
});
