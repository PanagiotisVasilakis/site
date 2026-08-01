# Kalamata Guest Guide

Localized Next.js guest guide, booking-request site, and authenticated guest check-in portal backed by PostgreSQL and Prisma.

## Core flows

- Public guide: locale-prefixed content under `/en` and `/el`.
- Booking requests: persisted with an idempotency key and a transactional, leased webhook outbox.
- Guest access: an administrator issues a short-lived, one-time booking claim token. The guest claims the booking with a phone number and password; later sign-ins use those credentials.
- Sessions: short-lived guest/admin cookies, server-side session records, rotating refresh-token families, absolute expiry, logout revocation, and replay detection.
- Check-in requests: persisted with transactional outbox notifications for creation and status changes.
- Operations: database-backed analytics, Web Vitals, security audit events, alert rules, privacy requests/holds, retention, and retry workers.

Legacy phone plus surname/document verification is intentionally not part of the supported authentication flow.

## Quick start

Use Node 22.19 and npm 11.18, then:

```bash
npm ci
npm run ensure-pepper
npm run system:up -- --profile development --skip-build
```

The development orchestrator validates the environment, provisions a local PostgreSQL fallback when needed, applies migrations, starts the app, and verifies readiness plus a localized page. See [scripts/README.md](scripts/README.md) for the complete runbook.

## Release verification

```bash
npm run verify:release
```

This repository-owned command is the mandatory local gate for a commit that may later become a production release. It includes static policy, integrity, test, lint, real disposable-PostgreSQL, and production-format build checks. It requires local Docker, performs no deployment or persistent migration, and is not centrally enforced. See [Release verification](docs/release-verification.md) and [Testing strategy](docs/testing.md). Optional browser audits remain available through `audit:a11y`, `audit:contrast`, `audit:responsive:ux`, and `audit:lighthouse:matrix`.

## Operations

The systemd installer creates the app service plus two timers:

- a one-minute leased outbox drain for booking and check-in webhooks;
- a five-minute operational alert and retention run.

Production startup never loads `.env.local`, never provisions a Docker fallback database, and requires an explicit trusted-proxy topology. Secrets belong in the deployment secret store or the root-owned systemd environment file.

The production container runs as a non-root user. Its build requires an HTTPS `NEXT_PUBLIC_SITE_URL` because Next.js compiles canonical URLs and the sitemap into the output. Build it with `NEXT_PUBLIC_SITE_URL=https://your-host.example npm run docker:build`.

## Documentation

- [Selected deployment target](docs/architecture/deployment-target.md)
- [Release verification](docs/release-verification.md)
- [External platform cleanup runbook](docs/deployment/external-platform-cleanup.md)
- [Trusted ingress contract](docs/security/trusted-ingress.md) and [origin runbook](docs/deployment/origin-ingress-runbook.md)
- [Layered rate-limiting contract](docs/security/layered-rate-limiting.md)
- [Booking claim-token transport](docs/security/claim-token-transport.md)
- [Runtime credential contract](docs/security/runtime-credential-contract.md)
- [Setup and runtime](scripts/README.md)
- [Testing strategy](docs/testing.md)
- [Migration rehearsal](docs/deployment-migration-rehearsal.md)
- [Secret handling and incident response](SECURITY.md)
- Runtime OpenAPI UI: `/api/docs`
