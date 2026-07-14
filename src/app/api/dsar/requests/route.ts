import { NextRequest } from 'next/server';

import { ApiError, ApiErrorCode, createSuccessResponse, readJsonBody, withErrorHandler } from '@/lib/apiErrorHandler';
import { getVerifiedGuestSessionFromCookies } from '@/lib/guestSession';
import { prisma } from '@/lib/prisma';
import { createVerifiedErasureRequest } from '@/lib/privacyService';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';

async function requireGuest() {
  const session = await getVerifiedGuestSessionFromCookies();
  const userId = session?.user?.id;
  const bookingId = session?.booking?.id;
  if (!userId || !bookingId) throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Verified guest session required');
  return { userId, bookingId };
}

export const GET = withErrorHandler(async () => {
  const session = await requireGuest();
  const requests = await prisma.privacyRequest.findMany({
    where: { userId: session.userId },
    orderBy: { requestedAt: 'desc' },
    select: { id: true, requestType: true, status: true, requestedAt: true, completedAt: true, auditNote: true },
  });
  return createSuccessResponse({ requests });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireGuest();
  const decision = await checkSensitiveRateLimit(request, {
    scope: 'privacy-erasure-request',
    identifier: session.userId,
    limit: 3,
    windowMs: 24 * 60 * 60_000,
  });
  if (!decision.allowed) throw new ApiError(ApiErrorCode.RATE_LIMITED, 'Too many privacy requests');

  const body = await readJsonBody(request, 8 * 1_024) as { type?: unknown; confirm?: unknown } | null;
  if (body?.type !== 'ERASURE' || body.confirm !== true) {
    throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'type must be ERASURE and confirm must be true');
  }
  const result = await createVerifiedErasureRequest(session.userId, session.bookingId);
  return createSuccessResponse({
    request: {
      id: result.request.id,
      status: result.request.status,
      requestedAt: result.request.requestedAt,
    },
    created: result.created,
  }, result.created ? 202 : 200);
});
