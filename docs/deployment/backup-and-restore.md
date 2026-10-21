# Backup and restore

The deployment target requires backups that are encrypted before they leave the VPS, stored outside
the VPS failure domain, monitored for freshness and proven by isolated restores; a backup that has not
passed a restore test is not recovery evidence ([deployment target](../architecture/deployment-target.md)).
This document is the procedure for that. The tool is [`deploy/host/backup.sh`](../../deploy/host/README.md);
the host is set up as in the [day-0 runbook](day-0-runbook.md).

Status: the commands below follow `deploy/host/backup.sh`, `docker/docker-compose.prod.yml` and the
migrations as they are in this repository at commit `ae1449d`; when a later release changes one of
them, the script's header and this page change in the same commit. This page is a procedure, not
evidence that a backup or a restore works on your host: the off-site copy depends on `rclone` and
your storage account, which the repository cannot try, and only the restore drill below proves a
backup. Do the drill once before launch and keep its result with the other evidence
([day-0 runbook](day-0-runbook.md), section 16).

## What is backed up

| Covered | Not covered, and where it must be instead |
| --- | --- |
| The application database: guests, bookings, check-in requests, claim grants, sessions and tokens, audit events, alerts, settings (including the feature flags), rate periods, calendar state, the outbox. | The three env files, the origin certificate and key, the Authenticated Origin Pull CA and client keys, the private backup key, the rclone configuration, the Cloudflare and Netcup account recovery codes: the password manager. |
| The role definitions (`pg_dumpall --roles-only`), with their password hashes. | The release images and files: the release host keeps the release archives; rebuild from the commit if they are lost. |
| | Nginx logs (they are rotated by `logrotate`, [day-0 runbook](day-0-runbook.md) section 10). |

The Booking.com calendar is not lost with the database: the operations worker fetches it again within
five minutes of the first run on a restored database.

There is no point-in-time recovery: a nightly dump is a snapshot. If a day of data is too much, run
`backup.sh` more often; do not add WAL archiving without a decision.

## Proposed objectives (the owner confirms or changes them)

These are proposals, not commitments. They are what the design below can meet.

| | Proposed | What it means |
| --- | --- | --- |
| Recovery point objective (RPO) | **24 hours** | After a total loss of the VPS you lose at most the data entered since the last nightly backup: bookings and rate periods entered in the admin, claim grants issued, guest accounts created, check-in requests and their delivery state, alerts. Changes made since then are repeated by hand. |
| Recovery time objective (RTO) | **4 hours** | From the decision to restore until the site works again on a new VPS. Realistic only if the env files, the origin certificate and key, the Authenticated Origin Pull CA certificate and the private backup key are in the password manager, and the restore drill has been done once. The provisioning time of a Netcup VPS is not part of this estimate. |

## Deviation from the deployment target

The [deployment target](../architecture/deployment-target.md) requires that application, migration
and backup access use distinct least-privilege roles. The application role (`qr_app`) and the
migration role (`qr_migrator`) are distinct. **The backup is not a least-privilege role:**
`backup.sh` connects as the bundled PostgreSQL superuser (`POSTGRES_USER`, `qr_postgres` in the
templates), over the local socket inside the `db` container, with no password and no published port.
The reason is the role dump: `pg_dumpall --roles-only` reads the password hashes from `pg_authid`,
which only a superuser may read, and that dump is what brings the roles back with their passwords.

This is a deviation from the sentence above, and nothing in the repository accepts it on the owner's
behalf. Before launch the owner decides one of two things:

1. **Accept it**, and record the acceptance with the other deployment evidence (day-0 runbook,
   section 16). What the owner accepts: the nightly job runs as `root`, which holds the Docker
   daemon and therefore reaches the database superuser anyway; the job adds no new route to it, but
   it is not the separation the deployment target asks for.
2. **Choose the least-privilege alternative**, which needs a change of the script and of the restore
   steps and has not been built or tested here: a separate login role used only by the backup, with
   `pg_read_all_data` (PostgreSQL 14 and later) and no other right, running `pg_dump` only; no role
   dump at all, because the roles are recreated from the env files with the SQL block of
   [`scripts/README.md`](../../scripts/README.md#production) ("Host layout"), and the restore creates
   them before `pg_restore` instead of replaying `roles.sql`.

Until one of the two is done, the backup role is an open deviation from the deployment target, and
this page must not be read as saying that the requirement is met.

## Privacy

1. **Backups hold personal data** (phone numbers, check-in request names, e-mail addresses and
   messages, account and booking links). They are encrypted, root-only and kept for a limited time:
   the local copies for `BACKUP_RETENTION_DAYS` (default 14 days), pre-migration copies under the
   same limit. Off-site copies must expire as well: set `RCLONE_RETENTION_DAYS` (the credential then
   needs the right to delete) or a lifecycle rule at the storage provider, with the same number of
   days. A copy that nothing expires keeps personal data for ever: when `RCLONE_REMOTE` is set and
   `RCLONE_RETENTION_DAYS` is empty, `backup.sh` warns on every run and `--check` prints a warning.
2. **The privacy notice does not mention backups.** The retention list in
   `src/i18n/domains/legal.ts` names the error log (14 days) and the other stores, but no backup. The
   notice is the owner's (and a lawyer's) to change. A proposal for them to adapt: "Encrypted backup
   copies of the database are kept for up to 14 days and then deleted. Data that was erased on request
   remains in these copies until they expire; if a backup is ever restored, the erasure is carried
   out again." The storage provider of the off-site copies is one more recipient and processor of this
   data: record it where you record the other recipients.
3. **Erased guests reappear after a restore.** A restore returns the database to the state of the
   backup, including guests who asked for erasure since then and accounts that the retention job
   erased. After every restore, before the site is public again:
   - run the operations worker once (`run-worker.sh operations`): it erases, by itself, up to 25
     accounts per run whose bookings ended more than 12 months ago;
   - repeat every erasure that you carried out after the backup was taken. The restored database does
     not know about them. Keep a short register outside the database of the erasure requests you
     handled (the date, and the booking's reservation code, which identifies the account in a restored
     database), and delete register entries older than your longest backup retention: no backup older
     than that exists, so they can never matter again.
4. **Decrypted files are as sensitive as the database.** Decrypt only on an encrypted disk, never copy
   a dump into a chat, an e-mail or a ticket, and delete the decrypted files and the scratch database
   when the drill is done.
5. **A restore also restores old sessions.** Sessions and tokens that were revoked after the backup
   come back as valid. The restore steps below delete them all; everybody signs in again.

## Set up

**1. Make the key pair on your own computer, not on the VPS.** The VPS gets only the public key, so a
stolen server or a leaked off-site copy cannot be decrypted.

```sh
age-keygen -o qr-backup-key.txt          # prints "Public key: age1..."
```

Put `qr-backup-key.txt` in the password manager and keep a second copy offline. Make a second key pair
the same way and keep it elsewhere: a backup is encrypted for every key in the recipients file, and
losing the only private key means losing every backup.

**2. Put the public keys on the VPS**, one `age1...` line per key (not the private key; `backup.sh`
refuses a file that contains one):

```sh
install -m 0644 /dev/null /opt/qr-city-guide/backup-recipients.txt
nano /opt/qr-city-guide/backup-recipients.txt
```

The file must belong to root and not be writable by anyone else. Someone who can change it can redirect
future backups to their own key.

**3. Settings** are the "Backup" part of `docker/.env` (`compose.env.example` documents each one). gpg
works instead of age with `BACKUP_ENCRYPTION=gpg` and `BACKUP_GPG_RECIPIENT`: import only the public
key into root's keyring (`gpg --import`), never the secret key.

**4. Optional off-site copy.** Choose storage outside the failure domain of the VPS: not the same
provider account and not a second volume of the same server. Install `rclone` (your distribution's
package or rclone.org's current instructions), run `rclone config` as root to create a remote, and set
`RCLONE_REMOTE=<remote name>:<bucket or path>` in `docker/.env`. The credentials stay in the rclone
configuration file (`/root/.config/rclone/rclone.conf`, mode `0600`), never in `docker/.env`. Prefer a
credential that may write but not delete, with expiry done by the provider's lifecycle rule. Choose a
region that fits the privacy notice, and record the provider as a processor.

**5. Heartbeat.** Create the check for the nightly backup at your monitor and put its URL into
`HEALTHCHECK_URL` ([monitoring and alerting](monitoring-and-alerting.md)).

**6. Check, then run once by hand:**

```sh
/opt/qr-city-guide/deploy/host/backup.sh --check
/opt/qr-city-guide/deploy/host/backup.sh
ls -l /opt/qr-city-guide/backups
journalctl -t qr-backup -n 5 --no-pager
```

`--check` verifies the settings, encrypts a test string, reaches the database and (with a remote)
lists the off-site target. It creates no backup and creates or changes nothing in the backup
directory: its scratch file is a short-lived private file in the temporary directory, and the first
real backup creates the backup directory when it does not exist. `BACKUP_DIR` must be a directory of
its own: if it exists, it has to belong to the user who runs the backup and have mode `0700` (the
script refuses anything else and never changes the mode of a directory it did not create), and
system directories such as `/tmp`, `/var` or `/etc` are refused. A run logs `backup written: ...`,
`pruned 0 local backup set(s) ...` and `backup ok in Ns`. The cron line is in the
[day-0 runbook](day-0-runbook.md) (section 10).

## What a run does

- Dumps the application database in the custom format (`pg_dump -Fc`) and the roles
  (`pg_dumpall --roles-only`) from the `db` container, as the bundled superuser over the local socket
  (a deviation from the deployment target, see above): no password, no published port, nothing
  secret on a command line. Both streams are encrypted while they are written, to a `.partial` file
  that becomes the real file only when the whole pipeline succeeded. No plain text dump touches the
  disk, and the script has no unencrypted mode.
- Names the files `qr-city-guide-<UTC time>-<kind>.dump.age` and `...roles.sql.age`, each with a
  `.sha256` file. The kind is `nightly`, or `pre-migrate-<label>` for the dump before a migration.
  The files are `0600` in a `0700` directory.
- Deletes local sets older than `BACKUP_RETENTION_DAYS`, except that the newest `BACKUP_KEEP_MIN`
  (default 3) sets are never deleted, so a long outage of the backups cannot empty the directory.
  Files whose name it does not recognize are never touched and do not count as a set. Leftovers of a
  run that was killed (`.stderr.*`, `.selftest.*` and `*.partial` files) are removed at the next
  start.
- Copies the four new files to `RCLONE_REMOTE` when it is set (`rclone copyto --immutable
  --checksum`), and deletes off-site copies older than `RCLONE_RETENTION_DAYS` when that is set
  (only in the top level of the remote path, files named `qr-city-guide-*`).
- Pings `HEALTHCHECK_URL` after a success and `<URL>/fail` after any failure (the nightly run
  only). A run that is killed before it reaches its end (a reboot, a time limit, a lost session)
  counts as a failure: it removes its partial files, ends its dump session in the database and sends
  the failure ping.
- Refuses to start with less than `BACKUP_MIN_FREE_MB` free (default 1024). Each dump and each
  transfer gets `BACKUP_TIMEOUT_SECONDS` (default 1800); the dump's limit is enforced inside the
  `db` container as well, so a stuck `pg_dump` does not outlive the script and keep its locks. A
  dump that cannot get its table locks within 120 seconds fails at once (a long-running migration
  or a stuck session then shows up as a failed backup, not as a hung one).

The exit statuses are in [`deploy/host/README.md`](../../deploy/host/README.md). `3` means that another
backup was running (nothing is sent), `7` that the local copy exists but the off-site copy failed.
A nearly empty database (the schema only) produces a dump of some tens of kilobytes.

**What the script cannot check.** It never has the private key, so it cannot decrypt what it wrote. It
checks that the pipeline succeeded, that the file is not empty and that an age file has the age
header. Only a restore proves a backup, which is why the drill below exists.

### The role dump

`pg_dumpall --roles-only` reads the password hashes from `pg_authid`, which only a superuser may read.
`backup.sh` runs it as the bundled superuser (`POSTGRES_USER`; the owner has to accept that, see
"Deviation from the deployment target"). As the application role it fails with
`permission denied for table pg_authid`; with `--no-role-passwords` it works for any role but writes
the roles without passwords (then set them with `ALTER ROLE` from the env files). The dump with hashes
is encrypted like the database dump and is as sensitive. It does not contain the database owner: the
restore steps set it.

## Before a migration

```sh
/opt/qr-city-guide/deploy/host/backup.sh --pre-migrate --label <release sha>
```

It must exit `0` before `migrate` runs ([day-0 runbook](day-0-runbook.md), section 15). The dump is
your way back if a migration damages data; migrations are forward-only.

## Restore drill

Do this before launch, then every quarter and after any change of roles or schema handling. It
restores into a **scratch Compose project with its own directory, project name and port**. Never
restore into the production project, and never run `down -v` anywhere but in the scratch directory:
`-v` deletes the volume of the project it runs in.

Where: your own computer with Docker and `age`, or a temporary server, with a copy of
`docker/docker-compose.prod.yml` from the release and your private key. Do not run the drill on the
production VPS: the private key must not be there.

**Step 1. Fetch one backup set and check it.** Copy the newest `*.dump.age`, `*.roles.sql.age` and both
`.sha256` files from the off-site storage (or with `scp` from `/opt/qr-city-guide/backups`) into one
directory, then:

```sh
sha256sum -c qr-city-guide-<time>-nightly.dump.age.sha256 qr-city-guide-<time>-nightly.roles.sql.age.sha256
```

**Step 2. Make the scratch project.** Its `.env` sets the project name and a port that production does
not use. The compose file requires the three image and file variables to be set, but the drill starts
only the database. Use the same `POSTGRES_USER` and `POSTGRES_DB` as production.

```sh
umask 077
mkdir -p ~/restore-drill/docker && cd ~/restore-drill
cp <release>/docker/docker-compose.prod.yml docker/
cat > docker/.env <<EOF
COMPOSE_PROJECT_NAME=qr-restore-drill
APP_IMAGE=unused
APP_ENV_FILE=/dev/null
MIGRATE_ENV_FILE=/dev/null
POSTGRES_USER=qr_postgres
POSTGRES_PASSWORD=$(openssl rand -hex 32)
POSTGRES_DB=qr_city_guide
POSTGRES_PORT=55432
EOF
D="docker compose -f docker/docker-compose.prod.yml"
$D config --quiet && $D up -d --wait db
```

**Step 3. Decrypt.** The private key stays on this computer.

```sh
age -d -i ~/qr-backup-key.txt qr-city-guide-<time>-nightly.roles.sql.age > roles.sql
age -d -i ~/qr-backup-key.txt qr-city-guide-<time>-nightly.dump.age > db.dump
```

**Step 4. Restore the roles, then the database.** The error for the bootstrap role is expected: the
scratch server already has it. The database restore must print nothing.

```sh
$D exec -T db psql -X -U qr_postgres -d postgres < roles.sql        # ERROR:  role "qr_postgres" already exists
$D exec -T db pg_restore -U qr_postgres -d qr_city_guide --exit-on-error < db.dump
$D exec -T db psql -X -U qr_postgres -d postgres -c "ALTER DATABASE qr_city_guide OWNER TO qr_migrator;"
```

The last statement matters: a restore does not set the database owner, and without it the migration
role cannot create objects in the restored database (the next migration that needs a new table would
fail with `permission denied for schema public`).

**Step 5. Verify.**

```sh
# the newest migration equals EXPECTED_MIGRATION in src/app/api/health/ready/route.ts of that release
$D exec -T db psql -X -U qr_app -d qr_city_guide -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name COLLATE \"C\" DESC LIMIT 1;"
# row counts: compare with the same query on production (they differ only by the changes since the backup)
$D exec -T db psql -X -U qr_app -d qr_city_guide -c "SELECT 'users' AS t, count(*) FROM users UNION ALL SELECT 'bookings', count(*) FROM bookings UNION ALL SELECT 'check_in_requests', count(*) FROM check_in_requests UNION ALL SELECT 'outbox_events', count(*) FROM outbox_events UNION ALL SELECT 'rate_periods', count(*) FROM rate_periods ORDER BY 1;"
# ownership and privileges came back: every table owned by qr_migrator; qr_app may write rows but not create objects
$D exec -T db psql -X -U qr_postgres -d qr_city_guide -c "SELECT tableowner, count(*) FROM pg_tables WHERE schemaname = 'public' GROUP BY 1;"
$D exec -T db psql -X -U qr_app -d qr_city_guide -c "CREATE TABLE drill_probe(i int);"    # permission denied for schema public
```

For a dump of the same release, `prisma migrate deploy` run against the restored database as the
migration role should say "No pending migrations to apply.".

**Step 6 (optional). Start the application on it.** With the release images loaded and a copy of
`app.env` whose `DATABASE_URL` uses host `db`, set `WEB_PORT=3999` in the scratch `docker/.env` and
`APP_ENV_FILE` to that copy, run `$D up -d --wait web` and
`curl -sS http://127.0.0.1:3999/api/health/ready`.

**Step 7. Clean up.** From the scratch directory only, after `docker compose ls` shows the production
project untouched:

```sh
$D down -v
rm -f roles.sql db.dump
```

Write down the date, the backup used, the time it took and what you saw. Quarterly is the minimum.

## Restoring for real

Use a new VPS if the old one is lost or may be compromised. Follow the [day-0 runbook](day-0-runbook.md)
sections 1 to 4 (the env files and certificates come from the password manager). Then:

**1. Restore the database.** Bring up the database only, and restore exactly as in drill steps 3 and 4,
now in the production project (`$C`, `docker/.env`, the real `POSTGRES_USER` and `POSTGRES_DB`),
including the `ALTER DATABASE ... OWNER TO qr_migrator` statement.

**2. Migrate.** `$C --profile ops run --rm migrate`. With a backup of an older release it applies the
migrations that came after it.

**3. Delete every session and token**, so that nothing revoked after the backup comes back to life.
Admins and guests sign in again.

```sh
$C exec -T db psql -X -v ON_ERROR_STOP=1 -U qr_app -d qr_city_guide <<'SQL'
BEGIN;
DELETE FROM admin_sessions;
DELETE FROM sessions;
DELETE FROM refresh_tokens;
DELETE FROM refresh_token_families;
COMMIT;
SQL
```

If the old server may have been compromised, also rotate the secrets
([runtime credential contract](../security/runtime-credential-contract.md)): generate new values in
`app.env` before the first start.

**4. Privacy and go-live.** Do the privacy steps above (erasures), start `web`, then continue with
day-0 sections 6 to 11. Pending outbox events that were already delivered before the loss are
delivered again; the receiver must treat the `Idempotency-Key` header as the key for duplicates
([monitoring and alerting](monitoring-and-alerting.md)).

Restoring over a database that still works is not part of the drill. Stop `web` and the cron jobs
first, take `backup.sh --pre-migrate --label before-restore`, and restore into a new, empty volume
rather than on top of the old data (`$C down`, then remove the volume `qr-city-guide_postgres-prod-data`
only after that backup is safely copied off the host).
