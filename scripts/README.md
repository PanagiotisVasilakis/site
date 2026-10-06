# Setup and runtime runbook

## Requirements

- Node.js >= 22.19 (22.19.x tested, `.nvmrc`)
- npm 11.18.x
- PostgreSQL 16+, or Docker for a disposable development database
- macOS or Linux shell

Verify the active shell, because `.nvmrc` does not switch Node automatically:

```bash
node --version
npm --version
```

## First-time development setup

```bash
npm ci
npm run ensure-pepper
npm run system:up
```

`ensure-pepper` creates or completes `.env.local` with local development values only: the docker-compose `DATABASE_URL` (`devuser`/`devpass` on port 5433 unless `POSTGRES_*` are set) and development secrets. It never overwrites an existing value and never generates or edits production secrets.

Environment loading order:

- development: `.env.development.local`, `.env.local`, `.env.development`, `.env` (dotenv, same precedence as `next dev`)
- production: the images contain no `.env*` files (`.dockerignore`), so the configuration comes only from `APP_ENV_FILE` / `MIGRATE_ENV_FILE`.

## Sensitive routes in development

Admin login, guest sign-in and claims, error and CSP reports
resolve the client identity only from the two private headers that Nginx
overwrites in production (see `docs/security/trusted-ingress.md`). A browser
cannot send them, so `next dev` alone answers `503 Service temporarily
unavailable` on those routes, and the server logs
`Client identity unavailable; request rejected before persistence` with the
bounded reason.

Run the local stand-in for the Nginx hop next to the dev server:

```bash
npm run ensure-pepper   # adds a local 64-hex ORIGIN_PROXY_SHARED_SECRET if missing
npm run dev             # terminal 1: next dev on :3000
npm run dev:proxy       # terminal 2: loopback proxy on :3001
```

Then open `http://localhost:3001`. The proxy (`scripts/dev-proxy.mjs`) drops
any client-supplied private headers, adds the attestation and the socket peer
address, forwards HTTP and HMR WebSocket traffic, and refuses to run with
`NODE_ENV=production`. Use `localhost`, not `127.0.0.1`: `next dev` blocks its
development resources for other hosts, and pages would not hydrate.

## Required runtime configuration

The authoritative schema is `src/lib/runtime-env-schema.js`; `src/lib/env.ts` is its TypeScript validation wrapper. Required for the application:

- `DATABASE_URL`
- independently generated `ADMIN_JWT_SECRET`, `ADMIN_DASH_SECRET`, and
  `GUEST_JWT_SECRET`
- `SECURITY_PEPPER` (at least 16 characters) and `CLAIM_TOKEN_PEPPER` (at least 32 characters); use `openssl rand -hex 32` for both (`npm run ensure-pepper` generates 64 hex characters for each locally). Neither falls back to the other or to a built-in value
- `GUEST_WIFI_NETWORK`, `GUEST_WIFI_PASSWORD`

Production additionally requires:

- `ORIGIN_PROXY_SHARED_SECRET`, generated with `openssl rand -hex 32` and injected into both Nginx and the application
- no external limiter variables: authoritative sensitive-operation limits use
  PostgreSQL and verified ingress identity. Cloudflare and Nginx provide coarse
  protection; see `docs/security/layered-rate-limiting.md`.

If the check-in webhook URL is configured, its token is mandatory;
production webhook URLs must use HTTPS.

Optional `AIRBNB_ICAL_URL` is the Airbnb calendar export URL (`https://www.airbnb.com/calendar/ical/<listing id>.ics?s=<token>`), read server-side only by the calendar sync (see "Operational workers"); without it the availability page shows no calendar or prices, only a notice and the contact options. It is a secret (the `s` query parameter is a token): set it only in the production environment and never commit or log it. The schema accepts only https on the default port, no userinfo, the hosts `www.airbnb.com`, `airbnb.com`, `www.airbnb.gr`, `airbnb.gr`, and the path `/calendar/ical/<digits>.ics`.

Optional `CARTO_BASEMAPS_KEY` (https://carto.com/basemaps/apikey/) is read server-side at request time and sent to browsers in the map tile URLs (CARTO Voyager in light, Dark Matter in dark); without it the map uses the standard OpenStreetMap tiles in both themes. It is public by design but should not be logged; restrict it to the site domain in the CARTO dashboard.

Never place secrets in `NEXT_PUBLIC_*` variables.
See `docs/security/runtime-credential-contract.md` for the production strength,
isolation, startup, and rotation requirements.

## Orchestrator commands

```bash
npm run system:check
npm run system:up
npm run system:verify
npm run system:status
npm run system:logs
npm run system:down
```

`verify` requires all of the following: liveness, database-backed readiness, and a successfully served `/en` page. A `Ready` log line alone is not considered successful startup.

Development may start a disposable Docker database when the configured database is unreachable. The production Docker image has no fallback database and fails closed.

## Local release verification

The repository intentionally has no GitHub Actions workflow. Run the complete mandatory local release gate with:

```bash
npm run verify:release
```

The command requires a local Docker daemon, fails on the first mandatory gate, and never deploys or migrates a persistent database. It is not centrally enforced and can be bypassed by a human; see [Release verification](../docs/release-verification.md).

Individual checks are also available:

```bash
npm test
npm run test:coverage
npm run typecheck
npm run lint -- --max-warnings=0
npm run lint:security
npm run check:dead-code
npm run validate:security
npm run validate:release-policy
npm run check:prisma-integrity
npm run check:postgres-image-policy
```

The default suite does not contact a live PostgreSQL, webhook, or third-party
API. `test:integration` is the isolated exception: it owns a digest-pinned
disposable PostgreSQL container and synthetic databases. `verify:release`
never targets a persistent environment. See [Testing strategy](../docs/testing.md)
and [Release verification](../docs/release-verification.md).

Optional browser audits are manual, advisory commands: `audit:a11y` (axe), `audit:responsive:ux` and `audit:vitals` (LCP, CLS, TBT and an INP proxy on a throttled mobile profile, for a local production build). They are local-only: each refuses a non-loopback base URL, and its headless browser can reach no other host.

Committed design assets are regenerated with `npm run design:hero` (hero crops, depth maps, grain tiles), `npm run design:og` (the Open Graph cards in `public/og/`) and `npm run design:icons` (app icons and favicon); see `docs/design/identity.md`.

## Production

Production runs the immutable images built from `docker/Dockerfile.security`
behind the host Nginx, as selected in
[the deployment target](../docs/architecture/deployment-target.md). The host
orchestrator above is a development helper and cannot target production.
Backups, the live ingress evidence and the release approval are still open gaps
in that ADR; the mechanics below are what the repository provides.

**Artifacts of one release commit.** On the release host, from a clean checkout of
the approved SHA:

```bash
NEXT_PUBLIC_SITE_URL=https://localhost:3002 npm run docker:build      # smoke build, same tags
npm run smoke:image                                                    # mandatory; stop on any FAIL
NEXT_PUBLIC_SITE_URL=https://your-host.example npm run docker:build   # villa-app:<sha>, -workers, -migrate
npm run docker:scan                                                    # Trivy or Docker Scout, all three
docker save villa-app:<sha> villa-app:<sha>-workers villa-app:<sha>-migrate | gzip > release-<sha>.tar.gz
```

`scripts/image-tag.sh` refuses nothing but marks an uncommitted tree with `-dirty`;
never ship such a tag. Record the three image IDs that `docker:build` prints.

**Host layout.** `docker/docker-compose.prod.yml` is the only production
definition. It expects, as environment variables of the operator shell (or a
root-owned `.env` next to the compose file):

- `APP_IMAGE` — the web image reference, e.g. `villa-app:0123456789ab`;
- `APP_ENV_FILE` — root-owned file with the runtime configuration from
  "Required runtime configuration" above (`DATABASE_URL` uses host `db`);
- `MIGRATE_ENV_FILE` — root-owned file for `migrate deploy`, with the migration
  role's `DATABASE_URL` (least privilege: the application role must not own DDL);
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` for the bundled PostgreSQL.

The bundled PostgreSQL creates only `POSTGRES_USER`. Create the two roles once,
as `POSTGRES_USER`, before the first `migrate` run, so that `_prisma_migrations`
and every table are created by the migration role and covered by the default
privileges (the password values come from the secret store):

```sql
CREATE ROLE qr_migrator LOGIN PASSWORD '<from secret store>';
CREATE ROLE qr_app LOGIN PASSWORD '<from secret store>';
-- PostgreSQL 15+ no longer grants PUBLIC CREATE on schema public; the database
-- owner owns that schema, so the migration role can create tables in it.
ALTER DATABASE <POSTGRES_DB> OWNER TO qr_migrator;
ALTER DEFAULT PRIVILEGES FOR ROLE qr_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qr_app;
ALTER DEFAULT PRIVILEGES FOR ROLE qr_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO qr_app;
```

`MIGRATE_ENV_FILE` then uses `qr_migrator` and `APP_ENV_FILE` uses `qr_app`.
Default privileges apply only to objects created later: for a database already
migrated by another role, grant on the existing tables and sequences or
reassign their ownership to `qr_migrator` first. The production-image smoke
uses one role for both files, so this two-role setup is not yet tested.

The application is published on `127.0.0.1:${WEB_PORT:-3000}` only; Nginx is the
sole ingress. Every application container runs read-only, without capabilities
and with `no-new-privileges`.

**Release sequence** (`C="docker compose -f docker/docker-compose.prod.yml"`):

```bash
docker load < release-<sha>.tar.gz
export APP_IMAGE=villa-app:<sha>
$C up -d --wait db
$C --profile ops run --rm migrate          # applies this commit's migrations, exits 0 on "No pending migrations"
$C up -d --wait web                        # the web image waits for a healthy db and reports /api/health/ready
```

Keep the previous image reference until the new web container is healthy; rolling
back means exporting the previous `APP_IMAGE` and `$C up -d web` (migrations are
forward-only, so roll back only to a release that ran on the same schema).

**Worker schedule.** The workers are one-off services of the same Compose file;
run them from host timers with single-flight and bounded execution, e.g. root's crontab:

```cron
* * * * *   cd /opt/qr-city-guide && flock -n /run/lock/qr-outbox.lock timeout 55 docker compose -f docker/docker-compose.prod.yml --profile ops run --rm --no-deps outbox
*/5 * * * * cd /opt/qr-city-guide && flock -n /run/lock/qr-operations.lock timeout 280 docker compose -f docker/docker-compose.prod.yml --profile ops run --rm --no-deps operations
```

Each run prints one JSON line (or a `failed` event on stderr and exit 1); cron
delivers both to syslog/journald. `--no-deps` keeps a database outage from
restarting `db` from a timer. The alert path is the operations worker's
`ALERT_WEBHOOK_URL`, independent of the failed job.

**Production-image smoke (mandatory).** `npm run smoke:image` starts the three
images of the checked-out commit with the same Compose file as an isolated
project and checks migrations, health, security headers, the service worker, the
guest journey and both workers; see
[Production-image smoke](../docs/deployment/production-image-smoke.md).
It is the only check that each image starts with every module it imports
(`validate:release-policy` checks the Dockerfile `runner` stage only
statically), so do not release a commit whose smoke run reported a `FAIL`.
It needs a `https://localhost:3002` build that reuses the release tags, so run
it before the release `docker:build` and scan, save and record only the images
of that later production-URL build.

## Operational workers

In production the workers are the `outbox` and `operations` services of
`docker/docker-compose.prod.yml` (see the schedule above), built from
`scripts/build-workers.mjs` into the `-workers` image.

Manual development runs use `tsx`, which does not read `.env.local`, so export it
into the shell first (the app and the orchestrator load it themselves):

```bash
set -a; . ./.env.local; set +a
npm run outbox:drain
npm run operations:check
```

Both exit when their run finishes: they disconnect Prisma explicitly, which is
what lets the process exit (idle pool connections would otherwise keep it alive
for up to 300 s).

The outbox worker uses bounded attempts, exponential backoff, leases, abandoned-lease recovery, and a terminal `DEAD` state. The operations worker evaluates database alert rules, retries failed alert notifications, applies retention, and syncs the Airbnb calendar when `AIRBNB_ICAL_URL` is set (a scheduled fetch at most every 30 minutes, backing off up to four hours after repeated failures; the admin can also start one manually, at most once a minute). The "Stale availability calendar" alert opens after three hours without a successful sync. A missing required alert webhook makes the operations run fail. A `DEAD` event opens the "Dead outbox events" alert until it is handled: "Retry notification" (arrival requests) requeues it, and retention deletes it after 30 days. Events cancelled by a guest erasure are `DEAD` by design; they never open the alert and are deleted on the next operations run.

Guest data retention (`GUEST_DATA_RETENTION_MONTHS` in `src/data/stayPolicy.ts`, 12 months after the booking end date; the accountant still has to confirm that tax retention needs nothing longer): each operations run clears the name, e-mail, phone and message of check-in requests whose booking ended that long ago, and erases, through the same audited path as the admin "Erase guest" action (privacy request with an automatic-retention note, `privacy.erasure.completed` audit event), up to 25 guest accounts whose every booking ended that long ago. Bookings stay, unlinked, with their platform reservation code. Each erasure re-checks the cutoff inside its transaction, so a guest who claims a new booking between selection and erasure is skipped (counted as `guestErasuresSkipped`) and keeps the account. A failed erasure makes the run fail after the rest of the batch has been attempted.

## Troubleshooting

- Version error: switch the active shell to Node 22.19/npm 11.18 and reinstall with `npm ci`.
- A style sheet newly `@import`ed into `src/app/globals.css` is missing from a local `npm run build`: a stale Turbopack cache can drop it. Delete `.next/cache/turbopack` before the build whenever a change adds such an import. Docker builds start without `.next` (`.dockerignore`), so they are not affected.
- Readiness fails: inspect the SQL error and migration state; liveness alone does not prove the app is ready.
- Production proxy validation fails: verify the Cloudflare source allowlist,
  Nginx header overwrite, and private attestation contract; do not trust a
  public forwarding header directly.
- Outbox backlog: inspect `outbox_events.last_error`, the destination URL/token, and the outbox service journal.
