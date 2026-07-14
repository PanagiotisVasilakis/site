# Repository engineering guide

This is a Next.js 16 App Router application using TypeScript, PostgreSQL, Prisma 7, React 19, and locale-prefixed routes (`en`, `el`). Request routing and security headers live in `src/proxy.ts`; there is no `src/middleware.ts`.

## Supported architecture

- Public content is under `src/app/[locale]`.
- Guest activation requires an administrator-issued, short-lived, one-time booking claim token. Do not restore document, surname, or untrusted booking-reference authentication.
- Guest/admin JWT cookies are backed by database sessions. Guest refresh tokens belong to rotating families with absolute expiry and replay revocation.
- Booking and check-in webhook notifications use `OutboxEvent`; writes and events must be transactional. Do not replace the worker with best-effort inline fetches.
- Sensitive rate limits are PostgreSQL-backed and independently limit IP and normalized identifiers. The proxy-wide limiter can use Upstash with an in-process fallback.
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
- Database tests require `TEST_DATABASE_URL`, and the database name must end in `_test`.
- Keep leased work ownership checks inside the same transaction as aggregate status updates.

## Validation

Use the active Node 22.19/npm 11.18 runtime. Normal gates are:

```bash
npm run typecheck
npm run lint -- --max-warnings=0
npm run lint:security
npm run check:dead-code
npm run test:unit
npm run test:db
npm run validate:security
```

The CI browser job additionally starts the production build and gates accessibility, responsive UX, Lighthouse, and PWA behavior. Do not mask warnings or failures with `continue-on-error` or `|| true`.

## Runtime and deployment

- Development/test may use the disposable Docker fallback database. Production must use a configured reachable database and `--no-docker-fallback`.
- Production does not load `.env.local` and requires an explicit trusted-proxy mode/hop count.
- `/api/health/live` is process liveness. `/api/health/ready` checks SQL connectivity and migration state. Do not treat liveness as readiness.
- The systemd timers drain the outbox every minute and run alert/retention maintenance every five minutes.
