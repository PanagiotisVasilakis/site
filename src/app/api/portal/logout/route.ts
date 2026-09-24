import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { guestStore } from '@/lib/guestDataStore';
import { logger as elogger } from '@/lib/logger-enterprise';
import {
  clearRefreshCookie,
  clearSessionCookie,
  GUEST_REFRESH_COOKIE,
  GUEST_SESSION_COOKIE,
  parseGuestSessionBinding,
  revokeGuestSessionById,
} from '@/lib/guestSession';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const sessionBinding = parseGuestSessionBinding(req.cookies.get(GUEST_SESSION_COOKIE)?.value);
  await revokeGuestSessionById(
    sessionBinding.status === 'present' ? sessionBinding.sessionId : undefined,
  );
  const refresh = req.cookies.get(GUEST_REFRESH_COOKIE)?.value;
  if (refresh) {
    const revoked = await guestStore.revokeRefreshFamily(refresh);
    if (revoked) {
      elogger.info('refresh_token.revoked', { correlationId: elogger.getContext()?.correlationId });
    }
  }
  const response = new NextResponse(null, { status: 204 });
  for (const cookie of [clearSessionCookie(), clearRefreshCookie()]) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
});
