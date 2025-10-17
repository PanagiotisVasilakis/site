import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';

// No body validation needed for logout (it's a simple POST)
export const POST = withErrorHandler(async () => {
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
