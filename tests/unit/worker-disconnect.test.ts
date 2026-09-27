import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  drainOutbox: vi.fn(),
  evaluateOperationalAlerts: vi.fn(),
  runRetention: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { $disconnect: mocks.disconnect } }));
vi.mock('@/lib/bookingOutbox', () => ({ drainOutbox: mocks.drainOutbox }));
vi.mock('@/lib/operationalMonitor', () => ({
  evaluateOperationalAlerts: mocks.evaluateOperationalAlerts,
  runRetention: mocks.runRetention,
}));

// Each worker runs main() when imported; wait until it has disconnected.
async function runWorker(path: string) {
  vi.resetModules();
  await import(path);
  await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledTimes(1));
}

describe('worker processes close the database pool', () => {
  beforeEach(() => {
    process.exitCode = undefined;
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

  it('disconnects after operational maintenance', async () => {
    mocks.evaluateOperationalAlerts.mockResolvedValue([]);
    mocks.runRetention.mockResolvedValue({});

    await runWorker('../../scripts/run-operational-maintenance');

    expect(process.exitCode).toBeUndefined();
  });

  it('disconnects after failed operational maintenance', async () => {
    mocks.evaluateOperationalAlerts.mockRejectedValue(new Error('database unavailable'));
    mocks.runRetention.mockResolvedValue({});

    await runWorker('../../scripts/run-operational-maintenance');

    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });
});
