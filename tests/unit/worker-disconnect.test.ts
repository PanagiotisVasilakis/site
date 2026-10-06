import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  drainOutbox: vi.fn(),
  evaluateOperationalAlerts: vi.fn(),
  runRetention: vi.fn(),
  syncAirbnbCalendar: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { $disconnect: mocks.disconnect } }));
vi.mock('@/lib/bookingOutbox', () => ({ drainOutbox: mocks.drainOutbox }));
vi.mock('@/lib/operationalMonitor', () => ({
  evaluateOperationalAlerts: mocks.evaluateOperationalAlerts,
  runRetention: mocks.runRetention,
}));
vi.mock('@/lib/availability/calendarSync', () => ({ syncAirbnbCalendar: mocks.syncAirbnbCalendar }));

// Each worker runs main() when imported; wait until it has disconnected.
async function runWorker(path: string) {
  vi.resetModules();
  await import(path);
  await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledTimes(1));
}

describe('worker processes close the database pool', () => {
  beforeEach(() => {
    process.exitCode = undefined;
    // The workers skip the disconnect when no client could have been created.
    vi.stubEnv('DATABASE_URL', 'postgresql://worker-disconnect.invalid/test');
    mocks.disconnect.mockResolvedValue(undefined);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  it('disconnects after a successful outbox drain', async () => {
    mocks.drainOutbox.mockResolvedValue({ claimed: 0, delivered: 0, failed: 0 });

    await runWorker('../../scripts/drain-outbox');

    expect(process.exitCode).toBeUndefined();
  });

  it('disconnects after a failed outbox drain and keeps the failure exit code', async () => {
    mocks.drainOutbox.mockRejectedValue(new Error('database unavailable'));

    await runWorker('../../scripts/drain-outbox');

    expect(process.exitCode).toBe(1);
  });

  it('disconnects after operational maintenance and reports the scheduled calendar sync', async () => {
    mocks.evaluateOperationalAlerts.mockResolvedValue({ opened: 0, resolved: 0, evaluated: 4 });
    mocks.runRetention.mockResolvedValue({});
    mocks.syncAirbnbCalendar.mockResolvedValue({ status: 'not_configured' });

    await runWorker('../../scripts/run-operational-maintenance');

    expect(process.exitCode).toBeUndefined();
    expect(mocks.syncAirbnbCalendar).toHaveBeenCalledExactlyOnceWith({ trigger: 'scheduled' });
    const lines = vi.mocked(process.stdout.write).mock.calls.map(([chunk]) => String(chunk));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      worker: 'operations',
      alerts: { opened: 0, resolved: 0, evaluated: 4 },
      retention: {},
      calendar: { status: 'not_configured' },
      at: expect.any(String),
    });
  });

  it('disconnects after failed operational maintenance', async () => {
    mocks.evaluateOperationalAlerts.mockRejectedValue(new Error('database unavailable'));
    mocks.runRetention.mockResolvedValue({});
    mocks.syncAirbnbCalendar.mockResolvedValue({ status: 'not_configured' });

    await runWorker('../../scripts/run-operational-maintenance');

    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it('waits for the other steps after a failed alert evaluation and still reports their results', async () => {
    let finishRetention: (counts: Record<string, number>) => void = () => undefined;
    mocks.evaluateOperationalAlerts.mockRejectedValue(new Error('database unavailable'));
    mocks.runRetention.mockReturnValue(new Promise<Record<string, number>>((resolve) => { finishRetention = resolve; }));
    mocks.syncAirbnbCalendar.mockResolvedValue({ status: 'not_configured' });

    vi.resetModules();
    await import('../../scripts/run-operational-maintenance');
    expect(mocks.runRetention).toHaveBeenCalledTimes(1);
    // Let every already-queued promise reaction run; retention is still pending.
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(mocks.disconnect).not.toHaveBeenCalled();

    finishRetention({ sessions: 2, rateLimits: 5 });
    await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledTimes(1));

    expect(process.exitCode).toBe(1);
    const lines = vi.mocked(process.stdout.write).mock.calls.map(([chunk]) => String(chunk));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      worker: 'operations',
      alerts: { error: 'database unavailable' },
      retention: { sessions: 2, rateLimits: 5 },
      calendar: { status: 'not_configured' },
      at: expect.any(String),
    });
    const errors = vi.mocked(process.stderr.write).mock.calls.map(([chunk]) => JSON.parse(String(chunk)) as unknown);
    expect(errors).toEqual([{ worker: 'operations', status: 'failed', error: expect.stringContaining('database unavailable') }]);
    process.exitCode = undefined;
  });

  it('disconnects after a calendar sync database error and keeps the failure exit code', async () => {
    mocks.evaluateOperationalAlerts.mockResolvedValue({ opened: 0, resolved: 0, evaluated: 4 });
    mocks.runRetention.mockResolvedValue({});
    mocks.syncAirbnbCalendar.mockRejectedValue(new Error('database unavailable'));

    await runWorker('../../scripts/run-operational-maintenance');

    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });
});
