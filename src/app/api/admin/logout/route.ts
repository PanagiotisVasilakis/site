import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';
import { clearAdminSessionCookie, revokeAdminSession, verifyAdmin } from '@/lib/auth/admin';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const payload = verifyAdmin(request.cookies.get('admin_jwt')?.value || '');
  await revokeAdminSession(payload?.session_id);
  const res = NextResponse.json({ success: true }, { status: 200 });
  clearAdminSessionCookie(res);

  logger.info('Admin logout successful');
  return res;
});
