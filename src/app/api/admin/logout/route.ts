import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';
import { revokeAdminSession, verifyAdmin } from '@/lib/auth/admin';

// No body validation needed for logout (it's a simple POST)
export const POST = withErrorHandler(async (request: NextRequest) => {
  const payload = verifyAdmin(request.cookies.get('admin_jwt')?.value || '');
  await revokeAdminSession(payload?.session_id);
  const res = NextResponse.json({ success: true }, { status: 200 });
  
  // Properly expire cookie with all security flags
  res.cookies.set('admin_jwt', '', {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 0,
    expires: new Date(0),
    secure: process.env.NODE_ENV === 'production',
  });
  
  logger.info('Admin logout successful');
  return res;
});
