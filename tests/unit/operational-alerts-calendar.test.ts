import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RuleCreate = { name: string; [field: string]: unknown };
type AlertCreate = { data: { id: string; ruleId: string; value: number } };

const prismaMock = vi.hoisted(() => ({
  alertRule: { upsert: vi.fn<(args: { where: { name: string }; create: RuleCreate }) => Promise<Record<string, unknown>>>() },
  alert: {
    findFirst: vi.fn(),
    create: vi.fn<(args: AlertCreate) => Promise<Record<string, unknown>>>(),
    update: vi.fn(),
  },
  outboxEvent: { count: vi.fn(), findFirst: vi.fn() },
  securityAuditEvent: { count: vi.fn() },
  calendarSyncState: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { evaluateOperationalAlerts } from '@/lib/operationalMonitor';

const RULE = 'Stale availability calendar';
const RULE_ID = `rule:${RULE}`;
const NOW = new Date('2026-10-24T22:30:00.000Z');
const FEED_URL = 'https://www.airbnb.com/calendar/ical/12345678.ics';
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

/** The value of the stale-calendar alert opened by this evaluation, or null when none was opened. */
function openedValue(): number | null {
  const call = prismaMock.alert.create.mock.calls.find(([args]) => args.data.ruleId === RULE_ID);
  return call ? call[0].data.value : null;
}

describe('stale availability calendar alert', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('ALERT_WEBHOOK_URL', '');
    vi.stubEnv('ALERT_WEBHOOK_REQUIRED', '0');
    vi.stubEnv('AIRBNB_ICAL_URL', FEED_URL);
    prismaMock.alertRule.upsert.mockImplementation(async ({ create }) => ({ ...create, id: `rule:${create.name}`, enabled: true }));
    // Every other rule reads a healthy value.
    prismaMock.$transaction.mockResolvedValue([0, 0]);
    prismaMock.outboxEvent.findFirst.mockResolvedValue(null);
    prismaMock.securityAuditEvent.count.mockResolvedValue(0);
    prismaMock.alert.findFirst.mockResolvedValue(null);
    prismaMock.alert.create.mockImplementation(async ({ data }) => ({ ...data, openedAt: NOW, notificationDeliveredAt: null }));
    prismaMock.calendarSyncState.findUnique.mockResolvedValue({ lastSuccessAt: minutesAgo(5), createdAt: minutesAgo(10_000) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
    expect(prismaMock.calendarSyncState.findUnique).toHaveBeenCalledWith({
      where: { id: 'airbnb' },
      select: { lastSuccessAt: true, createdAt: true },
    });
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])('reads 0 without a database read when the calendar URL is %s', async (_label, value) => {
    vi.stubEnv('AIRBNB_ICAL_URL', value);
    prismaMock.calendarSyncState.findUnique.mockResolvedValue({ lastSuccessAt: null, createdAt: minutesAgo(525_600 * 3) });
    // An alert that is still open resolves once the metric reads 0.
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

  it('does not alert while the last success is recent', async () => {
    prismaMock.calendarSyncState.findUnique.mockResolvedValue({ lastSuccessAt: minutesAgo(180), createdAt: minutesAgo(10_000) });

    await evaluateOperationalAlerts();

    expect(openedValue()).toBeNull();
  });

  it('opens a high alert with the minutes since the last success once it is older than 180 minutes', async () => {
    prismaMock.calendarSyncState.findUnique.mockResolvedValue({ lastSuccessAt: minutesAgo(181), createdAt: minutesAgo(10_000) });

    await expect(evaluateOperationalAlerts()).resolves.toEqual({ opened: 1, resolved: 0, evaluated: 4 });

    expect(openedValue()).toBe(181);
  });

  it('measures from the row creation when the calendar never synced', async () => {
    prismaMock.calendarSyncState.findUnique.mockResolvedValue({ lastSuccessAt: null, createdAt: minutesAgo(240) });

    await evaluateOperationalAlerts();

    expect(openedValue()).toBe(240);
  });

  it('caps the value at one year', async () => {
    prismaMock.calendarSyncState.findUnique.mockResolvedValue({ lastSuccessAt: minutesAgo(525_600 * 3), createdAt: minutesAgo(525_600 * 4) });

    await evaluateOperationalAlerts();

    expect(openedValue()).toBe(525_600);
  });

  it('reads the cap when the seeded state row is missing', async () => {
    prismaMock.calendarSyncState.findUnique.mockResolvedValue(null);

    await evaluateOperationalAlerts();

    expect(openedValue()).toBe(525_600);
  });
});
