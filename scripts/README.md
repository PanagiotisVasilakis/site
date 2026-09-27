# Setup and runtime runbook

## Requirements

- Node.js 22.19.x (`.nvmrc`)
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

- development: `.env.development.local`, `.env.local`, `.env.development`, `.env`
- production: `.env.production.local`, `.env.production`, `.env`

Production deliberately excludes `.env.local`.

## Sensitive routes in development

Admin login, guest sign-in and claims, booking requests, error and CSP reports
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
- `SECURITY_PEPPER` and `CLAIM_TOKEN_PEPPER` (at least 32 characters; neither falls back to the other or to a built-in value; `npm run ensure-pepper` generates both locally)
- `GUEST_WIFI_NETWORK`, `GUEST_WIFI_PASSWORD`

Production additionally requires:

- `ORIGIN_PROXY_SHARED_SECRET`, generated with `openssl rand -hex 32` and injected into both Nginx and the application
- no external limiter variables: authoritative sensitive-operation limits use
  PostgreSQL and verified ingress identity. Cloudflare and Nginx provide coarse
  protection; see `docs/security/layered-rate-limiting.md`.

If a booking or check-in webhook URL is configured, its token is mandatory;
production webhook URLs must use HTTPS.

Never place secrets in `NEXT_PUBLIC_*` variables.
See `docs/security/runtime-credential-contract.md` for the production strength,
isolation, startup, and rotation requirements.

## Orchestrator commands

```bash
npm run system:check -- --profile development
npm run system:up
npm run system:verify -- --profile development
npm run system:status -- --profile development
npm run system:logs -- --profile development
npm run system:down -- --profile development
```

`verify` requires all of the following: liveness, database-backed readiness, and a successfully served `/en` page. A `Ready` log line alone is not considered successful startup.

Development may start a disposable Docker database when the configured database is unreachable. Production disables that fallback and fails closed.

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

Optional browser audits are manual commands: `audit:a11y`, `audit:responsive:ux`, and `audit:lighthouse:matrix`.

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

**Local proof before a release.** `npm run smoke:image` starts the three images
of the checked-out commit with the same Compose file as an isolated project and
checks migrations, health, security headers, the service worker, the guest
journey and both workers; see
[Production-image smoke](../docs/deployment/production-image-smoke.md).

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

Both exit when their run finishes (they disconnect Prisma explicitly, also with
`PRISMA_AUTO_DISCONNECT=false`).

The outbox worker uses bounded attempts, exponential backoff, leases, abandoned-lease recovery, and a terminal `DEAD` state. The operations worker evaluates database alert rules, retries failed alert notifications, and applies retention. A missing required alert webhook makes the operations run fail. A `DEAD` event opens the "Dead outbox events" alert until it is handled: "Retry delivery" (stay requests) or "Retry notification" (arrival requests) requeues it, closing a stay request removes it, and retention deletes it after 30 days. Events cancelled by a guest erasure are `DEAD` by design; they never open the alert and are deleted on the next operations run.

## Troubleshooting

- Version error: switch the active shell to Node 22.19/npm 11.18 and reinstall with `npm ci`.
- Readiness fails: inspect the SQL error and migration state; liveness alone does not prove the app is ready.
- Production proxy validation fails: verify the Cloudflare source allowlist,
  Nginx header overwrite, and private attestation contract; do not trust a
  public forwarding header directly.
- Outbox backlog: inspect `outbox_events.last_error`, the destination URL/token, and the outbox service journal.
