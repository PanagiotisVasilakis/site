import { NextRequest } from 'next/server';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';
import { guestStore } from '@/lib/guestDataStore';
import { getGuestSessionFromCookies } from '@/lib/guestSession';
import { maskLast4 } from '@/lib/crypto';
import { requireSubjectOrAdmin } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const correlationId = logger.getContext()?.correlationId;

  const session = await getGuestSessionFromCookies();
  const sessionUserId = session?.user?.id;
  const sessionUser = sessionUserId ? guestStore.findUserById(sessionUserId) : undefined;

  // Allow admin to query specific user by user_id or by phone
  const url = new URL(req.url);
  const userIdQuery = url.searchParams.get('user_id') || undefined;
  const phoneQuery = url.searchParams.get('phone') || undefined;

  const subject = userIdQuery
    ? guestStore.findUserById(userIdQuery)
    : phoneQuery
      ? guestStore.findUserByPhone(phoneQuery)
      : sessionUser;

  if (!subject) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'No subject found (missing session or invalid query)', undefined, correlationId);
  }

  const access = requireSubjectOrAdmin(req, subject.id, sessionUser?.id);
  if (!access) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Not authorized to export this data', undefined, correlationId);
  }

  // Collect footprint
  const eligible = guestStore.findEligibleBookingForUser(subject.id);
  const bookings = [eligible].filter(Boolean) as NonNullable<typeof eligible>[];

  // Access records for this user (store helper)
  const subjectAccess = guestStore.listAccessByUser(subject.id).map(a => ({ booking_id: a.booking_id, status: a.status, updated_at: a.updated_at }));

  // Sessions for user
  // guestDataStore exposes sessions array through DB, but no direct getter; skip listing raw tokens here
  const maskPhone = subject.phone_e164 ? maskLast4(subject.phone_e164) : undefined;

  const response = {
    subject: {
      user_id: subject.id,
      phone_last4: maskPhone,
      origin: subject.country_origin,
    },
    // Minimal booking footprint (IDs that can be referenced elsewhere)
    bookings: bookings.map(b => ({ id: b.id, source: b.source, start_date: b.start_date, end_date: b.end_date, reference: b.reference })),
    access: subjectAccess,
    generated_at: new Date().toISOString(),
  };

  return createSuccessResponse(response, 200, correlationId);
});
