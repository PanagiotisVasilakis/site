import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startRedirectingReceiver } from './support/redirecting-receiver';

type RuleFields = { name?: string; windowMinutes?: number; [field: string]: unknown };
type UpsertArgs = { where: { name: string }; create: RuleFields & { name: string }; update: RuleFields };
type StoredRule = RuleFields & { id: string; name: string; enabled: boolean; comparison: string; threshold: number };
type AlertCreate = { data: { id: string; ruleId: string; value: number } };
type AlertUpdate = { where: { id: string }; data: Record<string, unknown> };

const prismaMock = vi.hoisted(() => ({
  alertRule: { upsert: vi.fn<(args: UpsertArgs) => Promise<StoredRule>>() },
  alert: {
    findFirst: vi.fn(),
    create: vi.fn<(args: AlertCreate) => Promise<Record<string, unknown>>>(),
    update: vi.fn<(args: AlertUpdate) => Promise<Record<string, unknown>>>(),
  },
  outboxEvent: { count: vi.fn(), findFirst: vi.fn() },
  securityAuditEvent: { count: vi.fn() },
  calendarSyncState: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { evaluateOperationalAlerts } from '@/lib/operationalMonitor';

const NOW = new Date('2026-10-24T22:30:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe('evaluateOperationalAlerts', () => {
  beforeEach(() => {
    vi.stubEnv('ALERT_WEBHOOK_URL', '');
    vi.stubEnv('ALERT_WEBHOOK_REQUIRED', '0');
    vi.stubEnv('BOOKING_ICAL_URL', '');
    prismaMock.alertRule.upsert.mockImplementation(async ({ create }) => ({
      comparison: 'gt',
      threshold: 0,
      ...create,
      id: `rule:${create.name}`,
      enabled: true,
    }));
    prismaMock.$transaction.mockResolvedValue([0, 0]);
    prismaMock.outboxEvent.findFirst.mockResolvedValue(null);
    prismaMock.securityAuditEvent.count.mockResolvedValue(0);
    prismaMock.alert.findFirst.mockResolvedValue(null);
    prismaMock.alert.create.mockImplementation(async ({ data }) => ({ ...data, openedAt: NOW, notificationDeliveredAt: null }));
    prismaMock.alert.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
    prismaMock.calendarSyncState.findUnique.mockResolvedValue({ lastSuccessAt: minutesAgo(5), createdAt: minutesAgo(10_000) });
  });

  describe('webhook redirects and HTTPS enforcement', () => {
    const TOKEN = 'redirect-alert-token';
    let receiver: Awaited<ReturnType<typeof startRedirectingReceiver>> | undefined;

    beforeEach(() => {
      prismaMock.$transaction.mockResolvedValue([1, 0]);
    });
    afterEach(async () => {
      await receiver?.close();
      receiver = undefined;
    });

    it('records a 302 redirect as a failed notification and never requests the redirect target', async () => {
      receiver = await startRedirectingReceiver(302);
      vi.stubEnv('ALERT_WEBHOOK_URL', receiver.url);
      vi.stubEnv('ALERT_WEBHOOK_TOKEN', TOKEN);

      await expect(evaluateOperationalAlerts()).rejects.toThrow('1 operational alert notification(s) failed');

      expect(receiver.requests).toEqual(['POST /hook']);
      expect(prismaMock.alert.update).toHaveBeenCalledTimes(1);
      const { data } = prismaMock.alert.update.mock.calls[0][0];
      expect(data).not.toHaveProperty('notificationDeliveredAt');
      expect(data).toMatchObject({ notificationAttempts: { increment: 1 }, notificationLastError: expect.any(String) });
      expect(data.notificationLastError).not.toContain(receiver.host);
      expect(data.notificationLastError).not.toContain(TOKEN);
    });

    it('refuses an http:// URL in production before sending the alert or its token', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('ALERT_WEBHOOK_URL', 'http://alerts.example.test/hook');
      vi.stubEnv('ALERT_WEBHOOK_TOKEN', TOKEN);

      await expect(evaluateOperationalAlerts()).rejects.toThrow('1 operational alert notification(s) failed');

      expect(fetchMock).not.toHaveBeenCalled();
      expect(prismaMock.alert.update.mock.calls[0][0].data).toMatchObject({
        notificationAttempts: { increment: 1 },
        notificationLastError: 'ALERT_WEBHOOK_URL must use HTTPS in production',
      });
    });

    it('sends the alert over HTTPS in production', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('ALERT_WEBHOOK_URL', 'https://alerts.example.test/hook');
      vi.stubEnv('ALERT_WEBHOOK_TOKEN', TOKEN);

      await expect(evaluateOperationalAlerts()).resolves.toMatchObject({ opened: 1 });

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://alerts.example.test/hook', expect.anything());
      expect(prismaMock.alert.update.mock.calls[0][0].data).toMatchObject({
        notificationDeliveredAt: expect.any(Date),
        notificationLastError: null,
      });
    });
  });

  describe('stale availability calendar rule', () => {
    const RULE = 'Stale availability calendar';
    const RULE_ID = `rule:${RULE}`;

    const openedValue = (): number | null => {
      const call = prismaMock.alert.create.mock.calls.find(([args]) => args.data.ruleId === RULE_ID);
      return call ? call[0].data.value : null;
    };

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      vi.stubEnv('BOOKING_ICAL_URL', 'https://ical.booking.com/v1/export?t=token');
    });
    afterEach(() => vi.useRealTimers());

    it('is registered like the other rules and counted as evaluated', async () => {
      await expect(evaluateOperationalAlerts()).resolves.toEqual({ opened: 0, resolved: 0, evaluated: 4 });

      const registration = prismaMock.alertRule.upsert.mock.calls.find(([args]) => args.where.name === RULE);
      expect(registration?.[0].create).toEqual({
        id: expect.any(String),
        name: RULE,
        description: expect.any(String),
        metricName: 'availability.calendar.stale_minutes',
        comparison: 'gt',
        threshold: 180,
        windowMinutes: 5,
        severity: 'high',
      });
    });

    it.each([
      ['unset', undefined],
      ['empty', ''],
    ])('reads 0 without a database read when the calendar URL is %s', async (_label, value) => {
      vi.stubEnv('BOOKING_ICAL_URL', value);
      prismaMock.calendarSyncState.findUnique.mockResolvedValue({ lastSuccessAt: null, createdAt: minutesAgo(525_600 * 3) });
      prismaMock.alert.findFirst.mockImplementation(async ({ where }: { where: { ruleId: string } }) => (
        where.ruleId === RULE_ID ? { id: 'open-stale-alert' } : null
      ));

      await expect(evaluateOperationalAlerts()).resolves.toEqual({ opened: 0, resolved: 1, evaluated: 4 });

      expect(prismaMock.calendarSyncState.findUnique).not.toHaveBeenCalled();
      expect(openedValue()).toBeNull();
      expect(prismaMock.alert.update).toHaveBeenCalledWith({
        where: { id: 'open-stale-alert' },
        data: { status: 'RESOLVED', resolvedAt: expect.any(Date) },
      });
    });

    it('does not alert while the last success is within 180 minutes', async () => {
      prismaMock.calendarSyncState.findUnique.mockResolvedValue({ lastSuccessAt: minutesAgo(180), createdAt: minutesAgo(10_000) });

      await evaluateOperationalAlerts();

      expect(openedValue()).toBeNull();
    });

    it('opens a high alert once last success is older than 180 minutes and falls back to createdAt or 1-year cap', async () => {
      prismaMock.calendarSyncState.findUnique.mockResolvedValue({ lastSuccessAt: minutesAgo(181), createdAt: minutesAgo(10_000) });
      await expect(evaluateOperationalAlerts()).resolves.toEqual({ opened: 1, resolved: 0, evaluated: 4 });
      expect(openedValue()).toBe(181);

      prismaMock.alert.create.mockClear();
      prismaMock.calendarSyncState.findUnique.mockResolvedValue({ lastSuccessAt: null, createdAt: minutesAgo(240) });
      await evaluateOperationalAlerts();
      expect(openedValue()).toBe(240);

      prismaMock.alert.create.mockClear();
      prismaMock.calendarSyncState.findUnique.mockResolvedValue({ lastSuccessAt: minutesAgo(525_600 * 3), createdAt: minutesAgo(525_600 * 4) });
      await evaluateOperationalAlerts();
      expect(openedValue()).toBe(525_600);

      prismaMock.alert.create.mockClear();
      prismaMock.calendarSyncState.findUnique.mockResolvedValue(null);
      await evaluateOperationalAlerts();
      expect(openedValue()).toBe(525_600);
    });
  });

  describe('recent high-severity security events rule window', () => {
    const RULE = 'Recent high-severity security events';
    const TEN_MINUTES_AGO = new Date(NOW.getTime() - 10 * 60_000);
    const DESCRIPTION = 'High or critical security audit events were recorded in the last ten minutes.';

    const upsertFor = (name: string): UpsertArgs => {
      const call = prismaMock.alertRule.upsert.mock.calls.find(([args]) => args.where.name === name);
      if (!call) throw new Error(`rule not upserted: ${name}`);
      return call[0];
    };

    const installRuleTable = (stored: Map<string, StoredRule>) => {
      prismaMock.alertRule.upsert.mockImplementation(async ({ where, create, update }) => {
        const existing = stored.get(where.name);
        const row: StoredRule = existing
          ? { ...existing, ...update }
          : { ...create, id: `rule:${create.name}`, enabled: true, comparison: 'gt', threshold: 0 };
        stored.set(where.name, row);
        return row;
      });
    };

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      installRuleTable(new Map());
    });
    afterEach(() => vi.useRealTimers());

    it('creates and updates the rule with a ten-minute window', async () => {
      await evaluateOperationalAlerts();

      expect(upsertFor(RULE).create).toEqual({
        id: expect.any(String),
        name: RULE,
        description: DESCRIPTION,
        metricName: 'security.high.count',
        comparison: 'gt',
        threshold: 0,
        windowMinutes: 10,
        severity: 'high',
      });
      expect(upsertFor(RULE).update).toEqual({
        description: DESCRIPTION,
        metricName: 'security.high.count',
        windowMinutes: 10,
      });
      expect(prismaMock.securityAuditEvent.count).toHaveBeenCalledWith({
        where: {
          severity: { in: ['high', 'critical'] },
          occurredAt: { gte: TEN_MINUTES_AGO },
        },
      });
    });

    it('keeps a ten-minute window even when an older five-minute row exists in the database', async () => {
      installRuleTable(new Map([[RULE, {
        id: `rule:${RULE}`,
        name: RULE,
        description: 'High or critical security audit events were recorded in the last five minutes.',
        metricName: 'security.high.count',
        comparison: 'gt',
        threshold: 0,
        windowMinutes: 5,
        enabled: true,
      }]]));

      await evaluateOperationalAlerts();

      expect(prismaMock.securityAuditEvent.count).toHaveBeenCalledWith({
        where: {
          severity: { in: ['high', 'critical'] },
          occurredAt: { gte: TEN_MINUTES_AGO },
        },
      });
    });
  });
});
