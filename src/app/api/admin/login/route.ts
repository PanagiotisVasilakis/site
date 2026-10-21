import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminSession, signAdmin } from '@/lib/auth/admin';
import { logger } from '@/lib/logger-enterprise';
import { withErrorHandler, validateRequestBody } from '@/lib/apiErrorHandler';
import crypto from 'node:crypto';
import { requireCanonicalClientIp } from '@/lib/net/clientIdentity';
import { privacyHmac } from '@/lib/privacyHash';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';
import { readRuntimeCredential } from '@/lib/runtime-credentials.js';

// Production credentials are at most 512 characters (runtime-credentials.js).
const loginSchema = z.object({
  token: z.string().min(1, 'Token is required').max(512),
}).strict();

const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60_000;

// Event types are `admin.login_*`, as the guest portal's are `portal.*`. None is high severity: the
// alert rule "Recent high-severity security events" would open an alert for every internet scan of
// this public endpoint. Retention (runRetention in operationalMonitor.ts) deletes security_audit_events
// rows after 90 days by age alone, whatever their type.
type LoginAudit =
  | { outcome: 'succeeded'; adminSessionId: string }
  | { outcome: 'failed'; remainingAttempts: number }
  | { outcome: 'rate_limited'; windowEndsAt: Date };

const LOGIN_EVENTS = {
  succeeded: { eventType: 'admin.login_succeeded', severity: 'low' },
  failed: { eventType: 'admin.login_failed', severity: 'medium' },
  rate_limited: { eventType: 'admin.login_rate_limited', severity: 'medium' },
} as const;

/**
 * Id of the one refusal event of a limiter window. The limiter row's reset time identifies its
 * bucket and window: every address that shares the bucket (an IPv6 /64) sees the same value, so
 * the primary key, not a second limiter row, keeps the refusals of a window down to one event.
 * Keying on the address instead would let one /64 write an event per address. Two buckets whose
 * windows end in the same millisecond share one event; their failed events are stored as usual.
 */
function refusalEventId(windowEndsAt: Date): string {
  const hex = privacyHmac(String(windowEndsAt.getTime()), 'admin-login-refusal:v1').slice(0, 32);
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

/**
 * Stores one sign-in outcome as a security audit event: the outcome, the client address as the
 * keyed hash that all security events share, the correlation id and non-secret counters. The
 * submitted token, its length and any part of it are neither stored nor logged.
 *
 * The writes stay inside the rate-limited path. `succeeded` and `failed` are written only for an
 * attempt that the limiter let through: at most LOGIN_ATTEMPT_LIMIT per source (an IPv4 address or
 * an IPv6 /64) and LOGIN_WINDOW_MS. A refused attempt writes `rate_limited` only if its window has
 * none yet: refusalEventId names it and `skipDuplicates` drops the repeats, so a window holds one
 * however many requests are refused, and the limiter table gets no extra row. Requests that end
 * before the limiter (login disabled, bad body, no client identity) write nothing. A flood from
 * many sources is left to Cloudflare and Nginx, as for the guest sign-in limiter.
 *
 * Best effort: a failed write is logged and never changes the answer.
 */
async function recordLoginEvent(request: NextRequest, audit: LoginAudit): Promise<void> {
  try {
    const { eventType, severity } = LOGIN_EVENTS[audit.outcome];
    const details = audit.outcome === 'succeeded'
      ? { adminSessionId: audit.adminSessionId }
      : audit.outcome === 'failed'
        ? { remainingAttempts: audit.remainingAttempts }
        : { limit: LOGIN_ATTEMPT_LIMIT, windowMinutes: LOGIN_WINDOW_MS / 60_000, windowEndsAt: audit.windowEndsAt.toISOString() };
    const data = {
      eventType,
      severity,
      correlationId: logger.getContext()?.correlationId?.slice(0, 128) ?? null,
      ipHash: privacyHmac(requireCanonicalClientIp(request), 'security-event-ip:v1'),
      path: '/api/admin/login',
      details,
    };
    const { prisma } = await import('@/lib/prisma');
    if (audit.outcome === 'rate_limited') {
      await prisma.securityAuditEvent.createMany({
        data: [{ id: refusalEventId(audit.windowEndsAt), ...data }],
        skipDuplicates: true,
      });
    } else {
      await prisma.securityAuditEvent.create({ data: { id: crypto.randomUUID(), ...data } });
    }
  } catch (error) {
    logger.error('Admin login audit event could not be stored', {
      outcome: audit.outcome,
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

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
    limit: LOGIN_ATTEMPT_LIMIT,
    windowMs: LOGIN_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    await recordLoginEvent(req, { outcome: 'rate_limited', windowEndsAt: rateLimit.resetAt });
    return NextResponse.json({ error: 'Too many authentication attempts' }, { status: 429 });
  }

  const supplied = Buffer.from(token);
  const expected = Buffer.from(secret);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    await recordLoginEvent(req, { outcome: 'failed', remainingAttempts: rateLimit.remaining });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminSession = await createAdminSession();
  // Generate JWT with unique identifier and clean payload
  const jwt = signAdmin({ 
    jti: crypto.randomUUID(),
    session_id: adminSession.id,
    login_at: adminSession.loginAt,
  });
  await recordLoginEvent(req, { outcome: 'succeeded', adminSessionId: adminSession.id });
  
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
