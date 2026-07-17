import type { NextRequest } from 'next/server';
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

function buildKeys(ip: string, options: RateLimitOptions): string[] {
  const dimensions = [`ip:${ip}`];
  if (options.identifier) dimensions.push(`identifier:${normalizeIdentifier(options.identifier)}`);
  return dimensions.map((dimension) => {
    const raw = `${options.scope}|${dimension}`;
    return `sensitive:${privacyHmac(raw, 'sensitive-rate-limit:v1')}`;
  });
}

export async function checkSensitiveRateLimit(
  request: NextRequest,
  options: RateLimitOptions,
): Promise<RateLimitDecision> {
  // Resolve identity before hashing a limiter dimension or importing Prisma.
  // Missing identity is an internal availability failure, never a shared
  // persistent identity bucket.
  const ip = requireCanonicalClientIp(request, { trustProxy: true });
  const keys = buildKeys(ip, options);
  const { prisma } = await import('@/lib/prisma');
  const resetAt = new Date(Date.now() + options.windowMs);
  const records = await Promise.all(keys.map(async (key) => {
    const rows = await prisma.$queryRaw<Array<{ count: number; reset_time: Date }>>`
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
    if (!record) throw new Error('Rate limiter did not return a decision');
    return record;
  }));
  return {
    allowed: records.every((record) => record.count <= options.limit),
    limit: options.limit,
    remaining: Math.min(...records.map((record) => Math.max(0, options.limit - record.count))),
    resetAt: new Date(Math.max(...records.map((record) => new Date(record.reset_time).getTime()))),
  };
}
