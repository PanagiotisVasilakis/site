import { buildPrismaPgAdapterArgs } from '@/lib/prismaPgConfig';

describe('buildPrismaPgAdapterArgs', () => {
  it('maps Prisma URL tuning parameters into pg adapter options', () => {
    const result = buildPrismaPgAdapterArgs(
      'postgresql://user:pass@localhost:5432/app'
      + '?connection_limit=7&connect_timeout=9&max_idle_connection_lifetime=12'
      + '&max_connection_lifetime=60&schema=guest&sslmode=require',
    );

    expect(result.config).toMatchObject({
      max: 7,
      connectionTimeoutMillis: 9_000,
      idleTimeoutMillis: 12_000,
      maxLifetimeSeconds: 60,
    });
    expect(typeof result.config).toBe('object');
    if (typeof result.config === 'string' || !('connectionString' in result.config)) {
      throw new Error('Expected a pg PoolConfig');
    }
    expect(result.config.connectionString).toContain('sslmode=require');
    expect(result.config.connectionString).not.toContain('connection_limit');
    expect(result.options).toEqual({ schema: 'guest' });
  });

  it('keeps safe defaults for an invalid URL', () => {
    expect(buildPrismaPgAdapterArgs('not-a-url').config).toEqual({
      connectionString: 'not-a-url',
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 300_000,
    });
  });
});
