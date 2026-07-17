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
- `ORIGIN_PROXY_SHARED_SECRET`, generated with `openssl rand -hex 32` and injected into both Nginx and the application
- no external limiter variables: authoritative sensitive-operation limits use
  PostgreSQL and verified ingress identity. Cloudflare and Nginx provide coarse
  protection; see `docs/security/layered-rate-limiting.md`.

If a booking or check-in webhook URL is configured, its token is mandatory;
production webhook URLs must use HTTPS.

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

Optional browser audits are manual commands: `audit:a11y`, `audit:contrast`, `audit:responsive:ux`, and `audit:lighthouse:matrix`.

## Existing production-oriented tooling

The production profile, systemd templates, and standalone runtime helpers remain as generic components, but they do not yet implement the selected Netcup Docker topology end to end. They must not be treated as an approved release procedure. A future, separately authorized phase must align the reverse proxy, application container, workers, PostgreSQL, backups, immutable image identity, migration ordering, and rollback procedure before production use.

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
- Production proxy validation fails: verify the Cloudflare source allowlist,
  Nginx header overwrite, and private attestation contract; do not trust a
  public forwarding header directly.
- Outbox backlog: inspect `outbox_events.last_error`, the destination URL/token, and the outbox service journal.
