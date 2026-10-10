import crypto from 'node:crypto';

import { CALENDAR_STALE_ALERT_MINUTES, GUEST_DATA_RETENTION_MONTHS } from '@/data/stayPolicy';
import { CALENDAR_SYNC_STATE_ID } from '@/lib/availability/calendarSync';
import { prisma } from '@/lib/prisma';
import { eraseGuestForRetention } from '@/lib/privacyService';

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

const ONE_YEAR_MINUTES = 525_600;

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
  {
    name: 'Stale availability calendar',
    description: 'The Airbnb calendar has not synced successfully for more than three hours.',
    metricName: 'availability.calendar.stale_minutes',
    comparison: 'gt',
    threshold: CALENDAR_STALE_ALERT_MINUTES,
    windowMinutes: 5,
    severity: 'high',
    // 0 while no calendar is configured; a missing state row reads as the cap.
    read: async () => {
      if (!process.env.AIRBNB_ICAL_URL) return 0;
      const state = await prisma.calendarSyncState.findUnique({
        where: { id: CALENDAR_SYNC_STATE_ID },
        select: { lastSuccessAt: true, createdAt: true },
      });
      if (!state) return ONE_YEAR_MINUTES;
      const since = state.lastSuccessAt ?? state.createdAt;
      return Math.min(ONE_YEAR_MINUTES, Math.max(0, (Date.now() - since.getTime()) / 60_000));
    },
  },
];

function breached(value: number, comparison: RuleDefinition['comparison'], threshold: number): boolean {
  if (comparison === 'gt') return value > threshold;
  if (comparison === 'gte') return value >= threshold;
  if (comparison === 'lt') return value < threshold;
  return value <= threshold;
}

async function notifyAlert(input: {
  url: string;
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
  // The workers never run the environment schema, so the production HTTPS rule is enforced here, before the bearer token is attached.
  if (process.env.NODE_ENV === 'production' && new URL(input.url).protocol !== 'https:') {
    throw new Error('ALERT_WEBHOOK_URL must use HTTPS in production');
  }
  const headers: HeadersInit = { 'content-type': 'application/json' };
  if (process.env.ALERT_WEBHOOK_TOKEN) headers.authorization = `Bearer ${process.env.ALERT_WEBHOOK_TOKEN}`;
  const response = await fetch(input.url, {
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
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Alert webhook responded with ${response.status}`);
}

export async function evaluateOperationalAlerts(): Promise<{ opened: number; resolved: number; evaluated: number }> {
  let opened = 0;
  let resolved = 0;
  const notificationFailures: Error[] = [];
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;

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
      if (!alert.notificationDeliveredAt && webhookUrl) {
        try {
          await notifyAlert({ url: webhookUrl, id: alert.id, rule, value, openedAt: alert.openedAt });
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

// Guests erased per operations run (every 5 minutes), so one run stays short.
const RETENTION_ERASURE_BATCH = 25;
const RETENTION_ERASURE_NOTE =
  `Automatic retention: every booking of this guest ended more than ${GUEST_DATA_RETENTION_MONTHS} months ago.`;

export async function runRetention(): Promise<Record<string, number>> {
  const now = Date.now();
  const days = (value: number) => new Date(now - value * 86_400_000);
  const guestDataCutoff = new Date(now);
  guestDataCutoff.setUTCMonth(guestDataCutoff.getUTCMonth() - GUEST_DATA_RETENTION_MONTHS);
  const [
    rateLimits, sessions, tokens, families, grants, securityEvents, outbox, deadOutbox, adminSessions,
    checkInRequestsRedacted,
  ] = await prisma.$transaction([
    prisma.rateLimit.deleteMany({ where: { resetTime: { lt: new Date() } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: days(7) } } }),
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: days(30) } } }),
    prisma.refreshTokenFamily.deleteMany({ where: { absoluteExpiresAt: { lt: days(30) } } }),
    prisma.bookingClaimGrant.deleteMany({ where: { expiresAt: { lt: days(30) } } }),
    prisma.securityAuditEvent.deleteMany({ where: { occurredAt: { lt: days(90) } } }),
    prisma.outboxEvent.deleteMany({ where: { status: 'DELIVERED', deliveredAt: { lt: days(30) } } }),
    // Erasure-cancelled events at once; failed deliveries after 30 days (until
    // then the admin can retry them).
    prisma.outboxEvent.deleteMany({
      where: { OR: [ERASURE_CANCELLED_OUTBOX, { status: 'DEAD', updatedAt: { lt: days(30) } }] },
    }),
    // Longer than claim-grant retention, so issued grants keep their admin-session link while they exist.
    prisma.adminSession.deleteMany({ where: { absoluteExpiresAt: { lt: days(90) } } }),
    // Same fields as a guest erasure clears; rows already redacted are not rewritten.
    prisma.checkInRequest.updateMany({
      where: {
        booking: { endDate: { lt: guestDataCutoff } },
        OR: [
          { guestName: { not: null } },
          { guestEmail: { not: null } },
          { guestPhone: { not: null } },
          { message: { not: null } },
        ],
      },
      data: { guestName: null, guestEmail: null, guestPhone: null, message: null },
    }),
  ]);

  // Accounts go through the same audited erasure as a manual one (privacy request,
  // audit event, outbox cancellation, booking unlink). `some` keeps accounts without
  // bookings out: `every` alone is true for them.
  const expiredGuests = await prisma.user.findMany({
    where: { bookings: { some: {}, every: { endDate: { lt: guestDataCutoff } } } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: RETENTION_ERASURE_BATCH,
  });
  let guestsErased = 0;
  let guestErasuresSkipped = 0;
  const erasureFailures: Error[] = [];
  for (const guest of expiredGuests) {
    try {
      // The erasure re-checks the cutoff in its transaction: a guest who claimed a new
      // booking after this findMany is skipped, not erased.
      if (await eraseGuestForRetention(guest.id, RETENTION_ERASURE_NOTE, guestDataCutoff)) guestsErased += 1;
      else guestErasuresSkipped += 1;
    } catch (error) {
      erasureFailures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (erasureFailures.length > 0) {
    throw new AggregateError(
      erasureFailures,
      `${erasureFailures.length} retention guest erasure(s) failed: ${erasureFailures.map((error) => error.message).join('; ')}`,
    );
  }

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
    checkInRequestsRedacted: checkInRequestsRedacted.count,
    guestsErased,
    guestErasuresSkipped,
  };
}
