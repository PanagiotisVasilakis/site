import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startRedirectingReceiver } from './support/redirecting-receiver';

type AlertUpdate = { where: { id: string }; data: Record<string, unknown> };

const prismaMock = vi.hoisted(() => ({
  alertRule: { upsert: vi.fn() },
  alert: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn<(args: AlertUpdate) => Promise<Record<string, unknown>>>(),
  },
  outboxEvent: { count: vi.fn(), findFirst: vi.fn() },
  securityAuditEvent: { count: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { evaluateOperationalAlerts } from '@/lib/operationalMonitor';

function arrangeDeadOutboxBreach() {
  // Keeps the calendar staleness rule at 0 whatever the shell exports.
  vi.stubEnv('BOOKING_ICAL_URL', '');
  prismaMock.alertRule.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ ...create, enabled: true }));
  // One DEAD outbox event that was not cancelled by an erasure: only the
  // "Dead outbox events" rule breaches.
  prismaMock.$transaction.mockResolvedValue([1, 0]);
  prismaMock.outboxEvent.findFirst.mockResolvedValue(null);
  prismaMock.securityAuditEvent.count.mockResolvedValue(0);
  prismaMock.alert.findFirst.mockResolvedValue(null);
  prismaMock.alert.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data,
    openedAt: new Date('2030-06-01T12:00:00.000Z'),
    notificationDeliveredAt: null,
  }));
  prismaMock.alert.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
}

describe('operational alert webhook request', () => {
  const TOKEN = 'request-alert-token';
  const fetchMock = vi.fn();

  beforeEach(() => {
    arrangeDeadOutboxBreach();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://alerts.example.test/hook');
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  });

  it('authenticates the alert with the bearer token and posts it as JSON', async () => {
    vi.stubEnv('ALERT_WEBHOOK_TOKEN', TOKEN);

    await expect(evaluateOperationalAlerts()).resolves.toMatchObject({ opened: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` });
    expect(JSON.parse(String(init.body))).toMatchObject({
      event: 'operational_alert.opened',
      alert: { name: 'Dead outbox events', metric: 'outbox.dead.count', severity: 'critical', value: 1, threshold: 0 },
    });
  });

  it('sends no authorization header while ALERT_WEBHOOK_TOKEN is empty', async () => {
    vi.stubEnv('ALERT_WEBHOOK_TOKEN', '');

    await expect(evaluateOperationalAlerts()).resolves.toMatchObject({ opened: 1 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('bounds the webhook call with a 5 second timeout', async () => {
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);

    await expect(evaluateOperationalAlerts()).resolves.toMatchObject({ opened: 1 });

    expect(timeout).toHaveBeenCalledExactlyOnceWith(5_000);
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBe(signal);
  });
});

describe('operational alert webhook redirects', () => {
  const TOKEN = 'redirect-alert-token';
  let receiver: Awaited<ReturnType<typeof startRedirectingReceiver>> | undefined;

  beforeEach(() => {
    arrangeDeadOutboxBreach();
  });
  afterEach(async () => {
    await receiver?.close();
    receiver = undefined;
  });

  it.each([302, 307])('records a %i redirect as a failed notification and never requests the redirect target', async (status) => {
    receiver = await startRedirectingReceiver(status);
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

  it.each([
    ['an http:// URL', 'http://alerts.example.test/hook', 'ALERT_WEBHOOK_URL must use HTTPS in production'],
    ['an unparsable URL', 'alerts.example.test/hook', 'Invalid URL'],
  ])('refuses %s in production before sending the alert or its token', async (_label, url, lastError) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALERT_WEBHOOK_URL', url);
    vi.stubEnv('ALERT_WEBHOOK_TOKEN', TOKEN);
    // Without the guard this receiver would accept the alert and the bearer token.
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    await expect(evaluateOperationalAlerts()).rejects.toThrow('1 operational alert notification(s) failed');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prismaMock.alert.update).toHaveBeenCalledTimes(1);
    const { data } = prismaMock.alert.update.mock.calls[0][0];
    expect(data).not.toHaveProperty('notificationDeliveredAt');
    expect(data).toMatchObject({ notificationAttempts: { increment: 1 }, notificationLastError: lastError });
  });

  it('still sends the alert over HTTPS in production', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://alerts.example.test/hook');
    vi.stubEnv('ALERT_WEBHOOK_TOKEN', TOKEN);
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    await expect(evaluateOperationalAlerts()).resolves.toMatchObject({ opened: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://alerts.example.test/hook');
    expect(prismaMock.alert.update.mock.calls[0][0].data).toMatchObject({ notificationDeliveredAt: expect.any(Date), notificationLastError: null });
  });
});
