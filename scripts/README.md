# Setup and runtime runbook

Last verified: 2026-07-15.

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
npm run system:up -- --profile development --skip-build
```

`ensure-pepper` only repairs local development secrets in `.env.local`. It never generates or edits production secrets.

Environment loading order:

- development: `.env.development.local`, `.env.local`, `.env.development`, `.env`
- production: `.env.production.local`, `.env.production`, `.env`

Production deliberately excludes `.env.local`.

## Required runtime configuration

The authoritative schema is `src/lib/runtime-env-schema.js`; `src/lib/env.ts` is its TypeScript validation wrapper. Required for the application:

- `DATABASE_URL`
- `ADMIN_JWT_SECRET`, `ADMIN_DASH_SECRET`
- `GUEST_JWT_SECRET`, `SESSION_SECRET`
- `SECURITY_PEPPER`, `SECURITY_ENC_KEY_HEX`
- `GUEST_WIFI_NETWORK`, `GUEST_WIFI_PASSWORD`

Production additionally requires:

- `CLAIM_TOKEN_PEPPER`
- `TRUST_PROXY_MODE=hops` with a positive `TRUST_PROXY_HOPS`, or `TRUST_PROXY_MODE=header` with an explicitly trusted `CLIENT_IP_HEADER`
- `RATE_LIMIT_BACKEND=redis` with `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; production fails closed instead of using a per-process counter. `RATE_LIMIT_NAMESPACE` may be set per environment; otherwise a stable environment/site namespace is derived automatically.

If a booking or check-in webhook URL is configured, its token is mandatory; production webhook URLs must use HTTPS. A blank rate-limit backend is supported only in development, where it uses an in-memory counter.

Never place secrets in `NEXT_PUBLIC_*` variables.

## Orchestrator commands

```bash
npm run system:check -- --profile development
npm run system:up -- --profile development --skip-build
npm run system:verify -- --profile development
npm run system:status -- --profile development
npm run system:logs -- --profile development
npm run system:down -- --profile development
```

`verify` requires all of the following: liveness, database-backed readiness, and a successfully served `/en` page. A `Ready` log line alone is not considered successful startup.

Development may start a disposable Docker database when the configured database is unreachable. Production disables that fallback and fails closed.

## Local validation and CI

The repository has deterministic local gates and a versioned GitHub Actions baseline. Run the core local gate with:

```bash
npm run validate:local
```

For the complete mandatory CI matrix and its local equivalents, see [`docs/ci.md`](../docs/ci.md).

Individual checks are also available:

```bash
npm test
npm run test:coverage
npm run typecheck
npm run lint -- --max-warnings=0
npm run lint:security
npm run check:dead-code
npm run validate:security
npm run check:ci-policy
npm run check:prisma-integrity
npm run check:postgres-image-policy
```

The default suite does not contact a live PostgreSQL, Redis, webhook, or third-party API. `test:integration` is the isolated exception: it owns a digest-pinned disposable PostgreSQL container and synthetic databases. Production connectivity remains covered by separately authorized `system:check` and `system:verify`; CI never targets persistent environments. See [Testing strategy](../docs/testing.md) and [CI baseline](../docs/ci.md).

Optional browser audits are manual commands: `audit:a11y`, `audit:contrast`, `audit:responsive:ux`, and `audit:lighthouse:matrix`.

## Production process

Load secrets from the deployment secret store, then run:

```bash
npm run system:check -- --profile production --no-docker-fallback
npm run system:migrate -- --profile production --no-docker-fallback
npm run system:build -- --profile production --no-docker-fallback
npm run system:up -- --profile production --skip-build --skip-migrate --no-docker-fallback
npm run system:verify -- --profile production --no-docker-fallback
```

The production profile fails on missing configuration, database connectivity, pending migrations, build errors, or failed runtime verification.

## systemd deployment

```bash
sudo bash scripts/install-systemd-services.sh --service-name qr-city-guide
systemctl status qr-city-guide.service
systemctl list-timers 'qr-city-guide-*'
journalctl -u qr-city-guide.service -f
```

The installer creates a root-owned environment file and refuses placeholder secrets or an unspecified production proxy topology. Review and populate the generated environment file before re-running the installer.

## Operational workers

Manual runs:

```bash
npm run outbox:drain
npm run operations:check
```

The outbox worker uses bounded attempts, exponential backoff, leases, abandoned-lease recovery, and a terminal `DEAD` state. The operations worker evaluates database alert rules, retries failed alert notifications, and applies retention. A missing required alert webhook makes the operations run fail.

## Troubleshooting

- Version error: switch the active shell to Node 22.19/npm 11.18 and reinstall with `npm ci`.
- Readiness fails: inspect the SQL error and migration state; liveness alone does not prove the app is ready.
- Production proxy validation fails: configure the real reverse-proxy hop count or trusted single-value header; do not guess.
- Outbox backlog: inspect `outbox_events.last_error`, the destination URL/token, and the outbox service journal.
