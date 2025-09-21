import { NextResponse } from 'next/server';
import { withErrorHandler, ApiError, ApiErrorCode, createSuccessResponse } from '@/lib/apiErrorHandler';
import { signGuestSession, createSessionCookie } from '@/lib/guestSession';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async () => {
  if (process.env.NODE_ENV === 'production') {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Not available in production');
  }

  const token = signGuestSession({
    booking: { id: 'dev' },
  });
  const cookieDef = createSessionCookie(token);
  const res = createSuccessResponse({ redirectedTo: '/check-in' });
  res.cookies.set(cookieDef.name, cookieDef.value, cookieDef.options);
  return res as NextResponse;
});
