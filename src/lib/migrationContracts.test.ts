import crypto from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const migrationsDirectory = path.resolve(process.cwd(), 'prisma/migrations');
const preservationMigration = '20260714145900_preserve_booking_ownership';
const destructiveMigration = '20260714150000_trustworthy_portal_and_operations';
const invariantMigration = '20260715100000_enforce_booking_ownership_invariant';
const phoneMigration = '20260715101000_normalize_stay_request_phones';
const erasureMigration = '20260715104000_unique_open_erasure_request';
const outboxLeaseMigration = '20260715105000_recover_legacy_outbox_leases';
const latestMigration = '20260715110000_remove_unused_legacy_models';

function migrationSql(name: string): string {
  return readFileSync(path.join(migrationsDirectory, name, 'migration.sql'), 'utf8');
}

describe('database migration contracts', () => {
  it('preserves legacy access ownership before retiring access and enforces the invariant afterward', () => {
    const migrations = readdirSync(migrationsDirectory).sort();
    expect(migrations.indexOf(preservationMigration)).toBeLessThan(migrations.indexOf(destructiveMigration));
    expect(migrations.indexOf(destructiveMigration)).toBeLessThan(migrations.indexOf(invariantMigration));
    expect(migrations.indexOf(invariantMigration)).toBeLessThan(migrations.indexOf(erasureMigration));
    expect(migrations.indexOf(erasureMigration)).toBeLessThan(migrations.indexOf(outboxLeaseMigration));
    expect(migrations.indexOf(outboxLeaseMigration)).toBeLessThan(migrations.indexOf(latestMigration));

    const preservationSql = migrationSql(preservationMigration);
    expect(preservationSql).toContain("to_regclass('public.access')");
    expect(preservationSql).toContain('UPDATE "bookings" b');
    expect(preservationSql).toContain('SET "user_id" = owner_row."user_id"');
    expect(preservationSql).toContain('COUNT(DISTINCT a."user_id") > 1');

    const invariantSql = migrationSql(invariantMigration);
    expect(invariantSql).toContain('"access_status" = \'VERIFIED\'');
    expect(invariantSql).toContain('"user_id" IS NULL');
    expect(invariantSql).toContain('CONSTRAINT "bookings_verified_owner_check"');
    expect(invariantSql).toContain('CHECK ("access_status" <> \'VERIFIED\' OR "user_id" IS NOT NULL)');
  });

  it('does not rewrite the already-applied destructive migration', () => {
    const checksum = crypto.createHash('sha256').update(migrationSql(destructiveMigration)).digest('hex');
    expect(checksum).toBe('34332d763f7ecb1617a3a4758fa9c5168749051411640319bb17ff2061aeae25');
  });

  it('enforces canonical stay-request phones without blocking unrelated legacy-row updates', () => {
    const sql = migrationSql(phoneMigration);
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF "phone" ON "stay_requests"');
    expect(sql).toContain("NEW.\"phone\" !~ '^\\+[1-9][0-9]{7,14}$'");
    expect(sql).not.toContain('ADD CONSTRAINT "stay_requests_phone_e164_check"');
    expect(sql).not.toContain('CHECK ("phone"');
  });

  it('recovers incomplete legacy outbox leases in a new migration', () => {
    const sql = migrationSql(outboxLeaseMigration);
    expect(sql).toContain('WHERE "status" = \'LEASED\'');
    expect(sql).toContain('"lease_owner" IS NULL OR "lease_expires_at" IS NULL');
    expect(sql).toContain('"status" = \'PENDING\'');
  });

  it('refuses to remove unused legacy tables when any retained rows exist', () => {
    const sql = migrationSql(latestMigration);
    const guardEnd = sql.indexOf('END $$;');
    const firstDrop = sql.indexOf('DROP TABLE');

    expect(sql).toContain("to_regclass('public.mfa_factors')");
    expect(sql).toContain("to_regclass('public.mfa_challenges')");
    expect(sql).toContain("to_regclass('public.cache')");
    expect(sql).toContain('Refusing to remove non-empty legacy table');
    expect(guardEnd).toBeGreaterThan(-1);
    expect(firstDrop).toBeGreaterThan(guardEnd);
    expect(sql).toContain('DROP TABLE IF EXISTS "mfa_challenges"');
    expect(sql).toContain('DROP TABLE IF EXISTS "mfa_factors"');
    expect(sql).toContain('DROP TABLE IF EXISTS "cache"');
  });

  it('keeps readiness pinned to the latest schema migration', () => {
    const readinessRoute = readFileSync(
      path.resolve(process.cwd(), 'src/app/api/health/ready/route.ts'),
      'utf8',
    );
    expect(readinessRoute).toContain(`EXPECTED_MIGRATION = '${latestMigration}'`);
  });
});
