// vitest provides globals (describe, it, expect, vi) via its types; no import required here
import {
  SmokeTestError,
  parseCliArgs,
  runSmokeTest,
  type SmokeTestCliOptions,
  type SmokeTestDependencies,
} from '../prisma-smoketest.js';

describe('parseCliArgs', () => {
  it('returns defaults when no arguments are provided', () => {
    const options = parseCliArgs([]);
    const expected: SmokeTestCliOptions = {
      timeoutMs: 5000,
      verifyUserModel: true,
      outputJson: false,
      quiet: false,
    };
    expect(options).toEqual(expected);
  });

  it('parses recognised flags and overrides defaults', () => {
    const options = parseCliArgs(['--timeout=1000', '--json', '--quiet', '--no-verify-user']);
    expect(options).toMatchObject({
      timeoutMs: 1000,
      outputJson: true,
      quiet: true,
      verifyUserModel: false,
    });
  });

  it('throws on unrecognised arguments', () => {
    expect(() => parseCliArgs(['--mystery'])).toThrowError(SmokeTestError);
  });

  it('validates timeout syntax', () => {
    expect(() => parseCliArgs(['--timeout=abc'])).toThrowError('Invalid timeout value provided: abc');
    expect(() => parseCliArgs(['--timeout'])).toThrowError('Use --timeout=<milliseconds> to configure the timeout.');
  });
});

describe('runSmokeTest', () => {
  const baseDependencies: SmokeTestDependencies = {
    env: { NODE_ENV: 'test', DATABASE_URL: 'postgres://example' },
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
  };

  it('connects, runs queries, and returns timings', async () => {
    const prisma = {
      $connect: vi.fn().mockResolvedValue(undefined),
      $disconnect: vi.fn().mockResolvedValue(undefined),
      $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
      user: {
        count: vi.fn().mockResolvedValue(3),
      },
    };

    const timePoints = [0, 12, 12, 25, 25, 40];
    let callCount = 0;
    const dependencies: SmokeTestDependencies = {
      ...baseDependencies,
      createPrismaClient: () => prisma as never,
      now: () => {
        const value = timePoints[Math.min(callCount, timePoints.length - 1)];
        callCount += 1;
        return value;
      },
    };

    const result = await runSmokeTest({ timeoutMs: 2000 }, dependencies);

    expect(prisma.$connect).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledWith(expect.anything());
    expect(prisma.user.count).toHaveBeenCalledTimes(1);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);

    expect(result.status).toBe('ok');
    expect(result.metrics.userCount).toBe(3);
    expect(result.metrics.connectDurationMs).toBeCloseTo(12, 5);
    expect(result.metrics.simpleQueryDurationMs).toBeCloseTo(13, 5);
    expect(result.metrics.userCountDurationMs).toBeCloseTo(15, 5);
  });

  it('throws when DATABASE_URL is missing', async () => {
    await expect(runSmokeTest({}, { ...baseDependencies, env: { NODE_ENV: 'test' } } as any)).rejects.toThrowError(
      'DATABASE_URL is not set. Prisma smoke test cannot run.',
    );
  });

  it('wraps unexpected errors and still disconnects', async () => {
    const prisma = {
      $connect: vi.fn().mockResolvedValue(undefined),
      $disconnect: vi.fn().mockResolvedValue(undefined),
      $queryRaw: vi.fn().mockRejectedValue(new Error('boom')), // triggers failure
      user: {
        count: vi.fn(),
      },
    };

    await expect(
      runSmokeTest(
        {},
        {
          ...baseDependencies,
          createPrismaClient: () => prisma as never,
          now: () => 0,
        },
      ),
    ).rejects.toThrowError(SmokeTestError);

    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('honours verifyUserModel flag', async () => {
    const prisma = {
      $connect: vi.fn().mockResolvedValue(undefined),
      $disconnect: vi.fn().mockResolvedValue(undefined),
      $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
      user: {
        count: vi.fn(),
      },
    };

    await runSmokeTest(
      { verifyUserModel: false },
      {
        ...baseDependencies,
        createPrismaClient: () => prisma as never,
        now: (() => {
          const values = [0, 10, 10, 20];
          let idx = 0;
          return () => values[Math.min(idx++, values.length - 1)];
        })(),
      },
    );

    expect(prisma.user.count).not.toHaveBeenCalled();
  });
});
