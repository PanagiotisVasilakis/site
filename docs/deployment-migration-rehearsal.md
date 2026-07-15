# Database migration rehearsal

Use this runbook before deploying a release that contains Prisma migrations. A
successful local disposable database is useful, but it does not replace a rehearsal
against a recent staging clone with production-like data volume and shape.

## 1. Obtain platform access

From the database provider, create or identify:

- a staging database URL;
- a separate, disposable rehearsal database or database branch;
- a secure location for an encrypted backup;
- a maintenance window and a point-in-time recovery marker.

Never commit database URLs or dump files to this repository.

## 2. Back up and verify the backup

```bash
umask 077
export STAGING_DATABASE_URL='<from the platform secret manager>'
export REHEARSAL_DATABASE_URL='<separate disposable database>'
pg_dump "$STAGING_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="/secure/path/staging-pre-migration-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_restore --list /secure/path/staging-pre-migration-*.dump >/dev/null
```

Restore that dump into `REHEARSAL_DATABASE_URL` using the provider's clone or
branch workflow. Do not restore over staging or production.

## 3. Rehearse the migrations

First inspect the exact history. Do not continue if
`20260714150000_trustworthy_portal_and_operations` is applied while
`20260714145900_preserve_booking_ownership` is absent:

```bash
psql "$REHEARSAL_DATABASE_URL" --set=ON_ERROR_STOP=1 <<'SQL'
SELECT migration_name, finished_at, rolled_back_at
FROM _prisma_migrations
WHERE migration_name IN (
  '20260714145900_preserve_booking_ownership',
  '20260714150000_trustworthy_portal_and_operations'
)
ORDER BY migration_name;
SQL
```

That partial history means the legacy `access` table may already be gone, so
the preservation migration cannot reconstruct booking ownership. Restore a
backup/branch from before the destructive migration, or reconstruct
`bookings.user_id` from an authoritative provider export with the data owner.
Do not mark the preservation migration as applied and do not guess ownership.

```bash
DATABASE_URL="$REHEARSAL_DATABASE_URL" \
DIRECT_URL="$REHEARSAL_DATABASE_URL" \
npx prisma migrate deploy

DATABASE_URL="$REHEARSAL_DATABASE_URL" \
DIRECT_URL="$REHEARSAL_DATABASE_URL" \
npx prisma migrate status

psql "$REHEARSAL_DATABASE_URL" \
  --file scripts/verify-post-migration.sql
```

Migration `20260715110000_remove_unused_legacy_models` intentionally aborts if
`mfa_factors`, `mfa_challenges`, or `cache` contains any rows. If it aborts,
export and classify those rows with the data owner before changing the
migration. Do not bypass the guard by deleting data ad hoc.

On a disposable rehearsal database, discard/recreate the database and restore
the verified dump before retrying. If an approved retention/export decision
has already been executed on staging and Prisma recorded the guarded migration
as failed, mark that failed attempt rolled back before retrying:

```bash
DATABASE_URL="$STAGING_DATABASE_URL" \
DIRECT_URL="$STAGING_DATABASE_URL" \
npx prisma migrate resolve --rolled-back \
  20260715110000_remove_unused_legacy_models

DATABASE_URL="$STAGING_DATABASE_URL" \
DIRECT_URL="$STAGING_DATABASE_URL" \
npx prisma migrate deploy
```

Never run `migrate resolve` merely to silence the failure: first retain,
classify, and explicitly approve the disposition of every guarded row.

## 4. Apply to staging

After the rehearsal passes, repeat `prisma migrate deploy`, `prisma migrate
status`, and `verify-post-migration.sql` against staging. Then start the new
application image and require `/api/health/ready` to return HTTP 200 before
routing traffic to it.

## 5. Rollback policy

These are forward-only migrations. If deployment validation fails, stop the new
application, preserve logs and the failed database, and restore the verified
backup or use the provider's point-in-time recovery feature. Do not attempt a
manual reverse migration on production data.
