import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  afterEach(() => {
    // A failed assertion must not leave the failure exit code behind for the next test.
    process.exitCode = undefined;
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

  it('keeps the exit code and writes a disconnect_failed event when closing the pool fails after an outbox drain', async () => {
    mocks.drainOutbox.mockResolvedValue({ claimed: 0, delivered: 0, failed: 0 });
    mocks.disconnect.mockRejectedValue(new Error('pool already closed'));

    await runWorker('../../scripts/drain-outbox');
    // The catch of disconnect() runs one microtask after the disconnect call that runWorker waits for.
    await vi.waitFor(() => expect(process.stderr.write).toHaveBeenCalledTimes(1));

    expect(process.exitCode).toBeUndefined();
    const errors = vi.mocked(process.stderr.write).mock.calls.map(([chunk]) => JSON.parse(String(chunk)) as unknown);
    expect(errors).toEqual([{ worker: 'outbox', status: 'disconnect_failed', error: 'pool already closed' }]);
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

  it('keeps the exit code and writes a disconnect_failed event when closing the pool fails after operational maintenance', async () => {
    mocks.evaluateOperationalAlerts.mockResolvedValue({ opened: 0, resolved: 0, evaluated: 4 });
    mocks.runRetention.mockResolvedValue({});
    mocks.syncAirbnbCalendar.mockResolvedValue({ status: 'failed', code: 'network' });
    mocks.disconnect.mockRejectedValue(new Error('pool already closed'));

    await runWorker('../../scripts/run-operational-maintenance');
    // The catch of disconnect() runs one microtask after the disconnect call that runWorker waits for.
    await vi.waitFor(() => expect(process.stderr.write).toHaveBeenCalledTimes(1));

    // A failed calendar sync is a result of the run, not a failure of it.
    expect(process.exitCode).toBeUndefined();
    const lines = vi.mocked(process.stdout.write).mock.calls.map(([chunk]) => String(chunk));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      worker: 'operations',
      alerts: { opened: 0, resolved: 0, evaluated: 4 },
      retention: {},
      calendar: { status: 'failed', code: 'network' },
      at: expect.any(String),
    });
    const errors = vi.mocked(process.stderr.write).mock.calls.map(([chunk]) => JSON.parse(String(chunk)) as unknown);
    expect(errors).toEqual([{ worker: 'operations', status: 'disconnect_failed', error: 'pool already closed' }]);
  });

  it('disconnects after failed operational maintenance', async () => {
    mocks.evaluateOperationalAlerts.mockRejectedValue(new Error('database unavailable'));
    mocks.runRetention.mockResolvedValue({});
    mocks.syncAirbnbCalendar.mockResolvedValue({ status: 'not_configured' });

    await runWorker('../../scripts/run-operational-maintenance');

    expect(process.exitCode).toBe(1);
  });

  it('syncs the calendar before it evaluates the alerts, so the stale-calendar rule reads the state this run leaves behind', async () => {
    let finishSync: (result: { status: 'synced'; blockedNights: number }) => void = () => undefined;
    mocks.syncAirbnbCalendar.mockReturnValue(new Promise<{ status: 'synced'; blockedNights: number }>((resolve) => { finishSync = resolve; }));
    mocks.evaluateOperationalAlerts.mockResolvedValue({ opened: 0, resolved: 0, evaluated: 4 });
    mocks.runRetention.mockResolvedValue({});

    vi.resetModules();
    await import('../../scripts/run-operational-maintenance');
    // Let every already-queued promise reaction run; the sync is still pending.
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(mocks.syncAirbnbCalendar).toHaveBeenCalledExactlyOnceWith({ trigger: 'scheduled' });
    expect(mocks.evaluateOperationalAlerts).not.toHaveBeenCalled();
    expect(mocks.runRetention).not.toHaveBeenCalled();

    finishSync({ status: 'synced', blockedNights: 3 });
    await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledTimes(1));

    expect(mocks.evaluateOperationalAlerts).toHaveBeenCalledTimes(1);
    expect(mocks.runRetention).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
    const lines = vi.mocked(process.stdout.write).mock.calls.map(([chunk]) => String(chunk));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      worker: 'operations',
      alerts: { opened: 0, resolved: 0, evaluated: 4 },
      retention: {},
      calendar: { status: 'synced', blockedNights: 3 },
      at: expect.any(String),
    });
  });

  it('waits for the other steps after a failed alert evaluation and still reports their results', async () => {
    let finishRetention: (counts: Record<string, number>) => void = () => undefined;
    mocks.evaluateOperationalAlerts.mockRejectedValue(new Error('database unavailable'));
    mocks.runRetention.mockReturnValue(new Promise<Record<string, number>>((resolve) => { finishRetention = resolve; }));
    mocks.syncAirbnbCalendar.mockResolvedValue({ status: 'not_configured' });

    vi.resetModules();
    await import('../../scripts/run-operational-maintenance');
    // The alert evaluation and the retention start once the calendar sync has settled.
    await vi.waitFor(() => expect(mocks.runRetention).toHaveBeenCalledTimes(1));
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
  });

  it('disconnects after a calendar sync database error and keeps the failure exit code', async () => {
    mocks.evaluateOperationalAlerts.mockResolvedValue({ opened: 0, resolved: 0, evaluated: 4 });
    mocks.runRetention.mockResolvedValue({});
    mocks.syncAirbnbCalendar.mockRejectedValue(new Error('database unavailable'));

    await runWorker('../../scripts/run-operational-maintenance');

    expect(process.exitCode).toBe(1);
  });

  it('still evaluates the alerts and runs the retention after a failed calendar sync, and reports all three results', async () => {
    mocks.evaluateOperationalAlerts.mockResolvedValue({ opened: 0, resolved: 0, evaluated: 4 });
    mocks.runRetention.mockResolvedValue({ sessions: 2 });
    mocks.syncAirbnbCalendar.mockRejectedValue(new Error('database unavailable'));

    await runWorker('../../scripts/run-operational-maintenance');

    expect(mocks.evaluateOperationalAlerts).toHaveBeenCalledTimes(1);
    expect(mocks.runRetention).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
    const lines = vi.mocked(process.stdout.write).mock.calls.map(([chunk]) => String(chunk));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      worker: 'operations',
      alerts: { opened: 0, resolved: 0, evaluated: 4 },
      retention: { sessions: 2 },
      calendar: { error: 'database unavailable' },
      at: expect.any(String),
    });
  });
});
