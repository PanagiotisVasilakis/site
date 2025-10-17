import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { signAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { withErrorHandler, validateRequestBody } from '@/lib/apiErrorHandler';
import crypto from 'node:crypto';

const loginSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const secret = process.env.ADMIN_DASH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Admin login disabled' }, { status: 400 });
  }
  
  const body = await validateRequestBody(loginSchema)(req);
  const { token } = body;
  
  if (token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Generate JWT with unique identifier and clean payload
  const jwt = signAdmin({ 
    role: 'admin',
    jti: crypto.randomUUID(), // Unique token identifier
    login_at: Math.floor(Date.now() / 1000)
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