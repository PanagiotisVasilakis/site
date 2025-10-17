import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin, signAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger';
import crypto from 'node:crypto';

// No body validation needed - reads from cookie
export const POST = withErrorHandler(async (req: NextRequest) => {
  // Parse JWT token safely from cookie
  const jwt = req.cookies.get('admin_jwt')?.value;
    
  if (!jwt) {
    return NextResponse.json({ error: 'No session found' }, { status: 401 });
  }
  
  const payload = verifyAdmin(jwt);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
  
  // Validate that the token contains expected structure
  if (!payload.role || payload.role !== 'admin') {
    return NextResponse.json({ error: 'Invalid role' }, { status: 401 });
  }
  
  // Check token age - don't allow refresh of very old tokens
  const tokenAge = Date.now() / 1000 - (payload.iat || 0);
  if (tokenAge > 86400) { // 24 hours max token age
    return NextResponse.json({ error: 'Token too old' }, { status: 401 });
  }
  
  // Generate new session with clean payload and unique JTI
  const cleanPayload = {
    role: 'admin' as const, // Only preserve validated, expected claims
    jti: crypto.randomUUID(), // Unique token identifier
    refreshed_at: Math.floor(Date.now() / 1000)
  };
  
  const fresh = signAdmin(cleanPayload, '2h');
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
