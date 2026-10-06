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
  __prismaShutdownHooksRegistered__?: boolean;
};

const prismaGlobal = globalThis as PrismaGlobal;
const originalArgv = process.argv;

async function loadPrismaModule(argv: string[]) {
  process.argv = argv;
  vi.resetModules();
  await import('@/lib/prisma');
}

function registeredProcessEvents(): string[] {
  return vi.mocked(process.once).mock.calls.map(([event]) => String(event));
}

describe('prisma client lifecycle', () => {
  beforeEach(() => {
    delete prismaGlobal.__prisma__;
    delete prismaGlobal.__prismaShutdownHooksRegistered__;
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@127.0.0.1:5432/app');
    vi.stubEnv('NEXT_RUNTIME', '');
    vi.stubEnv('PRISMA_AUTO_DISCONNECT', '');
    mocks.disconnect.mockResolvedValue(undefined);
    vi.spyOn(process, 'once').mockReturnValue(process);
  });

  afterEach(() => {
    process.argv = originalArgv;
    delete prismaGlobal.__prisma__;
    delete prismaGlobal.__prismaShutdownHooksRegistered__;
    vi.useRealTimers();
  });

  it('registers shutdown hooks whatever the script path or runner looks like', async () => {
    await loadPrismaModule(['/usr/bin/node', '/srv/site-env/node_modules/.bin/tsx', 'scripts/drain-outbox.ts']);

    expect(registeredProcessEvents()).toEqual(expect.arrayContaining(['beforeExit', 'SIGINT', 'SIGTERM']));
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
