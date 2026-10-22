import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  evaluateOperationalAlerts: vi.fn(),
  runRetention: vi.fn(),
  syncBookingCalendar: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { $disconnect: mocks.disconnect } }));
vi.mock('@/lib/operationalMonitor', () => ({
  evaluateOperationalAlerts: mocks.evaluateOperationalAlerts,
  runRetention: mocks.runRetention,
}));
vi.mock('@/lib/availability/calendarSync', () => ({ syncBookingCalendar: mocks.syncBookingCalendar }));

describe('operations worker when a retention step failed', () => {
  beforeEach(() => {
    process.exitCode = undefined;
    vi.stubEnv('DATABASE_URL', 'postgresql://worker-retention.invalid/test');
    mocks.disconnect.mockResolvedValue(undefined);
    mocks.evaluateOperationalAlerts.mockResolvedValue({ opened: 0, resolved: 0, evaluated: 4 });
    mocks.syncBookingCalendar.mockResolvedValue({ status: 'synced', blockedNights: 3 });
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    // A failed assertion must not leave the failure exit code behind for the next test.
    process.exitCode = undefined;
  });

  it('exits non-zero, names the failed steps in the result line and still reports the other results', async () => {
    mocks.runRetention.mockRejectedValue(new AggregateError(
      [new Error('deadlock detected')],
      '1 retention step(s) failed: rateLimits: deadlock detected',
    ));

    vi.resetModules();
    await import('../../scripts/run-operational-maintenance');
    await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledTimes(1));

    // The host heartbeat watches this exit code.
    expect(process.exitCode).toBe(1);
    const lines = vi.mocked(process.stdout.write).mock.calls.map(([chunk]) => String(chunk));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      worker: 'operations',
      alerts: { opened: 0, resolved: 0, evaluated: 4 },
      retention: { error: '1 retention step(s) failed: rateLimits: deadlock detected' },
      calendar: { status: 'synced', blockedNights: 3 },
      at: expect.any(String),
    });
    const errors = vi.mocked(process.stderr.write).mock.calls.map(([chunk]) => JSON.parse(String(chunk)) as unknown);
    expect(errors).toEqual([{
      worker: 'operations',
      status: 'failed',
      error: expect.stringContaining('1 retention step(s) failed: rateLimits: deadlock detected'),
    }]);
  });

  it('exits zero when every retention step worked', async () => {
    mocks.runRetention.mockResolvedValue({ rateLimits: 1, checkInRequestsRedacted: 2 });

    vi.resetModules();
    await import('../../scripts/run-operational-maintenance');
    await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledTimes(1));

    expect(process.exitCode).toBeUndefined();
  });
});
