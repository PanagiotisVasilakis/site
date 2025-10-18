# Repository Analysis and Developer Guide

This document is a developer-facing guide summarizing the repository structure, important scripts, common development flows, conventions, and notable implementation details. Use this as a quick onboarding / reference for working on this project.

## Project at-a-glance

- Framework: Next.js 15 App Router (TypeScript)
- Language: TypeScript with React 19
- Testing: Vitest (jsdom) for unit/UI tests; custom API test runner
- ORM: Prisma (Postgres support + sqlite for local/dev)
- Packaging: npm (package.json with many dev scripts)
- Observability & security are explicit first-class concerns in the codebase

Root files to know

- `package.json` - scripts and dependency lists

- `next.config.ts` - Next.js configuration and security headers

- `README.md` - basic get-started

- `prisma/schema.prisma` - DB schema

- `src/` - application source (routes, API, libs, components)

- `public/` - static assets and webmanifest

## How to run (development)

1. Install dependencies:

```bash
npm ci
```

1. Start dev server (listens 0.0.0.0):

```bash
npm run dev
```

Notes:

- The `dev` script runs `next dev -H 0.0.0.0` to allow binding on the host network.

- There are convenience scripts such as `dev:clean` to clear Next cache.

## Build & production

- Build: `npm run build` (pre-build scripts run: generate precache, validate content, generate version)
- Build with Turbopack: `npm run build:turbopack`
- Start server (after build): `npm start` (runs `next start`)

The build step runs a few repository scripts first (see `scripts/` for details):
 
- `scripts/generate-precache.ts` - builds precache list used by service worker

- `scripts/validate-content.ts` - static checks/validation for site content

- `scripts/generate-version.ts` - emits a version file used by the app

## Tests

- Unit/UI tests: `npm test` (Vitest)
- API tests: `npm run test:api` (custom runner in `src/__tests__`)
- Load tests: `npm run test:api:load[:normal|:stress]`
- Security tests: `npm run test:security` and `npm run lint:security`

Important test files:

- `src/__tests__/api-test-runner.ts` - API test harness

- Many component and library tests are under `src/__tests__/`

## Linting & Security

- Lint: `npm run lint`
- Security lint: `npm run lint:security`
- Security scan: `npm run security:scan` (audit, license-check, security lint)

The repository includes `eslint.config.security.mjs` and a dedicated security audit pipeline. There are also scripts and docs under `/docs/` for security and deployment.

## Important conventions and architecture notes

- Locale-first routing: URLs are prefixed with `/{locale}`. See `src/i18n/` and `src/middleware.ts` for the routing behavior and `lang` cookie management.
- API handlers follow a standard pattern: export HTTP method functions from `src/app/api/**/route.ts` and wrap with `withErrorHandler` from `src/lib/apiErrorHandler.ts`.
- Zod is used for input validation with `validateRequestBody(schema)` helpers.
- Security middleware composition and CSP headers are centralized (`src/lib/security-*.ts` and `src/middleware.ts`). If you add external origins, update `src/lib/security-config.ts`.
- Observability: tracing + metrics helpers live in `src/lib/distributed-tracing.ts` and `src/lib/metrics-collector.ts` and are used across API handlers.

## Key directories and files (short map)

- `src/app/` - Next App Router routes and API endpoints (localized pages, API routes like `/api/portal/verify`)
- `src/lib/` - Shared libraries: security, auth, prisma, tracing, metrics, utilities
- `src/components/` - React components, both client and server; many client components end with `Client` suffix
- `src/i18n/` - i18n config and dictionaries
- `src/data/` - JSON/fixtures (items, categories, photos) and content schemas
- `src/app/api/` - API routes: health, analytics, admin, portal, metrics, etc.
- `scripts/` - repository scripts for generation, validation, and tooling
- `public/` - static files, manifests, service worker, precache lists

Notable files

- `src/middleware.ts` - central middleware combining security headers, CSP nonce, tracing and locale redirects

- `src/lib/security-config.ts` - configuration for CSP and other headers

- `src/lib/apiErrorHandler.ts` - unified API error handling and success responses

- `src/app/api/coverage/route.ts` - serves coverage badge from `coverage/lcov.info`

- `src/lib/prisma.ts` and `prisma/schema.prisma` - database client and schema

## Dependencies summary (high level)

- Next.js 15, React 19
- Prisma 6 (ORM)
- zod for validation
- vitest for tests
- puppeteer, lighthouse for audits
- tailwindcss + postcss

## Observability & security patterns

- All API handlers are expected to create tracing spans and record metrics.
- Rate-limiting and CORS policies are composable via `src/lib/security-middleware.ts` and applied in `src/middleware.ts`.
- Admin endpoints under `/admin/*` have strict access checks (secret + admin JWT cookie) as described in repository docs.

## CI / DevOps notes

- The build process runs pre-build scripts which must pass for a successful build.
- Coverage badge endpoint relies on tests generating `coverage/lcov.info` in CI before build.
- There is a `Dockerfile.security` for creating a hardened image and a `docker:build` script.

## Known issues / Warnings

- MCP persistent memory writes are currently failing in this environment. Attempts to persist a `user_preferences` entity returned an ENOENT referencing a Windows-style npm cache path (something like `C:\Users\public.Panos\AppData\Local\npm-cache\_npx\...`). This indicates the external memory service or its host/container has a path/OS mismatch. This is an environment/platform issue, not a repository issue.
  - Current status: memory graph is empty and create attempts failed.
  - Recommended action: run platform-level diagnostics (process env, container inspect, logs) and ensure `NPM_CONFIG_CACHE` or other env vars do not point to Windows paths.

## Suggested developer workflow

1. For local development: `npm ci && npm run dev`.
2. Run unit tests with `npm test`; patch/feature work should include tests where appropriate.
3. Run `npm run lint` and `npm run security:scan` before merging.

## Quick troubleshooting

- If Next build fails: run the repository pre-build scripts manually to surface errors: `tsx scripts/validate-content.ts` and review the output.
- If API tests hang: verify the test DB / test runner logs under `src/__tests__/api-test-runner.ts`.
- If you hit CSP/nonce issues for inlined scripts: verify middleware sets CSP nonces and that pages request them correctly.

## Next steps & recommendations

- Platform memory service: resolve the ENOENT / Windows path issue with platform admin or CI image rebuild. Until fixed, plan for in-session-only MCP behavior.
- Add a small CONTRIBUTING.md giving the local developer quick start (node version, `npm ci`, `npm run dev`, running tests). Consider adding `.nvmrc` or `engines` field to `package.json` to pin Node.
- Consider a short `docs/ARCHITECTURE.md` summarizing tracing/metrics patterns and API handler templates.

---

If you'd like, I can:

- Add a `CONTRIBUTING.md` with step-by-step local setup and debugging checklist.
- Generate `docs/ARCHITECTURE.md` with diagrams for tracing and middleware flow.
- Open small PRs to add `.nvmrc` or tidy `package.json` scripts.

File generated automatically by developer assistant on Oct 18, 2025.
