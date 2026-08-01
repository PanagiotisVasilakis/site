# Repository engineering guide

This is a Next.js 16 App Router application using TypeScript, PostgreSQL, Prisma 7, React 19, and locale-prefixed routes (`en`, `el`). Request routing and security headers live in `src/proxy.ts`; there is no `src/middleware.ts`.

## Supported architecture

- Public content is under `src/app/[locale]`.
- Guest activation requires an administrator-issued, short-lived, one-time booking claim token. Do not restore document, surname, or untrusted booking-reference authentication.
- Guest/admin JWT cookies are backed by database sessions. Guest refresh tokens belong to rotating families with absolute expiry and replay revocation.
- Booking and check-in webhook notifications use `OutboxEvent`; writes and events must be transactional. Do not replace the worker with best-effort inline fetches.
- Sensitive rate limits are PostgreSQL-backed and independently limit verified client identity and normalized identifiers. Cloudflare and Nginx provide coarse upstream protection; do not add a mandatory external limiter without a new architecture decision.
- Analytics, Web Vitals, security audit events, alerts, and privacy workflows are database-backed. Do not add filesystem or module-memory persistence as a production source of truth.

## API conventions

- Validate request bodies with strict Zod schemas and enforce explicit body-size limits.
- Use `withErrorHandler`, `ApiError`, and `createSuccessResponse` where the route uses the shared response contract.
- Route-level `requireAPIKey` is mandatory in every environment. Never add query-parameter secrets or development auth bypasses.
- Administrator routes use a valid `admin_jwt` backed by an active `AdminSession`.
- Use Prisma parameterization. Do not add regex SQLi/XSS blacklist middleware; rely on schemas, output encoding, and nonce-based CSP.
- Never persist raw IP addresses, user agents, cookies, tokens, full URLs with query strings, or arbitrary client metadata.

## Database changes

- Update `prisma/schema.prisma` and add a forward migration.
- Migrations must fail on ambiguous legacy data rather than silently dropping or guessing ownership.
- Keep leased work ownership checks inside the same transaction as aggregate status updates.

## Validation

Use the active Node 22.19/npm 11.18 runtime. The repository intentionally has no GitHub Actions workflows. Before any commit that may later become a production release, run the complete repository-owned local gate:

```bash
npm run verify:release
```

The gate performs no deployment or persistent migration and requires a local Docker daemon for its disposable PostgreSQL suite. It is enforced by operator discipline rather than a protected pre-merge check. Add tests under `tests/unit`, `tests/security`, `tests/components`, or `tests/routes`. Do not add live external-service dependencies, sleeps, order-dependent shared state, or production test bypasses. Coverage thresholds protect the critical authored-code scope defined in `vitest.config.ts`; update tests before widening that scope or raising the gate. See `docs/release-verification.md` and `docs/testing.md`.

Optional accessibility, responsive, and Lighthouse audits are available through the `audit:*` package scripts. Do not weaken production behavior merely to improve an audit score.

## Runtime and deployment

- Development may use the disposable Docker fallback database. Production must use a configured reachable database and `--no-docker-fallback`.
- Production does not load `.env.local`. It accepts client identity only from the
  loopback-bound Nginx upstream when both private identity headers and the
  `ORIGIN_PROXY_SHARED_SECRET` attestation validate.
- `/api/health/live` is process liveness. `/api/health/ready` checks SQL connectivity and migration state. Do not treat liveness as readiness.
- The systemd timers drain the outbox every minute and run alert/retention maintenance every five minutes.
