# AI agent guide for this repo

This is a Next.js 15 (App Router) TypeScript app with strong security, i18n, and observability. Follow these concrete patterns to stay productive and consistent.

## Big picture
- App structure: `src/app/**` (routes and API), shared libs in `src/lib/**`, i18n in `src/i18n/**`.
- Locale-first routing: URLs are prefixed with `/{locale}`. Middleware manages a `lang` cookie and redirects non-prefixed paths to the default locale (`en`). See `src/middleware.ts` and `src/i18n/config.ts`.
- Security & observability are first-class:
  - Security headers, CSP (nonce support), CORS, and rate limiting live in `src/lib/security-*.ts` and are applied centrally via `createSecurityMiddleware` in `src/middleware.ts`.
  - Distributed tracing (`src/lib/distributed-tracing.ts`) and metrics (`src/lib/metrics-collector.ts`) instrument requests and business events.
  - API handlers share a standard error/response layer in `src/lib/apiErrorHandler.ts`.
- Guest portal architecture: Direct verification flow without challenge steps. Unified page at `/{locale}/guest` supports Sign-in/Sign-up modes with origin selection, phone + AFM/Passport details, and session cookies on success.
- Data model: PostgreSQL with Prisma, featuring users, bookings, identities, MFA, sessions, and access control with comprehensive indexing for performance.

## Developer workflows
- Dev server: `npm run dev` (Turbopack).
- Build: `npm run build` runs pre-build scripts (`scripts/generate-precache.ts`, `scripts/validate-content.ts`, `scripts/generate-version.ts`) then `next build --turbopack`.
- Tests:
  - Unit/UI: `npm test` (Vitest jsdom). Config: `vitest.config.ts` and `vitest.setup.ts`. Coverage: v8 + lcov with thresholds (70% lines, 60% branches, 70% functions/statements).
  - API: `npm run test:api` (custom runner), plus load tests `npm run test:api:load[:normal|:stress]`.
- Linting: `npm run lint`. Security scan: `npm run security:scan` (audit + license + security ESLint).
- Coverage badge: `/api/coverage` serves Shields JSON from `coverage/lcov.info` (generate via tests before build/CI).

## Core conventions
- Path alias: import app code via `@/...` (see `tsconfig.json` and `vitest.config.ts`).
- API routes:
  - Export `GET/POST/...` and wrap with `withErrorHandler(handler, config)` from `src/lib/apiErrorHandler.ts`.
  - For input JSON, validate with Zod via `validateRequestBody(schema)`.
  - When stricter checks are needed (API key, SQLi/XSS), call `createAPISecurityMiddleware({ requireAPIKey, requiredScopes })` at the start of the handler and return early if it responds.
- Errors & responses:
  - Throw `ApiError` (see `ApiErrorCode`) or Zod errors; `withErrorHandler` converts to structured JSON and sets `X-Correlation-ID`.
  - Use `createSuccessResponse(data, status?)` for successful JSON with metadata.
- Observability:
  - Create spans with `tracer.startSpan(name, parent?, tags)` and always `tracer.finishSpan(span, status)`; add logs/tags (`tracer.addLog`, `tracer.addTags`).
  - Record metrics with `metrics.counter/gauge/timer(...)` and high-level helpers like `trackApiCall` and `trackWebVital`.
- Middleware order (in `src/middleware.ts`): security headers/CSP → tracing headers → locale routing/redirects → special redirects. Uses Node.js runtime for server-only modules.

## Security specifics
- Admin analytics gate: `/admin/analytics` requires BOTH `x-admin-secret` (or `?token=`) AND a valid `admin_jwt` cookie verified by `verifyAdmin`. Do not add bypasses.
- Configure CSP/headers in `src/lib/security-config.ts` (per-env). If adding external resources (CDNs, APIs), update the appropriate directive there instead of hardcoding headers.
- Rate limiting: Database-backed (Redis/Upstash) with in-memory fallback; configurable via `src/lib/security-config.ts`.
- Common env vars: `ADMIN_DASH_SECRET`, `ADMIN_JWT_SECRET`, `VALID_API_KEYS` (comma-separated), `ALLOWED_ORIGINS`, `NEXT_PUBLIC_SITE_URL`.

## i18n & routing
- Supported locales: `en`, `el` (`src/i18n/config.ts`). Non-localized paths redirect to `/{defaultLocale}`; the `lang` cookie is kept in sync with URL.
- Legacy redirect: `/{locale}/house` → `/{locale}/villa` (308). Keep redirects centralized in `src/middleware.ts`.

## Analytics & metrics
- PII-safe analytics with minimal set: portal_opened, origin_selected, form_submitted, auth_mode_changed, no_booking_cta_clicked, checkin_viewed, checkin_completed.
- Metrics collection: counters, timers, gauges for system monitoring and performance tracking.
- Health checks: Comprehensive `/api/health` with memory, storage, environment, analytics, and metrics checks.

## When adding features
- New API: create `src/app/api/<name>/route.ts`, wrap with `withErrorHandler`, add Zod validation, apply `createAPISecurityMiddleware` for sensitive endpoints, and instrument with tracing/metrics.
- UI pages: keep locale prefixing in mind; default routes redirect to `/en` (`src/app/page.tsx`). If using inline scripts, rely on CSP nonces from middleware.
- Database changes: Use Prisma migrations; add appropriate indexes for query patterns; follow existing composite index conventions.
- If a new integration needs external origins, update `src/lib/security-config.ts` directives (e.g., `connectSrc`, `imgSrc`).

## Testing patterns
- API tests: Use custom test runner in `src/__tests__/api-test-runner.ts` for comprehensive endpoint testing.
- Load tests: `npm run test:api:load` with normal/stress modes for performance validation.
- Coverage: Enforced thresholds with lcov output; badge served via `/api/coverage`.

If something here seems off or you see a competing pattern in code, point it out so we can refine these rules.