import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('@/generated/prisma/client', () => ({
  PrismaClient: class {
    $on = mocks.on;
    $disconnect = mocks.disconnect;
  },
}));
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }));
vi.mock('@/lib/prismaPgConfig', () => ({ buildPrismaPgAdapterArgs: () => ({ config: {} }) }));
vi.mock('@/lib/logger-enterprise', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type PrismaGlobal = typeof globalThis & {
  __prisma__?: unknown;
};

const prismaGlobal = globalThis as PrismaGlobal;
const originalArgv = process.argv;
const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'] as const;

async function loadPrismaModule(argv: string[]) {
  process.argv = argv;
  vi.resetModules();
  await import('@/lib/prisma');
}

function signalListenerCounts(): Record<string, number> {
  return Object.fromEntries(shutdownSignals.map((signal) => [signal, process.listenerCount(signal)]));
}

describe('prisma client lifecycle', () => {
  beforeEach(() => {
    delete prismaGlobal.__prisma__;
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@127.0.0.1:5432/app');
    mocks.disconnect.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.argv = originalArgv;
    delete prismaGlobal.__prisma__;
    vi.useRealTimers();
  });

  // Next's standalone server owns the web process's signals and the workers disconnect explicitly;
  // a handler here that ends in process.exit() would cut off requests that are still in flight.
  it('registers no SIGINT, SIGTERM or SIGQUIT listener whatever the script path or runner looks like', async () => {
    const before = signalListenerCounts();

    await loadPrismaModule(['/usr/bin/node', '/srv/site-env/node_modules/.bin/tsx', 'scripts/drain-outbox.ts']);

    expect(signalListenerCounts()).toEqual(before);
  });

  it('does not disconnect on its own after query activity', async () => {
    vi.useFakeTimers();
    await loadPrismaModule(['/usr/bin/node', '/app/dist/workers/drain-outbox.mjs']);

    for (const [event, callback] of mocks.on.mock.calls) {
      if (event === 'query') {
        callback({ query: 'SELECT 1', duration: 1, params: '[]', target: 'db', timestamp: new Date() });
      }
    }
    await vi.advanceTimersByTimeAsync(10_000);

    expect(mocks.disconnect).not.toHaveBeenCalled();
  });
});
