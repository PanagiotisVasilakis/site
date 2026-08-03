import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminSession, signAdmin } from '@/lib/auth/admin';
import { logger } from '@/lib/logger-enterprise';
import { withErrorHandler, validateRequestBody } from '@/lib/apiErrorHandler';
import crypto from 'node:crypto';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';
import { readRuntimeCredential } from '@/lib/runtime-credentials.js';

const loginSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  let secret: string | undefined;
  try {
    secret = readRuntimeCredential('ADMIN_DASH_SECRET');
  } catch {
    return NextResponse.json({ error: 'Admin login disabled' }, { status: 503 });
  }
  if (!secret) {
    return NextResponse.json({ error: 'Admin login disabled' }, { status: 400 });
  }
  
  const body = await validateRequestBody(loginSchema)(req);
  const { token } = body;

  const rateLimit = await checkSensitiveRateLimit(req, {
    scope: 'admin-login',
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many authentication attempts' }, { status: 429 });
  }

  const supplied = Buffer.from(token);
  const expected = Buffer.from(secret);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminSession = await createAdminSession();
  // Generate JWT with unique identifier and clean payload
  const jwt = signAdmin({ 
    jti: crypto.randomUUID(),
    session_id: adminSession.id,
    login_at: adminSession.loginAt,
  });
  
  const res = NextResponse.json({ success: true }, { status: 200 });
  
  // Enhanced cookie security with consistent settings
  res.cookies.set('admin_jwt', jwt, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 7200,
    secure: process.env.NODE_ENV === 'production',
  });
  
  logger.info('Admin login successful');
  return res;
});
