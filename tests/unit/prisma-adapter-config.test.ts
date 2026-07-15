import { describe, expect, it } from 'vitest';

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

  it('keeps safe defaults for an unparsable URL', () => {
    expect(buildPrismaPgAdapterArgs('not-a-url')).toEqual({
      config: {
        connectionString: 'not-a-url',
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 300_000,
        statement_timeout: 20_000,
        query_timeout: 25_000,
        lock_timeout: 5_000,
      },
    });
  });
});
