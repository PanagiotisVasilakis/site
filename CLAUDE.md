# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Kalamata guest guide (`qr-city-guide`): a Next.js 16 App Router app (React 19, TypeScript, Prisma 7 on PostgreSQL 16) serving a localized public guide (`/en`, `/el`, pages under `src/app/[locale]`), booking requests, an authenticated guest check-in portal, and an admin area.

Runtime: Node 22.19.x and npm 11.18.x. `.nvmrc` does not switch Node automatically, so check `node --version` first.

## Commands

```bash
npm ci                     # also runs `prisma generate` (postinstall)
npm run ensure-pepper      # repair local dev secrets in .env.local (never production)
npm run system:up -- --profile development --skip-build   # env check, dev DB (Docker fallback), migrate, start, verify
npm run dev                # `next dev -H 0.0.0.0` (all interfaces); `predev` checks the pepper

npm test                   # full default Vitest suite (no live DB/network)
npm run test:unit | test:security | test:components | test:routes
npx vitest run --config vitest.config.ts tests/unit/portal-booking-eligibility.test.ts   # single file
npx vitest run --config vitest.config.ts -t "test name pattern"     # single test
npm run test:coverage      # enforced thresholds, scope listed explicitly in vitest.config.ts

npm run typecheck
npm run lint -- --max-warnings=0
npm run lint:security      # separate config: eslint.config.security.mjs
npm run check:dead-code    # knip

npm run test:integration   # disposable, digest-pinned PostgreSQL 16 container; needs local Docker
npm run verify:release     # mandatory local release gate (30 ordered gates, needs Docker)
```

- Run the integration suite only through `npm run test:integration`. It creates and tears down its own container and databases, and its guard rejects any caller-supplied or inherited database URL. Never `docker prune` or remove its containers by label alone (see `docs/testing.md`).
- `npm run build` runs `scripts/generate-precache.ts`, `validate-content.ts` and `generate-version.ts` before `next build` (`output: 'standalone'`). `npm start` serves `.next/standalone`.
- `docs/release-verification.md` lists the exact gate order. The repository intentionally has no GitHub Actions workflows, so `verify:release` is enforced only by operator discipline.
- Operational workers: `npm run outbox:drain` and `npm run operations:check` (systemd timers run them every 1 and 5 minutes in production).

## Architecture

**Request entry.** `src/proxy.ts` is the Next 16 proxy; there is no `src/middleware.ts`. It applies nonce-based CSP and security headers (`src/lib/security-middleware-edge.ts`) and adds a locale prefix. `/admin` and `/offline` are not localized. Locales are defined in `src/i18n/config.ts`, and dictionaries are split by domain under `src/i18n/domains/`.

**Content.** Guide content is static data in `src/data/` (categories, items, map locations). The build step validates its localization against `src/i18n/config.ts` locales.

**Persistence.** The Prisma client is generated into `src/generated/prisma` (never edit it) and exposed as a lazily constructed `prisma` proxy in `src/lib/prisma.ts` using `@prisma/adapter-pg`. Some data access lives in `src/lib/prisma-repositories/`, and many routes call `prisma` directly.

**Guest auth.** An administrator issues a short-lived, one-time `BookingClaimGrant` token (`api/admin/bookings/[id]/claim-grants`). The guest claims the booking with phone and password; later sign-ins use those credentials. Guest JWT cookies are backed by DB `Session` rows plus rotating `RefreshTokenFamily`/`RefreshToken` generations with absolute expiry and replay revocation. Key modules are `portalAuthService.ts`, `portalClaimExchange.ts`, `guestSession.ts` and `refreshRotationLock.ts` (a PostgreSQL advisory try-lock). Every flow applies the booking-date eligibility window from `portalBookingEligibility.ts`. `docs/testing.md` documents the concurrency and replay policy in detail. Do not restore the legacy document/surname or untrusted booking-reference authentication.

**Admin auth.** An `admin_jwt` cookie must match an active `AdminSession` (`src/lib/auth/admin.ts`, `adminPageAuth.ts`, `rbac.ts`).

**Outbox.** Booking and check-in webhook notifications are `OutboxEvent` rows created in the same write or transaction as their aggregate. For example, `api/booking-requests` nests the event create inside the `StayRequest` create, then attempts one immediate `deliverOutboxEvent`. `src/lib/bookingOutbox.ts` handles leased claiming, bounded retries with backoff, and a terminal `DEAD` state. Do not replace this with best-effort inline fetches. Keep leased-work ownership checks in the same transaction as aggregate status updates.

**Rate limiting and client identity.** Sensitive limits are PostgreSQL-backed (`sensitiveRateLimit.ts`, `RateLimit` model) and limit both verified client identity and normalized identifiers. Client IP comes from `src/lib/net/`. Production trusts only the loopback Nginx upstream when both the private identity headers and the `ORIGIN_PROXY_SHARED_SECRET` attestation validate. Do not add a mandatory external limiter without a new architecture decision (`docs/security/layered-rate-limiting.md`).

**Environment.** `src/lib/runtime-env-schema.js` is the authoritative schema, and `src/lib/env.ts` wraps it. `instrumentation.ts` validates the environment at server start and throws on failure. Production never loads `.env.local`, runs the orchestrator with `--no-docker-fallback` against a configured reachable database, and fails closed. Never put secrets in `NEXT_PUBLIC_*`.

**Operations data.** Analytics, Web Vitals, security audit events, alerts and privacy requests/holds are database-backed. `operationalMonitor.ts` handles alert rules and retention. Do not add filesystem or module-memory persistence as a production source of truth.

**Health.** `/api/health/live` reports liveness only. `/api/health/ready` checks SQL connectivity and migration state.

## API route conventions

- Validate bodies with strict Zod schemas and explicit body-size limits (`readJsonBody` / `validateRequestBody` in `src/lib/apiErrorHandler.ts`).
- Where a route uses the shared response contract, use `withErrorHandler`, `ApiError` and `createSuccessResponse`.
- Routes authenticate with the admin or guest session cookies. There are no API keys. Never add query-parameter secrets or development auth bypasses.
- Rely on Prisma parameterization, output encoding and CSP. Do not add regex SQLi/XSS blacklist middleware.
- Never persist raw IPs, user agents, cookies, tokens, full URLs with query strings, or arbitrary client metadata (see `redaction.ts`, `privacyHash.ts`).
- The custom lint rule `internal-fetch/no-internal-fetch` forbids `fetch('/...')` to internal routes outside `src/lib/`. It is a warning, but the release gate lints with `--max-warnings=0`.

## Database changes

- Edit `prisma/schema.prisma` and add a forward migration under `prisma/migrations/`. Migrations must fail on ambiguous legacy data, not silently drop data or guess ownership.
- Any schema or migration change breaks `npm run check:prisma-integrity`. Regenerate the committed baseline (`prisma/integrity-manifest.json`) only with `npm run update:prisma-integrity`. `docs/testing.md` also records the current hash values.

## Testing rules

- Put new tests under `tests/unit`, `tests/security`, `tests/components` or `tests/routes`.
- Default tests mock persistence and network at their adapters. Never connect them to PostgreSQL, webhooks, OSRM or other live services, and never make them depend on order or shared state.
- `vitest.config.ts` sets `mockReset`, `restoreMocks`, `unstubEnvs` and `unstubGlobals`, so set mock implementations per test (e.g. in `beforeEach`). `tests/setup.ts` provides test secrets and mocks `next/image`.
- Do not add sleeps, `NODE_ENV=test` behavior, auth bypasses, exported test-only helpers or in-memory production fallbacks. Fix production bugs in production code instead of weakening assertions.
- A new critical module should be added to the explicit coverage `include` list with meaningful tests. Update tests before widening that scope or raising the thresholds, and do not exclude hard-to-test code to keep the percentage.
- The optional `audit:*` browser audits (a11y including color contrast, responsive, Lighthouse) are advisory. Do not weaken production behavior (CSP, headers, auth) to improve an audit score.

## Reference docs

- `docs/` holds the deployment target, trusted ingress, rate limiting, claim-token transport, runtime credential contract and migration rehearsal docs.
- `scripts/README.md` is the setup and runtime runbook.
- The 2026-07-15 audit and remediation records (`01_`–`04_*.md`) were removed from the tree; they are in git history (commit `7a955ea`) and describe code that has since changed.
