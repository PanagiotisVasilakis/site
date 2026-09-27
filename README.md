# Kalamata Guest Guide

Localized Next.js guest guide, booking-request site, and authenticated guest check-in portal backed by PostgreSQL and Prisma.

## Core flows

- Public guide: locale-prefixed content under `/en` and `/el`.
- Booking requests: persisted with an idempotency key and a transactional, leased webhook outbox.
- Guest access: an administrator issues a short-lived, one-time booking claim token. The guest claims the booking with a phone number and password; later sign-ins use those credentials.
- Sessions: short-lived guest/admin cookies, server-side session records, rotating refresh-token families, absolute expiry, logout revocation, and replay detection.
- Check-in requests: persisted with transactional outbox notifications for creation and status changes.
- Operations: database-backed security audit events, alert rules, privacy requests/holds, retention, and retry workers.

Legacy phone plus surname/document verification is intentionally not part of the supported authentication flow.

## Quick start

Use Node 22.19 and npm 11.18, then:

```bash
npm ci
npm run ensure-pepper
npm run system:up
```

`ensure-pepper` writes the local `.env.local` (docker-compose `DATABASE_URL` and development secrets), so no manual copy of `.env.example` is needed. The development orchestrator validates the environment, provisions a local PostgreSQL fallback when needed, applies migrations, starts the app, and verifies readiness plus a localized page. See [scripts/README.md](scripts/README.md) for the complete runbook.

## Release verification

```bash
npm run verify:release
```

This repository-owned command is the mandatory local gate for a commit that may later become a production release. It includes static policy, integrity, test, lint, real disposable-PostgreSQL, and production-format build checks. It requires local Docker, performs no deployment or persistent migration, and is not centrally enforced. See [Release verification](docs/release-verification.md) and [Testing strategy](docs/testing.md). Optional browser audits remain available through `audit:a11y`, `audit:responsive:ux`, and `audit:lighthouse:matrix`.

## Operations

Production runs one immutable Docker image on the VPS behind the host Nginx (see the [deployment target](docs/architecture/deployment-target.md)); the host orchestrator is a local development helper only. The production workers are:

- a one-minute leased outbox drain for booking and check-in webhooks (`npm run outbox:drain`);
- a five-minute operational alert and retention run (`npm run operations:check`).

Production startup never loads `.env.local` and requires an explicit trusted-proxy topology. Secrets are injected at runtime from root-owned VPS configuration.

Production runs as non-root containers built from `docker/Dockerfile.security`. `NEXT_PUBLIC_SITE_URL=https://your-host.example npm run docker:build` builds three images of one commit (`scripts/docker-build.sh`): the web runtime `villa-app:<first 12 hex of the commit>`, the workers `…-workers` (both operational workers bundled by `scripts/build-workers.mjs`, no checkout or `node_modules` inside) and `…-migrate` (the Prisma CLI from its own lockfile in `docker/migrate/`, plus this commit's migrations). The tag carries `-dirty` when the working tree has uncommitted changes; the HTTPS site URL is required because Next.js compiles canonical URLs and the sitemap into the output, and the commit is recorded in `public/version.json` and the `org.opencontainers.image.revision` label.

## Documentation

- [Selected deployment target](docs/architecture/deployment-target.md)
- [Release verification](docs/release-verification.md)
- [Trusted ingress contract](docs/security/trusted-ingress.md) and [origin runbook](docs/deployment/origin-ingress-runbook.md)
- [Layered rate-limiting contract](docs/security/layered-rate-limiting.md)
- [Booking claim-token transport](docs/security/claim-token-transport.md)
- [Runtime credential contract](docs/security/runtime-credential-contract.md)
- [Setup and runtime](scripts/README.md)
- [Testing strategy](docs/testing.md)
- [Secret handling and incident response](SECURITY.md)
