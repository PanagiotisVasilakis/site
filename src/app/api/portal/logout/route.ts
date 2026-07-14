import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { guestStore } from '@/lib/guestDataStore';
import { logger as elogger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';
import { parseGuestSession, revokeGuestSession } from '@/lib/guestSession';

export const POST = withErrorHandler(async (req: NextRequest) => {
  await revokeGuestSession(parseGuestSession(req.cookies.get('guest_session')?.value));
  const refresh = req.cookies.get('guest_rt')?.value;
  if (refresh) {
    const revoked = await guestStore.revokeRefreshFamily(refresh);
    if (revoked) {
      elogger.info('refresh_token.revoked', { correlationId: elogger.getContext()?.correlationId });
      metrics.counter('refresh_token.revoked', 1);
    }
  }
  const headers = new Headers();
  headers.append('Set-Cookie', `guest_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;${process.env.NODE_ENV === 'production' ? ' Secure;' : ''}`);
  headers.append('Set-Cookie', `guest_rt=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;${process.env.NODE_ENV === 'production' ? ' Secure;' : ''}`);
  return new NextResponse(null, { status: 204, headers });
});
