import crypto from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';

import { prisma } from '@/lib/prisma';

export type AnalyticsInput = {
  path: string;
  locale?: string;
  eventName?: string;
  properties?: Record<string, unknown>;
};

export type Vital = { name: string; value: number; id: string; ts: number };

export async function recordAnalyticsHits(hits: AnalyticsInput[]): Promise<number> {
  if (hits.length === 0) return 0;
  const result = await prisma.analyticsHit.createMany({
    data: hits.map((hit) => ({
      id: crypto.randomUUID(),
      path: hit.path,
      locale: hit.locale ?? null,
      eventName: hit.eventName ?? null,
      properties: hit.properties as Prisma.InputJsonObject | undefined,
    })),
  });
  return result.count;
}

export async function recordVital(input: Omit<Vital, 'ts'> & { path: string }): Promise<void> {
  await prisma.analyticsVital.create({
    data: {
      id: crypto.randomUUID(),
      name: input.name,
      value: input.value,
      path: input.path,
      metricId: input.id,
    },
  });
}

export async function topPaths(limit = 10, since?: number) {
  const rows = await prisma.analyticsHit.groupBy({
    by: ['path'],
    where: since ? { occurredAt: { gte: new Date(since) } } : undefined,
    _count: { _all: true },
    orderBy: { _count: { path: 'desc' } },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return rows.map((row) => ({ path: row.path, count: row._count._all }));
}

async function timeBuckets(unit: 'hour' | 'day', count: number) {
  const unitMs = unit === 'hour' ? 3_600_000 : 86_400_000;
  const currentStart = Math.floor(Date.now() / unitMs) * unitMs;
  const start = currentStart - (count - 1) * unitMs;
  const rows = unit === 'hour'
    ? await prisma.$queryRaw<Array<{ bucket: Date; count: bigint }>>`
        SELECT date_trunc('hour', "occurred_at") AS bucket, count(*)::bigint AS count
        FROM "analytics_hits"
        WHERE "occurred_at" >= ${new Date(start)}
        GROUP BY 1 ORDER BY 1
      `
    : await prisma.$queryRaw<Array<{ bucket: Date; count: bigint }>>`
        SELECT date_trunc('day', "occurred_at") AS bucket, count(*)::bigint AS count
        FROM "analytics_hits"
        WHERE "occurred_at" >= ${new Date(start)}
        GROUP BY 1 ORDER BY 1
      `;
  const values = new Map(rows.map((row) => [new Date(row.bucket).getTime(), Number(row.count)]));
  return Array.from({ length: count }, (_, index) => {
    const bucketStart = start + index * unitMs;
    return { start: bucketStart, count: values.get(bucketStart) ?? 0 };
  });
}

export const hourBuckets = (lastHours = 24) => timeBuckets('hour', Math.min(Math.max(lastHours, 1), 24 * 31));
export const dayBuckets = (lastDays = 30) => timeBuckets('day', Math.min(Math.max(lastDays, 1), 366));

export async function dailyNewPaths(lastDays = 30) {
  const count = Math.min(Math.max(lastDays, 1), 366);
  const dayMs = 86_400_000;
  const currentStart = Math.floor(Date.now() / dayMs) * dayMs;
  const start = currentStart - (count - 1) * dayMs;
  const rows = await prisma.$queryRaw<Array<{ bucket: Date; count: bigint }>>`
    SELECT date_trunc('day', first_seen) AS bucket, count(*)::bigint AS count
    FROM (
      SELECT "path", min("occurred_at") AS first_seen
      FROM "analytics_hits"
      GROUP BY "path"
    ) first_paths
    WHERE first_seen >= ${new Date(start)}
    GROUP BY 1 ORDER BY 1
  `;
  const values = new Map(rows.map((row) => [new Date(row.bucket).getTime(), Number(row.count)]));
  return Array.from({ length: count }, (_, index) => {
    const bucketStart = start + index * dayMs;
    return { start: bucketStart, new: values.get(bucketStart) ?? 0 };
  });
}

export async function analyticsStats() {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(DISTINCT "path")::bigint AS count FROM "analytics_hits"
  `;
  return { uniquePaths: Number(rows[0]?.count ?? 0) };
}

export async function vitalsSummary() {
  const rows = await prisma.$queryRaw<Array<{ name: string; avg: number; p90: number; count: bigint }>>`
    SELECT "name", avg("value")::float8 AS avg,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY "value")::float8 AS p90,
      count(*)::bigint AS count
    FROM "analytics_vitals"
    GROUP BY "name" ORDER BY "name"
  `;
  return rows.map((row) => ({ name: row.name, avg: row.avg, p90: row.p90, count: Number(row.count) }));
}

export async function vitalsRecent(limitPerMetric = 40): Promise<Record<string, Vital[]>> {
  const names = await prisma.analyticsVital.findMany({ distinct: ['name'], select: { name: true } });
  const grouped = await Promise.all(names.map(async ({ name }) => {
    const rows = await prisma.analyticsVital.findMany({
      where: { name },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(Math.max(limitPerMetric, 1), 100),
    });
    return [name, rows.reverse().map((row) => ({
      name: row.name,
      value: row.value,
      id: row.metricId || row.id,
      ts: row.occurredAt.getTime(),
    }))] as const;
  }));
  return Object.fromEntries(grouped);
}

export async function recentAnalytics(limit = 1000) {
  return prisma.analyticsHit.findMany({
    orderBy: { occurredAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 1000),
    select: { path: true, locale: true, eventName: true, occurredAt: true },
  });
}

export function rollingAverage(buckets: Array<{ start: number; count: number }>, window: number) {
  const queue: number[] = [];
  let sum = 0;
  return buckets.map((bucket) => {
    queue.push(bucket.count);
    sum += bucket.count;
    if (queue.length > window) sum -= queue.shift() ?? 0;
    return { ...bucket, avg: sum / queue.length };
  });
}

export function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
}
