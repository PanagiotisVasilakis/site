import { extractLastAppliedMigration, formatTimestamp, prefixWithTimestamp } from '../utils/prisma-migrate.js';

describe('extractLastAppliedMigration', () => {
  it('captures the last applied migration when multiple entries exist', () => {
    const log = [
      '[2024-01-01T00:00:00.000Z] Applying migration `20240101000000_init`',
      '[2024-01-01T00:00:01.000Z] ✔ Applied migration `20240101000000_init`',
      '[2024-01-02T00:00:00.000Z] Applying migration `20240202000000_add-users`',
      '[2024-01-02T00:00:01.000Z] ✔ Applied migration `20240202000000_add-users`',
      '[2024-01-02T00:00:02.000Z] All migrations have been applied',
    ].join('\n');

    const status = extractLastAppliedMigration(log);

    expect(status).toMatchObject({
      status: 'applied',
      lastAppliedMigration: '20240202000000_add-users',
    });
    expect(status.status === 'applied' ? status.hash : undefined).toBeDefined();
  });

  it('reports when no new migrations are pending', () => {
    const log = [
      '[2024-01-01T00:00:00.000Z] Starting Prisma migrate deploy for production.',
      '[2024-01-01T00:00:01.000Z] No pending migrations to deploy.',
    ].join('\n');

    expect(extractLastAppliedMigration(log)).toMatchObject({
      status: 'none',
      message: expect.stringContaining('No pending migrations to deploy.'),
    });
  });

  it('flags unknown status when a rollback occurs', () => {
    const log = [
      '[2024-01-01T00:00:00.000Z] Applying migration `20240101000000_init`',
      '[2024-01-01T00:00:01.000Z] Rolling back migration `20240101000000_init`',
    ].join('\n');

    expect(extractLastAppliedMigration(log)).toEqual({
      status: 'unknown',
      message: 'Migrations appear to have been rolled back. Inspect the log for corrective actions.',
    });
  });
});

describe('format helpers', () => {
  it('formats timestamps without colon characters', () => {
    const timestamp = formatTimestamp(new Date('2024-01-01T00:00:00.123Z'));
    expect(timestamp).toBe('2024-01-01T00-00-00-123Z');
  });

  it('prefixes messages with ISO timestamps', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    expect(prefixWithTimestamp('hello', date)).toBe('[2024-01-01T00:00:00.000Z] hello');
  });
});
