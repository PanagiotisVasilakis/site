# Host files

These files belong on the production VPS, next to the compose file. They are the glue between
`docker/docker-compose.prod.yml`, the host timers and the monitoring; the application itself never
reads them. Copy them with the rest of the release files (see the
[day-0 runbook](../../docs/deployment/day-0-runbook.md), "Release files") and keep them in step
with the release commit. Nothing here installs, starts or stops anything by itself.

The paths below assume the layout of the day-0 runbook, `/opt/qr-city-guide`. Every script finds
that directory from its own location (two levels above `deploy/host`); set `QR_BASE_DIR` to use
another one.

| File | What it is | Used by |
| --- | --- | --- |
| `compose.env.example` | The host `.env` (`/opt/qr-city-guide/docker/.env`): compose variables, then the settings of the scripts below | Docker Compose, cron jobs, `backup.sh`, `run-worker.sh` |
| `app.env.example` | `APP_ENV_FILE`: runtime configuration of web, outbox and operations, every variable of `src/lib/runtime-env-schema.js` | the containers, `render-nginx.sh` |
| `migrate.env.example` | `MIGRATE_ENV_FILE`: the migration role's `DATABASE_URL` | the `migrate` service |
| `render-nginx.sh` | Renders `deploy/nginx/nginx.conf.template` (host name and origin secret from `app.env`) and checks it with `nginx -t` in the pinned image | the operator, at install and after a change |
| `run-worker.sh` | Runs `outbox` or `operations` from cron with single-flight, a time limit, journald output and an optional heartbeat | root's crontab |
| `backup.sh` | Encrypted `pg_dump` and role dump, local pruning, optional off-site copy, optional heartbeat | root's crontab, and the operator before a migration |
| `check-host.sh` | Free disk space, free memory and TLS file lifetime; prints one line per failed check | `run-worker.sh --name hostcheck`, for a heartbeat |
| `logrotate-nginx.conf` | Rotation of the Nginx logs (`error.log` is kept 14 days, as the privacy notice states; the directory `nginx/logs` must have mode `0711`, see the comments in the file) | `/etc/logrotate.d/` |

## The three env files

Each template documents every variable, how to generate the secrets and the quoting rules. Copy
them as root with mode `0600` (the install commands are in their first lines), replace every
`<...>` placeholder and check that none is left:

```sh
grep -n '^[^#]*<' /opt/qr-city-guide/docker/.env /opt/qr-city-guide/app.env /opt/qr-city-guide/migrate.env
```

The command must print nothing. The templates contain only placeholders, never a usable secret.

## Scripts

All scripts are plain bash, use `umask 077`, write nothing secret to a log or a command line, and
read their settings from the process environment first and then from `docker/.env` (plain
`KEY=value` lines; nothing from that file is executed).

`render-nginx.sh [--no-test]` writes `nginx/nginx.production.conf` (mode `0600`, it contains the
origin secret) and `nginx/includes/`. It overwrites an existing configuration in place: the Nginx
container bind-mounts that one file, and a file that is replaced instead of overwritten leaves the
running Nginx on the old content. Exit status: 0 success, 2 usage, 4 invalid input, 5 the
`nginx -t` check or docker failed (nothing is installed then). Run it without `--no-test` on the
production host: the option skips the check and therefore installs an untested file over the live
one, which a later restart of the container or a reboot would load. It exists for a machine that
only prepares the file (no Docker or no TLS files yet).

`run-worker.sh outbox|operations` replaces the plain cron lines of
[`scripts/README.md`](../../scripts/README.md#production) ("Worker schedule"):

```cron
* * * * *   /opt/qr-city-guide/deploy/host/run-worker.sh outbox
*/5 * * * * /opt/qr-city-guide/deploy/host/run-worker.sh operations
```

It takes the same lock files and time limits (55 and 280 seconds), logs to journald with the tags
`qr-outbox` and `qr-operations`, and removes the container of a run that timed out: killing the
`docker compose run` process does not stop its container. It exits with the job's status (124 after
a timeout) and sends the heartbeat of `HEALTHCHECK_URL_OUTBOX` or `HEALTHCHECK_URL_OPERATIONS` after
a success, or that URL plus `/fail` after a failure. A skipped run (the previous one still holds
the lock) sends nothing. `run-worker.sh --name NAME [--timeout SECONDS] -- COMMAND [ARG...]` runs
any other command the same way (the heartbeat setting is `HEALTHCHECK_URL_<NAME>`), for example
`check-host.sh` in [monitoring and alerting](../../docs/deployment/monitoring-and-alerting.md):

```cron
*/15 * * * * /opt/qr-city-guide/deploy/host/run-worker.sh --name hostcheck --timeout 60 -- /opt/qr-city-guide/deploy/host/check-host.sh
```

`backup.sh` has three modes and no unencrypted mode:

```sh
/opt/qr-city-guide/deploy/host/backup.sh                       # nightly (cron), pings HEALTHCHECK_URL
/opt/qr-city-guide/deploy/host/backup.sh --pre-migrate --label <release sha>   # before a migration
/opt/qr-city-guide/deploy/host/backup.sh --check               # settings, encryption, database, off-site
```

The nightly run sends the failure ping (`<URL>/fail`) whenever it does not reach its end, also when
it is killed (a reboot, a time limit). `BACKUP_TIMEOUT_SECONDS` limits each dump inside the database
container as well, and a run that is stopped (TERM, HUP, the time limit) ends its dump session. After a
`kill -9` the dump session of that run is ended by the next run, so one `pg_dump` can outlive the script
until then.
`BACKUP_DIR` must be a directory of its own: an existing one has to belong to the user who runs the
backup and be closed to everybody else (mode `0700`; the script never changes the mode of a
directory it did not create), and system directories such as `/tmp` or `/var` are refused. `--check`
creates no backup and changes nothing in that directory. The dump runs as the bundled PostgreSQL
superuser, a deviation from the deployment target that the owner accepted on 2026-10-22 (see
[Deviation from the deployment target](../../docs/deployment/backup-and-restore.md#deviation-from-the-deployment-target)).

| Exit status | Meaning |
| --- | --- |
| 0 | success |
| 2 | usage error |
| 3 | skipped, another backup is running (no heartbeat) |
| 4 | configuration error (nothing was dumped) |
| 5 | pre-flight failed: database not ready, not enough free disk space, a tool is missing |
| 6 | dump or encryption failed |
| 7 | off-site copy failed (the local copy exists) |
| 8 | pruning old local copies failed (the backup itself succeeded) |

Setup, retention, the restore drill and the privacy points are in
[backup and restore](../../docs/deployment/backup-and-restore.md).

## Tests

The scripts are not part of the automated test suite (`tests/` covers the application). Before a
change, run `/bin/bash -n` on the file, and test it against a scratch database and a dummy
command: `backup.sh` and `run-worker.sh` take `QR_BASE_DIR` and `QR_LOCK_DIR` for that purpose, and
the compose project name comes from `COMPOSE_PROJECT_NAME` in `docker/.env`, so a test project
never touches the production volume.
