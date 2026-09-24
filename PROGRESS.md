# Progress

Review and cleanup of `qr-city-guide`: remove legacy, redundant and unused code and fix what the review found. This file replaces the old REVIEW.md. The full original review text, with the evidence for every finding, is in git history: `git show bd50a80:REVIEW.md`.

## Status
- The review of `main` @ `cfe6ec4` (2026-09-23) produced 103 findings (R-001…R-103).
  - 67 are done and 9 partly done; the fixes are committed in `bd50a80`.
  - The docs cleanup (T26) is uncommitted.
  - Everything open is listed below.
- Last full gate run (T25, 2026-09-24):
  - build, typecheck, lint, lint:security and knip: clean
  - coverage: 353/353 (89.85/83.43/91.52/90.73)
  - integration: 74/74 on a local disposable Postgres
  - release policy: 80/80
  - runtime credentials: 4/4
  - prisma integrity: 24/24
  - SSR smoke test of 13 pages
  - Not run: docker image build, client-side browser checks.

## Notes for the next agent
- Run `source ~/.nvm/nvm.sh && nvm use 22.19.0` first (the shell default is Node 26).
- After deleting routes, run `npm run build` before `npm run typecheck` (`.next/types/validator.ts` is stale until then).
- `scripts/lib/release-policy.mjs` pins package scripts, the 30-gate profile, the Makefile default, systemd and doc markers, and secret-fixture positions.
  - Current fixture positions: `.env.example` 5:15, `security-boundaries.test.ts` 33 and 215, `client-identity-route-regression.test.ts` 149.
  - Change the policy and `config/secret-scanning/current-fixture-allowlist.json` together.
- `test:secret-scanning` fails 7/43 locally only because gitleaks (`GITLEAKS_BIN`) is not installed.
- Gates for each task:
  - Always: the targeted tests, `typecheck`, `lint -- --max-warnings=0` and `npm test`.
  - Also, where they apply: `check:dead-code` (deletions), `validate:release-policy` and `test:release-policy` (pinned files), `build` (config and pages), `test:coverage`, `lint:security`, `test:integration` (DB code; needs Docker).

## Open: owner decisions
- **R-081, R-018 (SUSPECTED), R-017:** these three belong together.
  - R-081: the host-based systemd production path (`deploy/systemd/*`, `install-systemd-services.sh`, the production branches of the orchestrator) is legacy according to the ADR. Either remove it (relax the release-policy markers) or mark it legacy.
  - R-018: the web unit may re-run the bootstrap on every restart and hit EROFS on `prisma generate`. Confirm on a disposable systemd VM.
  - R-017: the orchestrator's bash copy of the env contract (`system-orchestrator.sh:437-584`) should go.
- **R-071:** the Makefile duplicates the `system:*` npm scripts. Delete it (and relax the Makefile check in the release policy) or keep it.
- **R-072:** unreferenced npm aliases (`build:secure`, `security:scan`, `db:generate`, `dev:clean`, `reports:prune`, …). Which ones do you use?
- **R-058:** the DSAR/privacy routes have no UI. Add one, or delete the routes, `requireSubjectOrAdmin` and the related `privacyService` functions.
- **R-059:** `/api/docs` publishes the full route map. Keep it public, gate it behind the admin session, or delete it.
- **R-063:** legacy redirects (`guest/sign-in`, `guest/sign-up`, `/house` → `/apartment`). Delete them once the nginx logs show no hits.
- **R-101:** the ApartmentCinematic "Contact Us" CTA links to `/phones`. Should it link to `/${locale}#contact`?
- **R-023:** conflicting content values. Pick the correct ones:
  - quiet hours: 23:00–08:00 or "after 22:00"
  - beach: walk or drive
  - supermarket distance
  - the amenity lists
- **R-074:** the `.env.example` `DATABASE_URL` differs from the docker-compose credentials. The new value must stay at line 5, column 15, with a password of at least 8 characters.
- **R-008:** how are `Booking` rows created in production?
- **R-009 / R-049:** keep `refreshTokenRepository.verify` and `createRefreshTokenRepository` as test seams?

## Open: needs a migration
Every item here needs `npm run update:prisma-integrity` and an `EXPECTED_MIGRATION` update in `src/app/api/health/ready/route.ts`. The read-only production queries need approval.
- R-015: drop the `checkins` table with a guarded migration that refuses non-empty data.
- R-038: drop `Metric` and `Log`. They have no writers; also remove their `deleteMany` in `operationalMonitor.ts`.
- R-039: indexes that duplicate a PK, a unique constraint or another index's prefix (`schema.prisma`).
- R-040 (SUSPECTED): indexes with no matching predicate. Confirm with `pg_stat_user_indexes`.
- R-041: re-add the index on `outbox_events.stay_request_id`.
- R-042: `User.email` is never written, and the `CheckInRequest` guest fields copy PII. Check production rows first.
- R-043 (SUSPECTED): `OutboxEvent.aggregateType`/`aggregateId` are written but never read.
- R-044: refresh device and IP context is stored twice.

## Open: security-sensitive (needs sign-off)
- R-052: use one `isPortalBookingEligible` in `refreshTokenRepository.ts`, `guestSession.ts` and `portalAuthService.ts`.
- R-053: use one pepper resolver and drop the `claimTokenPepper` → `SECURITY_PEPPER` fallback. Changing `hashSensitive` invalidates refresh tokens.

## Open: needs a browser check
- R-090: the react-day-picker CSS targets v8 class names, but v9.14 is installed (`08-vendor.css`, `12-apartment-checkin.css`).
- R-091: the legacy `.dark` class shim uses `!important` rules (`09-utilities.css:76-110`).
- R-092: `hover:text-brand-*` and `shadow-float-soft` are never generated. Declare them in `@theme`.

## Open: refactors (need approval)
- R-024: merge the phones detail page into `MomentsDetailLayout`. The layouts differ visibly, so this needs a design choice.
- R-025: make the `Dictionary` domains required and delete about 180 literal fallbacks.
- R-050: remove the snake_case mapper/facade layer.
- R-032: `security-config.ts` still validates constants with Zod at runtime and has constant `enabled` flags.
- R-096 (remaining): `pickLocalized` vs `pickLocale`; about 30 locale normalizations vs `normalizeLocale`; duplicated inline SVGs.

## Open: small fixes
- R-103: `isPostgresUrl` (`runtime-env-schema.js`) throws on an invalid URL, so startup shows a raw `TypeError`.
  - Fix: wrap `new URL(value)` in a try/catch and return false.
  - Add unit cases for `''` and `'not a url'`.
- R-061 (SUSPECTED): the portal refresh `?next=` 302 may render the check-in page twice.
- R-078 (SUSPECTED): the orchestrator's env-file parser may differ from dotenv. Compare the two on `A=abc # c`.
- R-102 nits still open:
  - `?error=session_expired` is never read (`adminPageAuth.ts:10`).
  - `guest/page.tsx` repeats the layout's `portalEnabled` check.
  - `admin/refresh/route.ts:22` repeats the role check that the verifier already does (`auth/admin.ts:68`).
  - `portalAuthHttp.ts` parses the JWT it just signed to get `sid`.
  - `CheckInInfo.tsx` has dictionary casts (~L310-313).
  - `check-pepper.js` checks only `.env.local`.
  - SUSPECTED: the dynamic `import('@/lib/prisma')` in `auth/admin.ts` and `guestSession.ts`; `Suspense` around non-suspending children; two analytics offline queues (`analyticsClient.ts` vs `sw.js`); two guest-session read paths.

## Declined (do not redo)
- R-076: gate 28 is a subset of gate 29, but `docs/release-verification.md` forbids inferring away overlapping gates.
- R-064: wrapping analytics/vitals in `withErrorHandler` would change the 429/503 bodies.
- Puppeteer 25: a major upgrade of the audit tooling. 4 dev-only highs remain.
- R-096, `telHref` in ContactSection and leafletPopup: ContactSection requires `href: string`, and in leafletPopup an empty phone gives `tel:` today.
- R-102 nits declined:
  - UUID regex ×3 and serializable retry ×2 (auth and transaction code).
  - The `bookingOutbox` double read: the pre-read feeds the catch path.
  - `slug ?? toSlug`: needs an `ItemSchema` change.
  - The `menuLinks` filter: it guards against empty strings.
  - The legacy `.gitignore` entries: they protect against committing stale local PII.
  - The `sw.js` `@ts-expect-error` lines: `sw.js` is not type-checked.
  - The retired-deps list: its lines are pinned.
  - The `Dockerfile.security` version, the spdx types, `config.test.ts`, and the `check-postgres-image-policy` import from `tests/`: low value.
  - Theme color, the duplicated balcony photo, and the English copy in `PortalRefreshRedirect`: content decisions.
- Rejected candidate findings:
  - The root `instrumentation.ts` IS loaded by Turbopack.
  - The `pg` dependency is needed.
  - The knip "unused files" under `scripts/` are entry points.
  - The `@sentry/node` override is live.

## Not reviewed
- `release-policy.mjs` beyond ~L700 and the other large security tooling files.
- The bodies of `scripts/tests`.
- `deploy/nginx`.
- `sw.js` beyond coupling and asset references.
- Client-side browser behavior.

## Task log
- 2026-09-23/24, T01–T25: review fixes (dependency upgrade, 6 bug fixes with regression tests, legacy auth, orphan routes and observability removal, frontend and tooling cleanup). Committed in `bd50a80`.
- 2026-09-24, T26 (uncommitted): docs cleanup.
  - Deleted `docs/deployment/external-platform-cleanup.md`, `docs/deployment-migration-rehearsal.md` and `scripts/verify-post-migration.sql`.
  - Removed stale facts and phase codes from the docs.
  - Merged REVIEW.md into this file.
  - Gates: release-policy validate and test 80/80, knip, 0 broken doc links, `git diff --check`.
