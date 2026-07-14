import crypto from 'node:crypto';

import { prisma } from '@/lib/prisma';

type RuleDefinition = {
  name: string;
  description: string;
  metricName: string;
  comparison: 'gt' | 'gte' | 'lt' | 'lte';
  threshold: number;
  windowMinutes: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  read: () => Promise<number>;
};

const RULES: RuleDefinition[] = [
  {
    name: 'Dead outbox events',
    description: 'At least one durable event exhausted all delivery attempts.',
    metricName: 'outbox.dead.count',
    comparison: 'gt',
    threshold: 0,
    windowMinutes: 5,
    severity: 'critical',
    read: () => prisma.outboxEvent.count({ where: { status: 'DEAD' } }),
  },
  {
    name: 'Stale pending outbox',
    description: 'A pending event has waited more than fifteen minutes for delivery.',
    metricName: 'outbox.pending.oldest_minutes',
    comparison: 'gt',
    threshold: 15,
    windowMinutes: 5,
    severity: 'high',
    read: async () => {
      const oldest = await prisma.outboxEvent.findFirst({
        where: { status: { in: ['PENDING', 'LEASED'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      return oldest ? Math.max(0, (Date.now() - oldest.createdAt.getTime()) / 60_000) : 0;
    },
  },
  {
    name: 'Recent high-severity security events',
    description: 'High or critical security audit events were recorded in the last five minutes.',
    metricName: 'security.high.count',
    comparison: 'gt',
    threshold: 0,
    windowMinutes: 5,
    severity: 'high',
    read: () => prisma.securityAuditEvent.count({
      where: {
        severity: { in: ['high', 'critical'] },
        occurredAt: { gte: new Date(Date.now() - 5 * 60_000) },
      },
    }),
  },
];

function breached(value: number, comparison: RuleDefinition['comparison'], threshold: number): boolean {
  if (comparison === 'gt') return value > threshold;
  if (comparison === 'gte') return value >= threshold;
  if (comparison === 'lt') return value < threshold;
  return value <= threshold;
}

async function notifyAlert(input: {
  id: string;
  rule: {
    name: string;
    description: string;
    metricName: string;
    severity: string;
    threshold: number;
  };
  value: number;
  openedAt: Date;
}): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    if (process.env.ALERT_WEBHOOK_REQUIRED === '1') {
      throw new Error('ALERT_WEBHOOK_URL is required but not configured');
    }
    return;
  }
  const headers: HeadersInit = { 'content-type': 'application/json' };
  if (process.env.ALERT_WEBHOOK_TOKEN) headers.authorization = `Bearer ${process.env.ALERT_WEBHOOK_TOKEN}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      event: 'operational_alert.opened',
      alert: {
        id: input.id,
        name: input.rule.name,
        description: input.rule.description,
        metric: input.rule.metricName,
        severity: input.rule.severity,
        value: input.value,
        threshold: input.rule.threshold,
        openedAt: input.openedAt.toISOString(),
      },
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Alert webhook responded with ${response.status}`);
}

export async function evaluateOperationalAlerts(): Promise<{ opened: number; resolved: number; evaluated: number }> {
  let opened = 0;
  let resolved = 0;

  for (const definition of RULES) {
    const rule = await prisma.alertRule.upsert({
      where: { name: definition.name },
      create: {
        id: crypto.randomUUID(),
        name: definition.name,
        description: definition.description,
        metricName: definition.metricName,
        comparison: definition.comparison,
        threshold: definition.threshold,
        windowMinutes: definition.windowMinutes,
        severity: definition.severity,
      },
      update: {
        description: definition.description,
        metricName: definition.metricName,
      },
    });
    if (!rule.enabled) continue;

    const value = await definition.read();
    const current = await prisma.alert.findFirst({
      where: { ruleId: rule.id, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
    });
    if (breached(value, rule.comparison as RuleDefinition['comparison'], rule.threshold)) {
      const alert = current
        ? await prisma.alert.update({ where: { id: current.id }, data: { value } })
        : await prisma.alert.create({
          data: { id: crypto.randomUUID(), ruleId: rule.id, value },
        });
      if (!current) {
        opened += 1;
      }
      if (!alert.notificationDeliveredAt && process.env.ALERT_WEBHOOK_URL) {
        try {
          await notifyAlert({ id: alert.id, rule, value, openedAt: alert.openedAt });
          await prisma.alert.update({
            where: { id: alert.id },
            data: {
              notificationDeliveredAt: new Date(),
              notificationAttempts: { increment: 1 },
              notificationLastError: null,
            },
          });
        } catch (error) {
          await prisma.alert.update({
            where: { id: alert.id },
            data: {
              notificationAttempts: { increment: 1 },
              notificationLastError: (error instanceof Error ? error.message : String(error)).slice(0, 1_024),
            },
          });
          throw error;
        }
      } else if (!alert.notificationDeliveredAt && process.env.ALERT_WEBHOOK_REQUIRED === '1') {
        throw new Error('ALERT_WEBHOOK_URL is required but not configured');
      }
    } else if (current) {
      await prisma.alert.update({
        where: { id: current.id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      resolved += 1;
    }
  }

  return { opened, resolved, evaluated: RULES.length };
}

export async function runRetention(): Promise<Record<string, number>> {
  const now = Date.now();
  const days = (value: number) => new Date(now - value * 86_400_000);
  const analyticsDays = Math.max(1, Number.parseInt(process.env.ANALYTICS_RETENTION_DAYS || '30', 10));
  const [rateLimits, sessions, tokens, families, grants, analyticsHits, analyticsVitals, securityEvents, metrics, logs, outbox] = await prisma.$transaction([
    prisma.rateLimit.deleteMany({ where: { resetTime: { lt: new Date() } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: days(7) } } }),
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: days(30) } } }),
    prisma.refreshTokenFamily.deleteMany({ where: { absoluteExpiresAt: { lt: days(30) } } }),
    prisma.bookingClaimGrant.deleteMany({
      where: {
        expiresAt: { lt: days(30) },
        OR: [{ consumedAt: { not: null } }, { revokedAt: { not: null } }],
      },
    }),
    prisma.analyticsHit.deleteMany({ where: { occurredAt: { lt: days(analyticsDays) } } }),
    prisma.analyticsVital.deleteMany({ where: { occurredAt: { lt: days(analyticsDays) } } }),
    prisma.securityAuditEvent.deleteMany({ where: { occurredAt: { lt: days(90) } } }),
    prisma.metric.deleteMany({ where: { recordedAt: { lt: days(30) } } }),
    prisma.log.deleteMany({ where: { timestamp: { lt: days(30) } } }),
    prisma.outboxEvent.deleteMany({ where: { status: 'DELIVERED', deliveredAt: { lt: days(30) } } }),
  ]);
  return {
    rateLimits: rateLimits.count,
    sessions: sessions.count,
    tokens: tokens.count,
    families: families.count,
    grants: grants.count,
    analyticsHits: analyticsHits.count,
    analyticsVitals: analyticsVitals.count,
    securityEvents: securityEvents.count,
    metrics: metrics.count,
    logs: logs.count,
    outbox: outbox.count,
  };
}
