import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminSession, revokeAdminSession, setAdminSessionCookie, signAdmin, verifyAdmin } from '@/lib/auth/admin';
import { logger } from '@/lib/logger-enterprise';
import { withErrorHandler, validateRequestBody } from '@/lib/apiErrorHandler';
import crypto from 'node:crypto';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';
import { readRuntimeCredential } from '@/lib/runtime-credentials.js';

// Production credentials are at most 512 characters (runtime-credentials.js).
const loginSchema = z.object({
  token: z.string().min(1, 'Token is required').max(512),
}).strict();

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
  
  const body = await validateRequestBody(loginSchema, 4 * 1_024)(req);
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

  const previousToken = req.cookies.get('admin_jwt')?.value;
  if (previousToken) {
    const previousPayload = verifyAdmin(previousToken);
    if (previousPayload?.session_id) {
      await revokeAdminSession(previousPayload.session_id);
    }
  }

  const adminSession = await createAdminSession();
  const jwt = signAdmin({ 
    session_id: adminSession.id,
    login_at: adminSession.loginAt,
  });
  
  const res = NextResponse.json({ success: true }, { status: 200 });
  setAdminSessionCookie(res, jwt);

  logger.info('Admin login successful');
  return res;
});
