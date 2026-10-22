# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Kalamata guest guide (`qr-city-guide`): a Next.js 16 App Router app (React 19, TypeScript, Prisma 7 on PostgreSQL 16) serving a localized public site (`/en`, `/el`, pages under `src/app/[locale]`: home, apartment, the Kalamata guide, privacy), a public availability page (free and booked nights and the ways to book; no prices, no booking form), the in-stay hub `/{locale}/stay`, an authenticated guest check-in portal, and an admin area.

Runtime: Node >= 22.19 (22.19.x tested) and npm 11.18.x. `.nvmrc` does not switch Node automatically, so check `node --version` first.

## Commands

```bash
npm ci                     # also runs `prisma generate` (postinstall)
npm run ensure-pepper      # repair local dev secrets in .env.local (never production)
npm run system:up          # dev only: env check, dev DB (Docker fallback), migrate, start, verify
npm run dev:proxy          # local stand-in for the Nginx identity headers; open http://localhost:3001
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
npm run smoke:image        # production-image smoke of the built images with docker/docker-compose.prod.yml (isolated project, torn down)

npm run design:hero | design:og | design:icons   # regenerate committed hero crops/depth maps/grain, OG cards, app icons
npm run audit:a11y | audit:responsive:ux | audit:vitals   # advisory browser audits; loopback base URL only
```

- Run the integration suite only through `npm run test:integration`. It creates and tears down its own container and databases, and its guard rejects any caller-supplied or inherited database URL. Never `docker prune` or remove its containers by label alone (see `docs/testing.md`).
- `npm run build` runs `scripts/validate-content.ts` and `generate-version.ts` before `next build` (`output: 'standalone'`). `npm start` serves `.next/standalone`. When a change adds a new CSS `@import` to `src/app/globals.css`, delete `.next/cache/turbopack` before `npm run build`: a stale Turbopack cache can drop the new sheet. Docker builds start clean (`.next` is in `.dockerignore`).
- `docs/release-verification.md` lists the exact gate order. The repository intentionally has no GitHub Actions workflows, so `verify:release` is enforced only by operator discipline.
- Operational workers: `npm run outbox:drain` and `npm run operations:check` in development; in production the `outbox` and `operations` one-off services of `docker/docker-compose.prod.yml` (bundled by `scripts/build-workers.mjs`), scheduled every 1 and 5 minutes by host timers.
- Production is the Docker images only (`docker/Dockerfile.security`: `runner`, `workers`, `migrate` targets; `npm run docker:build`); the host orchestrator is development-only and there is no systemd path.

## Architecture

**Request entry.** `src/proxy.ts` is the Next 16 proxy; there is no `src/middleware.ts`. It applies nonce-based CSP and security headers (`src/lib/security-middleware-edge.ts`) and adds a locale prefix (a first visit without a `lang` cookie gets `el` when `Accept-Language` prefers Greek). `/admin` and `/offline` are not localized. A malformed percent-escape in a path gets a plain `400` with the security headers (Next would answer a bare `500`), and a supported locale in another letter case (`/EN/phones`) gets a `308` to the lowercase path. Retired pages redirect with `308`: `/{locale}/book` and `/{locale}/booking-details` to `/{locale}/availability`, `/{locale}/about` to `/{locale}#host`. Locales are defined in `src/i18n/config.ts`, and dictionaries are split by domain under `src/i18n/domains/`.

**Content.** Guide content is static data in `src/data/` (categories, items, map locations, contact and stay policy). The build step validates its localization against `src/i18n/config.ts` locales. Map tiles (`src/components/maps/tileSource.ts`) are CARTO Voyager/Dark Matter when the optional server env `CARTO_BASEMAPS_KEY` is set, otherwise the standard OpenStreetMap tiles; there is no routing or travel-time service. SEO: per-page metadata (`src/lib/seo.ts`), static OG cards in `public/og/`, `robots.ts` disallows the admin, API and noindex sections (stay, guest, check-in, portal, offline, favourites), and `sitemap.ts` lists only indexable pages. Every guide `heroImage` needs a `heroImageCredit` (author, license, sourceUrl) or the strict content gate fails the build; project artwork listed in `PROJECT_ARTWORK_HERO_IMAGES` (`src/data/schemas.ts`) is exempt.

**Availability and booking.** There is no booking form and no booking-request flow, and the public site shows no price, total, fee or cancellation policy (owner decision of 2026-10-15: the prices are final but are not published). Booking.com is the only booking channel and the only calendar source (owner decision of 2026-10-20). `/{locale}/availability` shows the free nights and the nights that are not available (booked or closed, both shown as booked) from the Booking.com iCal export and applies the minimum stay of the admin rate periods (`RatePeriod`, `api/admin/rate-periods`). The administrator still enters a final price per night, but it is only stored: `readPublicAvailability` (`src/lib/prisma-repositories/availabilityRepository.ts`) never selects `nightlyPriceCents`, so no price reaches a page, its payload, the metadata or the JSON-LD; do not add a price, fee, total or cancellation text to a public page without a new owner decision. `BOOKING_ICAL_URL` is a secret (token in the `t` query parameter): read it only in server modules through an explicit `process.env` access, never in a client file or `NEXT_PUBLIC_*`, never pass it or a URL object to a logger call (R-820), and never store it or put it in an error message. The schema and `src/lib/availability/icalFetch.ts` (start URL and every redirect) accept only https on the default port without userinfo and with a non-empty query, on `ical.booking.com` with the path `/v1/export` or on `admin.booking.com` with the path `/hotel/hoteladmin/ical.html`. The owner creates the export in the Booking.com extranet with booked and closed dates; `syncBookingCalendar` (`src/lib/availability/calendarSync.ts`) fetches it from the operations worker (at most every 30 minutes) or from the admin (`api/admin/availability-sync`) and keeps only dates and error codes in the single `calendar_sync_state` row (id `'booking'`). The calendar counts as stale after 12 hours; while `BOOKING_ICAL_URL` is unset or the calendar is stale, the page shows a notice and the contact options instead of a calendar, and the home nights strip and the mobile BookBar are hidden. Set `BOOKING_ICAL_URL` in production only after the privacy notice (`src/i18n/domains/legal.ts`) names Booking.com everywhere (`git grep -n -i 'air[b]nb' -- src/i18n/domains/legal.ts` must print nothing). Guests book on Booking.com (`BOOKING_COM_LISTING_URL` in `src/data/contact.ts`, a public link that is not the secret `BOOKING_ICAL_URL`; no button while it is not valid) or by phone/WhatsApp. In-stay pages (`/stay`, portal) carry no booking call-to-action. Every link to the hub is built from `STAY_HUB_PATH` in `src/components/shell/shellLinks.ts` (header, footer, 404, offline).

**Design system.** `docs/design/identity.md` is the spec. `src/app/globals.css` imports Tailwind, `src/styles/tokens.css`, `base.css`, `motion.css` and `src/styles/components/*.css` (the Leaflet `map.css` is imported by `LeafletMap.tsx`); there are no legacy style sheets or `dark:` utilities. Every CSS animation must sit behind the motion gate (`:root[data-motion="full"]` inside `prefers-reduced-motion: no-preference`; `tests/unit/motion-css-gate.test.ts`), and new colour pairs go into `tests/unit/design-tokens.test.ts`. Fonts are self-hosted (`src/app/fonts/`, `next/font/local`).

**Persistence.** The Prisma client is generated into `src/generated/prisma` (never edit it) and exposed as a lazily constructed `prisma` proxy in `src/lib/prisma.ts` using `@prisma/adapter-pg`. Some data access lives in `src/lib/prisma-repositories/`, and many routes call `prisma` directly.

**Guest auth.** An administrator issues a short-lived, one-time `BookingClaimGrant` token (`api/admin/bookings/[id]/claim-grants`). The guest claims the booking with phone and password; later sign-ins use those credentials. A host access reset (`api/admin/bookings/[id]/access-reset`) clears a claimed guest's password and sessions and issues a new grant for the same booking; a password-less account can set a password only through a grant for a booking it already owns. Guest JWT cookies are backed by DB `Session` rows plus rotating `RefreshTokenFamily`/`RefreshToken` generations with absolute expiry and replay revocation. Key modules are `portalAuthService.ts`, `portalClaimExchange.ts`, `guestSession.ts` and `refreshRotationLock.ts` (a PostgreSQL advisory try-lock). Every flow applies the booking-date eligibility window from `portalBookingEligibility.ts`. `docs/testing.md` documents the concurrency and replay policy in detail. Do not restore the legacy document/surname or untrusted booking-reference authentication.

**Admin auth.** An `admin_jwt` cookie must match an active `AdminSession` (`src/lib/auth/admin.ts`, `src/lib/adminPageAuth.ts`, `src/lib/rbac.ts`).

**Outbox.** Check-in webhook notifications are `OutboxEvent` rows created in the same write or transaction as their aggregate. For example, `checkInRequestRepository` nests the event create inside the `CheckInRequest` create, then `api/check-in/arrival-request` attempts one immediate `deliverOutboxEvent`. `src/lib/bookingOutbox.ts` handles leased claiming, bounded retries with backoff, and a terminal `DEAD` state. Do not replace this with best-effort inline fetches. Keep leased-work ownership checks in the same transaction as aggregate status updates.

**Rate limiting and client identity.** Sensitive limits are PostgreSQL-backed (`sensitiveRateLimit.ts`, `RateLimit` model) and limit both verified client identity and normalized identifiers. Client IP comes from `src/lib/net/`. Production trusts only the loopback Nginx upstream when both the private identity headers and the `ORIGIN_PROXY_SHARED_SECRET` attestation validate. Do not add a mandatory external limiter without a new architecture decision (`docs/security/layered-rate-limiting.md`).

**Environment.** `src/lib/runtime-env-schema.js` is the authoritative schema. `scripts/start-standalone.mjs` (the image CMD and `npm start`) validates it as production (it sets `NODE_ENV=production` first, because `server.js` forces it too) before loading `server.js` and exits 78 on failure. Production is the Docker image, which never contains `.env*` files (`.dockerignore`) and fails closed at start. In production, start-up also refuses placeholder-like Wi-Fi values (`GUEST_WIFI_NETWORK`/`GUEST_WIFI_PASSWORD` containing `replace`, `changeme`, `placeholder` or `example`) and a `NEXT_PUBLIC_SITE_URL`/`BUILD_SITE_URL` that is not a bare lowercase https origin. Never put secrets in `NEXT_PUBLIC_*`.

**Operations data.** Security audit events, alerts and privacy (erasure) requests are database-backed (there is no analytics or Web Vitals collection; CORS and request-shape violations are logged, not stored). `operationalMonitor.ts` handles alert rules and retention: `GUEST_DATA_RETENTION_MONTHS` (12, `src/data/stayPolicy.ts`; confirmed by the owner on 2026-10-20) after a booking ends, its check-in request contact data is cleared, and a guest account is erased once all its bookings are that old; check-in requests without a booking are cleared that long after their creation. Every retention step runs on its own: a failing one is stored as a high-severity `operations.retention_step_failed` event and makes the run exit non-zero after the others have run. Admin login outcomes are security audit events `admin.login_*` (none high severity, so no alert), and the admin guest export (`getCompleteGuestExport`) is complete per guest, with secrets, hashes and the security log left out on purpose. Do not add filesystem or module-memory persistence as a production source of truth.

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
- Any schema or migration change breaks `npm run check:prisma-integrity`. Regenerate the committed baseline (`prisma/integrity-manifest.json`) only with `npm run update:prisma-integrity`; the integration suite reads the same manifest.

## Testing rules

- Put new tests under `tests/unit`, `tests/security`, `tests/components` or `tests/routes`.
- Default tests mock persistence and network at their adapters. Never connect them to PostgreSQL, webhooks or other live services, and never make them depend on order or shared state.
- `vitest.config.ts` sets `mockReset`, `restoreMocks`, `unstubEnvs` and `unstubGlobals`, so set mock implementations per test (e.g. in `beforeEach`). `tests/setup.ts` provides test secrets and mocks `next/image`.
- Do not add sleeps, `NODE_ENV=test` behavior, auth bypasses, exported test-only helpers or in-memory production fallbacks. Fix production bugs in production code instead of weakening assertions.
- A new critical module should be added to the explicit coverage `include` list with meaningful tests. Update tests before widening that scope or raising the thresholds, and do not exclude hard-to-test code to keep the percentage.
- The optional `audit:*` browser audits (a11y including color contrast, responsive) are advisory. Do not weaken production behavior (CSP, headers, auth) to improve an audit score.

## Reference docs

- `docs/` holds the deployment target (ADR), release verification, testing strategy, the visual identity and design system (`docs/design/identity.md`), and the security contracts (trusted ingress, rate limiting, claim-token transport, runtime credentials, secret scanning).
- `scripts/README.md` is the setup and runtime runbook. `docs/deployment/day-0-runbook.md`, `backup-and-restore.md`, `monitoring-and-alerting.md` and `cloudflare-checklist.md` walk through the first deployment and the host's recurring duties; `deploy/host/` holds the host scripts (`backup.sh`, `run-worker.sh`, `render-nginx.sh`, `check-host.sh`), the logrotate rule and the env-file templates they use. They are installed on the VPS by the operator, are not part of the images, and no installed backup job or restore drill is recorded yet.
- `docs/privacy/` holds the GDPR operating documents (data subject requests runbook, breach runbook, record of processing, processors, proposed notice changes; start with its `README.md`) and `docs/operations/host-handbook.md` the host's day-to-day procedures (bookings, access codes, arrival requests, Wi-Fi, switches, Booking.com). They state behaviour verified against the code (erasure in `src/lib/privacyService.ts`, retention in `src/lib/operationalMonitor.ts`), so change them in the same change as anything that alters what personal data is stored, who receives it, how long it is kept or what an admin action does.
- Open owner inputs are listed in `README.md` ("Open owner inputs"): the owner's wording for Booking.com bookings, the Booking.com export URL (`BOOKING_ICAL_URL`, a secret that the owner sets in the production environment) and the legal review of the privacy notice (`src/i18n/domains/legal.ts` names Booking.com everywhere since 2026-10-21, `git grep -n -i 'air[b]nb' -- src/i18n/domains/legal.ts` prints nothing; the five legal questions (listed in `README.md`) and the wording review stay with the owner or a lawyer; proposed wording is in `docs/privacy/proposed-notice-changes.md`). The host's name, address and ΑΜΑ are supplied (`HOST_CONTACT` in `src/data/contact.ts`), the 12-month guest-data retention is confirmed by the owner (2026-10-20), and the hostess's name stays unpublished (`HOST_PROFILE.name` is `''` by the owner's decision of 2026-10-20). Do not invent values for the open inputs.
- The 2026-07-15 audit and remediation records (`01_`–`04_*.md`) were removed from the tree; they are in git history (commit `7a955ea`) and describe code that has since changed.
