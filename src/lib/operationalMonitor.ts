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
  read: (windowMinutes: number) => Promise<number>;
};

// A privacy erasure cancels undelivered events by marking them DEAD with the
// payload replaced by { redacted: true }; those are not delivery failures.
const ERASURE_CANCELLED_OUTBOX = { status: 'DEAD' as const, payload: { path: ['redacted'], equals: true } };

const RULES: RuleDefinition[] = [
  {
    name: 'Dead outbox events',
    description: 'At least one durable event exhausted all delivery attempts.',
    metricName: 'outbox.dead.count',
    comparison: 'gt',
    threshold: 0,
    windowMinutes: 5,
    severity: 'critical',
    read: async () => {
      const [dead, cancelled] = await prisma.$transaction([
        prisma.outboxEvent.count({ where: { status: 'DEAD' } }),
        prisma.outboxEvent.count({ where: ERASURE_CANCELLED_OUTBOX }),
      ]);
      return dead - cancelled;
    },
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
    read: (windowMinutes) => prisma.securityAuditEvent.count({
      where: {
        severity: { in: ['high', 'critical'] },
        occurredAt: { gte: new Date(Date.now() - windowMinutes * 60_000) },
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
  const notificationFailures: Error[] = [];

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

    const value = await definition.read(rule.windowMinutes);
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
          notificationFailures.push(error instanceof Error ? error : new Error(String(error)));
        }
      } else if (!alert.notificationDeliveredAt && process.env.ALERT_WEBHOOK_REQUIRED === '1') {
        notificationFailures.push(new Error('ALERT_WEBHOOK_URL is required but not configured'));
      }
    } else if (current) {
      await prisma.alert.update({
        where: { id: current.id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      resolved += 1;
    }
  }

  if (notificationFailures.length > 0) {
    throw new AggregateError(
      notificationFailures,
      `${notificationFailures.length} operational alert notification(s) failed: ${notificationFailures.map((error) => error.message).join('; ')}`,
    );
  }

  return { opened, resolved, evaluated: RULES.length };
}

export async function runRetention(): Promise<Record<string, number>> {
  const now = Date.now();
  const days = (value: number) => new Date(now - value * 86_400_000);
  const [rateLimits, sessions, tokens, families, grants, securityEvents, outbox, deadOutbox, adminSessions] = await prisma.$transaction([
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
    prisma.securityAuditEvent.deleteMany({ where: { occurredAt: { lt: days(90) } } }),
    prisma.outboxEvent.deleteMany({ where: { status: 'DELIVERED', deliveredAt: { lt: days(30) } } }),
    // Erasure-cancelled events at once; failed deliveries after 30 days (until
    // then the admin can retry them, or close the stay request).
    prisma.outboxEvent.deleteMany({
      where: { OR: [ERASURE_CANCELLED_OUTBOX, { status: 'DEAD', updatedAt: { lt: days(30) } }] },
    }),
    // Longer than claim-grant retention, so issued grants keep their admin-session link while they exist.
    prisma.adminSession.deleteMany({ where: { absoluteExpiresAt: { lt: days(90) } } }),
  ]);
  return {
    rateLimits: rateLimits.count,
    sessions: sessions.count,
    tokens: tokens.count,
    families: families.count,
    grants: grants.count,
    securityEvents: securityEvents.count,
    outbox: outbox.count,
    deadOutbox: deadOutbox.count,
    adminSessions: adminSessions.count,
  };
}
