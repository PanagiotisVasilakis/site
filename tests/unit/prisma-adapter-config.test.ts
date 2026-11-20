import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildPrismaPgAdapterArgs } from '@/lib/prismaPgConfig';

describe('Prisma PostgreSQL adapter configuration', () => {
  it('maps Prisma URL tuning parameters into bounded pg adapter options', () => {
    const result = buildPrismaPgAdapterArgs(
      'postgresql://user:pass@localhost:5432/app'
      + '?connection_limit=7&connect_timeout=9&max_idle_connection_lifetime=12'
      + '&max_connection_lifetime=60&statement_timeout=11000&query_timeout=12000'
      + '&lock_timeout=3000&schema=guest&sslmode=require',
    );
    expect(result.config).toMatchObject({
      max: 7,
      connectionTimeoutMillis: 9_000,
      idleTimeoutMillis: 12_000,
      maxLifetimeSeconds: 60,
      statement_timeout: 11_000,
      query_timeout: 12_000,
      lock_timeout: 3_000,
      options: '-c TimeZone=UTC',
    });
    if (typeof result.config === 'string' || !('connectionString' in result.config)) {
      throw new Error('Expected a pg PoolConfig');
    }
    expect(result.config.connectionString).toContain('sslmode=require');
    expect(result.config.connectionString).not.toContain('connection_limit');
    expect(result.config.connectionString).not.toContain('statement_timeout');
    expect(result.options).toEqual({ schema: 'guest' });
  });

  it('uses pool_timeout only when connect_timeout is absent', () => {
    expect(buildPrismaPgAdapterArgs('postgresql://localhost/app?pool_timeout=7').config)
      .toEqual(expect.objectContaining({ connectionTimeoutMillis: 7_000 }));
    expect(buildPrismaPgAdapterArgs('postgresql://localhost/app?pool_timeout=7&connect_timeout=3').config)
      .toEqual(expect.objectContaining({ connectionTimeoutMillis: 3_000 }));
  });

  it('ignores non-positive tuning values and retains safe defaults', () => {
    expect(buildPrismaPgAdapterArgs('postgresql://localhost/app?connection_limit=0&query_timeout=-1').config)
      .toEqual(expect.objectContaining({
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 300_000,
        statement_timeout: 20_000,
        query_timeout: 25_000,
        lock_timeout: 5_000,
      }));
  });

  it.each([
    ['statement_timeout', '5s'],
    ['statement_timeout', '1.5'],
    ['query_timeout', '30s'],
    ['lock_timeout', '2x'],
    ['connect_timeout', '10s'],
    ['pool_timeout', '1.5'],
    ['max_idle_connection_lifetime', '60s'],
    ['max_connection_lifetime', '60s'],
    ['connection_limit', '20x'],
  ])('falls back to the defaults for %s=%s (digits only, no units or fractions)', (param, value) => {
    const { config } = buildPrismaPgAdapterArgs(`postgresql://localhost/app?${param}=${value}`);
    expect(config).toEqual({
      connectionString: 'postgresql://localhost/app',
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 300_000,
      statement_timeout: 20_000,
      query_timeout: 25_000,
      lock_timeout: 5_000,
      options: '-c TimeZone=UTC',
    });
  });

  it('keeps safe defaults for an unparsable URL', () => {
    expect(buildPrismaPgAdapterArgs('not-a-url')).toEqual({
      config: {
        connectionString: 'not-a-url',
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 300_000,
        statement_timeout: 20_000,
        query_timeout: 25_000,
        lock_timeout: 5_000,
        options: '-c TimeZone=UTC',
      },
    });
  });

  it('refuses a URL that carries an options parameter without echoing it', () => {
    const base = 'postgresql://user:pass@localhost:5432/app';
    expect(() => buildPrismaPgAdapterArgs(`${base}?options=-c%20TimeZone%3DEurope%2FAthens&connection_limit=5`))
      .toThrow(new Error('DATABASE_URL must not carry an options parameter'));
    expect(buildPrismaPgAdapterArgs(`${base}?connection_limit=5`).config)
      .toEqual(expect.objectContaining({ options: '-c TimeZone=UTC' }));
  });
});

describe('prisma client lifecycle', () => {
  type PrismaGlobal = typeof globalThis & { __prisma__?: unknown };
  const prismaGlobal = globalThis as PrismaGlobal;
  const originalArgv = process.argv;
  const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'] as const;

  const signalListenerCounts = () =>
    Object.fromEntries(shutdownSignals.map((signal) => [signal, process.listenerCount(signal)]));

  beforeEach(() => {
    delete prismaGlobal.__prisma__;
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@127.0.0.1:5432/app');
  });

  afterEach(() => {
    process.argv = originalArgv;
    delete prismaGlobal.__prisma__;
    vi.doUnmock('@/generated/prisma/client');
    vi.doUnmock('@prisma/adapter-pg');
    vi.doUnmock('@/lib/prismaPgConfig');
    vi.doUnmock('@/lib/logger-enterprise');
    vi.resetModules();
  });

  it('registers no SIGINT, SIGTERM or SIGQUIT listener', async () => {
    process.argv = ['/usr/bin/node', '/srv/site-env/node_modules/.bin/tsx', 'scripts/drain-outbox.ts'];
    vi.resetModules();
    vi.doMock('@/generated/prisma/client', () => ({
      PrismaClient: class { $on = vi.fn(); $disconnect = vi.fn().mockResolvedValue(undefined); },
    }));
    vi.doMock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }));
    vi.doMock('@/lib/prismaPgConfig', () => ({ buildPrismaPgAdapterArgs: () => ({ config: {} }) }));
    vi.doMock('@/lib/logger-enterprise', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const before = signalListenerCounts();
    await import('@/lib/prisma');

    expect(signalListenerCounts()).toEqual(before);
  });
});
