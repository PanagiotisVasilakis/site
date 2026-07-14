import { NextRequest, NextResponse } from 'next/server';
import { refreshAdminSession, signAdmin, verifyAdminSession } from '@/lib/auth/admin';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';
import crypto from 'node:crypto';

// No body validation needed - reads from cookie
export const POST = withErrorHandler(async (req: NextRequest) => {
  // Parse JWT token safely from cookie
  const jwt = req.cookies.get('admin_jwt')?.value;
    
  if (!jwt) {
    return NextResponse.json({ error: 'No session found' }, { status: 401 });
  }
  
  const payload = await verifyAdminSession(jwt);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
  
  // Validate that the token contains expected structure
  if (payload.type !== 'admin' || payload.role !== 'admin') {
    return NextResponse.json({ error: 'Invalid admin session' }, { status: 401 });
  }
  
  const loginAt = payload.login_at;
  const sessionId = payload.session_id;
  if (!loginAt || !sessionId || Date.now() / 1000 - loginAt > 86400) {
    return NextResponse.json({ error: 'Token too old' }, { status: 401 });
  }

  const expiresAt = await refreshAdminSession(sessionId);
  if (!expiresAt) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  const cleanPayload = {
    jti: crypto.randomUUID(),
    session_id: sessionId,
    login_at: loginAt,
    refreshed_at: Math.floor(Date.now() / 1000),
  };
  const ttlSeconds = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const fresh = signAdmin(cleanPayload, ttlSeconds);
  const res = NextResponse.json({ success: true }, { status: 200 });
  
  // Enhanced cookie security
  res.cookies.set('admin_jwt', fresh, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 7200,
    secure: process.env.NODE_ENV === 'production',
  });
  
  logger.info('Admin session refreshed');
  return res;
});
