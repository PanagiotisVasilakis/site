import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getClientIp } from '@/lib/net/getClientIp';

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

const testStore = new Map<string, { count: number; resetAt: Date }>();

function buildKey(request: NextRequest, options: RateLimitOptions): string {
  const ip = getClientIp(request, { trustProxy: true });
  const raw = `${options.scope}|${ip}|${options.identifier || 'anonymous'}`;
  return `sensitive:${crypto.createHash('sha256').update(raw).digest('hex')}`;
}

function inMemoryDecision(key: string, options: RateLimitOptions): RateLimitDecision {
  const now = Date.now();
  const current = testStore.get(key);
  const record = !current || current.resetAt.getTime() <= now
    ? { count: 1, resetAt: new Date(now + options.windowMs) }
    : { count: current.count + 1, resetAt: current.resetAt };
  testStore.set(key, record);
  return {
    allowed: record.count <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - record.count),
    resetAt: record.resetAt,
  };
}

export async function checkSensitiveRateLimit(
  request: NextRequest,
  options: RateLimitOptions,
): Promise<RateLimitDecision> {
  const key = buildKey(request, options);
  if (process.env.NODE_ENV === 'test') return inMemoryDecision(key, options);

  const { prisma } = await import('@/lib/prisma');
  const resetAt = new Date(Date.now() + options.windowMs);
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
  return {
    allowed: record.count <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - record.count),
    resetAt: new Date(record.reset_time),
  };
}

export function clearSensitiveRateLimitTestStore(): void {
  testStore.clear();
}
