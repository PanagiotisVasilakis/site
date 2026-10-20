import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RuleFields = { name?: string; windowMinutes?: number; [field: string]: unknown };
type UpsertArgs = { where: { name: string }; create: RuleFields & { name: string }; update: RuleFields };
type StoredRule = RuleFields & { id: string; name: string; enabled: boolean; comparison: string; threshold: number };

const prismaMock = vi.hoisted(() => ({
  alertRule: { upsert: vi.fn<(args: UpsertArgs) => Promise<StoredRule>>() },
  alert: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  outboxEvent: { count: vi.fn(), findFirst: vi.fn() },
  securityAuditEvent: { count: vi.fn() },
  calendarSyncState: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { evaluateOperationalAlerts } from '@/lib/operationalMonitor';

const RULE = 'Recent high-severity security events';
const NOW = new Date('2026-10-24T22:30:00.000Z');
const TEN_MINUTES_AGO = new Date(NOW.getTime() - 10 * 60_000);
const DESCRIPTION = 'High or critical security audit events were recorded in the last ten minutes.';

/** The upsert arguments of one rule of the evaluation under test. */
function upsertFor(name: string): UpsertArgs {
  const call = prismaMock.alertRule.upsert.mock.calls.find(([args]) => args.where.name === name);
  if (!call) throw new Error(`rule not upserted: ${name}`);
  return call[0];
}

/** Behaves like the alert_rules table: the update branch changes an existing row, the create branch inserts one. */
function installRuleTable(stored: Map<string, StoredRule>) {
  prismaMock.alertRule.upsert.mockImplementation(async ({ where, create, update }) => {
    const existing = stored.get(where.name);
    const row: StoredRule = existing
      ? { ...existing, ...update }
      : { ...create, id: `rule:${create.name}`, enabled: true, comparison: 'gt', threshold: 0 };
    stored.set(where.name, row);
    return row;
  });
}

describe('recent high-severity security events alert window', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('ALERT_WEBHOOK_URL', '');
    vi.stubEnv('ALERT_WEBHOOK_REQUIRED', '0');
    vi.stubEnv('BOOKING_ICAL_URL', '');
    // Every rule reads a healthy value.
    prismaMock.$transaction.mockResolvedValue([0, 0]);
    prismaMock.outboxEvent.findFirst.mockResolvedValue(null);
    prismaMock.securityAuditEvent.count.mockResolvedValue(0);
    prismaMock.alert.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is created with a ten-minute window, twice the five-minute schedule', async () => {
    installRuleTable(new Map());

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
  });

  it('writes the window and the description in the update branch, so stored rows follow the code', async () => {
    installRuleTable(new Map());

    await evaluateOperationalAlerts();

    expect(upsertFor(RULE).update).toEqual({
      description: DESCRIPTION,
      metricName: 'security.high.count',
      windowMinutes: 10,
    });
  });

  it('keeps the update branch in step with the create branch for every rule', async () => {
    installRuleTable(new Map());

    await evaluateOperationalAlerts();

    expect(prismaMock.alertRule.upsert).toHaveBeenCalledTimes(4);
    for (const [args] of prismaMock.alertRule.upsert.mock.calls) {
      expect(args.update.windowMinutes).toBe(args.create.windowMinutes);
    }
  });

  it('counts a ten-minute window on a fresh database', async () => {
    installRuleTable(new Map());

    await evaluateOperationalAlerts();

    expect(prismaMock.securityAuditEvent.count).toHaveBeenCalledTimes(1);
    expect(prismaMock.securityAuditEvent.count).toHaveBeenCalledWith({
      where: {
        severity: { in: ['high', 'critical'] },
        occurredAt: { gte: TEN_MINUTES_AGO },
      },
    });
  });

  it('counts a ten-minute window on a database that still stores the old five-minute row', async () => {
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
