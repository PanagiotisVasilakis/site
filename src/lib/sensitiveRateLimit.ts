import type { NextRequest } from 'next/server';
import { ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { requireCanonicalClientIp } from '@/lib/net/clientIdentity';
import { normalizePhone } from '@/lib/phone';
import { privacyHmac } from '@/lib/privacyHash';

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

interface RateLimitOptions {
  scope: string;
  identifier?: string;
  limit: number;
  windowMs: number;
}

function normalizeIdentifier(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^\+?[0-9 ()-]+$/.test(normalized)) return normalized;
  const compact = normalized.replace(/[ ()-]/g, '');
  const phone = normalizePhone(normalized, !compact.startsWith('+') && compact.length === 10 ? 'GR' : undefined);
  return phone?.e164 ?? normalized;
}

function limiterKey(scope: string, dimension: string): string {
  return `sensitive:${privacyHmac(`${scope}|${dimension}`, 'sensitive-rate-limit:v1')}`;
}

function buildKeys(ip: string, options: RateLimitOptions): string[] {
  const dimensions = [`ip:${ip}`];
  if (options.identifier) dimensions.push(`identifier:${normalizeIdentifier(options.identifier)}`);
  return dimensions.map((dimension) => limiterKey(options.scope, dimension));
}

export async function checkSensitiveRateLimit(
  request: NextRequest,
  options: RateLimitOptions,
): Promise<RateLimitDecision> {
  // Resolve identity before hashing a limiter dimension or importing Prisma.
  // Missing identity is an internal availability failure, never a shared
  // persistent identity bucket.
  const ip = requireCanonicalClientIp(request);
  const keys = buildKeys(ip, options);
  const resetAt = new Date(Date.now() + options.windowMs);
  let records: Array<{ count: number; reset_time: Date }>;
  try {
    const { prisma } = await import('@/lib/prisma');
    records = await prisma.$transaction(async (tx) => Promise.all(keys.map(async (key) => {
      const rows = await tx.$queryRaw<Array<{ count: number; reset_time: Date }>>`
        INSERT INTO "rate_limits" ("key", "count", "reset_time")
        VALUES (${key}, 1, ${resetAt})
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE
            WHEN "rate_limits"."reset_time" <= CURRENT_TIMESTAMP THEN 1
            ELSE "rate_limits"."count" + 1
          END,
          "reset_time" = CASE
            WHEN "rate_limits"."reset_time" <= CURRENT_TIMESTAMP THEN EXCLUDED."reset_time"
            ELSE "rate_limits"."reset_time"
          END
        RETURNING "count", "reset_time"
      `;
      const record = rows[0];
      if (!record) throw new Error('missing limiter decision');
      return record;
    })), { timeout: 5_000 });
  } catch {
    // The transaction rolls back every limiter dimension before callers see a
    // generic fail-closed response. Never expose database diagnostics here.
    throw new ApiError(ApiErrorCode.SERVICE_UNAVAILABLE, 'Service temporarily unavailable');
  }
  return {
    allowed: records.every((record) => record.count <= options.limit),
    limit: options.limit,
    remaining: Math.min(...records.map((record) => Math.max(0, options.limit - record.count))),
    resetAt: new Date(Math.max(...records.map((record) => new Date(record.reset_time).getTime()))),
  };
}

/**
 * Gives back the attempt that a successful operation (e.g. a correct sign-in) counted on the
 * identifier dimension, so legitimate use never locks an account out; failed attempts keep counting.
 * The client-address dimension is not refunded: it keeps limiting guesses spread over many identifiers,
 * which a caller could otherwise offset with successful operations on an account of its own.
 */
export async function refundSensitiveIdentifierAttempt(options: { scope: string; identifier: string }): Promise<void> {
  const key = limiterKey(options.scope, `identifier:${normalizeIdentifier(options.identifier)}`);
  const { prisma } = await import('@/lib/prisma');
  await prisma.$executeRaw`
    UPDATE "rate_limits" SET "count" = GREATEST("count" - 1, 0)
    WHERE "key" = ${key} AND "reset_time" > CURRENT_TIMESTAMP
  `;
}
