import { readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MigrationRows = Array<{ migration_name: string }>;

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  executeRawUnsafe: vi.fn(),
  queryRaw: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// What the database answers to "newest finished, not rolled-back migration".
const database = vi.hoisted(() => ({ migrations: [] as MigrationRows }));

vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));

// The route pins the newest migration directory (tests/unit/readiness-migration.test.ts enforces it).
function newestMigrationName(): string {
  const names = readdirSync('prisma/migrations', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const newest = names.at(-1);
  if (newest === undefined) throw new Error('prisma/migrations holds no migration');
  return newest;
}

const PINNED = newestMigrationName();
const OLDER = '20200101000000_older_release';
const NEWER = '99991231235959_later_release';

const tx = { $executeRawUnsafe: mocks.executeRawUnsafe, $queryRaw: mocks.queryRaw };

function sqlOf(strings: TemplateStringsArray): string {
  return strings.join('?').replace(/\s+/gu, ' ').trim();
}

function loadRoute() {
  return import('@/app/api/health/ready/route');
}

describe('GET and HEAD /api/health/ready', () => {
  beforeEach(() => {
    // The 2-second cache and the in-flight probe are module state.
    vi.resetModules();
    database.migrations = [{ migration_name: PINNED }];
    mocks.executeRawUnsafe.mockResolvedValue(0);
    mocks.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => (
      sqlOf(strings).includes('_prisma_migrations') ? database.migrations : [{ ok: 1 }]
    ));
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<MigrationRows>) => callback(tx));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers 200 when the newest finished migration is the one the image pins', async () => {
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ready' });
    expect(mocks.logger.warn).not.toHaveBeenCalled();
  });

  // The mocked transaction cannot run SQL, so the query text is the contract: the newest
  // finished, not rolled-back migration, whatever it is called ("C" collation = byte order).
  it('asks the database for its newest finished migration without naming the pinned one', async () => {
    const { GET } = await loadRoute();

    await GET();

    const migrationQuery = mocks.queryRaw.mock.calls.find(([strings]) => sqlOf(strings).includes('_prisma_migrations'));
    expect(migrationQuery).toBeDefined();
    const [strings, ...values] = migrationQuery ?? [];
    expect(sqlOf(strings)).toBe(
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'
      + ' ORDER BY migration_name COLLATE "C" DESC LIMIT 1',
    );
    expect(values).toEqual([]);
  });

  it('answers 503 and warns once when the database holds a newer migration than the image pins', async () => {
    database.migrations = [{ migration_name: NEWER }];
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'not_ready' });
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).toHaveBeenCalledWith('Readiness: database schema is newer than this image', {
      expectedMigration: PINNED,
      newestAppliedMigration: NEWER,
    });
  });

  it('answers 503 and warns once when the pinned migration is not applied yet', async () => {
    database.migrations = [{ migration_name: OLDER }];
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'not_ready' });
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).toHaveBeenCalledWith('Readiness: expected migration is not applied', {
      expectedMigration: PINNED,
      newestAppliedMigration: OLDER,
    });
  });

  it('answers 503 and warns once when no migration is applied at all', async () => {
    database.migrations = [];
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'not_ready' });
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).toHaveBeenCalledWith('Readiness: expected migration is not applied', {
      expectedMigration: PINNED,
      newestAppliedMigration: null,
    });
  });

  it('answers 503 and logs only the error name when the database check rejects', async () => {
    const failure = new Error('connect ECONNREFUSED postgresql://app:hunter2@127.0.0.1:5432/app');
    failure.name = 'PrismaClientInitializationError';
    mocks.transaction.mockRejectedValue(failure);
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'not_ready' });
    // Exactly these arguments: the message (and the error object) never reach the log.
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).toHaveBeenCalledWith('Readiness: database check failed', {
      errorName: 'PrismaClientInitializationError',
    });
  });

  it('logs an unknown error name when something other than an Error is thrown', async () => {
    mocks.transaction.mockRejectedValue('connection reset');
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(503);
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).toHaveBeenCalledWith('Readiness: database check failed', { errorName: 'unknown' });
  });

  it('answers 503 and warns once when a statement inside the transaction fails', async () => {
    const failure = new Error('canceling statement due to statement timeout');
    failure.name = 'PrismaClientKnownRequestError';
    mocks.executeRawUnsafe.mockRejectedValue(failure);
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(503);
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).toHaveBeenCalledWith('Readiness: database check failed', {
      errorName: 'PrismaClientKnownRequestError',
    });
  });

  it.each([
    { state: 'ready', migrations: [{ migration_name: PINNED }], status: 200 },
    { state: 'not ready', migrations: [{ migration_name: NEWER }], status: 503 },
  ])('HEAD answers $state with status $status like GET, with an empty body', async ({ migrations, status }) => {
    database.migrations = migrations;
    const { GET, HEAD } = await loadRoute();

    const head = await HEAD();
    const get = await GET();

    expect(head.status).toBe(status);
    expect(get.status).toBe(status);
    expect(head.headers.get('cache-control')).toBe('no-store');
    expect(head.body).toBeNull();
    expect(await head.text()).toBe('');
    // One check serves both methods.
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it('reuses a result for two seconds and then asks the database again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { GET } = await loadRoute();

    expect((await GET()).status).toBe(200);
    database.migrations = [{ migration_name: NEWER }];
    vi.advanceTimersByTime(1_999);
    expect((await GET()).status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2);
    const expired = await GET();

    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(expired.status).toBe(503);
  });

  it('caches a not-ready result too, so probing logs at most one warning per two seconds, and recovers afterwards', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    mocks.transaction.mockRejectedValueOnce(new Error('connection refused'));
    const { GET, HEAD } = await loadRoute();

    expect((await GET()).status).toBe(503);
    expect((await HEAD()).status).toBe(503);
    expect((await GET()).status).toBe(503);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_001);
    const recovered = await GET();

    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(recovered.status).toBe(200);
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('runs one database check for probes that arrive while it is in flight', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<MigrationRows>) => {
      await gate;
      return callback(tx);
    });
    const { GET, HEAD } = await loadRoute();

    const probes = [GET(), GET(), HEAD()];
    release();
    const responses = await Promise.all(probes);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
  });
});
