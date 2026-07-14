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

function buildKeys(request: NextRequest, options: RateLimitOptions): string[] {
  const ip = getClientIp(request, { trustProxy: true });
  const dimensions = [`ip:${ip}`];
  if (options.identifier) dimensions.push(`identifier:${options.identifier.trim().toLowerCase()}`);
  return dimensions.map((dimension) => {
    const raw = `${options.scope}|${dimension}`;
    return `sensitive:${crypto.createHash('sha256').update(raw).digest('hex')}`;
  });
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
  const keys = buildKeys(request, options);
  if (process.env.NODE_ENV === 'test') {
    const decisions = keys.map((key) => inMemoryDecision(key, options));
    return {
      allowed: decisions.every((decision) => decision.allowed),
      limit: options.limit,
      remaining: Math.min(...decisions.map((decision) => decision.remaining)),
      resetAt: new Date(Math.max(...decisions.map((decision) => decision.resetAt.getTime()))),
    };
  }

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

export function clearSensitiveRateLimitTestStore(): void {
  testStore.clear();
}
