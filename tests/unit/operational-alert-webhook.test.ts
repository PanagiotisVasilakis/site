import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

// An in-process receiver on an ephemeral loopback port: `/hook` answers with a
// redirect to `/moved`, which would answer 200. It records every request, so a
// test can prove the redirect target was never contacted.
async function startRedirectingReceiver(redirectStatus: number) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    request.resume();
    if (request.url === '/hook') response.writeHead(redirectStatus, { location: '/moved' }).end();
    else response.writeHead(200).end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: `http://${host}/hook`,
    host,
    requests,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

describe('operational alert webhook redirects', () => {
  const TOKEN = 'redirect-alert-token';
  let receiver: Awaited<ReturnType<typeof startRedirectingReceiver>> | undefined;

  beforeEach(() => {
    // Keeps the calendar staleness rule at 0 whatever the shell exports.
    vi.stubEnv('AIRBNB_ICAL_URL', '');
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
