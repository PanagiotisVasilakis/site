# Review 3: deep audit of the committed remediation

Repository: `qr-city-guide` @ `main` `fff4283` (all remediation committed). Review dates: 2026-09-27/28. IDs continue at R-166. Review 2 (R-104…R-165) follows below this review, unchanged; Review 1 (R-001…R-103) is in `git show bd50a80:REVIEW.md`.

**Scope.** The whole repository at HEAD, a regression pass over the remediation diff `e19facc..fff4283` (302 files), research on what Greek/EU law requires of the site, and the running-cost options.

**Method.**
1. Ten area reviewers read the code module by module (guest auth, admin, booking/check-in/outbox, public guide/PWA/i18n, security/runtime, tooling/release/Docker, tests/schema, dead-code sweep, remediation diff in `src`, remediation diff outside `src`). The lead added three findings from inline checks.
2. Every finding was judged by two independent verifiers per file group: one tried to refute it and calibrated severity and fix, one re-derived the evidence (re-read lines, ran single test files, grep, typecheck). A finding was dropped when the verifiers refuted it or named an earlier R-id it repeats.
3. A completeness critic named five unreviewed areas (dependencies/advisories, integration and script test bodies, shared-state concurrency, user-facing guest text, the stylesheets read line by line); a second round of reviewers covered them and was verified the same way.
4. Two researchers checked Greek short-term-rental law and data-protection/e-services/consumer law against the site's actual content; two more researchers re-sourced every legal claim. One analyst priced the hosting options; a second re-checked every price and the PostgreSQL-dependency list.
5. The lead re-verified the most visible finding (R-166) and the version claims independently on 2026-09-28, and calibrated R-166 from High to Medium (see its Verification): the CSS specificity behind R-166 (the card CTA is an `<a>`; the dark blanket rule has specificity (0,15,1) against (0,2,0)); Docker Hub API (`postgres:16.15-alpine` = `sha256:721873c3…`, published 2026-09-21, while the pin `57c72fd2…` is 16.14; `node:22.23.3-alpine` published 2026-09-23 while the pin is 22.23.1); nginx.org advisories (CVE-2026-42533, major, 0.9.6–1.31.2, fixed only in 1.30.4+/1.31.3+). R-168, R-169, R-172, R-175/R-176 and R-177 were also re-read by the lead in the code.

Everything ran read-only. No code was changed by this review.

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 25 |
| Low | 94 |
| Nit | 15 |
| **Total** | **134** (125 CONFIRMED, 9 SUSPECTED) |

Recorded during execution (2026-09-28, task R3-01): R-300…R-311, 12 findings (3 Medium, 9 Low; 10 CONFIRMED, 2 SUSPECTED), in the section "Findings recorded during execution" below the Nits. Added later: R-312 (Low, CONFIRMED; from the R3-F09 review, fixed in R3-F10).

Some findings describe the same defect from two reviewers; they are kept with both IDs so that the verification trail stays intact, and a fix task closes the whole group: R-175/R-176, R-219/R-220, R-167/R-171, R-174/R-186, R-178/R-241, R-199/R-266, R-202/R-286, R-226/R-228, R-229/R-230/R-231/R-238, R-234/R-235, R-244/R-255, R-285(c)/R-297.

### Verdict

After two remediation rounds the core of the application holds up under review: the finders re-read the guest-claim and refresh-rotation state machines, the outbox lease/DEAD lifecycle, the admin session lifecycle, the erasure path for portal guests, the PostgreSQL-backed rate limiting with HMAC keys, the trusted-ingress identity boundary, the nonce CSP, the fail-closed environment schema, and the schema-versus-migration alignment, and recorded them as sound. No Critical finding was raised. Review 3 records 134 findings: no Critical or High, 25 Medium, 94 Low and 15 Nit, of which 125 are CONFIRMED and 9 SUSPECTED. Several of them are duplicates or overlaps (R-175/R-176, R-219/R-220, R-167/R-171, R-174/R-186, R-178/R-241, R-199/R-266, R-202/R-286, R-226/R-228, R-229/R-230/R-231/R-238, R-234/R-235, R-244/R-255, R-285(c)/R-297), so the number of distinct defects is lower. The remaining defects are of a different kind from those in the earlier rounds. The most visible defect is a dark-mode cascade bug that makes the main card CTAs unreadable (R-166; rated High by the automated median, calibrated to Medium by the lead, see its Verification). The rest is a cluster of dark-mode contrast failures, legal and privacy content the site does not have at all (no registration number, provider name, privacy notice, or retention and erasure path for enquiry-only data), version and digest pins that have drifted behind security releases or behind the schema (readiness migration constant, PostgreSQL 16.14, Node 22.23.1, Nginx 1.28.3, migrate-image lockfile), and a handful of server-side validation gaps where the page enforces more than the API does. The long Low/Nit tail is mostly leftovers from the deletions: dead branches, keys, CSS and error codes, stale docs, and release/test tooling whose size is out of proportion to a one-apartment site. Three findings carry verifier disagreement (R-197, R-207, R-239) and resolve to no change or an owner decision. None of the integration, Docker, browser or `verify:release` gates were re-executed in this review. Their pass state is taken from PROGRESS.md.

### Main themes

- Dark-mode cascade and contrast: a blanket anchor/span colour rule in 09-utilities and missing dark tokens override component colours. This causes the most visible finding (R-166) and a series of AA failures (R-187, R-188, R-189, R-190, R-223, R-274, R-275, R-277, R-279, R-282).
- Legal and data-lifecycle gaps. The site collects personal data but has no privacy notice or provider identity, no property registration number, no retention for StayRequest/CheckInRequest, and no erasure path for enquiry-only guests (R-167, R-171, R-174, R-186, R-195). A third-party routing dependency conflicts with its usage policy (R-173).
- Pins and drift. The readiness check pins a migration five releases old (R-175/R-176). Base images and dependencies lag security releases (R-181, R-182, R-183, R-184, R-185). Install-script and override policy is advisory or stale (R-257, R-258), and one release gate is hard-pinned to a Next version (R-242).
- The client-server contract is enforced on the client only, or inconsistently: past and over-long stays (R-169), non-UUID ids and unvalidated query params (R-199, R-266), phone and length limits (R-208, R-273), arrival requests after the stay starts (R-268), and a 401 handled with verbatim English errors (R-191, R-192).
- Leftovers from the S/C deletions: dead exports, keys, CSS, error codes and config surface (R-214, R-216, R-217, R-219/R-220, R-224, R-229, R-230, R-231/R-238, R-250, R-280), plus docs that now contradict the code (R-244/R-255, R-180, R-254).
- Tooling out of proportion to a single-apartment site: the Dockerfile runtime-closure analyzer and source-text pins (R-179, R-240), the disposable-DB guard layers (R-249), the Prisma idle-disconnect machinery (R-235/R-234), and map/OSRM configurability nobody uses (R-211, R-212, R-213).

### Areas reviewed

- **guest-auth**: src/lib/portalAuthService.ts (all 349 lines): claim issuance, access reset, exchange preparation, Serializable claim consumption with retry, sign-in; src/lib/portalClaimExchange.ts, src/lib/portalAuthHttp.ts, src/lib/guestSession.ts, src/lib/refreshRotationLock.ts, src/lib/portalBookingEligibility.ts, src/lib/portalRefreshClient.ts, src/lib/sessionSignals.ts, src/lib/guestTermsText.ts (+ guestTerms.ts), src/lib/guestDataStore.ts — read completely; src/lib/prisma-repositories/refreshTokenRepository.ts (all 659 lines): create/verify/rotate/contention cleanup/revocations, X2 audit signal; src/app/api/portal/{refresh,logout,sessions,claim-exchange,claims}/route.ts — read completely, traced to….
- **admin**: src/lib/auth/admin.ts, src/lib/rbac.ts, src/lib/adminPageAuth.ts (rbac.ts lives at src/lib/rbac.ts, not src/lib/auth/): JWT sign/verify, DB-backed session TTL (2 h sliding, 24 h absolute), refresh/revoke; src/lib/adminListPage.ts + src/lib/prisma-repositories/checkInRequestRepository.ts list(): keyset cursor over (createdAt desc, id desc), take limit+2, cursor-row filter; src/lib/privacyService.ts end to end against prisma/schema.prisma (cascades: Session, RefreshToken*, TermsAcceptance; SetNull: Booking, CheckInRequest, PrivacyRequest), the partial unique index migration 20260715104000, outbox delivery payload construction in src/lib/bookingOutbox.ts:55-90, stay-request payload `{ stayRe….
- **booking-checkin**: src/app/api/booking-requests/route.ts (schema, idempotency replay, P2002 race, immediate delivery) — full file; src/lib/bookingOutbox.ts (claim/lease, backoff math, DEAD transition, DELIVERED/failed transactions with ownership check, drain + abandoned-lease recovery, concurrency) — full file; src/lib/operationalMonitor.ts (3 alert rules, breach/resolve/notify loop, retention tuple) — full file; src/lib/featureFlags.ts, scripts/drain-outbox.ts, scripts/run-operational-maintenance.ts — full files; worker exit codes and Prisma disconnect behaviour (src/lib/prisma.ts L150-L275, @prisma/adapter-pg 7.8.0 connect()/dispose()); src/app/api/check-in/arrival-request/route.ts, src/app/api/check-in/p….
- **public-guide**: src/app/layout.tsx, src/app/page.tsx, src/app/error.tsx, src/app/[locale]/{layout,page,error,not-found}.tsx, [category]/page.tsx, [category]/[slug]/page.tsx, about, apartment, book, booking-details, favorites, offline pages, src/app/offline/page.tsx, sitemap.ts, robots.ts, src/proxy.ts (read in full); src/components: TopControls, ThemeToggle, LocaleSwitcher, DocumentLocale, Toast, StatusCluster, DeferredRuntimeManagers, PwaManager, OfflineActions, navigation/*, HomeHero, HomeInteractiveBar, DeferredHomeInteractiveBar, DeferredContactSection, ContactSection, home/HomeFeatureGrid, ShareButton, DescriptionBox, ResponsiveImage, Skeleton, LoadingSkeleton, MapLoadingSkeleton, ErrorSummary, ui/*….
- **security-runtime**: src/proxy.ts (86 lines, complete); src/lib/security-middleware-edge.ts (179, complete) incl. CSP/nonce propagation via the `Content-Security-Policy` request header (verified against node_modules/next/dist/server/app-render/app-render.js:209) and the CORS preflight/actual-request paths; src/lib/security-config.ts (282, complete): CSP directives, Permissions-Policy serializer, HSTS, CORS, apiSecurity block; src/lib/api-security-middleware.ts (63) and all ten route call sites; src/lib/security-monitoring.ts (176): sanitizeEvent, persistSecurityEvent, logSecurityDiagnostic, handleCSPViolation; src/lib/apiErrorHandler.ts (561, complete): withErrorHandler deadline/abort logic, error mapping, re….
- **tooling-release**: package.json (scripts, dependencies, overrides, engines, allowScripts) with `npm ls` for every overridden and anchored package; docker/Dockerfile.security (all four stages), docker/docker-compose.prod.yml, docker-compose.yml, docker/migrate/package.json (+ tests/unit/migrate-image-manifest.test.ts), .dockerignore, .gitignore, .env.example vs src/lib/runtime-env-schema.js (each key's code references counted); deploy/nginx/nginx.conf.template, image.lock.json, cloudflare-ips.json (offline check logic), test-nginx-ingress.sh, check-cloudflare-ips.mjs; scripts/verify-release.mjs, scripts/lib/release-gates.mjs, scripts/lib/release-policy.mjs (all 2391 lines), scripts/tests/release-policy.test.….
- **tests-schema**: prisma/schema.prisma (all 384 lines) compared model by model with the DDL of all 19 migrations under prisma/migrations (read in full) plus migration_lock.toml: column types/lengths, defaults, FK names and ON DELETE actions, enum renames, dropped tables/columns, indexes and SQL-only objects (CHECKs, partial unique indexes, trigger); prisma/integrity-manifest.json (schema sha256 recomputed with shasum and matched; file count 20 = 19 migration.sql + lock) and prisma.config.ts / prisma.integration.config.ts; All destructive migrations (20260715110000, 20260924122000, 20260924123000, 20260924124000) for data-loss guards; data-migration steps in 20260714090000, 20260714145900, 20260714150000, 2….
- **dead-redundant**: knip: `npm run check:dead-code` (files, dependencies, unlisted, binaries) → clean; `knip --include exports,types,nsExports,nsTypes,enumMembers,duplicates` → clean; `knip --production` → only known false positives (scripts entry points, `pg`, `createRefreshTokenRepository` kept per O9); Environment keys: every `runtimeEnvSchema` key and every `.env.example` key traced to a `process.env` read (`grep -w` per key over src/instrumentation.ts/next.config.ts/prisma.config.ts, then docker/scripts for BUILD_SITE_URL); plus reverse search for undeclared reads (NEXT_PUBLIC_BUILD_VERSION); i18n: all 383 leaf keys of the merged dictionary checked against src usage with an inline tsx script, dynamic ac….
- **diff-src**: git diff e19facc..fff4283 -- prisma: schema.prisma (all hunks) and the five new migrations (index, drop redundant indexes, guarded drops of dead tables / checkins / refresh-token hints); cross-checked with src/app/api/health/ready/route.ts and integrity manifest count; src/app/api/**: admin bookings + access-reset + claim-grants, admin guests erase, admin check-in-requests (list + PATCH), admin stay-requests (list + PATCH), admin flags/refresh/guests, booking-requests (calendar dates + idempotent replay), check-in arrival-request/preferences, portal claims/refresh/sessions, security/csp-report (full diffs, callees traced); src/lib/**: adminListPage, portalAuthService (resetGuestAccess, cl….
- **diff-tooling**: git diff e19facc..fff4283 for the requested paths, read hunk by hunk: .dockerignore, .env.example, .gitignore, CLAUDE.md, README.md, config/secret-scanning/current-fixture-allowlist.json, deploy/nginx/nginx.conf.template, deploy/systemd/* (deleted), docker/Dockerfile.security, docker/docker-compose.prod.yml, docker/migrate/package.json + package-lock.json (versions cross-checked against the root lock), docs/architecture/deployment-target.md, docs/deployment/production-image-smoke.md, docs/security/*.md, docs/testing.md, eslint.config.mjs, eslint.config.security.mjs, vitest.config.ts, package.json; package-lock.json compared programmatically (old vs new `packages`): 27 added = esbuild@0.28….
- **Gap round** (named by the completeness critic): Dependencies and supply chain: no reviewer checked current advisories or version currency; Integration test bodies and script-test bodies (Tests dimension); Concurrency and performance of shared state that no reviewer examined line by line; User-facing guest text and check-in UI that no reviewer read in full; Stylesheets never read line by line: 02-layout (573 lines), 05-primitives, 06-semantic-surfaces, 07-search-listing, 08-vendor outside the marker section, 10-moments outside the tone classes (854 lines), 11-contact, 12-apartment-checkin (762 lines) and 13-compatibility-admin.

Areas the reviewers read and found sound (one line each):

- Claim transport matches docs/security/claim-token-transport.md: token only in a same-origin JSON body, digest cookie HttpOnly/Strict/path=/api/portal, maxAge = min(5 min, grant remaining) (portalClaimExchange.ts:L8-L36), cleared on every claim response and…
- Claim consumption state machine (portalAuthService.ts:L200-L300): Serializable transaction with P2034 retry, one-time consumption via conditional updateMany (L246-L255), ownership check via `OR: [{ userId: null }, { userId }]` (L257-L264), sibling revocatio…
- Eligibility window (portalBookingEligibility.ts): pure UTC calendar arithmetic on DATE columns, immune to DST and elapsed hours; the same helper is used by issuance, exchange, claim, sign-in, session verification and rotation (C8). Boundaries fall at 02:00/…
- Refresh rotation and replay: owner path revokes the whole family graph (tokens + paired sessions) on predecessor replay and records the X2 high-severity event in the same transaction (L406-L414); unbound generations, session-binding mismatches and ineligibl…
- Cookie flags: guest cookies HttpOnly, Secure in production, SameSite=Lax (required so an SMS link to /check-in still carries the session), path=/ (the server page reads `guest_rt` presence at check-in/page.tsx:L53); the refresh 401 clears both cookies (refr…
- N1d refund: `refundSensitiveIdentifierAttempt` uses the same `limiterKey`/`normalizeIdentifier` as the check (sensitiveRateLimit.ts:L28-L36, L92-L98), decrements only the identifier dimension, only inside the current window, and a failure after a successful…
- Authorization: every admin mutation and list route checks the DB-backed admin session (`isAdminRequest`/`verifyAdminSession`) before any work; claim-grants and access-reset additionally require `session_id` and record `issuedByAdminSessionId`
- Session lifecycle: login TTL (JWT 2 h, cookie 7200 s, AdminSession expiresAt) is consistent; refresh caps at `min(now+2h, absoluteExpiresAt)` and re-signs with matching cookie maxAge; logout revokes by session id; layout passes the real server expiry and th…
- Pagination: `adminListPageArgs`/`toAdminListPage` are correct for ties (id tiebreaker), for a cursor row that stopped matching the filter, and report the filtered `total` separately; the clients de-duplicate on Load more and guard stale responses with versi…
- Erasure completeness for portal guests: user row deleted (sessions, refresh families/tokens, terms cascade), bookings unlinked and grants revoked, check-in copies nulled, matching stay requests redacted and CLOSED, undelivered outbox events cancelled with a…
- guestDataCache invalidation is keyed on `count:max(updatedAt)` per table, so booking creation, claim, access reset and erasure all bust it; no stale admin list after the admin's own writes
- Admin login: constant-time secret compare, PostgreSQL-backed limiter (5/15 min), body validated before limiting, cookie httpOnly/SameSite=Strict/secure in production; 400/503/429 messages surfaced by the client (B25)
- bookingOutbox state machine: claim is a conditional updateMany (PENDING + due), success/failure updates check `status: 'LEASED', leaseOwner` in the same transaction as the StayRequest status change; backoff 1,2,4,8,16,32,60… min, DEAD after the 10th attempt…
- Idempotency (B30): the stored row is the normalized payload, replay compares dates by instant and the other fields strictly, the P2002 race path applies the same check — correct and tested.
- Calendar-date handling (A4): `yyyy-MM-dd` → `calendarDateToUtc` → DATE column; admin renders with `timeZone: 'UTC'`; BookingForm receives strings and parses them client-side only for display; SearchBar/dateUtils round-trip through `format`/`parse` in the sa…
- react-day-picker `disabled={[{ before: new Date() }]}`: the matcher uses `differenceInCalendarDays`, so today stays selectable; `min={1}` prevents the 0-night range (A5). `react-day-picker/dist/style.css` is a declared export of 9.14.0 (maps to src/style.cs…
- featureFlags: effective check-in flag coupled to the portal flag (B20); JSONB merge upsert is parameterized; production defaults closed.
- Check-in preferences / Wi-Fi window: strict HH:MM (B7), `wifiDisclosureWindow` converts property wall-clock in `PROPERTY_TIME_ZONE` with a DST-safe fixed-point loop, `wifiAvailableAt` returned and rendered (B8); admin always sees Wi-Fi.
- public/sw.js: network-first navigations, private prefixes (/admin, check-in, guest, portal) never stored, redirected/non-basic responses excluded, offline fallback per locale, build-scoped cache name and cleanup; the StatusCluster probe (/app.webmanifest?pr…
- src/proxy.ts: locale redirect + cookie sync, security headers copied onto the redirect, /admin and /offline excluded; robots.ts/sitemap.ts consistent with the private sections (check-in/guest/portal not in the sitemap, disallowed in robots).
- [locale]/not-found.tsx and error.tsx derive the locale from the pathname consistently on server and client; root error.tsx reads window only inside a client-rendered boundary.
- src/lib/favorites.ts: useSyncExternalStore with a stable server snapshot, storage-event sync, try/catch around localStorage.
- src/lib/data.ts path confinement (allowlist regex + resolve prefix check) and safeParse-per-item resilience; src/data/items JSON validates against ItemSchema (all fields used are declared; website/directionsUrl values are absolute URLs).
- src/lib/jsonLd.ts escaping of <, >, &, U+2028/2029; nonce passed to every inline JSON-LD script.
- Identity trust boundary (getClientIp/requireCanonicalClientIp): constant-time attestation compare, single-literal IP canonicalisation incl. IPv4-mapped IPv6, comma (duplicate header) rejection, and `x-forwarded-proto` trusted only with a valid attestation a…
- Nonce propagation: a fresh 128-bit nonce per request, placed in the `Content-Security-Policy` request header (the mechanism Next 16.3.6 reads) and in `x-nonce` for layout.tsx and the two pages that render inline scripts; `report-uri` points at the rate-limi…
- Header set per route type: security headers on every proxied path including `/api/*`; `/api/health/*` skips only the CORS surface; `/{locale}/guest` gets `Referrer-Policy: no-referrer` and `/{locale}/check-in` gets `X-Robots-Tag` after the base headers, so…
- Fail-closed paths: `start-standalone.mjs` validates the full schema before importing server.js (exit 78), `instrumentation.ts` repeats it for `next dev`, production requires `ORIGIN_PROXY_SHARED_SECRET` (64 hex, non-placeholder), HTTPS site/webhook URLs, th…
- Rate-limit key derivation: `sensitive:HMAC(pepper, 'sensitive-rate-limit:v1' ‖ scope|dimension)`, so raw IPs/phones never reach the `rate_limits` table; all dimensions update in one transaction with a 5 s timeout and any DB failure maps to a generic 503 bef…
- Error-response information leakage: `withErrorHandler` returns a fixed message for unexpected errors, logs the real error server-side (stack only outside production), and identity failures map to a generic 503 without header values; `ValidationError` expose…
- scripts/verify-release.mjs: argument-vector spawn, process-group termination with SIGKILL fallback, restricted environment (env-file key names masked to '', hostile DB values), orphan check after an integration failure; behaviour matches docs/release-verifi…
- docker/Dockerfile.security: non-root uid 1001 in all runtime stages, npm/npx/yarn removed, read-only-compatible layout (only .next/cache/images writable), HTTPS build-arg and 40-hex commit enforced, PUPPETEER_SKIP_DOWNLOAD in the builder, workers bundled wi…
- docker/docker-compose.prod.yml: loopback-only publishes, read_only + cap_drop ALL + no-new-privileges on every app container, ops profile for one-off services, db health gating; docker-compose.yml dev DB matches ensure-pepper's fallback URL.
- scripts/docker-build.sh, image-tag.sh, docker-scan.sh: correct quoting, `set -Eeuo pipefail`, `-dirty` marking, digest-pinned base images; `${VAR:+--platform "$VAR"}` idiom is correct.
- scripts/build-workers.mjs, prepare-standalone.mjs, start-standalone.mjs (exit 78 on invalid env, no secret output), generate-version.ts, validate-content.ts, check-pepper.js, test-runtime-credential-contract.mjs, check-candidate-diff.mjs, check-conflict-mar…
- scripts/dev-proxy.mjs: refuses NODE_ENV=production, requires 64-hex secret, strips client-supplied private headers, loopback-only listen and target, HMR upgrade handled.
- Schema vs migrations: every model field, @db type, default, FK name/ON DELETE, unique map and index in prisma/schema.prisma matches the cumulative DDL of the 19 migrations (incl. OutboxStatus renames PROCESSING->LEASED/FAILED->DEAD, webhook_outbox->outbox_e…
- Destructive migrations all fail closed on non-empty tables (20260715110000, 20260924122000, 20260924123000) or on differing duplicates (20260924124000); data migrations raise on ambiguous ownership, duplicate references, invalid phones, multi-user refresh f…
- Integrity manifest is current: sha256 of prisma/schema.prisma equals manifest.schema.sha256 (0e03a796...); 20 files listed match the tree.
- Retention/cleanup queries use a leading index column in every case (rate_limits.reset_time, sessions.expires_at, refresh_tokens.expires_at, refresh_token_families.absolute_expires_at, booking_claim_grants.expires_at, outbox_events.status, admin_sessions.abs…
- Outbox worker queries (status+next_attempt_at, lease_expires_at, stay_request_id, check_in_request_id) and portal login (`idx_bookings_user_dates`, `users_phone_e164_key`) have matching indexes; R-041's index is restored and asserted by tests/integration/ou…
- tests/unit/booking-outbox.test.ts drives the real state machine through an in-memory table fake (claim, backoff 2^(n-1) minutes, DEAD after 10 attempts, lost-lease guard, abandoned-lease recovery) rather than asserting mock calls; the R-146 gap is closed.
- All 30 runtime env keys are read somewhere (ADMIN_DASH_SECRET in admin/login, BUILD_SITE_URL as a Dockerfile build arg checked at runtime, LOG_* and PRISMA_* in their modules); `.env.example` and the schema agree key for key
- All 55 files under public/ are referenced (house photos via ApartmentCinematic data, moments/phones heroes via JSON, icons via manifest + sw.js + layout); sw.js precaches only existing offline pages and icons; app.webmanifest points at existing icons
- 380 of 383 i18n leaf keys are read (dynamic `momentTags[...]` and `labels` objects accounted for); no orphan domain files
- CSS: 247 of 275 classes are referenced directly, 6 are built dynamically with matching CSS, 18 are Leaflet/react-day-picker/markercluster vendor selectors that the libraries emit
- npm scripts: every script has a runner or documented manual use; the low-reference aliases (`dev:clean`, `build:secure`, `security:scan`, `reports:prune`, `db:*`, `system:*`) were explicitly kept by the owner (O8/R-072) and are not re-reported; `reports:pru…
- All 17 Prisma models are referenced by application or worker code; `OperationalSetting`/`RateLimit` via raw SQL plus retention
- prisma: the five migrations match the schema diff hunk by hunk; guards use `to_regclass`/`EXISTS` and refuse non-empty data; index drops each have a covering key/longer index in the schema; `@default(now()) @updatedAt` alignment is schema-only
- Admin bookings route: strict Zod, `z.iso.date()` (zod 4.4.3 installed), UTC-midnight storage, P2002 → 409, 401/403 split consistent with N1a
- Access reset (B2): one transaction clears password, revokes families/tokens/sessions, replaces the REMOTE grant, writes a medium audit event; the claim's password-less branch now requires booking ownership (R-160 guard present at portalAuthService `consumeB…
- Idempotent replay (B30): normalized record built once, compared field-by-field on both the lookup and the P2002 race path; 422 on mismatch
- Pagination helper (B5): `take: limit + 2`, cursor row dropped by id, `nextCursor` only when more remain; both routes return `total` for the filter
- Feature-flag coupling (B20): `effective()` applied on read, JSONB merge on write keeps the stored check-in value; settings UI sends only the toggled key
- package-lock.json: no changes beyond the stated esbuild hoist and the web-vitals removal; docker/migrate lockfile pins prisma 7.8.0 / dotenv 17.4.2 equal to the root lock and @prisma/client 7.8.0
- Secret-scanning allowlist migration to `valueSha256`: check-secrets.mjs keys on path+rule+value with one entry per occurrence and reports leftovers as stale; release-policy pins the same 11 entries; the `.env.example` entry was rightly dropped because `devp…
- release-policy relaxations are consistent with the deletions: the systemd/orchestrator loopback markers and the Makefile check guarded files that no longer exist; the orchestrator regex now rejects any `production` profile and a negative test was added
- Every changed test assertion has a matching code change (theme `data-theme` + Tailwind custom variant, retention operation order, booking form string dates, dropped refresh-token hint columns, removed OpenAPI/internalFetch/analytics modules); none was weake…
- Dockerfile.security: runner stage unchanged and still matches the pinned release-policy strings (USER 1001:1001, ENTRYPOINT dumb-init, HEALTHCHECK, ENV); workers and migrate stages run as uid 1001 with package managers removed; `.dockerignore` excludes dist…
- docker-compose.prod.yml: one digest-pinned PostgreSQL image, web on 127.0.0.1:${WEB_PORT:-3000}, hardened anchor (read_only, no-new-privileges, cap_drop ALL) applied to all four application services, ops profile for one-off services, required-variable error…

### Areas NOT reviewed and why

- Integration suites (tests/integration/**) were not executed. They need the Docker PostgreSQL container, which the read-only pass forbade. The seven large auth suites (~6,000 lines) were skimmed by structure only, and the outbox-dead-lifecycle suite was read for test names only (guest-auth, booking-checkin, tests-schema).
- Full `npm test`, `npm run lint`, `lint:security`, `build`, `docker build`, `smoke:image`, `test:nginx-ingress`, `node --test scripts/tests/*` and `verify:release` were not re-run. Their pass state (verify:release 30/30 at fff4283) comes from PROGRESS.md. Only typecheck, knip and a few targeted test files were executed (52/52, 59/59, 14/14). `build-workers.test.ts` was not executed because it writes a scratch directory into the repository root.
- `npm audit` was not run: the sandbox hit a registry TLS error, and the run needs owner approval. All statements about current advisories rest on PROGRESS.md (tooling-release, dead-redundant).
- No browser rendering at all. Dark-mode contrast values, hydration, focus order, service-worker behaviour, the PwaManager fallback and LeafletMap effect order were reasoned from code and computed token values. No axe or Lighthouse run was made (public-guide, diff-src, dead-redundant).
- CSS files 02, 05, 06, 07, 08 (outside the marker section), 10 (outside tone classes), 11, 12 and 13: the public-guide finder covered them only with the automated dead-selector scan, and diff-src read only added lines. Specificity and `!important` legacy in those files was therefore not read line by line, although targeted findings exist in several of them.
- Nginx runtime behaviour (real_ip/geo, ssl_verify_client, dry-run limits), the live Cloudflare IP lists (`--current` needs network), and whether the scripts/README crontab `timeout` actually stops and removes the compose container (needs Docker).
- `prisma migrate diff` against a fresh database was not re-run. The SQL-only objects (CHECKs, partial unique indexes, phone trigger) were not re-verified against Prisma introspection. `pg_stat_user_indexes` for the remaining R-040 candidates was not taken, because no production database is reachable.
- Whether the admin PII export (`action=export`) response carries `Cache-Control: no-store` by default in Next 16 was not verified. Whether Prisma 7 + adapter-pg `QueryEvent.query` ever contains parameter values was not verified either.
- The 'Stale pending outbox' alert's use of createdAt for a re-queued DEAD event (a possible transient false alert after an admin retry) was noticed but not modelled end to end.
- Internal line-by-line redundancy of the auth and outbox core (portalAuthService, guestSession, portalClaimExchange, bookingOutbox, privacyService, refreshTokenRepository, checkInRequestRepository, clientIdentity) was not audited by the dead-code pass. Those modules were reviewed for correctness by the area finders.
- Page components and admin clients were checked by the dead-code pass only at grep level. src/data/mapLocations.ts and the item JSON were traced only for the options in use. The unrendered-data-field claim R-095 was not re-verified.
- Content accuracy (phone numbers, addresses, coordinates, cancellation policy versus the Airbnb listing) was not checked against external sources.
- Legal primary sources were largely unreachable: aade.gr returned HTTP 403, e-nomothesia.gr refused the connection, EUR-Lex returned empty pages, and several PDFs could not be parsed locally. Legal statements therefore rest on secondary reproductions (taxheaven, lawspot, gdpr-info, dpa.gr, stegasi.gov.gr) and are flagged as such in the legal section.

### Not reported

Candidates that the verifiers refuted or identified as repeats of recorded findings:

- `GuestRefreshTokenRec` snake_case mapping survives only to feed log lines (repeats R-050). `src/lib/prisma-repositories/refreshTokenRepository.ts:L13-L24, L82-L106 (already recorded under R-050 / PROGRESS S5)`
- R-040 follow-up: idx_rate_limits_count has no reader and is rewritten on every limiter hit (repeats R-040). `prisma/schema.prisma:L324; prisma/migrations/000_init/migration.sql:L290`
- Check-in request records are mapped to snake_case in the repository and back to camelCase in the route (double mapping left by S5) (repeats R-050). `src/lib/prisma-repositories/checkInRequestRepository.ts:L8-L22,L53-L67,L184; src/app/api/check-in/arrival-request/route.ts:L20-L30; src/app/api/admin/check-in-requests/route.ts:L23-L38`
- LeafletMap view persistence (localStorage) and autoFit gating are always overridden by the refit-on-mount effect (repeats R-022). `src/components/LeafletMap.tsx:L15,L58,L118,L132,L218-L229,L245-L250,L358-L368; src/components/InteractiveMap.tsx:L110`
- LeafletMap's persisted map view (localStorage) is dead: `refitOnMarkerChange` always refits on mount (repeats R-022). `src/components/LeafletMap.tsx:L15,L58,L118,L132,L218-L229,L245-L250,L358-L368,L377-L379; src/components/InteractiveMap.tsx:L110`
- `pickLocalized` re-implements `pickLocale` because data.ts is server-only (imports node:fs) (repeats R-096). `src/data/mapLocations.ts:L214-L222 and L275-L277 (duplicates src/lib/data.ts:L90-L97, not src/data/data.ts)`
- `security:audit` audits the full tree while the release gate audits `--omit=dev`; the three aliases that use it are unreferenced (repeats R-072). `package.json:64`
- Browser-audit tooling (lighthouse, axe-core, chrome-launcher, ~1,600 lines of scripts) is advisory-only weight in a one-apartment repository. `package.json:124,132 (Lighthouse part only; see index 0)`
- validate-security.ts (gate 24) is `npm run build` plus `npm audit` wrapped in five checks that cannot fail in this repository; R-075 is still open (repeats R-075 (partial: only the CSP/HSTS string-check part; the env/secret-file/permission parts are new)). `scripts/validate-security.ts:38-78 (Environment Variables), 85-133 (CSP/HTTPS string checks), 134-162 (Secret Files), 205-243 (File Permissions)`
- Development orchestrator (879 lines) is pinned into the release policy and starts the app through a login shell (repeats R-081). `scripts/system-orchestrator.sh:L1-L879 (whole file); scripts/lib/release-policy.mjs:L649-657, L2284-2291; scripts/tests/release-policy.test.mjs:L91-92, L459-460, L1775`
- `guestDataCache` + `guestDatasetVersion` is a two-module version-checked cache for one admin page; `invalidate()` has no caller (repeats R-051). `src/lib/guestDataCache.ts:L10-70; src/lib/guestDatasetVersion.ts:L1-63; src/lib/guestDataStore.ts:L15,L144-150`
- BUILD_SITE_URL is declared, set in the image and pinned by the release policy, but nothing reads it. `src/lib/runtime-env-schema.js:L57 (declaration) and L113-L115 (reader: build/runtime site-URL drift check)`
- `build:secure`, `security:scan` and `security:audit` are unreferenced, and the full-tree audit they run fails against the declined dev-only highs (repeats R-072). `package.json:L64 (affects L25, L66)`
- crypto.ts keeps its own module-load pepper resolver with an ephemeral dev fallback that the env contract (B17) has made unreachable (repeats R-053). `src/lib/crypto.ts:L3-L63 (resolver) and L67, L76 (uses); src/lib/pepper.ts:L5-L6 (comment); tests/security/crypto-runtime.test.ts:L4-L32`

## Critical

None.

## High

None.

## Medium

### R-166: Dark mode: the moments/phones card CTAs are unreadable because the 09 blanket anchor rule beats every 10-moments dark colour rule
- Severity: Medium
- Category: Bug
- Status: CONFIRMED
- Location: src/styles/09-utilities.css:L140-L151 (root cause); src/styles/10-moments.css:L697-L707, L725-L732 (rules that lose)
- Evidence:

  ```text
  10-moments.css:L697-L702
    [data-theme="dark"] .moments-chip.is-active,
    [data-theme="dark"] .moments-map-button,
    [data-theme="dark"] .moment-card-action-primary {
      background: var(--moments-action-bg);
      color: var(--moments-action-fg);
    }
  10-moments.css:L665-L666: `[data-theme="dark"] .moments-page { --moments-action-bg: var(--brand-800);`  (04-theme.css:L12-L20 defines no dark --brand-800, so it stays #065f5b)
  09-utilities.css:L145-L151 (unlayered, specificity 0,15,1 from 14 `:not(.class)` + the attribute):
    [data-theme="dark"] a:not(.btn-primary):not(.btn-accent)…:not(.guest-menu-utility) { color: var(--brand-400); }
    [data-theme="dark"] a:not(…):hover { color: var(--brand-300); }
  Markup: MomentCard.tsx:L358 `<Link href={href} className="moment-card-action moment-card-action-primary">` (renders <a>), L312 `<a href={primaryPhoneHref} className="moment-card-action moment-card-action-primary">`, L301 `<a … className="moment-card-phone-chip">`.
  Computed: text #0b998b on #065f5b = 2.13:1; hover text #088276 on color-mix(#065f5b 82%, white) = 1.04:1; secondary `.moment-card-action` anchors #0b998b on ≈#1b2c2e = 4.11:1; phone chips 4.11:1.
  ```

- Problem: The dark rules in 10-moments (L697-L707, L725-L732) that give the primary CTA white text and the secondary actions `--fg-default` have specificity 0,2,0 to 0,3,0. For `<a>` elements the 09 rule (0,15,1) always wins, and `.moment-card-action`/`.moment-card-phone-chip` are not in its exclusion list. The `<button>` variants (phone-card front "View details", "Back") are unaffected, which is why the defect is not visible on every card type.
- Impact: In dark mode every non-phone moments card's "View details" button (and the "Call" button on the back of phone cards) shows teal text on dark teal at 2.13:1, and the text disappears on hover (1.04:1). This is the main call to action of /{locale}/moments and /{locale}/phones. Secondary actions ("Open map", "Directions", "Website") and phone-number chips fall to 4.11:1, below AA for 13 px text.
- Fix: Keep the proposed change. Append `:not(.moment-card-action):not(.moment-card-phone-chip)` to the three `[data-theme="dark"] a:not(…)` selectors at 09-utilities.css:L140, L145 and L149. Correct the expected result: the dark primary text becomes --fg-default #e2e8f0 on #065f5b (6.09:1) and white on hover (7.51:1), because L725 (0,3,0) outranks L729 (0,2,0). The hover background stays #065f5b, since L697 overrides L575. Secondary actions and phone chips become #e2e8f0 on #1b2c2e (11.78:1). If pure white is wanted for the non-hover primary, change L729's first selector to `[data-theme="dark"] .moments-page .moment-card-action-primary`. That is optional and not needed for AA.
- Fix risk: Visual only, dark theme. Check /en/moments and /en/phones cards (front and back) plus hover in dark and light. Light mode is unaffected because the 09 rules are dark-only.
- Verification:
  - refute: CONFIRMED — The cascade claim is correct. The project styles are unlayered: src/styles has no @layer, and Tailwind 4.3.2's `@import "tailwindcss"` puts only its own CSS in layers (node_modules/tailwindcss/index.css:L1). So the comparison comes down to specificity. The 09 selector is (0,15,1): the [data-theme] attribute plus 14 `:not(.x)`, plus `a`. The competing 10-moments rules are (0,2,0) or (0,3,0). `.moment-ca…  Measured contrasts (WCAG formula): #0b998b on #065f5b = 2.13:1; secondary and chips on #1b2c2e = 4.11:1 (below 4.5 at 13.4px/12.5px).  One number is wrong: the hover figure. In dark mode `[data-theme="dark"] .moment-card-action-primary` (L697-L702, 0,2,0) comes after `.moment-card-action-primary:hover` (L575, 0,2,0), so the hover background stays #065f5b, not the color-mix. Hover text #088276 on #065f5b is 1.6:1, not 1.04:1. Still effectively unreadable.  Severity: lowered to Medium. The defect is visual only and no function is lost. The whole card front is also a Link (MomentCard.tsx L353), the pill shape stays visible, and the phone numbers remain readable at 4.11:1. The owner's own record rated comparable dark-contrast defects Low (R-163 at 1.13:1, R-164 at 2.93:1). This one is more prominent (main CTA of /moments and /phones), so Medium, not High.  The proposed fix is minimal and follows the existing exclusion-list pattern. One detail in it is wrong: after the fix the non-hover primary text is --fg-default #e2e8f0, not white. `[data-theme="dark"] .moments-page .moment-card-action` (L725, 0,3,0) beats `[data-theme="dark"] .moment-card-action-primary` (L729, 0,2,0). That gives 6.09:1, not 7.51:1. On hover the text is white at 7.51:1 (L730, 0,3,0, later in the file). This matches what the `<button>` variant already renders today, so the result is acceptable. No duplicate in REVIEW.md or PROGRESS.md: grep for moment-card-action, moments-empty and a:not( only hits R-163, which covers the /book error box.
  - reproduce: CONFIRMED — Cascade traced end to end. globals.css imports 09-utilities.css (L10) and 10-moments.css (L11) with no layer(), and neither file uses @layer, so both are unlayered and specificity decides. The 09 selectors `[data-theme="dark"] a:not(.btn-primary)…:not(.guest-menu-utility)` have 14 chained :not(.class) plus the attribute and the type selector, giving specificity 0,15,1. The 10-moments dark rules are 0,2…
  - calibrate: lead — Medium. The refute lens is right that the defect is visual only (no function lost; the whole card is a link) and the owner's record rated comparable dark-mode contrast defects Low (R-163 1.13:1, R-164 2.93:1); this one is raised to Medium, not Low, because it is the main call to action of /moments and /phones.

### R-167: Enquirers without a portal account have no erasure path and their personal data has no retention limit
- Severity: Medium
- Category: Legal
- Status: CONFIRMED
- Location: src/lib/privacyService.ts:L14-L19 (entry point) and L124-L149 (redaction block); src/app/api/admin/stay-requests/[id]/route.ts:L9,L25; src/lib/operationalMonitor.ts:L201-L232
- Evidence:

  ```text
  src/lib/privacyService.ts:14-19
    export async function eraseGuestByAdmin(userId: string, auditNote: string) {
      const subject = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!subject) throw new Error('ERASURE_SUBJECT_NOT_FOUND');

  src/lib/operationalMonitor.ts:204-223 (runRetention) deletes rate_limits, sessions, refresh tokens/families, claim grants, security events, outbox events, admin sessions — no rule touches `stay_requests` or `check_in_requests`.

  src/app/api/admin/stay-requests/[id]/route.ts:9
    const schema = z.object({ action: z.enum(['retry_delivery', 'close']) });
  ("close" only sets status CLOSED and deletes DEAD outbox events, L51-52; firstName/lastName/email/phone stay.)

  prisma/schema.prisma:119-131 StayRequest: firstName, lastName, email, phone, arrivalTime, specialRequests.

  `grep -rn "stayRequest\.\(update\|delete\|updateMany\|deleteMany\)" src` → only status updates (bookingOutbox L119/L139, admin route L42/L52) and the User-scoped redaction in privacyService L126.
  ```

- Problem: The only erasure entry point (`eraseGuestByAdmin`) requires a `User` row. Stay requests from the public enquiry form (`/api/booking-requests`) carry name, e-mail, phone and free text, and most enquirers never claim a booking, so no `User` exists for them. Stay requests are redacted only as a side effect of erasing a portal user with the same E.164 phone (L86-93). There is no admin action to erase an enquiry and `runRetention` never ages out stay or check-in requests.
- Impact: An enquirer who asks the host to delete their data (GDPR Art. 17) cannot be served from the admin UI; the host would need SQL on the production database. Independently of requests, enquiry PII is kept indefinitely, which conflicts with the storage-limitation principle (Art. 5(1)(e)) the erasure feature otherwise implements. Realistic for this site: the enquiry form is the main public write path.
- Fix: Keep the two-part shape but adjust: (1) Extract L124-149 into a module-private helper in privacyService (e.g. `redactStayRequest(tx, id)`) and expose `eraseStayRequestByAdmin(id, auditNote)` that runs it in a Serializable transaction with the same LEASED-delivery check (L96-106). Add `erase` to the PATCH enum; the `erase` action must bypass the CLOSED guard at route L25 (a closed enquiry still holds PII) and should get the same `isSameOriginRequest` check the guest-erase route has (the stay-requests PATCH currently has none). `privacySubjectDigest` accepts only 'user' | 'booking' (L6-8): add a 'stay_request' kind for the audit event; a `PrivacyRequest` row is optional since `userId`/`bookingId` are nullable and `subjectDigest` suffices. UI: `act(id, 'erase')` with confirm in AdminStayRequestsClient L88/L117. (2) Retention: a plain `prisma.stayRequest.deleteMany({ where: { status: { in: ['DELIVERED','CLOSED'] }, updatedAt: { lt: days(N) } } })` is simpler than redaction — `OutboxEvent.stayRequest` is `onDelete: SetNull` and DELIVERED/DEAD events are already deleted after 30 days, so nothing dangles; an idempotency-key replay after N months is not a realistic concern. For check-in requests, `updateMany({ where: { booking: { endDate: { lt: days(N) } } }, data: { guestName: null, guestEmail: null, guestPhone: null, message: null } })`. N is the owner's decision (12 months is a reasonable default). Add the new tuple entries at the end of the `$transaction` array so the index-based assertions in tests/unit/operational-retention.test.ts stay valid, and extend tests/routes/admin-dead-outbox-actions.test.ts for `erase` (including on a CLOSED request).
- Fix risk: Redacted enquiries keep their `idempotencyKey`, so a replay of the same key still returns 422/200 as today; retention period is a business/legal decision (the owner must choose it); update tests/unit/privacy-erasure.test.ts and tests/routes/admin-dead-outbox-actions.test.ts for the new action and rule.
- Verification:
  - refute: CONFIRMED — Η συμπεριφορά επιβεβαιώνεται σε όλα τα μονοπάτια: (α) το μόνο σημείο διαγραφής απαιτεί `User` (privacyService.ts L14-16); (β) το `/api/booking-requests` δημιουργεί μόνο `stayRequest` + outbox event, ποτέ `User`, και αποθηκεύει firstName/lastName/email/phone/arrivalTime/specialRequests; (γ) το admin PATCH δέχεται μόνο `retry_delivery`/`close` και το `close` αλλάζει μόνο status και σβήνει DEAD events; (δ…
  - reproduce: CONFIRMED — All technical claims reproduce. The only erasure entry point takes a User id (privacyService L14-16) and stay requests are touched only as a side effect of that user's e-mail/phone match (L86-93, L124-149). The admin stay-request route offers only 'retry_delivery' | 'close' (L9), and 'close' changes status only (L51-52); the admin client renders only 'Retry delivery' and 'Close' buttons (AdminStayReque…

### R-168: Admin stay-requests page never shows the guest's arrival time, special requests or locale, although the API returns them
- Severity: Medium
- Category: Bug
- Status: CONFIRMED
- Location: src/app/admin/stay-requests/AdminStayRequestsClient.tsx:L9-L13,L115
- Evidence:

  ```text
  AdminStayRequestsClient.tsx L115 (the only field rendering):
    <dl ...><div><dt>Dates</dt><dd>{...startDate...} – {...endDate...}</dd></div><div><dt>Contact</dt><dd>{request.email}<br />{request.phone}</dd></div><div><dt>Submitted</dt><dd>{new Date(request.createdAt).toLocaleString()}</dd></div><div><dt>Delivery attempts</dt><dd>{event?.attemptCount ?? 0}</dd></div></dl>

  $ grep -n "specialRequests|arrivalTime|special_requests" src/app/admin/stay-requests/AdminStayRequestsClient.tsx src/app/api/admin/stay-requests/route.ts
  (no matches)

  The list route returns full rows: src/app/api/admin/stay-requests/route.ts L21-L29 `prisma.stayRequest.findMany({ where, ...adminListPageArgs(limit, cursor), include: { outboxEvents: {...} } })` → `requests: page.items`.
  The guest fills them in: src/components/BookingForm.tsx L253-L275 (arrivalTime select, specialRequests textarea); the server stores them: route.ts L133-L134.
  ```

- Problem: The page describes itself as 'Durably stored booking enquiries and their delivery state' and is the only durable view the host has (the webhook is the other channel). It omits `arrivalTime`, `specialRequests` and `locale` (needed to answer in the guest's language) even though the API already ships them.
- Impact: When a delivery is `DELIVERY_FAILED` (exactly the moment the host must work from the admin page) or when no webhook consumer keeps history, the host cannot see 'arriving late', 'need a crib', 'allergic to…' or which language the guest used. The data is collected, stored and then invisible.
- Fix: As proposed, plus layout handling for long text. In the type add `locale: string; arrivalTime?: string | null; specialRequests?: string | null;`. In the `<dl>` at L115 add:
  <div><dt>Arrival</dt><dd>{request.arrivalTime ?? '—'}</dd></div>
  <div><dt>Language</dt><dd>{request.locale}</dd></div>
  <div className="sm:col-span-2"><dt>Requests</dt><dd className="whitespace-pre-wrap break-words">{request.specialRequests ?? '—'}</dd></div>
Extend tests/components/admin-stay-requests.test.tsx: give one fixture `arrivalTime: '18:00-20:00', specialRequests: 'Need a crib', locale: 'el'` and assert the three values render; keep one fixture without them and assert '—'. No API or schema change is needed (the route already returns the columns).
- Fix risk: None functionally; adjust the admin-list component test if one snapshots the card.
- Verification:
  - refute: CONFIRMED — Verified end to end. The DB stores the fields (prisma/schema.prisma:L122 `locale String @db.VarChar(8)`, L129-L130 `arrivalTime String? @map("arrival_time")`, `specialRequests String? @map("special_requests")`); the booking API writes them (src/app/api/booking-requests/route.ts:L126,L133-L134); the guest form collects them (src/components/BookingForm.tsx:L252-L275). The admin list route returns full Pr…
  - reproduce: CONFIRMED — Read the whole 126-line component: the `StayRequest` type (L9-13) lists only id, propertyName, startDate, endDate, firstName, lastName, email, phone, status, createdAt, outboxEvents, and the only field rendering (L115) shows Dates, Contact, Submitted and Delivery attempts; `arrivalTime`, `specialRequests` and `locale` appear nowhere in the file. The list API returns unprojected Prisma rows: route.ts L2…

### R-169: POST /api/booking-requests accepts past dates and stays of any length; the page-level checks (≤30 nights, not in the past) are not enforced server-side and use the process time zone
- Severity: Medium
- Category: Logic
- Status: CONFIRMED
- Location: src/app/api/booking-requests/route.ts:L42-L46 (schema), L85-L100 (POST)
- Evidence:

  ```text
  route.ts L27-L30, L42-L46:
    dateRange: z.object({
      from: z.iso.date(),
      to: z.iso.date(),
    }),
    ...
  }).superRefine((value, context) => {
    if (value.dateRange.to <= value.dateRange.from) {
      context.addIssue({ code: 'custom', path: ['dateRange', 'to'], message: 'End date must be after start date' });
    }
  });

  The only other gate is SSR in src/app/[locale]/book/page.tsx (`validateDateRange(dateRange, eff)` → `canBook`), which calls src/lib/dateUtils.ts L49-L51 / L74-L93:
    function isPastDate(date: Date): boolean {
      return isBefore(startOfDay(date), startOfDay(new Date()));
    }
    ...
    if (nights > 30) { return { valid: false, error: errors.maximumStay }; }

  tests/routes/booking-requests.test.ts L66-L77 covers only instants, same-day, reversed and impossible dates.
  ```

- Problem: The API schema validates only `to > from`. A direct POST (curl, or the form page opened with hand-edited query params before the SSR check, or any client that bypasses `/book`) can store a request for 1990-01-01 or a 400-night stay. The 'not in the past' rule lives only in the SSR page and compares against `startOfDay(new Date())` in the Node process time zone (UTC in the Docker image), not `PROPERTY_TIME_ZONE`: between 00:00 and 03:00 Athens time the page still accepts 'yesterday' for the property, and for a guest west of UTC it can reject today.
- Impact: Junk or impossible enquiries are stored durably, delivered to the webhook, and shown in the admin inbox; the two validation layers disagree (the page says max 30 nights / no past dates, the API does not), so the server contract is weaker than the UI promises. Rate limit 5/hour per ip+email bounds the volume but not the content.
- Fix: Add two rules to the API only, using the repo's UTC calendar-day convention (the same as `businessToday` in portalBookingEligibility.ts and what the page effectively uses in the TZ-less Docker image). Do not use PROPERTY_TIME_ZONE and do not change dateUtils.isPastDate.

The past-date check must run in POST, not in the module-level schema, because a schema-time Date would be frozen at import:
```ts
const today = new Date().toISOString().slice(0, 10);
if (parsed.data.dateRange.from < today) return errorResponse('Invalid booking request payload', 422);
```

The night cap can go in superRefine:
```ts
const nights = (Date.parse(`${value.dateRange.to}T00:00:00Z`) - Date.parse(`${value.dateRange.from}T00:00:00Z`)) / 86_400_000;
if (nights > 30) context.addIssue({ code: 'custom', path: ['dateRange', 'to'], message: 'Maximum stay is 30 nights' });
```

Tests: pin the clock in tests/routes/booking-requests.test.ts, for example `vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T12:00:00Z'))` with `vi.useRealTimers()` in afterEach. Otherwise the existing `2026-11-01` fixtures become a time bomb that fails from 2026-11-02. Add cases for past from → 422 and 31 nights → 422, and 'today' (UTC) → 202. client-identity-route-regression uses 2030-06-01 and is unaffected until 2030.

The finder's second step (time-zone-aware isPastDate in dateUtils, passing the zone from the page) is out of scope: it is UX-only, and dateUtils is also a client module.
- Fix risk: Low. A request submitted exactly around local midnight can flip from accepted to rejected; the form already shows `submitRejected` for 422. Tests must stub `PROPERTY_TIME_ZONE`.
- Verification:
  - refute: CONFIRMED — The API gap is real. After the `to > from` superRefine, nothing in POST checks the dates before `prisma.stayRequest.create`, and zod 4.4.3 `z.iso.date()` accepts any 4-digit year. The 'not in the past' and '<= 30 nights' rules live only in the SSR page, which renders the form only when `canBook` is true.  Three parts of the finding are overstated: (a) "The form page opened with hand-edited query params" cannot bypass anything. `validateDateRange` runs server-side in page.tsx before `BookingForm` is rendered. The only benign paths are a tab left open across midnight and a direct POST (curl). A direct POST still needs the Nginx identity attestation, an Idempotency-Key and the 5/h limit per ip+email. (b) "For a guest west of UTC it can reject today": the check uses server time only. Rejecting a check-in that has already passed in Greece is correct for the property, not a bug. (c) The time zone of 'today'. In production neither the Dockerfile nor the smoke env sets TZ, so the page compares in UTC (not verified inside the pinned image, but no TZ is configured anywhere in docker/ or the smoke env). The repo's established convention for booking calendar dates is also the UTC calendar day: `businessToday` in portalBookingEligibility.ts and docs/testing.md:84. Introducing PROPERTY_TIME_ZONE only in the API would make the page and the API disagree for 2-3 hours after Athens midnight (page shows the form, API returns 422).  Why Low for this deployment: a StayRequest is only an enquiry. No code turns it into a Booking; src only lists it, closes it or retries delivery. A junk past or long-stay row is read and ignored by the host, and an abuser could send junk with valid dates anyway.  No duplicate. R-109 (same-day picker range) and A4 (calendar-string contract) are different issues.
  - reproduce: CONFIRMED — I traced the whole POST path at src/app/api/booking-requests/route.ts:L85-L171. The only date checks are the Zod `z.iso.date()` format checks (L27-L30) and `to <= from` in superRefine (L42-L46). After that the handler goes straight through idempotency, rate limiting and `prisma.stayRequest.create` with the nested OutboxEvent (L140-L171), and nothing checks for a past check-in or a stay over 30 nights.…

### R-170: Booking requests are refused (503) unless an external webhook is configured, while check-in requests are stored without one
- Severity: Medium
- Category: Overengineering
- Status: SUSPECTED
- Location: src/app/api/booking-requests/route.ts:L86-L88; src/lib/runtime-env-schema.js:L63; .env.example:L27-L34
- Evidence:

  ```text
  route.ts L86-L88:
    if (!process.env.BOOKING_REQUEST_WEBHOOK_URL) {
      return errorResponse('Booking requests are temporarily unavailable', 503);
    }

  Contrast src/lib/prisma-repositories/checkInRequestRepository.ts L75-L77 (request stored, event only when configured):
    const notificationEventId = notification && process.env.CHECKIN_REQUEST_WEBHOOK_URL
      ? crypto.randomUUID()
      : undefined;

  Env schema marks both optional: src/lib/runtime-env-schema.js L63 `BOOKING_REQUEST_WEBHOOK_URL: optionalEnv(z.string().url())`.
  StayRequest status enum is delivery-centric: prisma/schema.prisma L354-L359 `PENDING | DELIVERED | DELIVERY_FAILED | CLOSED`.
  The admin page already lists requests from the database (src/app/api/admin/stay-requests/route.ts).
  ```

- Problem: For a single apartment with minimal running cost the owner may have no webhook consumer at all (it implies a second hosted service: Make/Zapier/n8n/Cloudflare Worker/mail relay). Without it the public booking form is dead (503 on every submit), even though the request could be stored and read in `/admin/stay-requests`. The check-in flow already follows the 'store first, notify if configured' policy; the booking flow does not, so the two flows disagree.
- Impact: Deploying the Docker image with the documented optional env leaves the booking CTA non-functional ('temporarily unavailable') until the owner pays for / builds a webhook endpoint. The alternative (admin page + optional notification) costs nothing extra.
- Fix: This is an owner decision; present both options.

Option B, minimal and no schema change: make the requirement explicit and fail closed at start instead of per request. In runtime-env-schema.js superRefine, add an issue when `NODE_ENV === 'production' && !env.BOOKING_REQUEST_WEBHOOK_URL`, and move the booking pair out of "Optional shared services" in .env.example. The smoke env (scripts/smoke-production-image.ts) and any release-gate env fixtures that start the app in production mode must then set a dummy https URL plus a 20+ char token. Keep the route gate as defence in depth.

Option A (store first, notify if configured):
- Create the OutboxEvent only when the URL is set, and call deliverOutboxEvent only then.
- Add a status such as RECEIVED. This needs a migration, EXPECTED_MIGRATION, update:prisma-integrity, the TS union and filters in AdminStayRequestsClient, and allowing Close for it at L118.
- Do not reuse PENDING: event-less PENDING rows cannot be closed from the UI.
- Keep the webhook-set path unchanged, and add a route test for the no-webhook 202 path.
- Fix risk: Option A touches the state machine, migration (`EXPECTED_MIGRATION`, `update:prisma-integrity`), the admin badge logic and tests/routes/booking-requests.test.ts. Behaviour change for deployments that relied on the 503.
- To confirm (SUSPECTED only): Owner states whether a webhook consumer (and which) will exist in production; if yes, the finding reduces to 'document the requirement'.
- Verification:
  - refute: CONFIRMED — The mechanism is verified. POST returns 503 before any other work whenever BOOKING_REQUEST_WEBHOOK_URL is unset. The env schema marks the URL optional, .env.example lists it under "Optional shared services", and check-in requests are stored without a webhook. The inconsistency between the documented contract and the runtime behaviour is therefore a fact, not a suspicion. Only whether it bites depends o…  Nothing warns the operator: - The env schema accepts an unset URL, so the app starts cleanly. - `npm run smoke:image` runs the production image without the webhook and never POSTs a booking request, so the smoke passes while the booking form is dead. - The guest sees only the generic `submitFailed` text.  This is not over-engineering. The category is a Logic/configuration-contract mismatch. It is Medium because it fully disables a user-facing flow in production, but only under a configuration choice, and it fails cleanly with no data loss.  Notes on the proposed Option A: - Reusing `PENDING` for event-less requests would leave them un-closable from the UI, because the Close button is shown only for DELIVERED/DELIVERY_FAILED. The PATCH API itself would allow the close, since it only blocks when a PENDING/LEASED event exists. - A new enum value also needs the TS union and the filters in AdminStayRequestsClient.tsx, a migration, EXPECTED_MIGRATION and update:prisma-integrity. - The finder's "hide Retry delivery when no event exists" is already true: Retry is shown only for DELIVERY_FAILED.  Independent of A/B, there is no host-notification channel other than webhooks. The dead-outbox alert is also a webhook (ALERT_WEBHOOK_*).  No duplicate in REVIEW.md, PROGRESS.md or the review-1 REVIEW.md. The gate was introduced in daed8bf with no recorded rationale.
  - reproduce: SUSPECTED — The code facts check out. POST returns 503 before doing anything else when BOOKING_REQUEST_WEBHOOK_URL is unset (route.ts:L86-L88), and it always creates an OutboxEvent (L149-L158). The check-in repository stores the request and creates a notification event only when CHECKIN_REQUEST_WEBHOOK_URL is set (checkInRequestRepository.ts:L75-L77). Both variables are optional in the env schema (runtime-env-sche…

### R-171: No retention or erasure path for StayRequest / CheckInRequest personal data of guests who never claim a portal account
- Severity: Medium
- Category: Legal
- Status: CONFIRMED
- Location: src/lib/operationalMonitor.ts:L201-L224; src/lib/privacyService.ts:L14-L19,L86-L93; src/app/api/admin/stay-requests/[id]/route.ts:L9
- Evidence:

  ```text
  runRetention deletes only technical rows (L204-L223): rateLimit, session, refreshToken, refreshTokenFamily, bookingClaimGrant, securityAuditEvent, outboxEvent (DELIVERED/DEAD), adminSession. No `stayRequest`, `checkInRequest`, `booking`, `user` or `termsAcceptance` deleteMany.

  Erasure is user-centred: src/lib/privacyService.ts L14 `eraseGuestByAdmin(userId, ...)`; stay requests are matched only through that user (L86-L92):
    const stayRequestFilters = [
      ...(user.email ? [{ email: user.email }] : []),
      { phone: user.phoneE164 },
    ];
    const stayRequests = await tx.stayRequest.findMany({ where: { OR: stayRequestFilters }, ... });

  StayRequest holds name, email, phone, arrivalTime, specialRequests (prisma/schema.prisma L119-L139); CheckInRequest holds guest_email/guest_phone/message (L79-L99).
  $ grep -rn "retention|Retention" docs --include='*.md' → only docs/security/layered-rate-limiting.md:42 (rate_limits).
  ```

- Problem: A booking enquiry from someone who never becomes a portal `User` (the common case: most enquiries do not turn into stays) is kept indefinitely with full contact data and free-text 'special requests' (which can contain health information), and the only erasure entry point requires a `User` row. GDPR Art. 5(1)(e) storage limitation and Art. 17 apply to the host as controller regardless of size; Greek law 4624/2019 implements the GDPR without a small-business exemption. There is no documented retention period for these tables.
- Impact: Unbounded accumulation of guest PII with no defined deletion; an erasure request from an enquiry-only guest can only be honoured by manual SQL. This is a compliance gap rather than a runtime failure; the volume for one apartment is small, which is why it is Medium and not High.
- Fix: Scope the finding to StayRequest; drop CheckInRequest from the 'never claim' claim. After the owner chooses N: (1) append at the END of the runRetention tuple so the existing index assertions stay valid: `prisma.stayRequest.deleteMany({ where: { status: { in: ['CLOSED', 'DELIVERED'] }, endDate: { lt: days(N) } } })` (outbox rows become stayRequestId NULL through SetNull and hold only the id). (2) For enquiry-only erasure, add an `erase` action to the existing PATCH /api/admin/stay-requests/[id] rather than widening eraseGuestByAdmin. Move the anonymize-and-cancel-events block of privacyService.ts L119-L147 into one module-private helper used by both paths. (3) Add one sentence with the period to `labels.terms` (src/i18n/domains/booking.ts L127/L215). Add a unit case for the new where clause and a route test for the erase action.
- Fix risk: Deleting stay requests older than N months also removes their evidential value for disputes; choose N with that in mind. Retention test `tests/unit/operational-retention.test.ts` asserts the tuple length and order and must be extended.
- Verification:
  - refute: CONFIRMED — The code facts hold for StayRequest. runRetention has no stayRequest/checkInRequest/booking/user deleteMany. The only erasure entry point, eraseGuestByAdmin, needs a User row and reaches stay requests only through that user's email or phone. The admin stay-request route offers only retry_delivery and close, so an enquiry from someone who never becomes a portal User is kept forever with name, email, pho…
  - reproduce: CONFIRMED — The code facts hold. runRetention has no deleteMany for stayRequest, checkInRequest, booking or user. Nothing in src/ or scripts/ deletes StayRequest or CheckInRequest rows. The only anonymization path for StayRequest is eraseGuestByAdmin(userId), which needs an existing User and matches stay requests only by that user's email/phone. An enquiry from someone who never gets a User row therefore has no er…

### R-172: Two parallel translation mechanisms: the full en+el dictionary (48 KB chunk) is shipped to every client while the server also passes translated props
- Severity: Medium
- Category: Redundant
- Status: CONFIRMED
- Location: src/i18n/dictionaries.ts:L89-L104 (eager two-locale module); src/components/TopControls.tsx:L7,L44; src/app/[locale]/layout.tsx:L45; mixed plumbing in src/app/[locale]/[category]/page.tsx:L93-L101, src/components/CategoryGridClient.tsx:L63, src/components/moments/MomentCard.tsx:L167
- Evidence:

  ```text
  TopControls.tsx L7: import { getDictionary } from '@/i18n/dictionaries';  L44: const dictionary = useMemo(() => getDictionary(locale as Locale), [locale]);
  16 client components import getDictionary (grep): ErrorSummary, DateRangePicker, MapLoadingSkeleton, SearchBar, CheckInInfo, StaticLocationMap, Toast, TopControls, ThemeToggle, ShareButton, FavoritesClient, FavoriteButton, ContactSection, CategoryGridClient, MomentCard, InteractiveMap.
  Build output: .next/static/chunks/1p5dfmxc4_i3q.js = 48,378 bytes and contains 'networkReconnected', 'removeNamedFavorite', 'Kalamata Moments' (both locales).
  At the same time the server passes translations as props, e.g. src/app/[locale]/[category]/page.tsx L93-L101 (`ui={t.ui}`, `cardLabels={{...}}`, `momentsFilters={t.momentsFilters}`) into CategoryGridClient, which then ALSO calls getDictionary (CategoryGridClient.tsx L63) and passes both `labels` and `locale` into MomentCard, which calls getDictionary again (MomentCard.tsx L167).
  ```

- Problem: TopControls is rendered in the locale layout, so every page download includes both locales' complete dictionaries (portal, check-in, booking form, admin-unrelated copy) as a client chunk, and the same strings travel twice (props + client dictionary). Components are inconsistent about which mechanism they use.
- Impact: ~48 KB (uncompressed) of JS on every page for a two-locale, one-apartment guide; every dictionary edit (even portal-only copy) invalidates the shared chunk; two places to look when a label is wrong.
- Fix: No change is warranted at this scale: about 16 KB gzip, cached as immutable, loaded once per visitor per deploy. If the owner wants consistency, follow the S6g direction instead of the finder's. The client dictionary is already loaded by the layout for every page and is required by error.tsx and not-found.tsx, so the cheap consistent move is to drop the redundant label props (ui/cardLabels/momentsFilters → labels/filters) in the page → CategoryGridClient → MomentCard/MomentsToolbar/CategoryChips chain and read them from getDictionary. That is a refactor needing approval; i18n-copy and the components tests must stay green. Do not move the dictionary into a layout context provider, which inlines it uncacheably into every page payload. Do not split per locale with static imports (both still bundle); splitting needs dynamic import() and async text.
- Fix risk: Medium: touches many components; the i18n-copy/parity tests and the components tests must stay green; check that no client component derives locale from `usePathname` for a string that then goes missing.
- Verification:
  - refute: CONFIRMED — The mechanism is real, but the finding overstates its impact. (1) src/i18n/dictionaries.ts builds both locales eagerly into one frozen object and indexes it by locale at runtime, so the bundler cannot tree-shake it. Any client import pulls in every domain of both en and el. TopControls is rendered by the [locale] layout, and the built chunk is referenced from the client-reference manifests of all 12 [l…
  - reproduce: CONFIRMED — Traced in the source. src/i18n/dictionaries.ts builds both locales eagerly into one module-level constant (L89-L92: `const dictionaries = deepFreeze({ en: mergeDictionary('en'), el: mergeDictionary('el') })`), and getDictionary (L102-L103) indexes into it. Any 'use client' module that imports getDictionary therefore pulls both full locales into the client bundle. TopControls is a client component and i…

### R-173: Travel times depend on the public OSRM demo server, whose stated policy is non-commercial use, ≤1 req/s and no uptime guarantee
- Severity: Medium
- Category: Legal
- Status: SUSPECTED
- Location: src/components/LeafletMap.tsx:L14; docker/Dockerfile.security:L1-L22; src/lib/osrmClient.ts:L66
- Evidence:

  ```text
  LeafletMap.tsx L14: const OSRM_BASE_URL = (process.env.NEXT_PUBLIC_OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
  osrmClient.ts L66: this.baseUrl = (options.baseUrl || 'https://router.project-osrm.org')...
  useTravelMetrics.ts L94-L101 issues one /table request per mode back-to-back (driving then foot) for all markers.
  Project-OSRM wiki 'Demo server' (fetched 2026-09-27): "The demo server usage is restricted to reasonable, non-commercial use-cases. Do not exceed 1 request per second." and "no guarantees wrt. uptime, latency, or data updates."
  Live check (GET .../table/v1/foot/...): code "Ok" — the foot profile does work today.
  docs/: only docs/testing.md:16 mentions OSRM; no note on the usage policy.
  ```

- Problem: The site advertises a paid rental and takes booking requests, so the routing calls are arguably commercial use of a service that forbids it; the two modes are requested within milliseconds (>1 req/s); and the feature's availability is at the mercy of a best-effort demo host.
- Impact: Travel-time chips may stop working at any time (or the origin may be blocked) without any code change; low but real policy exposure for the owner.
- Fix: Owner decision first; do not add request spacing. Option A (recommended, removes a third party): remove the live travel chips, i.e. useTravelMetrics.ts, osrmClient.ts, the travel parts of LeafletMap (TRAVEL_*, OSRM_BASE_URL, buildTravelInfoHtml, the popup-content effect, lazyTravelMetrics/travelPrompt props), the map.travel*/approximate/unavailable labels, the osrmOrigin connect-src entry in security-config.ts, NEXT_PUBLIC_OSRM_BASE_URL in runtime-env-schema.js and .env.example, tests/security/csp-osrm-origin.test.ts, and the formatTravelChip cases in tests/unit/core-utilities.test.ts. Keep the Google Directions link. Option B: keep the feature on a self-hosted or paid router. This needs `ARG NEXT_PUBLIC_OSRM_BASE_URL` + `ENV NEXT_PUBLIC_OSRM_BASE_URL=${NEXT_PUBLIC_OSRM_BASE_URL}` in the docker/Dockerfile.security builder stage (today the bundle always inlines the demo default) and the same runtime value for the CSP. Option C: keep it as is and record the accepted policy risk in docs/.
- Fix risk: Low. If removed: delete useTravelMetrics/osrmClient/travelFormat and the `map.travel*`/`approximate` labels; update tests/unit/core-utilities.test.ts (formatTravelChip).
- To confirm (SUSPECTED only): Owner confirms the site is used to market the rental (commercial). Re-read the current demo-server terms at https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server.
- Verification:
  - refute: SUSPECTED — The technical facts hold. Production always calls the public demo server. The client inlines NEXT_PUBLIC_OSRM_BASE_URL at build time, and the Docker builder stage passes only NEXT_PUBLIC_SITE_URL and GIT_COMMIT, with .env* excluded. So the production bundle always gets the default https://router.project-osrm.org. I re-fetched the demo-server policy and it matches the quotes. Whether a guest guide for a…  Two claims are overstated. (1) 'requested within milliseconds': the modes are fetched one after the other with await (driving, then foot). The second request starts only after the first response arrives. (2) Traffic is tiny. With lazyTravelMetrics, nothing is fetched until a marker click. Results go into a module-level cache (tableCache), so the 15-minute 'periodic refresh' is answered from the cache and makes no network call. That leaves about 2 requests per map session for ~1,000 users a year. The worst burst is on failure: up to 3 attempts × 2 profile names per mode, with 0.5 s and 1 s backoff.  If the server fails or blocks the site, the feature degrades gracefully. failedProfiles marks the mode, the chip shows 'unavailable', and the Google Directions link in the popup still works. So the impact is a nice-to-have chip disappearing plus a low-probability policy exposure: Low, not Medium. 'Legal' is not a category in the owner's scheme; Dependencies fits.  Fix problems: (a) Setting NEXT_PUBLIC_OSRM_BASE_URL alone does nothing in production unless the Dockerfile builder stage also gets `ARG NEXT_PUBLIC_OSRM_BASE_URL` + `ENV`. The CSP reads the runtime value, so both must match (see the PROGRESS B11 note). (b) Spacing the two requests ≥1 s apart adds a deliberate delay to the second chip, for traffic the policy is not aimed at. Not recommended.
  - reproduce: SUSPECTED — The code facts hold. The public demo host is the hard-coded default. NEXT_PUBLIC_OSRM_BASE_URL is empty in .env.example and is never set anywhere in docker/ (a repo-wide grep finds no build ARG), so the production image inlines the demo URL at build time. Each activation sends one /table request per mode, awaited one after the other with no spacing, and profile fallbacks and retries can add more. I re-…

### R-174: No property registration number (Α.Μ.Α.), provider identity or privacy notice anywhere on the public site
- Severity: Medium
- Category: Legal
- Status: SUSPECTED
- Location: src/components/ContactSection.tsx:L90-L115 (home page only, via src/app/[locale]/page.tsx:L65); src/components/ApartmentCinematic.tsx:L171 with src/i18n/domains/house.ts:L78,L136 (the property page, no registration number); src/components/BookingForm.tsx:L299-L302 with src/i18n/domains/booking.ts:L127,L215 (no privacy notice where data is collected); src/lib/guestTermsText.ts:L11-L14 (sign-up consent refers to a notice that does not exist)
- Evidence:

  ```text
  ContactSection.tsx L90-L115 shows only address, phone (HOST_CONTACT), email and Instagram; booking-details/page.tsx L46-L57 repeats email/phone; about/page.tsx has marketing copy only.
  Search: grep -rniE "ΑΜΑ|\bAMA\b|ΑΦΜ|VAT|privacy|απορρήτου|GDPR" over src/app/[locale], src/i18n, src/data, src/components → no hit for a registry number, tax id or privacy text (matches were the word 'cookie' in a comment and 'terms' in the booking form copy). find src/app -iname '*privacy*' -o -iname '*terms*' -o -iname '*legal*' → nothing.
  booking.ts L127 (form terms): "By clicking 'Send request' you share your stay details with the host..." — no link to a privacy notice, controller identity, retention or rights.
  The site collects name, email, phone, arrival time and free text (BookingForm → /api/booking-requests) and advertises the rental (/book, /booking-details, sitemap).
  ```

- Problem: Greek short-term-rental law (Ν. 4446/2016 άρθρο 111, as amended) requires the Α.Μ.Α. from the ΑΑΔΕ registry to accompany every online listing of the property; the e-commerce information rules (ΠΔ 131/2003 άρθρο 4) require the provider's name, address, email and ΑΦΜ to be easily accessible; GDPR art. 13 requires a privacy notice at the point where personal data is collected. None of this is present in the public UI.
- Impact: Regulatory exposure for the owner (ΑΑΔΕ fines for missing Α.Μ.Α. on listings; DPA complaints), independent of code quality.
- Fix: Static content only, no dependencies. (1) Keep the registration number as one constant next to HOST_CONTACT in src/data/contact.ts (Α.Μ.Α., or the ΜΗΤΕ number if the property is a licensed tourist accommodation, confirmed by the owner). Render it visibly on the pages that promote the property: /apartment (the ApartmentCinematic footer), /book and /booking-details. Also render it in ContactSection, but ContactSection alone is not enough because it only renders on the home page. (2) Add the host's legal name next to it; the address, phone and email are already there. Add the ΑΦΜ only if the owner confirms the rental is subject to VAT (ΠΔ 131/2003 art. 4(1)(ζ)). (3) Add a static /[locale]/privacy page covering: controller identity and contact; purposes and legal basis (booking requests: pre-contractual steps, GDPR art. 6(1)(b)); recipients (e.g. the webhook target that receives outbox notifications); retention matching operationalMonitor retention and the admin erase flow; rights, including a complaint to the Greek data protection authority (ΑΠΔΠΧ). Add the page to sitemap.ts. Link it next to the BookingForm terms paragraph and next to the guest sign-up checkbox. Do not edit GUEST_TERMS_TEXT silently: under the B1/R-117 contract any change needs a new GUEST_TERMS_VERSION, and tests/components/guest-terms.test.tsx pins the exact text. New dictionary keys must pass the i18n-parity test. The wording needs the owner's data and ideally a lawyer's review.
- Fix risk: None technically; wording needs the owner's data and ideally a lawyer's check.
- To confirm (SUSPECTED only): I could not fetch the primary sources from this machine (aade.gr returned 403; e-nomothesia.gr connection refused). Owner to confirm: the apartment's Α.Μ.Α. exists; whether bookings are taken directly (this site) as well as via Airbnb; then verify the current text of Ν. 4446/2016 άρθ. 111 §3 on aade.gr.
- Verification:
  - refute: CONFIRMED — The gap itself is real. At HEAD fff4283 no public page shows the property registration number (Α.Μ.Α.), the host's legal name or a privacy notice. The booking form and guest sign-up collect personal data with only a one-line terms text and nothing to click through to. I could not refute the legal basis either; I checked it against the statute text. (1) Ν. 4446/2016 art. 111 requires the number on the d…
  - reproduce: SUSPECTED — The code-level part of the finding holds up. The public UI shows only an address, a phone number, an email and Instagram. There is no Α.Μ.Α., ΑΦΜ, legal name of the provider or privacy notice. No privacy, terms or legal route exists under src/app. The booking form's terms text does not link to a privacy notice, even though the form collects first and last name, email, phone and arrival time and posts t…

### R-175: Readiness probe pins a migration five releases old, so `/api/health/ready` no longer proves binary/schema agreement
- Severity: Medium
- Category: Bug
- Status: CONFIRMED
- Location: src/app/api/health/ready/route.ts:L6-L8
- Evidence:

  ```text
  src/app/api/health/ready/route.ts:L6-L8
    // This must be updated whenever a schema migration is added. Readiness is not
    // merely a TCP/SELECT probe: the running binary and database schema must agree.
    const EXPECTED_MIGRATION = '20260715110000_remove_unused_legacy_models';

  $ ls prisma/migrations | awk -F_ '$1 > "20260715110000"'
  20260924120000_index_outbox_stay_request
  20260924121000_drop_redundant_indexes
  20260924122000_remove_dead_tables
  20260924123000_remove_checkins
  20260924124000_drop_refresh_token_hints

  $ grep -rn "EXPECTED_MIGRATION\|20260715110000_remove_unused_legacy_models" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next . | grep -v prisma/migrations | grep -v PROGRESS.md
  prisma/integrity-manifest.json:83: (file hash only)
  src/app/api/health/ready/route.ts:8

  PROGRESS.md "Notes for the next agent": "Every schema/migration change: `npm run update:prisma-integrity` and `EXPECTED_MIGRATION` in `src/app/api/health/ready/route.ts`." — C9/C10 added five migrations (commit fff4283) without updating the constant.
  ```

- Problem: The readiness check only asserts that one 2026-07-15 migration is applied. Every schema change since (five migrations in the current tree, including the column drop in `20260924124000_drop_refresh_token_hints`) is invisible to it, and nothing (no unit test, release gate, or prisma-integrity check) ties the constant to the newest directory under `prisma/migrations/`. The smoke test (`scripts/smoke-production-image.ts:L217`) runs `migrate` first, so it passes regardless of the constant.
- Impact: A web container started against a database where `docker compose run --rm migrate` was skipped or failed mid-way reports `ready` (200) and the Docker HEALTHCHECK keeps it in service. Today the five missing migrations are cleanup-only so queries would still work, but the very next additive migration (a new column or table) will be silently unverified: the app becomes healthy and then fails on the first query that touches the new schema. The doc string on L6-L7 promises the opposite.
- Fix: 1) In src/app/api/health/ready/route.ts:L8, set `const EXPECTED_MIGRATION = '20260924124000_drop_refresh_token_hints';`. 2) Add tests/unit/readiness-migration.test.ts. It should find the last migration by sorting the directory names in prisma/migrations (excluding migration_lock.toml), read src/app/api/health/ready/route.ts as text, and assert that it contains `const EXPECTED_MIGRATION = '<last>';`. Do not export the constant from route.ts: the project forbids test-only exports. The runner image does not contain prisma/ (docker/Dockerfile.security runner stage L98+ copies only public, .next/standalone, .next/static and a few scripts), so the route cannot read the directory at runtime.
- Fix risk: None for the app; a database that has not run the latest migrations will correctly report 503 until `migrate` runs. The test must not connect to a database (read the directory listing only).
- Verification:
  - refute: CONFIRMED — The route checks that only one migration, 20260715110000_remove_unused_legacy_models, has finished. Five later migrations exist and the constant was never updated for them: `git log -L8,8` shows its last change was on 2026-07-15, and the newest migration came in fff4283. Nothing enforces the constant. The release policy only checks that the route text contains `return databaseReady();`. The prisma-inte…
  - reproduce: CONFIRMED — The constant pins 20260715110000_remove_unused_legacy_models, but five newer migrations exist. All five were added in fff4283, and that commit left route.ts unchanged. The query at L18-L25 only checks that this one migration row is finished and not rolled back, so a database missing all five September migrations still returns 200. Nothing ties the constant to the migrations directory. The release polic…

### R-176: Readiness pins a migration five releases old: EXPECTED_MIGRATION is not tied to prisma/migrations
- Severity: Medium
- Category: Logic
- Status: CONFIRMED
- Location: src/app/api/health/ready/route.ts:L6-L8
- Evidence:

  ```text
  // This must be updated whenever a schema migration is added. Readiness is not
  // merely a TCP/SELECT probe: the running binary and database schema must agree.
  const EXPECTED_MIGRATION = '20260715110000_remove_unused_legacy_models';

  $ ls prisma/migrations | tail -2
  20260924123000_remove_checkins
  20260924124000_drop_refresh_token_hints
  $ grep -rn EXPECTED_MIGRATION --include='*.ts' --include='*.mjs' . | grep -v node_modules
  PROGRESS.md:442 (note), src/app/api/health/ready/route.ts:8, :21 (no test)
  ```

- Problem: Five migrations (C9/C10, 2026-09-24) were added without updating the constant, and no test compares it with the last directory in prisma/migrations. /api/health/ready therefore answers 200 for a database that lacks the September migrations, contradicting the route's own contract.
- Impact: A deploy of the new web image against a database whose `migrate` step was skipped or failed still passes the Compose healthcheck and receives traffic; today the drift is index/drop-only so requests would not fail, but the next migration that adds a required column would ship silently against an old schema.
- Fix: Same as index 0. Update the constant to '20260924124000_drop_refresh_token_hints' and add tests/unit/readiness-migration.test.ts. The test reads the sorted prisma/migrations directory names and the route source text, and asserts that the literal matches, with no new export. Leave out the build-time derivation into public/version.json: it exposes the schema version publicly and adds complexity the one-line test already covers.
- Fix risk: Readiness starts failing correctly on un-migrated databases (the smoke and integration suites apply all migrations, so they stay green); if derived at build time, the build script and the route test change together.
- Verification:
  - refute: CONFIRMED — This is the same defect, at the same location, as index 0, reported by a different finder. Both findings are new in this run, not recorded R-ids, so duplicate_of_existing_review stays empty. The facts check out as for index 0: the constant is stale by five migrations, no test or gate ties it to prisma/migrations, and the September drift is currently harmless, so this is a latent edge case and Medium. T…
  - reproduce: CONFIRMED — This is the same defect as index 0: same file, same lines and same root cause. It holds for the same reasons: the route pins the 2026-07-15 migration, five migrations dated 2026-09-24 were added in fff4283 without updating it, and no release-policy check, integrity check or test ties the constant to prisma/migrations. It should be merged with index 0 into a single finding. Of the two proposed fixes, th…

### R-177: `/api/security/csp-report` persists an attacker-sized `original-policy` (up to 8 KB) per report: unauthenticated audit-table growth of ~430 MB/day per source with 90-day retention
- Severity: Medium
- Category: Security
- Status: CONFIRMED
- Location: src/lib/security-monitoring.ts:L162-L172; src/app/api/security/csp-report/route.ts:L43-L46; src/app/api/errors/route.ts:L35-L39
- Evidence:

  ```text
  src/app/api/security/csp-report/route.ts:L28,L43-L46
    'original-policy': z.string().max(8_000).optional(),
    ...
    const decision = await checkSensitiveRateLimit(request, {
      scope: 'csp-report', limit: 30, windowMs: 60_000,
    });

  src/lib/security-monitoring.ts:L162-L172
    details: {
      violatedDirective: violationReport['violated-directive'],
      effectiveDirective: violationReport['effective-directive'],
      ...
      originalPolicy: violationReport['original-policy'],

  src/lib/operationalMonitor.ts:L215
    prisma.securityAuditEvent.deleteMany({ where: { occurredAt: { lt: days(90) } } }),

  deploy/nginx/nginx.conf.template:L49,L85
    ~^(?:POST|PUT|PATCH|DELETE):/api/(?:booking-requests|errors|security/csp-report|check-in(?:/|$)) $binary_remote_addr;
    limit_req_dry_run on;
  ```

- Problem: The only enforced limit is 30 reports/min per verified IP (the Nginx `public_writes` zone is dry-run by contract). Each accepted report becomes one `security_audit_events` row whose `details` JSON carries the client-supplied `original-policy` (≤ 8 000 chars) plus ~1.5 KB of other bounded strings, and rows live 90 days. The server already knows its own policy, so the stored value adds nothing for a single-policy deployment; `sanitizeValue` truncates strings at 500 only for `logSecurityDiagnostic`, not for the persisted `handleCSPViolation` path (the 500-char `redactText` applies inside `sanitizeValue`, but `recordSecurityEvent` persists `sanitized.event.details` — verified: L71 passes through `sanitizeValue`, so strings are cut at 500). Correction: strings are truncated to 500 chars by `redactSensitiveText(value, 500)`; the worst case per row is therefore ~10 fields × 500 chars ≈ 5 KB plus row overhead, i.e. ~30 × 5 KB × 1 440 ≈ 216 MB/day per source, 19 GB over the retention window per source.
- Impact: Any Internet client (all traffic arrives attested through Cloudflare → Nginx) can fill the PostgreSQL volume on the single VPS with valid-looking CSP reports; a few dozen source addresses exhaust a small disk within days, and the same table is what the operational alert rules query (`operationalMonitor.ts:L62`). A11 removed exactly this write amplification for CORS/request-shape violations but left the CSP and client-error persistence paths in place.
- Fix: Real bound: ~5 strings of at most 500 chars plus a path of at most 512 chars, so about 3-6 KB per row and ~130-260 MB/day per source (not 8 KB/430 MB). Minimal fix: keep the per-IP check. Add a SECOND call, `checkSensitiveRateLimit(request, { scope: 'csp-report-global', identifier: 'global', limit: 500, windowMs: 3_600_000 })`, because one call cannot hold two limits or windows. Do the same for `/api/errors` (scope `client-error-report-global`). Optionally stop storing `originalPolicy`: the server knows its own policy and the nonce makes each copy unique, but this only trims ~20% per row. The alternative is to route CSP reports through the existing `logSecurityDiagnostic`, as A11 did for CORS, since nothing reads `csp_violation` rows. That reverses O11, and it moves the growth to Docker logs, which have no rotation in docker-compose.prod.yml, so the owner must decide. Tests: add a route case asserting the second limiter call and 429 when it denies. Also consider /64 grouping of IPv6 keys as a separate finding.
- Fix risk: `tests/routes/csp-report.test.ts` asserts `details` with `toMatchObject` and does not include `originalPolicy`, so removing it does not break the test; a global dimension shares the fixed-window semantics of `sensitiveRateLimit`, so a legitimate burst after a bad deploy could hit it (acceptable: reports are diagnostics, not user data).
- Verification:
  - refute: CONFIRMED — The code path is real, but the headline numbers are wrong. Every string in `details` is cut to 500 UTF-16 units before the INSERT: `sanitizeEvent` -> `sanitizeValue` -> `redactSensitiveText(value, 500)`, and the output is `.slice(0, maxLength)`. So `originalPolicy` is stored as at most 500 chars, not 8 KB, and the ~430 MB/day in the title is wrong. The finding's own corrected estimate is closer, though…
  - reproduce: CONFIRMED — I traced every path. Each accepted report (30/min per verified IP, no global dimension) becomes one security_audit_events INSERT kept for 90 days. The title and the "up to 8 KB" / "~430 MB/day" figures are refuted: sanitizeValue truncates every string to 500 chars before persistence, as the finding's own "Correction" admits. Its corrected math still overstates, because there are 5 bounded strings per r…

### R-178: Release-policy 'application port must not be publicly published' check cannot see the real Compose port syntax
- Severity: Medium
- Category: Logic
- Status: CONFIRMED
- Location: scripts/lib/release-policy.mjs:L571-L581; scripts/tests/release-policy.test.mjs:L1688-L1701
- Evidence:

  ```text
  scripts/lib/release-policy.mjs:572-578
    const publiclyPublishesApplication = productionCompose?.split('\n').some((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('-')) return false;
      const mapping = trimmed.slice(1).trim().replaceAll('"', '').replaceAll("'", '');
      if (!mapping.endsWith('3000:3000')) return false;
      return !mapping.startsWith('127.0.0.1:') && !mapping.startsWith('[::1]:');
    });

  docker/docker-compose.prod.yml:52
        - "127.0.0.1:${WEB_PORT:-3000}:3000"

  Executed the same logic (node -e) against five variants:
    "127.0.0.1:${WEB_PORT:-3000}:3000" flagged: false
    "0.0.0.0:${WEB_PORT:-3000}:3000"   flagged: false   <- public, not caught
    "${WEB_PORT:-3000}:3000"           flagged: false   <- public, not caught
    "8080:3000"                        flagged: false   <- public, not caught
    "3000:3000"                        flagged: true

  The only test for this rule uses the literal form (scripts/tests/release-policy.test.mjs:1688-1701: `'      - "3000:3000"'`).
  ```

- Problem: The rule requires the mapping to end in the literal `3000:3000`. The production Compose file uses `${WEB_PORT:-3000}:3000`, so the string ends in `}:3000` and the rule never evaluates the host part. Any public publication written in the file's own syntax (`0.0.0.0:${WEB_PORT:-3000}:3000`, `${WEB_PORT:-3000}:3000`, or a different host port) passes gate 3. PROGRESS.md (S1) names this check as "the binding invariant" that replaced the systemd loopback markers.
- Impact: An operator or agent editing docker-compose.prod.yml to publish the app on all interfaces (for example to debug Nginx) would pass `validate:release-policy` and `verify:release`, while the trusted-ingress contract (Nginx is the only ingress) is silently broken. This is the one invariant the policy claims to enforce for the production Compose file.
- Fix: In docker/docker-compose.prod.yml, check every list item inside a `ports:` block, not only mappings that end in 3000. After stripping quotes, require each entry to start with `127.0.0.1:` or `[::1]:` using a prefix check, as the current code already does. Do not split on ':', because `${VAR:-default}` and `[::1]` contain colons. Reject long-syntax entries (`- target:` / `published:` / `host_ip:`), or require `host_ip: 127.0.0.1` in them. Add negative tests for `0.0.0.0:${WEB_PORT:-3000}:3000`, `${WEB_PORT:-3000}:3000`, `8080:3000` and bare `3000`, and a positive test with the current web and db lines. Run validate:release-policy and test:release-policy.
- Fix risk: Low. Must keep accepting the two existing loopback mappings (web and db). Run `validate:release-policy` and `test:release-policy`.
- Verification:
  - refute: CONFIRMED — The gap is real. The rule only looks at an entry after it has passed `mapping.endsWith('3000:3000')`. The production file writes `127.0.0.1:${WEB_PORT:-3000}:3000`, and every public variant written in that same syntax gets past the rule. I reproduced this with the exact predicate. The only test uses the literal `"3000:3000"`. No other check guards the Compose port binding: PROGRESS.md:315 calls this ch…
  - reproduce: CONFIRMED — The check at scripts/lib/release-policy.mjs:L571-L580 only looks at the host part when the mapping ends in the literal '3000:3000'. docker/docker-compose.prod.yml:L52 uses '127.0.0.1:${WEB_PORT:-3000}:3000', which ends in '}:3000', so the rule never looks at that line at all. The current file passes only because nothing matches, not because the loopback prefix is verified. I reproduced it. Public mappi…

### R-179: A ~1,300-line static analyzer of the Dockerfile runtime closure guards three hand-copied files and only models the last build stage
- Severity: Medium
- Category: Overengineering
- Status: CONFIRMED
- Location: scripts/lib/release-policy.mjs:L58-L108, L883-L2214; scripts/tests/release-policy.test.mjs:L467-L1432
- Evidence:

  ```text
  scripts/lib/release-policy.mjs:947-965
    const finalStage = stages.at(-1);
    ...
    const builderStages = stages.slice(0, -1).filter((stage) => stage.name === 'builder');

  scripts/lib/release-policy.mjs:1103-1110 (TypeScript AST walk of the copied modules)
  function analyzeRuntimeModule(relative, source, errors) {
    const sourceFile = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

  What it protects (docker/Dockerfile.security:126-130):
  COPY ... /app/scripts/start-standalone.mjs ./scripts/start-standalone.mjs
  COPY ... /app/src/lib/runtime-env-schema.js ./src/lib/runtime-env-schema.js
  COPY ... /app/src/lib/runtime-credentials.js ./src/lib/runtime-credentials.js
  COPY ... /app/node_modules/zod ./node_modules/zod

  Tests for it: scripts/tests/release-policy.test.mjs:467-1432 (~965 lines).
  The `workers` (Dockerfile:27-54) and `migrate` (Dockerfile:59-96) stages are never inspected: `parseFinalDockerCopies` keeps only `stages.at(-1)`.
  Runtime coverage of the same risk: scripts/smoke-production-image.ts:215-219 (`web healthy and ready`), and the container exits non-zero if a copied module is missing (start-standalone.mjs:4 import fails).
  ```

- Problem: validateSecurityImageRuntimeClosure re-implements a Dockerfile parser, an ESM/CJS import resolver, a process.argv data-flow check and an npm dependency-closure walker to prove that 3 files and one package are copied into the `runner` image. The property it proves is also proven, for all three images, by `npm run smoke:image` and by the first container start (fail-closed import error). It is coupled to stage order (the last FROM must be `runner`) and gives no coverage to the two other production images.
- Impact: Roughly 1,300 policy lines plus ~965 test lines to maintain; any legitimate Dockerfile change (a new ENV, a second RUN, reordering stages, adding a package) fails gate 3 with messages such as 'unmodeled final-stage RUN instruction' until the analyzer is extended. For one apartment this is the largest single maintenance cost in the release tooling. Related verify:release cost, previously kept by principle (R-076 declined; docs/release-verification.md:108-112): gates 12-15 run the same 35 Vitest files four times and gate 22 repeats gate 23's registry checks (docs L124-127; two DNS-related failures in the PROGRESS task log).
- Fix: Owner decision (it deletes a static guard). If approved: remove validateSecurityImageRuntimeClosure, its helpers (L883-L2214), the RUNTIME_*/EXPECTED_RUNTIME_* constants it alone uses (L60-L108) and the now-unused imports (`ts`, createRequire/isBuiltin, and lstat/realpath if unused elsewhere). Replace them with a short check that the runner stage has `USER 1001:1001`, no `ADD`, and the npm/npx removal RUN. Keep or rewrite the matching tests (about L1206-L1313) and delete only the closure and module-resolution tests. Make `npm run smoke:image` a mandatory step after docker:build in the scripts/README.md release sequence, and update 'Restricted policy boundary' in docs/release-verification.md. Leave the gate 12-15 and 22 overlap out of this change: R-076's rationale applies.
- Fix risk: A missing COPY would be caught at smoke/first start instead of statically; both are fail-closed. Policy test count drops; update docs/release-verification.md 'Restricted policy boundary'.
- Verification:
  - refute: CONFIRMED — The facts check out. parseFinalDockerCopies models only `stages.at(-1)`, so the workers and migrate stages are never inspected. The analyzer and its helpers (L883-L2214, plus the runtime constants at L60-L108 and the `ts`/createRequire imports) are used nowhere else. Its tests span release-policy.test.mjs:L467-L1432. It enforces exact-string ENV, RUN, USER, CMD and HEALTHCHECK instructions and rejects…
  - reproduce: CONFIRMED — The factual claims hold. The helper and analyzer block spans L883-L2214 (dockerLogicalLines at L883 through the end of validateSecurityImageRuntimeClosure, just before validateRuntimeCredentialContract at L2216). parseFinalDockerCopies models only stages.at(-1), so the workers (Dockerfile L27-L54) and migrate (L59-L96) stages are not inspected. There is a TypeScript AST walk of the copied modules (L110…

### R-180: The production-image smoke can only run against an image built for https://localhost:<port>, never against the release artifact; the docs present it as a proof of "the images of the checked-out commit"
- Severity: Medium
- Category: Maintainability
- Status: CONFIRMED
- Location: docs/deployment/production-image-smoke.md:L11-L15, L55-L58; scripts/README.md:L193-L197 (with scripts/docker-build.sh:L14 as the shared-tag source)
- Evidence:

  ```text
  docs/deployment/production-image-smoke.md:L3-L6: "`npm run smoke:image` starts the three images of the checked-out commit with the production Compose definition ... and checks the running container the way a release would be used."
  L13: "- the images from `NEXT_PUBLIC_SITE_URL=https://localhost:3002 npm run docker:build`"
  scripts/smoke-production-image.ts:L177: `NEXT_PUBLIC_SITE_URL=https://localhost:${WEB_PORT}`,
  src/lib/runtime-env-schema.js:L113-L115:
    if (env.BUILD_SITE_URL && env.NEXT_PUBLIC_SITE_URL !== env.BUILD_SITE_URL) {
      context.addIssue({ code: 'custom', path: ['NEXT_PUBLIC_SITE_URL'], message: 'Runtime site URL does not match the URL compiled into this image' });
  docker/Dockerfile.security:L118-L119: NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \ BUILD_SITE_URL=${NEXT_PUBLIC_SITE_URL}
  scripts/README.md:L140: `NEXT_PUBLIC_SITE_URL=https://your-host.example npm run docker:build`; L196-L198: "**Local proof before a release.** `npm run smoke:image` starts the three images of the checked-out commit"
  ```

- Problem: The runner image bakes `BUILD_SITE_URL` from the build argument and the runtime schema rejects any `NEXT_PUBLIC_SITE_URL` that differs from it. The smoke always sets `NEXT_PUBLIC_SITE_URL=https://localhost:<WEB_PORT>`, so it can only start an image that was built with that exact localhost URL. The release images (built with the real HTTPS host per the runbook) fail environment validation under the smoke, and the ADR itself states that an image built for another origin is a different artifact (deployment-target.md, Consequences). The smoke doc's "What it does not prove" section (L55-L58) omits this: what is smoke-tested is a sibling build, not the release image whose IDs the runbook tells the operator to record.
- Impact: An operator follows scripts/README.md: builds the release images with the production URL, then runs `npm run smoke:image` as the documented "local proof before a release": the `web healthy and ready` check fails (environment validation fails closed at start) and the run reports failures for an artifact that is fine, or the operator builds a second localhost set and ships the untested first set believing it was smoke-tested. Either way the docs overstate what is verified.
- Fix: Docs only. (1) In production-image-smoke.md "What it does not prove", add: the smoked images are a localhost build of the same commit and Dockerfile, not the release artifact. `NEXT_PUBLIC_SITE_URL` is compiled in (ADR, Consequences), and the runtime schema rejects a different runtime URL, so the smoke cannot start the production-URL images. (2) Under "What it needs", note that this build reuses the `villa-app:<sha>[-workers|-migrate]` tags. Run the smoke before the release `docker:build`, then scan, save and record only the image IDs printed by the production-URL build, which overwrites the smoke tags. (3) In scripts/README.md 'Local proof before a release', add one sentence with the same ordering. Do not change the script (reading BUILD_SITE_URL from the image) without owner approval. It changes the same-origin/ALLOWED_ORIGINS conditions of the smoke and is beyond a minimal fix.
- Fix risk: Docs-only change: none. The optional script change alters the same-origin admin mutation behaviour in the smoke (Origin `http://localhost:<port>` vs the compiled host), so the guest-journey checks must be re-run after it.
- Verification:
  - refute: CONFIRMED — The mechanism is real and certain from the code. The runner image bakes BUILD_SITE_URL from the build arg. The runtime schema rejects any NEXT_PUBLIC_SITE_URL that differs from it. The smoke always injects https://localhost:<WEB_PORT>. So the smoke can only start an image built for that localhost origin, which by the ADR's own Consequences is not the same production artifact. No prior REVIEW.md/PROGRES…  The finding overstates the documentation gap in two ways, so I calibrated it down from Medium to Low. (1) The smoke doc does not hide the requirement: L13 and the script header (L11) say to build with NEXT_PUBLIC_SITE_URL=https://localhost:3002. (2) "What it does not prove" (L57-L58) already lists "the production hostname", although it frames that as being outside the container rather than as a different image.  The finder missed a more concrete hazard. Both builds get the same tags: docker-build.sh tags with scripts/image-tag.sh (villa-app:<sha>[-workers|-migrate]), and the smoke's default SMOKE_APP_IMAGE is the same reference. So after a release build the smoke fails its fatal 'web healthy and ready' check on a correct artifact. A localhost rebuild overwrites the tags that `docker:scan` and `docker save villa-app:<sha>` use. If the operator then re-saves, the shipped image fails closed at production start. Because `up -d --wait web` recreates the container, the site is down until a manual rollback. That needs an out-of-order operator mistake: in the runbook, save comes right after the production build, before the smoke. The failure also fails closed rather than serving wrong results. For a single operator this is a docs/process gap, not a runtime defect: Low.  On the proposed fix: the docs-only part is correct but should also state the shared-tag ordering. The optional script change (read BUILD_SITE_URL from the image and run it with a localhost browser) goes beyond a minimal fix. The finder's own fix_risk says it changes same-origin/ALLOWED_ORIGINS behaviour, so it needs owner approval and should not be part of this fix.
  - reproduce: CONFIRMED — I traced the full path. docker-build.sh bakes the build argument into the runner image twice, as NEXT_PUBLIC_SITE_URL and as BUILD_SITE_URL. The smoke's env_file always sets NEXT_PUBLIC_SITE_URL to https://localhost:<WEB_PORT> and never sets BUILD_SITE_URL, so the image's baked BUILD_SITE_URL stays in effect. The runtime schema adds an issue whenever the two differ. instrumentation.ts calls validateEnv…

### R-181: The production migrate image is installed from a lockfile without the root overrides, so it ships the Prisma-chain packages the overrides were added to patch
- Severity: Medium
- Category: Dependencies
- Status: CONFIRMED
- Location: docker/migrate/package.json:L11-L14 (missing overrides); docker/migrate/package-lock.json (resolved versions); tests/unit/migrate-image-manifest.test.ts:L15-L28 (the gap that lets the drift through)
- Evidence:

  ```text
  docker/migrate/package.json:L11-14 (there is no `overrides` field anywhere in the file):
    "dependencies": {
      "dotenv": "17.4.2",
      "prisma": "7.8.0"
    }
  package.json:L147-153:
    "overrides": {
      "@prisma/dev": "0.24.17",
      ...
      "deepmerge-ts": "^8.0.2",
      "fast-uri": "^3.1.8",
      "mysql2": "^3.24.4",
  Lockfile comparison (node -e over both lockfiles):
    @prisma/dev   migrate: 0.24.3  root: 0.24.17
    mysql2        migrate: 3.15.3  root: 3.24.4
    deepmerge-ts  migrate: 7.1.5   root: 8.0.2
    valibot       migrate: 1.2.0   root: 1.4.2
    @hono/node-server migrate: 1.19.11  root: (absent)
  node_modules/prisma/package.json dependencies: {"@prisma/dev":"0.24.3","mysql2":"3.15.3",...} (regular dependencies, so `npm ci --omit=dev` installs them)
  Dockerfile.security:L77,L84: COPY docker/migrate/package.json docker/migrate/package-lock.json ./ ... npm ci --omit=dev
  GitHub Advisory DB (api.github.com/advisories?affects=...):
    mysql2@3.15.3: GHSA-3f6p-5ww8-9rcr (High, <3.22.0), GHSA-rgwj-5xj2-c3m3 (Medium, <=3.23.0)
    deepmerge-ts@7.1.5: GHSA-ggr8-5vv4-36mx (High, <8.0.0)
    @hono/node-server@1.19.11: GHSA-frvp-7c67-39w9, GHSA-92pp-h63x-v22m (Medium)
    valibot@1.2.0: GHSA-5qjj-4xww-7phc (Medium, <=1.4.1)
  docs/release-verification.md:L94-99 documents these overrides as fixes for the prisma@7.x pins.
  tests/unit/migrate-image-manifest.test.ts:L15-28 checks only the prisma/dotenv versions and the absence of dev entries, not overrides.
  scripts/lib/npm-audit-evidence.ts:L262 runs `npm audit` with `cwd` = the repository root only.
  ```

- Problem: F1 created a second, independent npm project for the `migrate` target, but did not copy the root `overrides`. The production migrate image therefore contains mysql2 3.15.3, deepmerge-ts 7.1.5, @prisma/dev 0.24.3 (with @hono/node-server 1.19.11 and valibot 1.2.0), which carry two High and four Medium advisories. The root overrides and docs/release-verification.md exist to remove exactly these packages. No gate audits or license-checks this lockfile: validate:security runs `npm audit` in the root only, check-licenses reads the root tree, and the manifest test does not compare overrides.
- Impact: Exploitability inside `prisma migrate deploy` looks low: mysql2 is loaded only by Studio's MySQL adapter, deepmerge-ts merges repository-controlled config, and hono serves only `prisma dev`. Still, a shipped production image contains advisories the project says it has patched. `npm run docker:scan` (Trivy or Scout with a HIGH/CRITICAL threshold) is expected to fail on the `-migrate` image, and any release evidence that relies on the root audit misstates the migrate image's content. Every future advisory in this chain will also be missed silently.
- Fix: The proposed fix stands, with one addition to the test. (1) In docker/migrate/package.json, add `"overrides": { "deepmerge-ts": "^8.0.2", "fast-uri": "^3.1.8", "mysql2": "^3.24.4" }`. Update after R3-A4 (Prisma 7.10.0): `prisma@7.10.0` itself pins `@prisma/dev` 0.24.17, so the root `@prisma/dev` override was removed and is not added here; the regenerated migrate lock already resolves `@prisma/dev` 0.24.17 and `valibot` 1.4.2 and no longer contains `@hono/node-server`. Of the override targets, only `mysql2` (3.15.3 vs 3.24.4) and `deepmerge-ts` (7.1.5 vs 8.0.2) still differ from the root lock; `fast-uri` is 3.1.8 in both. (2) Regenerate docker/migrate/package-lock.json with `npm install --package-lock-only` in docker/migrate. This needs network access and owner approval. (3) In tests/unit/migrate-image-manifest.test.ts, assert that for each of these three keys `manifest.overrides[key] === rootManifest.overrides[key]`. Also consider asserting that every package present in both lockfiles resolves to the same version, because that catches future drift without keeping a list of override names. (4) Rebuild the migrate image and re-verify it with `npm run smoke:image` (migrate deploy applies all migrations and a second run is a no-op). Optionally run `npm run docker:scan` on the -migrate tag. The functional risk of the deepmerge-ts 7 to 8 jump is already covered, because the root tree runs the same prisma CLI (7.10.0 since R3-A4) with these overrides in the integration suite.
- Fix risk: Lockfile regeneration downloads metadata (approval needed). The migrate image must be rebuilt and re-verified with `npm run smoke:image` (migrate deploy 19/19, second run no-op). The deepmerge-ts 7→8 major jump is already exercised by the root tree (prisma CLI works under the root overrides), so functional risk is low.
- Verification:
  - refute: CONFIRMED — The finding holds. docker/migrate/package.json has no `overrides` field, but root package.json:L147-157 overrides `@prisma/dev`, `deepmerge-ts`, `fast-uri` and `mysql2`. docs/release-verification.md:L94-99 says those overrides exist because `prisma@7.x pins vulnerable versions`. prisma@7.8.0 declares `@prisma/dev` 0.24.3 and `mysql2` 3.15.3 as regular dependencies, and @prisma/config@7.8.0 declares `de…
  - reproduce: CONFIRMED — The core claim reproduces. docker/migrate/package.json has no `overrides` field, while the root package.json has overrides for @prisma/dev, deepmerge-ts, fast-uri and mysql2. The migrate lockfile resolves the versions that prisma@7.8.0 pins (mysql2 3.15.3, deepmerge-ts 7.1.5, @prisma/dev 0.24.3). The root tree has the overridden versions. None of these entries is marked dev, optional or peer, so the Do…

### R-182: The approved PostgreSQL image digest is 16.14; 16.15 (September 2026) fixes more than 20 CVEs, many CVSS 8.8
- Severity: Medium
- Category: Dependencies
- Status: CONFIRMED
- Location: docker/docker-compose.prod.yml:L26 (also docker-compose.yml:L3, scripts/lib/release-gates.mjs:L4, scripts/lib/release-policy.mjs:L13, tests/integration/support/postgres-image-policy.ts:L6, scripts/tests/release-policy.test.mjs:L22 and L211, docs/release-verification.md:L174)
- Evidence:

  ```text
  docker/docker-compose.prod.yml:L26:
      image: postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777
  The same digest is in docker-compose.yml:L3, scripts/lib/release-policy.mjs:L13, scripts/lib/release-gates.mjs:L4, tests/integration/support/postgres-image-policy.ts:L6 and docs/release-verification.md:L174.
  Docker Hub API (hub.docker.com/v2/repositories/library/postgres/tags?name=16):
    16.14-alpine / 16.14-alpine3.24 -> sha256:57c72fd2...7777 (last_updated 2026-07-08)
    16-alpine / 16.15-alpine -> sha256:721873c3...80ea (last_updated 2026-09-21)
  postgresql.org/support/security: fixed in 16.15, including CVE-2026-16239 (cursor CLOSE+DECLARE type confusion, arbitrary code, 8.8), CVE-2026-15741 (EXTRACT deparse SQL injection, 8.8), CVE-2026-14669 (to_char heap overflow, 8.8), CVE-2026-14664 (regexp heap overflow, 8.8) and CVE-2026-14666 (row security caching, 4.2).
  postgresql.org/support/versioning: the current 16.x minor is 16.15.
  ```

- Problem: The production (and dev/integration) PostgreSQL image is pinned to 16.14-alpine, which predates the 16.15 security release. The release policy hard-codes this exact digest in 6 places, and no process or gate flags a stale digest: `check:postgres-image-policy` verifies provenance, not currency.
- Impact: Most 16.15 CVEs need an authenticated SQL session (CVSS 8.8 = low-privilege authenticated). Here the database listens on 127.0.0.1 and the app uses Prisma parameterization, so exploitation needs a prior foothold (an SQL injection or a leaked app/migration role credential). Given that foothold, several bugs allow arbitrary code execution as the postgres user, which exposes all guest PII (phones, booking data) and threatens GDPR obligations. It is defense in depth, but the fix is a routine minor update.
- Fix: Follow docs/release-verification.md 'Controlled PostgreSQL digest update'. On the update day, resolve the official postgres:16-alpine OCI-index digest with `docker buildx imagetools inspect postgres:16-alpine` (and again with `--raw`). Docker Hub currently reports sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea, but that value can change with Alpine rebuilds, so verify it rather than copying it. In the raw index, confirm the linux/amd64 and linux/arm64/v8 PostgreSQL 16.15 descriptors. Replace the digest in all 8 occurrences across 7 files in one diff: both compose files, release-gates.mjs:4, release-policy.mjs:13, postgres-image-policy.ts:6, scripts/tests/release-policy.test.mjs:22 and :211, and docs/release-verification.md:174. Then run validate:release-policy, test:release-policy, test:postgres-image-policy, check:postgres-image-policy, test:integration and smoke:image. For production, pull the new image and recreate the `db` service. The data volume is reused and no dump or restore is needed. No post-update REINDEX or ANALYZE is required, because there are no GIN, btree_gist or ltree indexes.
- Fix risk: A minor PostgreSQL update in the same major version needs no dump/restore. It touches pinned constants in the release policy and tests, which must all change together or the policy gate fails. Run the integration suite and `smoke:image` on the new digest.
- Verification:
  - refute: CONFIRMED — Every factual claim that matters checks out. The pinned digest is the official 16.14-alpine index. 16.15 is the current 16.x minor, and postgresql.org lists 23 CVEs fixed in 16.15 for version 16, many of them CVSS 8.8 arbitrary-code bugs in the server core (cursor CLOSE+DECLARE, EXTRACT deparse, to_char, regexp, tsvector, internal-argument type confusion). None of the release policy checks look at curr…  Calibration: Medium stands, not higher. The db port is bound to 127.0.0.1 only. The app uses Prisma parameterization; the only $executeRawUnsafe calls are constant SET LOCAL statements. The schema and migrations add no extensions or GIN indexes. So exploiting these CVEs needs a prior foothold with arbitrary SQL (a leaked role credential or app RCE). With that foothold, they raise a least-privilege app role (scripts/README.md:159) to code execution as the postgres OS user, on a database that holds guest PII. It is defense in depth, and the fix is cheap and routine.  Three corrections to the finding. (1) 16.15 was released on 2026-08-13 (postgresql.org news). September is only when Docker Hub last rebuilt the tag. (2) The digest appears in 8 places across 7 files, not 6: scripts/tests/release-policy.test.mjs holds it twice, at L22 and inside the fixture at L211. docs/release-verification.md step 4 calls these 'affected fixtures'. Missing them would fail test:release-policy. (3) Several of the 16.15 CVEs are client-side (pg_dump, psql, ECPG) or in extensions this DB does not install (plperl, pltcl, fuzzystrmatch, pg_trgm, refint, amcheck), so 'more than 20' overstates the exposure that applies here. The core-server CVEs are still enough to justify the update.  Fix risk is low. Upstream says a minor update needs no dump or restore. Of the post-update steps, GIN reltuples does not apply because there are no GIN indexes, and btree_gist and ltree are not used. The WAL-replay self-deadlock note affects only standbys.
  - reproduce: CONFIRMED — The cited line holds and the digest's identity checks out. Docker Hub maps the pinned digest sha256:57c72fd2...7777 to 16.14-alpine / 16.14-alpine3.24 (last_updated 2026-07-08). 16.15-alpine / 16.15-alpine3.24 now resolves to sha256:721873c3...80ea (2026-09-21). postgresql.org/support/security lists about 25 CVEs with 16.15 in their fixed-in column, so '>20' holds. All five cited CVEs have fixed-in '18…

### R-183: The Node base image is pinned to 22.23.1-alpine, which predates the July 29, 2026 Node security release (22.23.2)
- Severity: Medium
- Category: Dependencies
- Status: CONFIRMED
- Location: docker/Dockerfile.security:L1, L27, L59, L98
- Evidence:

  ```text
  docker/Dockerfile.security:L1 (same digest at L27, L59, L98):
  FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS builder
  Docker Hub API (tags?name=22.23.):
    22.23.1-alpine / 22.23.1-alpine3.24 -> sha256:16e22a55...c3e2 (last_updated 2026-06-23)
    22.23.2-alpine -> sha256:b6f26b36... (2026-09-18); 22.23.3-alpine / 22-alpine -> sha256:0a7108bf... (2026-09-23)
  `git log -S` on the digest: introduced in 6af0717 (2026-07-15).
  nodejs.org/en/blog/vulnerability/july-2026-security-releases: 22.x fixed in v22.23.2; HIGH CVE-2026-56846/56848 (HTTP/2), CVE-2026-58043 (Permission Model); MEDIUM CVE-2026-58040 (HTTPS Agent session reuse skips hostname verification), CVE-2026-58045 (zlib sync); LOW CVE-2026-58044 (HTTP parser header truncation, request smuggling).
  ```

- Problem: All four production stages (runner, workers, migrate, builder) run Node 22.23.1 plus the Alpine packages from the June 23 image. The digest was never refreshed after the July 29 security release, and no gate checks base-image currency. `docker:scan` is manual and not part of verify:release.
- Impact: Reachability in this app is limited. `grep` finds no `https`/`http2`/`node:zlib`/`dns.resolveAny` use in src or the worker entry points, and outbound calls (bookingOutbox.ts:L98, operationalMonitor.ts:L99) use `fetch` (undici), so the HIGH HTTP/2 and Permission Model CVEs do not apply. No reachable CVE was shown (corrected per the verification below): CVE-2026-58044 (request smuggling) needs a Node-based forwarding proxy, which this app does not have (next.config.ts has no rewrites or proxy; scripts/dev-proxy.mjs is dev-only), and the only server-side parser change in 22.23.2 (llhttp 9.4.3) sits behind Cloudflare mTLS and Nginx request buffering. The update is routine hygiene: the residual risk is Alpine OS package CVEs since June 23, unknown without a scanner, and further drift of the production runtime as later releases land.
- Fix: 1. Re-pin all four FROM lines to the current official node:22-alpine multi-platform index digest. Resolve it at change time with `docker buildx imagetools inspect node:22-alpine`, and check it again with `--raw` (on 2026-09-23, 22.23.3-alpine = sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402, still Alpine 3.24, so the `dumb-init=1.2.5-r4` apk pin should still resolve; verify this during the build). Needs owner approval for the local docker build: it runs npm ci and apk add. After that, run docker:build, docker:scan (needs Trivy or Docker Scout installed) and smoke:image.
2. Add a short 'Controlled Node base-image digest update' section to docs/release-verification.md next to the PostgreSQL section. Use the same inspect/--raw/index-digest steps and trigger it on each Node 22.x security release. Do not add a new release gate without approval.
3. Correct the finding's impact text: no 22.23.2 CVE is demonstrated reachable. CVE-2026-58044 needs Node as a forwarding proxy, and the llhttp change is shielded by Cloudflare mTLS plus Nginx request buffering. The residual risk is unknown Alpine package CVEs and drift.
- Fix risk: A patch-level Node update. `dumb-init=1.2.5-r4` must still exist in the Alpine index of the new base (the apk pin fails closed if not). Rebuild all three images and run the smoke test.
- Verification:
  - refute: CONFIRMED — The main fact is correct. All four stages pin the Node 22.23.1-alpine index digest (Alpine 3.24, published 2026-06-23). Node 22.23.2 (a security release, 2026-07-29) and 22.23.3 (2026-09-23: OpenSSL 3.5.8, Undici 6.28.1, root certificates) both came out later. No verify:release gate scans or checks the base image, and docs/release-verification.md has a digest-update procedure for PostgreSQL only, not f…  The impact reasoning needs a correction. The finding says CVE-2026-58044 'does apply, because Nginx forwards to the Node server'. That is wrong. The advisory limits the exploit to 'Node.js-based forwarding proxies that rebuild outbound headers from the visible IncomingMessage headers while piping the original body to a reused backend connection'. This app has no Node forwarding path: next.config.ts has no rewrites or proxy, and scripts/dev-proxy.mjs is dev-only. The only server-side parser change in 22.23.2 is llhttp 9.4.3 ('Do not allow empty transfer-encoding'). In front of Node sit Cloudflare (mTLS origin pull, ssl_verify_client on) and Nginx, which keeps the default proxy_request_buffering on and so reads the whole body before sending it upstream. That exposure is SUSPECTED at most, not demonstrated.  The other 22.23.2 CVEs need code paths this app does not have: http2, the Permission Model, the https.Agent, dns.resolveAny, or attacker-controlled TypedArrays passed to sync zlib. The Undici 6.28.0 advisories cover a duck-typed blob `type`, the retry interceptor and setCookie. The outbound fetch calls send JSON.stringify strings with fixed headers, so none of these apply either. Alpine OS package CVEs since June are unknown without a scan.  What remains is supply-chain hygiene plus a process gap (no refresh procedure or cadence), with no demonstrated exploitable issue for a single-apartment deployment behind Cloudflare and Nginx. That is Low, not Medium. Minor factual slip: the digest first appears in 51cc925 (2026-07-15 14:57), not 6af0717 (same day, later). The proposed fix is right and minimal. Doing it needs a local docker build, which PROGRESS.md:L50 says requires the owner's approval because it downloads npm and apk packages.
  - reproduce: CONFIRMED — I checked every factual claim and each one holds. All four FROM lines pin the digest sha256:16e22a55…c3e2. Docker Hub's API lists that digest as 22.23.1-alpine / 22.23.1-alpine3.24, last updated 2026-06-23. Newer 22.x alpine digests exist: 22.23.2-alpine (b6f26b36…, 2026-09-18) and 22.23.3-alpine (0a7108bf…, 2026-09-23). The Node.js July 2026 advisory says the 22.x fixes shipped in v22.23.2, including…

### R-184: The approved Nginx image is 1.28.3, an unmaintained branch that falls inside the ranges of the 2026 advisories fixed only in 1.30.x/1.31.x
- Severity: Medium
- Category: Dependencies
- Status: CONFIRMED
- Location: deploy/nginx/image.lock.json:L3-L6; scripts/lib/release-policy.mjs:L14-L15; scripts/tests/release-policy.test.mjs:L222-L226; docs/deployment/origin-ingress-runbook.md:L37-L45
- Evidence:

  ```text
  deploy/nginx/image.lock.json:L2-6:
    "repository": "docker.io/library/nginx",
    "tag": "1.28.3-alpine",
    "digest": "sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236",
    "verifiedAt": "2026-07-18",
  scripts/lib/release-policy.mjs:L536-538: the lock must equal EXPECTED_NGINX_IMAGE, else 'Nginx must use the approved multi-platform digest-pinned official image'.
  Docker Hub: 1.28.3-alpine = sha256:a8b39bd9... last_updated 2026-03-25; no 1.28.x tag was updated after 2026-04-08.
  nginx.org/en/security_advisories.html: CVE-2026-42533 (major, map with regex, 0.9.6-1.31.2, fixed 1.31.3+/1.30.4+); CVE-2026-9256 and CVE-2026-42945 (rewrite), CVE-2026-56434 (ssi), CVE-2026-60005 (slice), CVE-2026-40701 (OCSP resolver) and others list only 1.30.x/1.31.x fixes.
  deploy/nginx/nginx.conf.template:L43-45:
    map "$request_method:$uri" $auth_rate_key {
      ~^POST:/api/(?:admin/(?:login|refresh)|portal/(?:claim-exchange|claims|sessions|refresh))$ $binary_remote_addr;
  `grep '\$[0-9]\|rewrite'` over the template and includes: no capture variables and no rewrite; no ssi/slice/charset/grpc/resolver directives.
  ```

- Problem: The only Nginx image the release policy accepts (used by `test:nginx-ingress` and, per docs/deployment/origin-ingress-runbook.md:L39-41, the 'official image' deployment option) is 1.28.3. That branch receives no fixes: every 2026 advisory after April lists only 1.30.x/1.31.x as fixed. The config already uses regex `map` blocks, the construct of the major CVE-2026-42533.
- Impact: With the current template, the known CVEs are not triggered: CVE-2026-42533 needs a map regex capture ($1…) referenced before the map output, and there are no captures, rewrite, ssi, slice or OCSP resolver. The edge proxy of an internet-facing site still runs a branch with no security support. One future edit that adds a capture or `rewrite` would make an unauthenticated heap overflow reachable, and future advisories will not get a 1.28 fix. If the host Nginx is a distro package instead, this lock does not describe production, which is a documentation gap.
- Fix: Pin the lock to the current stable index digest of nginx:1.30.5-alpine (at least 1.30.4, which fixes CVE-2026-42533). Update tag, digest and verifiedAt in deploy/nginx/image.lock.json, EXPECTED_NGINX_IMAGE in scripts/lib/release-policy.mjs:L14-L15, and the fixture digest in scripts/tests/release-policy.test.mjs:L224. Keep mediaType as the OCI index. With the owner's approval, pull the new digest locally, because test-nginx-ingress.sh only inspects the image and does not pull it. Then run `npm run test:nginx-ingress`, `validate:release-policy` and `test:release-policy`. Add one line to docs/deployment/origin-ingress-runbook.md saying which Nginx build production runs (this image or a distro package) and the minimum acceptable version, so the lock actually describes production.
- Fix risk: The stable-branch update may change directive defaults. The disposable ingress test (header overwrite, real-IP, attestation) must pass on the new image before it replaces production.
- Verification:
  - refute: CONFIRMED — I tried to refute this and could not. The pinned image is the 1.28.3-alpine index. nginx.org lists 1.28.3 under 'Legacy versions'; the current stable is 1.30.5 and mainline is 1.31.6. Every advisory after the 1.28.3 release (CVE-2026-40701, -42945, -9256, -42055, -42533, -56434, -60005, -90439 and others) lists only 1.30.x/1.31.x as fixed, and CVE-2026-42533 (major) covers 0.9.6-1.31.2, so 1.28.3 is in…  The finding's reachability analysis holds for the current template. There are no $N or named captures (the maps use only (?:...)), and no rewrite, ssi, slice, charset, grpc, resolver/stapling, http2/http3/quic, scgi/uwsgi, dav or mp4 directives. The includes contain only set_real_ip_from and geo CIDR lines. The listen directive is plain 'listen 443 ssl'.  One gap in the finding: the official 1.30.4 CHANGES entry for CVE-2026-42533 has a second variant, 'a similar issue might happen when using a non-cacheable variable in a string expression'. The template has such an expression: map "$request_method:$uri", where both variables are non-cacheable. The fix commits are generic 'Script: buffer overrun protection' and 'Access log: buffer overrun protection' changes, and I could not work out that variant's exact trigger. Nothing in the config changes $uri or $request_method between the length pass and the copy pass, so it is probably not reachable, but I could not verify that.  Severity stays Medium, not higher. No known CVE is shown to be reachable today. Port 443 accepts only Cloudflare (firewall plus ssl_verify_client). The docs do not say whether production Nginx is this image or a distro package: docker-compose.prod.yml has no nginx service, and the runbook says only 'for the official image'. Still, this is the edge proxy of an internet-facing site, frozen on a branch that gets no fixes.  The proposed fix names the right three places and nothing else references the digest. It leaves out two things. First, the ingress gate does not pull the image: scripts/test-nginx-ingress.sh:L21 only runs 'docker image inspect', so the operator must pull the new digest first, and a pull is a download that needs the owner's approval under the global CLAUDE.md. Second, the lock's 'verifiedAt' should be updated.
  - reproduce: CONFIRMED — Every factual claim checks out. The lock pins nginx 1.28.3-alpine by digest, and the release policy accepts only that digest. The Docker Hub tag 1.28.3-alpine resolves to that same digest (last_updated 2026-03-25), and no 1.28 tag was updated after 2026-04-08. The nginx.org advisories list 14 CVEs for 2026, and none of them gives a 1.28.x fix: the fixed versions are 1.30.x or 1.31.x only. CVE-2026-4253…

### R-185: `npm run db:studio` (Prisma 7.8.0) serves Studio on all interfaces with `Access-Control-Allow-Origin: *` and an arbitrary-query endpoint
- Severity: Medium
- Category: Security
- Status: CONFIRMED
- Location: package.json:L75 (dependency pins at package.json:L91-L92, L134; docker/migrate/package.json)
- Evidence:

  ```text
  package.json:L75:
      "db:studio": "bash ./scripts/system-orchestrator.sh bootstrap --db-only --skip-migrate && npx prisma studio --port 5555",
  package.json:L91-92,L134: "@prisma/adapter-pg": "^7.0.0", "@prisma/client": "^7.0.0", "prisma": "^7.0.0" (installed 7.8.0)
  node_modules/prisma/build/index.js (7.8.0), Node server: `return o.listen(n,r)` (port only, no host → all interfaces)
    function DU(e){let r=new Headers(e.headers);return r.set("Access-Control-Allow-Origin","*"),new Response(...)}
    eir(): 204 with "Access-Control-Allow-Methods":"GET, HEAD, POST, OPTIONS"
    if(c.method==="POST"&&u==="/bff")return Yor(...)  ->  if(o==="query"){let[i,a]=await r.execute(n.query);return tl(...)}
  CLI options in 7.8.0: "--port","--browser","--url" (no hostname option).
  Prisma 7.10.0 release notes (github.com/prisma/prisma/releases, 2026-08-25): 'Prisma Studio's local HTTP server now: Binds explicitly to 127.0.0.1 ... Rejects browser requests from origins other than the active localhost ... No longer returns wildcard CORS headers.'
  ```

- Problem: While `db:studio` runs, any host on the same network can POST `{procedure:'query', ...}` to :5555/bff and execute SQL against the configured database. Any web page the developer visits can do the same from the browser and read the result, because every response carries `Access-Control-Allow-Origin: *`. Prisma fixed this in 7.10.0; the project is on 7.8.0.
- Impact: Development only, and only while Studio runs, but it gives unauthenticated read/write SQL access to whatever `DATABASE_URL` points at: normally the dev DB, and any production or restore copy an operator points it at. On a café or guest Wi-Fi, a LAN attacker can dump or modify guest records. Recent Chromium local-network-access prompts may block the browser vector, but not the LAN one.
- Fix: Primary fix, with owner approval: bump `prisma`, `@prisma/client`, `@prisma/adapter-pg` (package.json:L91-L92, L134) and `docker/migrate/package.json` `prisma` to 7.10.0 together. Regenerate both lockfiles, update `allowScripts` entries `@prisma/engines@7.8.0`/`prisma@7.8.0` to the new version, and run typecheck, `npm test`, `test:integration`, `check:prisma-integrity` and `smoke:image`. Until then, the minimal reversible step is to remove the `db:studio` alias, or add a warning where a developer would see it. Version 7.8.0 offers no flag to restrict the bind address.
- Fix risk: A Prisma minor upgrade regenerates the client. Run typecheck, the full unit suite, `test:integration`, `check:prisma-integrity` and `smoke:image`. Recheck whether the Prisma-chain overrides are still needed for 7.10.
- Verification:
  - refute: CONFIRMED — I read the installed Prisma 7.8.0 CLI and could not refute the finding. `prisma studio` accepts only --config/--port/--browser/--url, with no host option. The Node server calls `o.listen(port, onListenCallback)`, so it binds every interface. The request handler never checks Origin or Host. Every response, including the 204 preflight, goes through `DU()`, which sets `Access-Control-Allow-Origin: *`. `PO…  Severity calibration: realistically only dev data is exposed. The dev DB container is loopback-only (docker-compose.yml:L10), and PROGRESS.md O15 records that no production database is reachable from this machine. So the exposure is the dev DB with smoke-test rows, and only while Studio runs on an untrusted network. Medium (edge case) fits. It is not High. `db:studio` appears nowhere except package.json (no docs or runbook). Nothing in PROGRESS.md or REVIEW.md (review 1 or 2) records it.  The fix is sound. The upgrade needs owner approval (installing packages). The migrate manifest test does enforce prisma == @prisma/client == docker/migrate prisma. Version 7.8.0 has no config-only mitigation because there is no host flag.
  - reproduce: CONFIRMED — The installed Prisma CLI is 7.8.0. Its Node Studio server calls `listen(port, callback)` with no host argument, so Node binds to the unspecified address, which means all interfaces. The request handler Jor has no Origin or Host check before it routes POST /bff to Yor. Yor runs `r.execute(n.query)` for procedure 'query', and every response, including the OPTIONS preflight (204, allowing the Content-Type…

### R-186: Guests accept "portal terms" and data processing that are never shown; there is no privacy notice anywhere on the site
- Severity: Medium
- Category: Legal
- Status: CONFIRMED
- Location: src/lib/guestTermsText.ts:L11-L14; src/app/[locale]/guest/UnifiedGuestClient.tsx:L284-L289; src/components/BookingForm.tsx:L299-L301; src/i18n/domains/booking.ts:L127,L215
- Evidence:

  ```text
  src/lib/guestTermsText.ts:L12-L13
    en: 'I confirm my details are correct and accept the portal terms and data processing needed to provide my stay.',
    el: 'Επιβεβαιώνω ότι τα στοιχεία μου είναι σωστά και αποδέχομαι τους όρους χρήσης και την επεξεργασία δεδομένων για την παροχή της διαμονής.',
  src/app/[locale]/guest/UnifiedGuestClient.tsx:L284-L288 renders only that sentence next to a required checkbox (no link).
  src/i18n/domains/booking.ts:L127 form.terms: "By clicking \"Send request\" you share your stay details with the host..." (the form collects first/last name, email, phone, arrival window, free-text requests: BookingForm.tsx:L50-L57).
  Searches: `ls src/app/[locale]` -> [category] about apartment book booking-details check-in favorites guest offline portal (no terms/privacy route); `find src/app -iname '*terms*' -o -iname '*privacy*'` -> nothing; `grep -rn -i "href=.*\(terms\|privacy\|policy\)\|/terms\|/privacy" src` -> no page links; `grep -rn -i "privacy\|απορρ" src/i18n/domains` -> no privacy wording.
  ```

- Problem: The sign-up checkbox (whose text is hashed and stored as a TermsAcceptance, portalAuthService.ts:L270) says the guest accepts "the portal terms", but no terms document exists. Neither the portal sign-up nor the public booking form gives the information GDPR Art. 13 requires at collection (controller identity and contact, purposes, legal basis, retention, recipients such as the webhook receiver, data-subject rights, right to complain to the Hellenic DPA). The stored acceptance therefore records agreement to a text that does not exist, and it bundles "data processing needed to provide my stay" (a contract basis, Art. 6(1)(b)) into a checkbox that reads like consent.
- Impact: If a guest or the Hellenic DPA asks what the guest agreed to or how their phone, name and email are processed, the owner has no notice to point to, and the TermsAcceptance evidence refers to a non-existent document. This is a compliance gap in Greece (GDPR + Law 4624/2019) on the two flows that collect personal data. The legal assessment itself should be confirmed by the owner or an advisor; the absence of any notice is confirmed in code.
- Fix: Add one static bilingual privacy notice page under src/app/[locale]/ (content in a new src/i18n domain). It should name the controller and contact, purposes, legal basis (contract / legal obligation), retention, recipients (host webhook receiver) and data-subject rights, including the complaint route to the Hellenic DPA. The owner or an adviser should supply or approve the legal wording.

Link the page from the booking form's `terms` paragraph and next to the sign-up checkbox. Put the link in a sibling element outside the `<span>{GUEST_TERMS_TEXT[locale]}</span>`, so the hashed sentence stays a complete text node and tests/components/guest-terms.test.tsx:L24 still matches.

Reword GUEST_TERMS_TEXT (en and el) so it no longer refers to non-existent "portal terms", e.g. "I confirm my details are correct and have read the privacy notice". Bump GUEST_TERMS_VERSION in the same change; the hash test recomputes from the constants and needs no edit. Optionally add the page to src/app/sitemap.ts.
- Fix risk: Changing GUEST_TERMS_TEXT changes the stored hash; tests/components/guest-terms.test.tsx and the version constant must be updated together. Content only otherwise; CSP unaffected for a static page.
- Verification:
  - refute: CONFIRMED — I tried to refute it and could not. The sign-up checkbox renders only the one plain sentence from src/lib/guestTermsText.ts, with no link. The server requires `acceptTerms: z.literal(true)` and stores a TermsAcceptance with the version and hash of that sentence. Nowhere in the repo is there a terms document or a privacy notice: no route, no dictionary text, no link. The public booking form collects fir…  This is not a duplicate of R-117. R-117 (fixed in B1) was about hashing a three-sentence text that guests never saw. B1 deliberately kept the wording guests already saw (PROGRESS.md:L125: "Wording is unchanged from what guests saw"). It did not create the document that wording refers to, and nothing in REVIEW.md or PROGRESS.md records or declines a missing privacy notice.  Severity: Medium is right for one apartment with about 1,000 guests a year. Nothing crashes and no data is lost, so it is not High or Critical. But both flows that collect personal data give no Art. 13 information, and the stored acceptance refers to a text that does not exist, so it is more than a Low cleanup. The code facts are confirmed. Whether this is a legal breach, and how serious, is for the owner or an adviser to judge.  The proposed fix is basically sound. One correction on test risk: tests/components/guest-terms.test.tsx:L24 checks `screen.getByText(GUEST_TERMS_TEXT[locale])`, so the hashed sentence must stay the complete text of its own element. Put the privacy link in a sibling element; do not interpolate it into the span. Bumping GUEST_TERMS_VERSION matches the file header (L6-L7). The integration test compares the exported constants, so it keeps passing. The new page would also need an entry in src/app/sitemap.ts next to about and apartment if it should be indexed.
  - reproduce: CONFIRMED — Reproduced every code claim. The sign-up checkbox shows only GUEST_TERMS_TEXT, a plain sentence with no link. That sentence says the guest accepts "the portal terms" and data processing. Its version and content hash are stored as a TermsAcceptance at claim time. The repo has no terms or privacy route or page, no link to one, and no privacy wording in the i18n dictionaries, components or public/. The bo…

### R-187: The light placeholder rule matches in dark mode too and its !important overrides every component placeholder colour (2.0–2.5:1)
- Severity: Medium
- Category: Bug
- Status: CONFIRMED
- Location: src/styles/05-primitives.css:L204-L227 (also affects src/components/BookingForm.tsx:L161, src/styles/10-moments.css:L77-L79 and L688-L690, src/styles/12-apartment-checkin.css:L433-L435)
- Evidence:

  ```text
  L203-L211
    ::placeholder { color: var(--placeholder-color-soft); opacity: 1; }
    [data-theme="dark"] ::placeholder { color: rgba(200, 220, 225, 0.55); }
  L213-L219
    /* Light mode placeholder styling to match dark mode consistency */
    :not([data-theme="dark"]) input::placeholder,
    :not([data-theme="dark"]) textarea::placeholder,
    :not([data-theme="dark"]) select::placeholder {
      color: rgba(100, 116, 139, 0.65) !important;
  L222-L227: the same declarations again under `html:not([data-theme="dark"]) …`
  Executed (jsdom, <html data-theme="dark"><body><main><input>): input.matches(':not([data-theme="dark"]) input') → true; input.matches('html:not([data-theme="dark"]) input') → false.
  Overridden component rules: 10-moments.css:L77-L79 (`--placeholder-color`), L688-L690 (dark), 12-apartment-checkin.css:L433-L435 (`--checkin-placeholder`).
  ```

- Problem: `:not([data-theme="dark"])` followed by a descendant combinator matches any ancestor without the attribute. `body` never has it (it is set on <html>), so the rule applies in dark mode as well. Because it is !important it also overrides the component-level placeholder colours in both themes, so `--placeholder-color` (the token commented as having accessible contrast) and `--placeholder-color-soft` have no effect on inputs. The `html:not(…)` block is a duplicate.
- Impact: Placeholder contrast on the site's inputs: light 2.50:1 on white (moments search designed for 4.91:1), dark 2.05:1 on the moments search field (designed 4.49:1), 2.31:1 on the dark check-in fields (designed 5.38:1), 2.21:1 on `--layer-surface`. The moments search input has only an `sr-only` label (MomentsToolbar.tsx:L50-L57), so its placeholder is the only visible label.
- Fix: As proposed: delete L213-L227 and change L205 to `color: var(--placeholder-color);`. Then remove the orphaned `--placeholder-color-soft` token (01-tokens.css:L116), which nothing else references (grep). Two caveats for the fix-risk check. (1) BookingForm's layered `placeholder:text-[color:var(--fg-muted)]` still loses to the unlayered `::placeholder` and `[data-theme="dark"] ::placeholder` rules after the fix, so booking inputs get #64737a in light and rgba(200,220,225,.55) in dark, not --fg-muted. (2) The light check-in placeholder `--checkin-placeholder: #8d988e` on #fffaf2 is only 2.88:1, so the designed light colour that the fix exposes also fails AA.
- Fix risk: Placeholder colours change on every form (booking, guest sign-in, admin login and guests, check-in, moments search). Check light and dark. The dark default (rgba(200,220,225,.55) = 4.42:1 on #172325) stays slightly under 4.5:1 where no component rule exists.
- Verification:
  - refute: CONFIRMED — The theme attribute is only ever set on <html> (layout.tsx:L47, ThemeToggle.tsx:L46-L50 use document.documentElement), so `:not([data-theme="dark"]) input::placeholder` matches through <body>/<main> in dark mode as well. Neither 05-primitives.css nor globals.css uses @layer, so the rule is unlayered and !important and beats every non-important placeholder rule in both themes: `.moments-search-input::pl…
  - reproduce: CONFIRMED — The rule at L214-L219 uses `:not([data-theme="dark"])` followed by a descendant combinator, so any ancestor without the attribute satisfies it. In dark mode `body` is such an ancestor, because data-theme is only ever set on documentElement (layout.tsx:L47, ThemeToggle.tsx:L48-L50). I checked this in jsdom 29.1.1. The rule has specificity (0,1,2) plus !important. No other placeholder rule in src/styles…

### R-188: Dark `.btn-primary` fails AA: #042c28 on the dark `--brand-300` (#088276) is 3.20:1 (hover 4.26:1)
- Severity: Medium
- Category: Bug
- Status: CONFIRMED
- Location: src/styles/04-theme.css:L52-L55 (tokens); symptom at src/styles/05-primitives.css:L15-L22
- Evidence:

  ```text
  05-primitives.css:L9, L15-L16, L20-L22
    font-size: 0.875rem;
    background: var(--action-bg);
    color: var(--action-fg);
    .btn-primary:hover { background: var(--action-bg-hover); }
  04-theme.css:L15, L52-L55
    --brand-300: #088276;
    /* Dark semantic action mapping (slightly lighter brand step to equalize contrast) */
    --action-bg: var(--brand-300);
    --action-bg-hover: var(--brand-400);
    --action-fg: #042c28;
  Computed: #042c28 on #088276 = 3.20:1; on #0b998b (hover) = 4.26:1.
  Used on 14px text by not-found.tsx, UnifiedGuestClient.tsx, AdminLoginClient.tsx, admin/guests/page.tsx, BookingForm.tsx, ApartmentCinematic.tsx, PortalRefreshRedirect and others (grep -rlw btn-primary src).
  ```

- Problem: The dark brand scale goes from dark to light as the number rises (04-theme.css:L12-L20: 50 #103b38 … 900 #5fe9dd), so dark 300 is darker than 400. The comment "slightly lighter brand step" assumes the light scale's order, and the dark text on this mid teal falls below 4.5:1. No other rule changes `.btn-primary` colours in dark mode. The 09 anchor rule excludes `.btn-primary`, and Tailwind utilities on these elements are layered, so they lose to this unlayered rule.
- Impact: In dark mode every primary button (guest sign-in, admin login, booking submit, 404 home link, apartment CTA) has 14px labels at 3.2:1.
- Fix: As proposed: 04-theme.css:L53-L54 `--action-bg: var(--brand-500); --action-bg-hover: var(--brand-600);` (5.74 and 7.08 with #042c28), and correct the L52 comment. Remove ApartmentCinematic from the affected list. Add the admin login (`btn-sm`, 10.4px) and the moments share button to the dark screenshots.
- Fix risk: Changes every consumer of `--action-bg` in dark mode (`.btn-primary`, BookingForm arbitrary `bg-[color:var(--action-bg)]`). Check dark screenshots of guest sign-in, admin login and /book. Light mode is unchanged.
- Verification:
  - refute: CONFIRMED — In dark mode `--action-bg` resolves to brand-300 #088276 and `--action-fg` to #042c28 (3.20:1), and hover brand-400 gives 4.26:1. Both are below 4.5 for 14px weight-500 text. No other stylesheet rule sets `.btn-primary` colours: the only other references are the 09-utilities anchor exclusions and the 02-layout `:where()` size rules. Even pure black on #088276 is only 4.46:1, so moving to a lighter step…
  - reproduce: CONFIRMED — In dark mode --action-bg is brand-300 (#088276), --action-bg-hover is brand-400 (#0b998b) and --action-fg is #042c28. The dark scale runs from dark to light as the number rises, so 300 is darker than 400, even though the comment says it is the lighter step. Recomputed contrast is 3.20:1 at rest and 4.26:1 on hover. Both are below 4.5:1 for 14px/500 text. No other CSS rule changes .btn-primary colours:…

### R-189: Dark booking bar: the hover/active date trigger turns light cyan, making its label and value 2.0–3.0:1; the resting value is 3.75:1
- Severity: Medium
- Category: Bug
- Status: CONFIRMED
- Location: src/styles/07-search-listing.css:L69-L75, L95-L101
- Evidence:

  ```text
  L69-L75
    [data-theme="dark"] .search-trigger:hover {
      background-color: color-mix(in srgb, var(--brand-900) 92%, transparent);
    }
    [data-theme="dark"] .search-trigger.is-active {
      background-color: color-mix(in srgb, var(--brand-900) 96%, transparent);
  L95-L101
    [data-theme="dark"] .search-label { color: var(--brand-400); }
    [data-theme="dark"] .search-value { color: var(--brand-300); }
  04-theme.css:L15-L20: dark --brand-300 #088276, --brand-400 #0b998b, --brand-900 #5fe9dd (lightest).
  SearchBar.tsx:L214-L221: `search-trigger … ${activeDateField === "arrival" ? "is-active" : ""}` wrapping `<span className="search-label">` and `<span className="search-value">`.
  Computed over the dark bar (≈#121a1b): active label 2.22:1, value 2.95:1; hover label 2.04:1, value 2.72:1; resting value 3.75:1.
  ```

- Problem: The dark hover/active background uses `--brand-900`, which in the dark palette is the lightest teal (the rule was written for the light scale, where 900 is darkest), so a light-cyan block carries mid-teal text. The resting date value uses the dark `--brand-300`, the darker step.
- Impact: On the home page and /book in dark mode, while the date picker is open the active Arrival/Departure field is a bright cyan block with nearly unreadable text. At rest, the selected dates (12.8px, weight 600) are 3.75:1.
- Fix: More minimal alternative with more margin: delete the two dark overrides at L69-L75. The light rules at L62-L67 (`color-mix(in srgb, var(--brand-100) 95%/98%, transparent)`) already resolve to the dark #0d524c through the theme tokens. Then set dark `.search-label { color: var(--brand-700) }` (about 5.0:1 on hover/active, 9.6:1 at rest) and dark `.search-value { color: var(--fg-default) }` (about 7.4:1 on hover/active, 14.3:1 at rest). The finder's variant (brand-100 90% + brand-600 label) also passes, but only at 4.59:1. Either way this is a visual change in dark mode only. Take screenshots of the resting, hover and active states (picker open), including the ≤820px segmented layout.
- Fix risk: Visual only, dark booking bar (desktop, and the ≤820px segmented layout in 12-apartment-checkin.css:L110-L149). Check focus ring and hover in dark. Light is unchanged.
- Verification:
  - refute: CONFIRMED — The cascade is as the finder describes. The theme script always sets data-theme (layout.tsx:L47), so the dark rules apply whenever dark mode is on. The 07 rules are unlayered and imported before 09 (globals.css:L8-L13). The later `[data-theme="dark"] span { color: inherit }` (09-utilities.css:L137) has specificity (0,1,1), which loses to `[data-theme="dark"] .search-label` / `.search-value` at (0,2,0),…
  - reproduce: CONFIRMED — The dark hover and active rules mix --brand-900, which is the lightest dark-palette teal (#5fe9dd), under mid-teal text (--brand-400 label, --brand-300 value). Specificity is (0,3,0) for the hover rule and (0,3,0) for .is-active, and no other stylesheet targets .search-trigger, .search-label or .search-value. data-theme is always set by the inline script in layout.tsx:47, so these rules apply in every…

### R-190: The "Check availability" CTA in its enabled (`.ready`) state is white on coral at 3.67:1 (hover 2.78:1) in light mode and 3.85:1 in dark
- Severity: Medium
- Category: Bug
- Status: CONFIRMED
- Location: src/styles/07-search-listing.css:L154-L163, L174-L181
- Evidence:

  ```text
  L119-L121: `.booking-button { background: var(--brand-700); color: var(--fg-inverse);`
  L154-L163
    .booking-button.ready { background: var(--accent-500); … }
    .booking-button.ready:hover { background: var(--accent-400); …
  L174-L177
    [data-theme="dark"] .booking-button.ready { background: var(--accent-400); color: white; }
  01-tokens.css:L63-L64 light --accent-400 #d7876a, --accent-500 #c86c51; 04-theme.css:L25 dark --accent-400 #d85a3f.
  SearchBar.tsx:L244-L249: `className={`booking-button ${isHydrated && hasValidDates ? "ready" : ""}`}` with `<span className="text-sm font-medium">{checkAvailabilityLabel}</span>`.
  Computed: white on #c86c51 = 3.67:1, on #d7876a = 2.78:1, on #d85a3f = 3.85:1.
  ```

- Problem: The button is enabled only in the `.ready` state, and in that state its 14px/500 label is below the 4.5:1 AA minimum in both themes. The hover state makes it worse in light mode.
- Impact: The site's booking CTA on the home page and /book is the least legible text in the bar exactly when the guest is ready to click it.
- Fix: The finder's fix stands, with one change: dark hover already passes (accent-300, 5.39:1). In dark mode only the resting `.ready` needs to change, to `var(--accent-300)`. Move hover to `var(--accent-200)` only to keep a visible hover change. For light, either use the literal hexes (#a4533b rest, #9c4a33 hover) or add an `--accent-600` token in 01-tokens.css. Adding a token is a new design token, so it needs the owner's approval. After the fix, check the nights sub-line as well (4.72:1 on #a4533b).
- Fix risk: Brand colour change on the main CTA, so it needs owner sign-off. Visual check in both themes and on the ≤820px layout.
- Verification:
  - refute: CONFIRMED — The button is enabled exactly when it has `.ready` (SearchBar.tsx:L244-L246), and its label is a 14px/500 span (`text-sm font-medium`). The span inherits white: in light mode from `.booking-button { color: var(--fg-inverse) }` (#ffffff), in dark from `[data-theme="dark"] .booking-button.ready { color: white }` plus the `span { color: inherit }` rule. The recomputed ratios match the finder: white on lig…
  - reproduce: CONFIRMED — The button is enabled only when `isHydrated && hasValidDates`, which is also exactly when it has the `ready` class, so the coral states are the only interactive states. Light mode uses `--fg-inverse` #ffffff on --accent-500 #c86c51 (3.67:1) and on hover --accent-400 #d7876a (2.78:1). Dark mode sets white on --accent-400 #d85a3f (3.85:1). Dark hover (--accent-300 #b24933) is 5.39:1 and passes. The label…

## Low

### R-191: Check-in page client ignores 401 after the 2 h session expiry; the refresh cookie is never used from the open page
- Severity: Low
- Category: Error handling
- Status: CONFIRMED
- Location: src/components/CheckInInfo.tsx:L546-L569 (POST submit); optionally L442-L480 (mount loaders)
- Evidence:

  ```text
  src/components/CheckInInfo.tsx:L443-L447
      const loadPreferences = async () => {
        try {
          const res = await internalFetch('/api/check-in/preferences');
          if (res.ok) {

  L468-L474
        try {
          const res = await internalFetch('/api/check-in/arrival-request');
          if (res.ok) {
            const data = await res.json();
            setArrivalRequest(data.data?.request ?? null);
          }

  L566-L568
        if (!res.ok) {
          setArrivalRequestError(res.status < 500 && data?.error?.message ? data.error.message : ui.requestError);
          return;

  src/lib/guestSession.ts:L102
  export const GUEST_SESSION_TTL_SECONDS = 2 * 60 * 60;

  The only refresh trigger is the server render of the page, src/app/[locale]/check-in/page.tsx:L49-L59 (`getVerifiedGuestSessionFromCookies()` → redirect to `/portal/refresh` when `guest_rt` exists). src/app/api/check-in/preferences/route.ts:L65-L66 and arrival-request/route.ts:L34-L36 answer 401 once the JWT/DB session has expired.
  ```

- Problem: The guest JWT and DB session last 2 hours and are renewed only when `/[locale]/check-in` is server-rendered. The client component keeps calling `/api/check-in/preferences` and `/api/check-in/arrival-request` from the already open page; when those return 401 the loaders do nothing (no Wi-Fi block, no arrival request shown) and the arrival-request submit surfaces the raw server text "Authentication required to request an arrival time". Nothing calls `/api/portal/refresh` or redirects to `/portal/refresh`, although a valid `guest_rt` cookie is typically present (remember-me defaults to on, UnifiedGuestClient.tsx:L33).
- Impact: A guest who leaves the check-in page open (or whose mobile browser restores the tab from the background without a reload) for more than 2 hours sees no Wi-Fi password and gets "Authentication required…" when requesting an arrival time, although one page reload would silently refresh the session. Realistic on arrival day when the page is opened in the morning and used in the afternoon.
- Fix: Keep the finder's approach but drop the Wi-Fi motivation and prefer navigating straight to the refresh page over `window.location.reload()` (one fewer server round trip, same guard semantics): in `handleSubmitArrivalRequest`, when `res.status === 401`, call once (ref-guarded) `window.location.assign(`/${locale}/portal/refresh?next=${encodeURIComponent(`/${locale}/check-in`)}`)` — the refresh page already defaults `failure` to `/${eff}/guest?flash=session_required` (portal/refresh/page.tsx:L20-L22), so no loop is possible. Applying the same handler to the two mount loaders is cheap but covers only a seconds-wide race. Note the trade-off: the guest loses the typed time/message. If the owner wants to preserve the form, the existing utility `refreshPortalSession({ refreshHref: '/api/portal/refresh?next=' + encodeURIComponent(`/${locale}/check-in`), baseHref: window.location.href })` (portalRefreshClient.ts:L63-L101, handles the 409 retry) can be called on 401 and the POST retried once; on `status: 'failed'` navigate to `/${locale}/guest?flash=session_required`. Test: add a case to tests/components/checkin-arrival-request.test.tsx returning `new Response(JSON.stringify({ error: { message: '…' } }), { status: 401 })` for the POST and assert the navigation (stub `window.location.assign`), plus assert the English text is not rendered. Do this in the same task as finding 1 (same line, same trigger).
- Fix risk: Low. A reload loop is impossible because the server guard sends the guest to `/guest?flash=session_required` when the refresh fails. Add a component test: mock a 401 on the arrival-request POST and assert the navigation instead of the error text.
- Verification:
  - refute: CONFIRMED — The core claim holds: nothing on the open check-in page ever triggers the refresh flow. `internalFetch` only logs a 401 at debug level and returns the response (internalFetchClient.ts:L14-L31); `CheckInInfo` swallows non-ok GETs (L446, L471) and, for the POST, renders `data.error.message` verbatim (L566-L568). The only refresh trigger in `src` is the server guard `check-in/page.tsx:L49-L60` → `/[locale…
  - reproduce: CONFIRMED — All code paths traced (no test could be written in read-only mode, so the behaviour is established by full path tracing rather than execution). The client component only branches on `res.ok`; a 401 falls through silently in both loaders and is rendered verbatim on submit. No code in `CheckInInfo.tsx` reacts to 401 (grep for `401|reload|router|useRouter|window.location` → only unrelated `status === 'app…

### R-192: CheckInInfo still renders the English server error verbatim for 4xx responses on the Greek UI (R-144 fix B26 covered BookingForm only)
- Severity: Low
- Category: Maintainability
- Status: CONFIRMED
- Location: src/components/CheckInInfo.tsx:L566-L568
- Evidence:

  ```text
  CheckInInfo.tsx L566-L568:
    if (!res.ok) {
      setArrivalRequestError(res.status < 500 && data?.error?.message ? data.error.message : ui.requestError);
      return;
    }

  Messages that can arrive there are English-only: src/app/api/check-in/arrival-request/route.ts L36 'Authentication required to request an arrival time' (401 after session expiry), L48 'Not Found' (404 when the flag is off), and Zod issue text from `validateRequestBody` (L14-L15).
  PROGRESS.md B26 (L231-L234) lists `src/components/BookingForm.tsx` and the check-in `<title>` only; `CheckInInfo.tsx` is not in its file list.
  ```

- Problem: R-144 ('Server error messages are English-only and rendered verbatim in the Greek UI') was fixed for the booking form by mapping status codes to dictionary strings; the arrival-request form kept the verbatim rendering for every 4xx.
- Impact: A Greek guest whose session expired while the check-in page was open sees 'Authentication required to request an arrival time' inside the Greek UI; the message is also not actionable (no hint to sign in again).
- Fix: Fold into the finding-0 task. Replace the verbatim branch: `if (res.status === 401) { redirectToRefresh(); return; } setArrivalRequestError(ui.requestError);` — i.e. stop rendering `data.error.message` at all (the only other JSON 4xx messages are 'Not Found' with the flag off and 'Validation failed' on tampered input, both adequately covered by the localized `ui.requestError`). Do not add `tooManyRequests` (no limiter on this route; non-JSON 429s already fall to `ui.requestError`). If the owner prefers a message over navigation for 401, reuse the existing `t.portal.errors.sessionRequired` instead of adding a `panel.sessionExpired` key. Regression test: in tests/components/checkin-arrival-request.test.tsx, mock the POST with `{ error: { message: 'Not Found' } }` at status 404 and assert the alert shows 'Unable to send the request. Please try again.' (fails on HEAD, which renders 'Not Found').
- Fix risk: None beyond adding dictionary keys; tests/components/checkin-arrival-request.test.tsx has no assertion on the verbatim message.
- Verification:
  - refute: CONFIRMED — L566-L568 does render any 4xx JSON `error.message` verbatim, and every message the arrival-request route can put there is English-only. Not a duplicate: R-144's recorded location is `BookingForm.tsx`, `api/booking-requests/route.ts` and the check-in `<title>` (REVIEW.md:L563-L568), and B26's file list (PROGRESS.md:L231-L234) does not include `CheckInInfo.tsx`; the Declined section (L448-L454) does not…
  - reproduce: CONFIRMED — Line numbers verified. The 4xx branch renders `data.error.message` verbatim and every message that can reach it is English: 401 'Authentication required to request an arrival time', 404 'Not Found', and for body-validation failures the `ValidationError` message 'Validation failed' (the Zod issue text at route.ts:L14-L15 goes into `details.validationErrors`, not into `message`, so that part of the findi…

### R-193: Overlap classification compares against the family's first-sign-in IP/UA hashes for 30 days, so a mobile guest's network change turns any concurrent refresh into a "theft" revocation and a high-severity alert
- Severity: Low
- Category: Logic
- Status: CONFIRMED
- Location: src/lib/prisma-repositories/refreshTokenRepository.ts:L358-L360 (classification), L366-L379 (contended branch), L531-L538 (revocation + alert); docs/testing.md:L100 (policy text)
- Evidence:

  ```text
  src/lib/prisma-repositories/refreshTokenRepository.ts:L358-L360
    const sameRefreshContext = !!replacement.deviceHash
      && replacement.deviceHash === initial.family.deviceHash
      && (!initial.family.ipHash || replacement.ipHash === initial.family.ipHash);

  L365-L379
        const ownsGeneration = await tryLockRefreshGeneration(tx, generationLockKey);
        if (!ownsGeneration) {
          if (sameRefreshContext && initialAuthorizationApproved) {
            ...
            return { status: 'concurrent', familyId: initial.familyId } as const;
          }
          return {
            status: 'generation_contended',
            familyId: initial.familyId,
            disposition: initialGenerationActive ? 'suspicious' : 'authoritative_recheck',
          } as const;

  L531-L533
        if (result.disposition === 'suspicious') {
          await revokeFamilyGraph(tx, candidate.familyId, now, 'suspicious_refresh_overlap');
          await recordRefreshTheftSignal(tx, candidate.familyId, 'suspicious_refresh_overlap');

  The hashes are written once at family creation (L246-L254, `deviceHash: opts?.deviceHint ?? null, ipHash: opts?.ipHint ?? null`) from the sign-in request (src/lib/portalAuthHttp.ts:L56-L60). `grep -rn "refreshTokenFamily.update" src` → no match outside src/generated: nothing ever updates them; the family lives 30 days (L77). `ipHash` is an HMAC of the client IP (portalAuthHttp.ts:L22). docs/testing.md:L98 states the policy: "Raw refresh credentials, elapsed time, IP, and device fingerprints do not prove overlap."
  ```

- Problem: The "same context" test that decides between a benign `409 REFRESH_IN_PROGRESS` and a family revocation with a `high` audit event uses the IP and User-Agent hashes captured at the first sign-in and never refreshed. For phone users the IP changes constantly (Wi-Fi ↔ cellular, CGNAT) and the User-Agent changes on every browser major update (Chrome about every 4 weeks). Once either differs, every genuinely concurrent refresh (two tabs restored together, PWA plus browser tab, a double navigation to /check-in with an expired session) is classified `suspicious`: the family is revoked, the guest is signed out, and the "Recent high-severity security events" rule fires as if a token had been stolen. This is the documented design, but its consequence for the intended (mobile) audience seems not to have been weighed.
- Impact: False theft alarms to the host and unexplained sign-outs for legitimate guests on mobile networks. Frequency depends on how often two refreshes overlap within one rotation transaction; the code path is confirmed, the real-world rate is not measured.
- Fix: Treat this as a policy decision to put to the owner (inform + ask, with a recommendation), not a drive-by change. Two corrections to the finder's proposal: (1) its fix_risk is wrong — the 15 different-context integration cases set BOTH `SUSPICIOUS_DEVICE_HASH` and `SUSPICIOUS_IP_HASH` (L544-545), so dropping the IP dimension leaves them classified different-context via the device hash and they pass unchanged; what is actually needed is one new case 'same device hash, different IP hash → `{ status: 'concurrent' }`, family intact' plus rewording docs/testing.md:L100 ('approved same context' → 'same device hash'). (2) Dropping IP only is a partial fix: `deviceHash` is an HMAC of the User-Agent, which also changes within a 30-day family (browser/OS updates) and is trivially matched by an attacker who holds the cookie, so the residual heuristic buys little security for the remaining false-positive risk. Recommended minimum: `const sameRefreshContext = !!replacement.deviceHash && replacement.deviceHash === initial.family.deviceHash;` plus the new test and the doc line. Complete option (needs owner approval because it changes the documented fail-closed policy and reworks the 15 different-context cases): classify every contender with `initialAuthorizationApproved` as `concurrent` and delete `sameRefreshContext`; theft remains covered by the replay check at L406-414 and L548-556. Do not adopt 'refresh the family hashes on every rotation': it adds a write per rotation and distinguishes nothing that the replay check does not already catch.
- Fix risk: Weakens the overlap heuristic for an attacker who replays from the same device family but a different IP (that case is still caught by the owner's replay detection at L406-L414, which does not depend on context). The 15 "different-context" cases in tests/integration/auth/refresh-overlap-classification.test.ts (constants at L312-L320, L544-L545) must be updated to use a different device hash only.
- Verification:
  - refute: CONFIRMED — The behaviour is deterministic and verified by reading every path: `sameRefreshContext` (L358-360) compares the contender's hints against `family.deviceHash`/`family.ipHash`, which are written once at family creation (L246-254) and never updated afterwards (the only `refreshTokenFamily.updateMany` calls are `revokeFamilyGraph` L170-173 and the admin access reset in portalAuthService.ts:135-138, both to…
  - reproduce: CONFIRMED — The mechanism is fully traceable and deterministic: the family's deviceHash/ipHash are written exactly once at family creation and never updated afterwards (the only two refreshTokenFamily.updateMany calls in src set revokedAt/revocationReason; the owner rotation path creates a new session/token but does not touch the family row). sameRefreshContext (L358-L360) requires replacement.ipHash === family.ip…

### R-194: Refresh client keeps a followed-redirect branch and `redirect: 'follow'` although the route never redirects since A2; `?next=` is also sent to a server that ignores it
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/portalRefreshClient.ts:L81,L91-L94; tests/security/portal-refresh-client.test.ts:L47,L66-L76
- Evidence:

  ```text
  src/lib/portalRefreshClient.ts:L78-L95
        const response = await fetch(safeRefreshHref, {
          method: 'POST',
          credentials: 'same-origin',
          redirect: 'follow',
          ...
        if (!response.ok) return { status: 'failed' };
        if (response.redirected) {
          const followedRedirect = safeRefreshDestination(response.url, input.baseHref);
          return followedRedirect ? { status: 'refreshed', href: followedRedirect } : { status: 'failed' };
        }
        return safeNextHref ? { status: 'refreshed', href: safeNextHref } : { status: 'failed' };

  src/app/api/portal/refresh/route.ts:L112-L115
  // The caller (src/lib/portalRefreshClient.ts) navigates to its validated `next`
  // itself. The route never redirects: ...
  L132-L134: `const res = success({ refreshed: true }); applyAuthCookies(...); return res;` — the route reads no `next` (no `searchParams` access in the file).

  tests/security/portal-refresh-client.test.ts:L66-L76 still asserts the redirect branch (`redirected: true, url: 'https://guest.test/el/check-in'`).
  ```

- Problem: After A2 (PROGRESS.md L64-L67) the only server answers 200/401/404/409 and never a 3xx, so `response.redirected` is unreachable in this application; the branch, the `redirect: 'follow'` option and the test that protects them describe the removed behaviour. The `?next=` query string built in src/app/[locale]/portal/refresh/page.tsx:L23 travels to the server only to be parsed back out by the client (L73).
- Impact: Dead branch and a test that pins removed behaviour; a reader of the route comment and the client sees two contradictory contracts. No runtime effect.
- Fix: Keep the fix to the client and its test only. (1) portalRefreshClient.ts: change L81 `redirect: 'follow'` to `redirect: 'error'` (per the Fetch Standard the default is already 'follow', so dropping the option alone changes nothing; 'error' makes fetch reject on any unexpected 3xx, which the existing catch at L96-L98 maps to `{ status: 'failed' }`, i.e. fail-closed, consistent with the route comment) and delete L91-L94 (`if (response.redirected) {...}`); `safeRefreshDestination` stays, it is still used at L73. (2) portal-refresh-client.test.ts: update the expectation at L47 to `redirect: 'error'`, delete the case at L66-L76, and optionally replace it with one that mocks `fetch` rejecting with `new TypeError('redirect')` and expects `{ status: 'failed' }`. Do NOT do the third part (pass `next` as a prop instead of the `?next=` query on the API URL): it touches page.tsx, PortalRefreshRedirect props, the `refreshPortalSession` signature and two test files for zero behaviour change, and the value is a validated same-origin local path, not a secret. If wanted, record it as a separate Nit. Gates: the three refresh test files, typecheck, lint; coverage is unaffected (a covered dead branch is removed together with its test; `portalRefreshClient.ts` stays in the include list at vitest.config.ts:L51).
- Fix risk: None functionally; `portal-refresh-client.test.ts` and `portal-refresh-redirect.test.tsx` must be adjusted (expected href/props).
- Verification:
  - refute: CONFIRMED — The claim holds: in this application no server answer to `POST /api/portal/refresh` can be a 3xx, so `response.redirected` (portalRefreshClient.ts:L91-L94) is unreachable and the test case at portal-refresh-client.test.ts:L66-L76 pins behaviour that A2 removed from the route. Verified every redirect source: (1) the route returns only 200 JSON (`success({ refreshed: true })`), 401, 409 or 404 via `ApiEr…
  - reproduce: CONFIRMED — All three parts of the finding hold at HEAD fff4283. (1) The client still sends `redirect: 'follow'` (L81) and keeps a `response.redirected` branch (L91-L94). (2) No component on the request path can produce a 3xx for `POST /api/portal/refresh`: the route (`src/app/api/portal/refresh/route.ts`) answers only 200 JSON (L132-L134), 401 (`unauthorizedResponse`, L34-L38, L122, L130), 409 (L40-L55, L127) or…

### R-195: Admin erasure also wipes host-side records (platform reference, terms-acceptance proof) that retention duties may require
- Severity: Low
- Category: Legal
- Status: SUSPECTED
- Location: src/lib/privacyService.ts:L163-L165 (externalReference) and prisma/schema.prisma:L238,L243 (TermsAcceptance.userId / onDelete)
- Evidence:

  ```text
  src/lib/privacyService.ts:160-169
        await tx.booking.updateMany({
          where: { id: { in: bookingIds } },
          data: {
            userId: null,
            reference: null,
            externalReference: null,
            accessStatus: 'PENDING',
            claimedAt: null,
          },
        });

  prisma/schema.prisma:235-248 TermsAcceptance … `user User @relation(fields: [userId], references: [id], onDelete: Cascade)` — deleted with `tx.user.delete` (privacyService.ts:177).

  src/app/admin/guests/page.tsx:415-423: the field the host fills is labelled "Reference (optional)" with placeholder `HMABC123` (a platform confirmation code).
  ```

- Problem: `externalReference` is the host's own reservation identifier (platform confirmation code), not data the guest supplied to this site; erasing it removes the host's ability to reconcile the booking row with the platform booking and the income declared for it. The cascade also destroys the only evidence that house terms were accepted (version + content hash). GDPR Art. 17(3)(b)/(e) allows retaining data needed for legal obligations or claims; whether these two records fall under that depends on the owner's tax/registry obligations, which I did not research.
- Impact: After an erasure the host has a booking with dates but no link to the platform reservation and no proof of terms acceptance, e.g. for a later damage dispute or a tax query about that stay.
- Fix: Split into two independent owner decisions rather than one. (a) `externalReference`: if the host needs platform reconciliation, remove the single line `externalReference: null,` (privacyService.ts L165) — no migration, only the unit-test expectation changes; note it then blocks a duplicate manual booking with the same code (P2002 → 409), which is acceptable. `reference: null` can stay (no writer, no-op). (b) `TermsAcceptance`: retaining it after erasure proves only 'booking X accepted version V at time T' with no subject (both `termsAcceptances.userId` and `bookings.userId` would be null), so its evidentiary value is small; if the owner still wants it, `userId String?` + `onDelete: SetNull` needs a forward migration (integrity manifest, EXPECTED_MIGRATION) and changes the generated `bookingId_userId_termsVersion` where-unique input used by the upsert at portalAuthService.ts L270-284 — run `npm run typecheck` and adjust; PostgreSQL treats NULLs as distinct in the unique index, so a re-claim after erasure creates a new row instead of colliding. Document whichever choice is made in a comment next to L160-169. Legal basis (Greek short-term-rental/tax retention) remains unverified here.
- Fix risk: Schema/migration change (integrity manifest, EXPECTED_MIGRATION); `@@unique([provider, externalReference])` then keeps blocking a duplicate manual booking for an erased stay, which is the correct behaviour.
- To confirm (SUSPECTED only): Owner/accountant confirms which booking records must be retained under Greek short-term-rental and tax rules; then decide per column.
- Verification:
  - refute: SUSPECTED — Τα πραγματικά περιστατικά επιβεβαιώνονται: η διαγραφή μηδενίζει `reference`/`externalReference` (L160-169) και το `tx.user.delete` (L177) διαγράφει τα `TermsAcceptance` μέσω `onDelete: Cascade` (schema L243). Το `externalReference` είναι πράγματι δεδομένο που εισάγει ο host (admin bookings route L29/L63, πεδίο «Reference (optional)» με placeholder `HMABC123` στο guests page L415-423) και διαβάζεται από…
  - reproduce: SUSPECTED — The mechanics are fully reproduced: erasure nulls reference and externalReference (privacyService L160-169) and `tx.user.delete` (L177) cascades to terms_acceptances via ON DELETE CASCADE (schema L243, migration SQL L204-205). The 'Reference (optional)' field with placeholder HMABC123 writes newBooking.externalReference (admin/guests/page.tsx L415-423), so externalReference is host-entered platform dat…

### R-196: Admin erasure reuses a legacy PENDING privacy request and then fails with an unmapped 500
- Severity: Low
- Category: Error handling
- Status: CONFIRMED
- Location: src/lib/privacyService.ts:L22-L30 and L46-L50 (reuse filters); src/app/api/admin/guests/[userId]/erase/route.ts:L54-L60 (error mapping)
- Evidence:

  ```text
  src/lib/privacyService.ts:L21-L30
    async function createVerifiedErasureRequest(userId: string, auditNote: string) {
      const existing = await prisma.privacyRequest.findFirst({
        where: {
          userId,
          requestType: 'ERASURE',
          status: { in: ['PENDING', 'VERIFIED'] },
        },
        orderBy: { requestedAt: 'desc' },
      });
      if (existing) return { request: existing, created: false };

  src/lib/privacyService.ts:L61
      if (request.status !== 'VERIFIED' || !request.userId) throw new Error('ERASURE_REQUEST_NOT_VERIFIED');

  src/app/api/admin/guests/[userId]/erase/route.ts:L54-L60 maps only ERASURE_BLOCKED_BY_ACTIVE_DELIVERY (409), ERASURE_SUBJECT_NOT_FOUND / ERASURE_REQUEST_NOT_FOUND (404), then `throw error;`.

  prisma/schema.prisma:L379-L384: enum PrivacyRequestStatus { PENDING VERIFIED COMPLETED REJECTED }
  ```

- Problem: Το C2 διέγραψε τα μόνα routes που δημιουργούσαν `PENDING` privacy requests (`api/dsar/requests`), αλλά το `createVerifiedErasureRequest` εξακολουθεί να επαναχρησιμοποιεί ένα υπάρχον `PENDING` request. Το `completeErasureRequest` το απορρίπτει αμέσως (`ERASURE_REQUEST_NOT_VERIFIED`), και το route δεν χαρτογραφεί αυτό το error, οπότε ο host παίρνει γενικό 500 και δεν μπορεί να διαγράψει τον guest χωρίς χειροκίνητη επέμβαση στη βάση.
- Impact: Μόνο για βάσεις με legacy `PENDING` rows από πριν το C2 (δεν υπάρχει production ακόμη, οπότε ρεαλιστικά: dev/smoke βάσεις ή μελλοντική επαναφορά της self-service ροής). Σε αυτή την περίπτωση το κουμπί «Erase guest» αποτυγχάνει με «Erasure failed» χωρίς αιτία και η υποχρέωση διαγραφής (GDPR άρθ. 17) μένει ανεκπλήρωτη μέχρι κάποιος αλλάξει το status στη βάση.
- Fix: Optional cleanup only; no reachable trigger in any application version. If addressed: do NOT switch the two `findFirst` filters to `status: 'VERIFIED'` alone — the partial unique index `privacy_requests_one_open_erasure_per_user` still covers PENDING, so a manually inserted PENDING row would make `create` fail with P2002 and the VERIFIED-only P2002 branch would rethrow it (still 500). The safe minimal variant is: in `createVerifiedErasureRequest`, when `existing.status === 'PENDING'`, `prisma.privacyRequest.update({ where: { id: existing.id }, data: { status: 'VERIFIED', auditNote: auditNote.slice(0, 1_024) } })` and return the updated row (apply the same in the P2002 branch), plus map `ERASURE_REQUEST_NOT_VERIFIED` → 409 in the route for defence in depth. Add one unit case with `findFirst` returning `{ status: 'PENDING' }`. Alternatively leave as is and note in a comment that PENDING/REJECTED/EXPORT are never written by the application.
- Fix risk: Χαμηλός. Επεκτείνεται το `tests/unit/privacy-erasure.test.ts` με μία περίπτωση legacy PENDING request. Αν επιλεγεί το «μόνο VERIFIED», ελέγχεται ότι το unique constraint στο `privacy_requests` (αν υπάρχει partial unique σε open requests) δεν προκαλεί P2002 loop.
- Verification:
  - refute: CONFIRMED — Το code path είναι πραγματικό: ένα `PENDING` ERASURE request επαναχρησιμοποιείται (L22-30, L47), το `completeErasureRequest` το απορρίπτει με `ERASURE_REQUEST_NOT_VERIFIED` (L61), το route δεν το χαρτογραφεί (L54-60 → `throw error`) και το `withErrorHandler` επιστρέφει 500 «An internal server error occurred» (το UI δείχνει αυτό το μήνυμα, όχι «Erasure failed», γιατί `data.error?.message` υπάρχει). ΟΜΩΣ…
  - reproduce: CONFIRMED — The code path is real and fully traced: findFirst reuses a PENDING row (L22-30), completeErasureRequest throws ERASURE_REQUEST_NOT_VERIFIED for any non-VERIFIED status (L61), the route maps only three codes and rethrows (erase/route.ts L54-60), and withErrorHandler converts unknown errors into INTERNAL_ERROR → HTTP 500 (apiErrorHandler.ts L413-432, L56). However the finding's premise is wrong: no appli…

### R-197: Three admin mutations lack the same-origin check that the other admin mutations enforce
- Severity: Low
- Category: Security
- Status: CONFIRMED (verifiers disagreed; see Verification)
- Location: src/app/api/admin/flags/route.ts:L21-L23 (and check-in-requests/[id]/route.ts:L28-L37, stay-requests/[id]/route.ts:L11-L15); guards at src/proxy.ts:L19-L38 and src/lib/security-middleware-edge.ts:L103-L125
- Evidence:

  ```text
  src/app/api/admin/flags/route.ts:21-23
    export const POST = withErrorHandler(async (req: NextRequest) => {
      if (!(await isAdminRequest(req))) throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Admin credentials required');
      const body = await readJsonBody(req, 8 * 1_024);

  src/app/api/admin/check-in-requests/[id]/route.ts:35-41 and src/app/api/admin/stay-requests/[id]/route.ts:15-18: same pattern, no `isSameOriginRequest`.

  Compare src/app/api/admin/bookings/route.ts:47-50, claim-grants L24-27, access-reset L26-29, erase L38-41:
    const origin = request.headers.get('origin');
    if (origin && !isSameOriginRequest(origin, request)) {
      throw new ApiError(ApiErrorCode.FORBIDDEN, 'Cross-origin admin mutation rejected');
    }

  `grep -rn isSameOriginRequest src` → only those four routes.

  Mitigation in place: src/app/api/admin/login/route.ts:54-60 sets the cookie with `sameSite: 'strict'`.
  ```

- Problem: The A1 fix (R-104/R-156) added a host-aware Origin check to four admin mutations; feature-flag toggles, check-in approve/reject/retry and stay-request retry/close were left without it. Browser SameSite=Strict prevents cross-site cookie sends, so this is defence in depth, but the policy is applied inconsistently.
- Impact: Only if the SameSite protection is bypassed (same-site sibling host, or a future cookie-attribute change) could a page the admin visits flip the portal off or approve/reject arrival requests. Low likelihood for a single-domain site.
- Fix: No change required: the behaviour is already blocked for every /api/* path by the proxy-level Origin check plus the SameSite=Strict admin cookie. If the owner wants uniformity for readability, the three-line check is harmless to add, but it should be described as a third layer, not as closing a gap; the new tests would then need the `origin`/`host` header pair as in tests/routes/admin-bookings.test.ts:L17.
- Fix risk: None beyond the already-fixed routes; the route tests (admin-dead-outbox-actions, check-in route tests) need an `origin`/`host` header pair like tests/routes/admin-claim-grants.test.ts:90.
- Verification:
  - refute: REFUTED — The fact is accurate (only four admin routes carry a route-level `isSameOriginRequest` check; flags POST, check-in-requests/[id] PATCH and stay-requests/[id] PATCH do not), but the claimed impact cannot occur. The finder missed that `src/proxy.ts` runs `createSecurityMiddleware()` on every matched request and returns its response directly for `/api/*`; `CORSMiddleware.handle` rejects any browser `Origin`…
  - reproduce: CONFIRMED — The factual claim holds: three admin mutation handlers (flags POST, check-in-requests/[id] PATCH, stay-requests/[id] PATCH) lack the route-level Origin check that the four A1-fixed routes carry. The inconsistency is real and the location/lines are exact. Impact is correctly rated Low and is in fact bounded by two independent layers, not one: SameSite=Strict on the cookie and the proxy-level CORS reject…

### R-198: Admin feature-flag, admin logout and admin guests list/export routes have no route tests
- Severity: Low
- Category: Tests
- Status: CONFIRMED
- Location: src/app/api/admin/flags/route.ts:L15-L43; src/app/api/admin/logout/route.ts:L7-L24; src/app/api/admin/guests/route.ts:L20-L127 (tests to add under tests/routes/)
- Evidence:

  ```text
  Search of the whole tests tree per route path: `grep -rl admin/flags tests` -> none; `grep -rl admin/logout tests` -> none; `grep -rl admin/guests/route tests` -> only tests/security/admin-guests-errors.test.ts, whose single test drives `action=list` into a thrown error (L20-L36). src/app/api/admin/guests/route.ts:L123 lists the real surface: 'Supported actions: list, find, phone, search, stats, export'. src/app/api/admin/flags/route.ts:L21-L29:
  export const POST = withErrorHandler(async (req: NextRequest) => {
    if (!(await isAdminRequest(req))) throw new ApiError(ApiErrorCode.UNAUTHORIZED, ...);
    const body = await readJsonBody(req, 8 * 1_024);
    const parsed = schema.safeParse(body);
    ...
    const updated = await setFeatureFlags(parsed.data);
  src/app/api/admin/logout/route.ts:L7-L24 revokes the session and clears `admin_jwt`. Only `featureFlags` internals are unit-tested (tests/unit/feature-flags.test.ts).
  ```

- Problem: The kill-switch that turns the guest portal and check-in off (and back on), the admin logout (session revocation + cookie clearing) and the admin guests `export` action (returns guest PII) are exercised by no test: neither the 401 path, the 422 path (`refine` requiring at least one flag), the same-origin behaviour that the other four admin mutations enforce (`grep -rln sameOrigin src/app/api/admin` -> access-reset, claim-grants, bookings, erase only), nor the success payload.
- Impact: A regression in `admin/flags` POST (e.g. a schema change that silently ignores `checkinEnabled`) or in logout cookie clearing would pass `npm test` and `verify:release`; the guests `export` authorisation is verified only indirectly through the failing-list test.
- Fix: Keep the three small route tests in tests/routes (pattern tests/routes/admin-bookings.test.ts:L1-L20: mock `@/lib/rbac`, `@/lib/prisma`/`@/lib/featureFlags`), with two corrections: (a) flags — do not assert a 403 for a foreign Origin at route level (the route has no such check; the proxy behaviour is already covered by tests/security/security-diagnostics.test.ts:L21-L32); assert 401 without admin, 422 for `{}` (refine) and for a non-boolean, 200 + `setFeatureFlags` called with exactly the posted keys, GET 200 with `getFeatureFlagsAsync`; (b) guests — an unknown action and `export` without `bookingId` return 422 (not 400), `export` with an unknown id returns 404, and the success path returns `Content-Disposition: attachment`. Logout: mock `@/lib/prisma` (`adminSession.updateMany`) since `revokeAdminSession` imports it dynamically; assert `updateMany` called with the session id from a valid test-signed `admin_jwt`, `Set-Cookie` contains `admin_jwt=;` with `Max-Age=0`, and 200 with no `updateMany` call when the cookie is absent.
- Fix risk: None; tests only. If the flags/logout routes are meant to rely on the proxy-level Origin check alone (tests/security/security-diagnostics.test.ts:L21-L32), assert that instead of adding a route-level check.
- Verification:
  - refute: CONFIRMED — Verified: no test file references `admin/flags` or `admin/logout`; `admin/guests/route` is imported only by tests/security/admin-guests-errors.test.ts, whose single case drives `action=list` into a 500 with `isAdminRequest` mocked true. The `export`, `find`, `phone`, `search`, `stats` actions, the 401 path and the unknown-action path are untested. `featureFlags` internals are covered by tests/unit/feat…
  - reproduce: CONFIRMED — Every claim reproduces: no test file references the flags or logout admin routes at all, and the guests route is exercised by exactly one test that drives `action=list` into a thrown error, so `export` (guest PII), `find/phone/search/stats`, the 401 path and the 400 unknown-action path are untested. The flags route's 401, 422 (`refine`) and success/`setFeatureFlags` paths and the logout cookie clearing…

### R-199: Admin stay-request actions and guest export accept non-UUID ids and reach Prisma with them
- Severity: Low
- Category: Bug
- Status: CONFIRMED
- Location: src/app/api/admin/stay-requests/[id]/route.ts:L13-L16,L22; src/app/api/admin/guests/route.ts:L98-L105 (sink: src/lib/prisma-repositories/bookingRepository.ts:L53-L59)
- Evidence:

  ```text
  src/app/api/admin/stay-requests/[id]/route.ts:11-22
    export const PATCH = withErrorHandler(async (
      request: NextRequest,
      context?: { params: Promise<Record<string, string>> },
    ) => {
      if (!(await isAdminRequest(request))) throw …
      const { id } = context ? await context.params : { id: '' };
      …
          const existing = await tx.stayRequest.findUnique({ where: { id }, include: { outboxEvents: true } });

  src/app/api/admin/guests/route.ts:98-105
      case 'export':
        if (!params.bookingId) { throw … 'Missing required parameter: bookingId' }
        const exportData = await guestDataExport.getBookingDetails(params.bookingId);
  → bookingRepository.findById → prisma.booking.findUnique({ where: { id } }) on a `@db.Uuid` column.

  Contrast: check-in-requests/[id]/route.ts:16 `const idSchema = z.string().uuid();` and the R-156 fix in claim-grants/access-reset.
  ```

- Problem: `id` is passed to `findUnique` on a `@db.Uuid` primary key without validation (and the stay-request handler even substitutes `''` when `context` is missing, which Next never does). REVIEW.md R-156 verified that this exact query shape with a non-UUID yields an unexpected error mapped to 500 by `withErrorHandler` (apiErrorHandler.ts:412-416).
- Impact: A malformed id from a mistyped URL or an old bookmark returns "An internal server error occurred" and an error-level log instead of 404/422. Admin-only surface, so low.
- Fix: Follow the A1/R-156 pattern already in the repo rather than introducing a new one:

1. stay-requests/[id]/route.ts: make `context` non-optional and drop the dead `{ id: '' }` fallback (`const { id } = await context.params;`), then before the transaction: `if (!z.string().uuid().safeParse(id).success) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Stay request not found');` — identical to claim-grants:31 / access-reset:33; a malformed path id is 'no such resource', and this keeps 404 for both unknown and malformed ids as A1 decided. `z` is already imported in this file.

2. guests/route.ts `case 'export'`: after the missing-parameter check add `if (!z.string().uuid().safeParse(params.bookingId).success) throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'Invalid bookingId');` (422, matching the route's own parameter-validation responses at L99-L104), or 404 if the owner prefers the path-id convention; add `import { z } from 'zod'`.

Note on the finder's `z.uuid().parse(...)`: zod 4.4.3 marks `z.string().uuid()` as deprecated in favour of `z.uuid()`, but the repo's three existing checks all use `z.string().uuid()`; keep consistency here and migrate all four in a separate cleanup task if desired.

3. Tests — important: with the mocked `findUnique`/`getBookingDetails` returning undefined, a non-UUID request ALREADY yields 404 before the fix, so a status-only assertion would not fail-before. Mirror admin-claim-grants.test.ts:89-92: in tests/routes/admin-dead-outbox-actions.test.ts add a `patch(patchStayRequest, …, 'not-a-uuid', { action: 'close' })` case asserting 404 AND `expect(mocks.$transaction).not.toHaveBeenCalled()`; for guests export assert the chosen status AND that `getBookingDetails` was not called (mock it in a new case of tests/security/admin-guests-errors.test.ts or a new tests/routes file).
- Fix risk: None; add one route test per handler with `not-a-uuid`.
- Verification:
  - refute: CONFIRMED — Not a duplicate: R-156 (REVIEW.md:643-649) covers only `claim-grants`, and task A1 (PROGRESS.md:60) fixed `claim-grants` (and `access-reset` carries the same check at L33). R-138/R-139 touch `stay-requests/[id]` but concern state guards, not id validation. Both paths named by the finder reach `findUnique` on a `@db.Uuid` primary key with an unvalidated string and no guard anywhere in between:  (1) Stay-request PATCH: `id` comes straight from `context.params` (route.ts:16) into `tx.stayRequest.findUnique({ where: { id } })` (L22) on `StayRequest.id @db.Uuid` (schema.prisma:120). The route's own catch (L56) only swallows/retries P2034; everything else is rethrown. (2) Guests export: `params.bookingId` (guests/route.ts:105) → `guestDataExport.getBookingDetails` (guestDataExport.ts:102-103) → `guestStore.findBookingById` (guestDataStore.ts:41-43) → `bookingRepository.findById` → `prisma.booking.findUnique({ where: { id } })` on `Booking.id @db.Uuid` (schema.prisma:33). The repository logs at error level and rethrows (bookingRepository.ts:53-59), so this path produces TWO error-level log lines.  Error mapping: PostgreSQL rejects a non-UUID literal with SQLSTATE 22P02; `@prisma/adapter-pg` maps 22P02 → `InvalidInputValue` (dist/index.js:467-471) and the Prisma client runtime maps `InvalidInputValue` → `P2007` (`PrismaClientKnownRequestError`). `apiErrorHandler.ts` contains no Prisma error mapping at all (grep for `Prisma|prisma` in that file returns nothing), so the error falls through to the 'Unexpected API error' branch → `logger.error` + 500 `INTERNAL_ERROR` (L412-L430). This is the same chain R-156 observed live (`P2007 … invalid input syntax for type uuid`). I did not run it against a database (read-only mode), but every hop is read and there is no guard the finder missed.  The `context ? await context.params : { id: '' }` fallback is dead code: `withErrorHandler` types the handler as `ApiRouteHandler` whose context is required (apiErrorHandler.ts:181-198), and the sibling routes (`check-in-requests/[id]`:28-31, `claim-grants`:30) declare it non-optional.  No existing test covers a non-UUID id on either route: `admin-dead-outbox-actions.test.ts` only ever uses `STAY_ID`/`CHECK_IN_ID` (valid v4 UUIDs, L33-L34) and `admin-guests-errors.test.ts` only exercises `action=list`.  Severity calibration for this deployment: both handlers are behind `isAdminRequest` (route.ts:15, guests/route.ts:23-25), and the UI only ever sends ids taken from DB rows (AdminStayRequestsClient.tsx:88-91, guests/page.tsx:156-158). The finder's 'old bookmark' scenario applies only to the GET export (a bookmark cannot issue a PATCH). Consequence is a misleading 500 plus error-level log noise for a single admin; no data or security impact. Low is correct.
  - reproduce: CONFIRMED — Traced every code path from the two handlers to PostgreSQL and back through the error mapping; the cited lines are accurate. (1) stay-requests/[id]/route.ts:16 takes `id` from params with no validation and line 22 passes it to `tx.stayRequest.findUnique({ where: { id } })`; `StayRequest.id` is `@db.Uuid` (prisma/schema.prisma:120). The route's own catch (L55-58) only retries P2034 and rethrows everythi…

### R-200: Dashboard and guests page load 100 check-in rows to show counts; the guests page's pending count is wrong beyond 100 rows
- Severity: Low
- Category: Performance
- Status: CONFIRMED
- Location: src/app/admin/guests/page.tsx:107-120, 272, 313, 324, 343; src/app/admin/AdminHomeClient.tsx:34-42; src/lib/prisma-repositories/checkInRequestRepository.ts:176,180 (not L186/L190 as cited)
- Evidence:

  ```text
  src/app/admin/guests/page.tsx:109
          const response = await internalFetch('/api/admin/check-in-requests?status=all')
  src/app/admin/guests/page.tsx:272
    const pendingArrivalRequests = arrivalRequests.filter((request) => request.status === 'pending')
  src/app/admin/guests/page.tsx:324
                    {pendingArrivalRequests.length} pending request{…}
  src/app/admin/guests/page.tsx:343  `arrivalRequests.slice(0, 6)`

  src/app/admin/AdminHomeClient.tsx:34-42
          const response = await internalFetch('/api/admin/check-in-requests?status=all');
          …
          setSummary(data.data?.summary ?? emptySummary);

  Server default page: src/lib/prisma-repositories/checkInRequestRepository.ts:186 `Math.min(Math.max(params.limit ?? 100, 1), 200)` with `include: { outboxEvents: … take: 1 }` (L190).
  ```

- Problem: Both pages request the default page of 100 check-in requests (each with a joined outbox row) although the dashboard only reads `summary` and the guests page shows six rows. The guests page computes the pending count from the loaded page instead of the `summary.pending` value that is in the same response, so once more than 100 requests exist the number under "Arrival Time Requests" no longer matches the inbox.
- Impact: Wrong pending count on /admin/guests after ~100 arrival requests (a few seasons for one apartment); two admin pages do a 100-row query plus per-row join on every load for no displayed data.
- Fix: Dashboard: `internalFetch('/api/admin/check-in-requests?status=all&limit=1')` (route still returns `summary`; `limit` min is 1). Guests page: `internalFetch('/api/admin/check-in-requests?status=all&limit=6')`; add `const [pendingArrivalCount, setPendingArrivalCount] = useState(0)` set from `data.data.summary?.pending ?? 0` (optional chaining + default, matching AdminHomeClient L42, so the existing component tests whose mock returns `{ requests: [] }` without a `summary` keep passing), render `pendingArrivalCount` at L324 and drop the L272 filter. The `arrivalRequests.length > 0` gate at L313 and the `slice(0, 6)` at L343 remain valid. No test query-string changes are needed (the guests tests do not assert the fetch URL); optionally add a component test that feeds `summary.pending: 7` with fewer rows and expects "7 pending requests".
- Fix risk: None; tests/components/admin-guests-*.test.tsx mock the fetch URL — adjust the expected query string.
- Verification:
  - refute: CONFIRMED — The behaviour is real and not handled elsewhere. (1) Guests page: `src/app/admin/guests/page.tsx:109` fetches `/api/admin/check-in-requests?status=all` with no `limit`; the repository defaults to 100 (`checkInRequestRepository.ts:176`) and joins one outbox row per request (L180). L272 derives the pending count from that page (`arrivalRequests.filter(... === 'pending')`) and L324 renders it, although th…
  - reproduce: CONFIRMED — All cited lines verified at HEAD fff4283. Guests page fetches `/api/admin/check-in-requests?status=all` with no `limit` (L109); the route parses `limit` via `adminListPageQuerySchema` (min 1, max 200, optional) and the repository defaults to `params.limit ?? 100` ordered `createdAt desc, id desc` with an `outboxEvents ... take: 1` include per row. The route always returns `summary` from `getStatusCount…

### R-201: Stay-request actions swallow network failures as unhandled rejections and allow double submits
- Severity: Low
- Category: Error handling
- Status: CONFIRMED
- Location: src/app/admin/stay-requests/AdminStayRequestsClient.tsx:L88-L95,L117
- Evidence:

  ```text
  src/app/admin/stay-requests/AdminStayRequestsClient.tsx:88-95
    async function act(id: string, action: 'retry_delivery' | 'close') {
      const response = await internalFetch(`/api/admin/stay-requests/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) { setError(body?.error?.message || 'Unable to update request'); return; }
      await load(status);
    }
  L117: `onClick={() => void act(request.id, 'retry_delivery')}` … no disabled state.

  src/lib/internalFetchClient.ts:36-47: a failed `fetch` is logged and re-thrown.
  ```

- Problem: `act` has no try/catch, so a network error from `internalFetch` becomes an unhandled promise rejection (`void act(...)`) with no UI feedback; there is no in-flight flag, so a second click while the first PATCH is pending sends a second request (the second `close` then fails with 409 "This stay request is closed" and shows an error for an action that succeeded). AdminRequestsClient handles both cases (L184-206: try/catch + `actionId`).
- Impact: Host clicks Retry/Close on a flaky connection: nothing visible happens; a double click on Close shows a misleading error.
- Fix: Keep the proposed fix, with two small additions: (a) call `setError('')` at the start of `act` (the sibling does `setFeedback(null)`) so a stale error from an earlier action does not persist; (b) disable both buttons of the card while `actingId === request.id` and show a neutral label (e.g. 'Working…') is optional. Sketch:
  const [actingId, setActingId] = useState<string | null>(null);
  async function act(id, action) {
    setActingId(id); setError('');
    try {
      const response = await internalFetch(...);
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) { setError(body?.error?.message || 'Unable to update request'); return; }
      await load(status);
    } catch { setError('Unable to update request'); }
    finally { setActingId(null); }
  }
  … `disabled={actingId === request.id}` on both buttons.
Test: in tests/components/admin-stay-requests.test.tsx add a case where the PATCH URL is `mockRejectedValueOnce(new Error('offline'))` → expect the role="alert" with 'Unable to update request'; and a case asserting the button is disabled while the PATCH promise is pending.
- Fix risk: None; extend tests/components/admin-stay-requests.test.tsx with a rejected fetch.
- Verification:
  - refute: CONFIRMED — Both claimed behaviours are real. (1) Network failure: `internalFetch` re-throws every fetch error (src/lib/internalFetchClient.ts:L33-L46 `logger.error('internalFetch failed', …); throw err;`). `act` (AdminStayRequestsClient.tsx:L88-L95) has no try/catch and is called as `void act(...)` (L117), so the rejection is unhandled; `setError` is never reached and `load` is not called, so the card and buttons…
  - reproduce: CONFIRMED — All code paths traced. (1) `act` (L88-95) has no try/catch and is invoked as `void act(...)` from both buttons (L117); `internalFetch` re-throws every non-abort fetch failure after logging (src/lib/internalFetchClient.ts L33-46), so a network error escapes as an unhandled rejection and the UI shows nothing (`setError` is only reached for a non-OK/`success:false` JSON response). (2) Neither button has a…

### R-202: `z.string().uuid()` is deprecated in the installed zod 4.4.3
- Severity: Low
- Category: Legacy
- Status: CONFIRMED
- Location: src/lib/adminListPage.ts:6; src/app/api/admin/check-in-requests/[id]/route.ts:16; src/app/api/admin/bookings/[id]/claim-grants/route.ts:31; src/app/api/admin/bookings/[id]/access-reset/route.ts:33; src/app/api/admin/guests/[userId]/erase/route.ts:43 — plus the same-tag `.url()`/`.datetime()` sites: src/app/api/errors/route.ts:22-23; src/lib/runtime-env-schema.js:42,55,56,57,63,65,67; src/data/schemas.ts:41-44,53
- Evidence:

  ```text
  node_modules/zod/package.json → "version": "4.4.3"
  node_modules/zod/v4/classic/schemas.d.ts:120-121
      /** @deprecated Use `z.uuid()` instead. */
      uuid(params?: string | core.$ZodCheckUUIDParams): this;

  Usages (grep -rn "z.string().uuid()" src):
    src/lib/adminListPage.ts:6
    src/app/api/admin/check-in-requests/[id]/route.ts:16
    src/app/api/admin/bookings/[id]/claim-grants/route.ts:31
    src/app/api/admin/bookings/[id]/access-reset/route.ts:33
    src/app/api/admin/guests/[userId]/erase/route.ts:43
  ```

- Problem: Five admin validators use the string-method form that zod 4 marks `@deprecated` in favour of the top-level `z.uuid()`.
- Impact: No runtime effect today; the method is slated for removal in a future zod major, and new code copies the deprecated form (the two A1/B2 fixes did).
- Fix: Treat as one all-or-nothing cleanup, not five sites: either (a) decline (zero runtime cost, exact pin on 4.4.3, no lint signal, owner already declined cosmetic UUID nits), or (b) one task replacing all 16 deprecated string-format calls consistently: `z.string().uuid()` → `z.uuid()` (5), `z.string().url()` → `z.url()` (9), `z.string().datetime()` → `z.iso.datetime()` (2). Each pair shares its core constructor (schemas.js:265 vs 317, 261 vs 336, 284 vs `iso.datetime`), and `ZodStringFormat extends _ZodString` (schemas.d.ts:172) so the chained `.min(1, …).refine(…)` in runtime-env-schema.js:42 and `.max(500)` in api/errors/route.ts:22 keep type-checking. Gates: typecheck, `npm run lint -- --max-warnings=0`, and `npx vitest run --config vitest.config.ts tests/routes/admin-list-pagination.test.ts tests/routes/admin-claim-grants.test.ts tests/routes/admin-access-reset.test.ts tests/routes/admin-guest-erasure.test.ts tests/unit/runtime-env*.test.ts` (or the env-schema test file that exists). Drop the 'slated for removal' impact wording; state only that the method form is marked `@deprecated` in 4.4.3.
- Fix risk: Both forms use zod 4's UUID check; run tests/routes/admin-*.test.ts and admin-list-pagination to confirm existing ids/cursors still pass.
- Verification:
  - refute: CONFIRMED — The deprecation is real in the installed version and all five cited sites exist, so the finding stands. Calibration: (1) zero current cost — `zod` is pinned exactly (`"zod": "4.4.3"`, package.json:107), so a future major cannot remove the method without an intentional upgrade, and no lint rule surfaces deprecations (eslint.config.mjs has no `@typescript-eslint/no-deprecated`; the only TS rule is `no-ex…
  - reproduce: CONFIRMED — Installed zod is 4.4.3 and the `ZodString.uuid()` method is annotated `@deprecated Use z.uuid() instead.` in the installed type declarations. All five cited call sites exist at the stated lines at HEAD fff4283 and use the deprecated method form. The top-level `z.uuid()` exists in the same package. The fix_risk claim that both forms use the same check also holds: `inst.uuid = (params) => inst.check(core…

### R-203: `Booking.reference` has no writer in the current code (legacy column, same class as R-042)
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: prisma/schema.prisma:L35,L53; src/lib/prisma-repositories/bookingRepository.ts:L8,L22,L36-L38; src/lib/guestDataExport.ts:L12,L39; src/app/admin/guests/page.tsx:L13,L541; src/lib/privacyService.ts:L164
- Evidence:

  ```text
  prisma/schema.prisma:35  `reference         String?`  and L52 `@@index([reference], map: "idx_bookings_reference")`

  Reference search:
    grep -rn "reference:" src scripts | grep -v "generated|externalReference|searchParams|reference: null|reference: booking|reference: true|reference: string" → no output (exit 0, no writer)
  Remaining readers/writers:
    src/lib/privacyService.ts:164        reference: null,            (erasure clears it)
    src/lib/prisma-repositories/bookingRepository.ts:36-38  OR: [{ reference }, { externalReference: reference }]  (search)
    src/lib/guestDataExport.ts:39        reference: booking.reference ?? undefined
    src/app/admin/guests/page.tsx:541    Booking {booking.booking.reference || booking.booking.id}
    src/app/api/admin/bookings/route.ts:56-65 creates bookings with `externalReference` only.
  Not covered by REVIEW.md or bd50a80:REVIEW.md (grep for `bookings.reference` returned nothing).
  ```

- Problem: Nothing sets `reference` any more; rows created by the current admin form only have `externalReference`. The column, its index and the `OR` branch in `findByReference` survive only for legacy rows.
- Impact: Dead schema surface and one extra OR branch per reference search; harmless functionally. Dropping it blindly could lose values on legacy rows, hence SUSPECTED.
- Fix: Now, with no schema change: in src/app/admin/guests/page.tsx:L541 render `booking.booking.externalReference || booking.booking.reference || booking.booking.id`, so bookings from the current admin form show the reference the host entered. At the first production checkpoint (same step as O15/R-042), run the read-only count `SELECT count(*) FROM bookings WHERE reference IS NOT NULL AND reference IS DISTINCT FROM external_reference;`. If it is 0, add a guarded forward migration that raises on that same predicate and otherwise drops `idx_bookings_reference` and the column. Then remove the `reference` branch of the OR in `findByReference`, the select/type field and the two readers. Run `npm run update:prisma-integrity` and bump `EXPECTED_MIGRATION`. If the count is non-zero, first backfill `external_reference` where it is NULL (it is VARCHAR(128) and unique per provider), and refuse on conflicts.
- Fix risk: Schema change → `update:prisma-integrity`, `EXPECTED_MIGRATION`; the reference search then matches `externalReference` only.
- Verification:
  - refute: CONFIRMED — Main claim confirmed: nothing in the current code writes `Booking.reference`. The only writes are erasure setting it to null and the integration fixture inserting NULL. The admin create route writes `externalReference` only. It is not a duplicate. R-042 covers `users.email` and the check-in guest fields. R-040's index list (lines 60/62/64 at 51cc925) does not include `idx_bookings_reference`. REVIEW.md…  Two calibrations. (1) The data-loss risk is smaller than stated. Migration 20260714150000 already copied `reference` into `external_reference` for every row that existed then, and the removed `guestDataStore` writer (daed8bf) set `external_reference = params.external_reference ?? params.reference`. So a legacy value is lost on drop only where it differs from `external_reference`. The guard should test that, not just `IS NOT NULL`. (2) The finder lists the admin card as a harmless reader, but it has a visible effect now. `admin/guests/page.tsx:541` renders `reference || id` and the card never shows `externalReference`. Every booking made with the current admin form therefore shows its UUID, not the reference the host typed, even when found by searching that reference. This is a small UX defect that needs no schema change. The drop itself still depends on production data (no production DB reachable, see O15), so it should be deferred to the same checkpoint as R-042. Severity stays Low.
  - reproduce: CONFIRMED — The code-side claim holds and I traced every write path to `bookings`: (1) `prisma.booking.create` in src/app/api/admin/bookings/route.ts:L56-L64 sets `externalReference` only; (2) `tx.booking.updateMany` in src/lib/portalAuthService.ts:L257-L263 writes `userId/accessStatus/claimedAt`; (3) `tx.booking.updateMany` in src/lib/privacyService.ts:L160-L168 sets `reference: null`. No nested relation writes (…

### R-204: Expired but never-consumed claim grants are never deleted by retention
- Severity: Low
- Category: Logic
- Status: CONFIRMED
- Location: src/lib/operationalMonitor.ts:L209-L214
- Evidence:

  ```text
  operationalMonitor.ts L209-L214:
    prisma.bookingClaimGrant.deleteMany({
      where: {
        expiresAt: { lt: days(30) },
        OR: [{ consumedAt: { not: null } }, { revokedAt: { not: null } }],
      },
    }),

  prisma/schema.prisma L115: `@@index([expiresAt, consumedAt, revokedAt], map: "idx_claim_grants_cleanup")`.
  ```

- Problem: A grant that simply expired (the guest never used the link, the host never revoked it) matches neither `consumedAt != null` nor `revokedAt != null`, so it survives forever although it is unusable 30 days after expiry either way. Every 'issue claim' the host does without the guest following through leaves a permanent row (token digest, booking id, admin-session link).
- Impact: Slow unbounded growth of `booking_claim_grants`; small for one apartment, but it contradicts the stated intent of the cleanup index and the 30-day grant retention comment at L222.
- Fix: `prisma.bookingClaimGrant.deleteMany({ where: { expiresAt: { lt: days(30) } } })`. Add a unit case to tests/unit/operational-retention.test.ts asserting that where clause under fake time, the same way the existing adminSession case does. No existing assertion changes.
- Fix risk: tests/unit/operational-retention.test.ts asserts the where clauses of the tuple; update the expectation. If the owner wants unconsumed grants as an audit trail, keep them and document it instead.
- Verification:
  - refute: CONFIRMED — A grant with consumedAt = null and revokedAt = null matches neither branch of the OR, so retention never deletes it. The finder missed two guards that narrow the survivors. Consuming any grant revokes every other open grant of the same booking, with no expiry filter. Guest erasure revokes all grants of the guest's bookings. replaceOpenClaimGrant revokes only unexpired grants (expiresAt > now), so an ex…
  - reproduce: CONFIRMED — The where clause requires consumedAt != null or revokedAt != null, so a grant that is expired but was never consumed or revoked is never deleted. The surviving set is narrower than the finding says, though. On a successful claim, all other unconsumed and unrevoked grants for the booking are revoked, with no expiry filter (portalAuthService.ts:L266-L269). Erasure revokes all unrevoked grants for the use…

### R-205: notifyAlert's 'ALERT_WEBHOOK_URL missing' branch is unreachable
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/operationalMonitor.ts:L78-L96,L158-L160
- Evidence:

  ```text
  operationalMonitor.ts L90-L96:
    const url = process.env.ALERT_WEBHOOK_URL;
    if (!url) {
      if (process.env.ALERT_WEBHOOK_REQUIRED === '1') {
        throw new Error('ALERT_WEBHOOK_URL is required but not configured');
      }
      return;
    }

  The only caller guards on the same variable, L158-L160:
    if (!alert.notificationDeliveredAt && process.env.ALERT_WEBHOOK_URL) {
      try {
        await notifyAlert({ id: alert.id, rule, value, openedAt: alert.openedAt });
  and handles the REQUIRED=1-without-URL case itself at L179-L181.
  ```

- Problem: `notifyAlert` is only invoked when `ALERT_WEBHOOK_URL` is truthy, so the `!url` branch (and its REQUIRED check) can never execute; the same policy is implemented a second time in the caller.
- Impact: Seven dead lines that suggest a second decision point; harmless at runtime.
- Fix: In evaluateOperationalAlerts read `const webhookUrl = process.env.ALERT_WEBHOOK_URL;` once and use it in the L158 condition. Call `notifyAlert({ url: webhookUrl, id: alert.id, rule, value, openedAt: alert.openedAt })`. Add `url: string` to notifyAlert's input and delete L90-L96, using `input.url` in the fetch. The REQUIRED handling stays only at L179-L181. Existing tests (security-boundaries, outbox-dead-lifecycle integration) should pass unchanged.
- Fix risk: None.
- Verification:
  - refute: CONFIRMED — notifyAlert is module-private: it is not exported, and a repo-wide grep finds no other reference. Its only call site is inside `if (!alert.notificationDeliveredAt && process.env.ALERT_WEBHOOK_URL)`. notifyAlert reads process.env.ALERT_WEBHOOK_URL synchronously, before its first await, so the value cannot change between the caller's check and the read. The `!url` branch, including its REQUIRED throw, th…
  - reproduce: CONFIRMED — notifyAlert is a non-exported function with exactly one call site. That call site only runs when process.env.ALERT_WEBHOOK_URL is truthy (L158), and no await sits between that check and the synchronous read at L90, so the value cannot change in between. The !url branch, including its REQUIRED check, cannot run. The caller implements the REQUIRED-without-URL policy itself at L179-L181. The line numbers…

### R-206: Operations worker uses Promise.all: a rejected alert evaluation discards the retention result and lets disconnect() race the still-running retention transaction
- Severity: Low
- Category: Concurrency
- Status: CONFIRMED
- Location: scripts/run-operational-maintenance.ts:L4-L10 (effect at L22-L29)
- Evidence:

  ```text
  run-operational-maintenance.ts L4-L10 and L22-L29:
    async function main() {
      const [alerts, retention] = await Promise.all([
        evaluateOperationalAlerts(),
        runRetention(),
      ]);
      process.stdout.write(...);
    }
    ...
    void main().catch((error) => { ...; process.exitCode = 1; }).finally(disconnect);

  `evaluateOperationalAlerts` throws by design when a notification fails (src/lib/operationalMonitor.ts L191-L196 AggregateError) and on any DB error inside the rule loop.
  ```

- Problem: `Promise.all` rejects as soon as one promise rejects; `runRetention()` keeps running unawaited, `main()` rejects, `.finally(disconnect)` calls `prisma.$disconnect()` while retention's `$transaction` may still be in flight, and the retention counts are never logged even when it succeeded. If retention then fails because the pool ended, its rejection is unhandled (Node 22 terminates on unhandled rejections; exit code already 1 so the effect is a second stderr trace).
- Impact: In the most likely failing case (alert webhook down → AggregateError after the loop, ~5 s later) retention has almost certainly finished, so the race is rare; but a fast DB error in the first rule loses the retention result every time and can produce confusing 'pool ended' traces in the journal.
- Fix: Keep the success output shape and the existing catch/finally. Wait for both promises to settle, then rethrow:

```ts
async function main() {
  const [alerts, retention] = await Promise.allSettled([evaluateOperationalAlerts(), runRetention()]);
  const result = (r: PromiseSettledResult<unknown>) => r.status === 'fulfilled'
    ? r.value
    : { error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
  process.stdout.write(`${JSON.stringify({ worker: 'operations', alerts: result(alerts), retention: result(retention), at: new Date().toISOString() })}\n`);
  const failures = [alerts, retention].flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
  if (failures.length > 0) throw new AggregateError(failures, 'operations worker step(s) failed');
}
```

The existing `.catch` still writes the stderr 'failed' line and sets `exitCode = 1`. `disconnect` now runs only after both steps have settled. The smoke check (`alerts.evaluated === 3`) is unchanged. Since R3-F06 the same `allSettled` covers three steps (alerts, retention, `syncAirbnbCalendar`), the AggregateError message lists each step's error, and the smoke check is `alerts.evaluated === 4` with `calendar.status === 'not_configured'`.

Add a regression case to tests/unit/worker-disconnect.test.ts: the alert step rejects immediately and `runRetention` resolves through a manually controlled deferred. Assert that `disconnect` has not been called before the deferred resolves, and that the retention counts appear in the stdout line.
- Fix risk: Output shape of the JSON line changes; the smoke check in scripts/smoke-production-image.ts L384-L387 asserts `alerts?.evaluated === 3` and must be adjusted. tests/unit/worker-disconnect.test.ts still passes (it mocks both functions).
- Verification:
  - refute: CONFIRMED — The core defect holds. `Promise.all` settles as soon as `evaluateOperationalAlerts()` rejects. `main()` then rejects and `.finally(disconnect)` runs while `runRetention()` may still be pending. The retention counts are also never written, because the stdout line (L9) only runs after both promises resolve. That part happens every time the alert step fails, for example when the alert webhook is down or r…  Two parts of the finding's mechanism are wrong and need correcting: (1) No unhandled rejection. `Promise.all` attaches its reject handler to every input promise (ECMAScript PerformPromiseAll: `Invoke(nextPromise, "then", « onFulfilled, resultCapability.[[Reject]] »)`, https://tc39.es/ecma262/#sec-performpromiseall). A later rejection from `runRetention` is therefore handled and silently dropped. There is no second stderr trace and no crash. (2) Retention does not fail with 'pool ended'. In Prisma 7.8.0, `$disconnect` on the client engine calls `executor.disconnect()`. That runs `cancelAllTransactions()` first, which rolls back every active transaction, and only then calls adapter `dispose()` (`pool.end()`, which waits for checked-out clients). So an in-flight retention batch transaction is rolled back (unless it has already reached COMMIT, since the cancel waits on the operation queue), and the error is swallowed. The effect is small: retention is idempotent and the timer runs it again 5 minutes later.  How likely is the race? There are 3 rules. Each needs at least upsert + count + findFirst, run one after another, before the `AggregateError` can be thrown, plus an HTTP round trip on the webhook path. Retention is BEGIN + 9 DELETEs + COMMIT on small tables. Retention almost always finishes first, so the rollback race is very unlikely. The realistic cost is lost observability: no retention counts in the log whenever the alert step fails.  Related observation, not part of this finding and not run: in the reverse order, retention rejects first (for example the default 5 s batch-transaction timeout or `lock_timeout`) while the alert loop is still running. The loop's next query then finds the engine in the 'disconnected'/'disconnecting' state. The engine reconnects with a new pg Pool that nothing disconnects afterwards, and idle clients could keep the process alive for up to `idleTimeoutMillis` 300 s (the R-125 symptom). The same `allSettled` fix covers this path.  On the fix: `Promise.allSettled` is the right minimal change, but the proposed `{status, value|error}` wrapper changes the JSON line and breaks the smoke assertion (smoke-production-image.ts L384-L387). A version that keeps the output shape needs no smoke change (see corrected_fix). The existing unit test mocks both functions to settle immediately, so it cannot detect the ordering; a regression test with a deferred `runRetention` is needed.  No overlap with REVIEW.md or PROGRESS.md: grep for retention/allSettled/evaluateOperationalAlerts found only the unrelated R-125 (auto-disconnect hang) and B9/B10 notes.
  - reproduce: CONFIRMED — The main claim holds and I reproduced it. scripts/run-operational-maintenance.ts:L5-L8 awaits `Promise.all([evaluateOperationalAlerts(), runRetention()])`. When the alerts promise rejects first, main() rejects right away, L22-L29 sets exitCode=1, and `.finally(disconnect)` calls `prisma.$disconnect()` while runRetention's `$transaction` (src/lib/operationalMonitor.ts:L201-L223) is still pending. L9 nev…

### R-207: BookingForm calls crypto.randomUUID(), which is undefined outside secure contexts, so the form crashes when dev is opened over a LAN IP
- Severity: Low
- Category: Bug
- Status: CONFIRMED (verifiers disagreed; see Verification)
- Location: src/components/BookingForm.tsx:L40
- Evidence:

  ```text
  BookingForm.tsx L40:
    const [idempotencyKey] = useState(() => globalThis.crypto.randomUUID());

  MDN, https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID : "Secure context: This feature is available only in secure contexts (HTTPS), in some or all supporting browsers."
  CLAUDE.md: `npm run dev` = `next dev -H 0.0.0.0` (all interfaces), i.e. the site is meant to be opened from a phone as http://<lan-ip>:3000, which is not a secure context.
  ```

- Problem: On http://192.168.x.x:3000 `crypto.randomUUID` is `undefined` in Chrome/Safari, the initializer throws `TypeError` during the first render, and the whole `/book` form (not just the submit) fails. Production (HTTPS via Cloudflare) and http://localhost are unaffected.
- Impact: Development-only: phone testing of the booking form over the LAN, which the dev command is set up for, shows the Next error overlay instead of the form.
- Fix: No change now. If LAN dev testing is ever enabled (allowedDevOrigins plus a LAN-bound proxy), apply the proposed fallback: `useState(() => globalThis.crypto.randomUUID?.() ?? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''))`.
- Fix risk: None; the key format on the wire changes only in the fallback path.
- Verification:
  - refute: REFUTED — The crash cannot happen on any supported path. On the server, the initializer runs during SSR on Node 22, where globalThis.crypto.randomUUID exists. In the browser it would only run if the page hydrates, and on a LAN IP it does not. `next dev` allows dev resources and the HMR socket only for localhost, **.localhost, allowedDevOrigins and the bind hostname ('0.0.0.0'), and next.config.ts sets no allowedDe…
  - reproduce: CONFIRMED — L40 is exact. The call is unguarded in a useState initializer of a 'use client' component, so it runs on the first client render (hydration) of /[locale]/book. The installed TypeScript DOM lib documents Crypto.randomUUID() as 'Available only in secure contexts.' getRandomValues has no such note. An http://<LAN-IP>:3000 origin is not a secure context, so in a browser crypto.randomUUID is undefined there…

### R-208: Client-side phone validation (min 1 char) is weaker than the server's regex + Greek E.164 normalization, so a wrong number only produces the generic 'rejected' message
- Severity: Low
- Category: Logic
- Status: CONFIRMED
- Location: src/components/BookingForm.tsx:L54 (and L100-L104); src/i18n/domains/booking.ts:L44,L140,L228
- Evidence:

  ```text
  BookingForm.tsx L54:
    phone: z.string().min(1, labels.phoneRequired),

  Server, src/app/api/booking-requests/route.ts L35-L38 and L101-L102:
    phone: z.string().trim().min(7).max(32).refine((value) => /^\+?[0-9 ()-]{7,32}$/.test(value), 'Invalid phone number'),
    ...
    const phone = normalizeStayRequestPhone(parsed.data.guest.phone);
    if (!phone) return errorResponse('Invalid phone number', 422);

  src/lib/stayRequestPhone.ts: `normalizePhone(value, 'GR')` — unprefixed numbers are interpreted as Greek.
  Client handling of 422 (BookingForm L102-L104): `response.status === 422 ? labels.submitRejected : labels.submitFailed` — one message for the whole form.
  ```

- Problem: A foreign guest typing a national number without '+' (e.g. '0171 2345678') passes the client check, fails server normalization, and gets `submitRejected` with no indication that the phone field is the cause. The form's field-level errors (which the UI is built around) never fire for this case.
- Impact: Confusing rejection for exactly the international guests the site targets; they have to guess which field is wrong.
- Fix: In BookingForm's schema, reuse the server normalizer instead of duplicating the regex: `import { normalizeStayRequestPhone } from '@/lib/stayRequestPhone';` … `phone: z.string().min(1, labels.phoneRequired).refine((v) => /^\+?[0-9 ()-]{7,32}$/.test(v.trim()) && normalizeStayRequestPhone(v.trim()) !== null, labels.phoneInvalid)`. Add a `phoneInvalid` key to BookingFormDictionary with en/el text (e.g. 'Enter your number with the country code, starting with + (e.g. +49 171 2345678)'); the i18n parity test enforces both locales. Do not branch on the English server message. Add a component test that '0049 171 2345678' shows the field error and does not call fetch.
- Fix risk: Adds one dictionary key per locale; the B27 parity test enforces both.
- Verification:
  - refute: CONFIRMED — The gap is real. The client only checks min(1). The server applies a trim/length/regex check and then normalizeStayRequestPhone (normalizePhone with origin 'GR'). Numbers that pass the client check but get a 422 include the finding's national example '0171 2345678' and, more commonly, the '00' international prefix ('0049 171 2345678', '0030 694 111 2222'). normalizePhone turns those into '+0…', which i…
  - reproduce: CONFIRMED — The validation gap is real and the cited lines are exact. The client only requires min(1) (L54), while the server applies a regex (L35-L38) and then normalizeStayRequestPhone (L101-L102). I ran the normalizer: '0171 2345678' -> null and '123' -> null, while '+49 171 2345678' -> +491712345678. Such inputs pass the client and get a 422. The client maps every 422 to labels.submitRejected (L102-L104), and…

### R-209: Greek dates in the search bar use the English pattern "MMM d, yyyy" ("Σεπ 27, 2026") instead of the Greek order used elsewhere
- Severity: Low
- Category: Maintainability
- Status: CONFIRMED
- Location: src/components/SearchBar.tsx:L192-L193
- Evidence:

  ```text
  SearchBar.tsx L192-L193:
    const arrivalDisplay = state.dateRange?.from ? format(state.dateRange.from, "MMM d, yyyy", { locale: dateFnsLocale }) : arrivalPlaceholder;
    const departureDisplay = state.dateRange?.to ? format(state.dateRange.to, "MMM d, yyyy", { locale: dateFnsLocale }) : departurePlaceholder;

  $ node -e "...format(new Date(2026,8,27),'MMM d, yyyy',{locale: el})... Intl.DateTimeFormat('el-GR',{day:'numeric',month:'short',year:'numeric'})"
  Σεπ 27, 2026
  27 Σεπ 2026

  src/lib/dateUtils.ts L14-L23 (`formatDateRange`) already uses Intl with 'el-GR', so the same dates render as "27 Σεπ 2026" on /book.
  ```

- Problem: The pattern hard-codes month-day-year order; the date-fns locale only translates the month name. The home bar and the booking page show the same date in two different orders on /el.
- Impact: Cosmetic/i18n inconsistency visible on every Greek home page with dates selected.
- Fix: src/components/SearchBar.tsx:L192-L193: replace the pattern "MMM d, yyyy" with the localized token "PP" in both format(...) calls, keeping `{ locale: dateFnsLocale }` and the existing imports. The English output stays "Sep 27, 2026" and the Greek output becomes "27 Σεπ 2026", matching formatDateRange on /book. Optionally add a component test that renders locale="el" with checkin/checkout URL params and asserts the arrival text is "10 Ιουλ 2030"-style day-month-year.
- Fix risk: tests/components/search-bar.test.tsx may assert the English string; check before changing.
- Verification:
  - refute: CONFIRMED — The claim holds. SearchBar hard-codes the English month-day-year pattern, and the date-fns `el` locale only translates the month name, so on /el the home search bar shows "Σεπ 27, 2026". /book and BookingForm use dateUtils.formatDateRange (Intl 'el-GR'), which shows "27 Σεπ 2026". No guard or test hides this. tests/components/search-bar.test.tsx only asserts button state and the 'N nights' text, never…
  - reproduce: CONFIRMED — I re-read the cited lines and they are accurate. With locale 'el', dateFnsLocale is el (L63), but the pattern 'MMM d, yyyy' fixes the order as month, day, year. I ran the same date through both formatters in Node 22.19.0 and got 'Σεπ 27, 2026' from the search bar's format and '27 Σεπ 2026' from Intl el-GR. Intl el-GR is what dateUtils.formatDateRange uses, and it drives the /book page and BookingForm.…

### R-210: ToastProvider re-renders every toast consumer 2.5×/s forever (GC interval + unmemoized context value)
- Severity: Low
- Category: Performance
- Status: CONFIRMED
- Location: src/components/Toast.tsx:L24-L32
- Evidence:

  ```text
  L24-L30:
    useEffect(() => {
      const t = setInterval(() => {
        const now = Date.now();
        setToasts(ts => ts.filter(t => t.expires > now));
      }, 400);
      return () => clearInterval(t);
    }, []);
  L32:  <ToastContext.Provider value={{ push }}>
  Consumers (grep -rln useToast src): ListingCard.tsx, FavoriteButton.tsx, moments/MomentCard.tsx. ToastProvider wraps every localized page (src/app/[locale]/layout.tsx:L43).
  ```

- Problem: `[].filter()` returns a new array even when nothing changes, so `setToasts` never bails out; the provider re-renders every 400 ms even with zero toasts. Because the context value is a fresh object literal each render, every `useToast()` consumer (each MomentCard on /phones and /moments, each ListingCard on /favorites, FavoriteButton on detail pages) re-renders every 400 ms too, recomputing `getDictionary`, `phoneNumbers`, `metadata`, etc.
- Impact: Constant background work on every page for the lifetime of the tab (5–10 card re-renders 2.5×/s on the moments/phones pages). No visible bug, but wasted CPU/battery on the phones guests actually use, and React DevTools shows perpetual rendering.
- Fix: Minimal, two lines. (1) In the GC tick, return the existing array when nothing expired, so React bails out: `setToasts(ts => { const next = ts.filter(x => x.expires > now); return next.length === ts.length ? ts : next; });`. The finder's alternative also works: gate the interval on `toasts.length > 0` with that in the effect deps. (2) Memoize the context value: `const value = useMemo(() => ({ push }), [push]);` then `<ToastContext.Provider value={value}>`, and add useMemo to the react import. To verify: toasts still auto-dismiss after about 3 s, the × button still dismisses, and tests/components/i18n-copy.test.tsx (which wraps pages in ToastProvider) still passes.
- Fix risk: Low. Verify toasts still auto-dismiss after 3 s and that manual dismiss works (existing tests/components/i18n-copy.test.tsx touches Toast).
- Verification:
  - refute: CONFIRMED — I couldn't refute it. The GC interval calls `setToasts(ts => ts.filter(...))` every 400 ms. `filter` always returns a new array, so React's Object.is state bail-out never fires and the provider re-renders forever, even with zero toasts. The context value `{ push }` is a new object on every render. `push` itself is stable (useCallback, L20-22), but the wrapper object is not, and React Compiler is not en…
  - reproduce: CONFIRMED — The line numbers are correct. The GC interval runs `setToasts(ts => ts.filter(...))` every 400 ms with an empty deps array, so it runs for the provider's whole lifetime. `Array.prototype.filter` always returns a new array, so React's Object.is bail-out never fires and the provider re-renders every 400 ms even when there are no toasts. The context value `{ push }` is a fresh object literal on every rend…

### R-211: `leaflet.markercluster` (JS + 2 CSS files + @types) is loaded but can never activate: clusterMin is 20 and the site has at most 15 markers
- Severity: Low
- Category: Dependencies
- Status: CONFIRMED
- Location: src/components/LeafletMap.tsx:L6-L8,L106,L116,L127,L316-L331,L355; src/components/ApartmentLocationMap.tsx:L42; src/components/InteractiveMap.tsx:L24,L34,L113; package.json:L100,L117; src/styles/08-vendor.css:L402-L412
- Evidence:

  ```text
  LeafletMap.tsx L6-L8: import 'leaflet.markercluster/dist/MarkerCluster.css'; import 'leaflet.markercluster/dist/MarkerCluster.Default.css'; import 'leaflet.markercluster';
  L328: const useCluster = markers.length >= clusterMin && Boolean(leafletNs.markerClusterGroup);
  ApartmentLocationMap.tsx L42: clusterMin={20}   (the only caller of InteractiveMap → LeafletMap)
  Marker supply: mapLocations.ts L93-L189 = 6 landmarks, L310 apartment = 1, moments.json has 5 items with `location`, phones.json 3 (grep -c '"location"'); CheckInInfo.tsx L302-L308 passes moments+phones → maximum 1+6+5+3 = 15 < 20.
  package.json L100: "leaflet.markercluster": "^1.5.3", L117: "@types/leaflet.markercluster"
  src/styles/08-vendor.css L402-L408: .marker-cluster-small/-medium/-large and .marker-cluster div overrides.
  ```

- Problem: The clustering plugin, its CSS and the overrides are dead weight in the map chunk; knip cannot see this because the import exists.
- Impact: Extra JS/CSS downloaded when the map opens; one more dependency to keep patched for a feature that never renders.
- Fix: With owner approval: in LeafletMap.tsx remove the imports at L6-L8, the ClusterFactory type (L106), clusterRef (L127, L307, L316-L319, L355), the clusterMin prop and default (L56, L116) and its dep (L368). Always use `const layer = L.layerGroup();`. Remove `clusterMin` from InteractiveMap.tsx (L24, L34, L113) and ApartmentLocationMap.tsx (L42), the two package.json entries (plus package-lock via npm, which needs approval) and 08-vendor.css L402-L412. Alternative: keep it if the owner expects the content to grow past 20 located items.
- Fix risk: Low. Re-run `npm run check:dead-code` and the map smoke (F4 documented in PROGRESS.md) after removal.
- Verification:
  - refute: CONFIRMED — Every render path goes page → ApartmentLocationMap (hard-codes clusterMin={20}) → InteractiveMap → LeafletMap. So the LeafletMap default of 5 is never used. Maximum marker count: 1 apartment + 6 landmarks + 5 moments + 3 phone entries = 15. The contentItems passed by the check-in page and the moments map are subsets of these, and dedupe by id can only lower the count. 15 < 20, so `useCluster` is always…  One correction: 'can never activate' holds only for the current content. Adding 5+ located items to moments.json/phones.json would turn clustering on. Removing it is a dependency change and needs owner approval. The proposed fix misses the prop plumbing: the clusterMin prop in InteractiveMap and ApartmentLocationMap, and clusterRef in LeafletMap.
  - reproduce: CONFIRMED — Traced every path. LeafletMap is rendered only by InteractiveMap, which ApartmentLocationMap renders with clusterMin={20} hard-coded. The three callers (book page, CategoryGridClient moments map, CheckInInfo) all go through ApartmentLocationMap. getKalamataMapLocations builds the markers: 1 apartment, 6 landmarks, and the content items that have a numeric lat/lng. I counted those with node: moments has…

### R-212: Map chain (R-022 leftovers): flags that are always true, options that are always the same constant, a defeated OSRM singleton, an unused travel mode and a 15-minute refetch of static distances
- Severity: Low
- Category: Overengineering
- Status: CONFIRMED
- Location: src/components/LeafletMap.tsx:L58-L61,L118-L121,L145-L147,L185,L341,L358-L367,L377-L379; src/hooks/useTravelMetrics.ts:L20,L24-L34,L57-L63,L150-L159; src/lib/osrmClient.ts:L27,L66,L139-L147; src/lib/travelFormat.ts:L4,L20; src/components/StaticLocationMap.tsx:L9,L43,L65,L90; src/data/mapLocations.ts:L305-L310; src/lib/mapUtils.ts:L58
- Evidence:

  ```text
  LeafletMap is rendered only by InteractiveMap.tsx:104-116, which always passes `autoFitToOriginAndMarkers refitOnMarkerChange lazyTravelMetrics` and `origin={APARTMENT_LOCATION}`; LeafletMap.tsx:117-121 still defaults them to false and branches on the false case (L146, L185, L341, L358, L378). `travelPrompt = 'Tap a marker to calculate travel time.'` (L121) is an English fallback for a required dictionary key. useTravelMetrics.ts:24-34 exposes 9 options; the single caller passes module constants for all of them (LeafletMap.tsx:13-18, 153-163). osrmClient.ts:142-147 `if (!defaultClient || options?.baseUrl) defaultClient = new OSRMClient(options)` — the caller always passes `baseUrl` (useTravelMetrics.ts:62), so a new client is created on every mount and the "singleton" is never reused. `TravelMode` includes `'cycling'` (travelFormat.ts:4) with `PROFILE_CANDIDATES.cycling` (osrmClient.ts:27) and the 🚲 branch (travelFormat.ts:20), but `TRAVEL_MODES = ['driving','foot']` (LeafletMap.tsx:13) is the only mode list. useTravelMetrics.ts:151-159 re-fetches OSRM tables every `refreshMinutes` (15) while the map is open, for fixed POI coordinates. `StaticLocationMap` `compact` (StaticLocationMap.tsx:9,43) is only ever passed as `compact={false}` (book/page.tsx:230). `getKalamataMapLocations` option `includeApartment` (mapLocations.ts:305-310) is never passed (only `includeLandmarks`, always its default true: ApartmentLocationMap.tsx:25,30; no caller sets it). The OSRM default URL is defined three times (security-config.ts:79, LeafletMap.tsx:14, osrmClient.ts:66).
  ```

- Problem: R-022 removed routing/mode toggle, but the component still models a general-purpose map with every behaviour switchable, while the application has exactly one configuration. The recurring refetch spends public OSRM requests (and the guest's data) to recompute distances between fixed points.
- Impact: Roughly 60-80 lines of unreachable branches and option plumbing in the heaviest client chunk; recurring network calls that cannot produce new information; three places to update if the OSRM host changes.
- Fix: Do this as separate one-concern tasks.

(a) LeafletMap flags:
- Drop the three props from LeafletMap and InteractiveMap.
- Use `useState(false)` for shouldFetchTravel and delete the effect at L145-147.
- Change L185 to `if (!shouldFetchTravel)`.
- Make L341 call `setShouldFetchTravel(true)` unconditionally.
- Make L377-379 call `fitOriginAndMarkers()` unconditionally.
- DELETE (do not inline) the autoFit block at L358-367 and `autoFitDoneRef`, because the refit effect already fits on mount.
- Make `travelPrompt: string` required and drop the English default.

(b) useTravelMetrics:
- Reduce the options to `{ origin, markers, enabled, onProfilesFailed }` and move modes, debounce and maxBatch to module constants.
- Delete `refreshMinutes` and the interval. It is redundant because it is served from `tableCache`; it does not save any network traffic.

(c) OSRM client:
- Delete `getOSRMClient`/`defaultClient`.
- Keep today's per-mount semantics by building the client per hook instance, e.g. `const clientRef = useRef<OSRMClient | null>(null); if (!clientRef.current) clientRef.current = new OSRMClient({ baseUrl: OSRM_BASE_URL });`.
- A module-level instance would keep a transient 'unavailable' for the whole tab session. That is a behaviour change for the owner to decide.
- Note `new OSRMClient(OSRM_BASE_URL)` does not type-check.

(d) Cycling: remove 'cycling' from `TravelMode`, `PROFILE_CANDIDATES`, `travelModeIcon` and `TravelData`, and remove the cycling case at tests/unit/core-utilities.test.ts:67.

(e) StaticLocationMap: delete `compact` and its two `!compact &&` guards, keeping the content, and drop `compact={false}` at book/page.tsx:230.

(f) Map locations: drop `includeApartment` from mapLocations.ts and mapUtils.ts. Optionally drop `includeLandmarks` and the never-passed ApartmentLocationMap prop too.

(g) OSRM default URL:
- Remove the unreachable default in osrmClient.ts:66 by making `baseUrl` required.
- If one copy is wanted, export only the default string (not the env read) from a tiny module that the edge security-config can import. LeafletMap and security-config each keep reading `process.env.NEXT_PUBLIC_OSRM_BASE_URL` themselves (build-time vs server-start, see PROGRESS B11 note).

Gates:
- tests/security/csp-osrm-origin.test.ts and core-utilities pass; typecheck, lint and knip are clean.
- Manual check on /en/moments: chips load on the first marker click, and the map refits when the filters change.
- Fix risk: No tests for LeafletMap/useTravelMetrics; manual check of travel chips on the moments map (lazy fetch on first marker click) and of the OSRM CSP origin (security-config uses the same env).
- Verification:
  - refute: CONFIRMED — Most sub-claims hold, one impact claim is wrong, and the proposed fix needs corrections.  What holds: (1) The flags are always true. LeafletMap has one renderer, InteractiveMap, which always passes the three flags. The false-case branches at L146, L185, L341, L358 and L378 can never run. (2) `travelPrompt` is a required dictionary key in both en and el, so the English default at L121 is never used. (3) Five of the 9 `useTravelMetrics` options are fixed module constants. The finding's wording "module constants for all of them" overstates this: origin, markers, enabled and onProfilesFailed are real inputs. The proposed reduced signature is correct. (4) `getOSRMClient` always builds a new client because the caller always passes `baseUrl`. A runtime probe confirmed it: 'remount returns same instance: false'. (5) `'cycling'` is never requested. (6) `compact` is only ever false. (7) `includeApartment` is never passed, and `includeLandmarks` is always true. (8) The OSRM default URL appears 3 times. The copy in osrmClient.ts is unreachable.  What is wrong: - The 15-minute refresh makes no network requests. `getTableMetrics` checks the module-level `tableCache` before calling fetch, and returns early for failed profiles. The probe showed 0 network calls on refresh, both after a success and after a failure. So "spends public OSRM requests (and the guest's data)" is refuted. The interval is still dead code: it re-reads the cache, re-renders and resets popup content every 15 minutes. It should still be removed, but only as redundancy. - The proposed module-level OSRMClient changes behaviour. Today every mount gets a fresh `failedProfiles`, so a remount retries a mode that failed transiently. With a module-level client the mode would stay 'unavailable' for the whole tab session. - `new OSRMClient(OSRM_BASE_URL)` does not type-check. The constructor takes `{ baseUrl }` (osrmClient.ts:65). - The fix-risk note says there are no tests. But tests/unit/core-utilities.test.ts:67 tests the cycling chip, so removing 'cycling' removes that case. - Inlining `autoFitToOriginAndMarkers` as true would keep a dead block. The refit effect (L377-379) runs on mount after the markers effect and calls `fitBounds`, which always sets the view (Leaflet 1.9.4 `setView`). The autoFit block (L358-367) and its persisted-view check are already subsumed by it. Checked by reading the code only, not in a browser.  Impact: maintainability only. There is no user-visible or network effect. The finder's 60-80 line estimate was not verified.  Not a duplicate. Review 1's R-022 (T21, DONE) deliberately kept the auto-fit, refit and lazy behaviours as live features, and R-084 (DONE) kept one `TravelMode` including cycling. R-094 listed StaticLocationMap, but the record of what it removed (bd50a80:PROGRESS.md:200) does not mention it, so `compact` is an R-094 leftover. None of these is in the current 'Declined (do not redo)' list.  Severity: Low fits the owner's scale.
  - reproduce: CONFIRMED — The overengineering and dead-option claims hold. I traced every one of them, and all cited line numbers are correct. One impact claim is wrong. The 15-minute refresh does not make recurring OSRM network requests. OSRMClient.getTableMetrics first looks in a module-level `tableCache` (a Map with no TTL that nothing ever clears or deletes from) and returns the cached response. When every profile for a mod…

### R-213: OSRM client: no request timeout, a per-session permanent failure latch, and a 15-minute refresh that can never fetch anything
- Severity: Low
- Category: Error handling
- Status: CONFIRMED
- Location: src/lib/osrmClient.ts:L36-L55, L63, L83-L111; src/hooks/useTravelMetrics.ts:L150-L159; src/components/LeafletMap.tsx:L18, L134, L162
- Evidence:

  ```text
  L43: const res = await fetch(url, { cache: 'no-store' });   // no AbortController / timeout
  L83-L85: if (this.failedProfiles.has(mode)) { return null; }
  L109-L111: // All profiles failed
          this.failedProfiles.add(mode);
          return null;
  L31: const tableCache = new Map<string, OSRMTableResponse>();  (never cleared)
  L92-L95: if (tableCache.has(cacheKey)) { ... return this.parseTableResponse(cached, ...) }
  useTravelMetrics.ts L151-L159: setInterval(() => { fetchMetrics(); }, refreshMinutes * 60 * 1000);
  LeafletMap.tsx L18: const TRAVEL_REFRESH_MINUTES = 15;
  ```

- Problem: (1) A hanging OSRM response keeps `travel.loading` true forever (popup spinner never resolves). (2) One transient failure (e.g. a 429 from the ≤1 req/s policy, since driving and foot tables are requested back-to-back) marks the mode failed for the whole session; every marker then shows 'Unavailable' for that mode until reload, and the retry (2 attempts, 500/1000 ms) cannot recover it. (3) The 15-minute refresh always hits `tableCache` (same key, entries never expire), so it performs no network call and can never update or recover data — dead code that only looks like a feature.
- Impact: Walking or driving times silently stuck at 'Unavailable' or spinning for the rest of a visit after one hiccup; misleading 'refresh' logic.
- Fix: Minimal fix in three steps. (a) Timeout: change L43 to `fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8_000) })`. This matches the pattern already used in bookingOutbox.ts and operationalMonitor.ts. Timeouts surface as a thrown TimeoutError, which the existing catch treats as a retryable network error. (b) Latch: either drop failedProfiles, or store a failure timestamp and skip the mode only for N minutes. Without the latch, the 15-minute refresh re-requests a failed mode, because failures are never cached. If the latch is kept, LeafletMap should also clear failedModes after a later success (for example, the hook reports failed modes on every run, including an empty list). (c) Refresh: once (a) is in place, delete the periodic-refresh effect and the refreshMinutes/TRAVEL_REFRESH_MINUTES option. The table data is fixed for a static origin and static markers, and every refresh is a cache hit. Do not delete the refresh without (a): it is currently the only recovery path for a hung request. Add a unit test in tests/unit that mocks global fetch to cover: timeout then retry; the latch expiring, or no latch; and a cache hit making no second fetch.
- Fix risk: Low; no tests cover osrmClient/useTravelMetrics today (grep tests/ for osrmClient → none), so add a unit test for the latch/timeout if kept.
- Verification:
  - refute: CONFIRMED — All three defects are real, but the finding overstates each one. (1) There is no timeout: src/lib/osrmClient.ts:L43 calls fetch with no signal, and the hook requests the modes one after another (useTravelMetrics.ts:L94-L101). A request that hangs therefore blocks both modes and keeps travel.loading true, so LeafletMap.tsx:L197-L199 shows a spinner. It does not last 'forever'. It lasts until the browser…
  - reproduce: CONFIRMED — I traced every path; I did not run anything, because there is no test for osrmClient or useTravelMetrics. (1) No timeout: fetchWithRetry calls fetch with no AbortSignal. While a request hangs, travel.loading stays true, so the popup keeps showing its spinner chip. It lasts until the browser gives up on the connection or a newer request supersedes it, not literally forever as the finding says. (2) Failu…

### R-214: generateStaticParams / `dynamic` exports are dead: the root layout awaits headers(), so no page is ever prerendered
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/app/layout.tsx:L34-L36 (cause); dead exports at src/app/[locale]/layout.tsx:L80-L82, src/app/[locale]/[category]/page.tsx:L108-L114, src/app/[locale]/[category]/[slug]/page.tsx:L39,L99-L110, src/app/[locale]/favorites/page.tsx:L54-L56, src/app/[locale]/apartment/page.tsx:L30-L31
- Evidence:

  ```text
  src/app/layout.tsx L34-L36:
    const requestHeaders = await headers();
    const locale = normalizeLocale(requestHeaders.get('x-locale'));
    const nonce = requestHeaders.get('x-nonce') ?? undefined;
  Dead exports: src/app/[locale]/layout.tsx L80-L82 generateStaticParams; [category]/page.tsx L108-L114; [category]/[slug]/page.tsx L39 `export const dynamic = 'force-dynamic'` + L99-L110 generateStaticParams; favorites/page.tsx L54-L56; apartment/page.tsx L30-L31 `export const dynamic = 'auto'` (the default).
  Build evidence (.next/prerender-manifest.json, build of 2026-09-27): routes = /_global-error, /favicon.ico, /robots.txt, /sitemap.xml; dynamicRoutes = {} — no page route is prerendered.
  ```

- Problem: The nonce-based CSP correctly makes every page dynamic, so the four generateStaticParams functions and the two `dynamic` exports do nothing except suggest static generation that never happens (the [slug] page even forces dynamic while also declaring static params).
- Impact: Misleading code only; a future reader may assume item pages are static and, e.g., cache JSON reads accordingly.
- Fix: 1. Delete generateStaticParams in the following places:
   - src/app/[locale]/layout.tsx:L80-L82
   - src/app/[locale]/[category]/page.tsx:L108-L114
   - src/app/[locale]/[category]/[slug]/page.tsx:L99-L110
   - src/app/[locale]/favorites/page.tsx:L54-L56
2. Delete `export const dynamic = 'force-dynamic'` in [slug]/page.tsx:L39. Delete the stale comment and `export const dynamic = 'auto'` in apartment/page.tsx:L30-L31.
3. Remove the imports that step 1 orphans. In [locale]/layout.tsx:L2 drop `locales` and keep `normalizeLocale`. In [slug]/page.tsx:L2 drop `getItemsByCategory` and `toSlug`. [category]/page.tsx still uses both, so its import stays.
4. Optionally, add a one-line comment above headers() in src/app/layout.tsx saying the per-request CSP nonce makes every route dynamic by design.
5. Verify with `npm run typecheck` and `npm run lint -- --max-warnings=0`. `npm run build` can then confirm the prerender manifest is unchanged.

Leave the force-dynamic exports on the authenticated pages (portal, check-in, guest, admin) and on the API routes alone. They are out of this finding's scope.
- Fix risk: None functionally (routes are dynamic already). Run `npm run build` once to confirm the manifest is unchanged.
- Verification:
  - refute: CONFIRMED — I could not refute the finding. The root layout wraps every page, including [locale], /admin and /offline, and it awaits headers(). Next 16.3.6 still calls generateStaticParams at build time, then tries to prerender each path it returns. Every attempt reads headers(), so no page HTML is emitted. The prerender manifest of the latest build has only non-page routes and an empty dynamicRoutes. No file unde…
  - reproduce: CONFIRMED — I read the cited lines at src/app/layout.tsx:L34-L36, and they are correct. The root layout awaits headers(). The Next 16.3.6 docs bundled in node_modules say this opts the route into dynamic rendering. Every page sits under this root layout, and next.config.ts does not enable cacheComponents or PPR, so generateStaticParams cannot prerender anything. The build output agrees. The prerender manifest list…  That build is from Sep 27 16:41, nine minutes before commit fff4283 at 16:50. However, `git show fff4283 -- src/app/layout.tsx` shows `const requestHeaders = await headers();` in both the old and new versions. That commit only swapped the locale normalization and removed WebVitalsReporter. So the conclusion holds at HEAD, though no build of exact HEAD was checked.  All the cited dead exports exist at the stated lines: [locale]/layout.tsx L80-L82, [category]/page.tsx L108-L114, [category]/[slug]/page.tsx L39 (force-dynamic) and L99-L110, favorites/page.tsx L54-L56, and apartment/page.tsx L31 (`dynamic = 'auto'`, the default; L30 is its comment). No route sets dynamicParams, so generateStaticParams does not restrict params either. The Low/Redundant rating fits: the code is misleading and has no runtime effect.  One caveat on the fix: the fix-risk note says to run `npm run build` to confirm, and build is outside this verification's read-only scope. The first half of the fix-risk statement ("no functional change") is supported by the manifest.

### R-215: JSON-LD uses relative image URLs and a .ico as the Organization logo
- Severity: Low
- Category: Bug
- Status: CONFIRMED
- Location: src/app/[locale]/page.tsx:L45 (logo); src/components/moments/MomentsDetailLayout.tsx:L89 and src/app/[locale]/[category]/[slug]/page.tsx:L88-L92 (image, aggregateRating)
- Evidence:

  ```text
  MomentsDetailLayout.tsx L83-L92:
    __html: serializeJsonLd({
        '@context': 'https://schema.org',
        '@type': 'Place',
        name: item.name,
        description: item.summary,
        url: urls.schemaUrl,          // absolute (absUrl)
        image: item.image,            // e.g. "/moments/viktoria-karelia.jpg" (moments.json L9)
        ...structuredData,           // phones: image: heroImage = "/phones/sos-hero.webp" ([slug]/page.tsx L92)
    })
  src/app/[locale]/page.tsx L40-L46: '@type': 'Organization', name: t.appTitle, url: siteUrl, logo: absUrl('/favicon.ico')
  ```

- Problem: `url` is made absolute but `image` is left as a root-relative path; Google's structured-data guidance asks for absolute, crawlable image URLs, and the Organization `logo` points at an .ico (Google's logo guidelines list PNG/JPG/GIF/WebP/SVG/BMP). Also `aggregateRating` (L91 of the slug page) is emitted with only `ratingValue` — invalid for Google without ratingCount/reviewCount — although today no item has a rating.
- Impact: Rich-result validators may flag the Place/Organization entities; the structured data likely earns nothing today. Not user-visible.
- Fix: src/app/[locale]/page.tsx:L45: change `logo: absUrl('/favicon.ico')` to `logo: absUrl('/icons/icon-512.png')`. Optional, SEO-only: in MomentsDetailLayout.tsx:L89 use `image: item.image ? absUrl(item.image) : undefined` (import absUrl from '@/lib/site'), and in [slug]/page.tsx:L91 use `image: heroImage ? absUrl(heroImage) : undefined`. Never call absUrl unguarded, because phones items have no `image` and absUrl(undefined) throws. The aggregateRating branch is handled by the separate unused-`rating` finding; don't fix it twice.
- Fix risk: None functionally.
- Verification:
  - refute: CONFIRMED — I couldn't disprove this, but its scope needs narrowing. (1) Organization logo: this part is confirmed deterministically. The logo is absUrl('/favicon.ico'), and src/app/favicon.ico holds only 16x16 and 32x32 icons. Google's Organization docs require the logo to be at least 112x112px and in a format Google Images supports. That list is BMP, GIF, JPEG, PNG, WebP, SVG and AVIF, with no ICO. Google will n…
  - reproduce: CONFIRMED — All the code facts check out, and so do the line numbers. At MomentsDetailLayout.tsx:L88-L90, `url` is absolute (the slug page passes `schemaUrl: absUrl(...)` at L81) but `image: item.image` is root-relative. For phones, the spread `structuredData.image` (slug page L92, `heroImage` such as "/phones/sos-hero.webp") replaces it, and that value is root-relative too. `absUrl` exists (src/lib/site.ts:L5-L8)…

### R-216: `rating`, `updatedAt` / isRecentlyUpdated and their labels are dead data paths: no content item has either field
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/data/schemas.ts:L45,L53; src/lib/data.ts:L76-L81; src/app/[locale]/[category]/[slug]/page.tsx:L2,L56,L75,L91; src/app/[locale]/check-in/page.tsx:L35; src/app/[locale]/[category]/page.tsx:L76; src/app/[locale]/favorites/page.tsx:L32; src/components/ListingCard.tsx:L10,L20,L41-L45; src/components/FavoritesClient.tsx:L13,L47; src/components/CategoryGridClient.tsx:L27,L109; src/components/moments/MomentCard.tsx:L19,L143,L190; src/components/moments/MomentsDetailLayout.tsx:L29,L35,L66,L101-L105; src/config/momentsLayoutConfig.ts:L30-L33; src/data/mapLocations.ts:L39,L62,L292; src/lib/mapUtils.ts:L26,L44; src/i18n/domains/common.ts:L64,L72,L221,L229,L401,L409; tests/unit/data-map-navigation.test.ts:L15,L63-L66
- Evidence:

  ```text
  schemas.ts L45: rating: z.number().min(0).max(5).optional(),  L53: updatedAt: z.string().datetime().optional(),
  Data: src/data/items/moments.json and phones.json read in full — no "rating" and no "updatedAt" key in any of the 10 items.
  Consumers of rating: [category]/page.tsx L76, CategoryGridClient.tsx L27/L109, MomentCard.tsx L19/L190 (`t.labels.rating`), FavoritesClient.tsx L13/L47, ListingCard.tsx L10/L41-L45, favorites/page.tsx L32, [slug]/page.tsx L91 (aggregateRating), mapLocations.ts L39/L62/L292, mapUtils.ts L26/L44.
  Consumers of updatedAt: data.ts L76-L81 isRecentlyUpdated (only test callers: tests/unit/data-map-navigation.test.ts L63-L66), [slug]/page.tsx L56/L75, MomentsDetailLayout.tsx L35/L101-L105 (`t.labels.updated`), momentsLayoutConfig.ts L31-L33 updatedBadge.
  Search: grep -rn "rating\|updatedAt" src tests (listed above); no producer writes either field.
  ```

- Problem: Nine files carry plumbing for star ratings and an 'Updated' badge that cannot appear with the shipped content; the i18n keys labels.rating/labels.updated exist in two locales for them.
- Impact: Maintenance noise only; every card/props interface is wider than the data.
- Fix: Ask the owner first whether star ratings are planned. They existed in content until 3037970. If they are not planned, remove `rating` and `updatedAt` from ItemSchema and from every pass-through listed in corrected_location, including check-in/page.tsx:L35 and MarkerData.rating in mapUtils.ts, which the finding missed. Delete isRecentlyUpdated and its 4 test assertions, `updatedBadge`, and `labels.rating`/`labels.updated` from the type and both locales. Let typecheck, i18n-parity and data-map-navigation tests guide the change. Split it into two small tasks (rating; updatedAt/badge) so each diff stays single-concern.
- Fix risk: Low; typecheck will point at every consumer. Keep the i18n parity test green when removing the two labels in both locales.
- Verification:
  - refute: CONFIRMED — Neither content file has either key, and items come only from those files. getItemsByCategory reads src/data/items/<categoryId>.json and runs ItemSchema.safeParse on each entry, so nothing else sets `rating` or `updatedAt`. As a result `isRecentlyUpdated` always returns false in production, the 'Updated' badge never renders, and every `rating` branch (ListingCard star, MomentCard label, JSON-LD aggrega…
  - reproduce: CONFIRMED — ItemSchema declares rating (L45) and updatedAt (L53); the only item source is src/data/items/*.json (data.ts L8 dataRoot), and neither moments.json nor phones.json (5 items each) contains either key. So every rating/updatedAt consumer is unreachable with the shipped content. Two details in the evidence are wrong: isRecentlyUpdated is not test-only, since [slug]/page.tsx L56 calls it in production, alth…

### R-217: Dead CSS: `.leaflet-origin-marker` rules for a marker that no longer exists
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/styles/08-vendor.css:L228-L229, L263-L264, L414-L415
- Evidence:

  ```text
  08-vendor.css L228-L229: .leaflet-container-custom .lmk,
  .leaflet-origin-marker .lmk {
  L263-L264: .leaflet-container-custom .lmk[data-type='apartment'],
  .leaflet-origin-marker .lmk {
  L415: [data-theme='dark'] .leaflet-origin-marker .lmk {
  Search: rg -n "leaflet-origin-marker" src --glob '!src/styles/**' → no results (the origin marker was removed in R-022/T21). Full selector scan of src/styles: every other class selector is referenced from TSX or is a vendor (leaflet/rdp) or dynamically composed class (checkin-status-*, moment-card-service-*).
  ```

- Problem: Three selectors target a class that no component emits.
- Impact: None at runtime; small CSS payload and confusion.
- Fix: In src/styles/08-vendor.css, delete the three `.leaflet-origin-marker .lmk` selector lines and turn the preceding selector's trailing comma into the opening brace: L228 `.leaflet-container-custom .lmk {`, L263 `.leaflet-container-custom .lmk[data-type='apartment'] {`, L414 `[data-theme='dark'] .leaflet-container-custom .lmk {`. Check the result by looking at the map page markers (light and dark). Nothing should change visually.
- Fix risk: None.
- Verification:
  - refute: CONFIRMED — The class `leaflet-origin-marker` shows up only in the three CSS selectors. Nothing in the repo generates it. The only code that emitted it was the origin-marker `L.divIcon({ className: 'leaflet-origin-marker', ... })` in LeafletMap.tsx, and commit bd50a80 removed it as part of T21/R-022. PROGRESS.md in that commit says "Removed routing ..., the travel-mode toggle, the origin marker". The current PROGR…
  - reproduce: CONFIRMED — The cited lines are correct. The class `leaflet-origin-marker` appears in only three CSS selectors, and no TSX, TS or JS file emits it. I also looked for dynamically built `leaflet-...` class names and found none. The only Leaflet divIcon class still in use is `leaflet-custom-marker` (LeafletMap.tsx:88). Git history confirms the emitter was removed: commit bd50a80 deletes the line `className: 'leaflet-…

### R-218: Date picker wrapper uses role="application", which switches screen readers out of browse mode
- Severity: Low
- Category: Bug
- Status: CONFIRMED
- Location: src/components/DateRangePicker.tsx:L210
- Evidence:

  ```text
  L210: <div className="relative" role="application" aria-label={dp.calendar}>
    ... L212-L233 two <button> month controls, L235-L249 <DayPicker .../>
  L278-L283: the popover itself is already role="dialog" aria-label={dp.rangePicker}.
  ```

- Problem: `role=application` tells assistive tech that the widget handles all keyboard input itself; screen readers stop announcing structure and users must know the app's own key handling. The wrapper contains ordinary buttons and react-day-picker's own grid; nothing here needs application mode, and the dialog role already labels the popover.
- Impact: Screen-reader users on the home booking bar lose standard navigation inside the calendar (NVDA/JAWS 'forms mode' behaviour), harming the only conversion widget on the home page.
- Fix: Replace `role="application"` with `role="group"` at L210. The label stays valid and the existing `calendar` key stays in use: `<div className="relative" role="group" aria-label={dp.calendar}>`. Alternative: drop both `role` and `aria-label` from the wrapper, and then remove the now-unused `calendar` key at src/i18n/domains/common.ts:L91/L248/L428. Do not keep aria-label on a div with no role (prohibited by ARIA 1.2, flagged by axe `aria-prohibited-attr`). Verify with tests/components/date-range-picker.test.tsx and `npm run typecheck`.
- Fix risk: None; tests/components/date-range-picker.test.tsx does not assert this role.
- Verification:
  - refute: CONFIRMED — Could not refute it. The wrapper around the prev/next month buttons and the react-day-picker grid carries role="application". Nothing in the component needs it: react-day-picker 9.14.0 already renders role="grid"/"gridcell" with its own keyboard handling, and the month buttons are plain <button>s. The popover is already role="dialog" with a name. MDN warns that misusing role=application "can unintentio…  The real impact is smaller than the finding says. The day buttons sit inside a grid, which already puts screen readers into focus mode. The month caption is role="status" aria-live="polite", so month changes are announced anyway. What screen-reader users actually lose is browse-mode reading of the caption and weekday headers inside the wrapper, a nuisance rather than a blocked flow. Low is correct.  The proposed fix is ambiguous and needs correcting. If only role="application" is removed and aria-label={dp.calendar} stays, the result is a named generic <div>, which ARIA 1.2 prohibits. axe-core 4.12.1 (used by `npm run audit:a11y`) checks this with `aria-prohibited-attr`: listProhibitedAttrs returns ['aria-label','aria-labelledby'] for a node with no role. It reports it as needs-review here (not a hard failure) because the subtree has text. `dp.calendar` is used only at L210. The claim that this is "the only conversion widget on the home page" is not verified; I only confirmed the chain DateRangePicker ← SearchBar ← HomeInteractiveBar.
  - reproduce: CONFIRMED — The code claim holds and the line number is exact. The wrapper div at L210 has role="application". It wraps two plain <button> month controls (L212-L233) and a react-day-picker v9.14.0 DayPicker (L235-L249). That library already renders its own semantic structure: role="grid" with aria-multiselectable, an aria-label and labelled weekday headers. It also forwards the aria-label prop to Root. The popover…

### R-219: Two dictionary keys have no reader: `search.addDates` and `house.photoViewer.counter`
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/i18n/domains/common.ts:L31, L181, L361; src/i18n/domains/house.ts:L30, L112, L170
- Evidence:

  ```text
  common.ts L31 (type) / L182 (en) / L362 (el): addDates
  house.ts L30 (type) / L112 (en) / L170 (el): counter: "Currently viewing image {current} of {total}."
  ApartmentGalleryLightbox.tsx L90 builds the counter itself: const counterDisplay = `${numberFormatter.format(index + 1)}/${numberFormatter.format(total)}`;
  Search (node script over all 383 leaf keys of getDictionary('en'), grep -rqE "[.?'\"\[]<lastSegment>\b" src tests --include=*.ts --include=*.tsx --exclude-dir=i18n --exclude-dir=generated): only these two plus `momentTags.military`, which IS used dynamically via `t.momentTags[tag]` (war-museum item tag).
  ```

- Problem: Leftover keys after the R-019 cleanup.
- Impact: None.
- Fix: Delete `addDates` from the type (common.ts:31), en (:181) and el (:361), and delete `counter` from the photoViewer type (house.ts:30), en (:112) and el (:170). Gates: typecheck, and running tests/unit/i18n-parity.test.ts and tests/components/apartment-copy.test.tsx.
- Fix risk: None; tests/unit/i18n-parity.test.ts must still pass.
- Verification:
  - refute: CONFIRMED — Both keys are confirmed to have no reader. `search.addDates` is referenced only by its own three dictionary lines. SearchBar reads five other `t.search.*` keys directly, and nothing reads `t.search` dynamically (no `search[`, spread or Object.keys over it). `photoViewer.counter` is referenced only in house.ts. The only consumer of `photoViewer` is ApartmentGalleryLightbox (via ApartmentCinematic.tsx:17…
  - reproduce: CONFIRMED — Both keys are defined in the type and in both locales, and nothing reads them. addDates appears only in the three dictionary lines. SearchBar reads every other `t.search` key by name and never passes `t.search` as a whole object. The only consumer of `photoViewer` is ApartmentGalleryLightbox (passed from ApartmentCinematic.tsx:177). It reads title, instructions, resetZoom, close, prev, next and thumbna…

### R-220: Two i18n keys have no reader: `search.addDates` and `house.photoViewer.counter`
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/i18n/domains/common.ts:181
- Evidence:

  ```text
  Method: `npx tsx -e` script walking `getDictionary('en')` (383 leaf keys) and regex-searching every leaf's last segment (`.key`, `'key'`, `"key"`) in src/**/*.ts(x) outside src/i18n → 3 candidates. `momentTags.military` is a false positive (read dynamically via `t.momentTags[tagKey]`, MomentCard.tsx:175-176, tag present in moments.json:130). The other two:
    common.ts:31 `addDates: string;` :181 `addDates: "Select your dates"` :361 (el); SearchBar.tsx:186-190 reads arrivalLabel, departureLabel, arrivalPlaceholder, departurePlaceholder, checkAvailability — never addDates; `grep -rn addDates src` → only the three dictionary lines.
    house.ts:30 `counter: string;` :112 `counter: "Currently viewing image {current} of {total}."` :170 (el); the only consumer of `photoViewer` is ApartmentGalleryLightbox.tsx (`labels: LightboxLabels` L12,33), which builds its own `counterDisplay` = `1/8` (L90) and renders that (L273); `grep -n "counter" src/components/ApartmentGalleryLightbox.tsx` → only `counterDisplay`.
  ```

- Problem: Two translated strings (×2 locales) are maintained but never rendered. The lightbox `counter` text looks like an intended screen-reader announcement ("Currently viewing image {current} of {total}") that was never wired.
- Impact: Dead translation upkeep; possibly a lost a11y announcement in the gallery.
- Fix: Merge with index 0 into one finding. Minimal fix: delete both keys from the types and from both locales. Rendering `labels.counter` in an aria-live sr-only element restores a feature that 08ad9bb removed, so propose it separately as an a11y task for the owner to approve, not as part of this cleanup.
- Fix risk: tests/components/i18n-copy.test.tsx snapshots dictionary shape? (it mocks internalFetch only; check it does not enumerate keys). Type change is compile-checked.
- Verification:
  - refute: CONFIRMED — This is the same finding as index 0 (same two keys, same evidence), so it should be merged into one REVIEW.md entry. Every claim checks out: `addDates` exists only in common.ts:31/181/361. `counter` exists only in house.ts:30/112/170. The lightbox renders only its own `counterDisplay` (L90, L273). Nothing reads either dictionary object dynamically. Low is the right severity. On the proposed a11y altern…
  - reproduce: CONFIRMED — This is the same defect as finding 0, and all its line numbers are correct (common.ts 31/181/361, house.ts 30/112/170, ApartmentGalleryLightbox L12/L90/L273). All reads were traced and no reader exists for either key. The a11y point is an interpretation, not a demonstrated regression. The lightbox already has an sr-only instructions paragraph (L270), but no live region announces the current image. No t…

### R-221: Greek booking page shows the English "Kalamata, Greece" although a localized string exists
- Severity: Low
- Category: Bug
- Status: CONFIRMED
- Location: src/app/[locale]/book/page.tsx:L73-L78 (rendered at L100 and L190)
- Evidence:

  ```text
  book/page.tsx L74-L78:
    const property = { name: apartmentContent.name,
      location: `${apartmentContent.location.city}, ${apartmentContent.location.country}`, ... };
  L100: <p ...>{property.name} — {property.location}</p>   L190: <p ...>{property.location}</p>
  apartmentData.ts L13-L16: location: { city: 'Kalamata', country: 'Greece' }  (not per locale; L187 returns it unchanged)
  house.ts L208 already has locationPanel.city: "Καλαμάτα, Ελλάδα" (en L185: "Kalamata, Greece").
  ```

- Problem: On /el/book the header and the property card print "Kalamata, Greece" in English.
- Impact: Visible English leak on the Greek booking page (twice).
- Fix: In src/app/[locale]/book/page.tsx:L76 replace the template literal with `location: t.locationPanel.city,`. English output stays the same. Add a case to tests/components/i18n-copy.test.tsx that renders `await BookingPage({ params: Promise.resolve({ locale: 'el' }), searchParams: Promise.resolve({}) })` and asserts "Καλαμάτα, Ελλάδα" is present and "Kalamata, Greece" is absent. next/dynamic and the map components may need mocking. Do not localize apartmentData.location in this task. Its only other reader is SearchBar.tsx:205's dead `subline ??` fallback.
- Fix risk: None; extend tests/components/apartment-copy.test.tsx or i18n-copy.test.tsx with a /el assertion.
- Verification:
  - refute: CONFIRMED — Confirmed by reading the code. getApartmentContent() returns `data.location` without changing it, and in apartmentData that value is the plain English object {city:'Kalamata', country:'Greece'}, with no per-locale version. The /el booking page therefore prints "Kalamata, Greece" twice: in the header subline (next to the Greek property name) and on the property card. The same page also renders StaticLoc…
  - reproduce: CONFIRMED — I traced every path. getApartmentContent(eff) returns the raw, non-localized data.location object, and book/page.tsx interpolates it into property.location, which is rendered twice. So /el/book always shows "Kalamata, Greece". The localized string already exists in t.locationPanel.city, and LocationPanelDictionary.city is a required string, so the proposed fix type-checks trivially. I did not render th…

### R-222: Optional chains and non-null assertions left on dictionary keys that S6 made required
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/app/[locale]/book/page.tsx:L68-L219; src/app/[locale]/booking-details/page.tsx:L16-L76; src/components/CategoryGridClient.tsx:L139-L195; src/components/StaticLocationMap.tsx:L60-L123; src/app/[locale]/layout.tsx:L52-L53; src/app/[locale]/about/page.tsx:L99-L103; src/app/[locale]/[category]/page.tsx:L21
- Evidence:

  ```text
  src/i18n/dictionaries.ts (after S6a): `house: HouseDictionary; booking: BookingDictionary; ... about: AboutDictionary;` — all required.

  $ grep -rnE "(dictionary|t)\.(about|booking|house|...|moments|updates)\?\.|t\.booking!|\.form!|lp\?\." src  → 40 hits, e.g.
    src/app/[locale]/book/page.tsx:68   validateDateRange(dateRange, eff) : { valid: false, error: t.booking?.selectDatesError }
    src/app/[locale]/book/page.tsx:159  labels={t.booking!.form!}
    src/app/[locale]/book/page.tsx:219  <h4 ...>{t.locationPanel?.title}</h4>
    src/app/[locale]/about/page.tsx:99,103        description: dictionary.about?.metaDescription,
    src/app/[locale]/booking-details/page.tsx:16,72,76  dictionary.booking?.detailsPage?.metaDescription
    src/app/[locale]/layout.tsx:52-53   data-t-update-fromto={t.updates?.fromTo}
    src/app/[locale]/[category]/page.tsx:21   dictionary.moments?.subtitle
    src/components/StaticLocationMap.tsx:60-123  lp?.apartmentTitle … lp?.howToEnableSteps?.map
    src/components/CategoryGridClient.tsx:139-195  t.moments?.searchAndFilter … t.moments?.clearSearch
  ```

- Problem: Το S6b/S6f αφαίρεσαν τα `?.` μόνο όπου υπήρχε literal fallback. Έμειναν ~40 `?.` και δύο `!` (book/page.tsx:159) πάνω σε keys που ο τύπος `Dictionary` ορίζει πλέον ως required. Δεν αλλάζουν συμπεριφορά, αλλά δηλώνουν ψευδώς ότι τα keys μπορεί να λείπουν και κρατούν το πρότυπο που το S6 ήθελε να καταργήσει; τα `!` ειδικά κρύβουν οποιοδήποτε μελλοντικό type error στο `booking.form`.
- Impact: Καθαρά maintainability: ο επόμενος που θα δει `t.booking?.night` θα υποθέσει ότι το key είναι optional και θα ξαναπροσθέσει fallbacks. Καμία επίδραση σε runtime.
- Fix: Do it in two separate patches, one concern each. (a) Mechanical: replace `?.` with `.` on the 40 lines and the 6 `dp?.` reads in src/app/[locale]/booking-details/page.tsx, then change `t.booking!.form!` to `t.booking.form` (book/page.tsx:L159). Run `npm run typecheck`, `npm run lint -- --max-warnings=0` and `npm test`. (b) R-025 residue: make the dictionary-fed props required and delete their English defaults. That covers MomentsToolbar searchAndFilterLabel/searchMomentsLabel/searchPlaceholder/filterByCategoryLabel (and mapLabel/listLabel, which get ui.map/ui.list), EmptyState message/clearLabel, and AmenitiesList showMoreLabel/showLessLabel. First confirm every call site passes them (CategoryGridClient.tsx:L130-L143, L166, L193; book/page.tsx:L207-L212). Then run tests/components/i18n-copy.test.tsx and tests/unit/i18n-parity.test.ts.
- Fix risk: Πολύ χαμηλός; ο compiler πιάνει κάθε λάθος. Να τρέξουν `tests/components/i18n-copy.test.tsx` και `tests/unit/i18n-parity.test.ts`.
- Verification:
  - refute: CONFIRMED — Confirmed. The Dictionary type makes every domain required, and no domain interface has any `?:` field left. So `?.` on these keys changes neither the TS type nor runtime behaviour: TS does not add `undefined` when the receiver is non-nullable. The `t.booking!.form!` assertions are pure no-ops that would hide a future optional-ness. My own grep reproduces exactly 40 matching lines in 7 files. The finde…
  - reproduce: CONFIRMED — The Dictionary type declares house, locationPanel, booking, about, etc. as required, and CommonDictionary declares updates and moments as required objects. BookingDictionary.form is a required BookingFormDictionary. So every `?.` and `!` on these keys is redundant at the type level and does not change runtime behaviour. My grep with the finder's pattern returned exactly 40 hits across the 7 files liste…

### R-223: Hard-coded light-theme utility colors in dark mode (empty-favorites text fails contrast)
- Severity: Low
- Category: Bug
- Status: CONFIRMED
- Location: src/components/FavoritesClient.tsx:L37 (primary); secondary: src/components/SearchBar.tsx:L34-L39, src/components/ResponsiveImage.tsx:L16, src/app/error.tsx:L129,L179,L182 (L169 is development-only)
- Evidence:

  ```text
  FavoritesClient.tsx L37: <div className="text-sm text-gray-600">{emptyLabel}</div>
  Dark page background: 09-utilities.css L97-L99 [data-theme="dark"] .page-container { background: var(--layer-bg-subtle) } = #101a1b (04-theme.css L9). Tailwind gray-600 = #4b5563 → contrast ≈ 2.3:1 (relative luminance 0.087 vs 0.0096), below WCAG AA 4.5:1.
  Other fixed-light classes in the area: SearchBar.tsx L34-L39 (date-picker loading skeleton `bg-white ... border-gray-200`, `bg-gray-100`), ResponsiveImage.tsx L16 (`bg-slate-100` behind hero images), src/app/error.tsx L129 (`bg-blue-600` off-brand button), L169 (`bg-white` pre), L179 (`border-gray-200`), L182 (`text-blue-600`).
  ```

- Problem: These elements ignore the token system (`text-subtle`, `surface-card`, `--layer-surface-alt`) that the rest of the UI uses, so in dark mode they render light boxes / unreadable grey text.
- Impact: The 'No items yet.' message on /favorites is hard to read in dark mode; a white flash box appears while the date picker chunk loads; the root error page looks off-brand.
- Fix: FavoritesClient L37: `text-sm text-gray-600` -> `text-sm text-muted`. Do not use `text-subtle`: 3.66:1 in dark mode, still fails AA. `text-muted` gives 6.91:1 dark, and S8h set this precedent. Treat the secondary items as separate cosmetic tasks. SearchBar skeleton: `surface-card border-soft` with `bg-[var(--layer-surface-alt)]` placeholders. ResponsiveImage: `bg-[var(--layer-surface-alt)]`. error.tsx L182 link: a token-based accent color instead of `text-blue-600` (3.06:1 in dark mode). error.tsx L129: only if a brand match is wanted, use `btn btn-primary min-h-11` as in not-found.tsx, and accept that `.btn-primary`'s !important padding and 38px height change the button's shape. L169 needs no change for production.
- Fix risk: None; light/dark screenshots as in S8 gates.
- Verification:
  - refute: CONFIRMED — Could not refute it. The empty-state text is rendered as a direct child of `.page-container`. In dark mode that container's background is #101a1b. No stylesheet in src/styles or globals.css overrides Tailwind gray/slate/white/blue utilities (grep found no matches). Dark mode is real for users whose OS is set to dark: the inline script in layout.tsx sets data-theme='dark' from prefers-color-scheme. Tail…  Low is the right severity: this is a readability problem on the empty state of one secondary page and has no functional impact.  The proposed fix for the main item is wrong. `text-subtle` in dark mode is --fg-muted (#94a3b8) at opacity .65, which gives 3.66:1 on #101a1b and still fails AA for text-sm. PROGRESS.md S8h already switched away from `text-subtle` for this reason (3.47:1) and used `text-muted`. `text-muted` gives 6.91:1 in dark mode and uses #1f2937 on sand-50 in light mode.  Notes on the secondary items: (a) SearchBar skeleton L34-L39: confirmed `bg-white`/`border-gray-200`/`bg-gray-100`. It is visible only while the ssr:false DateRangePicker chunk loads, so it is a brief flash. (b) ResponsiveImage L16 `bg-slate-100`: only visible before the image paints or if it fails. Cosmetic. (c) error.tsx L169 `bg-white` pre sits inside the `process.env.NODE_ENV === 'development'` block (L151), so it has no production impact. (d) error.tsx L182 `text-blue-600` link: measured 3.06:1 on the dark surface-card, which is a real AA failure the finder did not quantify. (e) error.tsx L129: white on blue-600 is 5.26:1, so the issue is being off-brand, not contrast. Nit. (f) Swapping in `btn-primary` alone changes the button's geometry. 05-primitives.css L1-L17 forces `padding: .5rem 1rem !important`, `height: 38px !important` and a 9999px radius, which overrides `py-3`. The repo's own precedent is not-found.tsx L17 `btn btn-primary min-h-11`.  The root src/app/error.tsx is also a rare path: public pages are caught by src/app/[locale]/error.tsx.
  - reproduce: CONFIRMED — The main claim holds. The empty-favorites text uses Tailwind `text-gray-600`, and no stylesheet overrides `text-gray-*` for dark mode (grep of src/styles and globals.css found none). It renders inside `.page-container`, whose dark background is `--layer-bg-subtle` = #101a1b. I converted Tailwind 4.3.2's real gray-600 value, oklch(44.6% 0.03 256.802), to sRGB and computed a contrast ratio of 2.34:1. Tha…

### R-224: Residual branches, props and defaults that can never take effect (post-cleanup leftovers)
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/app/[locale]/[category]/page.tsx:L21,L41-L52,L91-L92; src/components/CategoryGridClient.tsx:L48-L49,L62-L64,L74-L76,L139-L142,L151-L203; src/components/moments/MomentsDetailLayout.tsx:L1,L4,L114-L125; src/components/Skeleton.tsx; src/components/ListingCard.tsx:L48-L49; src/components/moments/EmptyState.tsx:L10-L12; src/components/moments/MomentsToolbar.tsx:L39-L44; src/components/moments/MomentsFilterMenu.tsx:L60; src/components/AmenitiesList.tsx:L17-L18; src/components/ThemeToggle.tsx:L18-L19; src/app/[locale]/favorites/page.tsx:L26-L31; src/app/[locale]/book/page.tsx:L8,L68-L219; src/components/StaticLocationMap.tsx:L84-L86; src/lib/data.ts:L37,L41
- Evidence:

  ```text
  [category]/page.tsx L41-L44: const isPhones = ...; const isMoments = ...; const useMomentsShell = isPhones || isMoments;  → always true (categories.ts has exactly phones and moments); L48-L52 ternaries carry a dead generic branch.
  CategoryGridClient.tsx L48-L49 props `phonesLayout`/`momentsLayout` are always `isPhones`/`isMoments` of `categorySlug` (page L91-L92); L74-L76 `if (phonesLayout) setShowMap(false)` has no effect (phones branch never reads showMap); L151/L159/L177 double conditions.
  MomentsDetailLayout.tsx L114-L126: <Suspense fallback={<Skeleton/>}> around ResponsiveImage, a synchronous component that never suspends.
  ListingCard.tsx L48-L49: empty <div className="mt-1 ..."></div>.
  English default props no caller relies on: EmptyState.tsx L10-L12, MomentsToolbar.tsx L39-L44, MomentsFilterMenu.tsx L60, AmenitiesList.tsx L17-L18, ThemeToggle.tsx L18-L19, OfflineActions.tsx L4 (retryLabel/homeLabel; root /offline passes none, so English there is intentional).
  favorites/page.tsx L27: `i && typeof i === 'object' ? i as Record<string, unknown> : {}` on an already typed Item.
  book/page.tsx L65-L70/L92-L126 `t.booking?.…` and L159 `t.booking!.form!` after S6 made the domains required.
  StaticLocationMap.tsx L84-L86: `: (<div />)` empty branch.
  data.ts L37/L41 use console.warn while L55 uses logger.warn.
  ```

- Problem: Leftovers from the generic-category UI (R-020), the optional dictionary domains (R-025/S6) and older component APIs remain as always-true conditions, unused defaults and no-op effects.
- Impact: Reading cost and false affordances; no runtime effect.
- Fix: Split into a few small patches with the same concerns as proposed, plus these corrections. (a) Category page and CategoryGridClient: remove `useMomentsShell` and the generic class branches, and keep the moments-shell classes unconditionally. Make pageTitle `t.categories[cat.slug as 'phones'|'moments']`, keeping pageDescription as it is (live for phones). In CategoryGridClient compute `const isPhones = categorySlug === 'phones'; const isMoments = categorySlug === 'moments';` and drop the two props, the single-flag conditions and the phones effect (accepting that a stale `?map=1` then stays in the /phones URL). Drop `?.` on t.categories and t.moments. (b) MomentsDetailLayout: remove Suspense and the Skeleton import AND delete src/components/Skeleton.tsx (no other importer), plus the stale comment at book/page.tsx:L8. (c) Make the label props required and drop the English defaults only for EmptyState, MomentsToolbar, CategoryChips, AmenitiesList and ThemeToggle. For ThemeToggle, update the four `render(<ThemeToggle />)` calls in tests/components/accessibility-interactions.test.tsx to pass lightText/darkText (e.g. 'Light'/'Dark' for en), and keep the `'Dark'` assertion. KEEP the OfflineActions defaults: root /offline relies on them. (d) Remove the `?.`/`!` on required domains in all remaining places, not just book/page.tsx L65-L159: book L206-L219, [category] L21, booking-details L16/L72/L76, about L99/L103, [locale]/layout L52-L53. (e) Remove the favorites cast (`pickLocale(i, ...)`). (f) Replace `: (<div />)` with `: null`. (g) Use logger.warn at data.ts L37/L41, with structured fields instead of the raw err object. (h) ListingCard's empty div: remove it only after a visual check, or replace it with the equivalent spacing, because it currently adds about 0.4rem at the bottom of the favorites cards. Gates: typecheck, lint --max-warnings=0, check:dead-code (knip), tests/components/accessibility-interactions and i18n-copy, and an SSR/visual diff of /en and /el for phones, moments, book, favorites and a moments detail page (no component tests cover most of these files).
- Fix risk: Low; typecheck + tests/components (i18n-copy, accessibility-interactions) cover these components.
- Verification:
  - refute: CONFIRMED — This is a set of leftover dead code items with no functional effect. It does not repeat a recorded finding: R-020 (T19) and S6a-g are DONE, and these are what they left behind. None of the items is on the PROGRESS.md 'Declined (do not redo)' list, whose R-102 nits cover `slug ?? toSlug`, not these. Most sub-claims hold, but the finding needs five corrections. (1) The OfflineActions defaults are in use:…
  - reproduce: CONFIRMED — The main claim holds. src/data/categories.ts:L3-L6 defines exactly two categories (phones, moments), and page.tsx:L36-L37 calls notFound() for any other slug. So `useMomentsShell` (L43) is always true and the generic arms of the ternaries at L48-L51 can never run. The `phonesLayout`/`momentsLayout` props are always derived from `categorySlug` (page L90-L92, the only caller), so the `categorySlug === 'x…

### R-225: Production `scriptSrc` carries `'unsafe-inline'` that `buildCSPDirective` removes on every response; the comment describing static pages is wrong
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/security-config.ts:L146-L148
- Evidence:

  ```text
  src/lib/security-config.ts:L146-L148,L160
    // unsafe-inline remains as fallback for static localized pages that cannot
    // receive a per-request nonce. Nonce-enabled routes strip it in buildCSPDirective.
    scriptSrc: ["'self'", "'unsafe-inline'"],
    ...
    useNonce: true,

  src/lib/security-middleware-edge.ts:L83-L86
    let csp = buildCSPDirective(
      this.config.csp.directives,
      this.config.csp.useNonce ? nonce : undefined,
    );

  src/lib/security-config.ts:L219-L221
    const sourcesWithNonce = directive === 'scriptSrc' && nonce
      ? [...sources.filter((source) => source !== "'unsafe-inline'"), `'nonce-${nonce}'`]
      : sources;

  src/app/layout.tsx:L34-L36
    const requestHeaders = await headers();
    const locale = normalizeLocale(requestHeaders.get('x-locale'));
    const nonce = requestHeaders.get('x-nonce') ?? undefined;
  ```

- Problem: In production `useNonce` is always true and the proxy runs for every matched path, so the filter on L220 removes `'unsafe-inline'` from `script-src` on every response; the entry is never emitted. The comment's premise (static localized pages without a nonce) is also false: the root layout calls `headers()`, which makes every page dynamic and nonce-capable.
- Impact: No runtime effect today, but a reader (or a future refactor that flips `useNonce` or moves the filter) reintroduces `'unsafe-inline'` into the enforced policy believing it is a deliberate fallback. Misleading security configuration in the file that defines the CSP contract.
- Fix: Delete `"'unsafe-inline'"` from `productionConfig.csp.directives.scriptSrc` and the two comment lines; keep the filter in `buildCSPDirective` (development still lists `'unsafe-inline'` without a nonce).
- Fix risk: None: the emitted production header is byte-identical. `tests/security/csp-osrm-origin.test.ts` and the F4 smoke check the nonce path, not the config literal.
- Verification:
  - refute: CONFIRMED — In production `useNonce` is true and `generateNonce()` always returns a string, so `buildCSPDirective` always receives a nonce and removes `'unsafe-inline'` from script-src. The proxy matcher `/((?!_next|.*\..*).*)` sends every page through `SecurityHeadersMiddleware.handle`, which generates a nonce on each request. Paths the matcher excludes (dotted and `_next`) get no CSP from the proxy at all, and `…
  - reproduce: CONFIRMED — Production config lists 'unsafe-inline' in scriptSrc with a comment calling it a fallback for static pages. The only CSP producer is SecurityHeadersMiddleware.applyCspHeaders, which production always calls with a nonce: useNonce is true, and generateNonce always returns a non-empty 32-hex string, so buildCSPDirective filters 'unsafe-inline' out of script-src on every response. grep found no other CSP s…

### R-226: CORS preflight advertises `Authorization` and `X-API-Key`, headers no route reads (no API keys, cookie auth only)
- Severity: Low
- Category: Legacy
- Status: CONFIRMED
- Location: src/lib/security-config.ts:L129,L191
- Evidence:

  ```text
  src/lib/security-config.ts:L191
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-API-Key'],
  src/lib/security-config.ts:L129 (development)
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],

  $ grep -rni "x-api-key\|headers.get('authorization')" src
  src/lib/security-config.ts:191
  src/lib/redaction.ts:110:const SENSITIVE_HEADER_NAMES = new Set(['forwarded', 'x-api-key']);

  CLAUDE.md (API route conventions): "Routes authenticate with the admin or guest session cookies. There are no API keys."
  ```

- Problem: The allow-list is served on every `/api/*` OPTIONS response (`security-middleware-edge.ts:L152`). Nothing consumes `Authorization` or `X-API-Key`; the redaction set keeps a matching leftover. `X-Requested-With` is allowed only in development and `Idempotency-Key` (really used by `booking-requests`) only in production, so the two environments do not even agree.
- Impact: Advertises authentication mechanisms that do not exist, contradicting the documented convention; harmless to browsers but misleading to anyone auditing the API surface from the wire.
- Fix: Set `cors.allowedHeaders` to `['Content-Type', 'Idempotency-Key']` in both the development and production configs. Leave `SENSITIVE_HEADER_NAMES` in redaction.ts as it is: it redacts any client-sent X-API-Key in request logs, which is defense-in-depth independent of CORS.
- Fix risk: None: the site is same-origin; `ALLOWED_ORIGINS` is optional and no cross-origin client exists in the repository.
- Verification:
  - refute: CONFIRMED — No code in src reads an inbound `Authorization` or `X-API-Key` header, and `X-Requested-With` appears only in the development CORS list. The `Authorization` matches are outbound (bookingOutbox, operationalMonitor) or redaction lists. `Idempotency-Key` is read by `booking-requests` and sent by `BookingForm`. That fetch is same-origin, so browsers send no preflight for it; the allow-list matters only for…
  - reproduce: CONFIRMED — Production preflight advertises Authorization and X-API-Key, and handlePreflight emits them on every /api/* OPTIONS response except the two health probes. No route reads either request header. The only 'authorization' reads in src are outbound headers on webhooks (bookingOutbox.ts:L97, operationalMonitor.ts:L98) and redaction lists. Idempotency-Key is really used (booking-requests/route.ts:L81, Booking…

### R-227: HSTS is sent with `includeSubDomains; preload` for two years from an app whose hostname and subdomain layout are operator-supplied
- Severity: Low
- Category: Security
- Status: SUSPECTED
- Location: src/lib/security-config.ts:L164-L169
- Evidence:

  ```text
  src/lib/security-config.ts:L164-L169
    hsts: {
      enabled: true,
      maxAge: 63072000, // 2 years
      includeSubDomains: true,
      preload: true,
    },
  src/lib/security-middleware-edge.ts:L57-L62 → `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

  $ grep -rn "Strict-Transport\|HSTS\|preload" docs deploy scripts/README.md
  docs/deployment/production-image-smoke.md:34 (smoke only checks that HSTS is present)
  ```

- Problem: `includeSubDomains` is applied by browsers to every subdomain of the served host for two years on first contact, and `preload` signals eligibility for the Chromium preload list (which requires the *apex* domain to be submitted with `includeSubDomains`). Nothing in the repository states whether the production hostname is the apex or a subdomain, or whether other subdomains (mail, a booking widget, a future admin host) must remain reachable over plain HTTP. No document records the decision.
- Impact: If the operator ever runs another service on a subdomain without TLS, browsers that visited the guide will refuse it for up to two years with no server-side remedy; if the domain is submitted to the preload list, this becomes practically irreversible. For a single-property host with one hostname this is likely harmless, but it is a long-lived commitment made silently by application code rather than by the ingress (Cloudflare Free can set HSTS with the same flags, where the operator sees it).
- Fix: Set `preload: false` in `productionConfig.headers.hsts` and keep HSTS emitted by the app (the smoke check at scripts/smoke-production-image.ts:L232 and validate-security require it). Keep or drop `includeSubDomains` only after the owner confirms apex vs subdomain and that every subdomain serves HTTPS. Record the decision in docs/architecture/deployment-target.md next to the open hostname item.
- Fix risk: Lowering the header on an already-visited host does not shorten existing browser pins until `max-age` elapses; changing it is safe only before first production traffic.
- To confirm (SUSPECTED only): Ask the owner for the production hostname (apex or subdomain) and any other DNS records under the domain; check whether the domain is on hstspreload.org.
- Verification:
  - refute: SUSPECTED — Production HSTS is emitted by the app, and the canonical hostname is officially undecided: the ADR lists 'the canonical production hostname' as still requiring evidence, and Nginx uses the `__PRODUCTION_HOSTNAME__` placeholder. No document in docs/ records an HSTS or preload decision. hstspreload.org confirms the finder's point: sending the `preload` directive counts as requesting inclusion, and anyone…
  - reproduce: SUSPECTED — The header value is as described. Production emits `max-age=63072000; includeSubDomains; preload`, and no tracked file records the hostname, the subdomain layout or any preload intent: git grep finds HSTS only in the config, the smoke 'present' check, validate-security.ts and PROGRESS.md notes. Whether this is a real risk depends on the production domain (apex or subdomain, other HTTP-only subdomains,…

### R-228: CORS preflight advertises methods and headers the API does not have; `SecurityEvent.userAgent` is never set
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/security-config.ts:L128,L190,L279; src/lib/security-monitoring.ts:L150-L159
- Evidence:

  ```text
  security-config.ts:190-191 `methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS']`, `allowedHeaders: ['Content-Type','Authorization','Idempotency-Key','X-API-Key']`, emitted by security-middleware-edge.ts:151-152. Route methods actually exported: `grep -rhoE "export (async )?(function|const) (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b" src/app/api | sort | uniq -c` → GET 9, POST 18, PATCH 2, HEAD 2; no PUT/DELETE. `grep -rni "x-api-key\|authorization" src` → no route reads either header (CLAUDE.md: "There are no API keys"). security-config.ts:279 `userAgent?: string` on `SecurityEvent`; the only producer that could set it (`handleCSPViolation`, security-monitoring.ts:150-159) receives `{ ip }` only (csp-report/route.ts:59-61) and `sanitizeEvent` drops the field anyway (L59-73).
  ```

- Problem: The public preflight response claims a larger surface than exists, and the event type carries a field that by policy ("never persist user agents") must never be filled.
- Impact: Cosmetic/security hygiene: attackers learn nothing true, defenders may believe an Authorization/API-key path exists. Dead field invites someone to fill it.
- Fix: Merge the allowedHeaders part into finding index 1. Keep two small tasks: (1) CORS methods: `methods: ['GET', 'POST', 'PATCH', 'OPTIONS']` in production; the development list `['GET','POST','PUT','DELETE','OPTIONS']` at L128 should match, since it omits PATCH, which the routes use. (2) Remove `userAgent?: string` from `SecurityEvent` (security-config.ts:L279), and from `handleCSPViolation` remove the `userAgent?` member of its `request` parameter type (security-monitoring.ts:L152) and the `userAgent: request.userAgent,` line (L159). No test changes are needed.
- Fix risk: tests/security may assert the preflight header strings (`grep -rn "Access-Control-Allow-Headers" tests`); update expectations. Browser CORS is only relevant for same-origin here, so no client breaks.
- Verification:
  - refute: CONFIRMED — Each part holds. (a) Route handlers export GET (9), POST (18), PATCH (2) and HEAD (2); no route exports PUT, DELETE or OPTIONS (no re-export or destructured export patterns either), yet the production preflight advertises PUT and DELETE. (b) `SecurityEvent.userAgent` is only ever set from `handleCSPViolation`'s `request.userAgent`. The only caller passes `{ ip }`, and `sanitizeEvent` rebuilds the event…
  - reproduce: CONFIRMED — Production preflight methods include PUT and DELETE, but src/app has no PUT or DELETE handler. Handlers exported: GET, POST, PATCH, HEAD. There are no re-export forms and no occurrence of PUT/DELETE anywhere under src/app/api. The allowedHeaders part is the same as finding 1 (merge them). SecurityEvent.userAgent (L279) is filled only by handleCSPViolation from its request parameter, and the only caller…

### R-229: `RateLimitError`, the `Retry-After` branch, `rateLimitConfig` and the limiter's `remaining`/`resetAt` fields have no caller; the rate-limiting doc describes a header that is never sent
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/lib/apiErrorHandler.ts:L127-L148, L213-L216, L225-L228, L375-L378; src/lib/sensitiveRateLimit.ts:L7-L12, L79-L80 (optional part)
- Evidence:

  ```text
  $ grep -rn "RateLimitError\|Retry-After\|\.resetAt\|\.remaining" src | grep -v "src/lib/apiErrorHandler.ts\|src/lib/sensitiveRateLimit.ts"
  (no output)
  $ grep -rn "rateLimitConfig" src tests
  src/lib/apiErrorHandler.ts:213:  rateLimitConfig?: {
  src/lib/apiErrorHandler.ts:225:  rateLimitConfig: {

  src/lib/apiErrorHandler.ts:L375-L378
    // Provide Retry-After for rate limit errors when available
    if (error instanceof RateLimitError && typeof error.details?.retryAfter === 'number') {
      headers['Retry-After'] = String(error.details.retryAfter);
    }

  Every limited route throws the plain form, e.g. src/app/api/portal/claims/route.ts:L43
    if (!rateLimit.allowed) throw new ApiError(ApiErrorCode.RATE_LIMITED, 'Too many claim attempts');

  docs/security/layered-rate-limiting.md:L37-L38
    A `Retry-After` header is emitted only where the layer has a deterministic reset contract.
  ```

- Problem: `RateLimitError` is defined (L128-L148) but never constructed anywhere in `src/`, so the `instanceof RateLimitError` branch and `Retry-After` emission are unreachable; `DEFAULT_CONFIG.rateLimitConfig` (L225-L228) is merged and never read; `RateLimitDecision.remaining`/`resetAt` (`sensitiveRateLimit.ts:L7-L12,L76-L81`) are computed on every call and never read by the eight callers. The doc implies a `Retry-After` on the PostgreSQL layer, which has a deterministic `resetAt`, yet the app never emits it.
- Impact: Dead code in the central error handler that a maintainer must reason about, and a documentation claim that does not hold: clients receive 429 without `Retry-After` even though the reset time is known.
- Fix: Minimal fix:
- Delete `RateLimitError` (L127-L148) and the `Retry-After` block (L375-L378).
- Delete `rateLimitConfig` from both `ErrorHandlerConfig` (L213-L216) and `DEFAULT_CONFIG` (L225-L228). Both must go together because of `Required<ErrorHandlerConfig>`.

Optional, as a separate step:
- Drop `remaining`/`resetAt` from `RateLimitDecision`, and update rate-limit-persistence.test.ts:L108-L114 plus the mocks in portal-sign-in-rate-limit.test.ts:L39 and claim-token-transport.test.ts:L99.
- Clarify the doc sentence ("no 429 currently carries Retry-After").

Option (b), actually emitting `Retry-After`, is a behaviour change that needs owner approval. Through the handler branch it would cover only 4 of the 7 limited routes; admin/login, booking-requests and csp-report build their own 429s.
- Fix risk: (a): none at runtime. (b): changes 429 response bodies (`details.limit/windowMs/retryAfter`), which `tests/routes/portal-sign-in-rate-limit.test.ts` and the admin login form may assert on.
- Verification:
  - refute: CONFIRMED — The core claim holds. `RateLimitError` is a non-exported class (so it cannot be used from outside the module) and nothing constructs it anywhere in the repo. That makes the `instanceof RateLimitError` / `Retry-After` branch unreachable. `rateLimitConfig` is only declared (L213-L216) and defaulted (L225-L228); the only `mergedConfig.*` reads are requestTimeoutMs, enableRequestLogging, maxRequestBodySize…  Parts that need correcting: (1) The finder's grep was case-sensitive and reported "no output", but a lowercase `retry-after: '1'` exists at src/app/api/portal/refresh/route.ts:L52. That is a 409 for a concurrent refresh, not a rate-limit response, so it does not refute the finding. (2) There are 7 limiter call sites, not 8. Only 4 of them throw `ApiError(RATE_LIMITED)` (portal/sessions L48, claim-exchange L46, claims L43, errors L41). admin/login L33-L35, booking-requests L122 and csp-report L46 return a hand-built 429 `NextResponse`. So option (b) could not reach those 3 routes through the handler branch. (3) `remaining`/`resetAt` are unread by production callers but asserted in tests: rate-limit-persistence.test.ts:L108-L114 checks `toEqual({allowed:false, limit:3, remaining:0, resetAt: secondReset})`, and portal-sign-in-rate-limit.test.ts:L39 and claim-token-transport.test.ts:L99 build them in mocks. Removing them is a test change, not a free deletion. (4) The doc sentence (layered-rate-limiting.md:L37-L38) is conditional ("emitted only where the layer has a deterministic reset contract"). It never says the PostgreSQL layer emits the header, so it is vague rather than false.  Severity Low is right: no runtime effect.
  - reproduce: CONFIRMED — The dead-code part holds. `RateLimitError` (src/lib/apiErrorHandler.ts:L128-L148) is not exported: the export list is L19, 65, 104, 195, 207, 234, 446, 473 and 533. It is never constructed anywhere, so the only other reference, the `instanceof` check at L376 that emits Retry-After, can never be true. `rateLimitConfig` appears only at its declaration (L213-L216) and its default (L225-L228) and is never…

### R-230: `enableRequestLogging` is never enabled, so the request-logging branch and `redactHeaders` have no production caller; the trusted-ingress consumer table documents a disabled path
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/lib/apiErrorHandler.ts:L9, L210, L222, L258-L265; src/app/api/errors/route.ts:L79; src/lib/redaction.ts:L110-L119; tests/security/header-redaction.test.ts:L6-L34; docs/security/trusted-ingress.md:L27
- Evidence:

  ```text
  $ grep -rn "enableRequestLogging" src
  src/lib/apiErrorHandler.ts:208:  enableRequestLogging?: boolean;
  src/lib/apiErrorHandler.ts:222:  enableRequestLogging: false,
  src/lib/apiErrorHandler.ts:259:      if (mergedConfig.enableRequestLogging) {
  src/app/api/errors/route.ts:79:  enableRequestLogging: false,

  $ grep -rn "redactHeaders" src tests
  src/lib/apiErrorHandler.ts:9:import { redactHeaders } from './redaction';
  src/lib/apiErrorHandler.ts:263:          headers: redactHeaders(request.headers),
  src/lib/redaction.ts:113:export function redactHeaders(headers: Headers): Record<string, string> {
  tests/security/header-redaction.test.ts

  docs/security/trusted-ingress.md:L27
    | request logging in `apiErrorHandler` | sanitized request headers | Operational diagnostics | Redact all public forwarding headers and both private headers |
  ```

- Problem: The default is `false`, the only explicit setting is also `false`, so `logger.info('API request started', { headers: redactHeaders(...) })` never runs. `redactHeaders` (and `SENSITIVE_HEADER_NAMES` in `redaction.ts:L110`) exist only to satisfy `tests/security/header-redaction.test.ts`. The docs list this as a live consumer of the identity boundary.
- Impact: Maintenance surface with a false sense of coverage: the redaction test passes while nothing in production ever logs headers, and the contract table misdescribes what the app does.
- Fix: - Remove `enableRequestLogging` from `ErrorHandlerConfig` (L210) and `DEFAULT_CONFIG` (L222).
- Remove the branch at L258-L265 and the `redactHeaders` import (L9).
- Remove `enableRequestLogging: false,` at src/app/api/errors/route.ts:L79.
- Delete `redactHeaders` and `SENSITIVE_HEADER_NAMES` from redaction.ts (L110-L119).
- Delete only the first `it` block of header-redaction.test.ts (L6-L34), keeping the `isSensitiveFieldName` it.each at L36-L44.
- Drop row L27 of docs/security/trusted-ingress.md.

Then re-run typecheck, knip and coverage.
- Fix risk: None at runtime. `knip` and the coverage `include` list (`src/lib/redaction.ts`) need re-running after the deletion.
- Verification:
  - refute: CONFIRMED — The claim holds. `enableRequestLogging` defaults to false (L222), and its only explicit setting is also false (src/app/api/errors/route.ts:L79). So the L259-L265 branch, the only production call of `redactHeaders`, never runs.  Git history explains why: the last caller that enabled it (src/app/api/metrics/route.ts, `enableRequestLogging: true`) was deleted in the cleanup commit bd50a80.  Not a duplicate. PROGRESS.md:L282 (task C6 for R-049) merged `sanitizeRequestHeaders` into `redactHeaders` and describes it as "used by `apiErrorHandler`", but it missed that the call site is unreachable. Nothing was declined.  The doc row at trusted-ingress.md:L27 describes a consumer that no longer runs.  Corrections to the fix: (1) Do not delete the whole test file. header-redaction.test.ts:L36-L44 tests `isSensitiveFieldName`, which production uses in security-monitoring.ts:L26. Only the first `it` block (L6-L34) goes. (2) The explicit `enableRequestLogging: false` at errors/route.ts:L79 must also be removed. Otherwise the excess-property check on the object literal breaks typecheck. (3) The "enable behind LOG_LEVEL=debug" alternative is new behaviour, not a minimal fix, and needs owner approval.  Severity Low is right.
  - reproduce: CONFIRMED — `enableRequestLogging` defaults to false (L222). Its only explicit setting, src/app/api/errors/route.ts:L79, is also false, so the branch at L258-L265 cannot run with the current callers. `redactHeaders` is called only from L263 and from tests/security/header-redaction.test.ts, and `SENSITIVE_HEADER_NAMES` (redaction.ts:L110) is used only inside `redactHeaders` (L116). trusted-ingress.md:L27 lists 'req…

### R-231: `withErrorHandler` carries a configuration surface nobody uses (`rateLimitConfig` never read, request logging never enabled) and unused error codes
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/lib/apiErrorTypes.ts:L12,L15,L22,L24; src/lib/apiErrorHandler.ts:L31,L37,L49,L53,L57,L60,L177,L458 (config and logging parts: see findings 0 and 1)
- Evidence:

  ```text
  apiErrorHandler.ts:213-216 `rateLimitConfig?: { windowMs; maxRequests }` and :225-228 default; `grep -rn rateLimitConfig src tests` → only these two places, never read. :259-265 `if (mergedConfig.enableRequestLogging) { … redactHeaders(request.headers) }`; the only caller that sets the option sets it to false (src/app/api/errors/route.ts:79), so `redactHeaders` (redaction.ts:113) runs only in tests/security/header-redaction.test.ts. createSuccessResponse :454-459 always emits `version: '1.0', processingTime: 0 // Would be calculated by middleware`; `grep -rn "processingTime\|\.meta\b" src` → no reader. apiErrorTypes.ts:12,15,22,24 `METHOD_NOT_ALLOWED`, `RATE_LIMIT_EXCEEDED` ("Alias"), `NOT_IMPLEMENTED`, `DATABASE_ERROR`: `grep -rhoE "ApiErrorCode\.[A-Z_]+" src tests | sort | uniq -c` lists none of them; they appear only in the status map (:49,53,57,60).
  ```

- Problem: Dead knobs and codes in the central error module: an options object whose members are never varied, a rate-limit config that no code path consumes, a header-redaction path that production can never reach, a fabricated `processingTime` in every success response, and four error codes with no producer.
- Impact: Readers must trace six options and a status map to learn that the wrapper is effectively fixed-configuration; the `meta` block ships a false value to clients on every success.
- Fix: Merge the `rateLimitConfig` / `enableRequestLogging` parts into findings 0 and 1.

For the parts only this finding covers:
- Remove the four codes from apiErrorTypes.ts together with their `ERROR_STATUS_MAP` entries (L49, L53, L57, L60). Optionally also remove the now-unused `HttpStatusCodes.METHOD_NOT_ALLOWED`/`NOT_IMPLEMENTED` (L31, L37).
- Drop only `processingTime` from `ApiResponse.meta` (L177) and `createSuccessResponse` (L458).
- Keep `meta.version`, which api-boundaries.test.ts:L88-L96 asserts, unless the owner decides to drop it and update that test.
- Fix risk: tests/security/api-boundaries.test.ts passes `enableErrorLogging`/`enablePerformanceLogging`/`requestTimeoutMs` (L102-160) — keep those three. Any client reading `meta.correlationId` (none found) would be unaffected if `correlationId` stays.
- Verification:
  - refute: CONFIRMED — About half of this finding repeats sibling findings 0 (`rateLimitConfig`) and 1 (`enableRequestLogging`/`redactHeaders`), so it should be merged with them. Neither of those is an R-id, so the duplicate field stays empty.  The parts only this finding covers are confirmed: - The four codes `METHOD_NOT_ALLOWED`, `RATE_LIMIT_EXCEEDED`, `NOT_IMPLEMENTED` and `DATABASE_ERROR` have no producer or consumer. A repo-wide git grep finds them only in apiErrorTypes.ts and the status map. `userFacingErrors.ts` does not reference them either. - `processingTime: 0` is a fabricated value with no reader.  Corrections: (1) "an options object whose members are never varied" is wrong. src/app/api/errors/route.ts:L80-L81 varies `maxRequestBodySize` and `requestTimeoutMs`, and tests set `enableErrorLogging`/`enablePerformanceLogging`. Only 2 of the 6 options are dead, so the impact is overstated. (2) The fix to drop `version` or the whole `meta` block breaks a test the fix_risk does not mention. tests/security/api-boundaries.test.ts:L88-L96 ("creates versioned success envelopes") asserts `meta: expect.objectContaining({ correlationId: 'correlation-1', version: '1.0' })`. `version` is a tested response contract; only `processingTime` is safe to drop without an owner decision. (3) Removing the codes from apiErrorTypes.ts requires removing their `ERROR_STATUS_MAP` entries in the same change. After that, `HttpStatusCodes.METHOD_NOT_ALLOWED`/`NOT_IMPLEMENTED` (L31, L37) are unused too.  Client impact of the fake `processingTime` is nil because nothing reads `meta` (PwaManager.tsx:L120 reads a service-worker message, not an API response). Low stands; the meta part alone is closer to Nit.
  - reproduce: CONFIRMED — Every claim was reproduced. rateLimitConfig at L213-L216 and L225-L228 is never read, and enableRequestLogging is never true (errors/route.ts:79 sets it to false). These two parts overlap with findings 0 and 1 and should be merged or cross-referenced so the same issue is not recorded twice. The new material also holds. createSuccessResponse (L454-L459) always sends `version: '1.0'` and `processingTime:…

### R-232: A mismatched `ORIGIN_PROXY_SHARED_SECRET` is logged as `reason: 'sentinel'`, indistinguishable from an upstream that sent the literal `unknown`
- Severity: Low
- Category: Error handling
- Status: CONFIRMED
- Location: src/lib/net/clientIdentity.ts:L13-L18, L103-L109; tests/security/client-identity.test.ts:L57-L69
- Evidence:

  ```text
  src/lib/net/clientIdentity.ts:L51-L55 (contract)
    * Only the bounded rejection reason is logged (warn level), so a missing or
    * misconfigured trusted-ingress hop, or a local run without
    * `npm run dev:proxy`, is diagnosable next to the access-log line.

  src/lib/net/clientIdentity.ts:L99-L109
    if (rawSource !== null && canonicalizeClientIp(rawSource) === null) { ... }
    const selected = getClientIp(request);          // 'unknown' when the attestation does not match
    const canonical = canonicalizeClientIp(selected);
    if (!canonical) {
      throw new ClientIdentityUnavailableError(
        selected === 'unknown' && rawSource === null ? 'sentinel' : unavailableReason(selected),
      );
    }

  src/lib/net/clientIdentity.ts:L79-L81
    function unavailableReason(value) {
      if (value === null || value === '') return 'missing';
      if (value.toLowerCase() === 'unknown') return 'sentinel';

  src/lib/net/getClientIp.ts:L60-L62
    const attestation = request.headers.get(ORIGIN_PROXY_ATTESTATION_HEADER);
    if (!validAttestation(attestation)) return 'unknown';
  ```

- Problem: Trace for a rotation mistake (Nginx renders the new secret, the app still has the old one): attestation is non-empty and comma-free (L93-L98 pass), `rawSource` is a valid IP (L99 skipped), `getClientIp` returns `'unknown'` because `timingSafeEqual` fails, `canonical` is null, `rawSource !== null` so the ternary falls to `unavailableReason('unknown')`, which returns `'sentinel'`. The enum has no value for "attestation present but rejected".
- Impact: During the coordinated rotation described in `docs/security/trusted-ingress.md:L41-L45` every sensitive route returns 503 and the only application-side diagnostic says `sentinel`, pointing the operator at the IP header rather than at the secret. Fail-closed behaviour is correct; only the diagnosability promise on L51-L55 is not met.
- Fix: Add 'attestation_rejected' to ClientIdentityUnavailableReason and replace the ternary at L106-L108. Once L99 has passed, a non-null rawSource is a valid IP, so a null canonical can only come from a rejected attestation:

  if (!canonical) {
    throw new ClientIdentityUnavailableError(
      rawSource === null ? 'sentinel' : 'attestation_rejected',
    );
  }

This keeps the current 'sentinel' when the IP header is absent, so behaviour does not change there. It needs no export of validAttestation and no second getClientIp call. Regression test: in client-identity.test.ts, extend 'rejects a valid private IP paired with the wrong attestation' to also expect reason: 'attestation_rejected'. That assertion fails before the change, where the reason is 'sentinel'. Optionally make the L51-L55 doc comment mention the secret mismatch.
- Fix risk: `tests/security/client-identity.test.ts` asserts specific reasons for its cases; the new branch only changes the wrong-secret case. The reason string reaches logs only (never the response).
- Verification:
  - refute: CONFIRMED — The finding's trace holds. With a comma-free, non-empty attestation that does not match the secret and a valid IP in X-Origin-Verified-Client-IP, the checks at L93-L98 pass and L99 is skipped. getClientIp then returns 'unknown' because validAttestation fails (getClientIp.ts L62). canonical is null and rawSource is not null, so the ternary calls unavailableReason('unknown'), which returns 'sentinel'. Th…  There is also a related redundancy. getClientIp only ever returns a canonical IP or 'unknown', so every throw at L106-L108 gets 'sentinel' from both branches of the ternary. After L99 has passed, rawSource !== null together with canonical === null can only mean the attestation was rejected: it mismatched, was longer than 128 characters, or the app has no secret set.  This is not a duplicate. R-114 (fixed in A10) changed the log to warn level with the bounded reason, and nothing in REVIEW.md or PROGRESS.md covers how fine-grained the reason is. Fail-closed behaviour is correct, nothing leaks, and the public 503 does not change. Only the diagnostic promised in the L51-L55 doc comment is wrong. Rotation is rare for a single operator, and the trusted-ingress doc already says a mismatch produces a 503. A dev-proxy and app secret mismatch in development also logs 'sentinel'. So Low is the right severity.  The proposed fix is more than it needs to be. validAttestation does not have to be exported, and getClientIp does not need to be called a second time. The fix-risk note is also overstated. The only test that asserts a reason builds the error by hand with 'missing' (client-identity.test.ts L87-L91). The wrong-attestation test (L57-L69) checks only the code, and no test asserts 'sentinel' from requireCanonicalClientIp.
  - reproduce: CONFIRMED — Traced every path and ran it. When the attestation header is present but does not match (e.g. a rotation mismatch), and the IP header is valid, L93-L101 all pass. getClientIp returns 'unknown' (getClientIp.ts:L62). canonicalizeClientIp('unknown') is null, and because rawSource !== null the ternary at L107 calls unavailableReason('unknown'), which returns 'sentinel' (L81). An upstream that sends the lit…

### R-233: `api-security-middleware` repeats the checks `readJsonBody` performs on the same request (content-type, content-length) with a third body-size ceiling
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/api-security-middleware.ts:L10-L40; src/lib/security-config.ts:L69-L74,L133-L138,L195-L200,L275; 10 call sites under src/app/api/{portal,check-in,admin}; docs/security/trusted-ingress.md:L24
- Evidence:

  ```text
  src/lib/api-security-middleware.ts:L11-L36
    const contentLengthHeader = request.headers.get('content-length');
    ... if (!Number.isSafeInteger(contentLength) || contentLength < 0) → 400
    ... if (contentLength > this.config.maxPayloadSize) → 413
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const mediaType = (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
      ... if (!allowed) → 415

  src/lib/apiErrorHandler.ts:L478-L491 (readJsonBody)
    const mediaType = (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
    if (!allowedMediaTypes.includes(mediaType)) throw new ApiError(UNSUPPORTED_MEDIA_TYPE ...)   // 415
    ... if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) throw BAD_REQUEST          // 400
    ... if (parsedLength > maxBytes) throw PAYLOAD_TOO_LARGE                                    // 413

  src/lib/apiErrorHandler.ts:L268-L276 (withErrorHandler, a third content-length check, 1 MB)

  All ten call sites run the guard and then a body reader in the same handler, e.g. src/app/api/portal/claims/route.ts:L32-L35
    const early = await createAPISecurityMiddleware()(request);
    if (early) return early;
    const parsed = schema.safeParse(await readJsonBody(request, 16 * 1_024));
  ```

- Problem: Three layers (`apiSecurity.inputValidation` 512 KB/1 MB, `withErrorHandler.maxRequestBodySize` 1 MB, `readJsonBody(maxBytes)` 4–16 KB) enforce the same header checks with the same status codes; only `readJsonBody` also counts the streamed bytes, which is the one check that matters. The guard's sole extra effect is a `logSecurityDiagnostic` warn line. Routes that never read a body (`admin/check-in-requests` GET, `admin/guests` GET) call the guard for a content-length check on GET.
- Impact: Two extra modules (`api-security-middleware.ts`, the `apiSecurity` section of `security-config.ts`) and 10 call sites to keep consistent for no additional protection; the differing limits (512 KB vs 1 MB vs per-route) invite the question of which one is authoritative.
- Fix: Delete src/lib/api-security-middleware.ts, the `apiSecurity` type and blocks in src/lib/security-config.ts (L69-L74, L133-L138, L195-L200) and the `'api_security_violation'` union member (L275), and remove the guard/early lines at all 10 call sites. Keep readJsonBody/validateRequestBody as the only body contract. Also:
(1) Pass an explicit small maxBytes (for example `4 * 1_024`) to the three default-limit validateRequestBody calls (check-in/arrival-request:L72, check-in/preferences:L126, admin/check-in-requests/[id]:L41). This keeps them no looser than the current 512 KB production ceiling and matches the other routes.
(2) O11 kept the content-type violation log. Either keep it by adding a `logSecurityDiagnostic` call in withErrorHandler's ApiError branch for UNSUPPORTED_MEDIA_TYPE/PAYLOAD_TOO_LARGE (that branch has the NextRequest that getClientIp needs; readJsonBody only has a `Request`), or get the owner's explicit OK to drop it.
(3) Retarget tests/security/security-diagnostics.test.ts:L34-L47 to a real route (for example POST portal/claims with text/plain: expect 415, the JSON error envelope and no $transaction) so the R-116 regression check survives, and drop the vi.mock in portal-sign-in-rate-limit.test.ts:L12.
(4) Remove the api-security-middleware row from docs/security/trusted-ingress.md:L24.
Expected changes: unauthenticated requests with the wrong content type get 401/403 before 415 on the 7 authenticated routes, and 413/415 bodies become the ApiError JSON envelope. Gates: typecheck, lint, knip, the full test suite.
- Fix risk: `tests/security/security-diagnostics.test.ts` (415 case) and the `vi.mock('@/lib/api-security-middleware')` in `tests/routes/portal-sign-in-rate-limit.test.ts` must be updated; the 413/415 responses change from plain text to the `ApiError` JSON envelope, which `internalFetch` callers already handle.
- Verification:
  - refute: CONFIRMED — The redundancy is real and I found no earlier record of it. All 10 call sites are inside withErrorHandler. Of those, the 8 mutation handlers call readJsonBody or validateRequestBody afterwards, which repeats the guard's content-type check (415) and content-length check (400/413) with the same logic and the same ['application/json'] list, and also counts the streamed bytes. The 2 GET handlers never read…  Not a duplicate. R-032 (fixed in S4) removed only the always-true `enabled` flag. R-116 (fixed in A11) stopped the DB writes. Review-1 R-0xx removed only the API-key parts. Neither the Declined list nor O11 covers this redundancy.  Corrections to the finding: (1) The evidence says 'All ten call sites run the guard and then a body reader'. That holds for 8 of the 10; the two GETs do not read a body (the Problem text itself says so). (2) withErrorHandler does not repeat 'the same header checks'. It only has a `parseInt(content-length) > 1 MB` check, with no content-type check and no invalid-length check.  Behaviour changes the fix_risk leaves out: (a) Production size ceiling. arrival-request, preferences and admin check-in-requests/[id] call validateRequestBody with the default maxBytes of 1 MB. In production the guard held them at 512 KB, so removing it raises their ceiling to 1 MB. All three are behind authentication, so the impact is negligible. (b) Status order. On the 7 routes that authenticate before reading the body, an unauthenticated request with the wrong content type now gets 401/403 instead of 415. The 3 portal routes are unchanged because readJsonBody follows the guard immediately. (c) The warn line. O11 (confirmed by the owner) says content-type violations are logged, not persisted. Deleting the guard silently drops that log unless it is moved. The suggested new home, readJsonBody, takes a plain `Request`, but `getClientIp` requires a `NextRequest`. So the log would be easier to keep in withErrorHandler's ApiError branch, which currently logs 4xx only at debug level. (d) The fix leaves out docs/security/trusted-ingress.md:L24 and the `'api_security_violation'` union member at security-config.ts:L275. (e) The 415 test in security-diagnostics.test.ts is the regression test for R-116 ('no database write'). It should be retargeted to a route, not deleted.  Severity: Low fits. This is a cleanup with no security or correctness gain, on a single-apartment deployment.
  - reproduce: CONFIRMED — Line numbers are correct. The guard's content-length check (400 for an invalid value, 413 over the limit) and its content-type check (415 on POST/PUT/PATCH) repeat what readJsonBody does in apiErrorHandler.ts:L478-L491. validateRequestBody delegates to readJsonBody at L538. All 8 body-reading call sites run the guard and then readJsonBody or validateRequestBody inside the same withErrorHandler handler.…

### R-234: Prisma shutdown/auto-disconnect behaviour is decided by substring matching on `process.argv` (`/-e/`, `/next/`), which any path containing those characters flips
- Severity: Low
- Category: Maintainability
- Status: CONFIRMED
- Location: src/lib/prisma.ts:L150-L157, L231-L256
- Evidence:

  ```text
  src/lib/prisma.ts:L150-L157
    const longRunningHints =
      Boolean(process.env.NEXT_RUNTIME) ||
      process.argv.some((arg) => /next|turbo|node-dev|tsx-dev|--watch/.test(arg));
    // Added check for command line execution to avoid hanging processes
    const isCommandLineExecution = process.argv.some((arg) =>
      /tsx|-e|--eval/.test(arg)
    ) && !longRunningHints;

  src/lib/prisma.ts:L159-L165
    const shouldAutoDisconnectOnIdle = autoDisconnectEnv === 'true' ? true : autoDisconnectEnv === 'false' ? false : !longRunningHints;

  node_modules/next/dist/build/define-env.js:80
    'process.env.NEXT_RUNTIME': isEdgeServer ? 'edge' : isNodeServer ? 'nodejs' : '',   // inlined in the web bundle → longRunningHints true there

  .env.example:41
    PRISMA_AUTO_DISCONNECT=false
  ```

- Problem: `/-e/` is an unanchored regex: `process.argv[1]` is an absolute script path, so any checkout under e.g. `/srv/site-env/` or a flag such as `--enable-source-maps` marks the process as "command line" and skips the SIGTERM/SIGINT hooks; `/next/` matches any directory named `next-*`. The worker bundles (`node dist/workers/drain-outbox.mjs`) have no `NEXT_RUNTIME` and no matching argv, so they fall back to the 200 ms idle auto-disconnect unless `PRISMA_AUTO_DISCONNECT=false` is present in the production env file; `deliverOutboxEvent` performs its webhook `fetch` (`bookingOutbox.ts:L98`) between queries, so with the default each delivery pays a disconnect/reconnect.
- Impact: Behaviour of connection lifecycle depends on deployment paths and env-file completeness rather than on an explicit contract. In the current Docker images (`/app/...`, `scripts/start-standalone.mjs server.js`) the heuristics happen to resolve correctly; a moved checkout or an omitted `PRISMA_AUTO_DISCONNECT` line changes them silently (workers: reconnect churn per event; web: hooks skipped would only matter for `beforeExit` logging since the container is killed anyway).
- Fix: No separate task. Fold this into finding index 1: delete `longRunningHints`/`isCommandLineExecution` together with the idle-disconnect machinery and register the `beforeExit`/signal hooks unconditionally. Drop the `--enable-source-maps` example and the per-delivery reconnect claim from the write-up.
- Fix risk: Ad-hoc `tsx -e` one-liners would then keep the process alive up to `idleTimeoutMillis` (300 s) unless they call `$disconnect()`; document that (they already must for the workers).
- Verification:
  - refute: CONFIRMED — The mechanism exists: hook registration and the idle-disconnect default for non-Next processes depend on unanchored regexes over process.argv. Most of the claimed impact does not hold, though. (1) Web process: argv plays no part. Next inlines `process.env.NEXT_RUNTIME` as 'nodejs' into the Node server bundle for webpack and for Turbopack (the Turbopack path also goes through `getDefineEnv`). So `longRunningHints` is always true, `isCommandLineExecution` is always false, the hooks are always registered and the idle disconnect is off. A checkout under `/srv/site-env/` cannot skip the web's hooks. (2) The `--enable-source-maps` example is wrong. Node options, including `-e`/`--eval`, go to `process.execArgv`, not `process.argv`. So `/-e|--eval/` cannot even detect a real `node -e`; it only fires on accidental substrings in the script path or script arguments. This makes the heuristic more fragile than the finder said, but also shows the branch is dead for its stated purpose. (3) Docker workers run at fixed paths (`WORKDIR /app`, `node dist/workers/*.mjs`). No `-e` or `next` substring appears, so production resolves deterministically, as the finding itself concedes. (4) "Each delivery pays a disconnect/reconnect" is wrong. `disconnecting` latches true on the first idle cleanup and is never reset, and `scheduleIdleDisconnect` returns early after that. So there is at most one idle disconnect per worker process. The next query reconnects lazily, the ClientEngine goes from 'disconnected' to connect, and the adapter creates a new Pool. (5) Skipping the signal hooks on a flipped non-Next dev run only loses the graceful `$disconnect`. Node's default SIGTERM/SIGINT action still terminates the process. What remains is a maintainability smell with no production consequence. Its fix (deleting `longRunningHints`/`isCommandLineExecution` and registering the hooks unconditionally) is entirely contained in finding index 1's fix, which deletes L150-229 except the signal hooks. Merge the two into one task rather than counting them twice. There is no existing R-id: R-126 (workers not exiting, fixed by B9) is a different defect.
  - reproduce: CONFIRMED — The core claim holds. Shutdown and auto-disconnect behaviour depends on unanchored substring matches over process.argv, so a checkout path that contains '-e' (for example /srv/site-env) or 'next' changes behaviour for the worker bundles. I demonstrated this above. Several details in the finding are wrong, though. (1) The `--enable-source-maps` example is wrong: Node flags land in process.execArgv, not…

### R-235: Prisma idle auto-disconnect machinery (+2 env keys) is unreachable-by-design in every configured runtime; workers disconnect explicitly
- Severity: Low
- Category: Overengineering
- Status: CONFIRMED
- Location: src/lib/prisma.ts:L148-L229 (plus the `if (!isCommandLineExecution)` wrapper at L231-L232); src/lib/runtime-env-schema.js:L71-L72; .env.example:L41-L42; scripts/drain-outbox.ts:L9-L10; scripts/run-operational-maintenance.ts:L12-L13; scripts/README.md:L214-L215
- Evidence:

  ```text
  prisma.ts:150-165 decides `shouldAutoDisconnectOnIdle` from `PRISMA_AUTO_DISCONNECT`, `NEXT_RUNTIME` and argv sniffing (`/next|turbo|node-dev|tsx-dev|--watch/`, `/tsx|-e|--eval/`); :167-169 `PRISMA_IDLE_DISCONNECT_MS`; :198-229 timer + `$on('query')` hooks. Runtime facts: the Next server always has `NEXT_RUNTIME` set → `longRunningHints` true → idle disconnect off; both workers end with an explicit `prisma.$disconnect()` (scripts/drain-outbox.ts:9-17 comment: "Close the pool explicitly: with PRISMA_AUTO_DISCONNECT=false (.env.example)…", run-operational-maintenance.ts:12-20); .env.example:41-42 sets `PRISMA_AUTO_DISCONNECT=false`, `PRISMA_IDLE_DISCONNECT_MS=200`; docker/docker-compose.prod.yml and Dockerfile.security set neither (grep `PRISMA` → only `PRISMA_HIDE_UPDATE_MESSAGE`), and docs/ never mention the key (`grep -rn PRISMA_AUTO docs` → none). Also prisma.ts:39-80 subscribes to every `query` event (`log: [{emit:'event', level:'query'}]` L95-98) to regex-classify queries and warn when `duration > 1000`.
  ```

- Problem: About 80 lines of environment sniffing exist to solve a problem (short-lived scripts hanging on the pg pool) that the workers now solve directly. In the only place where the default would actually engage — a production worker whose APP_ENV_FILE does not copy `PRISMA_AUTO_DISCONNECT=false` — the 200 ms idle timer fires during the webhook `fetch` between two DB calls; the adapter then ends the pool and `connect()` builds a new `pg.Pool` on the next query (node_modules/@prisma/adapter-pg/dist/index.mjs:751-752), so it does not fail, it just churns connections. The query-event instrumentation adds per-query event payload construction for a slow-query warning that `statement_timeout`/`query_timeout` (prismaPgConfig.ts:11-12) already bound.
- Impact: Two env keys operators must know, argv heuristics that break on the next runner change, and per-query overhead — for a one-apartment site with minutes-apart worker runs.
- Fix: One task, one concern (it also resolves finding index 0).
1. prisma.ts:
   - Delete L150-L157 (argv heuristics), L159-L169 (env parsing) and L172-L173 (`cleanupTimer`, `observedActivity`).
   - Delete the timer-clear at L192-L195 and L198-L229 (`scheduleIdleDisconnect`, `markActivity`, the `$on` hooks).
   - Delete `clientWithEvents` at L148, which becomes unused.
   - Register the `beforeExit` and signal hooks unconditionally by dropping the `if (!isCommandLineExecution)` wrapper.
2. Remove `PRISMA_AUTO_DISCONNECT` and `PRISMA_IDLE_DISCONNECT_MS` from runtime-env-schema.js:L71-L72 and .env.example:L41-L42. This is safe for existing env files because z.object strips unknown keys.
3. Reword the two worker comments and scripts/README.md:L214-L215 to say the explicit `$disconnect` is what lets the run exit (idle pool timeout 300 s).
4. In the same task, drop the now-meaningless `PRISMA_AUTO_DISCONNECT` lines from scripts/smoke-production-image.ts:L181 and the 12 integration tests. These are optional but keep the repo consistent.
5. Leave `addPrismaInstrumentation` and the `query` log level (L39-L80, L97) untouched; that is a separate concern.
Gates: typecheck, `lint --max-warnings=0`, `check:dead-code`, `npm test`, tests/unit/worker-disconnect.test.ts, `validate:release-policy` + `test:release-policy`. Also time a local `outbox:drain` with PRISMA_AUTO_DISCONNECT unset to confirm it still exits in about 1 s.
- Fix risk: tests/security or scripts/tests may pin the env keys (`test:runtime-credentials`, release-policy markers): run `validate:release-policy` and `test:release-policy`. Manual `tsx scripts/drain-outbox.ts` still exits because of the explicit `$disconnect`.
- Verification:
  - refute: CONFIRMED — Mostly confirmed as over-engineering, with one factual correction and one added risk. Correction: the machinery is not "unreachable in every configured runtime". The web never engages it, because NEXT_RUNTIME is inlined (see index 0). The documented production workers do engage it. - The runbook tells operators to fill APP_ENV_FILE from "Required runtime configuration", and that section does not list PRISMA_AUTO_DISCONNECT. - The compose file and the Dockerfile set no PRISMA_AUTO_* variable. - Only `.env.example`, the smoke script and the integration tests set it to 'false'. So a runbook-following production outbox/operations worker runs with the 200 ms idle disconnect ON, and the smoke test does not exercise that default. Because `disconnecting` latches, this happens at most once per worker run, and the next query reconnects through a new pg.Pool. Plain churn is negligible for a same-host PostgreSQL. Added risk, SUSPECTED and not reproduced: in Prisma 7.8.0, `$disconnect` leads to `executor.disconnect()`, which first calls `cancelAllTransactions()` and rolls back open interactive transactions. `drainOutbox` delivers with concurrency 5. The idle timer is armed off query events and does not track open transactions. If it fires while another delivery is inside its post-webhook `$transaction` (bookingOutbox.ts:L106), that transaction is rolled back. The event then goes down the catch path and is retried after a successful webhook: a duplicate delivery, which the receiver can dedupe by Idempotency-Key. A query that already holds the old executor could also hit the ended pool. The window is a few milliseconds, once per run. To confirm: a worker run with PRISMA_AUTO_DISCONNECT unset, a webhook stub that answers in about 190-200 ms, and several PENDING events. This does not raise the severity above Low, but it is a concrete reason to remove the default rather than keep it. The explicit `$disconnect()` in both workers (B9) makes the idle timer unnecessary. Only these two scripts import the Prisma singleton. No unit test covers prisma.ts lifecycle code, and prisma.ts is not in the coverage include list. Removing the two schema keys is safe for existing env files that still contain them. `runtimeEnvSchema` is a plain `z.object` (zod 4.4.3, no `.strict()`), which strips unknown keys, so neither `start-standalone.mjs` nor `env.ts` would fail closed. The release policy does not pin these keys. The fix's risk list misses these leftover references: 12 integration test files, `scripts/smoke-production-image.ts:L181` and `scripts/README.md:L214-L215`. They are harmless once the keys are gone, but they belong to the cleanup. The optional removal of the query-event subscription is a separate concern and should not be bundled. Its justification is also weak: the 20 s/25 s statement/query timeouts do not replace a 1 s slow-query warning.
  - reproduce: CONFIRMED — The overengineering claim holds. The idle-disconnect machinery existed so that short-lived scripts would not hang on the pg pool. Both workers now call prisma.$disconnect() in finally, and the web server never enables it (NEXT_RUNTIME is inlined). So the ~70 lines and 2 env keys are redundant. The title's 'unreachable-by-design in every configured runtime' overstates it, and the finding's own problem t…

### R-236: The `no-internal-fetch` rule matches only string literals, so concatenated or template URLs bypass it; one bypass already exists
- Severity: Low
- Category: Maintainability
- Status: CONFIRMED
- Location: scripts/eslint-rules/internal-fetch.js:L7-L13
- Evidence:

  ```text
  scripts/eslint-rules/internal-fetch.js:L7-L11
    if (node.callee.type === 'Identifier' && node.callee.name === 'fetch') {
      const arg = node.arguments[0];
      if (arg && arg.type === 'Literal' && typeof arg.value === 'string') {
        const v = arg.value;
        if (v.startsWith('/')) {

  $ grep -rn "fetch(" src | grep -v "src/lib/" | grep -v internalFetch
  src/components/StatusCluster.tsx:102:        await fetch('/app.webmanifest?probe=' + Date.now(), {

  CLAUDE.md: "The custom lint rule `internal-fetch/no-internal-fetch` forbids `fetch('/...')` to internal routes outside `src/lib/`. It is a warning, but the release gate lints with `--max-warnings=0`."
  ```

- Problem: A `BinaryExpression` (`'/x' + y`) or `TemplateLiteral` (`` `/api/...${q}` ``) is not a `Literal`, so the rule is silent for exactly the dynamic URLs that are most common. `StatusCluster.tsx:L102` is a live example that passes `lint --max-warnings=0` today (it targets a static asset, so no harm, but it demonstrates the gap). Also, `filename.includes('/src/lib/')` never matches on Windows paths.
- Impact: The release gate believes it enforces "all internal calls go through a lib helper", but any new route call written with a template literal bypasses it unnoticed.
- Fix: Optional, owner's call, low value. In the rule, also report when the argument is a TemplateLiteral whose `quasis[0].value.cooked` starts with '/', or a BinaryExpression with operator '+' whose left-most operand is a string Literal starting with '/'. Optionally also cover a MemberExpression callee `window.fetch` / `globalThis.fetch`. Drop the Windows `path.sep` normalisation: it is irrelevant on macOS and Linux, and on Windows it causes over-reporting, not a bypass. After the change, StatusCluster.tsx:L102 will warn and break `--max-warnings=0`. Do not route it through internalFetch, because that would call logger.error on every offline probe. Use a justified `// eslint-disable-next-line internal-fetch/no-internal-fetch -- static-asset connectivity probe` (needs owner approval), or accept the limitation and document it in CLAUDE.md as 'literal URLs only'.
- Fix risk: `StatusCluster.tsx:L102` will then warn; either move the probe into `internalFetchClient` or add a one-line justified `eslint-disable-next-line` (needs owner approval per CLAUDE.md).
- Verification:
  - refute: CONFIRMED — The core claim holds and I reproduced it. The rule only inspects `arg.type === 'Literal'` with an `Identifier` callee named `fetch`. So `'/x' + y`, template literals (even `` `/api/x` `` with no substitutions) and `window.fetch('/api/x')` are never reported. StatusCluster.tsx:L102 is a real instance that passes `lint --max-warnings=0` today. No prior R-id covers this rule; REVIEW.md and PROGRESS.md men…  Severity calibration: the gap has no security or correctness consequence. The helper the rule pushes callers towards (src/lib/internalFetchClient.ts) only adds console logging, via the browser-only logger-client, and an explicit `credentials: 'same-origin'`, which is already the Fetch default. A bypass therefore loses only client console logging, so Low is right, bordering on Nit. Nobody outside src/lib currently bypasses the rule for an internal API route: the only non-lib `fetch(` in src is the static-asset probe.  The Windows part of the finding is miscalibrated. With backslash paths, `filename.includes('/src/lib/')` is false, so the rule would over-report inside src/lib; it would not create a bypass. The owner runs macOS locally and Linux in Docker, so the `path.sep` normalisation is unneeded churn and should be dropped from the fix.  On the proposed fix risk: moving the StatusCluster probe into internalFetch would make internalFetchClient.ts:L41-L44 call `logger.error('internalFetch failed')` on every failed probe while offline (every 15s, pollMs default at StatusCluster.tsx:L10). That is console noise. If the rule is extended, the better handling for that line is a justified disable, which needs owner approval.
  - reproduce: CONFIRMED — The rule reports only when the first argument of `fetch` is a string `Literal` that starts with '/', so template literals and string concatenations never match. I confirmed this by running ESLint with the repo config on a probe file: of three internal fetches, only the plain literal warned. The live bypass at StatusCluster.tsx:L102 passes `--max-warnings=0` (exit 0). It fetches a static asset, not an A…

### R-237: `NEXT_PUBLIC_BUILD_VERSION` is read but set nowhere, so every stored client error report has `buildVersion: undefined`
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/lib/errorReporting.ts:L70 (reader); docker/Dockerfile.security:L3-L8 (builder stage never sets the variable)
- Evidence:

  ```text
  src/lib/errorReporting.ts:L70
    buildVersion: process.env.NEXT_PUBLIC_BUILD_VERSION,
  src/app/api/errors/route.ts:L70
    buildVersion: report.context.buildVersion,

  $ grep -rn "NEXT_PUBLIC_BUILD_VERSION" . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git
  ./src/lib/errorReporting.ts:70   (only reader; not in Dockerfile.security, docker-compose.prod.yml, .env.example, runtime-env-schema.js or any script)

  scripts/generate-version.ts:L15-L21 already derives `build = GIT_COMMIT.slice(0,12)` into public/version.json at build time.
  ```

- Problem: `NEXT_PUBLIC_*` values are inlined at `next build`; the build (Dockerfile.security L3-L8) passes `NEXT_PUBLIC_SITE_URL` and `GIT_COMMIT` but never this variable, so the field is always `undefined` on the client and `null` in `security_audit_events.details`.
- Impact: The one piece of context that lets an operator tell whether a client error comes from the current or a stale (service-worker-cached) bundle is missing from every stored report.
- Fix: Make a one-line change in the builder stage of docker/Dockerfile.security, after `ENV GIT_COMMIT=${GIT_COMMIT}` (L8): `ENV NEXT_PUBLIC_BUILD_VERSION=${GIT_COMMIT}`. This is the 40-hex commit, within the 50-character server limit. Alternatively, trim it to the same 12-character id as version.json with a next.config.ts `env: { NEXT_PUBLIC_BUILD_VERSION: process.env.GIT_COMMIT?.slice(0, 12) }` entry. That variant also covers local `npm run build` when GIT_COMMIT is set. Do not read /version.json at runtime: it reports the server's current build, not the bundle's. Do not add the key to runtime-env-schema.js either, since it is a build-time inline. The other acceptable minimal option is to delete buildVersion from ErrorContext, errorReporting.ts:L70/L87 and the route schema/details (route.ts:L24,L70). Verify with the existing tests/routes/client-error-report.test.ts plus an assertion on the stored details.buildVersion when the env is stubbed.
- Fix risk: Docker layer cache: a new build arg changes the builder stage inputs only when the commit changes, which is already the case for `GIT_COMMIT`.
- Verification:
  - refute: CONFIRMED — The claim holds. The only reader of NEXT_PUBLIC_BUILD_VERSION is src/lib/errorReporting.ts:L70, and nothing sets it. The Docker builder stage passes only NEXT_PUBLIC_SITE_URL and GIT_COMMIT as build args and ENV. scripts/docker-build.sh passes the same two --build-arg values, next.config.ts has no `env` mapping, and .dockerignore excludes .env.* from the image build. So the inlined value is always unde…  One detail in the finding is wrong. The value is not stored as `null`. The client's JSON.stringify drops the undefined key, so the POST body has no buildVersion, and the server writes `buildVersion: undefined` into details (route.ts:L70). I did not check whether Prisma then omits the key or stores null. Either way the stored report has no build id.  This is not a duplicate. The earlier R-028 (removed REVIEW.md, visible in `git show e19facc`) listed "NEXT_PUBLIC_BUILD_VERSION is set nowhere" as supporting evidence. Its Batch A fix, marked done in the old PROGRESS.md, deliberately kept reportError and its context and did not address this field. So this is a leftover of that fix, not a finding that was already fixed or declined. The current REVIEW.md (R-104 and later) does not mention it.  Severity stays Low. No application code reads client.error details (grep finds only the writer at route.ts:L58). The operator would query the database by hand, and Next's content-hashed chunk names in fileName/stack already partly identify the bundle.  The proposed fix needs correcting. Its second option, reading public/version.json at runtime, is wrong for the stated purpose. PwaManager fetches /version.json with `cache: 'no-store'` (PwaManager.tsx:L26), so that approach returns the build currently deployed on the server, not the build of the running (possibly stale) bundle. It also adds a network call to the error path. Adding the key to runtime-env-schema.js is also unnecessary, because the value is inlined into the client bundle at build time and never read from the server's runtime environment.
  - reproduce: CONFIRMED — The only reader of NEXT_PUBLIC_BUILD_VERSION is src/lib/errorReporting.ts:L70. Nothing in the repo sets it: no Dockerfile ARG/ENV, no .env.example entry, no runtime-env-schema key, no script, and next.config.ts has no `env` mapping. The builder stage sets only NEXT_PUBLIC_SITE_URL and GIT_COMMIT, so the build inlines the value as undefined. The client then sends no buildVersion, the route's optional zo…

### R-238: Four `ApiErrorCode` members (`METHOD_NOT_ALLOWED`, `RATE_LIMIT_EXCEEDED`, `NOT_IMPLEMENTED`, `DATABASE_ERROR`) are never thrown
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/lib/apiErrorTypes.ts:L12,L15-L16,L22,L24; src/lib/apiErrorHandler.ts:L31,L37,L49,L53,L57,L60
- Evidence:

  ```text
  $ for c in ...; do grep -rn "ApiErrorCode\.$c\b\|ErrorCodes\.$c\b" src tests | grep -v "src/lib/apiErrorHandler.ts\|src/lib/apiErrorTypes.ts" | wc -l; done
  METHOD_NOT_ALLOWED 0
  RATE_LIMIT_EXCEEDED 0
  NOT_IMPLEMENTED 0
  DATABASE_ERROR 0
  (BAD_REQUEST 2, UNAUTHORIZED 19, FORBIDDEN 10, NOT_FOUND 22, CONFLICT 11, VALIDATION_ERROR 12, RATE_LIMITED 6, PAYLOAD_TOO_LARGE 2, UNSUPPORTED_MEDIA_TYPE 1, INTERNAL_ERROR 2, SERVICE_UNAVAILABLE 3, GATEWAY_TIMEOUT 3, EXTERNAL_SERVICE_ERROR 1)

  src/lib/apiErrorTypes.ts:L15-L16
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    RATE_LIMITED: 'RATE_LIMITED', // Alias
  ```

- Problem: The four codes exist only in the enum and in `ERROR_STATUS_MAP` (`apiErrorHandler.ts:L44-L62`); the two rate-limit names are duplicates of each other. The `X-Error-Code` header and JSON `error.code` are a client-visible contract, so unused members widen it for nothing. Dynamic use was ruled out: the codes are only ever produced via `new ApiError(ApiErrorCode.X, …)` and the string values appear nowhere else in `src/` or `tests/` (`grep -rn "'RATE_LIMIT_EXCEEDED'\|'DATABASE_ERROR'\|'NOT_IMPLEMENTED'\|'METHOD_NOT_ALLOWED'" src tests` → only the enum file).
- Impact: Small: an enum and a status map that document error codes the API never emits.
- Fix: In apiErrorTypes.ts, remove METHOD_NOT_ALLOWED, RATE_LIMIT_EXCEEDED, NOT_IMPLEMENTED and DATABASE_ERROR, and drop the `// Alias` comment on RATE_LIMITED. In apiErrorHandler.ts, remove the four matching ERROR_STATUS_MAP rows (L49, L53, L57, L60) and the HttpStatusCodes entries METHOD_NOT_ALLOWED: 405 (L31) and NOT_IMPLEMENTED: 501 (L37), which become unreferenced. Gates: `npm run typecheck` (the exhaustive Record<ApiErrorCode, number> catches any drift), lint, knip, and tests/unit/core-utilities.test.ts, which uses only retained codes.
- Fix risk: TypeScript will flag any remaining reference; none exist per the grep.
- Verification:
  - refute: CONFIRMED — I tried to refute this and could not. The four members appear in only two places: the enum and the rows of ERROR_STATUS_MAP. I ruled out dynamic use. No code enumerates the codes (no Object.values/keys/entries on ApiErrorCode or ErrorCodes). Every `new ApiError(` call, including the multi-line ones, passes an `ApiErrorCode.X` or `ErrorCodes.X` literal, since grep found none of the four anywhere else. T…
  - reproduce: CONFIRMED — I checked the enum members, the status-map rows, and every code path that could produce an ApiErrorCode. The four codes are real members of the ApiErrorCode enum (METHOD_NOT_ALLOWED at L12, RATE_LIMIT_EXCEEDED at L15, NOT_IMPLEMENTED at L22, DATABASE_ERROR at L24). Apart from those declarations, they appear only in the HttpStatusCodes constant and ERROR_STATUS_MAP in apiErrorHandler.ts. Every `new ApiE…

### R-239: Release policy validates copies of its own inputs: duplicated environment/gate/image constants and exact package-script pins are tautologies
- Severity: Low
- Category: Redundant
- Status: SUSPECTED (verifiers disagreed; see Verification)
- Location: scripts/lib/release-policy.mjs:L12-L56, L332-L344
- Evidence:

  ```text
  scripts/lib/release-policy.mjs:12-13
  const EXPECTED_POSTGRES_IMAGE =
    'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';
  scripts/lib/release-gates.mjs:3-4
  export const APPROVED_POSTGRES_IMAGE =
    'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';

  release-policy.mjs:17-56 (EXPECTED_HOSTILE_INTEGRATION_ENVIRONMENT, EXPECTED_SYNTHETIC_PRODUCTION_ENVIRONMENT) are byte-for-byte copies of release-gates.mjs:6-45, compared with JSON.stringify at L336-343.
  release-policy.mjs:110-141 EXPECTED_GATE_PROFILE duplicates RELEASE_GATES (release-gates.mjs:57-110) and is compared at L306-330.
  release-policy.mjs:143-176 EXPECTED_PACKAGE_SCRIPTS pins 32 package.json script strings verbatim (`if (scripts[name] !== expected) errors.push(...)`, L353-355).

  docs/release-verification.md:185-188 (digest update procedure): "Update the constants in tests/integration/support/postgres-image-policy.ts, both Docker Compose files, scripts/lib/release-gates.mjs, the independent expectation in scripts/lib/release-policy.mjs, affected fixtures, and this documentation in one reviewed diff."
  ```

- Problem: About 165 lines of the policy check that a constant equals a second copy of the same constant kept in a neighbouring file. Whoever changes one must change the other in the same commit; nothing independent is verified (the same person edits both, as the docs themselves note at L208-209). The exact script pins force a policy edit for any harmless change to `test`, `lint`, `build` or `typecheck` while the FORBIDDEN_DEPLOY_COMMANDS scan (L236-258, L375-395) already covers the actual risk (a deploy/push/migrate hidden in a script).
- Impact: Operator time on every dependency, script or image change (the digest bump alone touches 6 places), with no added safety. The S3 task already replaced line/column pins with content checks; these remaining copies are the same category.
- Fix: Keep EXPECTED_PACKAGE_SCRIPTS and EXPECTED_GATE_PROFILE, per the O3/S3 decision. Only if the owner wants to drop the change detector: (1) replace EXPECTED_POSTGRES_IMAGE with the imported APPROVED_POSTGRES_IMAGE at L18, L463 and L474, so the compose and integration-policy checks stay; (2) delete EXPECTED_HOSTILE_INTEGRATION_ENVIRONMENT, EXPECTED_SYNTHETIC_PRODUCTION_ENVIRONMENT, deriveExpectedNonProductionCredential and validateControlledEnvironments; (3) update releasePolicyInternals.expectedPostgresImage and the digest-procedure line in docs/release-verification.md:L185-L188. This is an owner decision, not a defect fix.
- Fix risk: Low: policy tests that assert 'must be exactly' messages (release-policy.test.mjs:1724-1731, 1821-1828, 1848-1855) must be rewritten to assert the semantic rejection instead. Run `validate:release-policy` + `test:release-policy`.
- Verification:
  - refute: CONFIRMED — The duplication exists as described. EXPECTED_POSTGRES_IMAGE and the two EXPECTED_* environment objects are byte-for-byte copies of the exports of release-gates.mjs. validateControlledEnvironments only compares each pair, so it acts as a change detector: it catches an edit to one file but not a matching edit to both. The finding overstates the rest, though. (1) The package-script and gate-profile pins…
  - reproduce: REFUTED — The duplicated constants exist as described: EXPECTED_POSTGRES_IMAGE and the two EXPECTED_* environments at L12-L56 copy release-gates.mjs:L3-L45, and EXPECTED_GATE_PROFILE at L110-L141 mirrors RELEASE_GATES. The core claim does not hold. The finding says the checks are tautologies ('nothing independent is verified', 'no added safety') and that the forbidden-deploy scan already covers the risk. (1) EXPEC…

### R-240: `scripts/lib/release-policy.mjs` pins source text of application files (36 `includes()` checks, 47 package-script strings) — a 4,300-line policy+test pair that breaks on ordinary edits
- Severity: Low
- Category: Overengineering
- Status: SUSPECTED
- Location: scripts/lib/release-policy.mjs:L544-L554, L605-L616, L813-L876, L2249-L2320 (application-source pins); EXPECTED_PACKAGE_SCRIPTS L143-L176 is out of scope (kept per S3/O3)
- Evidence:

  ```text
  release-policy.mjs:2309-2316:
    if (!adminAuth?.includes("readRuntimeCredential('ADMIN_JWT_SECRET')")) { errors.push(…) }
    if (!guestAuth?.includes("readRuntimeCredential('GUEST_JWT_SECRET')")) …
    if (!adminLogin?.includes("readRuntimeCredential('ADMIN_DASH_SECRET')")) …
  Similar substring pins at :544-554 (runtime schema and clientIdentity source), :605-615 (`readiness?.includes('return databaseReady();')`, `limiter?.includes('prisma.$transaction')`, `retention?.includes('prisma.rateLimit.deleteMany')`), :834-835, :873-874. Counts: `grep -c "includes(" scripts/lib/release-policy.mjs` → 36; `wc -l` → 2,391 lines + scripts/tests/release-policy.test.mjs 1,956 lines; `EXPECTED_PACKAGE_SCRIPTS` pins 47 npm script strings (awk over the array → 47 quoted entries). PROGRESS.md records the cost: Group B gate failed at gate 1/30 because two fixture line numbers moved ("two positional secret-fixture pins moved (33→34, 215→219)"), C2 moved a pin "149 → 139", and S3 was a whole task to replace line/column pins with content pins. The earlier review's cross-cutting constraint section (`git show bd50a80:REVIEW.md` L41-48) lists the same problem.
  ```

- Problem: The policy asserts how the code is written (which identifier a file must contain, which exact `npm` script string exists) rather than what the artifact does. The properties it protects (credentials read through `readRuntimeCredential`, limiter fail-closed, readiness checks the DB) are already covered by the type checker (`readRuntimeCredential` signature), unit tests (tests/security/*) and the integration suite. Every refactor in the pinned files must be mirrored in two large hand-written files, which is why the owner's own progress log shows repeated gate breakage from unrelated edits.
- Impact: For a single-operator site: each release runs 30 gates (~150 s, PROGRESS) and each ordinary code change risks a false red that costs an extra edit-and-rerun cycle in a 2,400-line file. The gate's own maintenance is now larger than most application modules.
- Fix: Do not open a task now; record this as an owner option. Keep EXPECTED_PACKAGE_SCRIPTS and EXPECTED_GATE_PROFILE, which guard gate integrity and were kept on purpose by S3/O3. If the owner wants to slim the policy, remove only application-source pins that already have a behaviour test, one pin per test: claim-grants headers (L872-L876) → claim-token-transport.test.ts:L119-L120; limiter 503 (L611-L613) → rate-limit-persistence.test.ts:L121,L131; admin and guest credential readers (L2309-L2314) → auth-session.test.ts:L78-L85, L196-L197. Keep the pins that no default test replaces (readiness `databaseReady`, identity attestation, runtime schema), or add the test first. Gates: validate:release-policy, test:release-policy, docs/release-verification.md unchanged (the gate profile does not change).
- Fix risk: docs/release-verification.md describes the 30-gate profile; it must be updated in the same change. Removing a pin removes a control only if nothing else asserts the property — check each pin against an existing test before deleting it.
- Verification:
  - refute: SUSPECTED — The pins exist, but most of the evidence behind the claimed cost is wrong or out of date. (1) Every recorded breakage the finding cites came from positional secret-fixture pins: PROGRESS.md:L259 says 'two positional secret-fixture pins moved (33→34, 215→219)', and the 'pinned fixture moved 149 → 1…' at L266 is the same kind of pin. Task S3 replaced all of those with valueSha256 pins (PROGRESS.md:L325-L…
  - reproduce: SUSPECTED — The pins exist as described and some duplicate existing behavioural tests: the admin and guest JWT credential pins overlap auth-session.test.ts. That part holds. The rest of the evidence does not support the claim as stated. (1) The 47 package-script count is wrong: there are 31. Those entries pin the release-gate commands, which is a legitimate artifact-facing control, not application source, so delet…

### R-241: The only remaining loopback-publication invariant in the release policy matches just mappings ending in `3000:3000`
- Severity: Low
- Category: Security
- Status: CONFIRMED
- Location: scripts/lib/release-policy.mjs:L571-L581; scripts/tests/release-policy.test.mjs:L1688-L1701; docker/docker-compose.prod.yml:L51-L52
- Evidence:

  ```text
    const productionCompose = await readOptional(path.join(root, 'docker/docker-compose.prod.yml'));
    const publiclyPublishesApplication = productionCompose?.split('\n').some((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('-')) return false;
      const mapping = trimmed.slice(1).trim().replaceAll('"', '').replaceAll("'", '');
      if (!mapping.endsWith('3000:3000')) return false;
      return !mapping.startsWith('127.0.0.1:') && !mapping.startsWith('[::1]:');
    });
  Removed in this diff (git diff e19facc..fff4283 -- scripts/lib/release-policy.mjs): the `Environment=HOSTNAME=127.0.0.1`/`PORT=3000` systemd check and the orchestrator `export HOSTNAME="127.0.0.1"` check; PROGRESS.md S1 names this compose check as "the binding invariant".
  ```

- Problem: After S1 this check is the only policy that keeps the web container off public interfaces (docker/Dockerfile.security:L120 binds `HOSTNAME=0.0.0.0` inside the container). It only inspects list items whose text ends with `3000:3000`. A mapping such as `- "8080:3000"`, `- "3000"`, or `- "0.0.0.0:8443:3000"` publishes the application on all host interfaces and is not flagged, because the container-port test is glued to the host-port text.
- Impact: An edit of docker/docker-compose.prod.yml that changes the host port (e.g. to run next to another service) silently passes `validate:release-policy` while exposing port 3000's application directly to the internet, bypassing Nginx and the trusted-ingress attestation. Cloudflare then no longer fronts the origin.
- Fix: Neutralise compose interpolation first, then test the container side and require a loopback host IP:
```js
const m = trimmed.slice(1).trim().replaceAll('"', '').replaceAll("'", '')
  .replace(/\$\{[^}]*\}/gu, 'VAR').replace(/\/(?:tcp|udp)$/u, '');
if (!/(?:^|:)3000$/u.test(m)) return false;
return !/^(?:127\.0\.0\.1|\[::1\]):[^:]+:3000$/u.test(m);
```
I checked this with node: `127.0.0.1:${WEB_PORT:-3000}:3000`, `[::1]:3000:3000` and `127.0.0.1:3000:3000` pass; `${WEB_PORT:-3000}:3000`, `8080:3000`, `3000`, `0.0.0.0:8443:3000` and `3000:3000/tcp` are flagged; the db line `127.0.0.1:${POSTGRES_PORT:-5432}:5432` is ignored. Add tests to release-policy.test.mjs: one positive case with the real `"127.0.0.1:${WEB_PORT:-3000}:3000"` line, and negative cases for `"${WEB_PORT:-3000}:3000"` and `"8080:3000"`. Known residual gap: the long port syntax (`target: 3000` / `host_ip:`) and `network_mode: host` are still not covered. Either reject them for `web` or record the limitation. Gates: validate:release-policy passes on the real tree, and test:release-policy passes.
- Fix risk: Low; only the current `"127.0.0.1:${WEB_PORT:-3000}:3000"` form must keep passing (it does: three parts, loopback first).
- Verification:
  - refute: CONFIRMED — Confirmed, and the gap is larger than reported: the check never fires on the syntax the real compose file uses. The only web mapping is `"127.0.0.1:${WEB_PORT:-3000}:3000"`. With quotes stripped it ends in `}:3000`, so `mapping.endsWith('3000:3000')` is false and the predicate returns early. The most likely regression, deleting `127.0.0.1:` from that line (→ `"${WEB_PORT:-3000}:3000"`), is not flagged.…
  - reproduce: CONFIRMED — Running the verbatim predicate shows the check flags only mappings that literally end in '3000:3000'. Several mappings that publish container port 3000 on all host interfaces pass: a different host port, a bare container port, an explicit 0.0.0.0 host, a /tcp suffix, and most realistically the current line with only the '127.0.0.1:' prefix removed. PROGRESS.md L315 says this check is now 'the binding i…

### R-242: Gate 25 (generated-artifact secret scan) is hard-pinned to Next 16.3.6 and to Next's sourcemap internals; every Next upgrade breaks the release gate
- Severity: Low
- Category: Maintainability
- Status: CONFIRMED
- Location: scripts/lib/generated-artifact-secret-disposition.mjs:L6, L187-L190 (version pin); scripts/tests/secret-scanning.test.mjs:L456 (duplicated literal)
- Evidence:

  ```text
  scripts/lib/generated-artifact-secret-disposition.mjs:6
  const SUPPORTED_NEXT_VERSION = '16.3.6';
  L187-190
    const nextPackage = readJson(path.join(repositoryRoot, 'node_modules/next/package.json'));
    if (nextPackage.version !== SUPPORTED_NEXT_VERSION) {
      throw new Error('Generated-artifact dispositions do not support the installed Next version.');
  L107-111,131-133
    const sourceMapPaths = [
      'node_modules/next/dist/client/app-dir/link.js.map',
      'node_modules/next/dist/esm/client/app-dir/link.js.map',
    ];
    ...
    if (identifiers.size !== 1) {
      throw new Error('The supported Next identifier source was ambiguous.');

  docs/release-verification.md:103-106
  "supports exactly one Next version (SUPPORTED_NEXT_VERSION). A Next upgrade must update that constant and the matching fixture in scripts/tests/secret-scanning.test.mjs, after confirming that the build's manifest schema still validates."

  scripts/check-secrets.mjs:37-42 (what gate 25 scans)
  const ARTIFACT_ROOTS = Object.freeze(['.next/standalone', '.next/server', '.next/static', 'public']);
  ```

- Problem: Gate 25 runs gitleaks over the `.next` build output, which always contains Next's own generated keys (server-actions encryption key, preview-mode keys, 40-hex action IDs and a Next commit hash). The 390-line disposition module exists to explain those away, and does so by pinning the exact Next version, the exact manifest key sets (L7-12, L210-235), and the presence of exactly one GitHub commit URL in `link.tsx` inside Next's shipped sourcemaps. Any of these can change in a Next patch release. It also throws if the sourcemap files are absent (readJson on L114 is unguarded).
- Impact: Each `next` bump (the repo already pins 16.3.6 in three places: package.json, overrides key, this constant) requires editing this module, the ~25 tests in scripts/tests/secret-scanning.test.mjs:594-935 and the docs before `verify:release` can pass. Security value is small: the image contains no `.env*` (`.dockerignore`), the source scan (gate 1) already covers tracked inputs, and `.next/server` is never delivered to browsers.
- Fix: Keep the gate and its scan roots. Minimal option: in scripts/tests/secret-scanning.test.mjs:456, replace the literal with the already-exported constant (`options.nextVersion ?? GENERATED_ARTIFACT_CLASSIFICATIONS.SUPPORTED_NEXT_VERSION`), so a Next bump needs one edit in the module plus the docs note. Optionally, have validate:release-policy (gate 3) check that SUPPORTED_NEXT_VERSION equals package.json dependencies.next, so the mismatch shows up before the build instead of at gate 25. If the owner wants the bump to stop breaking the gate entirely, drop only the exact-version equality at L187-190 (and the 'unknown Next version' test at :717-722), and keep the manifest-schema, sourcemap-provenance and occurrence checks, which already fail closed when Next internals actually change. Do not remove `.next/standalone` or `.next/server` from ARTIFACT_ROOTS: that ships in the image, and it is where Next copies `.env`/`.env.production`. Removing the whole disposition layer is a security-policy change that needs explicit owner approval, not a maintainability cleanup.
- Fix risk: A secret baked into a server bundle at build time would no longer be caught by gate 25; it would still be caught by gate 1 if it is in tracked sources, and the build environment is the synthetic one (release-gates.mjs:27-45). Release-policy markers `classifyGeneratedArtifactFinding` and `'.next/standalone'` (release-policy.mjs:756-774) must be removed together.
- Verification:
  - refute: CONFIRMED — The mechanism is real. L187-190 throws whenever node_modules/next/package.json differs from '16.3.6', so any Next bump fails gate 25 until someone edits the constant. L107-133 also depends on Next's shipped link.js.map holding exactly one vercel/next.js commit URL, and L210-235 depends on the manifest key sets. It is not a duplicate: REVIEW.md:39 lists secret-scanning tooling as not reviewed, and nothi…  The impact is overstated, though. (1) The '~25 tests need editing' claim is false. The fixture writes its own fake next/package.json and has one default version literal (secret-scanning.test.mjs:456). The only real Next bump so far (bd50a80, 16.2.11 -> 16.3.6) changed exactly one line in the module and two lines in the test (one of them cosmetic). PROGRESS.md then records verify:release 30/30 passing. So the schema and sourcemap assumptions survived a minor bump, and the per-bump cost is about 2 lines. (2) The procedure is documented (docs/release-verification.md:103-106), and the gate fails closed with a clear message. That is intended behaviour, not a latent bug. (3) The unguarded readJson at L114 throws, but main() catches it and prints 'SECRET SCAN FAILED' (check-secrets.mjs:466-472). That is fail-closed by design. For a single-owner project this is a small, documented maintenance cost, so Low, not Medium.  The proposed fix is flawed and should not be applied as written. (a) The Docker runner image ships `.next/standalone` verbatim (docker/Dockerfile.security:124), so dropping it from ARTIFACT_ROOTS stops scanning exactly the server code that ships. (b) Next 16.3.6 copies loaded `.env` and `.env.production` files into `.next/standalone` (node_modules/next/dist/build/index.js:328-336). The gates run in the working tree (verify-release.mjs:121), and gate 24 runs `npm run build` there (validate-security.ts:171). With standalone removed from the roots, 'keep rejectEnvironmentFiles' would check only public/.next/static, where Next never copies env files, so it becomes a no-op. (c) It narrows a documented security contract (docs/security/secret-scanning.md:20-24: 'scans generated Next.js server/static artifacts') and the release-policy markers, which is an owner decision, not a cleanup. Also, test :685 does not assert that 'framework keys never appear in client output'. It asserts that the module fails closed if they do. A count-only check of the current build found 0 occurrences of the four framework values in .next/static (55 files) and public (58 files).
  - reproduce: CONFIRMED — All factual claims hold when traced. (1) The version is hard-pinned: scripts/lib/generated-artifact-secret-disposition.mjs:L6 `const SUPPORTED_NEXT_VERSION = '16.3.6';`, and L187-190 read node_modules/next/package.json and throw on mismatch. (2) The gate depends on Next's shipped sourcemaps: L107-134 read both link.js.map files through the unguarded readJson at L37-39 (`JSON.parse(readFileSync(...))`),…  Severity lowered to Low. The fail-closed pin is deliberate and documented, and its only cost is maintenance on a Next upgrade. It does not affect runtime or correctness. The proposed fix is a security-policy trade-off that needs the user's decision, not a minimal change. It drops scanning of .next/standalone and .next/server, which are shipped inside the runner image. It would also require editing release-policy.mjs:L756-770 markers ('classifyGeneratedArtifactFinding', "'.next/standalone'") and release-policy.test.mjs:L164 and L1535-1540. The review mentions the release-policy markers but not those test lines. The claim that the unguarded readJson on L114 throws is true, but a missing sourcemap also fails closed, which is consistent with the module's design and is not a separate defect.

### R-243: Lighthouse audit chain is the sole reason for `chrome-launcher`, the `proxy-agent` anchor, the `@sentry/node` override, a knip ignore and a docs paragraph
- Severity: Low
- Category: Dependencies
- Status: CONFIRMED
- Location: package.json:124,132,135,149; knip.json:12; docs/release-verification.md:83-86,100-101
- Evidence:

  ```text
  package.json:124,132,135,149
      "chrome-launcher": "^1.0.0",
      "lighthouse": "^13.4.0",
      "proxy-agent": "8.0.2",
      "@sentry/node": "^10.64.0",   (overrides)

  $ npm ls proxy-agent
  ├─┬ lighthouse@13.4.0
  │ └─┬ puppeteer-core@25.3.0
  │   └─┬ @puppeteer/browsers@3.0.6
  │     └── proxy-agent@8.0.2 deduped
  ├── proxy-agent@8.0.2
  └─┬ puppeteer@24.43.1
    └─┬ @puppeteer/browsers@2.13.2
      └── proxy-agent@6.5.0

  $ npm ls @sentry/node
  └─┬ lighthouse@13.4.0
    └── @sentry/node@10.64.0

  knip.json:12  "ignoreDependencies": ["@prisma/client", "proxy-agent"]
  docs/release-verification.md:83-86 (proxy-agent anchor explanation), L100-101 (@sentry/node override "for the Lighthouse chain").
  Consumers: scripts/lighthouse-matrix.ts:19-22 (only importer of lighthouse/chrome-launcher); scripts/check-browser-runtime.ts is referenced by nothing but its own usage comment (grep over the repo: only `scripts/check-browser-runtime.ts`).
  PROGRESS.md 'Declined': "Puppeteer 25: a major upgrade of the audit tooling. 4 dev-only highs remain."
  ```

- Problem: An advisory Lighthouse matrix (README.md:34 'Optional browser audits') drags in a second puppeteer-core major (25.3.0 next to puppeteer 24.43.1), a devDependency (`proxy-agent`) that exists only so that npm dedupes the nested copy, an override for `@sentry/node`, a knip exception and two documentation paragraphs. The full-tree `npm audit --audit-level=high` (script `security:audit`, also used by `build:secure`/`security:scan`) is what the declined 'Puppeteer 25' item refers to.
- Impact: Dependency surface and upgrade work for one apartment site with no automated consumer of the Lighthouse scores; three maintenance artifacts (override, anchor, knip ignore) must be reasoned about on every audit or upgrade. SUSPECTED part (npm audit could not run here: registry TLS error): the remaining dev-only high advisories live in this chain.
- Fix: Owner decision first, because this removes a documented optional audit. If approved, remove only the Lighthouse chain:
- the `lighthouse`, `chrome-launcher` and `proxy-agent` devDependencies
- the `@sentry/node` override
- the `"proxy-agent"` entry in knip.json ignoreDependencies
- scripts/lighthouse-matrix.ts and the `audit:lighthouse:matrix` script
- the Lighthouse mentions in README.md:34, scripts/README.md:128 and CLAUDE.md:85
- docs/release-verification.md:83-86, plus the `@sentry/node` half of L100-101 (keep the `@prisma/dev` half)
- optionally, the .gitignore entries L45 and L49-50

Keep scripts/check-browser-runtime.ts: it is a puppeteer/Chrome check for all audit scripts, not part of the Lighthouse chain, and O8 kept its alias. Regenerate package-lock.json with `npm install` (needs approval). Then run check:dead-code, security:license-check and verify:release. Do not expect this to clear the 4 dev-only highs: those are in the puppeteer 24 chain, which stays.
- Fix risk: Loses the scripted performance matrix. Regenerate package-lock.json with `npm install` (needs approval), then `check:dead-code`, `security:license-check`, `verify:release`.
- Verification:
  - refute: CONFIRMED — The dependency-chain facts hold. `chrome-launcher` is imported only by scripts/lighthouse-matrix.ts, and lighthouse also depends on it (^1.2.1, deduped). `proxy-agent@8.0.2` is needed only because lighthouse's nested @puppeteer/browsers@3.0.6 declares an optional peer `proxy-agent >=8.0.1`. puppeteer@24's @puppeteer/browsers@2.13.2 has its own regular dependency `proxy-agent ^6.5.0`. `@sentry/node` exi…  Two parts are wrong. (1) The SUSPECTED claim that the remaining dev-only highs sit in the lighthouse chain is refuted by the project's own record. Commit bd50a80 PROGRESS.md says 'Not done: 4 dev-only highs remain in the puppeteer 24 chain'. puppeteer@24.43.1 stays (smoke:image needs it), so this removal does not clear those highs. (2) The finding says scripts/check-browser-runtime.ts is 'referenced by nothing'. In fact package.json:60 references it. It is not part of the lighthouse chain: it looks for Chrome through `import('puppeteer')`, CHROME_PATH or google-chrome, for all audit scripts. The finder's grep excluded package.json. Unreferenced aliases were already decided in R-072/O8 (keep).  Severity calibration: all of these are devDependencies. The chain reaches only the Docker builder stage (Dockerfile.security:20, `npm ci` with dev dependencies) and none of the runtime images (runner copies only the standalone output, and migrate runs `npm ci --omit=dev`). The release audit gate uses `--omit=dev`. Removing it saves about 93 unique packages, one override, one anchor and one knip ignore. The Lighthouse matrix is an owner-documented optional audit (CLAUDE.md:85), so the change needs owner approval, plus approval for `npm install` to regenerate the lockfile. This makes it Low (cleanup with a small benefit), not Medium.
  - reproduce: CONFIRMED — The dependency structure checks out. `proxy-agent@8.0.2` is only there to satisfy the optional peer `proxy-agent >=8.0.1` of `@puppeteer/browsers@3.0.6`, and that package sits only under lighthouse -> puppeteer-core@25.3.0. `@sentry/node` is reached only through lighthouse. `chrome-launcher` is imported only by scripts/lighthouse-matrix.ts. The knip ignore and the docs paragraphs exist only because of…

### R-244: Documentation contradicts the code in six places (privacy holds, pepper length, .env.example copy, image count, orchestrator flags)
- Severity: Low
- Category: Maintainability
- Status: CONFIRMED
- Location: README.md:12, README.md:38; scripts/README.md:65, :85-90, :95; .env.example:1; docs/testing.md:42 (CLAUDE.md reference is L60, not L63)
- Evidence:

  ```text
  (a) README.md:12 "- Operations: database-backed security audit events, alert rules, privacy requests/holds, retention, and retry workers." — PROGRESS O13: privacy_holds dropped (migration 20260924122000_remove_dead_tables); `grep -n PrivacyHold prisma/schema.prisma` -> no match; CLAUDE.md:63 lists only "privacy (erasure) requests".
  (b) scripts/README.md:65 "`SECURITY_PEPPER` and `CLAIM_TOKEN_PEPPER` (at least 32 characters ...)" vs src/lib/runtime-env-schema.js:47 `SECURITY_PEPPER: z.string().min(16, ...)` and scripts/system-orchestrator.sh:298 `${#SECURITY_PEPPER} -ge 16`.
  (c) .env.example:1 "# Copy to .env.local for development." vs README.md:26 "so no manual copy of `.env.example` is needed". After a copy, ensure-pepper keeps the placeholders: scripts/ensure-pepper.js:37,46,56,60 test only `=\s*` (empty value counts as present) and `SECURITY_PEPPER=replace-with-a-random-secret` (27 chars) satisfies min(16).
  (d) README.md:38 "Production runs one immutable Docker image" vs README.md:45 and CLAUDE.md:40 (three images: runner, workers, migrate).
  (e) scripts/README.md:85-90 documents `-- --profile development` on five commands; system-orchestrator.sh:128-131 accepts the flag only to ignore it. scripts/README.md:95 "Production disables that fallback and fails closed" — the orchestrator has no production mode (L129).
  (f) docs/testing.md:42 "`--strict` option also runs lint, typecheck, and the coverage gate before build or startup" — the orchestrator no longer builds (S1 removed `build`).
  ```

- Problem: Stale sentences left by the S1/C2/C10 deletions and one numeric contradiction on the pepper minimum. The .env.example header and ensure-pepper's lenient regexes together let a developer run with placeholder secrets while the README says the copy step does not exist.
- Impact: Operator confusion during setup and review; the pepper-length claim could make an operator generate a 16-character production pepper believing 32 is enforced (or vice versa). Development only for (c).
- Fix: Docs only: README.md:12 'privacy (erasure) requests' (drop '/holds'); scripts/README.md:65 'SECURITY_PEPPER (at least 16 characters) and CLAUDE_TOKEN_PEPPER (at least 32)' -> exactly: '`SECURITY_PEPPER` (at least 16 characters) and `CLAIM_TOKEN_PEPPER` (at least 32); ensure-pepper generates 64 hex for both' (raising the schema minimum to 32 is a separate owner decision, since it would make a running deployment with a 16-31 character pepper fail at start); .env.example:1 'Reference only: `npm run ensure-pepper` creates .env.local. Never commit real credentials.'; README.md:38 'three immutable Docker images (web, workers, migrate)'; scripts/README.md:85-90 drop the redundant `-- --profile development`; rephrase L95 instead of deleting it: 'The production Docker image has no fallback database and fails closed.'; docs/testing.md:42 'before startup'. Drop the optional ensure-pepper regex change from this task: requiring \\S catches none of the .env.example placeholders (all non-empty; CLAIM_TOKEN_PEPPER's is 42 chars and already passes the \\S check at L42). Detecting placeholders is a behaviour change that would need its own task plus an update to tests/unit/ensure-pepper.test.ts.
- Fix risk: Docs only, except the optional ensure-pepper change (would append a second value line after an existing empty/placeholder one; dotenv takes the last definition in a file, so the generated value wins).
- Verification:
  - refute: CONFIRMED — All six drift points exist at HEAD. None is a duplicate: PROGRESS.md records the changes that caused them (O13/C10c dropped privacy_holds, S1 made the orchestrator development-only and removed build, B15 said no copy is needed, B17 left SECURITY_PEPPER at min 16), and REVIEW.md has no finding about this drift (R-107 and R-132 are the older runtime bugs, both fixed). Calibration: everything is documenta…
  - reproduce: CONFIRMED — I re-read all six sub-claims at HEAD and each one holds. (a) README.md:12 still says "privacy requests/holds". The PrivacyHold model is gone from the schema, and migration 20260924122000_remove_dead_tables drops privacy_holds. The PrivacyRequest model is still there, so only "/holds" is stale. (b) scripts/README.md:65 says both peppers need at least 32 characters. The schema requires only 16 for SECURI…

### R-245: R-155 fix incomplete: a full `bootstrap` (not `--db-only`) that starts the fallback database writes no state, so `system:down` still cannot stop it
- Severity: Low
- Category: Logic
- Status: CONFIRMED
- Location: scripts/system-orchestrator.sh:L740-757 and L835-842 (cmd_migrate has the same gap)
- Evidence:

  ```text
  scripts/system-orchestrator.sh:L740-L757:
  run_bootstrap_sequence() {
    run_preflight
    if (( DB_ONLY_MODE )); then
      prepare_database
      # Record the DB mode so `down` can stop a fallback DB started here.
      write_state "none"
      ...
      return
    fi
    ensure_dependencies
    validate_runtime_environment_contract
    prepare_database
    run_prisma_generate
    run_migrations_with_retry
    run_strict_quality_gate_if_requested
  }
  `write_state` callers: L609 (inside start_app, only reached by `up`) and L746 (db-only branch). L699-L706: stop_fallback_database_if_needed() { if ! load_state; then return; fi; if [[ "${DB_MODE:-}" != "local" ]]; then return; fi
  PROGRESS.md S1: "db-only bootstrap writes state and a reachable URL that points at the running fallback container counts as `local` so `down` stops it (R-155)".
  ```

- Problem: The S1 fix covers `db:start` (db-only) and the "already running fallback counts as local" case on the next `up`, but `npm run system:bootstrap` / `system:migrate` (full path) can start the fallback container via `prepare_database` → `start_fallback_database` (L405-L430) and return without `write_state`. `cmd_down` then finds no state file and leaves `site-dev-db` running.
- Impact: `npm run system:bootstrap && npm run system:down` leaves the Docker database running; the user believes the environment is stopped. Recovers only after a later `system:up` (which writes state at start_app) or a manual `docker compose down`.
- Fix: Move the state write into prepare_database so every caller records the DB mode (full bootstrap, db-only bootstrap, migrate, db:migrate, up). At the end of prepare_database, in both the reachable branch (before `return`) and after the fallback reachability check, add `write_state "none"`, and remove the now-redundant call at L746. start_app (L609) keeps overwriting it with the app command. To verify: from a stopped state, run `npm run system:bootstrap` and then `system:down` and check that `docker inspect site-dev-db` no longer shows it running; repeat with `npm run db:migrate`.
- Fix risk: None beyond the state file existing without an app; `stop_app` already handles a missing PID file, and `write_state` is idempotent (`: > "$STATE_FILE"`).
- Verification:
  - refute: CONFIRMED — This is residual work from R-155, not a repeat of it. R-155 and its S1 fix covered only the db-only path (`db:start`) and the 'pre-running container counts as local' case. At HEAD, `write_state` is called only from start_app (L609) and the db-only branch (L746). Three other paths can start the fallback container through prepare_database -> start_fallback_database (L390-L402 sets DB_MODE=local) and stil…
  - reproduce: CONFIRMED — Traced every path. write_state is called only at L609 (start_app, reached from cmd_up) and L746 (the db-only branch of run_bootstrap_sequence). A full `bootstrap` (system:bootstrap) goes run_preflight -> ... -> prepare_database. When DATABASE_URL is unreachable and the Docker fallback is enabled, prepare_database calls start_fallback_database, which runs `compose up -d` and sets DB_MODE=local only in t…

### R-246: Gate 7 needs the digest-pinned Nginx image to be present locally, but nothing pulls it and no document says so
- Severity: Low
- Category: Error handling
- Status: CONFIRMED
- Location: scripts/test-nginx-ingress.sh:L21, L103-L110; docs/release-verification.md:L14-L27
- Evidence:

  ```text
  scripts/test-nginx-ingress.sh:2,6,21
  set -euo pipefail
  IMAGE="$(node -e "const f=require(process.argv[1]); process.stdout.write(f.repository+'@'+f.digest)" "$LOCK_FILE")"
  ...
  docker image inspect "$IMAGE" >/dev/null

  $ grep -rn "image.lock\|docker pull\|nginx@sha256\|1.28" README.md scripts/README.md docs SECURITY.md -> no matches
  docs/release-verification.md:14-27 (Prerequisites) lists Node, lockfile install, GITLEAKS_BIN, Docker+Buildx, disk, registry access for the PostgreSQL image; the Nginx image is not mentioned.

  Also L106-109: `grep -Fq "$header" <<<"$trusted_headers"` inside a for-loop under set -e exits the script on the first missing header with no message.
  ```

- Problem: On a fresh machine (or after `docker image prune`) `docker image inspect` fails under `set -e`, so verify:release stops at gate 7 with Docker's raw `No such image` error, and the operator has to read the script to learn that `docker pull docker.io/library/nginx@sha256:a8b39...` is the fix. The header assertions fail silently, so a real ingress regression prints nothing but the orchestrator's 'exited with status 1'.
- Impact: Release verification is not reproducible from the documented prerequisites; a failed ingress header check is undiagnosable from the output.
- Fix: Option A (keeps gate 7 offline, matching release-verification.md:L124-L125): L21 `docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "Pinned Nginx image missing locally; run: docker pull $IMAGE" >&2; exit 1; }`. Option B (as proposed): `docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull --quiet "$IMAGE" >/dev/null`. With either option, add the digest-pinned Nginx image from deploy/nginx/image.lock.json to the prerequisites in docs/release-verification.md (under disk space, and under registry access if you choose B). L106-L110: `grep -Fq "$header" <<<"$trusted_headers" || { echo "Missing upstream header: ${header%%:*}" >&2; exit 1; }`. For L110, print a fixed message such as 'Attestation header not forwarded' and never echo $SECRET, even though it is a throwaway test value.
- Fix risk: Adds one registry pull on first run (already required for PostgreSQL); none otherwise.
- Verification:
  - refute: CONFIRMED — Both parts are real. (1) Line 21 only checks that the pinned Nginx image is already present. Nothing in the repo pulls it: the only `docker pull` in scripts/ is the PostgreSQL one in scripts/check-postgres-image-policy.ts:77, which runs at gate 22, well after gate 7. scripts/verify-release.mjs does not pull images, and neither docs/release-verification.md nor any other doc mentions the Nginx image. So…
  - reproduce: CONFIRMED — Static tracing covers every path, so no Docker run was needed (and none is allowed). The script runs under `set -euo pipefail` (L2). At L21 it runs `docker image inspect "$IMAGE" >/dev/null` with stderr left visible, so if the image is missing the command fails and the script exits with Docker's raw 'No such image' message. Nothing in the repo pulls the Nginx image: a search for the digest, `image.lock…

### R-247: smoke-production-image.ts uses Puppeteer's deprecated page-level cookie API
- Severity: Low
- Category: Legacy
- Status: CONFIRMED
- Location: scripts/smoke-production-image.ts:L370-L376
- Evidence:

  ```text
  scripts/smoke-production-image.ts:370-371,376
        await page.deleteCookie(...(await page.cookies()));
        await page.setCookie({ name: 'guest_rt', value: refreshToken, domain: 'localhost', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' });
        ...
        assert((await page.cookies()).some((cookie) => cookie.name === 'guest_session'), 'no new guest session cookie');

  node_modules/puppeteer-core/lib/types.d.ts:6309-6312 (puppeteer-core 24.43.1)
     * @deprecated Page-level cookie API is deprecated. Use
     * {@link Browser.cookies} or {@link BrowserContext.cookies} instead.
     */
    abstract cookies(...urls: string[]): Promise<Cookie[]>;
  (same note on deleteCookie at L6314-6320 and setCookie at L6328-6331)
  ```

- Problem: Three calls use APIs the installed Puppeteer marks deprecated; the next major removes them and the smoke script (the ADR's image-smoke proof) stops compiling.
- Impact: Future breakage of `npm run smoke:image` on a Puppeteer upgrade; no effect today.
- Fix: Optional, Nit. In scripts/smoke-production-image.ts:L370-L376: `const context = page.browserContext();` then `await context.deleteCookie(...(await context.cookies()));`, `await context.setCookie({ name: 'guest_rt', value: refreshToken, domain: 'localhost', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' });` and `assert((await context.cookies()).some((cookie) => cookie.name === 'guest_session'), ...)`. Because context.cookies() is not URL-filtered, this is equivalent only because the script uses a single origin. Verify with `npm run smoke:image`, which needs locally built images. Reasonable to defer together with the declined Puppeteer 25 upgrade, since 25.x still ships these methods.
- Fix risk: None functionally; re-run `npm run smoke:image` (needs local images).
- Verification:
  - refute: CONFIRMED — The three calls do use APIs that the installed puppeteer-core 24.43.1 marks @deprecated, so the deprecation claim holds. The impact claim does not. The finding says 'the next major removes them and the smoke script ... stops compiling', but pptr.dev documents Page.cookies/deleteCookie/setCookie as still present, only deprecated, in Puppeteer 25.12.0. The Puppeteer 25 upgrade is also recorded as decline…
  - reproduce: CONFIRMED — The cited lines are correct. Line 370 calls page.deleteCookie and page.cookies, line 371 calls page.setCookie, and line 376 calls page.cookies again. The installed puppeteer and puppeteer-core are both 24.43.1, and their typings mark all three Page methods @deprecated, pointing to the Browser and BrowserContext equivalents. The finding overstates one thing: the typings deprecate these methods but do no…

### R-248: Coverage gate excludes the security-critical modules that now have unit tests
- Severity: Low
- Category: Tests
- Status: CONFIRMED
- Location: vitest.config.ts:L30-L69 (32 include entries at L31-L62; thresholds at L64-L69)
- Evidence:

  ```text
  vitest.config.ts:L30-L63 `coverage.include` lists 33 files, e.g. 'src/lib/data.ts', 'src/lib/jsonLd.ts', 'src/lib/mapUtils.ts', 'src/lib/travelFormat.ts', 'src/lib/auth/admin.ts', 'src/lib/guestSession.ts', 'src/lib/sensitiveRateLimit.ts'. Absent: src/lib/bookingOutbox.ts (tested by tests/unit/booking-outbox.test.ts), src/lib/portalAuthService.ts (tests/unit/claim-grant-issuance.test.ts, guest-access-reset.test.ts), src/lib/privacyService.ts (tests/unit/privacy-erasure.test.ts), src/lib/operationalMonitor.ts (tests/unit/operational-retention.test.ts), src/lib/prisma-repositories/checkInRequestRepository.ts (tests/unit/checkin-decision.test.ts), src/lib/featureFlags.ts (tests/unit/feature-flags.test.ts), src/lib/portalClaimExchange.ts and src/lib/net/clientIdentity.ts (tests/security/*), src/lib/prisma-repositories/refreshTokenRepository.ts. CLAUDE.md 'Testing rules': "A new critical module should be added to the explicit coverage include list with meaningful tests"; docs/testing.md:L114 says the list is 'the critical authored-code coverage scope'.
  ```

- Problem: The enforced thresholds (89/91/82/88) are computed over content utilities and a few auth helpers; the outbox state machine, claim/reset service, erasure, retention and the check-in repository do not count, although B31/B2/C10 added tests for them.
- Impact: Deleting or skipping `booking-outbox.test.ts` or `privacy-erasure.test.ts` leaves `npm run test:coverage` (release gate) green; the gate gives false assurance exactly where the review found the last bugs (R-122, R-123, R-127, R-160).
- Fix: Add only the eight modules that the default suite tests to `coverage.include`: src/lib/bookingOutbox.ts, src/lib/portalAuthService.ts, src/lib/privacyService.ts, src/lib/operationalMonitor.ts, src/lib/prisma-repositories/checkInRequestRepository.ts, src/lib/featureFlags.ts, src/lib/portalClaimExchange.ts and src/lib/net/clientIdentity.ts. Leave src/lib/prisma-repositories/refreshTokenRepository.ts out: it is mocked in the default suite and covered only by the Docker integration suite, which docs/testing.md:L114 excludes. Run `npm run test:coverage` under Node 22.19 and record the measured values. Lower the four global thresholds to those values minus a small margin, and only if needed; per CLAUDE.md, write tests before relaxing thresholds. If the goal is that deleting booking-outbox.test.ts or privacy-erasure.test.ts fails the gate, also add glob-pattern thresholds for those files at their measured values minus a margin (e.g. `'src/lib/bookingOutbox.ts': { lines: N, branches: M }`). Aggregate thresholds alone may absorb one missing test file. No production code changes.
- Fix risk: Thresholds will drop (refreshTokenRepository is covered only by the Docker integration suite, which the default profile does not run); either keep it out with a comment or accept the lower baseline. No production code changes.
- Verification:
  - refute: CONFIRMED — The central claim holds. `coverage.include` is an explicit allow-list, and none of the nine modules is on it. The eight modules the default suite exercises are imported directly by default-suite tests that mock `@/lib/prisma`, but they are left out of the thresholded aggregate. That clashes with the project's own rule (CLAUDE.md Testing rules; docs/testing.md:L114-L118). It is also inconsistent with th…
  - reproduce: CONFIRMED — The coverage scope is an explicit allow-list, and none of the nine named modules is in it. All nine exist, and default-suite tests import the real implementation for eight of them. Only refreshTokenRepository is mocked in the default suite (tests/security/auth-session.test.ts:L25), which matches the finding's fix-risk note. The thresholds therefore measure only the 32 listed files, and removing booking…

### R-249: Disposable-PostgreSQL test harness is out of proportion to the project (about 1,600 lines of guard code plus 650 lines of tests of the guards)
- Severity: Low
- Category: Overengineering
- Status: SUSPECTED
- Location: tests/integration/support/database-safety.ts:L212-L217 and L324-L395; tests/integration/support/database-lifecycle.ts:L155-L183
- Evidence:

  ```text
  `wc -l`: tests/integration/support/database-lifecycle.ts 388, database-safety.ts 413, migrations.ts 246, postgres-image-policy.ts 266, runtime.ts 160, fixtures.ts 87, prisma-config-safety.ts 30, scripts/lib/postgres-image-policy-command.ts 175 (total 1,765); tests of the harness itself: tests/unit/postgres-image-policy.test.ts 246, postgres-image-policy-command.test.ts 141, integration-database-safety.test.ts 259 (646). Layers on every guarded SQL call (database-safety.ts:L363-L395): static URL/label/opt-in checks (L159-L218), `docker inspect` of container id, name, image id, four labels, tmpfs, binds, AutoRemove, restart policy and port binding (L245-L307), then a live `COMMENT ON DATABASE` fingerprint plus server version/address/owner check (L324-L361); startup additionally verifies the raw OCI index bytes and annotations of the postgres image (postgres-image-policy.ts:L171-L223) and hashes every DATABASE_URL-like value from eight .env files into a forbidden list (database-lifecycle.ts:L155-L183). The runner itself generates the container, a random 12-hex run id, a random 32-byte password and a tmpfs data directory (database-lifecycle.ts:L188-L242), so the URL it guards against is one it created.
  ```

- Problem: The harness defends against connecting a destructive test to a non-disposable database, but the only URL that can reach the tests is the one the same process just generated with random credentials on a throw-away container. Most of the guard code (OCI index provenance, label matrix, env-file fingerprint list, database COMMENT marker) protects against scenarios that cannot occur through `npm run test:integration`, and it needs its own unit tests, a release gate (`check:postgres-image-policy`) and docs (docs/testing.md L44-L74) to stay consistent.
- Impact: Maintenance cost for a one-person project: every Docker/Postgres image bump touches five files and three test files; each integration test spends three `docker inspect` round trips per guarded call. No production impact; the suites pass (83/83 per PROGRESS.md).
- Fix: This is an owner decision; leaving the code as is is acceptable. If simplifying: (a) Delete the forbidden-target list: database-safety.ts L212-L217, collectKnownDatabaseTargetFingerprints in database-lifecycle.ts L155-L183, and the SITE_TEST_FORBIDDEN_DB_TARGETS plumbing in runtime.ts together with its unit cases. It cannot fire behind the exact-URL/random-user check, so this is removable without judgement. (b) Optionally drop the per-call `docker inspect` and the COMMENT fingerprint layer from withVerifiedDisposableDatabase. Keep assertDisposableContainer before `docker rm --force` in removeDisposablePostgresContainer (database-lifecycle.ts L350-L353) and in the setup-failure path, so the runner never removes a container it cannot identify. (c) KEEP postgres-image-policy.ts, `check:postgres-image-policy` and postgres-image-policy-command.ts with its test: the same digest is enforced in docker/docker-compose.prod.yml (release-policy.mjs L456-L474), so this gate is the production DB image provenance check. Update docs/testing.md L66-L70 ('Fail-closed database guard') in the same task. Run `validate:release-policy`, `test:release-policy`, `npm test` and `npm run test:integration`, then a full `verify:release`.
- Fix risk: The fail-closed guard is a documented contract (docs/testing.md, release gates); `validate:release-policy`/`test:release-policy` and `check:postgres-image-policy` reference these files and must be adjusted in the same task. A refactor of this size needs owner approval and a full `verify:release` run.
- To confirm (SUSPECTED only): Owner decision; the code facts are confirmed by reading, the 'not needed' judgement is design opinion.
- Verification:
  - refute: CONFIRMED — The code facts hold. There is no matching R-id: PROGRESS.md 'Declined' covers only the unrelated R-102 nit that `check-postgres-image-policy` imports from tests/, and REVIEW.md L39 lists tests/integration/* as not reviewed. Part of the redundancy can be proven from the code, not just argued as opinion. The static check alone rejects every target except the exact runner-built URL: host must be 127.0.0.1…
  - reproduce: SUSPECTED — The size numbers and the layer structure check out. The 'overengineering' judgement is still a design opinion, so it cannot be CONFIRMED, and two of the finding's supporting claims are wrong. (1) Premise that 'the only URL that can reach the tests is the one the same process just generated': not quite. The runtime reaches forked Vitest workers through environment variables (runtime.ts:L90-L131, runtime…

### R-250: Dead CSS: `.btn-accent`, `.btn-secondary`, `.guide-option-card` exist only inside a 14-term `:not()` chain; `.guide-option-title` is styled but never used
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/styles/09-utilities.css:L140, L145, L149; src/styles/12-apartment-checkin.css:L562
- Evidence:

  ```text
  Method: node script extracting every class selector from src/styles/*.css + globals.css (275 classes) and word-searching src/**/*.{ts,tsx,js,json} + public/sw.js → 28 without a reference; 24 are vendor classes (leaflet-*, rdp-*, marker-cluster-*) or built dynamically (`checkin-status-${status}` CheckInInfo.tsx:802, `moment-card-service-${id}` MomentCard.tsx:224). The remaining four:
    09-utilities.css:140 (repeated at :145 and :149): `[data-theme="dark"] a:not(.btn-primary):not(.btn-accent):not(.btn-outline):not(.btn-tint):not(.btn-secondary):not(.apartment-btn-primary):not(.home-feature-card):not(.guide-option-card):…` (14 `:not()` terms)
    12-apartment-checkin.css:562 `.guide-option-title,` in the title font-stack list.
    `/usr/bin/grep -rn "btn-accent\|btn-secondary\|guide-option" src --include='*.tsx' --include='*.ts'` → no hits (only `apartment-btn-secondary`, a different class).
  ```

- Problem: Three exclusions in the dark-mode link selector name classes no element ever has, and one typography selector targets a class nothing renders. The triple-copied 14-term `:not()` chain is the real maintenance cost: each new button class must be added to three places or its links turn brand-400 in dark mode.
- Impact: Small bytes; real risk is the copy-pasted exclusion list drifting (it already contains three dead entries), which is how R-091-style dark-mode link bugs appear.
- Fix: Minimal change: delete `:not(.btn-accent)`, `:not(.btn-secondary)` and `:not(.guide-option-card)` from all three selectors at src/styles/09-utilities.css:L140, L145 and L149, and delete the `.guide-option-title,` line at src/styles/12-apartment-checkin.css:L562. Specificity goes from (0,15,1) to (0,12,1), and no other selector in src/styles comes close, so the rendered output does not change. A dark-mode screenshot spot check (home, contact, guest menu) is enough. Do not include the `:is()`/`:where()`/`:not(list)` consolidation or the `.link-styled` opt-in here. They would cut the unlayered rule's specificity to (0,2,1) or (0,1,1), or reverse the default for every plain link. If wanted, raise them as a separate task that needs approval and a full dark-mode cascade and screenshot comparison.
- Fix risk: Visual only; check dark-mode link colour on home, guest menu, contact and admin pages (S8 screenshots procedure).
- Verification:
  - refute: CONFIRMED — The finding holds. Nothing in the repo renders any of the four classes. Outside node_modules/.next/.git/generated, the only hits are the three selector copies in 09-utilities.css and one selector-list entry in 12-apartment-checkin.css. No template-literal or `'btn-' +` construction produces them, and the runtime deps don't emit them as class names: Next's builtin error-styles.js contains only the CSS v…
  - reproduce: CONFIRMED — Re-read the cited lines. The 14-term :not() chain appears three times at src/styles/09-utilities.css:140, :145 and :149, and each copy names .btn-accent, .btn-secondary and .guide-option-card. .guide-option-title appears in the title font-stack list at src/styles/12-apartment-checkin.css:562. A repo-wide search (excluding node_modules/.next/.git) finds these names only in those two CSS files. The one o…

### R-251: The build-time localization gate (`validate-content.ts` → `validateLocalization`) cannot fail: it falls back to the always-present base field
- Severity: Low
- Category: Logic
- Status: CONFIRMED
- Location: src/lib/validation.ts:L8-L24 (also src/lib/data.ts:L49-L57 for the silently dropped invalid items)
- Evidence:

  ```text
  src/lib/validation.ts:11-14:
        const localizedTitle = (c as …)[`title_${loc}`];
        if (!(typeof localizedTitle === 'string' && localizedTitle) && !c.title) {
          throw new Error(…)
  and :19-22 the same for items with `&& !it.name`. `title` and `name` are required strings in the schemas (src/data/schemas.ts:6 `title: z.string()`, :21 `name: z.string()`); categories are parsed at module load (src/data/categories.ts:5 `.map((c) => CategorySchema.parse(c))`) and items that fail `ItemSchema` are already dropped before validation by `getItemsByCategory` (src/lib/data.ts:49-57). scripts/validate-content.ts:5 calls `validateLocalization([...locales])` in `npm run build` (package.json `build`).
  ```

- Problem: Because the condition requires the base field to be missing too, and the base field can never be missing for anything that reaches the loop, the function never throws. CLAUDE.md states "The build step validates its localization against src/i18n/config.ts locales"; in fact an item or category with only English text passes.
- Impact: False assurance: a Greek-less item ships and renders English on `/el` (R-147 was exactly this class of bug). The gate costs a build step and a module for zero enforcement.
- Fix: Make the gate check what it claims, a minimal change inside validateLocalization. For every `loc` other than `defaultLocale` (import it from '@/i18n/config' rather than hard-coding 'en'), require a non-empty `title_${loc}` on each category and a non-empty `name_${loc}` on each item. Optionally, for `summary`/`description`/`descriptionTitle`/`address`, require `${key}_${loc}` whenever the base or `${key}_en` value is non-empty. For the default locale, keep requiring a non-empty base or `_en` value. Current content already passes this, so no data edits are needed. Verify locally with `tsx scripts/validate-content.ts` and add a unit test that mocks categories/items missing `name_el` and expects a throw. Optionally, also fail the gate when the raw JSON entry count differs from the `getItemsByCategory` result, so schema-invalid items are no longer dropped silently. Deletion is the worse option: it needs changes to package.json, scripts/lib/release-policy.mjs:173, scripts/tests/release-policy.test.mjs and CLAUDE.md:37, and it removes the only build-time content check.
- Fix risk: Making it strict will likely fail the build on current content until Greek fields are complete (moments.json/phones.json); run `tsx scripts/validate-content.ts` locally first. Deleting it changes the pinned `build` script string in scripts/lib/release-policy.mjs (EXPECTED_PACKAGE_SCRIPTS) and its tests.
- Verification:
  - refute: CONFIRMED — The core claim holds. Each check is `!(localized non-empty) && !base`. The base `title`/`name` is `z.string()` and is present on every category and item that reaches the loop, so a missing or empty `title_el`/`name_el` never throws. The gate therefore does not enforce per-locale localization, and `pickLocale` (src/lib/data.ts:90-97) silently falls back to the English base value on /el. Two parts of the…
  - reproduce: CONFIRMED — I traced every path and the core claim holds. At src/lib/validation.ts:11 and :19 the function throws only when the localized field is missing AND the base field is falsy. `title` and `name` are required z.string() fields. Categories are parsed with CategorySchema.parse at module load, and items that fail ItemSchema.safeParse are dropped (logged and skipped) before the loop sees them. So the gate never…

### R-252: `LOG_PERFORMANCE` adds a `performance` block whose `duration` is the logger's uptime and which is only visible when `LOG_STRUCTURED=true`
- Severity: Low
- Category: Overengineering
- Status: CONFIRMED
- Location: src/lib/logger-enterprise.ts:L3, L15, L37-L43, L50, L67, L74, L166-L189, L236; src/lib/apiErrorHandler.ts:L253; src/lib/runtime-env-schema.js:L77; .env.example:L47
- Evidence:

  ```text
  logger-enterprise.ts:67 `private startTime: number = Date.now();` :74 `enablePerformanceMetrics: process.env.LOG_PERFORMANCE === 'true'`; :176-183 `memory: {...}, duration: Date.now() - this.startTime` (time since the singleton was constructed, not since the request); :236 attaches it to every entry; but :243-266 `output()` prints only message/metadata/error in the default text mode and includes `performance` only via `JSON.stringify(entry)` when `enableStructured` (`LOG_STRUCTURED === 'true'`). Related duplication: `LogContext.requestId` (L15) is always set equal to `correlationId` (apiErrorHandler.ts:251-255) and only `correlationId` is printed (L253).
  ```

- Problem: Two environment keys (`LOG_PERFORMANCE`, and the dependency on `LOG_STRUCTURED`), an `Intl`-free but still per-entry `process.memoryUsage()` call, and a `duration` value that means nothing per request. `requestId` duplicates `correlationId`.
- Impact: Operator-facing configuration (runtime-env-schema.js:75-78, .env.example:44-48) documents a feature that yields a misleading metric; ~30 lines plus schema entries.
- Fix: Apply the proposed deletions (the `enablePerformanceMetrics` config key at L50/L74, `getPerformanceMetrics` at L166-189, `LogEntry.performance` at L37-43, the `performance:` line at L236, `LOG_PERFORMANCE` at runtime-env-schema.js:77 and .env.example:47, `requestId` at L15 and apiErrorHandler.ts:253). Also delete the now-orphaned `private startTime` field (L67) and update the header comment at L3, which advertises "Performance monitoring". Keep `LOG_STRUCTURED`, which is a real output mode. No env-file migration is needed: z.object strips unknown keys, so a leftover LOG_PERFORMANCE in the production env file stays harmless. Gates: `npm run typecheck`, `npm run lint -- --max-warnings=0`, `npm run check:dead-code`, and the release-policy test (`scripts/tests/release-policy.test.mjs`).
- Fix risk: Schema key removal must be mirrored in any release-policy marker that lists env keys (`grep -n LOG_PERFORMANCE scripts/` → none found), and in docs listing env vars.
- Verification:
  - refute: CONFIRMED — All parts of the claim hold. (1) `startTime` is a field initializer on the module-level singleton (`export const logger = new EnterpriseLogger()`, last line of the file), so `duration` is the time since the module loaded, not a per-request duration. The only real per-request timing lives in apiErrorHandler (`performance.now()` at apiErrorHandler.ts:245, behind `enablePerformanceLogging`). (2) `output()…
  - reproduce: CONFIRMED — All claims check out. `startTime` is set once when the class is constructed. The class is a module singleton (L328 `export const logger = new EnterpriseLogger();`), so `duration` measures how long the process has been up, not how long a request took. `getPerformanceMetrics()` is attached to every entry at L236. In `output()` the text-mode branch (L249-262) prints only the timestamp, level, correlationI…

### R-253: PwaManager falls back to an unversioned service worker when /version.json answers non-OK, which wipes the versioned cache
- Severity: Low
- Category: Error handling
- Status: CONFIRMED
- Location: src/components/PwaManager.tsx:L24-L34 (and the comment at L33)
- Evidence:

  ```text
  src/components/PwaManager.tsx:L24-L34
            let scriptUrl = '/sw.js';
            try {
              const res = await internalFetch('/version.json', { cache: 'no-store' });
              if (res.ok) {
                const meta = await res.json() as { version?: string; build?: string };
                if (meta.version && meta.build) {
                  scriptUrl = `/sw.js?v=...&build=...`;
                }
              }
            } catch { /* offline: keep the current registration's script */ }
            const reg = await navigator.serviceWorker.register(scriptUrl);

  public/sw.js:L11-L13
    const BUILD = params.get('build') || 'unversioned';
    const CACHE_NAME = `${CACHE_PREFIX}${BUILD}`;
  public/sw.js:L55-L57 (activate): deletes every `guest-guide-*` cache except CACHE_NAME.
  ```

- Problem: Όταν το `/version.json` απαντήσει με non-OK status ενώ ο χρήστης είναι online (π.χ. παροδικό 502/503 από το Nginx κατά τη διάρκεια rollout ή restart του `web`), το `res.ok` είναι false, δεν πετιέται exception, και γίνεται `register('/sw.js')`. Αυτό εγκαθιστά worker με `BUILD='unversioned'`, που στο activate σβήνει την `guest-guide-<build>` cache (χάνονται οι offline σελίδες που είχε επισκεφθεί ο guest) και στέλνει `RUNTIME_VERSION` με διαφορετικό build, οπότε εμφανίζεται update banner για «unversioned». Στην επόμενη φόρτωση ξαναγυρίζει στον versioned worker με νέο install/cache. Το σχόλιο «offline: keep the current registration's script» περιγράφει μόνο το throw path.
- Impact: Παροδικό: χάσιμο offline cache και ένα ψευδές «Local guide updated» banner στη διάρκεια ενός restart. Δεν επηρεάζει δεδομένα ή ασφάλεια.
- Fix: Register only when a versioned URL is known; otherwise wire the banner to the existing registration: `let scriptUrl: string | null = null; try { ...; if (meta.version && meta.build) scriptUrl = `/sw.js?v=...&build=...`; } catch { /* offline or unreachable */ } const reg = scriptUrl ? await navigator.serviceWorker.register(scriptUrl) : await navigator.serviceWorker.getRegistration(); if (!reg) return;`. This keeps the updatefound/waiting listeners working on the current registration, and it never installs the 'unversioned' worker. Behavior changes: a first install waits until /version.json answers (it is always in the image), and a dev run with NEXT_PUBLIC_FORCE_SW_DEV and no prior `npm run build` (the file is gitignored) would not register a worker. Fix the comment either way. Given the Nit severity, fixing only the comment is also acceptable.
- Fix risk: Χαμηλός; πρέπει να μη σπάσει η πρώτη εγκατάσταση (καμία registration ακόμη) — τότε απλώς δεν εγκαθίσταται worker μέχρι το επόμενο load. Επιβεβαίωση με headless Chrome όπως στο F4.
- Verification:
  - refute: SUSPECTED — The code path is real: a non-OK /version.json leaves scriptUrl as '/sw.js' and the component calls register('/sw.js'). The comment at L33 is also misleading, because the catch path does not keep the current registration's script; it calls register('/sw.js') as well. The finding's main trigger does not hold up, though. A transient 502/503 from Nginx during a restart or rollout of `web` would hit /sw.js…
  - reproduce: CONFIRMED — Traced the code path. At src/components/PwaManager.tsx:L24-L34, `scriptUrl` defaults to '/sw.js'. The versioned URL is set only when `res.ok` is true and the body has both `version` and `build`. A non-OK response (such as a 502/503 while `web` restarts), or an OK response missing those fields, throws nothing, so `register('/sw.js')` still runs. The comment at L33 ('offline: keep the current registratio…

### R-254: The runbook prescribes a separate migration database role but neither the Compose file nor any document creates it or grants the application role access to migrated tables
- Severity: Low
- Category: Maintainability
- Status: CONFIRMED
- Location: scripts/README.md:L151-L160 (Host layout); docs/architecture/deployment-target.md:L156-L177 (gap list)
- Evidence:

  ```text
  scripts/README.md:L157-L158: "- `MIGRATE_ENV_FILE` — root-owned file for `migrate deploy`, with the migration role's `DATABASE_URL` (least privilege: the application role must not own DDL);"
  docker/docker-compose.prod.yml:L27-L30: a single `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` (the only role the image creates)
  scripts/smoke-production-image.ts:L184: "// The smoke uses one database role for both files; production uses a separate migration role."
  Reference search: `grep -rn -i "ALTER DEFAULT PRIVILEGES\|CREATE ROLE\|migration role\|GRANT " docs scripts docker README.md SECURITY.md` → no role-setup instructions anywhere (only the runbook sentence and the smoke comment).
  ```

- Problem: With two roles, tables created by `prisma migrate deploy` are owned by the migration role; the application role gets no privileges on new tables unless `ALTER DEFAULT PRIVILEGES` / `GRANT` is configured. The runbook states the requirement without the steps, and the only tested path (the smoke) uses one role.
- Impact: An operator who follows the least-privilege sentence creates a second role, runs the release sequence, and the web container fails at `/api/health/ready` or the first query with `permission denied for table ...` after every migration that adds a table. Nothing in the repository explains why or how to prevent it, and the smoke never exercises this configuration.
- Fix: Keep the least-privilege requirement, because ADR L93-L95 mandates it. Add a one-time role setup block to scripts/README.md 'Host layout', run as POSTGRES_USER, for example:
```sql
CREATE ROLE qr_migrator LOGIN PASSWORD '<from secret store>';
CREATE ROLE qr_app LOGIN PASSWORD '<from secret store>';
ALTER DATABASE <POSTGRES_DB> OWNER TO qr_migrator;  -- PostgreSQL 15+ no longer gives PUBLIC CREATE on schema public (release notes; not verified in this run)
ALTER DEFAULT PRIVILEGES FOR ROLE qr_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qr_app;
ALTER DEFAULT PRIVILEGES FOR ROLE qr_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO qr_app;
```
This must run before the first `migrate`, so that `_prisma_migrations` and every table are created by qr_migrator and covered by the defaults. For a database already migrated by another role, grant on the existing tables or reassign ownership first.

Until a smoke run exercises two distinct roles, add 'two-role migration/app setup untested' to the ADR gap list. Track the stale EXPECTED_MIGRATION separately as a new finding.
- Fix risk: Docs only. If the two-role path is kept, it needs a smoke run with `MIGRATE_ENV_FILE` pointing at a distinct role before being called supported.
- Verification:
  - refute: CONFIRMED — Could not refute. The runbook and the Compose header both prescribe a separate migration role, and the ADR makes distinct roles mandatory. Nothing in the repository creates that role or grants the application role access to tables the migrator creates. No migration contains a real GRANT/OWNER/ALTER DEFAULT PRIVILEGES statement; the only grep hits are table names like onsite_grants and booking_claim_gra…  The impact needs two corrections. (1) On the FIRST two-role deploy the failure is loud. The app role cannot SELECT `_prisma_migrations` (owned by the migrator), so readiness returns false, the image HEALTHCHECK fails and `$C up -d --wait web` fails. (2) On LATER migrations that add a table, readiness does NOT catch missing grants. It only reads `_prisma_migrations`, so the new feature fails at its first query with `permission denied`, silently. That happens whenever the operator fixed step (1) with one-off GRANTs instead of ALTER DEFAULT PRIVILEGES.  Severity stays Low. It is docs only, the target is still 'accepted but not production-ready', and the first failure is visible before traffic.  On the proposed fix: the option 'drop the least-privilege sentence' contradicts the ADR (L93-L95) and should not be taken without an ADR amendment. Document the setup instead.  Side observation (new, not part of this finding, not in REVIEW.md): `EXPECTED_MIGRATION` in the readiness route is still `20260715110000_remove_unused_legacy_models`, but five later migrations exist (20260924120000..20260924124000). PROGRESS.md:L442 says it must be bumped on every migration change, so readiness does not prove this commit's schema is applied.
  - reproduce: CONFIRMED — The runbook and the Compose header both require a separate migration role, but the bundled postgres service only creates the single POSTGRES_USER role. No document in docs/, scripts/, docker/, README.md, SECURITY.md or prisma/migrations contains CREATE ROLE, GRANT or ALTER DEFAULT PRIVILEGES steps. The only exercised path (the smoke test) writes the same env content to both files, and its own comment s…

### R-255: Docs left stale or overstated by the S1/S2/C10 deletions: dropped privacy holds, non-existent production profile, a 32-character `SECURITY_PEPPER` rule the schema does not enforce, and npm scripts named as the production workers
- Severity: Low
- Category: Maintainability
- Status: CONFIRMED
- Location: README.md:L12,L38-L43; scripts/README.md:L27-L32,L65,L84-L95; docs/architecture/deployment-target.md:L158-L159; .env.example:L1
- Evidence:

  ```text
  README.md:L12: "- Operations: database-backed security audit events, alert rules, privacy requests/holds, retention, and retry workers." — prisma/migrations/20260924122000_remove_dead_tables/migration.sql:L29: DROP TABLE IF EXISTS "privacy_holds"; `grep -rn PrivacyHold prisma/schema.prisma` → none.
  scripts/README.md:L29-L32: "- production: `.env.production.local`, `.env.production`, `.env` / Production deliberately excludes `.env.local`."; L85-L90: `npm run system:check -- --profile development` ... `system:down -- --profile development`; L95: "Production disables that fallback and fails closed." — scripts/system-orchestrator.sh:L128-L131 accepts `--profile development` as a no-op and there is no production profile (L4-L5).
  scripts/README.md:L65: "`SECURITY_PEPPER` and `CLAIM_TOKEN_PEPPER` (at least 32 characters; ...)" — src/lib/runtime-env-schema.js:L47: SECURITY_PEPPER: z.string().min(16, ...), L48: CLAIM_TOKEN_PEPPER: z.string().min(32, ...); `grep -n SECURITY_PEPPER src/lib/env.ts docs/security/runtime-credential-contract.md` → none.
  README.md:L40-L41: "The production workers are: - a one-minute leased outbox drain ... (`npm run outbox:drain`); - ... (`npm run operations:check`)." — CLAUDE.md:L38 and scripts/README.md:L204-L206 say the production workers are the Compose `outbox`/`operations` services and the npm scripts are development runs.
  docs/architecture/deployment-target.md:L158-L159: "These blockers were re-checked against the repository on 2026-09-24 and remain open" while the list itself was rewritten in F1–F4 (PROGRESS.md task log 2026-09-25/27).
  .env.example:L1: "# Copy to .env.local for development." vs README.md:L26: "so no manual copy of `.env.example` is needed."
  ```

- Problem: Each statement describes something the tree no longer has (privacy holds, production profile and its env-file order, systemd-era `--profile development` flags) or overstates a rule (32-character `SECURITY_PEPPER`; the schema accepts 16). README's Operations section names the tsx npm scripts as the production workers although the ADR forbids running TypeScript from a checkout in production and the Compose services are the production path.
- Impact: An operator generating a 20-character `SECURITY_PEPPER` is told it is invalid when it is accepted; another reads README and schedules `npm run outbox:drain` on the VPS (the path the ADR rejects and that has no checkout on the host). The stale `--profile development` commands keep the flag alive for compatibility only because the runbook still shows it. None of this changes runtime behaviour; it costs operator trust and time.
- Fix: Docs only. Changes in the finding's order:
- README.md:L12: drop "/holds".
- README.md:L38-L41: say that production runs three images of one commit, and that the workers are the Compose `outbox`/`operations` services (link to 'Worker schedule'); the npm scripts are development runs.
- scripts/README.md:L27-L32: replace with: development loads `.env.development.local`, `.env.local`, `.env.development`, `.env` (dotenv, same precedence as `next dev`); production images contain no `.env*` files (`.dockerignore`), so the configuration comes only from `APP_ENV_FILE`/`MIGRATE_ENV_FILE`. Do not claim that Next excludes `.env.local` in production; @next/env 16.3.6 loads it.
- scripts/README.md:L65: state the real minimums (SECURITY_PEPPER 16, CLAIM_TOKEN_PEPPER 32) and recommend `openssl rand -hex 32` for both. Alternatively, raising the schema minimum to 32 is a behaviour change that needs approval.
- scripts/README.md:L85-L90: drop `-- --profile development`, since the flag stays accepted as a no-op per S1.
- scripts/README.md:L95: drop the 'Production disables that fallback' sentence.
- deployment-target.md:L159: update the re-check date after re-verifying the list.
- .env.example:L1: say that it is a reference and that `npm run ensure-pepper` writes `.env.local`.

Keep the removal of the orchestrator no-op flags as a separate later step.
- Fix risk: Docs only. Removing the `--profile`/`--skip-build` no-ops from the orchestrator later would break any external shell alias still passing them; keep that as a separate step.
- Verification:
  - refute: CONFIRMED — Every sub-claim checks out against the tree. None repeats a recorded finding: R-107 and R-132 were about runtime failures and are fixed; this is residual doc drift. Several edits were made in fff4283 itself, which rewrote README L12/L38-L43 but kept 'holds' and named the tsx scripts as production workers.  Confirmed sub-claims: (a) README L12 mentions privacy holds. The table was dropped in C10, and `PrivacyHold` no longer exists outside REVIEW/PROGRESS. (b) scripts/README L30-L32 gives a production env order that belonged to the deleted orchestrator production profile (bd50a80:scripts/system-orchestrator.sh L317). It is also factually wrong for Next 16.3.6: @next/env loads `.env.local` in production mode. The runtime is only safe because `.dockerignore` excludes `.env` and `.env.*`, so the image has no env files. README L43 is true only for that reason. (c) The `--profile development` flags are deliberately kept as no-ops per S1 (PROGRESS.md:L315). Showing them in the runbook is redundant, not wrong. L95 'Production disables that fallback' refers to a profile that no longer exists. (d) The schema minimum for SECURITY_PEPPER is 16, not 32. The runbook states a stricter rule, which does no harm; the finding's 'told it is invalid' impact is overstated, and this part is a Nit. (e) README L38-L41 names `npm run outbox:drain` / `operations:check` (tsx from a checkout) as the production workers, contradicting the Compose services, scripts/README L201-L203 and the ADR ban on running TypeScript from a checkout. This is the most misleading item. README L38 also says 'one immutable Docker image' while L45 describes three. (f) ADR L158-L159 still says the gaps were re-checked on 2026-09-24, while L161-L163 was rewritten on 2026-09-27. (g) .env.example L1 says 'Copy to .env.local' while README L26 says no copy is needed. This is a mild inconsistency.  The grouped severity stays Low. Nothing changes runtime behaviour, but (e) could lead an operator to schedule tsx workers on the VPS.
  - reproduce: CONFIRMED — Every sub-claim except one holds against HEAD fff4283. (1) README.md:L12 still lists privacy "holds" although migration 20260924122000 drops privacy_holds and the schema has no PrivacyHold model. (2) The runbook says both peppers need at least 32 characters, but the schema requires 16 for SECURITY_PEPPER (32 only for CLAIM_TOKEN_PEPPER), and there is no stricter check in the superRefine. (3) README.md:…

### R-256: `check-pepper.js` and the orchestrator report an empty or short `SECURITY_PEPPER`/`GUEST_JWT_SECRET` as missing, but `ensure-pepper.js` treats the same lines as present and does nothing
- Severity: Low
- Category: Logic
- Status: CONFIRMED
- Location: scripts/ensure-pepper.js:L37 (SECURITY_PEPPER only; L46 GUEST_JWT_SECRET is intentionally empty-tolerant)
- Evidence:

  ```text
  scripts/ensure-pepper.js:L37: if (!/^\s*SECURITY_PEPPER\s*=\s*/m.test(existing)) {
  scripts/ensure-pepper.js:L46: if (!/^\s*GUEST_JWT_SECRET\s*=\s*/m.test(existing)) {
  (the new keys use `\S`: L27 DATABASE_URL, L42 CLAIM_TOKEN_PEPPER, L51 ORIGIN_PROXY_SHARED_SECRET)
  scripts/check-pepper.js:L22: SECURITY_PEPPER: /^\s*SECURITY_PEPPER\s*=\s*\S/m,
  scripts/check-pepper.js:L25: const missing = Object.keys(inEnvFile).filter((name) => !process.env[name] && !inEnvFile[name].test(envFile));
  scripts/system-orchestrator.sh:L297-L310: maybe_ensure_pepper() { if [[ -n "${SECURITY_PEPPER:-}" && ${#SECURITY_PEPPER} -ge 16 ]]; then return; fi ... npm run ensure-pepper ... load_environment }
  ```

- Problem: This diff added `\S` to the new `ensure-pepper` checks and to `check-pepper.js`, but left the two pre-existing `SECURITY_PEPPER`/`GUEST_JWT_SECRET` regexes without it. A `.env.local` with `SECURITY_PEPPER=` (empty) or a value shorter than 16 characters is "missing" for `predev` and for `maybe_ensure_pepper`, yet `ensure-pepper` prints "All expected secrets present ... no action taken" and appends nothing.
- Impact: `npm run dev` prints "SECURITY_PEPPER not found ... Run `npm run ensure-pepper`", the user runs it, it reports nothing to do, and the server still fails environment validation at start (runtime-env-schema.js:L47 min 16). `npm run system:up` loops the same way once (warn → ensure-pepper no-op → Zod failure at `validate_runtime_environment_contract`). Only reachable when someone blanks or truncates the value; `.env.example` ships a 28-character placeholder.
- Fix: Change only line 37: `if (!/^\s*SECURITY_PEPPER\s*=\s*\S/m.test(existing)) {`. Leave GUEST_JWT_SECRET (L46) as it is, because an empty value is the documented development default (.env.example:L11,L15), and nothing reports it as missing. No 'remove the empty line' warning is needed. dotenv.parse (both the installed dotenv 17.4.2 and Next's @next/env) keeps the last definition in a file, so the appended 64-hex line overrides the empty one for `next dev` and for the orchestrator's load_environment. Regression test in tests/unit/ensure-pepper.test.ts: write `SECURITY_PEPPER=\n` to .runtime/ensure-pepper-test/.env.local, run the script, and assert the file matches /^SECURITY_PEPPER=[0-9a-f]{64}$/m and the output contains 'Generated SECURITY_PEPPER'. This fails on the current script. Short non-empty values (1-15 chars) remain a one-shot no-op in maybe_ensure_pepper, followed by the explicit Zod min(16) error; that is acceptable and out of scope.
- Fix risk: The append-only design means an empty existing line still wins under dotenv's first-definition rule; the warning path is the safe minimal change. Add a case to tests/unit/ensure-pepper.test.ts with `SECURITY_PEPPER=` present.
- Verification:
  - refute: CONFIRMED — The bug is real, but only for an empty SECURITY_PEPPER. Commit fff4283 changed check-pepper.js to treat `SECURITY_PEPPER=` (empty) as missing and added `\S` to the new ensure-pepper keys. It left the older SECURITY_PEPPER regex at ensure-pepper.js:L37 unchanged. So with `SECURITY_PEPPER=` in .env.local, `predev` tells the user to run `npm run ensure-pepper`. That script then prints 'no action taken', a…  Three parts of the finding are wrong and need correcting. (1) GUEST_JWT_SECRET: neither check-pepper.js nor maybe_ensure_pepper checks it. An empty value is the documented development default: .env.example:L11 says 'Development may leave the JWT values empty', .env.example:L15 is `GUEST_JWT_SECRET=`, the schema maps '' to undefined, and guestSession.ts falls back to a process-local secret. The unchanged regex there is intended, and adding `\S` to it would change the documented copy-from-example behaviour. (2) Short values: check-pepper's `\S` accepts `SECURITY_PEPPER=abc`, so it does not report short values. Only the orchestrator's length >= 16 check catches them, and the proposed fix does not change that case. It ends with the clear Zod message 'SECURITY_PEPPER must be at least 16 characters'. (3) The fix_risk claim that 'dotenv keeps the first definition' is wrong within a single file. Both the installed dotenv 17.4.2 and Next 16.3.6's @next/env assign `obj[key] = value` in the parse loop, so the last definition wins. The orchestrator also uses dotenv.parse per file. An appended `SECURITY_PEPPER=<hex>` after an empty line therefore takes effect, so the suggested warning path is not needed.  Severity stays Low: it is dev-only tooling, it needs someone to blank the value (.env.example ships a non-empty placeholder), and startup still fails with an explicit schema message. REVIEW.md and PROGRESS.md contain no existing R-id for this; R-132 covers only DATABASE_URL.
  - reproduce: CONFIRMED — The core defect holds, but only in a narrower form than stated. The line numbers are right. scripts/ensure-pepper.js:L37 and L46 use `/^\s*KEY\s*=\s*/m` with no value predicate, so a present-but-empty or short SECURITY_PEPPER counts as present and nothing is appended. The orchestrator's `maybe_ensure_pepper` (scripts/system-orchestrator.sh:L297-L310) treats a SECURITY_PEPPER shorter than 16 characters…

### R-257: `allowScripts` is advisory only: without `strict-allow-scripts`, unlisted dependencies still run install scripts; the `sharp@0.35.4` entry has no script
- Severity: Low
- Category: Dependencies
- Status: CONFIRMED
- Location: package.json:L159-L168; docker/Dockerfile.security:L20, L84; docker/migrate/package.json
- Evidence:

  ```text
  package.json:L159-168:
    "allowScripts": {
      "@prisma/engines@7.8.0": true,
      "bcrypt@6.0.0": true,
      ...
      "sharp@0.35.4": true,
  npm 11.18 (@npmcli/config definitions.js:L2375-2390): 'strict-allow-scripts' default false: 'If true, turn the install-script policy from a warning into a hard error: any dependency with install scripts not covered by allowScripts will fail the install instead of running with a notice.'
  @npmcli/arborist rebuild.js:L202-208: only `isScriptAllowed(node, allowScripts) === false` skips a script.
  `ls .npmrc docker/migrate/.npmrc`: No such file or directory.
  Lockfile `hasInstallScript` packages: @prisma/engines, bcrypt, esbuild, fsevents, prisma, puppeteer, unrs-resolver (no sharp); node_modules/sharp/package.json has no install/prepare script.
  ```

- Problem: The allowlist reads like a supply-chain control, but npm 11.18 runs the install scripts of any unlisted package and only prints a notice. Neither the root nor docker/migrate sets `strict-allow-scripts`, and docker/migrate/package.json has no allowScripts at all. The `sharp@0.35.4` entry is dead because sharp 0.35 ships no install script.
- Impact: If a compromised or new transitive dependency with a postinstall script enters the lockfile (via `npm install`/`npm update`), it runs on the developer machine and in the Docker builder without failing the install, contrary to what the allowlist suggests.
- Fix: Drop `"sharp@0.35.4": true` (package.json:L164). Add a root `.npmrc` with `strict-allow-scripts=true` for local installs. In docker/Dockerfile.security, add `--strict-allow-scripts` to the `npm ci` at L20 and L84 instead of copying `.npmrc` into the stages. Add `"allowScripts": {"@prisma/engines@7.10.0": true, "prisma@7.10.0": true}` to docker/migrate/package.json (7.8.0 before R3-A4). Verify with a local `npm ci` and a Docker build. Keep the allowScripts versions in step with every Prisma bump.
- Fix risk: `npm ci` fails for any script-bearing package missing from the list. The current list covers every `hasInstallScript` entry in the root lock, so the risk is low. The Docker build copies only package.json/package-lock.json before `npm ci` (Dockerfile.security:L17), so `.npmrc` must be copied too.
- Verification:
  - refute: CONFIRMED — npm 11.18.0, the version run locally and installed in both Docker stages, defines `strict-allow-scripts` with default false. When it is false, a dependency not covered by `allowScripts` still runs its scripts, with only a notice. Arborist skips a dependency's scripts only when `isScriptAllowed(...) === false`, that is, an explicit denial. The effective config here has strict-allow-scripts=false. There…  The proposed fix needs one correction for Docker. Copying an `.npmrc` works, but passing `--strict-allow-scripts` on the two `npm ci` lines is smaller. The migrate manifest test compares only `dependencies`, so adding `allowScripts` to docker/migrate/package.json does not break it. Severity stays Low. The lockfile pins exact versions, so the risk arises only when a new script-bearing package enters through `npm install`/`update`, and npm still prints a notice.
  - reproduce: CONFIRMED — npm 11.18.0 is installed and `strict-allow-scripts` defaults to false. The effective config (`npm config get`) is false, and there is no project, docker/migrate or user .npmrc. In arborist rebuild.js, only a strict `=== false` result from isScriptAllowed skips scripts. isScriptAllowed returns null for unreviewed packages, so their install scripts still run. The Dockerfile runs a plain `npm ci` (L20, L8…

### R-258: The `next@16.3.6` override block no longer has a security effect, and its documented rationale is stale
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: package.json:L154-L157; docs/release-verification.md:L90-L92
- Evidence:

  ```text
  package.json:L154-157:
      "next@16.3.6": {
        "postcss": "8.5.28",
        "sharp": "$sharp"
      }
  node_modules/next/package.json (16.3.6): postcss '8.5.23', sharp '^0.35.4'
  GHSA-fxqj-rqcc-2cmp (postcss): vulnerable <= 8.5.22, patched 8.5.23 (api.github.com/advisories/GHSA-fxqj-rqcc-2cmp)
  sharp GHSA-rgj7-g3m4-5g8c: fixed in 0.35.4 (bd50a80:REVIEW.md R-001)
  Advisory DB query affects=postcss@8.5.23: no advisory.
  docs/release-verification.md:L89-92: 'keep Next's nested copies on the patched direct versions (postcss GHSA-fxqj-rqcc-2cmp, sharp GHSA-rgj7-g3m4-5g8c). Rename the key whenever next is bumped.'
  ```

- Problem: Next 16.3.6 itself requires postcss 8.5.23 and sharp ^0.35.4, both already patched for the advisories the docs cite. The override now only dedupes postcss and must be renamed on every Next bump, or npm silently stops applying it.
- Impact: Maintenance cost and misleading documentation, with no current security effect. A reviewer reading the docs would believe removing it reintroduces advisories.
- Fix: Minimal: rewrite docs/release-verification.md:L90-L92 to say that Next 16.3.6 already pins patched postcss 8.5.23 and sharp ^0.35.4. The block only dedupes postcss to the direct 8.5.28 and silently lapses on a Next bump. It can then be kept or removed. Remove the block only with approval, because that requires an `npm install` to regenerate package-lock.json (a nested postcss@8.5.23 under next). After removal, run build, lint and tests. Leave `baseline-browser-mapping` as it is.
- Fix risk: Removing it changes package-lock.json (a nested postcss copy). Run build, lint and tests afterwards. Documentation-only change otherwise.
- Verification:
  - refute: CONFIRMED — Next 16.3.6 declares `postcss: "8.5.23"` (exact) and optional `sharp: "^0.35.4"`. The GitHub advisory DB lists GHSA-fxqj-rqcc-2cmp as `<= 8.5.22`, patched in 8.5.23. No listed postcss advisory covers 8.5.23; the newest range is `<= 8.5.22`. Next's sharp range already excludes the versions vulnerable to GHSA-rgj7-g3m4-5g8c (fixed in 0.35.4, per review-1 R-001). Without the `$sharp` reference it would de…  On the fix: deleting the block requires regenerating package-lock.json, which is an `npm install` and needs owner approval under the installation rule. A docs-only correction is the smaller change and leaves nothing broken, because keeping the dedupe is harmless. The `baseline-browser-mapping` override correctly stays. This does not repeat any recorded finding: R-001 introduced the override, and nothing records it as stale.
  - reproduce: CONFIRMED — The installed next 16.3.6 declares postcss 8.5.23 as an exact dependency and sharp ^0.35.4 as optional. GHSA-fxqj-rqcc-2cmp affects postcss <= 8.5.22 and is patched in 8.5.23, so Next's own requirement is already patched. The only effect of the postcss override is to dedupe to the root 8.5.28: the lockfile has no nested node_modules/next/node_modules/postcss. The root sharp 0.35.4 already satisfies ^0.…

### R-259: Theft-signal audit write (X2) is asserted in only one of its three branches; the two contention branches the overlap suites drive are unchecked
- Severity: Low
- Category: Tests
- Status: CONFIRMED
- Location: src/lib/prisma-repositories/refreshTokenRepository.ts:L531-L551 (untested audit writes); tests/integration/auth/refresh-overlap-classification.test.ts:L554-L621 (state reader without audit rows), L1371-L1478, L1623-L1658
- Evidence:

  ```text
  refreshTokenRepository.ts:
    L531 if (result.disposition === 'suspicious') {
    L532   await revokeFamilyGraph(tx, candidate.familyId, now, 'suspicious_refresh_overlap');
    L533   await recordRefreshTheftSignal(tx, candidate.familyId, 'suspicious_refresh_overlap');
    ...
    L548 if (candidate.revokedAt) {
    L549   await revokeFamilyGraph(tx, candidate.familyId, now, 'refresh_token_replay');
    L550   await recordRefreshTheftSignal(tx, candidate.familyId, 'refresh_token_replay');

  `git grep -n "portal.refresh_token_replay" -- tests` -> only tests/integration/auth/refresh-revoked-session-regression.test.ts:773, inside the non-contended test 'revokes the family when a predecessor is replayed after its rotation completed' (L711-L780), which reaches the L408 branch.
  refresh-overlap-classification.test.ts readAuthorizationState (L554-L621) reads refreshTokenFamily/refreshToken/session only, no securityAuditEvent. The route-level overlap tests (refresh-revoked-session-regression.test.ts L914-L1002, 'different-context' and 'invalid-binding') also never query audit events.
  PROGRESS.md X2: "asserts exactly one high event with the reason" (one test only).
  ```

- Problem: X2 added the high-severity `portal.refresh_token_replay` audit event in three branches. Only the direct replay branch (L408) is asserted. The suspicious-overlap branch (L533) and the replay-after-contention branch (L550) are executed by the overlap suites ('different-context', 'same-context-invalid-binding', 'different-context-owner-rollback', 'completed-replay-contention'), but no assertion checks that exactly one event is written there. Nothing checks that the 'authorization_race' and 'concurrent' paths write none either.
- Impact: A refactor that drops or duplicates `recordRefreshTheftSignal` in the contention path (the path an attacker replaying a stolen token from another device takes) passes the integration gate. The 'Recent high-severity security events' alert (R-159/O12) would then stay silent for the theft pattern it was added for.
- Fix: 1) In refresh-overlap-classification.test.ts readAuthorizationState, add `theftSignals: await client.securityAuditEvent.findMany({ where: { eventType: 'portal.refresh_token_replay' }, select: { severity: true, details: true } })`. Assert exactly `[{ severity: 'high', details: { reason: 'suspicious_refresh_overlap', familyId: PRIMARY_FAMILY_ID } }]` in different-context, same-context-invalid-binding and different-context-owner-rollback. Assert `[]` in same-context and rollback-then-retry, which also use readAuthorizationState via L1247. The family-isolation case needs the same query added next to readFamilyRotationState if `[]` is wanted there too. 2) In completed-replay-contention, assert exactly one event with reason 'refresh_token_replay'. This guards against a double write, but it most likely covers L408 (the owner wins the User row lock), not L550. 3) To cover L549-L550 deterministically, add one case where the root generation is already rotated and the advisory marker for ROOT_GENERATION_ID is held by a plain client transaction (`pg_advisory_xact_lock`, like observeCompletedRotationCommit does) rather than by a real rotating owner. The contender then gets generation_contended/authoritative_recheck, runs the recheck transaction alone, and must return 'replayed' with exactly one 'refresh_token_replay' event. Optionally add the same audit assertion to the route tests at refresh-revoked-session-regression.test.ts L914 and L959. Test-only change. Verify it with `npm run test:integration`.
- Fix risk: Test-only change. It must be run through `npm run test:integration` (Docker). The expected counts follow from the code paths read above; if the completed-replay case yields two events, that is a real double-write to investigate, not a reason to relax the test.
- Verification:
  - refute: CONFIRMED — The core claim holds. X2 added recordRefreshTheftSignal in three branches (L408, L533, L550). The only assertion on `portal.refresh_token_replay` in the repo is refresh-revoked-session-regression.test.ts:L772-L779, in a non-contended replay test that reaches L407-L408. The suspicious-overlap branch (L531-L538) runs in several integration cases, and none of them checks the audit row: different-context (…  One part of the finding is overstated. It says 'completed-replay-contention' exercises L550. In that scenario the root generation is already revoked, so the contender's initialGenerationActive is false. That means it returns generation_contended with disposition 'authoritative_recheck' (L378). The owner holds the advisory marker and queues on the User row lock first; the test waits for that at L814 before starting the contender. PostgreSQL row-lock waiters are served in queue order, so the owner most likely proceeds first and hits L407-L408. The contender then finds the family revoked and returns 'invalid' through L541-L543. L549-L550 runs only if the contender takes the User lock first. The test cannot tell which happened: it sorts the two statuses (L1451-L1454), and both branches write the same familyReason 'refresh_token_replay'. So L550 is probably not exercised deterministically by any test. That makes the gap slightly wider than stated and means the proposed completed-replay assertion does not cover L550. I could not confirm the lock ordering by running it, because Docker and integration runs are not allowed in this read-only mode.  Severity stays Low. This is a test-only gap. Production behaviour is correct today (each branch writes exactly one event inside the revoking transaction, per L196-L211). The risk is a silent regression of the alert producer for one theft pattern on a small deployment.
  - reproduce: CONFIRMED — The three call sites are exactly where the finding says (L408, L533, L550), and all three write the same high-severity 'portal.refresh_token_replay' event through recordRefreshTheftSignal (L196-L211). Searching every test directory for the event type, for securityAuditEvent and for theftSignals finds only one assertion on this event: refresh-revoked-session-regression.test.ts:772-778. It sits in the no…

### R-260: The theft-signal assertion depends on test order: resetAuthFixtures never clears security_audit_events and the query is unscoped
- Severity: Low
- Category: Tests
- Status: CONFIRMED
- Location: tests/integration/auth/support/auth-fixtures.ts:L199-L210 (reset); assertion at tests/integration/auth/refresh-revoked-session-regression.test.ts:L772-L779
- Evidence:

  ```text
  auth-fixtures.ts L203-L209:
      await prisma.$transaction([
        prisma.refreshToken.deleteMany(),
        prisma.refreshTokenFamily.deleteMany(),
        prisma.session.deleteMany(),
        prisma.booking.deleteMany(),
        prisma.user.deleteMany(),
      ]);
  refresh-revoked-session-regression.test.ts L772-L779:
      const theftSignals = await withTestPrismaClient(authTarget, (prisma) => prisma.securityAuditEvent.findMany({
        where: { eventType: 'portal.refresh_token_replay' },
        select: { severity: true, details: true },
      }));
      expect(theftSignals).toEqual([{ severity: 'high', details: { reason: 'refresh_token_replay', familyId: expect.any(String) } }]);
  Later tests in the same file and database write the same event type: L782 it.each (4 completed replays), L914 different-context overlap, L959 invalid-binding overlap.
  ```

- Problem: All tests in the file share one database. The afterEach reset (resetAuthFixtures) leaves audit rows in place, and the X2 assertion expects exactly one row of that event type in the whole table. It passes only because none of the five tests before it (L493-L709) produce a replay event.
- Impact: Reordering the tests, inserting a new replay/overlap test above L711, or enabling Vitest `sequence.shuffle` makes the X2 regression test fail with 2–7 rows although the code is correct. CLAUDE.md forbids tests that depend on order or shared state.
- Fix: Only the first option works: add `prisma.securityAuditEvent.deleteMany(),` to the resetAuthFixtures $transaction array (auth-fixtures.ts L203-L209). SecurityAuditEvent has no foreign-key relations, so its position in the array does not matter. Drop the familyId-scoped alternative, because every chain in this file shares REVOKED_SESSION_FIXTURE.familyId. Fix risk: logout-characterization never reads security_audit_events, so the extra delete cannot affect it. Verify with `npm run test:integration` (needs local Docker).
- Fix risk: Minimal. logout-characterization asserts no audit rows, so the extra deleteMany cannot change its outcome. Verify with `npm run test:integration`.
- Verification:
  - refute: CONFIRMED — The latent order dependence is real. resetAuthFixtures (afterEach) deletes only the refresh tokens, families, sessions, bookings and users. SecurityAuditEvent is not deleted anywhere in the file or its helpers, and the X2 assertion reads the whole table. The whole file shares one isolated database (L470), and Vitest runs its tests in declaration order: no shuffle is set in vitest.integration.config.ts,…
  - reproduce: CONFIRMED — I traced this statically. I did not run it, because the integration suite needs Docker and the task is read-only. The test file creates one isolated database in beforeAll, and describe.sequential runs every test against it. The afterEach reset (resetAuthFixtures) deletes refreshToken, refreshTokenFamily, session, booking and user rows, but it never deletes securityAuditEvent. SecurityAuditEvent has no…

### R-261: The claim eligibility 'defect gate' matrix never reaches the claims route since the exchange step was added; its identity/remember parameters are inert
- Severity: Low
- Category: Tests
- Status: CONFIRMED
- Location: tests/integration/auth/claim-ineligible-window-regression.test.ts:L405-L474 (matrix) and L285-L301 (early return); sibling reference is tests/integration/auth/claim-lifecycle-characterization.test.ts:L571-L581, not L525-L534
- Evidence:

  ```text
  L405-L415: it.each([['new identity without remember-me', false, false], ['new identity with remember-me', false, true], ['existing identity without remember-me', true, false], ['existing identity with remember-me', true, true]])('rejects a +30-day grant for %s without side effects', ...)
  L469:        rateLimitRecords: 1,
  L507-L512: ['expired', ...,1], ['revoked', ...,1], ['consumed', ...,1], ['unknown', ...,1]
  performClaimRequest L285-L299: if (!exchangeResponse.ok) { ... return { response: exchangeResponse, ... } }   // claims route not called
  portalAuthService.ts prepareBookingClaimExchange L169-L179 rejects consumed/revoked/expired/ineligible grants before any cookie is issued.
  `git show b1a82d5 -- tests/integration/auth/claim-ineligible-window-regression.test.ts`: '-        rateLimitRecords: 2,' -> '+        rateLimitRecords: 1,' and the grant-state cases 2 -> 1 (the claims route adds identity+phone records; the exchange adds only one).
  ```

- Problem: b1a82d5 ('security: remove claim tokens from urls') routed the suite through /api/portal/claim-exchange. Every negative case is now rejected there, and the changed rate-limit counts (2 → 1) show that /api/portal/claims is never invoked. `includeExistingUser` and `remember` therefore change nothing in the tested path: the four +30-day cases execute the same code. The only route-level coverage of consumeBookingClaimGrant's own grant-state re-check (L203-L207, e.g. a grant revoked or expired after the guest exchanged it) is gone. claim-lifecycle's sibling-grant check (L525-L534) is also rejected at the exchange. The consume-time temporal check is still covered directly by portal-eligibility-consistency.test.ts (claimDecision calls consumeBookingClaimGrant).
- Impact: The suite reports 9 passing cases for claim rejection, but they cover one function (prepareBookingClaimExchange). No test covers the realistic race: the guest exchanges the token, then the host issues a new grant or uses 'Reset access' (which revokes older grants), and then the guest submits the claim form. That path is still safe today because the `updateMany` guard (L246-L255 filters consumedAt/revokedAt/expiresAt), but nothing would detect a regression in either guard's interaction with the route's 401/cookie-clearing contract.
- Fix: Keep the matrix, but route it to what it was meant to guard. Seed an eligible booking (e.g. startOffset 0, endOffset 7). Run the exchange. Before posting the claim, move the booking dates to +30/+37 through withTestPrismaClient; this needs an optional `beforeClaim` hook, or a split of exchange and claim, in performClaimRequest. Then post the claim with the exchange cookie and assert: 401 UNAUTHORIZED, exchange cookie cleared (maxAge 0), no user/session/refresh/terms/audit rows, existing user password and origin unchanged, grant not consumed. This makes includeExistingUser and remember meaningful again at consume time. Keep a single +30-day exchange-level case for prepareBookingClaimExchange. Add two post-exchange cases through the same hook: set `revokedAt = now`, and separately `expiresAt` in the past, on the grant. The consumed-after-exchange case is already covered by claim-concurrency A3 and does not need one. Update the rateLimitRecords expectations for cases that reach the claims route (exchange 1 key + claims 2 keys). Test-only change; verify with `npm run test:integration`.
- Fix risk: Test-only change. Removing parameter rows lowers the case count reported by verify:release. Run `npm run test:integration`.
- Verification:
  - refute: CONFIRMED — The core claim holds. The four +30-day cases are rejected in the claim-exchange route by prepareBookingClaimExchange. performClaimRequest returns early on a non-ok exchange, so POST /api/portal/claims and consumeBookingClaimGrant are never called. The `includeExistingUser` and `remember` parameters therefore exercise no extra code: the exchange never reads users and never looks at the remember flag. Th…
  - reproduce: CONFIRMED — I traced the code rather than running it, because the integration suite needs Docker and that is not allowed in this mode. The mechanism holds. performClaimRequest stops early whenever the exchange response is not ok, so the claims route never runs for these cases. For the +30-day seed, prepareBookingClaimExchange throws INVALID_CLAIM because the booking fails isPortalBookingTemporallyEligible. For exp…

### R-262: evaluateHistoricalFindings is exported but never called by the scanner; its test implies baseline suppression that does not exist
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: scripts/check-secrets.mjs:L250-L257; scripts/tests/secret-scanning.test.mjs:L18, L132-L146
- Evidence:

  ```text
  check-secrets.mjs L250-L257:
  export function evaluateHistoricalFindings(findings, baselineEntries) {
    const expected = new Set(baselineEntries.map((entry) => entry.fingerprint));
    const unexpected = findings.filter((finding) => !expected.has(finding.fingerprint));
    const missing = baselineEntries.filter(...);
    return { unexpected, missing };
  }
  `git grep -n "evaluateHistoricalFindings"` -> scripts/check-secrets.mjs:250 (definition), scripts/tests/secret-scanning.test.mjs:18,136,142 (test only).
  main() L418-L423 accepts only 'sources'|'artifacts'; sourceScan L376-L382 only checks `historical.findings.length !== 6`; artifactScan passes the baseline to buildGeneratedArtifactDispositionContext.
  secret-scanning.test.mjs L132: test('historical baseline suppresses only its six exact redacted fingerprints', ...) builds its own 6-entry fake baseline.
  docs/security/secret-scanning.md: "It is not a content allowlist and is never applied to a current tree or release artifact."
  `git log -S "evaluateHistoricalFindings(" -- scripts/check-secrets.mjs` -> only 8b86def (introduced unused).
  ```

- Problem: The function has had no production caller since it was added in 8b86def. No CLI scope, release gate or script invokes it (the release-policy markers at release-policy.mjs L756-L770 do not name it, and knip runs with `--include files,dependencies,unlisted,binaries`, so unused exports are not reported). The test name says the historical baseline 'suppresses' fingerprints, but the scanner never suppresses anything with that baseline. The test also asserts `missing: []` only for the complete set, so the `missing` branch is untested.
- Impact: Small maintenance cost. The larger cost is a misleading assurance: a reader of the test list can conclude that source scans filter the six IR-01 fingerprints, which contradicts the documented design (the baseline is never applied to the current tree).
- Fix: The owner chooses: (a) delete evaluateHistoricalFindings (check-secrets.mjs L250-L257), its import (secret-scanning.test.mjs L18) and its test (L132-L146); or (b) keep it as the helper for the manual history procedure in docs L48-L51, rename the test to 'evaluateHistoricalFindings reports unexpected and missing fingerprints', and add a case where one baseline fingerprint is absent (expect missing.length === 1). Either way, run `npm run test:secret-scanning` (the count drops 46 -> 45 with option a), `validate:release-policy` and `test:release-policy`. No marker or policy constant references the function.
- Fix risk: None at runtime (no caller). After the change, run `npm run test:secret-scanning` (needs GITLEAKS_BIN for the scan cases), `validate:release-policy` and `test:release-policy`.
- Verification:
  - refute: CONFIRMED — The function has had no production caller since it was added. main() accepts only the 'sources' and 'artifacts' scopes. sourceScan only checks that the baseline has six entries and never passes it to isolatedScan. artifactScan gives the baseline to buildGeneratedArtifactDispositionContext, which uses it as a deny set (it throws if generated material overlaps a protected fingerprint), not as a filter. S…
  - reproduce: CONFIRMED — The function is exported and only the test calls it. Neither CLI scope calls it. sourceScan only checks that the baseline has six entries. artifactScan hands the baseline to buildGeneratedArtifactDispositionContext, which uses the incident fingerprints only to throw on overlap (fail closed), not to suppress findings. So nothing in the scanner uses the historical baseline to suppress findings, which mat…

### R-263: Claim-concurrency loops (15 fresh databases + 2 tsx child processes each) run under the default 120 s test timeout
- Severity: Low
- Category: Tests
- Status: SUSPECTED
- Location: tests/integration/auth/claim-concurrency-characterization.test.ts:L683-L721 (A2 loop) and L723-L760 (A3 loop); vitest.integration.config.ts testTimeout: 120_000
- Evidence:

  ```text
  L115-L116: const A2_REPETITIONS = 15; const A3_REPETITIONS = 15;
  L700: it(`A2 produces one different-identity winner across ${A2_REPETITIONS} fresh databases`, async () => {
          for (let repetition = 1; repetition <= A2_REPETITIONS; repetition += 1) {
            const result = await runFreshClaimRace('a2', repetition);   // createIsolatedDatabase + prisma migrate subprocess (20 migrations) + 2x fork('--import tsx') of route modules
        ...
    });   // no timeout argument
  vitest.integration.config.ts: testTimeout: 120_000, fileParallelism: true
  refresh-overlap-classification.test.ts gives its comparable 15–20-repetition loops an explicit 600_000 (L1368, L1407, L1495).
  ```

- Problem: Each repetition creates a database, runs `prisma migrate deploy` in a subprocess, and forks two tsx workers that import next/server and the claim routes. The whole loop must finish in 120 s while other integration files run in parallel. The sibling suite gives similar loops five times more time.
- Impact: On a slower or loaded machine (for example a Docker build host during verify:release gate 22/23), the gate can fail with a timeout that has nothing to do with the claim logic. That undermines the one-winner evidence when it is most needed.
- Fix: Add an explicit per-test timeout to both loops, as the refresh-overlap suite already does: close the A2 it() at L721 and the A3 it() at L760 with `}, 600_000);` instead of `});`. Before or alongside the change, record the per-test durations Vitest prints for these two cases in one `npm run test:integration` run, to settle whether the 120 s budget is actually tight.
- Fix risk: None functionally. A real hang now takes longer to report, but the per-worker 30 s deadline and the 8 s barrier deadline still bound each repetition.
- To confirm (SUSPECTED only): Run `npm run test:integration` and read the per-test durations Vitest prints for the two claim-concurrency cases. A duration above ~60 s (half the budget) confirms the risk.
- Verification:
  - refute: SUSPECTED — The code facts in the finding are right. Both 15-repetition loops call runFreshClaimRace and pass no per-test timeout, so each loop runs under testTimeout: 120_000. Each repetition creates a fresh database, spawns `prisma migrate deploy` over 20 migrations, and forks two `--import tsx` workers that import next/server and the claim routes. The refresh-overlap suite gives its 20-, 15- and 5-repetition fr…
  - reproduce: SUSPECTED — The structure is as described. Both A2 and A3 loop 15 times. Each repetition runs createIsolatedDatabase, then applyMigrationsFromEmpty (a prisma migrate subprocess over 20 migrations), then seeds and forks the two tsx claim workers. Neither it() passes a timeout, so the config's testTimeout of 120_000 applies, and fileParallelism is true. The sibling refresh-overlap suite gives its 15- and 20-repetiti…

### R-264: Cache version `count:max(updatedAt)` misses a commit whose `updatedAt` is older than an already-committed write, leaving the admin list stale
- Severity: Low
- Category: Logic
- Status: CONFIRMED
- Location: src/lib/guestDatasetVersion.ts:L15-L35; src/lib/guestDataCache.ts:L17-L22; src/lib/guestDataStore.ts:L144-L150
- Evidence:

  ```text
  guestDatasetVersion.ts:L20-L25
  ```
  const latestChangeMs = latestChange ? latestChange.getTime() : 0;
  ...
  version: `${rowCount}:${latestChangeMs}`,
  ```
  guestDataCache.ts:L20-L21 `if (existing && existing.snapshot.version === snapshot.version) { return existing.value; }`
  portalAuthService.ts:L257-L262 (inside a Serializable tx that continues with grant revocation, terms upsert and an audit insert before commit, L266-L300)
  ```
  const claimed = await tx.booking.updateMany({
    where: { id: grant.bookingId, OR: [{ userId: null }, { userId }] },
    data: { userId, accessStatus: 'VERIFIED', claimedAt: now },
  });
  ```
  ```

- Problem: `updatedAt` is stamped when the statement runs, not at commit. If claim transaction T1 stamps booking X at t1, then another booking write T2 (e.g. admin `POST /api/admin/bookings`, bookings/route.ts:L56) stamps t2 > t1 and commits first, an admin read in between stores a snapshot with version `n:t2` and data without T1. When T1 commits, count and max(updatedAt) are unchanged, so every later `get('bookings')` returns the cached pre-claim row until some other booking write happens. Milliseconds truncation (Timestamptz(6) -> `getTime()`) and a backwards clock step have the same effect.
- Impact: Rare (needs two concurrent booking writes and an admin read between them), but the admin list and stats then show booking X as PENDING/unclaimed indefinitely, which can lead the host to issue another claim grant or reset access for a booking the guest already claimed.
- Fix: Remove the cache. In src/lib/guestDataStore.ts:L144-L150 return `bookingRepository.getAll()` and `userRepository.getAll()` directly and drop the guestDataCache import. Delete src/lib/guestDataCache.ts, src/lib/guestDatasetVersion.ts and tests/unit/guest-dataset-version.test.ts. Neither module is referenced in vitest.config.ts, package.json, scripts or docs. Then run knip, typecheck and the guest-data-export and admin-guests route tests. Do not add xmin, pg_current_snapshot or a DB counter: that is too much machinery for a few thousand rows. Fix risk: each admin list or stats request does a plain findMany on bookings and users (today a cache hit already costs one aggregate per dataset), which is negligible at this scale.
- Fix risk: Same as the previous finding; none if the cache is removed.
- Verification:
  - refute: CONFIRMED — The mechanism holds when the code paths are read end to end. I did not run it. (1) The version is only `${count}:${max(updatedAt) ms}`, and the cache returns the stored value whenever that string is unchanged. (2) `updatedAt` is set on the client when each statement is built, not at commit. In Prisma 7.8.0 the runtime `now` generator is `new Date().toISOString()`. (3) The snapshot aggregate and the loa…  The finding's impact and side claims need correcting: (a) 'Issue another claim grant' is refuted. issueBookingClaimGrant re-reads the booking in its transaction and throws BOOKING_ALREADY_CLAIMED, which the route returns as 409 'Booking is already claimed'. The host's click therefore shows the truth. (b) 'Reset access' is refuted. The page shows that button only when accessStatus === 'VERIFIED', so a stale PENDING row cannot lead to a reset. (c) 'Indefinitely' is overstated. The stale row lasts until the next booking write with a later updatedAt (any admin booking create, claim or erasure) or until the process restarts on deploy. (d) 'Milliseconds truncation' is not a separate path. Every booking write goes through Prisma, whose generator produces millisecond-precision values, so getTime() drops nothing. Equal-millisecond stamps and a backwards clock step are still possible in theory, but equal stamps need the same concurrency and a clock step needs a write within the stepped interval.  The window is T1's last 3 statements plus commit (grant revoke, terms upsert, audit insert), a few ms on the same-VPS PostgreSQL. A second booking write and an independent admin read must both land in it. The admin page does not poll (only useEffect on mount and after actions). Its own refetch after creating a booking is a browser round trip through Cloudflare and Nginx, far longer than that window. At one apartment and about 1,000 users a year this is practically unreachable. The result is a cosmetic, self-healing staleness of the Claimed badge and totalClaimedBookings. Low is the right severity.  Fix: removing the cache is the minimal and correct fix. The proposed alternative (xmin or pg_current_snapshot versioning, or a DB counter bumped in every writing transaction) adds new moving parts to all 3 write paths for a table of a few thousand rows. That is overengineering here and should not be adopted.
  - reproduce: CONFIRMED — Confirmed by tracing every code path. It was not reproduced at runtime, because that needs the Docker integration DB, which is off-limits in this read-only pass. (1) The cache version is only `count:max(updatedAt)` in ms (guestDatasetVersion.ts:L20-L25, L29-L35). (2) GuestDataCache.get returns the cached value whenever that string is equal (guestDataCache.ts:L18-L22). (3) Nothing calls `guestDataCache.…

### R-265: Admin phone search never finds Greek guests entered in local 10-digit form
- Severity: Low
- Category: Bug
- Status: CONFIRMED
- Location: src/lib/guestDataStore.ts:L26-L30
- Evidence:

  ```text
  guestDataStore.ts:L26-L29
  ```
  async findUserByPhone(phone: string): Promise<User | undefined> {
    const normalized = normalizePhone(phone);
    if (!normalized) return undefined;
    return userRepository.findByPhone(normalized.e164);
  ```
  phone.ts:L30-L33 (no origin) `if (/^\d{8,15}$/.test(raw)) { const prefixed = `+${raw}`; ...`
  portalAuthService.ts:L325-L328 (guest sign-in has the fallback)
  ```
  const greekLocalPhone = normalizePhone(input.phone, 'GR');
  let user = await prisma.user.findUnique({ where: { phoneE164: primaryPhone.e164 } });
  if (!user && greekLocalPhone && greekLocalPhone.e164 !== primaryPhone.e164) {
  ```
  sensitiveRateLimit.ts:L25 also maps 10-digit locals to GR.
  ```

- Problem: Guests claiming with origin GR and a local number are stored as `+30XXXXXXXXXX` (portalAuthService.ts:L191). The admin search (`action=phone`, called from admin/guests/page.tsx:L132 with the raw input) normalizes `6912345678` to `+6912345678`, finds no user and returns an empty list (guestDataExport.ts:L91-L95). Sign-in and the limiter already apply the Greek-local fallback; this lookup does not.
- Impact: The host types the number as the guest gave it (e.g. `691 234 5678`) and gets "0 bookings" for an existing guest; only the `+30` form shown in the placeholder works.
- Fix: In guestStore.findUserByPhone, mirror the sign-in order: const primary = normalizePhone(phone); const local = normalizePhone(phone, 'GR'); look up primary.e164 first, and if nothing is found and local?.e164 differs from primary?.e164, look up local.e164. Handle primary === null by still trying local; today every input the GR branch accepts is also accepted by the international branch, so this case is theoretical. Add a unit test in tests/unit that mocks userRepository.findByPhone and checks three inputs: local '691 234 5678' resolves via '+306912345678', '+306912345678' resolves directly, and an international number without '+' that exists resolves on the first lookup without a second one.
- Fix risk: Tiny; add a unit test for local, `+30` and international inputs. Deterministic ordering (international first) keeps behaviour identical for inputs that match both.
- Verification:
  - refute: CONFIRMED — The code path works as the finding describes. Users are created only in consumeBookingClaimGrant (tx.user.create at portalAuthService.ts:L232), which stores normalizePhone(input.phone, input.origin).e164. With origin 'GR', a 10-digit local number is stored as '+30' + digits. The admin lookup calls normalizePhone(phone) without an origin, so '6912345678' or '691 234 5678' (separators are stripped at pho…
  - reproduce: CONFIRMED — I traced the path end to end and ran normalizePhone on the three input forms. The claim stores phoneE164 using the origin the guest chose, so GR plus a 10-digit local number is stored as +30XXXXXXXXXX. The admin phone search sends the raw text to guestStore.findUserByPhone, which calls normalizePhone without an origin. For a 10-digit local number that gives +69XXXXXXXX. userRepository.findByPhone then…

### R-266: `admin/guests?action=export` with a non-UUID `bookingId` returns 500; query params are not validated
- Severity: Low
- Category: Error handling
- Status: CONFIRMED
- Location: src/app/api/admin/guests/route.ts:L74-L84 (search), L98-L111 (export); related UI: src/app/admin/guests/page.tsx:L134
- Evidence:

  ```text
  route.ts:L99-L105
  ```
  if (!params.bookingId) { throw new ApiError(ApiErrorCode.VALIDATION_ERROR, ...) }
  const exportData = await guestDataExport.getBookingDetails(params.bookingId);
  ```
  bookingRepository.ts:L53-L58 `return (await prisma.booking.findUnique({ where: { id }, select: bookingSelect })) ?? undefined; } catch (error) { logger.error(...); throw error; }`
  schema.prisma:L32 `id String @id @db.Uuid`
  R-156 (REVIEW.md:L648) executed the same query shape: `PrismaClientKnownRequestError P2007 … invalid input syntax for type uuid` -> 500 `INTERNAL_ERROR`; the fix pattern now used at bookings/[id]/claim-grants/route.ts:L31 and access-reset/route.ts:L33 `if (!z.string().uuid().safeParse(id).success) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Booking not found');`
  ```

- Problem: The A1/R-156 UUID guard was applied to the two booking routes but not to this route's `export` action, which passes the raw query value into a `@db.Uuid` lookup; the Prisma error surfaces as 500 and an error-level log. `startDate`/`endDate` for `action=search` are also unvalidated, so a malformed date (e.g. `2026-10-5`) silently returns an empty result instead of a 422.
- Impact: Admin-only and not reachable from the UI with a real id (page.tsx:L158 passes a booking id from the list), so the practical effect is a misleading 500 plus noise in error logs for a hand-edited URL; the date case gives a silent empty search when the host mistypes the date in the free-text field (page.tsx:L457-L458).
- Fix: In route.ts add `import { z } from 'zod';`. In `case 'export'`, after the missing-param check (L104): `if (!z.string().uuid().safeParse(params.bookingId).success) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Booking not found');` (same as claim-grants L31). In `case 'search'`, after L80: `if (!z.iso.date().safeParse(params.startDate).success || (params.endDate !== undefined && !z.iso.date().safeParse(params.endDate).success)) throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'startDate/endDate must be YYYY-MM-DD');`. Add route tests (tests/routes/) that mock guestDataExport: non-UUID bookingId -> 404 with getBookingDetails not called; `startDate=2026-10-5` -> 422 with searchBookingsByDateRange not called; valid inputs unchanged. Optionally, as a separate UI nit, encodeURIComponent/trim the date in page.tsx:L134, the way the reference branch does.
- Fix risk: None for valid input; add route tests for a non-UUID id (404) and malformed date (422).
- Verification:
  - refute: CONFIRMED — I traced the whole export path and found no guard. route.ts:L99 checks only that the value is present. Then getBookingDetails, guestStore.findBookingById and bookingRepository.findById pass the raw string into prisma.booking.findUnique on an `@db.Uuid` column. The repository logs and rethrows the error. withErrorHandler has no Prisma-specific mapping, so a non-ApiError/non-ZodError becomes INTERNAL_ERR…
  - reproduce: CONFIRMED — Export path traced end to end: route.ts:L99-L105 only checks presence of bookingId, then guestDataExport.getBookingDetails (guestDataExport.ts:L102-L103) -> guestStore.findBookingById (guestDataStore.ts:L41-L42) -> bookingRepository.findById (bookingRepository.ts:L53-L58), which calls prisma.booking.findUnique({ where: { id } }) on a `@db.Uuid` column (schema.prisma:L32) and rethrows after logger.error…

### R-267: "Latest request" hides an approved arrival time, and a later rejection tells the guest the standard time applies
- Severity: Low
- Category: Logic
- Status: CONFIRMED
- Location: src/i18n/domains/checkin.ts:L181 (en), L257 (el); behaviour from src/components/CheckInInfo.tsx:L796-L822 and src/lib/prisma-repositories/checkInRequestRepository.ts:L149-L165
- Evidence:

  ```text
  checkin.ts:L181 statusRejectedCopy: "Your requested arrival time could not be confirmed. The standard check-in time still applies." (el L257 same meaning)
  CheckInInfo.tsx:L815-L816
    {!isRequestingArrival && arrivalRequest?.status !== 'pending' && (
      <button ... onClick={handleOpenArrivalRequest}
  checkInRequestRepository.ts:L149-L165 findLatestForGuest: findFirst ... orderBy: { createdAt: 'desc' }
  tests/components/checkin-arrival-request.test.tsx:L44 'offers a new request once the host has answered'
  ```

- Problem: After the host approves an arrival time, the guest can send another request (by design, B6/B24). The page then shows only the newest row. If the host rejects the second request, the guest reads "The standard check-in time still applies", although an earlier approval (e.g. 12:00) still stands in the database and nothing supersedes it. The approved time is no longer visible anywhere on the guest page.
- Impact: A guest with an approved early arrival who asks for an even earlier time and is refused is told to come at 15:00, which contradicts what the host agreed. The host sees two APPROVED/REJECTED rows with no link between them in the admin inbox.
- Fix: Change only the text, in both locales. Remove the unconditional claim that the standard time applies. en L181: "Your requested arrival time could not be confirmed. Any arrival time confirmed earlier, otherwise the standard check-in time, still applies." el L257: "Η ώρα άφιξης που ζητήσατε δεν μπόρεσε να επιβεβαιωθεί. Ισχύει όποια ώρα σας είχε επιβεβαιωθεί νωρίτερα, αλλιώς η κανονική ώρα άφιξης." No test changes are needed because no test asserts this string. Keep the button visible after an approval, which is the B6 design, rather than taking the finding's alternative. Showing the earlier approved time on the page would need the GET to return more than the latest row. That is a behaviour and API change the owner has to approve, and it goes beyond a Low-severity fix.
- Fix risk: Text change only: update any test asserting the exact string. The alternative changes a tested behaviour (checkin-arrival-request.test.tsx:L44).
- Verification:
  - refute: CONFIRMED — I could not refute it. Nothing in the data model or UI supersedes or shows an earlier approval. (1) The guest page reads only the newest row: findLatestForGuest uses findFirst with orderBy createdAt desc. CheckInInfo is the only guest-side consumer of /api/check-in/arrival-request. (2) After an approval the 'Request different arrival time' button is shown again, because it is hidden only for 'pending'.…
  - reproduce: CONFIRMED — Traced every path. (1) Approving a request only changes that row's status: repository updateStatus runs `tx.checkInRequest.update({ where: { id }, data: { status } })` (checkInRequestRepository.ts:L209) and writes an outbox event, nothing else. Neither updateStatus nor the admin PATCH route touches the check-in time shown to the guest. (2) The check-in time on the guest page comes from one global Opera…

### R-268: Arrival-time requests are accepted during the stay and after check-out
- Severity: Low
- Category: Logic
- Status: CONFIRMED
- Location: src/app/api/check-in/arrival-request/route.ts:L71-L77 (POST, between session verification and create); src/components/CheckInInfo.tsx:L815 (button visibility)
- Evidence:

  ```text
  route.ts:L71-L87
    const session = await getVerifiedSession(request);
    const parseBody = validateRequestBody(requestSchema);
    ...
    const created = await checkInRequestRepository.create({ bookingId: ..., requestedTime: body.requestedTime, ... }, { eventType: 'check_in_time_request.created', nextStatus: 'PENDING' });
  portalBookingEligibility.ts:L57-L61 (the only temporal check, via verifyGuestSessionAccess): endTime >= window.businessToday && startTime <= window.inclusiveMaximumStartDate
  CheckInInfo.tsx:L815 shows the request button whenever the latest request is not pending.
  ```

- Problem: Neither the route nor the UI checks that the booking's check-in date is still ahead. A session stays valid until the end of the check-out date (UTC), so a guest who has already arrived, or who checked out at 11:00, can still file a new "arrival time" request. Each one creates a PENDING row and an outbox webhook to the host.
- Impact: Spurious host notifications and pending items for stays already under way or finished, e.g. a guest trying the form on day 3 or at check-out. Low volume (one pending request per booking at a time), but it is noise the host must clear by hand.
- Fix: Keep verifyGuestSessionAccess unchanged. In POST, after getVerifiedSession, read only the start date (same pattern as preferences/route.ts:L79-L82): `const { prisma } = await import('@/lib/prisma'); const booking = await prisma.booking.findUnique({ where: { id: session.booking!.id }, select: { startDate: true } }); if (!booking || booking.startDate.getTime() < createPortalBookingEligibilityWindow(new Date()).businessToday.getTime()) throw new ApiError(ApiErrorCode.CONFLICT, 'Arrival time requests are closed once the stay has started');`. This follows the portal's UTC calendar-date convention (portalBookingEligibility.ts:L13-L17) and still allows requests on the arrival day. Hiding the button in the UI is optional (it would need an extra field from GET preferences or GET arrival-request). If you skip it, the 409 message appears verbatim in English on /el (CheckInInfo L567, same issue as R-144), so a localized string is worth adding. Fix risk: the 5 existing tests in tests/routes/arrival-request.test.ts need a `@/lib/prisma` mock for booking.findUnique. Add a test where startDate is before today (expect 409, create not called) and one where startDate is today (expect 201).
- Fix risk: Needs a route test for start-date-passed (409) and a check that the existing 201/200 cases still pass. Decide whether requests on the arrival day itself remain allowed (recommended: yes).
- Verification:
  - refute: CONFIRMED — I tried to refute this and could not. The only date check on POST is verifyGuestSessionAccess -> isPortalBookingEligible -> isPortalBookingTemporallyEligible. That check accepts any booking whose endDate >= businessToday (a UTC date) and whose startDate <= today+7. So a verified guest can file an arrival-time request on any day of the stay, and also on the check-out date itself. The route never reads s…
  - reproduce: CONFIRMED — I traced every path, and none of them checks the stay's start date. POST (route.ts:L61-L99) only checks the feature flag, the security guard, the verified session and the body schema, then calls checkInRequestRepository.create. The only date check in session verification is isPortalBookingEligible → isPortalBookingTemporallyEligible (portalBookingEligibility.ts:L50-L62). That lets a booking through whi…

### R-269: Claim/sign-up failures show a generic "couldn't verify your identity" with no hint that the token expired or was used
- Severity: Low
- Category: Error handling
- Status: CONFIRMED
- Location: src/app/[locale]/guest/UnifiedGuestClient.tsx:L117-L121; src/i18n/domains/portal.ts:L34-L39,L79-L84,L108-L113
- Evidence:

  ```text
  UnifiedGuestClient.tsx:L116-L120
    if (!exchangeResponse.ok) {
      const mapped = mapApiErrorToUI(exchangeJson, locale);
      setSubmitError({ summary: mapped.summary, details: mapped.details });
      return;
    }
  claim-exchange/route.ts:L55-L57: if (error instanceof PortalAuthError) { throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'The claim token is invalid'); }
  userFacingErrors.ts:L17 unauthorized: "We couldn't verify your identity. Check your details and try again." (el L29)
  UnifiedGuestClient.tsx:L133 the tailored text applies only to `mode === 'signin' && response.status === 401`.
  ```

- Problem: B21 gave the sign-in 401 a specific message, but sign-up still maps both 401s (token exchange and claim) to the generic text. The exchange fails before any phone or password is checked, so saying "this token is invalid, expired or already used, ask your host for a new one" reveals nothing beyond what the server message already says. The portal texts (claimTokenHint, modeHintSignup) never mention that tokens are short-lived and single-use.
- Impact: A guest whose token expired, was already used, or was replaced by a newer grant (issuing a new one revokes the previous one) keeps retyping their details, because the text says to check them. They only recover by calling the host.
- Fix: Add errors.claimTokenInvalid to PortalDictionary and to both locales. en: "This claim token is invalid, expired or already used. Ask your host for a new one."; el: the equivalent Greek text. Do not hard-code '30 minutes', because the TTL is configurable from 5 to 1440 minutes. In UnifiedGuestClient.tsx, inside the !exchangeResponse.ok branch: const tokenRefused = exchangeResponse.status === 401 ? dictionary?.errors?.claimTokenInvalid : undefined; setSubmitError({ summary: tokenRefused ?? mapped.summary, details: tokenRefused ? undefined : mapped.details }). Leave the second-step /api/portal/claims 401 on the generic text; it also covers wrong existing-account passwords. Optionally, extend claimTokenHint to say the token is valid for a short time only. Test: add a sign-up case, for example a new tests/components/guest-claim-errors.test.tsx with useSearchParams 'mode=signup'. The existing file hard-codes mode=signin. The case must fill origin, token (32+ chars), phone and password and tick the terms. Assert the new text on an exchange 401, and assert that a 429 keeps the generic rate-limit text. tests/unit/i18n-parity.test.ts and the PortalDictionary type enforce both locales.
- Fix risk: Client-only change. Add a case to tests/components/guest-sign-in-errors.test.tsx; the i18n parity test requires both locales.
- Verification:
  - refute: CONFIRMED — I could not refute the claimed behaviour. A failed sign-up token exchange goes to mapApiErrorToUI. For UNAUTHORIZED, that function returns the generic m.unauthorized text and ignores the server's error.message. Nothing in the client special-cases the exchange 401. The B21 override applies only when mode === 'signin'. The exchange rejects the token before any phone or password is involved: unknown/typo,…  Expiry is a realistic case. The admin UI always issues 30-minute tokens (guests/page.tsx sends ttlMinutes: 30), and re-issuing a token revokes the open one (replaceOpenClaimGrant). A guest who opens the host's message hours later always hits it.  This is not a duplicate. R-137/B21 covered only the sign-in 401. R-119/B3 covered issuing a token outside the window, not the client message for an expired or used token.  There is no oracle concern. The exchange is keyed only on a 256-bit bearer token, rate-limited to 20 per hour, and the server message already says 'The claim token is invalid'. A combined 'invalid, expired or already used' text does not tell the states apart.  One correction to the finding: claimTokenHint already says 'one-time' (el 'εφάπαξ'). Only the short validity period is never mentioned.  Severity stays Low. It is a UX problem in the onboarding path, and the guest recovers by asking the host, who is the only one who can issue a token anyway.
  - reproduce: CONFIRMED — I traced every path; I did not run a new test because plan mode is read-only. In signup mode, a failed claim-exchange goes through mapApiErrorToUI. The route throws ApiError(UNAUTHORIZED, 'The claim token is invalid') with no details, and the mapper returns the generic m.unauthorized text for that code. It takes details only from error.details fields or hints, so the server message never reaches the us…

### R-270: Guest-facing access window text ("opens 7 days before check-in, ends on the check-out date") runs on UTC dates, i.e. 02:00/03:00 Athens
- Severity: Low
- Category: Logic
- Status: CONFIRMED
- Location: src/lib/portalBookingEligibility.ts:L25-L29; texts at src/i18n/domains/portal.ts:L83,L112; src/app/api/admin/bookings/[id]/claim-grants/route.ts:L56; src/app/api/admin/bookings/[id]/access-reset/route.ts:L55; src/app/admin/guests/page.tsx:L556
- Evidence:

  ```text
  portalBookingEligibility.ts:L25-L29
    const businessToday = new Date(Date.UTC(
      capturedNow.getUTCFullYear(),
      capturedNow.getUTCMonth(),
      capturedNow.getUTCDate(),
    ));
  portal.ts:L83 signInFailed: "... Access opens 7 days before check-in and ends on the check-out date." (el L112)
  claim-grants/route.ts:L56 and admin/guests/page.tsx:L556: 'Claim tokens can be issued from 7 days before check-in until the check-out date'
  docs/testing.md:L84: "...the established portal convention is a UTC calendar date. `PROPERTY_TIME_ZONE` ... does not redefine this authentication boundary."
  ```

- Problem: The day boundary is UTC midnight, which is 02:00 (winter) or 03:00 (summer) in Athens. The access window therefore opens 2 to 3 hours after local midnight on the day 7 days before check-in. It also stays open until 02:00/03:00 local time on the day after check-out, whereas the texts say it "ends on the check-out date". The convention is documented, but the guest and admin texts state local calendar days.
- Impact: Small. Between 00:00 and 03:00 Athens time, sign-in, claim and "Issue claim" are refused on the first day the text promises access. On the night after check-out a session, the portal and arrival requests still work although the text says access ended. The Wi-Fi is unaffected because it uses the property time zone (propertyTime.ts).
- Fix: Recommended: option (a), text only, keeping the documented UTC convention. Adjust all five places: portal.ts:L83 (en) and L112 (el), claim-grants/route.ts:L56, admin/guests/page.tsx:L556 and access-reset/route.ts:L55. For example, the guest text becomes "Access opens about 7 days before check-in and closes shortly after the check-out date", with the matching Greek. The admin texts can append "(UTC calendar dates)". No tests assert these strings. Do not choose (b), the property-local businessToday, unless the owner explicitly wants to redefine the authentication boundary. If (b) is chosen, update docs/testing.md:L84 and run the unit matrix and the PostgreSQL integration matrix at Athens-midnight instants.
- Fix risk: (a) is text only. (b) changes an authentication boundary used by claim, login, refresh and session checks. It requires the unit matrix and the PostgreSQL integration matrix (ended-yesterday / ends-today / +7 / +8) at Athens-midnight instants.
- Verification:
  - refute: CONFIRMED — The finding holds. The window is derived from the UTC calendar date of the captured instant (portalBookingEligibility.ts:L25-L29), and every guest flow uses it: claim issuance and exchange, login, refresh, and the per-request session check in guestSession.ts:L145 (verifyGuestSessionAccess, used by the arrival-request and preferences routes). Athens is UTC+2/+3, so the boundaries fall 2-3 hours after lo…
  - reproduce: CONFIRMED — The cited lines are correct. businessToday is the UTC calendar date of capturedNow, and the predicates at L44-47 and L57-61 compare booking DATE values (UTC midnight) against it and against businessToday+7. For the Europe/Athens default of PROPERTY_TIME_ZONE (runtime-env-schema.js:L51), the UTC date lags the local date between 00:00 and 02:00 in winter and between 00:00 and 03:00 in summer. So in that…

### R-271: Copy buttons swallow clipboard failures: unhandled promise rejection and no feedback
- Severity: Low
- Category: Error handling
- Status: CONFIRMED
- Location: src/components/CheckInInfo.tsx:L482-L488 (callers L640, L909; src/components/checkin/WifiAccessCard.tsx:L77)
- Evidence:

  ```text
    const copyToClipboard = (text: string, target: CopyTarget) => {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(text).then(() => {
        setCopiedTarget(target);
        setTimeout(() => setCopiedTarget(null), 2000);
      });
    };
  Used by the hero "Copy Wi-Fi" (L640) and both WifiAccessCard buttons (L908 onCopy={copyToClipboard}).
  ```

- Problem: `writeText` returns a promise that rejects when the browser refuses (NotAllowedError, e.g. document not focused, permission policy, some in-app browsers opened from a QR scan). There is no `.catch`, so the rejection is unhandled. When `navigator.clipboard` is absent the function returns silently. In both cases the button does nothing visible.
- Impact: A guest who scans the QR code in an in-app browser taps "Copy Wi-Fi" or "Copy password", nothing happens, and they get no hint to copy by hand. Wi-Fi is the main reason guests open this page.
- Fix: Follow the ShareButton pattern and make only the minimal change, with no new dictionary key required:

  const copyToClipboard = async (text: string, target: CopyTarget) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      setTimeout(() => setCopiedTarget(null), 2000);
    } catch (err) {
      logger.warn('Clipboard copy failed', err instanceof Error ? err : { error: String(err) });
    }
  };

This uses `logger` from '@/lib/logger-client'. A missing `navigator.clipboard` throws a TypeError inside the try and is handled the same way. Check that the `onCopy` prop type `(value, target) => void` still accepts an async function; it should typecheck. Showing a visible 'copy failed' label (a new checkinInfo.panel key in en/el, covered by the i18n parity test) is an optional UX decision for the owner. It is not needed for correctness, because the SSID and password are already shown next to the buttons.

Regression test: a component test that stubs `navigator.clipboard.writeText` to reject, clicks the Wi-Fi copy button, and asserts that the label stays 'Copy' and that no unhandled rejection occurs.

The same missing-catch pattern exists in src/app/admin/guests/page.tsx:L502 (admin claim-token copy). It belongs in a separate finding and should not be fixed in this task.
- Fix risk: UI-only. Add a component test with a rejecting clipboard stub (vitest unstubGlobals is on).
- Verification:
  - refute: CONFIRMED — The code defect is real. `copyToClipboard` chains `.then()` on `navigator.clipboard.writeText(...)` with no rejection handler. The derived promise is neither returned nor awaited: the callers are `onClick={() => copyToClipboard(...)}` and `onClick={() => onCopy(...)}`, and the function returns void. A rejected write is therefore an unhandled rejection, and the button label does not change. When `naviga…  The impact as written is overstated: (1) The claim that the guest gets 'no hint to copy by hand' is not accurate. WifiAccessCard prints the SSID and the password as visible text next to each copy button, so the fallback is on screen. Only the hero 'Copy Wi-Fi' button has no value beside it, and the same page shows the card. (2) /check-in is not opened straight from a QR scan. It requires a verified guest session: the page redirects to /guest or /portal/refresh without one. (3) The in-app-browser rejection scenario is plausible but was not verified here. Only the general MDN contract (NotAllowedError when the document is unfocused or permission is denied) supports it.  One possible extra consequence the finder missed is SUSPECTED only. src/app/error.tsx imports `errorReporter`, and constructing it registers a global `unhandledrejection` listener that POSTs to /api/errors. That route stores a `client.error` SecurityAuditEvent. So if the root error boundary's module is loaded eagerly on /check-in, each failed copy would add a low-severity audit row. I did not verify that eager loading.  Low severity fits: the path is UI-only, the values are readable on screen, and nothing is lost or wrong. The proposed fix goes beyond the minimum. ShareButton already has the repo's pattern for this exact API (try/await writeText, catch, logger.warn). A new localized 'copy failed' string (en/el key plus parity test) is optional UX scope for the owner to decide.
  - reproduce: CONFIRMED — The line numbers and code are exact. copyToClipboard returns silently when navigator.clipboard is undefined, which is the case in non-secure contexts and some embedded browsers. It calls writeText(...).then(...) with no rejection handler, so a NotAllowedError leaves the button with no visible feedback, and the rejection only reaches whatever global 'unhandledrejection' listener happens to be registered…

### R-272: Long Wi-Fi network names or passwords overflow the Wi-Fi card on phones (nowrap, no overflow handling)
- Severity: Low
- Category: Bug
- Status: CONFIRMED
- Location: src/components/checkin/WifiAccessCard.tsx:L71-L74 (value span, L72 class list); page-widening path via src/components/CheckInInfo.tsx:L701-L703 (single auto grid track below lg, aside with min-width:auto)
- Evidence:

  ```text
    <dd className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="checkin-value min-w-0 flex-1 whitespace-nowrap font-mono text-[0.8125rem] font-semibold">
        {item.value}
      </span>
  src/styles/12-apartment-checkin.css:L279-L283 .checkin-card has no overflow rule; .checkin-row (L363-L369) and .checkin-panel (L257-L263) have none either.
  ```

- Problem: The value is forced onto one line and allowed to shrink (min-w-0), but nothing clips, scrolls or breaks it. At roughly 7.8 px per monospace character and about 230 px of usable width on a 360 px phone, values longer than about 29 characters (WPA2 allows up to 63) will paint past the card edge.
- Impact: With a long router password the text runs outside the card, or causes horizontal page scroll on phones, and the end of the password may be unreadable. Copy still works.
- Fix: In WifiAccessCard.tsx:L72 replace `whitespace-nowrap` with `break-all` (or `wrap-anywhere`, available in the installed Tailwind 4.3.2, which breaks at spaces first):
-  <span className="checkin-value min-w-0 flex-1 whitespace-nowrap font-mono text-[0.8125rem] font-semibold">
+  <span className="checkin-value min-w-0 flex-1 break-all font-mono text-[0.8125rem] font-semibold">
Do not use `overflow-x-auto` alone. It very likely keeps the phone page widening for values over ~29 characters (not verified by rendering), and it hides part of the password behind a scroll. Visual check: 360 px and 1024 px, EN and EL, with an 8-, 20- and 63-character value. The password should wrap beside the Copy button with no overlap and no horizontal page scroll.
- Fix risk: Visual only; check the 360 px layout with a 63-character value and a short one.
- Verification:
  - refute: CONFIRMED — I could not refute the finding. I found no guard that clips, scrolls or wraps the value anywhere between the span and <body>. The finder's picture is incomplete, though, and the text overflows at much shorter lengths than claimed.  (1) The span is not ~230 px wide. `flex-1` compiles to `flex: 1`, which means flex-basis 0%, and `min-w-0` removes the content floor. So the span and the Copy button always share one flex line: flex-wrap only wraps when the hypothetical sizes, 0 + 8 + button, exceed the dd. The span therefore gets dd width minus the 8 px gap minus the button. At 360 px that is 228 - 8 - ~75 ≈ 145 px in EN and ≈ 114 px in EL ('Αντιγραφή'). At ≥1024 px (aside 420 px, sm two-column grid) the dd is 220 px, leaving the span ≈ 137 px (EN) or ≈ 106 px (EL). With 13 px system monospace at about 0.6em (≈ 7.8 px per char), `whitespace-nowrap` text longer than about 18 (EN) or 14 (EL) characters at 360 px, and about 17 or 13 at desktop, runs past the span into the gap and the Copy button. The button has no background (.checkin-copy-action sets one only on :hover), so the password and the button label overlap and neither reads cleanly. Default ISP WPA keys are often that long; I could not check the owner's value (.env.local is off-limits). The schema sets only a minimum length (min 8, no maximum).  (2) Past about 29 characters at 360 px, the dd's min-content (the full nowrap string) goes beyond 228 px. The chain propagates through the flex row, section and aside. Below lg the outer grid has no template columns, so it uses a single implicit `auto` track, and the aside has min-width:auto. Grid's automatic minimum size therefore widens that track, and the whole lower grid (aside plus main column) becomes wider than the viewport, giving horizontal page scroll. Nothing sets overflow-x hidden or clip on html, body, main or .page-container (the only overflow-x: clip is the photo-stack wrapper). This matches the finder's '~29 chars' number, but the effect covers the whole lower grid, not only the card.  Copy still works, because onCopy uses item.value. This is visual only: no data or security impact.  Severity: I raise it from Low to Medium. It is a real display bug, not a cleanup. It is on the main guest page and hits the piece of information guests use most, but it depends on one owner-controlled config value, so it is an edge case, not a main-flow failure. It stays CONFIRMED on the mechanism: I read the component, every ancestor's CSS and the installed Tailwind source. I did not render it (plan mode forbids launching a browser), so the character thresholds are computed estimates.  Not a duplicate. REVIEW.md has no overflow or nowrap finding. R-124/B8 added only the `notice` prop, and git blame shows L69-L75 unchanged since 610ffede.  Fix check: replacing `whitespace-nowrap` with `break-all` is minimal and correct. It removes nowrap, so the span's min-content drops to about one glyph. That fixes both the overlap and the page widening. Adding only `overflow-x-auto` is weaker. It would stop the overlap, but a scroll container's content very likely still counts toward the aside's min-content (not verified by rendering), so the widening past ~29 characters on phones would likely remain. It also makes guests scroll to read the password. `break-words` (overflow-wrap: break-word) is not enough either, because it does not reduce min-content. The installed Tailwind 4.3.2 also has `wrap-anywhere` (overflow-wrap: anywhere). That is an equally minimal alternative, and it breaks an SSID with spaces at the spaces first. No test asserts these classes, so the change breaks no tests.
  - reproduce: CONFIRMED — The cited lines are correct. The CSS path is deterministic. The value span is a flex item with `flex-1` (flex: 1 1 0%), `min-w-0` and `whitespace-nowrap`, and nothing gives it an overflow rule, so its text cannot wrap and paints past the span's box once it is wider than the space available. I checked every ancestor of the Wi-Fi row: the dl.checkin-card, the grid div, the .checkin-row, the section.check…

### R-273: Booking form 422 message always blames dates and phone; client does not enforce the server's length limits
- Severity: Low
- Category: Error handling
- Status: CONFIRMED
- Location: src/components/BookingForm.tsx:L50-L56, L178-L185, L196-L203, L268-L274; src/i18n/domains/booking.ts:L146, L234
- Evidence:

  ```text
  BookingForm.tsx:L50-L57 client schema: firstName z.string().min(1,...), lastName min(1), phone min(1), specialRequests: z.string().optional()
  BookingForm.tsx:L268-L274 <textarea id="specialRequests" rows={3} {...register('specialRequests')} ... /> (no maxLength)
  booking-requests/route.ts:L32-L40 firstName .max(100), lastName .max(100), phone regex /^\+?[0-9 ()-]{7,32}$/, specialRequests .max(1000)
  route.ts:L100 if (!parsed.success) return errorResponse('Invalid booking request payload', 422);
  BookingForm.tsx:L101-L104 status 422 -> labels.submitRejected
  booking.ts:L146 submitRejected: "Some details could not be accepted. Please check the dates and your phone number and try again."
  ```

- Problem: Any server schema failure returns 422, and the form then tells the guest to check the dates and the phone number. A special request over 1000 characters, or a name over 100 characters, is accepted by the client and then rejected by the server with this wrong hint.
- Impact: A guest who writes a long message in "Special requests" (the likeliest field to exceed its limit) is told to fix their dates or phone, cannot find the problem, and the stay request is lost unless they contact the host directly.
- Fix: Minimal fix, no new dictionary keys: (1) add `maxLength={1000}` to the specialRequests textarea and `maxLength={100}` to the firstName/lastName inputs; the browser then blocks overlong input, and the stricter pre-trim count means the server never sees an overlong value. (2) Reword submitRejected in en and el to a neutral hint, e.g. "Some details could not be accepted. Please check the form and try again." (el: "Κάποια στοιχεία δεν έγιναν δεκτά. Ελέγξτε τη φόρμα και δοκιμάστε ξανά."). Optional: `.trim().min(1, ...)` on the client name fields to catch whitespace-only names. Mirroring the phone regex needs a new phoneInvalid key in the interface plus en and el, and it cannot fully mirror the server because the server also runs normalizePhone's E.164 check. Keep it out of the minimal task. Regression test: a component test asserting the textarea's and inputs' maxLength attributes, plus the reworded 422 message in booking-form-errors.test.tsx (the i18n parity test already checks that en and el have the same keys).
- Fix risk: New localized validation messages (en/el) and a component test for the 1001-character case; the i18n parity test covers the keys.
- Verification:
  - refute: CONFIRMED — The finding holds. The client schema does not limit length. The server schema caps names at 100 characters (after trim) and specialRequests at 1000 characters (after trim), and any safeParse failure returns a generic 422. The form maps every 422 to submitRejected, and that message tells the guest to check the dates and phone number. A trimmed specialRequests over 1000 characters therefore passes the cl…
  - reproduce: CONFIRMED — I traced the whole path by reading the code; I did not run it. The client schema limits only the minimum length (min(1)) of firstName, lastName and phone, and specialRequests is just optional. None of the registered inputs, including the textarea, has a maxLength. The server schema is stricter: names have max(100), phone has min(7)/max(32) plus a regex, specialRequests has max(1000), and arrivalTime ha…

### R-274: Dark `.moments-empty-action` ("Clear search") text is #065f5b on the dark card, 2.12:1, because `--brand-800` has no dark value
- Severity: Low
- Category: Bug
- Status: CONFIRMED
- Location: src/styles/10-moments.css:L625-L642 (with L665-L667)
- Evidence:

  ```text
  L625-L631
    .moments-empty-action {
      …
      border: 1px solid var(--moments-action-bg);
      background: transparent;
      color: var(--moments-action-bg);
  L665-L666: `[data-theme="dark"] .moments-page { --moments-action-bg: var(--brand-800);`
  04-theme.css:L12-L20 lists dark --brand-50…700 and 900 but no --brand-800, so it stays 01-tokens.css:L29 `#065f5b`.
  EmptyState.tsx:L24: `<button type="button" className="moments-empty-action" onClick={onClear}>`; rendered by CategoryGridClient.tsx:L166-L173 and L193-L200 when a search or filter matches nothing.
  Computed: #065f5b on the dark `--moments-card-bg` (≈#172426) = 2.12:1.
  ```

- Problem: `--moments-action-bg` is designed as a background (white text on it = 7.51:1). The empty-state button reuses it as a text colour. It is a `<button>`, so neither the 09 anchor rule nor any dark rule changes it. PROGRESS.md S8g already notes "brand-800 … has no dark-theme value".
- Impact: In dark mode, after a moments search with no results, the only recovery action ("Clear search"/"Reset all") is dark teal on near-black.
- Fix: Add both rules after L674 in 10-moments.css:
[data-theme="dark"] .moments-empty-action { border-color: var(--brand-600); color: var(--brand-600); }
[data-theme="dark"] .moments-empty-action:hover { border-color: var(--moments-action-bg); color: var(--moments-action-fg); }
Result: resting 7.52:1, hover white on #065f5b 7.51:1. Without the second rule the hover text becomes #19c7b6 on #065f5b (3.54:1).
- Fix risk: Visual only. Search for a nonsense term on /en/moments in dark mode.
- Verification:
  - refute: CONFIRMED — `.moments-empty-action` is a plain `<button>` (EmptyState.tsx:L24) with no role=tab, so none of the 09 dark rules match it. Those rules target span/div/label/a and button[role=tab]. Tailwind's preflight `button { color: inherit }` sits in @layer base and loses to this unlayered rule. The only dark change on the moments page is the custom-property block at L665, which keeps `--moments-action-bg` at bran…  The proposed fix has a bug. A standalone `[data-theme="dark"] .moments-empty-action { color: var(--brand-600); … }` is (0,2,0), the same as `.moments-empty-action:hover` (L638). Placed in the dark block after it, it also wins on hover. Hover would then show #19c7b6 on #065f5b = 3.54:1, not the intended white (7.51:1). A dark hover rule is needed as well. Not a duplicate: PROGRESS.md S8g only notes that brand-800 has no dark value, for the AmenitiesList toggle. No R-id covers the moments empty-state button.
  - reproduce: CONFIRMED — .moments-empty-action is a <button>. The only dark button overrides in src/styles are 09-utilities.css L61/L68 (button[role=tab]), and they do not match it. So its color is `var(--moments-action-bg)`, which inside the dark .moments-page resolves to --brand-800, and --brand-800 has no dark value (#065f5b). The button sits in .moments-empty-state, whose dark background is --moments-card-bg (10-moments.cs…

### R-275: Dark `.btn-outline` keeps its white background: #0b998b on #ffffff = 3.53:1, and hover flips it to a dark pill
- Severity: Low
- Category: Bug
- Status: CONFIRMED
- Location: src/styles/05-primitives.css:L50-L54
- Evidence:

  ```text
  L39-L41
    background: #ffffff;
    color: var(--text-accent);
    border: 1px solid #d1d5db;
  L50-L59
    [data-theme="dark"] .btn-outline {
      color: var(--brand-400);
      border: none;
      box-shadow: …;
    }
    [data-theme="dark"] .btn-outline:hover {
      background: rgba(255, 255, 255, 0.06);
  Used by ErrorSummary.tsx:L48 and L50 (`btn-outline btn-sm`, 10.4px text), BookingForm.tsx:L145 ("View property"), [locale]/layout.tsx:L64 (iOS tip close).
  ```

- Problem: The dark override changes text, border and shadow but not the background, so the light #ffffff stays. The hover rule sets a translucent dark background, which shows the intended dark look was never applied to the resting state.
- Impact: In dark mode the error-summary actions and the booking-success "View property" button are white pills with teal text at 3.53:1 (the `.btn-sm` ones at 10.4px), and they flash from white to dark on hover.
- Fix: Add `background: transparent;` to `[data-theme="dark"] .btn-outline` (L50-L54). That fixes BookingForm's "View property" (brand-400 on the page: 4.56 to 5.01) and removes the white-to-dark hover flip. For ErrorSummary and the iOS tip, the containers are the problem: give `bg-red-50` in ErrorSummary.tsx:L35 and `bg-white/90` in [locale]/layout.tsx:L62 dark variants in the R-163 style (`dark:bg-red-950/60 dark:border-red-900`, or similar for the tip). Record that as a separate finding, including the suspected unreadable ErrorSummary text in dark mode, and do not fold it into this CSS fix.
- Fix risk: Visual only. Check ErrorSummary, the booking success state and the iOS tip in dark mode.
- Verification:
  - refute: CONFIRMED — Only `.btn-outline` (L39) sets the resting background, `#ffffff`. The dark override (L50-L54) changes colour, border and shadow but not the background, and no other stylesheet sets a `.btn-outline` background. Its only other references are the 09-utilities anchor exclusions and the 02-layout `:where()` size rules. So in dark mode the button is a white pill with brand-400 text (3.53:1) that turns to rgb…
  - reproduce: CONFIRMED — The base .btn-outline rule sets `background: #ffffff`. The dark override at L50-L54 changes only color, border and box-shadow. No other CSS rule targets .btn-outline background: grep finds only 05-primitives, 02-layout sizing and the 09-utilities exclusion. None of the consumers adds a background utility. In dark mode the button therefore stays white, with brand-400 #0b998b text at 3.53:1. .btn-sm uses…

### R-276: The dark body gradient in 04-theme is dead: 05-primitives redeclares `background` with the same selector later; `body[data-theme="dark"]` never matches
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/styles/04-theme.css:L60-L61 and src/styles/05-primitives.css:L236
- Evidence:

  ```text
  04-theme.css:L58-L63
    /* Force apartment-style dark background on all pages and containers in dark mode */
    [data-theme="dark"] body {
      background: linear-gradient(180deg, #0a0f10 0%, #0d1416 35%, #101a1b 100%);
      background-attachment: fixed;
  05-primitives.css:L235-L238
    [data-theme="dark"] body,
    body[data-theme="dark"] {
      background: var(--layer-bg-subtle);
    }
  globals.css:L5-L6 imports 04 before 05; layout.tsx:L47 sets data-theme only on document.documentElement.
  ```

- Problem: Both selectors are (0,1,1), unlayered, and 05 comes later, so its `background` shorthand resets the gradient and `background-attachment`. What renders today is the flat `--layer-bg-subtle` (#101a1b). `body[data-theme="dark"]` can never match because the attribute is set on <html>.
- Impact: Dead and contradictory code: anyone editing the 04 gradient sees no change.
- Fix: As proposed: delete 04-theme.css:L60-L61 (keep `position: relative`, and update the L58 comment, which now describes nothing), and drop `body[data-theme="dark"]` from 05-primitives.css:L236. Only if the owner wants the gradient would the alternative (delete 05:L235-L238 instead) apply, and that is a visible change needing approval.
- Fix risk: None visually if only the dead declarations are removed. A dark screenshot before and after should be byte-identical.
- Verification:
  - refute: CONFIRMED — 04-theme.css (import L5) and 05-primitives.css (import L6) are both unlayered (no @layer anywhere in src/styles or globals.css), and both rules use `[data-theme="dark"] body`, specificity (0,1,1). The later 05 rule wins, and its `background` shorthand resets background-image and background-attachment, so the 04 gradient and `background-attachment: fixed` never apply. `position: relative` (04:L62) is un…
  - reproduce: CONFIRMED — globals.css imports 04-theme (L5) before 05-primitives (L6), and neither file wraps its rules in @layer (grep found no @layer in src/styles). `[data-theme="dark"] body` in both files has specificity (0,1,1), so the later rule wins, and its `background` shorthand resets background-image and background-attachment. The 04 gradient and `fixed` never take effect, while `position: relative` from 04 still app…

### R-277: `.booking-button` disabled state looks enabled in dark mode, and the non-ready hover rules can never apply
- Severity: Low
- Category: Logic
- Status: CONFIRMED
- Location: src/styles/07-search-listing.css:L136-L140, L146-L152, L165-L172
- Evidence:

  ```text
  L146-L152
    .booking-button:disabled {
      background: var(--fg-muted);
      color: rgba(255, 255, 255, 0.7);
  L165-L172
    [data-theme="dark"] .booking-button { background: var(--brand-400); color: #042c28; }
    [data-theme="dark"] .booking-button:hover:not(:disabled) { background: var(--brand-300); }
  SearchBar.tsx:L244-L246
    className={`booking-button ${isHydrated && hasValidDates ? "ready" : ""}`}
    disabled={!isHydrated || !hasValidDates}
  ```

- Problem: `.booking-button:disabled` (0,2,0) and `[data-theme="dark"] .booking-button` (0,2,0) have equal specificity and the dark rule comes later, so in dark mode the disabled button gets the solid teal primary look. Because the button is enabled exactly when it is `.ready`, the non-ready hover rules (L136-L140 and L170-L172) are always overridden by the later `.ready:hover` rules of equal specificity.
- Impact: In dark mode, before dates are chosen, "Check availability" looks like an active primary button (only `cursor: not-allowed` differs). The light theme shows a grey disabled button. The dead hover rules mislead maintainers.
- Fix: Split into two tasks. (a) Visual, needs owner sign-off: add `[data-theme="dark"] .booking-button:disabled { background: var(--layer-surface-alt); color: var(--fg-muted); }` after L168. At (0,3,0) it beats the dark base rule, and the text is 5.38:1. (b) Cleanup: delete the dead hover rules at L136-L140 and L170-L172. Deleting them makes the code rely on enabled being the same as `.ready`, so add a comment or keep that coupling in mind. For both: check the bar before and after choosing dates in both themes.
- Fix risk: Visual only. Check the bar before and after choosing dates in both themes.
- Verification:
  - refute: CONFIRMED — The specificity analysis is correct. `.booking-button:disabled` is (0,2,0) and `[data-theme="dark"] .booking-button` is (0,2,0), and the dark rule comes later (L165 vs L146), so in dark mode the disabled button gets the brand-400 background and the #042c28 text. The disabled rule's `box-shadow: none`, `cursor` and `transform` still apply, because the dark rule does not set them. So the finder's 'only c…
  - reproduce: CONFIRMED — `.booking-button:disabled` (0,2,0) at L146 and `[data-theme="dark"] .booking-button` (0,2,0) at L165 tie on specificity, so the later dark rule wins background and color. The disabled button therefore shows brand-400 teal with #042c28 text, and only cursor, transform and box-shadow come from the disabled rule. No other stylesheet has a `.booking-button:disabled` or `button:disabled` rule (grep). The li…

### R-278: 12-apartment-checkin repeats the apartment rules in a pasted block; one copy drops the hover transform transition
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/styles/12-apartment-checkin.css:L571-L638 (bug: L620-L623); related: L682, 09-utilities.css:L75-L134
- Evidence:

  ```text
  L24-L26
    .apartment-btn-primary--depth {
      box-shadow: …;
      transition: box-shadow 0.25s ease, transform 0.2s ease;
  L571-L577 (indented as in the old inline <style>)
    /* Apartment cinematic styles moved from component-level global style block. */
            .apartment-cinematic-container {
              --apartment-ink: #1c1c20;
              --apartment-muted: #4b5563;
              --apartment-border: #e6e8ee;
  L609-L613: second `.apartment-spec-badge` (first at L1-L12)
  L620-L623
            .apartment-btn-primary--depth,
            .apartment-btn-secondary--depth {
              transition: box-shadow 0.25s ease;
  L624-L638: second dark `--depth` shadows (first at L45-L54, L89-L92) and second `.apartment-footer-text` (first at L100-L107)
  09-utilities.css:L74-L79 already defines `--page-ink/#1c1c20`, `--page-muted/#4b5563`, `--page-border/#e6e8ee` on `.apartment-cinematic-container`, and L89-L133 the same `.apartment-content-section`, `.apartment-section-title`, `.apartment-description-text` rules.
  ```

- Problem: The block from commit 6bb96b3 duplicates rules from the top of this file and from 09-utilities. Where the values differ, the later copy silently wins: L620-L623 replaces `transition: box-shadow, transform`, so the `translateY(-2px)` hover at L29-L32 and L72-L75 now jumps, and the dark shadows at L45-L54 are replaced by L624-L632.
- Impact: The apartment page buttons move without animation on hover. Two sources of truth for the apartment palette (`--apartment-*` vs `--page-*`, same values) invite drift.
- Fix: Task A (bug, one concern): delete 12:L620-L623 so the transform transition from L26/L69 applies again. Task B (redundancy): delete 12:L571-L586 and L593-L619 (the var block, content-section, section-title, description-text and spec-badge copies) and L633-L638 (the footer-text copy). Keep L587-L592 (`.apartment-hero-bottom-fade`, unique). Change L682 to `var(--page-border)`, since after the var block goes nothing defines `--apartment-border`. For the dark `--depth` shadows, keep L624-L632 (the current rendered look) and delete L45-L48 and L89-L92, together with the box-shadow in L50-L54, or else delete L624-L632 and accept the teal look. This is the owner's call; keep L94-L97 consistent with whichever set is chosen. Do not re-indent L640-L762 in the same patch.
```
-        .apartment-btn-primary--depth,
-        .apartment-btn-secondary--depth {
-          transition: box-shadow 0.25s ease;
-        }
```
- Fix risk: Visual. Compare /en/apartment screenshots in both themes. The only intended difference is the restored hover transition, plus the L45-L54 dark shadows if those are kept instead of L624-L632 (decide which one).
- Verification:
  - refute: CONFIRMED — The cascade supports the claim. The `@import` lines in globals.css:L10,L13 have no `layer()`, so both stylesheets are unlayered (PROGRESS/R-163 measured the same thing in Chrome). All three `transition` declarations that reach the `--depth` buttons have specificity (0,1,0): 12:L21, 12:L26 and 12:L620-L623. The last in source order wins, `transition: box-shadow 0.25s ease`, so the `translateY(-2px)` hov…
  - reproduce: CONFIRMED — The cascade trace holds. globals.css imports 09 and then 12 unlayered, after `@import "tailwindcss"`. `.apartment-btn-primary--depth, .apartment-btn-secondary--depth { transition: box-shadow 0.25s ease; }` at L620-L623 has the same specificity (0,1,0) as L24-L27 and L67-L70 but comes later in the source, so it replaces `transition: box-shadow 0.25s ease, transform 0.2s ease`. The `translateY(-2px)` hov…

### R-279: The dark blanket `span, div, label { color: inherit }` (09) disables single-class colour rules in 11/12, which is why 12 needs !important
- Severity: Low
- Category: Maintainability
- Status: CONFIRMED
- Location: src/styles/09-utilities.css:L137-L151 (cause); src/styles/12-apartment-checkin.css:L249-L255, L449-L467; src/styles/11-contact.css:L176-L187
- Evidence:

  ```text
  09-utilities.css:L137-L141
    [data-theme="dark"] span,
    [data-theme="dark"] div,
    [data-theme="dark"] label,
    [data-theme="dark"] a:not(…) { color: inherit; }
  12:L249-L255
    .checkin-page .checkin-portal .checkin-secondary-action { color: var(--checkin-ink) !important; }
    .checkin-page .checkin-portal .checkin-icon-action { color: var(--checkin-action) !important; }
  (CheckInInfo.tsx:L648-L652, L658-L660, L947-L949: both are <a>)
  12:L449-L467 `.checkin-status-approved/rejected/pending` (0,1,0) have no dark counterpart; CheckInInfo.tsx:L802 `<span className={`checkin-status-pill checkin-status-${arrivalRequest.status}`}>` → (0,1,1) inherit wins in dark. Only `-success`/`-error` get (0,2,0) dark rules (12:L544-L552).
  Same for `.checkin-chip` (span, CheckInInfo.tsx:L1007) and `.contact-social-name`/`.contact-social-handle` (spans, ContactSection.tsx:L163-L164).
  ```

- Problem: The 09 rules outrank any single-class colour on span/div/label (0,1,1 > 0,1,0) and any class colour on anchors (0,15,1). Component files compensate with !important (12:L250, L254) or by restating dark rules with an extra attribute. Where they did not, the dark colour is lost.
- Impact: In dark mode the arrival-request pill shows approved/rejected/pending in the same inherited text colour (only the background differs), the Instagram name and handle both render in accent teal, and check-in chips lose their muted tone. Readability holds, but status colour coding is lost. The moments CTA finding above is the severe case of the same mechanism.
- Fix: Short term: add dark-prefixed (0,2,0) rules for the span targets that lose their colour, `[data-theme="dark"] .checkin-status-approved|-pending { color: var(--checkin-success-fg|-pending-fg) }` and `-rejected { color: var(--checkin-error-fg) }`, and optionally `[data-theme="dark"] .checkin-chip` and `[data-theme="dark"] .contact-social-name|-handle`, each restating its own var. Long term (owner decision, full dark-mode visual pass): scope or delete the 09:L137-L151 blanket rules, which would let 12:L250/L254 drop `!important`. Record the `<p>` success/error colour override by 12:L220 (and the dead duplicate rules 12:L544-L552) as a new, separate finding. Do not fix it in this task.
- Fix risk: Removing the blanket rules affects every page in dark mode and needs a full dark-mode visual pass. The short-term fix touches only the check-in pill.
- Verification:
  - refute: CONFIRMED — The specificity arithmetic holds. `[data-theme="dark"] span|div|label` is (0,1,1). The anchor selector has 14 `:not(.x)` arguments, so it is (0,15,1). All rules are unlayered (globals.css imports have no layer). Each case follows. (a) The arrival pill is a `<span>` (CheckInInfo.tsx:L802). `.checkin-status-approved/rejected/pending` (12:L449-L467) are (0,1,0) and have no dark variant (only success/error…
  - reproduce: CONFIRMED — `data-theme` is set on documentElement (layout.tsx:L47, ThemeToggle.tsx:L48), so `[data-theme="dark"] span/div/label` (0,1,1) matches every such element in dark mode and beats single-class rules (0,1,0) in the later file 12, because specificity decides before source order. For anchors, the 09:L140 selector has 14 `:not(.x)` plus an attribute, giving (0,15,1). `.checkin-page .checkin-portal .checkin-sec…

### R-280: Custom properties and selectors in the reviewed files that nothing reads or matches
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/styles/01-tokens.css:L5-L6,L45-L51,L61,L101,L133-L134,L142-L143,L152-L153; src/styles/04-theme.css:L3-L4,L23,L44-L50; src/styles/07-search-listing.css:L3; src/styles/10-moments.css:L8,L670; src/styles/08-vendor.css:L229,L264,L415; src/styles/06-semantic-surfaces.css:L144-L156; src/styles/12-apartment-checkin.css:L562; src/styles/05-primitives.css:L198,L236
- Evidence:

  ```text
  Never read (definitions only):
  - `--foreground` 01:L6, L143, L153; 04:L4. `--background` 01:L5, L142, L152; 04:L3 (only read by `--color-background`, itself unread). `--color-background`, `--color-foreground` 01:L133-L134 (not in @theme, so no Tailwind utility; `bg-background`/`text-foreground` appear nowhere)
  - `--badge-info-bg`, `--badge-info-fg`, `--badge-warn-fg`, `--badge-ok-bg`, `--badge-ok-fg` 01:L45-L50, 04:L44-L49 (StatusCluster.tsx:L139 reads only `--badge-warn-bg`)
  - `--danger-600` 01:L51, 04:L50; `--accent-200` 01:L61, 04:L23; `--shadow-lg` 01:L101 (the Tailwind `shadow-lg` utility inlines its own value: compiled `.shadow-lg{--tw-shadow:0 10px 15px -3px …}`)
  - `--seg-gap` 07:L3; `--moments-card-bg-soft` 10:L8, L670
  Selectors matching nothing: `.leaflet-origin-marker` 08:L229, L264, L415; `@keyframes subtle-shimmer` 06:L144-L155; `.guide-option-title` 12:L562 (left over from R-088); `html:not([data-theme="dark"]) #__next` 05:L198 (App Router: `id: "__next"` exists only in node_modules/next/dist/server/render.js:L880, the Pages renderer; no src/pages); `body[data-theme="dark"]` 05:L236.
  Searches: (1) node scan of `git ls-files src public scripts tests *.ts *.mjs` for `var(--X`, `(--X` and quoted `'var(--X'` per defined property; (2) `git grep -n -F` for each name repo-wide (excluding src/generated and the lockfile): accent-200, badge-info, badge-ok, badge-warn-fg, danger-600, seg-gap, moments-card-bg-soft, color-foreground, color-background, var(--foreground), var(--background), leaflet-origin-marker, subtle-shimmer, guide-option-title, __next: no hit outside their definitions; (3) grep of node_modules/leaflet and leaflet.markercluster dist for `origin-marker`: none.
  ```

- Problem: These are dead tokens and selectors. Some pairs mislead readers: the `--badge-*` family suggests a badge system that `ui/Badge.tsx` does not use (it uses `.status-badge--*`), and `--shadow-lg` suggests it drives Tailwind's `shadow-lg`, which it does not.
- Impact: Maintenance noise only. Changing, for example, `--shadow-lg` or `--danger-600` has no effect.
- Fix: Apply the proposed deletions, with the following adjustments.
- The `subtle-shimmer` block spans 06:L144-L156, including its comment and closing brace.
- Keep `--badge-warn-bg` (StatusCluster.tsx:L139), `--radius-*`, `--font-serif/sans/mono` and `--shadow-sm/md`, which project CSS reads.
- Two further leftovers from the same bd50a80 cleanup are not part of this deletion:
  - The `:not(.guide-option-card)` in 09-utilities.css:L140,L145,L149 is also dead. Removing it lowers those selectors' specificity by one class, so handle it separately and check the dark-mode link colours.
- If finding 2's fix is applied first, the `--background`/`--foreground` lines at 01:L142-L143 and L152-L153 disappear with it.
- Fix risk: Low. The build and a visual diff of the home, moments, map and admin pages should be identical. `--font-*` and `--color-brand-*` are read by Tailwind and must stay.
- Verification:
  - refute: CONFIRMED — Every listed custom property has only definitions and no reader. Project CSS, TS/TSX, tests, scripts and the imported vendor stylesheets (react-day-picker src/style.css, leaflet.css, MarkerCluster*.css) never read any of them. No dynamic construction exists either: there is no `var(--${...}`, `setProperty` or `getPropertyValue` anywhere in src/public/scripts/tests. `--color-background` and `--color-for…
  - reproduce: CONFIRMED — Every listed token and selector turns up only at its definition. I checked for dynamic references with template-literal var(--${...}) and `--${` patterns and found none. The only divIcon className in LeafletMap is 'leaflet-custom-marker', so '.leaflet-origin-marker' matches nothing. Nothing applies subtle-shimmer as an animation. The id '__next' appears only in the Pages renderer, and src/pages does no…

### R-281: `--radius-sm/md/lg/xl` tokens silently redefine Tailwind's `rounded-sm/md/lg/xl` (6/10/14/20px instead of 4/6/8/12px)
- Severity: Low
- Category: Maintainability
- Status: CONFIRMED
- Location: src/styles/01-tokens.css:L91-L96
- Evidence:

  ```text
  01-tokens.css:L92-L95
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
    --radius-xl: 20px;
  node_modules/tailwindcss/theme.css (4.3.2):L398-L401 `--radius-sm: 0.25rem; --radius-md: 0.375rem; --radius-lg: 0.5rem; --radius-xl: 0.75rem;`
  Compiled .next/static/chunks/0pogfv9fs91vc.css: `.rounded-xl{border-radius:var(--radius-xl)}`, `.rounded-lg{border-radius:var(--radius-lg)}`, with both `--radius-xl:.75rem` (@layer theme) and `--radius-xl:20px` (unlayered, wins).
  Usage: 56× rounded-lg, 7× rounded-md, 7× rounded-xl in src/**/*.tsx; the project CSS itself reads only `var(--radius-sm)` (12:L426) and `--radius-md/lg/full`.
  ```

- Problem: The project tokens share Tailwind v4's theme namespace. The unlayered `:root` values override Tailwind's layered theme values, so every `rounded-*` utility renders the project radius, not Tailwind's. The file comment "Tailwind v4 inline theme variables (without @theme to avoid build errors)" shows the collision is not documented.
- Impact: No visible bug today, but a latent trap: `rounded-lg` in markup is 14px, and a later rename or removal of the token changes 70 elements at once.
- Fix: Minimal: add a comment above 01-tokens.css:L91 stating that `--radius-sm/md/lg/xl` intentionally override Tailwind's `rounded-sm/md/lg/xl` (and that `--font-*` below does the same), so they must not be removed as unused. Alternatively, move the four values into a `@theme { --radius-sm: 6px; ... }` block in globals.css and delete them from `:root`; keep `--radius-full` in `:root`. A rename is the only option that changes rendering, and it needs a visual review.
- Fix risk: Renaming changes the corner radius of about 70 elements, so it needs a visual review. Documenting it via @theme changes nothing.
- Verification:
  - refute: CONFIRMED — The mechanism is verified in the compiled CSS. Tailwind 4.3.2 compiles `rounded-sm/md/lg/xl` to `border-radius: var(--radius-*)` and declares its defaults inside `@layer theme { :root,:host {...} }`. The project declares the same names in an unlayered `:root`, and unlayered declarations beat layered ones, so the utilities render 6/10/14/20px. Usage in src/**/*.ts(x): 56 `rounded-lg`, 7 `rounded-md`, 7…
  - reproduce: CONFIRMED — Tailwind 4.3.2 generates rounded-* as border-radius:var(--radius-*). Its defaults live in @layer theme. The project's :root declarations are unlayered, and unlayered declarations beat layered ones in the cascade, so the project values win. I verified the layer position of both declarations by walking the brace nesting of the compiled CSS. One small inaccuracy: '22 CSS usages' is imprecise. The project…

### R-282: The no-JS dark fallback in 01-tokens produces half-dark pages (black text on dark surfaces)
- Severity: Low
- Category: Logic
- Status: CONFIRMED
- Location: src/styles/01-tokens.css:L140-L158
- Evidence:

  ```text
  L140-L149
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme]) {
        --background: #0a0a0a; --foreground: #ededed;
        --layer-bg-subtle: #121718;
        --layer-surface: #182224;
        --layer-surface-alt: #1e2c2e;
        color-scheme: dark;
  L15: `--fg-default: #000000;` (not overridden in the block). 05-primitives.css:L186-L188 `body { background: var(--sand-50); color: var(--fg-default);`
  layout.tsx:L38 `<html lang={locale} suppressHydrationWarning>` (no data-theme in server HTML); L47 the inline script sets it in both try and catch, so the block applies only when JS does not run.
  Example: 06:L75-L80 `.surface-panel { background: var(--layer-surface); … color: var(--fg-default); }` → #000 on #182224.
  ```

- Problem: The block darkens only the `--layer-*` surfaces (plus the unread `--background/--foreground`). Text tokens, `--sand-*` and the brand scale stay light, so without JS on an OS in dark mode, panels and moments cards are dark with black text while the page itself stays sand. L151-L157 then restate the `:root` values for `[data-theme="light"]`, which never competes with the block because the block requires `:not([data-theme])`.
- Impact: Visitors with JavaScript disabled and an OS in dark mode get unreadable panels and cards. This is rare, but it is the only purpose of this block.
- Fix: As proposed: delete 01-tokens.css:L140-L149 and reduce L151-L158 to `[data-theme="light"] { color-scheme: light; }`. Deleting L151-L158 entirely would render the same, because there is no color-scheme meta and the default is light. Verify with JS disabled and the OS in dark mode that panels and cards render in the light theme.
- Fix risk: None with JS enabled (the attribute is always set). Check with JS disabled and the OS in dark mode.
- Verification:
  - refute: CONFIRMED — The block at 01:L140-L149 can only apply when `<html>` has no `data-theme` attribute. The inline head script sets the attribute in both its try and catch branches, and runs before the body is parsed. Its nonce always comes with a matching CSP: security-middleware-edge.ts sets the CSP header and `x-nonce` together, in the same handler, for every page route. So the block applies only when JavaScript is d…
  - reproduce: CONFIRMED — I traced the cascade from the code but did not render a page with JS off. The server HTML has no data-theme attribute. The inline script sets the attribute in both its try and catch branches, and ThemeToggle sets it too, so `:root:not([data-theme])` can only match when the script does not run. In that case only --background, --foreground and the three --layer-* tokens turn dark. --fg-default stays #000…

### R-283: The check-in and admin palettes are the same hex literals in two files
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/styles/13-compatibility-admin.css:L17-L26, L42-L51, L88-L89, L111-L127, L144-L145, L159-L187; src/styles/12-apartment-checkin.css:L191-L218, L387-L396, L412-L421, L481-L508, L520-L536
- Evidence:

  ```text
  13:L17-L18, L26 `background: #25342B; color: #F7F1E8;` hover `#35483B` = 12:L387-L388, L396 (`.checkin-primary-action`)
  13:L42-L43, L51 `#cfb994` / `#6f552f` / hover `#f4eadb` = 12:L412-L413, L421 (`.checkin-outline-action`)
  13:L111-L127 dark `#D8C7A1`/`#101916`/`#E4D6BA`, `#4a5a4d`/`#203026` = 12:L520-L536
  13:L159-L187 `.status-badge--approved/rejected/pending` light `#e6f0dd/#36552e`, `#f8e6de/#8a4229`, `#f4eadb/#7b5d32`, dark `#233326/#CFE1C8`, `#3a241c/#F0B8A0`, `#2e2d22/#D8C7A1` = 12:L212-L217 and L502-L507 (`--checkin-*-bg/fg`)
  13:L88-L89, L144-L145 `.admin-note-panel` = 12:L199, L201, L489, L491 (card border/bg-strong)
  ```

- Problem: About 30 colour values are copied between the check-in portal and the admin "compatibility" primitives instead of shared through custom properties. 12 already has the tokens (`--checkin-*`) but scopes them to `.checkin-page .checkin-portal`, so admin cannot reuse them.
- Impact: A palette tweak (e.g. a contrast fix) must be made twice. The files already differ in small ways (13's `.admin-action-primary` min-height 2.75rem vs 12's 2.5rem).
- Fix: Optional, owner approval needed, and it is a bigger change than the benefit justifies right now. A smaller alternative to a new `--boutique-*` family: (1) move only the six existing status tokens (`--checkin-success/error/pending-bg/fg`) from `.checkin-page .checkin-portal` to `:root` and `[data-theme="dark"]`, and point `.status-badge--approved/rejected/pending` (13:L159-L187) at them. The six dark `.status-badge--*` overrides (L174-L187) then go away. (2) For the buttons, group only the colour declarations under shared selector lists, e.g. `.admin-action-primary, .checkin-primary-action { background: #25342B; color: #F7F1E8; }`, and do the same for hover and dark. This keeps the different sizing and adds no new tokens. Gates: computed styles and screenshots of admin pages and /check-in in light and dark must be identical before and after.
- Fix risk: Visual identity must stay byte-identical. Check admin pages and /check-in screenshots in both themes.
- Verification:
  - refute: CONFIRMED — All cited lines match. The two files carry the same colour values as literals: primary and outline buttons (light and dark, 12 values), the six status pairs (light and dark, 12 values) and the note-panel border and background (light and dark, 4 values). That is 28 values. None of these hex values appear in 01-11, so only 12 and 13 hold them. 12 does define `--checkin-*` tokens, but only under `.checkin…
  - reproduce: CONFIRMED — Every cited hex pair is present at the cited lines in both files. The check-in tokens are scoped to `.checkin-page .checkin-portal` (light, 12:L191) and `[data-theme="dark"] .checkin-page .checkin-portal` (dark, 12:L481), so admin rules cannot resolve them. The count is about right: primary 6, outline 6, badges 12 and note panel 4, which makes 28 values. The duplication is palette only, not whole compo…

### R-284: The full-bleed contact section (`width: 100vw` with negative margins) likely causes horizontal scroll where scrollbars take layout space
- Severity: Low
- Category: Bug
- Status: CONFIRMED
- Location: src/styles/11-contact.css:L11-L13 (placement: src/app/[locale]/page.tsx:L64-L65)
- Evidence:

  ```text
  L11-L16
    width: 100vw;
    margin-left: calc(50% - 50vw);
    margin-right: calc(50% - 50vw);
    …
    overflow: clip;
  No `overflow-x` guard on html/body: grep of src/styles/*.css, globals.css and both layouts finds `overflow-x` only at 10-moments.css:L95 and 12-apartment-checkin.css:L649.
  Rendered on the home page (page.tsx:L65 via DeferredContactSection) inside `.page-container … mx-auto max-w-5xl`.
  ```

- Problem: With a classic (non-overlay) vertical scrollbar, 100vw includes the scrollbar width, so the section extends about half a scrollbar width past the content box on the right. `overflow: clip` clips only the section's own children, not the page.
- Impact: Probably a few pixels of horizontal scroll on the home page for desktop visitors using Windows browsers, or macOS with "always show scrollbars". Overlay scrollbars on phones are unaffected.
- Fix: Delete the three full-bleed declarations at src/styles/11-contact.css:L11-L13 (`width: 100vw;` and both `margin-*: calc(50% - 50vw)`). The section is a direct child of full-width <main>, not of the max-w-5xl container, so as a normal block it already spans the viewport's usable width, edge to edge, with no scrollbar overflow. Do not add a global overflow-x guard on body. Test: screenshot /en and /el on desktop (light and dark) and on phone widths to check the background still runs edge to edge. With classic scrollbars (Windows, or macOS 'Always show scrollbars'), check that `document.documentElement.scrollWidth === document.documentElement.clientWidth` after the section mounts.
- Fix risk: `overflow-x: clip` on body does not create a scroll container (unlike hidden), so position: sticky keeps working. Still, check the sticky and fixed header and the map pages.
- Verification:
  - refute: CONFIRMED — The overflow follows from the CSS geometry and the spec. I did not measure it in a browser: plan mode forbids dev servers and writing test HTML. The page leaves the root overflow at its default and sets no scrollbar-gutter. Under CSS Values 4, a scrollbar that only appears when needed (overflow: auto) does not shrink viewport units, so with a classic scrollbar 100vw = full window width W. The containin…
  - reproduce: CONFIRMED — I traced the CSS arithmetic and the full ancestor chain; I did not observe it in a browser. The section's containing block is main#main-content. It is not .page-container: the finding is wrong on that point. main has no max-width, horizontal padding or overflow, and neither do its wrappers (div[data-locale], div.min-h-svh, body, html). So 50% equals the html clientWidth (cw), which is the viewport widt…

## Nits

### R-285: Nit group: redundant checks, dead branch and shared loading state in the admin UI
- Severity: Nit
- Category: Redundant
- Status: CONFIRMED
- Location: (a) src/app/api/admin/refresh/route.ts:21-25; (b) src/app/admin/AdminHomeClient.tsx:137-148 + src/styles/13-compatibility-admin.css:99-; (c) src/lib/guestDataExport.ts:118-123 and 147-151; (d) src/app/admin/guests/page.tsx:65, 177-264 (incl. createBooking), 473, 515-519; (e) src/app/admin/guests/page.tsx:133-134, 458-468 and src/app/api/admin/guests/route.ts:74-84
- Evidence:

  ```text
  (a) src/app/api/admin/refresh/route.ts:23  `if (!loginAt || !sessionId || Date.now() / 1000 - loginAt > 86400)` duplicates the DB check src/lib/auth/admin.ts:123 `current.absoluteExpiresAt <= now` (absoluteExpiresAt = login time + 24 h, L89).
  (b) src/app/admin/AdminHomeClient.tsx:137-148  `{card.href ? (<Link…>) : (<span className="admin-action-muted">…)}` — every card in L54-83 has `href`, the else branch is unreachable.
  (c) src/lib/guestDataExport.ts:121-122  `bookingStart === startDate || bookingEnd === startDate || (bookingStart <= startDate && bookingEnd >= startDate)` — the first two terms are implied by the third; L151 recomputes `now` inside the forEach.
  (d) src/app/admin/guests/page.tsx:177-194, 224-242, 244-264 set the page-wide `loading`, and L515-519 replace the whole bookings list with the "Loading bookings..." spinner (re-running the entry animation) while a claim token, access reset or erasure is in flight; the Search button reads "Searching..." (L473).
  (e) src/app/admin/guests/page.tsx:133-134 and src/app/api/admin/guests/route.ts:74-84: the date search sends the raw input and compares it lexicographically to `yyyy-MM-dd` strings; `25/12/2024` silently yields an empty list instead of a validation error.
  ```

- Problem: Small redundancies and one cosmetic UI-state flaw; none changes behaviour on a valid path.
- Impact: Readability and a flicker of the guests list during admin actions; a mistyped date search looks like "no bookings".
- Fix: (a) Drop `Date.now() / 1000 - loginAt > 86400`; keep `!sessionId` (needed for TS narrowing of `session_id?: string`). No test asserts 'Token too old', so tests/routes/admin-refresh.test.ts is unaffected. (b) Render `<Link>` unconditionally AND delete the `.admin-action-muted` rule in src/styles/13-compatibility-admin.css (its only consumer disappears; otherwise the CSS becomes dead code). (c) Keep only `bookingStart <= startDate && bookingEnd >= startDate` and hoist `now` above the forEach; note the equivalence relies on endDate >= startDate, which the only writer (`POST /api/admin/bookings` refine) guarantees but the DB does not enforce — the existing tests at tests/unit/guest-data-export.test.ts:52-60 are the regression net. (d) Introduce a separate `actionBusy` (or per-booking busy id) for issueClaimGrant, createBooking, resetGuestAccess and eraseGuest (the finder omitted createBooking); leave `loading` for fetchAllBookings/handleSearch so the spinner and 'Searching...' label only appear for list loads. (e) Route: parse `startDate` with `z.iso.date()` and `endDate` with `z.iso.date().optional()` (zod 4.4.3, same pattern as src/app/api/admin/bookings/route.ts:26-27) and throw `ApiError(VALIDATION_ERROR)` on failure; page: build the URL with `encodeURIComponent(searchQuery.trim())` (or `URLSearchParams`) in the date branch like the other two branches, and set `type="date"` on the input when `searchType === 'date'`. Add one route test for the 400 on a malformed date (none exists; tests/security/admin-guests-errors.test.ts only covers the 500 path).
- Fix risk: None; component tests admin-guests-*.test.tsx cover the list rendering.
- Verification:
  - refute: CONFIRMED — All five sub-findings hold at HEAD fff4283; none is recorded as fixed or declined (B4/R-120 touched the refresh route but left the age check; N1e/R-158 only changed the date display, not the date search; the R-102 declined list does not name any of these). Calibration: (a)-(d) are pure readability/cosmetic; (e) is the only one with a user-visible consequence (a mistyped date shows 'No Bookings Found' w…
  - reproduce: CONFIRMED — All five sub-items reproduce at HEAD fff4283 and the cited line numbers are accurate. (a) The JWT age check in the refresh route is behaviourally redundant: `verifyAdminSession` (L16) already goes through `readActiveAdminSession`, which returns null when `record.absoluteExpiresAt <= now` (admin.ts L107-111) and when `!payload.session_id` (L100); `refreshAdminSession` repeats the absolute check (L122).…

### R-286: Zod 4: `z.string().url()` and `z.string().datetime()` are deprecated APIs
- Severity: Nit
- Category: Legacy
- Status: CONFIRMED
- Location: src/data/schemas.ts:L41-L44,L53 (same pattern also in src/lib/runtime-env-schema.js:L42-L67, src/app/api/errors/route.ts:L22-L23, src/app/api/booking-requests/route.ts:L34, src/components/BookingForm.tsx:L53, src/lib/adminListPage.ts:L6, and four admin route files using z.string().uuid())
- Evidence:

  ```text
  schemas.ts L41-L44: website: z.string().url().optional(), directionsUrl: z.string().url().optional(), reservationUrl: z.string().url().optional(), sourceUrls: z.array(z.string().url()).optional(),
  L53: updatedAt: z.string().datetime().optional(),
  Installed zod 4.4.3 (node_modules/zod/package.json). node_modules/zod/v4/classic/schemas.d.ts L112: /** @deprecated Use `z.url()` instead. */  L160: /** @deprecated Use `z.iso.datetime()` instead. */
  ```

- Problem: Deprecated string-format methods still work but are slated for removal in a future major.
- Impact: None today; a future zod upgrade breaks content validation at build time (scripts/validate-content.ts) and at request time.
- Fix: Do not fix schemas.ts on its own. Record one repo-wide 'zod 4 top-level string formats' item and do it together with the next zod major upgrade, when the compiler will list every site. When it is done: `z.url()`/`z.iso.datetime()`/`z.uuid()` are drop-in replacements. For the chains that trim or check min(1) before the format (booking-requests L34, BookingForm L53), first add tests that pin the current error message and whitespace behaviour. If the owner accepts the unused-fields finding (index 0), schemas.ts L53 disappears with it.
- Fix risk: None; run the content validation and tests/unit/data-map-navigation.test.ts.
- Verification:
  - refute: CONFIRMED — The deprecation is real in the installed zod 4.4.3. For these two methods the replacement behaves the same. `z.string().url()` calls `inst.check(core._url(ZodURL, params))`, the same constructor `z.url()` uses. `z.string().datetime()` calls `inst.check(iso.datetime(params))`, and `z.iso.datetime` is that same function. So migrating schemas.ts changes no behaviour. Two parts of the finding are inaccurat…
  - reproduce: CONFIRMED — Installed zod is 4.4.3. Its classic ZodString typings mark .url() and .datetime() @deprecated and point to z.url() and z.iso.datetime(). schemas.ts uses both at the cited lines. They are deprecated, not removed, so nothing breaks today. The finding says they are 'slated for removal in a future major', but the d.ts does not state that; it only says @deprecated.

### R-287: hreflang set for the home page lacks x-default while every other page declares it
- Severity: Nit
- Category: Maintainability
- Status: CONFIRMED
- Location: src/app/[locale]/layout.tsx:L17-L22
- Evidence:

  ```text
  [locale]/layout.tsx L17: const languages = { en: "/en", el: "/el" } as const;  L22: alternates: { canonical: `/${eff}`, languages },
  src/lib/seo.ts L9-L13: languages: { en: ..., el: ..., 'x-default': `/en${normalizedSuffix}` }  (used by all sub-pages)
  src/app/[locale]/page.tsx has no generateMetadata, so the home page inherits the layout's alternates.
  ```

- Problem: The home page (the most linked URL) is the only indexable page without `x-default`; two hand-written hreflang shapes exist.
- Impact: Minor SEO inconsistency.
- Fix: In src/app/[locale]/layout.tsx, add `import { localizedAlternates } from '@/lib/seo';`, delete L17 (`const languages = ...`), and replace L22 with `alternates: localizedAlternates(eff),`. Verify with typecheck and lint, and optionally with a unit test that asserts the layout's `generateMetadata({ params: Promise.resolve({ locale: 'el' }) })` returns `alternates.languages['x-default'] === '/en'` and canonical `/el`.
- Fix risk: None.
- Verification:
  - refute: CONFIRMED — I could not refute it. The home page `src/app/[locale]/page.tsx` has no `metadata`/`generateMetadata` export (grep for 'Metadata|metadata' in that file found nothing), so it inherits the layout's `alternates`. Those list only `en` and `el`. Every other indexable page (about, apartment, book, booking-details, [category], [category]/[slug]) calls `localizedAlternates()`, which adds `'x-default'`. Next re…
  - reproduce: CONFIRMED — The line numbers are correct. The layout builds its hreflang map by hand as { en: "/en", el: "/el" }, with no 'x-default' key. src/app/[locale]/page.tsx has no generateMetadata or metadata export, so the home page inherits these alternates. Every other indexable page (about, apartment, book, booking-details, [category], [category]/[slug]) uses localizedAlternates, which emits 'x-default' → /en<suffix>.…

### R-288: Nit group: leftovers in the security/runtime modules
- Severity: Nit
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/security-monitoring.ts:L117,L128,L150-L159; src/lib/security-config.ts:L37,L279; src/app/api/health/ready/route.ts:L34-L36; src/lib/internalFetchClient.ts:L8-L10; src/app/api/errors/route.ts:L25 + src/lib/errorReporting.ts:L71; src/lib/security-middleware-edge.ts:L26-L44,L39; src/proxy.ts:L28,L31,L85; src/lib/prisma.ts:L35-L38; src/lib/logger-enterprise.ts:L182; src/lib/apiErrorHandler.ts:L457-L458; src/lib/runtime-env-schema.js:L55
- Evidence:

  ```text
  1. security-monitoring.ts:L150-L159 `request: { ip?: string; userAgent?: string }` / `userAgent: request.userAgent` and security-config.ts:L279 `userAgent?: string` — the only caller (csp-report/route.ts:L59-L61) passes `{ ip }`, and `sanitizeEvent` (L63-L72) drops the field; also `console.warn('🔐 Security Event:'` at L117 bypasses the logger in development.
  2. security-config.ts:L37 `frameOptions: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM'` — `ALLOW-FROM` is obsolete (unsupported by current browsers) and unused.
  3. health/ready/route.ts:L34-L36 `checkReadiness()` only returns `databaseReady()`.
  4. internalFetchClient.ts:L8-L10 sets `credentials = 'same-origin'`, which is the Fetch default.
  5. errors/route.ts:L25 accepts `environment: z.enum([...])` and never stores it (L63-L72).
  6. security-middleware-edge.ts:L26-L44 builds a throwaway `NextResponse.next()` only to copy its headers onto a second `NextResponse.next({ request })`.
  7. proxy.ts:L28,L31 hard-code `(?:en|el)` instead of `locales` from `@/i18n/config`; adding a locale silently loses `X-Robots-Tag` on check-in and `no-referrer` on the guest page.
  8. prisma.ts:L35-L38 comment "Adds distributed tracing and metrics instrumentation" describes code removed in R-029; the handler only logs slow queries/errors.
  9. logger-enterprise.ts:L182 `duration: Date.now() - this.startTime` is process uptime, labelled as a duration, emitted on every entry when `LOG_PERFORMANCE=true`.
  10. apiErrorHandler.ts:L457-L458 `version: '1.0', processingTime: 0, // Would be calculated by middleware` on every success body.
  11. runtime-env-schema.js:L55 `NEXT_PUBLIC_SITE_URL: z.string().url().optional()` does not use `optionalEnv`, so an empty `NEXT_PUBLIC_SITE_URL=` line fails with "Invalid URL" instead of the tailored "required in production" message that every other optional key gets.
  12. proxy.ts:L85 matcher `"/((?!_next|.*\\..*).*)"` still excludes dotted paths, so `/robots.txt`, `/sitemap.xml` (route handlers `robots.ts`/`sitemap.ts`), `/sw.js`, `/app.webmanifest`, `/version.json` and icons are served without any of the security headers and Nginx adds none (`grep -rn add_header deploy/nginx` → nothing). R-034's API-CSV case is gone; this is the residue.
  ```

- Problem: Small dead parameters, stale comments, duplicated literals and one default-restating call. Individually harmless.
- Impact: Reader confusion and drift risk (items 7, 8, 12 are the ones with a concrete consequence).
- Fix: Same single cleanup patch, with these corrections. Item 5: remove `environment` from both the `.strict()` schema and the sender (errorReporting.ts:L71) in the same change. Otherwise every client error report returns 400. Item 7: build the regexes in proxy.ts:L28,L31 and security-middleware-edge.ts:L39 from `locales`; the `x-locale` one is the most important. Item 11: use `optionalEnv(z.string().url())` so development tolerates an empty line like every other optional key; the production superRefine already fires. Item 12: either accept and document it, or add the dotted files to the matcher AND return early in `proxy()` for them (e.g. before the locale redirect, `if (/\.[a-z0-9]+$/i.test(pathname)) return response;`, or add them to NON_LOCALIZED_ROUTE_PREFIXES). Without the early return they are 302-redirected to `/en/robots.txt`, `/en/sw.js` etc., which breaks robots/sitemap/manifest and service-worker registration. Verify with the service-worker test plus a live check that `/sw.js` still answers 200 with no redirect. The other items stand as proposed.
- Fix risk: None beyond re-running `typecheck`, `lint`, `knip` and the affected unit tests.
- Verification:
  - refute: CONFIRMED — I re-read every item. Items 1-4, 6, 8, 9 and 10 are accurate as written. Item 1: the only caller passes `{ ip }`, `sanitizeEvent` rebuilds the event without userAgent, and `userAgent` appears nowhere else. The development-only `console.warn` is also real; L128's `console.error` bypasses the logger in production too. Item 2: `ALLOW-FROM` appears only in the type union; the configs use SAMEORIGIN and DEN…
  - reproduce: CONFIRMED — I re-read all 12 items and each holds as described, with line numbers matching except item 8 (L35-L37, not L35-L38; minor). Item 11 was demonstrated by running the schema. Item 12 was traced: nothing in the proxy, next.config or Nginx adds security headers to dotted paths. Whether Cloudflare adds any is outside the repo. Item 7 has a second hard-coded instance the finding missed (security-middleware-ed…

### R-289: Nits: dead policy path entry, triple identical return, engines range wider than the documented runtime, legacy .dockerignore entries
- Severity: Nit
- Category: Redundant
- Status: CONFIRMED
- Location: scripts/check-licenses.ts:L232-L242; package.json:L7-L10 / scripts/README.md:L5 / CLAUDE.md:L9
- Evidence:

  ```text
  scripts/lib/release-policy.mjs:431-437 adds 'Dockerfile' (root) to scriptFiles; `ls Dockerfile` -> no such file, readOptional returns undefined and the entry is skipped every run.
  scripts/check-licenses.ts:232-242
    } catch {
      if (normalized.toLowerCase().startsWith('see license in')) { return false; }
      if (normalized === 'UNLICENSED') { return false; }
      return false;
    }
  package.json:7-10 "node": ">=22.19.0" while scripts/README.md:5, CLAUDE.md:9 and .nvmrc say 22.19.x; system-orchestrator.sh:207-231 only checks the lower bound.
  .dockerignore:19-23 analytics-backups / analytics-data.json* / analytics-ratelimit.json* — the analytics feature was removed (D2/S2); same family as the .gitignore entries declined in R-102, listed here only for completeness.
  ```

- Problem: Small leftovers with no behavioural effect.
- Impact: None at runtime; minor reader confusion.
- Fix: Collapse the catch in check-licenses.ts to `} catch { return false; }`. For the version mismatch, change the docs, not engines: say 'Node >= 22.19 (22.19.x tested)', or leave it as is. Pinning engines to `22.19.x` would disable the orchestrator's version check unless package_engine_min is changed too. Leave the root 'Dockerfile' scan entry (a harmless guard) and the .dockerignore analytics lines (R-102 declined family) as they are.
- Fix risk: Pinning engines to 22.19.x makes `npm ci` warn (or fail with engine-strict) on other Node majors, which is the documented intent.
- Verification:
  - refute: CONFIRMED — Each sub-item checked separately. (1) The redundant branches in the check-licenses.ts catch are confirmed: all three paths return false. (2) The root 'Dockerfile' entry has no effect today, since no such file exists. It is a conditional scan of an optional path (readOptional, then `continue`), the same pattern as FORBIDDEN_PLATFORM_PATHS, so it would scan a reintroduced root Dockerfile. It is harmless,…
  - reproduce: CONFIRMED — All four items reproduce. (1) 'Dockerfile' is at L435 (inside L431-L437). No root Dockerfile exists (ls fails, git ls-files empty), and readOptional returning undefined means the loop skips it at L442-L443. The entry works as a forward guard against a reintroduced root Dockerfile, so removing it is a preference, not dead code. (2) The three `return false` paths are at check-licenses.ts:L232-L242 as quo…

### R-290: Test hygiene nits (grouped): repo-root temp dir, unrestored fake timers, zero-tick sleep, duplicated migration-hash check, triplicated IP matrix
- Severity: Nit
- Category: Tests
- Status: CONFIRMED
- Location: tests/unit/build-workers.test.ts:L9-L11; tests/unit/data-map-navigation.test.ts:L60-L68; tests/components/guest-session-hook.test.tsx:L29-L37; tests/integration/database-foundation.test.ts:L40-L41,L51-L52 + tests/integration/support/migrations.ts:L39-L63
- Evidence:

  ```text
  (a) tests/unit/build-workers.test.ts:L9 `const outdir = mkdtempSync('tmp-build-workers-');` resolves against the repository root (comment L7-L8); `git check-ignore tmp-build-workers-abc` -> NOT ignored, so a crash before `afterAll` (L11) leaves an untracked directory in `git status`. (b) tests/unit/data-map-navigation.test.ts:L60-L68 calls `vi.useFakeTimers()` and `vi.useRealTimers()` inside the test body with no `afterEach`; a failing expectation at L63-L66 leaves timers faked for the rest of the file (vitest does not restore fake timers automatically). (c) tests/components/guest-session-hook.test.tsx:L35 `await new Promise((resolve) => setTimeout(resolve, 0));` before asserting a negative, against docs/testing.md:L123 'do not use arbitrary sleeps'. (d) tests/integration/database-foundation.test.ts:L40-L41 and L51-L52 run both `assertCommittedMigrationManifest()` (checkPrismaIntegrity, hashes every migration file against the manifest) and `migrationFileHashes()` before/after; if the manifest check passes at both points the hash maps are equal by construction, so `listMigrationFiles`/`migrationFileHashes` (tests/integration/support/migrations.ts:L39-L63) are redundant. (e) The same IP-canonicalisation input matrix ('', 'unknown', ' 203.0.113.10', '203.0.113.10,198.51.100.20', '203.0.113.10:443', 'fe80::1%eth0', '::::') is asserted in tests/security/client-identity.test.ts:L28-L43, tests/security/security-boundaries.test.ts:L257-L279 and tests/security/rate-limit-persistence.test.ts:L168-L185.
  ```

- Problem: Small isolation and duplication issues; none changes a verdict today.
- Impact: (a) dirty working tree after an aborted run; (b) order-dependent failures only after another failure; (c) a flaky negative assertion; (d)(e) duplicated maintenance.
- Fix: (a) Add `/tmp-build-workers-*/` to .gitignore and keep the in-repository mkdtempSync, since the bundler rejects os.tmpdir(). (b) Add `afterEach(() => vi.useRealTimers())` in data-map-navigation.test.ts, or wrap the body in try/finally. (c) Do not use a bare waitFor on false, because it passes on its first check. To make the negative check meaningful, first return status(true) and wait until isSignedIn is true. Then set the mock to return status(false), dispatch `window.dispatchEvent(new Event('focus'))` inside act, and waitFor isSignedIn to become false. Otherwise leave the test as it is. (d) Optional: drop listMigrationFiles/migrationFileHashes and the initialMigrationHashes comparison and keep the two assertCommittedMigrationManifest() calls. This can only be checked through `npm run test:integration` (needs Docker). (e) No change. The rate-limit-persistence matrix is the only coverage of the reason codes, and the security-boundaries matrix tests different (attestation) inputs.
- Fix risk: (a) scripts/build-workers.mjs refuses output locations outside the repository per the comment at L7, so the .gitignore route is the safe one. Others: none.
- Verification:
  - refute: CONFIRMED — Partly confirmed. Items (a)-(d) hold. Item (e) is refuted, and the proposed fixes for (a), (c) and (e) need changes. (a) The temp dir is created relative to the repository root and is not gitignored. afterAll still runs when a test fails, so the dir is left behind only when the process is killed (Ctrl-C or a worker kill). The os.tmpdir() option cannot work, because build-workers.mjs throws for any outd…
  - reproduce: CONFIRMED — Sub-items (a), (b), (c) and (d) hold as stated, with two caveats on (c) and (d). Sub-item (e) is partly wrong and should be dropped. (a) The temp dir is resolved relative to the repo root and git does not ignore it, so an aborted run can leave an untracked dir. (b) In Vitest 4.1.11, fake timers are only reset on dispose (file teardown), not per test. restoreMocks/mockReset/unstub* do not touch timers. A failing expect at L63-L66 skips L67, so timers stay faked for the rest of that file. (c) The zero-tick sleep is real and conflicts with docs/testing.md:L123. It is a weak negative assertion (it can pass trivially), not a flaky one. The proposed fix `waitFor(() => expect(...).toBe(false))` is just as weak because it also passes on the first check. A better fix asserts after the fetch mock's `json()` resolved, or checks the final state after `act`. (d) checkPrismaIntegrity walks every file under prisma/migrations and compares path, sha256 and bytes with the manifest. migrationFileHashes hashes only a subset (migration_lock.toml plus each */migration.sql). So when the integrity check passes both times, the extra comparison only adds anything if the manifest itself is rewritten during the run. It is practically redundant. (e) The claim is only partly true. tests/security/security-boundaries.test.ts:L257-L279 is a trusted-proxy header/attestation matrix. It shares only the ':443' and multi-value IP cases and contains none of '', 'unknown', 'fe80::1%eth0' or '::::'. rate-limit-persistence.test.ts:L168-L185 repeats most inputs, but it checks a different contract: per-input `reason` codes plus no queryRaw/privacyHmac call before persistence. That overlap is justified, so this is not a triplicated matrix.

### R-291: Single-use wrappers and one-value abstractions: `config.ts`, `MAP_CSS_CLASSES`, `stayRequestPhone.ts`, CVA with one variant, two admin-auth idioms
- Severity: Nit
- Category: Overengineering
- Status: CONFIRMED
- Location: src/lib/config.ts:L3-L8; src/lib/site.ts:L1-L2; tests/unit/config.test.ts:L1-L26; src/lib/mapConstants.ts:L5-L15; src/components/ui/Button.tsx:L5-L17
- Evidence:

  ```text
  config.ts:3-8 exports an object with one method `absoluteSiteUrl()`; its only importer is site.ts:1-2 (`grep -rn "from '@/lib/config'" src` → site.ts only). Its `url.startsWith('http') ? url : \`https://${url}\`` branch is dead because `NEXT_PUBLIC_SITE_URL` is validated with `z.string().url()` (runtime-env-schema.js:54). mapConstants.ts:12-15 `MAP_CSS_CLASSES` holds two className strings consumed only by MapLoadingSkeleton.tsx:23,26; `MAP_DEFAULTS.HEIGHT.COMPACT` and `.BOOKING` are both `'260px'` (L7-8). stayRequestPhone.ts:5-7 wraps `normalizePhone(value,'GR')?.e164 ?? null` for one caller (booking-requests/route.ts:101). ui/Button.tsx:5-17 uses `cva` with a single variant `primary`; ui/Surface.tsx:5-8 `variant: { card }` has one value. Admin auth is expressed two ways: `isAdminRequest(request)` (rbac.ts:4-8, 12 routes) vs. reading the cookie and calling `verifyAdminSession` directly (admin/bookings/[id]/claim-grants/route.ts:21, access-reset/route.ts:23).
  ```

- Problem: Each item is a small indirection with exactly one consumer or one value; together they are the kind of code a reader must open to learn it does nothing.
- Impact: Minor cognitive load; a dependency (`class-variance-authority`, package.json:94) kept alive by 3 tiny components that could be plain className strings.
- Fix: Narrow the fix to the confirmed items, all optional:
1. Inline the URL lookup into site.ts as `const raw = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'; export const siteUrl = raw.replace(/\/$/, '');`, or keep the https:// prefixing if local non-Docker builds with a scheme-less URL should still work. Then delete config.ts, and port tests/unit/config.test.ts to target `siteUrl` from '@/lib/site' with vi.resetModules and a dynamic import. Do not simply delete the test: it guards against VERCEL_URL being used as the origin.
2. Inline the two MAP_CSS_CLASSES strings into MapLoadingSkeleton.tsx.
3. Optionally replace Button's single-variant cva with a class constant and remove the `variant` prop from its 5 call sites.

Leave the rest alone:
- Surface, Badge and TopControls: their cva variants are real, and they keep the class-variance-authority dependency.
- claim-grants and access-reset: they need `admin.session_id`, which isAdminRequest does not provide.
- stayRequestPhone.ts: it documents a domain rule and is tested.

If you change coverage scope, vitest.config.ts:L59-L60 lists site.ts and stayRequestPhone.ts.
- Fix risk: vitest.config.ts coverage include lists `src/lib/site.ts` and `src/lib/stayRequestPhone.ts` — update the list and re-check thresholds; `check:dead-code` will flag the removed dependency if any import remains.
- Verification:
  - refute: CONFIRMED — This bundled finding is only partly correct. The core item at the cited location holds, and so do two of the side items. Three other parts are wrong or overstated, so the proposed fix needs narrowing.  CONFIRMED: (a) config.ts is a one-method object. site.ts is its only production importer, and tests/unit/config.test.ts is its only test importer; the finder missed the test. The `startsWith('http')` branch cannot be reached on the production path: the Docker builder rejects any build arg that is not https://, and the production runtime schema requires a URL using HTTPS. The finder's reason ("validated with z.string().url()") is incomplete. instrumentation.ts skips validation during `next build`, so a plain local `npm run build` with a URL that has no scheme would still take the branch, and config.test.ts:10-15 exercises it on purpose. It is dead in production, not dead everywhere. (b) MAP_CSS_CLASSES has a single consumer, and HEIGHT.COMPACT and HEIGHT.BOOKING are both '260px'. (c) Button's cva has a single `primary` variant, and all 5 call sites pass that same value explicitly.  REFUTED: (d) Surface is not a one-value cva. Only `variant` has one value; padding, radius, shadow and border each have 2-4 values, and the 6 call sites pass different combinations. Badge has 4 variants and is used with dynamic values. TopControls.tsx also imports cva, with two intents. So the dependency is not "kept alive by 3 tiny components", and dropping class-variance-authority would mean rewriting 4 files. That is not a minimal change. (e) The "two admin-auth idioms" are not interchangeable. claim-grants and access-reset need `admin.session_id` to pass as `adminSessionId`, but `isAdminRequest` returns only a boolean. The proposed fix would break both routes. Minor count error: isAdminRequest is used in 9 route files, not 12. (f) stayRequestPhone.ts carries a documented rule (unprefixed local numbers are treated as Greek) and has its own unit test. Inlining it gains almost nothing.  Not a duplicate. First-review R-102 declined only a nit about config.test.ts itself (its VERCEL_URL stub), not config.ts or these abstractions. The owner declined several comparable duplication nits in R-102, so Nit is the right severity.
  - reproduce: CONFIRMED — The core observation holds. Each of these is an indirection with one consumer or one value: config.ts, MAP_CSS_CLASSES, stayRequestPhone.ts, and the one-value cva variant in Button. But several supporting claims are wrong or overstated, and the fix needs correcting. (1) 'Dead branch' is REFUTED. NEXT_PUBLIC_SITE_URL is `z.string().url().optional()` at runtime-env-schema.js:L55, not L54. That schema onl…

### R-292: Nits from the remediation: ambiguous PATCH body union, leftover alias and stale comment
- Severity: Nit
- Category: Maintainability
- Status: CONFIRMED
- Location: src/app/api/admin/check-in-requests/[id]/route.ts:L17-L21; src/components/ApartmentGalleryLightbox.tsx:L88 (uses L264-L372); src/components/ApartmentCinematic.tsx:L16
- Evidence:

  ```text
  src/app/api/admin/check-in-requests/[id]/route.ts:L17-L21
    const updateSchema = z.object({
      status: z.enum(['approved', 'rejected']),
    });
    const retrySchema = z.object({ action: z.literal('retry_delivery') }).strict();
    const bodySchema = z.union([retrySchema, updateSchema]);
    → a body `{ action: 'retry_delivery', status: 'approved' }` fails the strict retrySchema and is accepted by the non-strict updateSchema (Zod strips `action`), so it silently approves.

  src/components/ApartmentGalleryLightbox.tsx:L88  `const resolvedLabels = labels;` (S6e removed the fallbacks but kept the alias; used at L264, L270…)

  src/components/ApartmentCinematic.tsx:L16  `// hero scroll hint and skip intro labels were removed from the UI; keep properties available in \`ht\` for completeness` — `ht` is now the typed `HouseDictionary`, no such properties exist.
  ```

- Problem: Τρία μικρά υπολείμματα: (1) το `updateSchema` δεν είναι `.strict()`, οπότε ένα διφορούμενο body επιλέγει σιωπηλά την απόφαση αντί για 422; (2) περιττό alias `resolvedLabels`; (3) σχόλιο που περιγράφει τύπο που δεν υπάρχει πλέον.
- Impact: Μόνο ο admin client στέλνει bodies, οπότε πρακτική επίδραση μηδενική; είναι θέμα σαφήνειας του API και του κώδικα.
- Fix: (1) route.ts:L17-L19: add `.strict()` to `updateSchema`, i.e. `z.object({ status: z.enum(['approved', 'rejected']) }).strict()`. Optionally add a route test in tests/routes/admin-dead-outbox-actions.test.ts: `{ action: 'retry_delivery', status: 'approved' }` returns 422 and `updateStatus` is not called. (2) ApartmentGalleryLightbox.tsx: delete L88 and replace the 7 `resolvedLabels.` uses with `labels.`. (3) ApartmentCinematic.tsx: delete the L16 comment. Gates: that route test file, tests/components/apartment-copy.test.tsx, tests/components/admin-requests-retry.test.tsx, typecheck, lint --max-warnings=0.
- Fix risk: Μηδενικός; `tests/routes/admin-dead-outbox-actions.test.ts` και `tests/components/apartment-copy.test.tsx` πρέπει να παραμείνουν πράσινα.
- Verification:
  - refute: CONFIRMED — I checked all three parts and each holds. (1) The route parses the body with `z.union([retrySchema, updateSchema])`. `retrySchema` is `.strict()` but `updateSchema` is not. In zod 4.4.3 an object schema strips unknown keys by default, so the union falls through to `updateSchema` and returns `{status:'approved'}` for an ambiguous body. Nothing downstream rejects it. `validateRequestBody` just calls `sch…
  - reproduce: CONFIRMED — All three sub-points check out. (1) updateSchema is a plain z.object, and zod v4 strips unknown keys by default. The union tries the strict retrySchema first, which rejects the ambiguous body because of the extra 'status' key, then falls through to updateSchema, which accepts it and drops 'action'. The body is then treated as an approve decision, not rejected. Adding .strict() to updateSchema makes the…

### R-293: Workers emit a second `disconnect_failed` stderr event after the `failed` event whenever `DATABASE_URL` is missing
- Severity: Nit
- Category: Error handling
- Status: CONFIRMED
- Location: scripts/drain-outbox.ts:L11-L17; scripts/run-operational-maintenance.ts:L14-L20; tests/unit/build-workers.test.ts:L35-L36
- Evidence:

  ```text
  scripts/drain-outbox.ts:L12-L18:
  async function disconnect() {
    try {
      await prisma.$disconnect();
    } catch (error) {
      process.stderr.write(`${JSON.stringify({ worker: 'outbox', status: 'disconnect_failed', error: ... })}\n`);
    }
  }
  src/lib/prisma.ts:L130-L135 (the `prisma` Proxy `get` calls getActivePrismaClient()) and L118-L126: if (!client ...) { ... throw new Error(`Prisma client is not initialized. ${hint}`); }
  Same pattern in scripts/run-operational-maintenance.ts:L14-L20. tests/unit/build-workers.test.ts:L35-L36 tolerates it via `toContainEqual`.
  ```

- Problem: Accessing `prisma.$disconnect` on the lazy proxy throws when no client exists, so a run that already failed with "DATABASE_URL ... missing" logs a second, misleading `disconnect_failed` event with the same hint text.
- Impact: Cron/journald shows two error lines per misconfigured run; an operator may chase a disconnect problem that does not exist. No functional effect (exit code stays 1).
- Fix: In both workers, at the top of disconnect(), add `if (!process.env.DATABASE_URL) return; // no client was created (src/lib/prisma.ts only builds one when DATABASE_URL is set)`. This mirrors the init condition in src/lib/prisma.ts:L110 and avoids matching on the error message. Optionally, tighten tests/unit/build-workers.test.ts:L36 from `toContainEqual` to `toEqual([{ worker, status: 'failed', error: expect.stringContaining('DATABASE_URL') }])` so the single-event contract is locked. worker-disconnect.test.ts is unaffected only if DATABASE_URL is set in the test env. Check tests/setup.ts: if it is unset there, the four tests that wait for mocks.disconnect would time out, and the guard would need to be tested with vi.stubEnv('DATABASE_URL', ...). Leaving the code as is would also be defensible, because the duplicate line carries the same hint.
- Fix risk: None; tests/unit/worker-disconnect.test.ts mocks `@/lib/prisma` and is unaffected.
- Verification:
  - refute: CONFIRMED — I traced the path deterministically by reading the code. When DATABASE_URL is unset at import time, src/lib/prisma.ts leaves globalThis.__prisma__ undefined (it does not throw). drainOutbox then touches prisma.outboxEvent. The Proxy `get` calls getActivePrismaClient(), which throws 'Prisma client is not initialized. <hint>', and main() rejects, so the `failed` event is written. After that, `.finally(di…  The practical scenario is more likely in development than in production. `npm run outbox:drain` and `npm run operations:check` are plain `tsx` (package.json:L57-L58) and do not load .env.local, so running them from a shell with no exported DATABASE_URL produces both lines. In production the workers use the same APP_ENV_FILE as the runner, which already fails closed when the file is misconfigured, so the case is rare there.  On calibration: the second line carries the same 'Prisma client is not initialized. Set DATABASE_URL …' hint, so it is redundant more than misleading. The exit code stays 1 and nothing else is affected, so Nit is correct.  One detail in the finding is loose. The error text is 'Prisma client is not initialized. …', not 'DATABASE_URL env var missing'. That message comes from assertDatabaseUrl, which is unreachable here because createPrismaClient is only called when DATABASE_URL is set.  On the fix: of the two options offered, message matching is fragile, and the env guard is the minimal option.
  - reproduce: CONFIRMED — Traced every path with DATABASE_URL unset. src/lib/prisma.ts leaves __prisma__ undefined (L108-L115), and the exported Proxy's get trap calls getActivePrismaClient() on every property access (L130-L133). That call throws 'Prisma client is not initialized. <hint>' (L118-L126). main() -> drainOutbox() first touches prisma.outboxEvent (bookingOutbox.ts:L165), so the throw rejects main and the catch writes…

### R-294: seedRevokedSessionEligibilityFixture is a pure alias of seedAuthEligibilityFixtures
- Severity: Nit
- Category: Redundant
- Status: CONFIRMED
- Location: tests/integration/auth/support/auth-fixtures.ts:L144-L149
- Evidence:

  ```text
  export async function seedRevokedSessionEligibilityFixture(
    target: DisposableDatabaseTarget,
    now: Date,
  ): Promise<void> {
    await seedAuthEligibilityFixtures(target, now);
  }
  `git grep -n seedRevokedSessionEligibilityFixture` -> auth-fixtures.ts:144 and 15 call sites, all in refresh-revoked-session-regression.test.ts; logout-characterization.test.ts calls seedAuthEligibilityFixtures directly.
  ```

- Problem: Two names for one operation in a support module. The two suites that share it use different names for the same seed.
- Impact: Minor reading cost only.
- Fix: Recommended: leave as is (optional cleanup, no behavioural benefit). If the owner wants it: replace the 15 calls with `seedAuthEligibilityFixtures(authTarget, …)`, remove the import at L24, and delete auth-fixtures.ts L144-L149. Gates: `npm run typecheck`, `npm run check:dead-code`, `npm run test:integration`.
- Fix risk: Mechanical rename in one test file. Check with typecheck and the integration suite.
- Verification:
  - refute: CONFIRMED — Factually correct. The wrapper forwards (target, now) to seedAuthEligibilityFixtures without options and adds no behaviour. Its 15 call sites are all in refresh-revoked-session-regression.test.ts, and the same file also calls seedAuthEligibilityFixtures directly with options (L1033, L1081, L1271), so it already uses both names. The only cost is reading, and the wrapper's name does state the suite's int…
  - reproduce: CONFIRMED — The wrapper just forwards (target, now) to seedAuthEligibilityFixtures and drops the options parameter. It has exactly 15 call sites, all in refresh-revoked-session-regression.test.ts. The finding misses one point: that same file also calls seedAuthEligibilityFixtures directly at L1033, L1081 and L1271 (with options). So the inconsistency sits inside one file, not only between two suites. The alias is…

### R-295: Barrier 'observed' assertions restate the wait helpers' own filters and can never fail
- Severity: Nit
- Category: Tests
- Status: CONFIRMED
- Location: tests/integration/auth/refresh-overlap-classification.test.ts:L829-L880, L1029-L1030 (with expectations at L1346-L1347, L1384-L1385, L1421-L1422, L1456-L1457, L1473-L1474, L1537-L1538, L1631-L1632); related: tests/integration/auth/claim-concurrency-characterization.test.ts:L357-L361 and L615; tests/integration/auth/refresh-revocation-race.test.ts:L322-L323; tests/integration/auth/refresh-revoked-session-regression.test.ts:L406-L408 and L860/L867
- Evidence:

  ```text
  overlap L461-L467 (waitForUserLockOwner filter): row.waitEventType === 'Lock' && (row.blockingPids.includes(blockerPid) || ...) && row.advisoryGranted
  overlap L878-L879: ownerLockObserved: ownerLock.advisoryGranted && ownerLock.blockingPids.includes(blockerPid),
  overlap L842-L843: contenderWaitObserved = contenderLock.blockingPids.includes(blockerPid) || contenderLock.blockingPids.includes(ownerLock.pid);   // identical to the waiter filter L498-L500
  overlap L1029: primaryMarkerObserved: primaryLock.advisoryGranted,
  claim-concurrency L357-L360: if (blockerAnchorsWaitGraph && applicationNames.every((name) => blockedApplications.has(name))) { return blockedApplications.size; }   -> L615 expect(result.barrierWaiters).toBe(2)
  refresh-revocation-race L322-L323: expect(firstWait.blockingPids).toContain(blockerPid); (the waiter filter L188 already requires it)
  refresh-revoked-session L398-L400 throws if markerLocksObserved < 1 -> L860 markerObserved: overlap.markerLocksObserved > 0
  ```

- Problem: Each of these values is true by construction whenever the helper returns, and the helper throws on timeout. The real enforcement is the helper's deadline, not the assertion. The `true` fields in the expected objects look like independent evidence of lock ordering, but they are not.
- Impact: No false pass today, because the helpers throw. A future edit that loosens a helper filter, for example dropping the advisoryGranted condition, would silently remove the evidence while the `...Observed: true` expectations keep passing.
- Fix: Recommended: drop the tautological fields and their `toEqual` literals: `ownerLockObserved`, `contenderWaitObserved`, `primaryMarkerObserved`, `secondaryMarkerObserved`, `barrierWaiters` in the L615 check, `markerObserved`, and the L322-L323 `toContain` checks. Alternatively, keep them with a one-line comment that the wait helper's filter and deadline enforce them.

Do not re-read pg_locks as a replacement. It only repeats the helper's own condition, and the file already has a helper for that (`advisoryLockIsHeld`, L517-L528).

If you keep a field, keep only `contenderWaitObserved`: its false value in the same-context case documents which branch ran. Test-only change; afterwards run `npm run test:integration` (local Docker) to confirm the edited literals still match.
- Fix risk: Test-only. Removing the fields changes several toEqual literals in the same files.
- Verification:
  - refute: CONFIRMED — I tried to refute this and could not. Each cited value is fixed by the filter of the helper that produced it, and each helper throws when its deadline passes. So the `...Observed: true` expectations can never fail on their own.  (1) `ownerLockObserved`: all three `waitForUserLockOwner` calls that feed it (L809, L952, L1209) pass no `excludedPid`. The filter then requires both `blockingPids.includes(blockerPid)` and `advisoryGranted`, which is the same expression as L878-L879.  (2) `contenderWaitObserved`: L842-L843 repeats the contender filter at L498-L500. It is false only in the same-context branch, and that branch is chosen by the test's own `kind` input.  (3) `primaryMarkerObserved` and `secondaryMarkerObserved` (L1029-L1030) read `advisoryGranted`, which the owner filter at L466 already requires, including the `excludedPid` call at L965-L969.  (4) In claim-concurrency, `blockedApplications` is a subset of `applicationNames` and the return requires every name to be present. The function therefore returns `applicationNames.length`, which is 2, so the L615 `toBe(2)` check cannot fail.  (5) In refresh-revocation-race, L322 is guaranteed by the filter at L180 with `blockedByPid = blockerPid`. The finder did not mention L323, but it is tautological for the same reason (`blockedByPid = firstWait.pid`).  (6) In refresh-revoked-session, L406-L408 throws when `markerLocksObserved < 1`, so `markerObserved: true` at L860/L867 is redundant. The count itself comes from an independent query, `advisoryLocksHeld`, so that check is real; only the expect is redundant.  The review records contain no duplicate: grepping REVIEW.md and PROGRESS.md for these files and terms found only unrelated entries.  There is no production impact, the lock ordering is still enforced by the helper deadlines, and the only risk is misleading test evidence after a future filter edit, so Nit is correct.  On the fix: re-reading pg_locks for the returned pid would only repeat the same condition a moment later, and the file already has a helper for that (`advisoryLockIsHeld`, L517-L528). The smallest honest change is to drop the tautological fields and their `toEqual` literals, or keep them with a comment that the helper enforces them.
  - reproduce: CONFIRMED — I traced every cited field back to the helper that produces it. In each case the returned object can only exist if the predicate being 'asserted' already held, because each helper throws when it hits its deadline. So the `...Observed: true` expectations cannot fail on their own. The real enforcement is the helper's filter plus its timeout, as the finding says. (1) ownerLockObserved (overlap L878-L879)…

### R-296: Test-only options in the `guestStore` refresh facade (`family_id`, `ttlDays`)
- Severity: Nit
- Category: Unused
- Status: CONFIRMED
- Location: src/lib/guestDataStore.ts:L51,L59 (family_id); the ttlDays default at L48 (and L94 in rotateRefreshToken) is a separate unused-default nit, not a test seam
- Evidence:

  ```text
  guestDataStore.ts:L48-L51,L59
  ```
  ttlDays = 7,
  opts: { session_id: string; family_id?: string; ...
  const family_id = opts?.family_id || crypto.randomUUID();
  ```
  `grep -rn "family_id" src tests` -> production: only portalAuthHttp.ts:L55-L59 which passes no `family_id`; `family_id:` is passed only by tests/integration/auth/refresh-revoked-session-regression.test.ts:L221 and logout-characterization.test.ts:L257. Both production callers pass `7` for `ttlDays` (portalAuthHttp.ts:L55, refresh/route.ts:L67).
  ```

- Problem: `family_id` exists only so integration tests can pick the family id; production always generates it. It is the same kind of seam as O9 (`refreshTokenRepository.verify`, `guestStore.verifyRefreshToken` used only by integration tests).
- Impact: None at runtime; a documented rule (no test-only helpers) is bent in an auth-critical facade.
- Fix: Add family_id to the O9 decision. By default, keep it as a documented test seam, matching the C1 outcome for verify/createRefreshTokenRepository, and add a one-line comment at L51. If the owner prefers removal, drop `family_id` from the opts type and always use crypto.randomUUID(). Then change the two issueBoundAuthorizationChain helpers (refresh-revoked-session-regression.test.ts:L207-L231, logout-characterization.test.ts:L243-L266) to return issued.rec.family_id, and pass that value to expireRefreshFamilyForFixture at L1204-L1207. Leave the ttlDays parameter as it is. Optionally drop the unreachable `= 7` defaults, but only as a separate nit, and only with the owner's approval.
- Fix risk: Integration auth suites must be updated if removed.
- Verification:
  - refute: CONFIRMED — `family_id` is confirmed as a test-only option. The only production caller of issueRefreshToken is portalAuthHttp.ts:L56-L60, and it passes no family_id. The only callers that do pass it are two integration helpers. They need it because they later act on the caller-chosen family id: refresh-revoked-session-regression.test.ts:L1204-L1207 passes REVOKED_SESSION_FIXTURE.familyId to expireRefreshFamilyForF…
  - reproduce: CONFIRMED — `family_id` confirmed: the only production caller, portalAuthHttp.ts:L56-L60, never passes it. Grep shows it is passed only by two integration tests. So it is a test-only seam in an auth facade, which bends the CLAUDE.md rule against exported test-only helpers. Correction on `ttlDays`: it is not test-only. Production passes it (always 7, the same as the default), so at most it is redundant configurabil…

### R-297: Nits in guestDataExport date logic
- Severity: Nit
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/guestDataExport.ts:L121-L122 and L147-L151
- Evidence:

  ```text
  L121-L122
  ```
  return bookingStart === startDate || bookingEnd === startDate ||
         (bookingStart <= startDate && bookingEnd >= startDate);
  ```
  L147-L151 `bookings.forEach((booking) => { ... const now = new Date().toISOString().split('T')[0];`
  ```

- Problem: The two equality checks are implied by the range check (string comparison of YYYY-MM-DD), and `now` is recomputed per booking inside the loop (it can even differ across iterations at midnight).
- Impact: None functionally; minor readability.
- Fix: L121-L122: `return bookingStart <= startDate && bookingEnd >= startDate;`. This is equivalent only under the bookingStart <= bookingEnd invariant, which the admin create route enforces but no DB CHECK on bookings does. Move `const now = new Date().toISOString().slice(0, 10);` above `bookings.forEach` (L147). Run tests/unit/guest-data-export.test.ts afterwards.
- Fix risk: None; guest-data-export tests cover search and stats.
- Verification:
  - refute: CONFIRMED — Both claims are accurate. (1) calendarDate() returns YYYY-MM-DD strings (L33), and for strings `a === s` implies both `a <= s` and `a >= s`. So `bookingStart === startDate` is covered by the range term whenever bookingEnd >= bookingStart, and `bookingEnd === startDate` is covered whenever bookingStart <= bookingEnd. The condition is therefore redundant only while bookingStart <= bookingEnd holds. The o…
  - reproduce: CONFIRMED — Both parts hold. calendarDate returns a fixed-width 'YYYY-MM-DD' string, so lexicographic comparison matches chronological order. For any row where bookingEnd >= bookingStart, `bookingStart === startDate` and `bookingEnd === startDate` each already imply `bookingStart <= startDate && bookingEnd >= startDate`, so the two equality checks change nothing. One caveat: the two forms are only equivalent under…

### R-298: Copy nits in the portal, check-in and booking dictionaries
- Severity: Nit
- Category: Maintainability
- Status: CONFIRMED
- Location: src/i18n/domains/portal.ts:L65,L91,L94,L101; src/i18n/domains/booking.ts:L107,L209-L210; src/components/CheckInInfo.tsx:L603-L605
- Evidence:

  ```text
  portal.ts:L91 claimTokenLabel el "Κωδικός ενεργοποίησης κράτησης"; L101 modeHintSignup el "Χρησιμοποιήστε τον κωδικό διεκδίκησης ... Αν έχετε ήδη λογαριασμό, βάλτε τον κωδικό του" (one sentence uses "κωδικό" for both token and password; L98 password is "Κωδικός Πρόσβασης"; Wi-Fi password checkin.ts:L199 is also "Κωδικός").
  portal.ts:L65/L94 originAbroad "World" / "Κόσμος" as the answer to "Where are you traveling from?".
  booking.ts:L209-L210 el "Μεσημέρι (12:00-18:00)", "Απόγευμα (18:00-21:00)" vs en L121-L122 "Afternoon (12:00-18:00)", "Evening (18:00-21:00)".
  booking.ts:L107 "Show less amenities".
  CheckInInfo.tsx:L602-L606 "Available from" is formatted in the browser's time zone with no zone shown, while check-in and check-out (15:00/11:00) are property-local.
  ```

- Problem: Inconsistent claim-token terminology in Greek (token vs password ambiguity), "World" instead of "Abroad", a Greek time-of-day label that shifts meaning ("Απόγευμα" = afternoon for 18–21), "less" for countables, and a Wi-Fi time shown without a zone next to property-local times.
- Impact: Confusion only. The token/password ambiguity on the Greek sign-up form is the one most likely to cause a failed claim.
- Fix: Greek copy (portal.ts L101): use the token label's term and name the password explicitly: "Χρησιμοποιήστε τον κωδικό ενεργοποίησης κράτησης από τον οικοδεσπότη ... Αν έχετε ήδη λογαριασμό, βάλτε τον κωδικό πρόσβασής σας ή ζητήστε ...".

originAbroad: "Abroad" / "Εξωτερικό".

Greek arrival labels: "Μεσημέρι–απόγευμα (12:00-18:00)" / "Βράδυ (18:00-21:00)".

showLessAmenities: "Show fewer amenities".

Wi-Fi time (CheckInInfo.tsx L605): do NOT add timeZoneName next to dateStyle/timeStyle, because that throws a RangeError/TypeError during render. Use explicit components instead: `{ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }`. Alternatively use `timeStyle: 'long'`, which adds the zone but also seconds. Run tests/components/checkin-wifi.test.tsx after the change.
- Fix risk: Text only. Update any snapshot or copy assertions; the parity test is unaffected.
- Verification:
  - refute: CONFIRMED — I checked every copy item against the source and it matches the finding. None of them is already in REVIEW.md: the Nits group R-158 at L745-L752 does not list them. R-118 and R-124 are about behaviour, not wording. No test asserts any of these strings, so changing the copy breaks nothing.  (1) The Greek sign-up form shows the token field as "Κωδικός ενεργοποίησης κράτησης" and the password field as "Κωδικός Πρόσβασης". The hint above them calls the token "κωδικό διεκδίκησης", which is a second term that matches neither label. In the same sentence, "τον κωδικό του" means the password but could be read as the token. All of this shows only in signup mode (UnifiedGuestClient.tsx L161-L163, L198-L217, L256).  (2) "World" / "Κόσμος" is the answer option to "Where are you traveling from?"; "Abroad" / "Εξωτερικό" reads better.  (3) The Greek arrival labels do not line up with the English ones: 18:00-21:00 is "Evening" in English but "Απόγευμα" in Greek. The hour ranges in brackets remove any real ambiguity.  (4) "Show less amenities" should be "Show fewer amenities".  (5) The Wi-Fi reveal time is property-local check-in minus 24 h (propertyTime.ts L59-L61, zone from PROPERTY_TIME_ZONE or Europe/Athens). The client formats it in the browser's zone and shows no zone. Check-in and check-out are shown as bare property-local strings. So a guest in the UK sees "13:00" next to "Check-in 15:00". PROGRESS.md L157 says B8 chose the guest's zone on purpose. The problem is only that no zone label is shown.  Severity: Nit is right. It is text only, and a failed claim can be retried.  The proposed fix has a real defect and must not be applied as written. Adding `timeZoneName: 'short'` to an Intl.DateTimeFormat that already uses `dateStyle`/`timeStyle` throws a TypeError. Node 22.19 prints "Invalid option : option", and ECMA-402 forbids mixing style options with explicit component options, so browsers throw too. The formatter runs during render in CheckInInfo, so the check-in page would crash for every guest who opens it before the Wi-Fi window. The existing tests cover exactly this path: checkin-wifi.test.tsx L26-L35 would fail, which would catch it only if they are run.  The Greek label "Απόγευμα (12:00-18:00)" is also debatable, because 12:00-15:00 is "μεσημέρι" in Greek.
  - reproduce: CONFIRMED — I re-read every cited line and the line numbers are exact. (1) In Greek, one sentence (portal.ts:L101) uses "κωδικό" twice with different meanings: "κωδικό διεκδίκησης" is the claim token and "κωδικό του" is the account password. The field labels also differ: the token field is "Κωδικός ενεργοποίησης κράτησης" (L91) and the password field is "Κωδικός Πρόσβασης" (L98), so the hint does not match either…

### R-299: Small leftovers: orphan section comments, duplicated coarse-pointer !important block, legacy/unneeded declarations
- Severity: Nit
- Category: Legacy
- Status: CONFIRMED
- Location: src/styles/02-layout.css:L70-L76, L573; src/styles/05-primitives.css:L248-L249; src/styles/06-semantic-surfaces.css:L179; src/styles/07-search-listing.css:L338-L341; src/styles/11-contact.css:L320; src/styles/12-apartment-checkin.css:L163
- Evidence:

  ```text
  02:L70-L76 `:where(.btn-primary, .btn-outline, .btn-tint, .btn-sm, .booking-button, .search-trigger) { min-height: 44px !important; }` and `height: auto !important`: for the four .btn-* classes this duplicates 05-primitives.css:L67-L75 (same declarations at higher specificity); only `.booking-button`/`.search-trigger` need it.
  Orphan comments whose rules moved to other files: 02:L573 `/* Homepage typography: … */` (end of file), 07:L338-L341 (`NOTE: top-controls-compact override removed…` + `/* React Day Picker Custom Styles */` at end of file), 11:L320 `/* Spec badges - applies to all pages */` (the rule is at 12:L1), 05:L248-L249.
  06:L179 `padding-bottom: constant(safe-area-inset-bottom);` (iOS 11.0 syntax, superseded by the env() line after it).
  12:L163 `.compact-datepicker { padding: 2rem 1rem 1rem !important; }`: the element's competing padding is Tailwind `p-3` (DateRangePicker.tsx:L281, layered), which an unlayered rule already beats.
  08:L396-L400 `@keyframes spin` duplicates Tailwind's identical `spin` keyframes.
  ```

- Problem: Dead or duplicated declarations and misplaced comments left over from the file split.
- Impact: Readability only.
- Fix: 02-layout.css: change L70 to `:where(.booking-button, .search-trigger) {` and delete the whole L74-L76 rule (dropping its four names leaves an empty selector list). Delete the orphan comments at 02:L573, 07:L338-L341, 05:L248-L249, and move 11:L320 to the top of 12-apartment-checkin.css (or delete it). Delete 06:L179 (`constant()`). Remove `!important` from 12:L163. Leave 08-vendor.css `@keyframes spin` in place: if Tailwind prunes unused theme keyframes, deleting it would tie `.map-popup-travel .spinner` to unrelated `animate-spin` uses. Check the compact date picker at 375px and the coarse-pointer button heights. No other behaviour change is expected.
- Fix risk: None expected. Check the compact date picker padding on a 375px viewport.
- Verification:
  - refute: CONFIRMED — Every item checks out, and REVIEW.md/PROGRESS.md have no earlier finding on these lines (I grepped for coarse, constant(, compact-datepicker, keyframes spin, 02-layout, 44px, important and the orphan comment texts; R-090 is a different compact-datepicker selector). (1) The .btn-* duplicates are dead. Both blocks sit under the same `@media (hover: none), (pointer: coarse)`, and neither file is layered:…
  - reproduce: CONFIRMED — I re-read every cited line and all of the line numbers are correct. (1) 02:L70-L76 sits inside `@media (hover: none), (pointer: coarse)` (02:L56-L77), the same media condition as 05:L67-L75. Every stylesheet is imported unlayered from globals.css, and both rules set the same `!important` values. The 05 rule has class specificity and the 02 rule uses `:where()` (zero specificity), so the 02 declarations…

## Findings recorded during execution (R-300 and later)

Recorded in task R3-01 (2026-09-28) from the Review 3 notes that needed an ID and from the planning exploration. Each was re-checked in the code at HEAD `fff4283`; no code was changed.

Not recorded, with reason:
- Admin mutations without an explicit same-origin check (`admin/flags` POST, check-in PATCH): this repeats R-197 (verifiers: no change required). `admin/flags` POST already limits the body to 8 KiB through `readJsonBody` (`src/app/api/admin/flags/route.ts:L23`). The planned task R3-S2 is therefore proposed for removal.
- Outbound webhooks without a response-size cap: neither caller reads the response body (`bookingOutbox.ts:L98-L104`, `operationalMonitor.ts:L99-L117` only check `response.ok`), so there is nothing to cap. The redirect part is R-308.
- The Airbnb direct-booking CTA (SUSPECTED in the Review 3 legal notes): closed by the owner's decision O22 (no booking form, no booking call-to-action on in-stay pages).

### R-300: Dark-mode map requests keyless CARTO tiles; CARTO requires an API key since 23 September 2026
- Severity: Medium
- Category: Legacy
- Status: CONFIRMED
- Location: src/components/LeafletMap.tsx:L167-L171
- Evidence:

  ```text
  167    const lightUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  168    const darkUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  170    tileLayerRef.current = L.tileLayer(isDark ? darkUrl : lightUrl, {
  171      attribution: isDark ? '&copy; OpenStreetMap & CartoDB' : '&copy; OpenStreetMap contributors',
  ```

  CARTO (https://carto.com/basemaps/apikey/, read 2026-09-28): a key is added as `?key=…` to every tile URL under `basemaps.cartocdn.com`; a valid key removes the "API key required" watermark; free tiers are up to 5M requests/month non-commercial and 1M commercial; keys registered before 23 September 2026 keep working until 30 November 2026.
- Problem: The dark theme loads CARTO raster tiles without a key. Under CARTO's current terms these tiles carry an "API key required" watermark, and use without a key is outside the terms.
- Impact: Every map (moments map, `/book` neighbourhood map, check-in neighbourhood map) looks broken in dark mode. The watermark was not observed on screen in this task; it follows from CARTO's published behaviour.
- Fix: Proposed: drop CARTO and use the OpenStreetMap tiles in both themes, darkened in dark mode with a CSS filter on the tile pane. This removes a third-party recipient and needs no key. Alternative: a free CARTO key (owner registers; the key is public in the page) appended as `?key=`.
- Fix risk: The filtered OSM style differs from CARTO's dark style; check marker and popup contrast (G-VIS, dark). The attribution text changes with it.

### R-301: OpenStreetMap tiles use the `{s}` subdomains and the attribution has no copyright link
- Severity: Low
- Category: Legacy
- Status: CONFIRMED
- Location: src/components/LeafletMap.tsx:L167, L171
- Evidence: see R-300 lines 167 and 171. OSMF tile usage policy (https://operations.osmfoundation.org/policies/tiles/, read 2026-09-28): "Use exactly: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`"; "Other subdomains or hostnames may be slower or withdrawn without notice"; attribution must be shown clearly on the map, typically "© OpenStreetMap contributors", following the attribution guidelines (link to openstreetmap.org/copyright).
- Problem: The light tile URL uses the `a/b/c` subdomains that the policy no longer lists, and the attribution is plain text without the link to the copyright page.
- Impact: Tiles may slow down or stop when the subdomains are withdrawn; the attribution does not follow the OSM attribution guidelines.
- Fix: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` and attribution `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors`. Do it together with R-300 in one map task.
- Fix risk: None beyond a visual check of the attribution control.

### R-302: `User.countryOrigin` is stored permanently although it is only needed to normalise the phone at sign-up
- Severity: Low
- Category: Legal
- Status: CONFIRMED
- Location: src/lib/portalAuthService.ts:L191, L226, L236; src/app/admin/guests/page.tsx:L596; src/lib/guestDataExport.ts:L53; prisma/schema.prisma:L15, L26, L328-L331
- Evidence:

  ```text
  portalAuthService.ts:191  const normalized = normalizePhone(input.phone, input.origin);
  portalAuthService.ts:226  data: { passwordHash: newPasswordHash, countryOrigin: input.origin },
  portalAuthService.ts:236  countryOrigin: input.origin,
  admin/guests/page.tsx:596 <p className="text-sm text-body">🌍 {booking.user.countryOrigin}</p>
  guestDataExport.ts:53     countryOrigin: user.countryOrigin,
  schema.prisma:328         enum CountryOrigin { GR ABROAD }
  ```

  `grep -rn "countryOrigin\|CountryOrigin" src prisma/schema.prisma --exclude-dir=generated`: no other reader.
- Problem: The GR/abroad answer is needed once, to normalise a local Greek number to E.164. After that it is persisted, indexed, shown in the admin and exported, with no stated purpose.
- Impact: Data minimisation (GDPR art. 5(1)(c)): one more personal attribute kept for the life of the account without a use.
- Fix: Keep the sign-up question for phone normalisation, stop persisting it: drop the column, index and enum with a guarded migration, the admin line and the export field (task R3-L12).
- Fix risk: Admin UI and export shape change; `guest-data-export` and admin guests tests need updating. G-DB.

### R-303: Admin "Copy" of a new claim token has no error handling or feedback
- Severity: Low
- Category: Error handling
- Status: CONFIRMED
- Location: src/app/admin/guests/page.tsx:L502
- Evidence:

  ```text
  502  <button type="button" className="btn btn-primary" onClick={() => navigator.clipboard.writeText(claimGrant.token)}>Copy</button>
  ```
- Problem: The returned promise is neither awaited nor caught; there is no success or failure feedback. `writeText` rejects without clipboard permission or on an insecure origin, and `navigator.clipboard` is undefined on plain http.
- Impact: The host may believe the one-time token was copied when it was not, and the rejection surfaces as an unhandled promise rejection. The token is shown on screen, so the host can still copy it by hand.
- Fix: An async handler with try/catch, a "Copied" / "Copy failed, select the token" message, and a guard for a missing `navigator.clipboard`. Same pattern as REVIEW.md B24 (R-271).
- Fix risk: None; add a component test with a rejected `writeText`.

### R-304: The sensitive rate limiter keys IPv6 clients on the full address
- Severity: Low
- Category: Security
- Status: CONFIRMED
- Location: src/lib/sensitiveRateLimit.ts:L29-L37; src/lib/net/getClientIp.ts:L22-L40
- Evidence:

  ```text
  sensitiveRateLimit.ts:33  function buildKeys(ip: string, options: RateLimitOptions): string[] {
  sensitiveRateLimit.ts:34    const dimensions = [`ip:${ip}`];
  getClientIp.ts:36           const canonical = hostname.slice(1, -1).toLowerCase();
  getClientIp.ts:37           return mappedIpv4FromCanonicalIpv6(canonical) ?? canonical;
  ```
- Problem: An IPv6 client is limited per /128 address. A single subscriber normally controls a whole /64 (2^64 addresses) and can rotate addresses per request.
- Impact: The client-address dimension of the sign-in, claim and admin-login limits can be bypassed from one IPv6 connection. The identifier dimension (per phone/username) still applies, so a single account is not exposed to unlimited guessing; spreading guesses over many accounts is. Each rotated address also adds a `rate_limits` row until the window expires.
- Fix: Group IPv6 addresses by /64 for the limiter dimension only (keep the full address for nothing else), e.g. `ip6:<first four hextets>::/64`; unit tests for two addresses in one /64 sharing a key and an IPv4-mapped address staying IPv4.
- Fix risk: Users behind one /64 (a household) share the address budget; the limits are per 15-60 minutes and generous enough for that.

### R-305: The home page's "Check-In Info" card links to a 404 while check-in is disabled, the production default
- Severity: Medium
- Category: Bug
- Status: CONFIRMED
- Location: src/app/[locale]/page.tsx:L18-L31; src/lib/featureFlags.ts:L9-L15; src/app/[locale]/check-in/page.tsx:L23-L25
- Evidence:

  ```text
  page.tsx:23             href: `/${eff}/check-in`,
  featureFlags.ts:10      const PRODUCTION_DEFAULTS: FeatureFlags = { portalEnabled: false, checkinEnabled: false };
  check-in/page.tsx:24    const flags = await getFeatureFlagsAsync();
  check-in/page.tsx:25    if (!flags.checkinEnabled) return notFound();
  ```
- Problem: The card is rendered unconditionally, while the target returns `notFound()` unless the admin has enabled check-in.
- Impact: On a fresh production deployment one of the four home cards leads to a 404 until the owner flips the flags.
- Fix: Render the card only when the flags are on (read them in the page as the check-in page does), or point it to the in-stay hub. The home rebuild R3-V5 replaces this grid; the fix is part of that task.
- Fix risk: Low; a component or page test for both flag states.

### R-306: Four different site names are in use
- Severity: Low
- Category: Maintainability
- Status: CONFIRMED
- Location: src/app/layout.tsx:L9, L20; src/i18n/domains/common.ts:L170-L171, L351; public/app.webmanifest:L2-L3; src/data/apartmentData.ts:L9; src/i18n/domains/house.ts:L78; src/app/[locale]/about/page.tsx:L34, L98; src/app/[locale]/booking-details/page.tsx:L71
- Evidence: `grep -rn -o "Dolce Far Niente\|Villa Guest Guide\|Kalamata Apartment\|Guest Guide"`: "Villa Guest Guide" (root title), "Guest Guide" (appTitle, Apple title, manifest name), "Dolce Far Niente" (home H1, about, two page titles, Instagram and e-mail), "Kalamata Apartment" (short name, apartment footer).
- Problem: The browser tab, the installed app, page titles and the page headings name the site differently.
- Impact: A weaker brand in search results and shared links; guests see inconsistent names.
- Fix: One name from one constant (task R3-V3).
- Fix risk: Titles and metadata tests that match the old strings.

### R-307: The CSP allows Google Fonts origins that nothing uses
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/lib/security-config.ts:L88, L90, L149, L151; src/styles/01-tokens.css:L118-L121
- Evidence:

  ```text
  security-config.ts:88   styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  security-config.ts:90   fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
  01-tokens.css:118       /* Font stacks fall back to system fonts now that self-hosted files were removed */
  01-tokens.css:120       --font-sans-stack: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  ```

  `grep -rn "next/font\|fonts.googleapis\|@font-face" src`: only the two CSP lines.
- Problem: Both environments allow a third-party stylesheet and font origin that no code loads. "Inter" is named first in the stack but never loaded, so it renders only where a visitor has it installed.
- Impact: A wider CSP than needed; inconsistent text rendering across devices.
- Fix: Remove both origins when the self-hosted fonts land (R3-V2), with the CSP tests updated.
- Fix risk: None once fonts are served from `'self'`.

### R-308: Webhook and alert delivery follow redirects: a 301/302 turns the POST into a GET and the event is marked delivered without its payload
- Severity: Medium
- Category: Bug
- Status: CONFIRMED
- Location: src/lib/bookingOutbox.ts:L98-L104; src/lib/operationalMonitor.ts:L99-L117
- Evidence:

  ```text
  bookingOutbox.ts:98   const response = await fetch(config.url, {
  bookingOutbox.ts:99     method: 'POST',
  bookingOutbox.ts:102    signal: AbortSignal.timeout(5_000),
  bookingOutbox.ts:104  if (!response.ok) throw new Error(`Webhook responded with ${response.status}`);
  ```

  Local probe with Node 22.19.0 fetch against a local server whose `/hook` answers with a redirect to `/moved` (200):

  ```text
  302 response.ok= true status= 200 redirected= true [{"method":"POST","url":"/hook","bodyLen":16,...},{"method":"GET","url":"/moved","bodyLen":0,...}]
  301 response.ok= true status= 200 redirected= true [{"method":"POST",...},{"method":"GET","url":"/moved","bodyLen":0,...}]
  307 response.ok= true status= 200 redirected= true [{"method":"POST",...},{"method":"POST","url":"/moved","bodyLen":16,...}]
  ```
- Problem: `fetch` follows redirects by default. On 301/302 it re-issues the request as a GET without a body; a 200 on that GET makes `response.ok` true, so the outbox marks the event DELIVERED and the alert counts as sent. On 307/308 the payload with guest data is re-sent to wherever the receiver redirects.
- Impact: A receiver URL that redirects (http→https, a moved automation endpoint, a trailing-slash rule) silently loses every check-in notification and alert while the admin shows them as delivered.
- Fix: `redirect: 'error'` on both calls, so any redirect is a delivery failure that the outbox retries and eventually marks DEAD, with a test for each (task R3-S1).
- Fix risk: A receiver that relies on redirects stops receiving until its URL is corrected; the failure becomes visible in the admin instead of silent.

### R-309: The apartment page's "Contact Us" button opens the emergency phones page
- Severity: Low
- Category: Bug
- Status: CONFIRMED
- Location: src/components/ApartmentCinematic.tsx:L163-L168; src/i18n/domains/house.ts:L77, L135
- Evidence:

  ```text
  ApartmentCinematic.tsx:164  href={`/${locale}/phones`}
  ApartmentCinematic.tsx:167  {ctaSecondaryText}
  house.ts:77                 ctaSecondary: "Contact Us",
  house.ts:135                ctaSecondary: "Επικοινωνία",
  ```
- Problem: "Contact Us" leads to the list of police, fire brigade, hospital and taxi numbers, not to the host's contact details.
- Impact: A prospective guest who wants to reach the host lands on emergency numbers.
- Fix: Link to the contact section (`/${locale}#contact`) or the new contact block (task R3-V6).
- Fix risk: None.

### R-310: ErrorSummary and the iOS install tip keep light containers in dark mode (from R-275)
- Severity: Low
- Category: Bug
- Status: SUSPECTED
- Location: src/components/ErrorSummary.tsx:L35; src/app/[locale]/layout.tsx:L62
- Evidence: Review 3 verifier note on R-275: the containers `bg-red-50` and `bg-white/90` have no dark variant; suspected unreadable text in dark mode.
- Problem: Light backgrounds under dark-mode text colours.
- Impact: Possibly unreadable error summaries and install tip in dark mode.
- Fix: Covered by the design-system rebuild (dark values only through tokens); verify with a G-CONTRAST row in R3-V12 rather than patching CSS that will be deleted.
- Fix risk: None separately.
- To confirm (SUSPECTED only): screenshot and contrast measurement in dark mode during R3-V12.

### R-311: A `<p>` colour override in 12-apartment-checkin.css and duplicated dead rules (from R-279)
- Severity: Low
- Category: Redundant
- Status: SUSPECTED
- Location: src/styles/12-apartment-checkin.css:L220, L544-L552
- Evidence: Review 3 verifier note on R-279: the rule at L220 overrides the success/error colours of `<p>` elements; L544-L552 duplicate rules that never apply.
- Problem: A broad override plus dead duplicates in the check-in stylesheet.
- Impact: Wrong status colours in the check-in page; unused CSS.
- Fix: The file is removed by the design-system rebuild (R3-V12); confirm the status colours with a G-CONTRAST row there.
- Fix risk: None separately.
- To confirm (SUSPECTED only): computed styles of the check-in status messages during R3-V12.

### R-312: The service worker caches the force-dynamic availability page and serves it offline (fixed in R3-F10)
- Severity: Low
- Category: Bug
- Status: CONFIRMED
- Location: public/sw.js:L26-L32, L72-L88 (before R3-F10); src/app/[locale]/availability/page.tsx:L24
- Evidence:

  ```text
  sw.js:5-6            Visited public pages are kept for offline reading.
  sw.js:27             const PRIVATE_PAGE_PREFIXES = [   (admin, check-in, guest, portal; no availability)
  sw.js:76-77          if (isStorable(response) && !isPrivatePage(pathname)) { cache.put(request, response.clone())
  sw.js:81-82          const cached = isPrivatePage(pathname) ? undefined : await cache.match(request); if (cached) return cached;
  page.tsx:24          export const dynamic = 'force-dynamic';
  stayPolicy.ts:33     export const CALENDAR_PUBLIC_STALE_HOURS = 12;
  ```
  Recorded from the R3-F09 review; reproduced by the new service-worker test before the fix (`expected [ '/offline', '/en/offline', …(8) ] to not include '/en/availability'`).
- Problem: Every successful navigation to a non-private page is stored, and offline navigations are answered from that cache. `/{l}/availability` is rendered per request and hides booked nights once the calendar sync is older than 12 hours, but the worker keeps the rendered HTML and replays it offline with no age limit.
- Impact: A visitor who opened the availability page once and later opens it offline (or on a failing network) sees the old calendar and prices as if current, possibly nights that have since been booked.
- Fix: Make `/en/availability` and `/el/availability` network-only in `networkFirstPage`: never `cache.put`, never `cache.match`; offline falls through to the existing offline page. Literal path list, no pattern built at run time.
- Fix risk: Low. The offline fallback for other pages is unchanged; the unit test covers store, replay of an already cached entry, and the offline page.

### R-313: An empty `SECURITY_PEPPER=` line followed by other lines still counts as present, because `\s*` after `=` matches the newline (R-256 only partly fixed by R3-B47)
- Severity: Low
- Category: Logic
- Status: CONFIRMED
- Location: scripts/ensure-pepper.js:L37 (same `\s*=\s*\S` shape at L42, L27, L51); scripts/check-pepper.js:L22-L23; tests/unit/ensure-pepper.test.ts:L62-L69
- Evidence:

  ```text
  scripts/ensure-pepper.js:L37: if (!/^\s*SECURITY_PEPPER\s*=\s*\S/m.test(existing)) {
  scripts/check-pepper.js:L22:  SECURITY_PEPPER: /^\s*SECURITY_PEPPER\s*=\s*\S/m,
  tests/unit/ensure-pepper.test.ts:L63: fs.writeFileSync('.runtime/ensure-pepper-test/.env.local', 'SECURITY_PEPPER=\n');

  $ node -e '...' (current regex vs /^[^\S\n]*SECURITY_PEPPER[^\S\n]*=[^\S\n]*\S/m)
  "SECURITY_PEPPER=\nFOO=bar\n" true false
  "SECURITY_PEPPER=\n"          false false
  "SECURITY_PEPPER=abc\n"       true true
  ```
  Recorded from the R3-B47 review: running `ensure-pepper.js` on `.env.local` = `SECURITY_PEPPER=\nFOO=bar\n` generated the other secrets but not SECURITY_PEPPER.
- Problem: With the `m` flag, `\s*` after `=` also matches `\n`, so `\S` matches the first character of the next line. An empty SECURITY_PEPPER line is only detected when it is the last line of the file, which is the one shape the R3-B47 regression test writes. check-pepper.js has the same pattern, so `predev` does not flag it either.
- Impact: The R-256 scenario remains for a realistic `.env.local` (lines after SECURITY_PEPPER): `ensure-pepper` does nothing for the pepper, `maybe_ensure_pepper` (length >= 16) loops once, and startup fails in the Zod min(16) check. Dev-only tooling.
- Fix: Replace the `\s*` around `=` (and after `^`) with `[^\S\n]*` in the SECURITY_PEPPER regex of ensure-pepper.js and in both check-pepper.js regexes (and, for consistency, the other `\S`-terminated keys in ensure-pepper.js). Regression test: write `SECURITY_PEPPER=\nFOO=bar\n` and assert a 64-hex SECURITY_PEPPER is appended; add the same case for check-pepper.js if it has a test.
- Fix risk: Low. `[^\S\n]*` still allows spaces/tabs around `=`; CRLF files keep working because `\r` is not `\n` but then `\S` must not match `\r` (it does not; `\r` is whitespace). Re-run tests/unit/ensure-pepper.test.ts.

## Legal requirements for the site (Greece / EU)

Scope: a private individual with one short-term-rental apartment in Kalamata, no ΕΣΛ (tourist-accommodation licence), and no VAT registration. That scope is the researchers' assumption and has not been confirmed with the owner. Two independent researchers ran on 2026-09-27 and two verifiers on 2026-09-28. **Neither researcher failed.** Both returned complete outputs. Both researchers and both verifiers, however, could not reach several primary sources (aade.gr HTTP 403, e-nomothesia.gr ECONNREFUSED, EUR-Lex empty responses, unreadable PDFs). Most citations are therefore secondary reproductions of the official texts. Nothing below is legal advice. Wording to be published should be reviewed by the owner's accountant or lawyer.

Verification column key: CONFIRMED / PARTLY (corrected) / UNVERIFIABLE, taken from the verifiers' verdicts.

| # | Topic | Applies | Legal basis (as corrected) | What the site does now | Gap | Recommended change | Confidence / verification |
|---|---|---|---|---|---|---|---|
| 1 | Property registration number (ΑΜΑ, or ΕΣΛ/ΜΗΤΕ number if licensed) on the owner's own site | Likely. Clear if the property is also listed on Airbnb; for an off-platform-only property the wording is less clear | Art. 111 **par. 2(b)** L. 4446/2016: *«…υποχρεωτικά να συνοδεύει την ανάρτηση του ακινήτου, σε εμφανές σημείο, στις ψηφιακές πλατφόρμες, καθώς και σε κάθε μέσο προβολής»*. Fine under par. 5: 50% of gross income **of the tax year of the violation**, minimum €5,000. AADE FAQ 23.09.2025 q.15b | No registration number anywhere (grep over src/i18n, src/data, src/components: 0 hits). The apartment is promoted on /, /apartment, /book, /booking-details and ContactSection, and the linked Instagram | Number missing from every "μέσο προβολής", including the Instagram profile (offline) | Task L1 | Medium. **PARTLY** (both verifiers corrected the paragraph and the fine) |
| 2 | Provider identity ("imprint"): P.D. 131/2003 art. 4 | Likely (broad definition "κάθε φυσικό ή νομικό πρόσωπο"; not confirmed for a non-professional) | P.D. 131/2003 art. 4(1): name, geographic address, e-mail, public register and number if any, VAT number only if subject to VAT. Art. 4(2): prices with tax indication, only if prices are shown. Art. 5: commercial communications must identify on whose behalf | E-mail, phone and property address shown (ContactSection, contact.ts). Trade name "Dolce Far Niente". No natural-person name. No prices | Host's legal name missing. Whether ΑΜΑ counts as a "similar public register" under 4(1)(δ) is uncertain; it is required anyway by row 1 | Task L1 (legal name next to the registration number). No ΑΦΜ/ΔΟΥ unless the owner confirms VAT liability | Medium. **CONFIRMED** |
| 3 | GDPR art. 12–13 information (privacy notice) | Yes. The household exemption (art. 2(2)(c)) does not cover a public rental site | Reg. 2016/679 art. 12(1), 13(1)(a)–(f), 13(2)(a)–(e), 5(1)(e), 6(1)(b)/(c)/(f). L. 4624/2019 adds no content duty for this controller | No privacy/terms page (src/app/[locale] listing; grep 0). Collects name, e-mail, phone, dates, arrival time and requests (StayRequest), phone, password and country of origin (User), check-in requests, HMAC IP hashes. Sends data to webhook receivers | Every art. 13 element is missing | Tasks L2 and L3. Recipients list as corrected in the notes below | High. **PARTLY** (recipients and transfers corrected) |
| 4 | Sign-up checkbox that bundles "accept the portal terms and data processing" | Yes | GDPR art. 7(2), 7(4). The processing rests on 6(1)(b)/(c) with information, not on bundled consent. The "portal terms" document does not exist | `GUEST_TERMS_TEXT` (src/lib/guestTermsText.ts:L11-L14), recorded in TermsAcceptance | Refers to a non-existent document and presents contract processing as consent | Task L3 (reword and bump `GUEST_TERMS_VERSION`) | High. Verifier addition |
| 5 | Retention periods | Yes | GDPR art. 5(1)(e), 13(2)(a). Tax-law retention duties (art. 17(3)(b)) **not researched** | runRetention covers sessions, tokens, grants, audit and outbox only. No rule for StayRequest, User, Booking, CheckInRequest, TermsAcceptance or PrivacyRequest | Indefinite retention of names, e-mails and phones. The notice cannot state a period | Task L5 (owner picks N; 12 months suggested by R-167) | High. **CONFIRMED** |
| 6 | Right to erasure / access / portability | Yes | GDPR art. 17, 15, 20, 12(3) (one month, extendable by two) | Admin erase exists for portal users only (privacyService.ts L14-L19). Admin export exists (guestDataExport.ts) | Enquiry-only StayRequest has no erasure path. Guests are not told how to exercise their rights | Task L4. The notice (L2) names the request channel and the 1+2-month deadline | High. **CONFIRMED** |
| 7 | ePrivacy: cookies, localStorage, service-worker cache | Yes: **no banner needed**. Information duty: see note | L. 3471/2006 art. 4(5) as amended by art. 170 L. 4070/2012 (researcher 2 quoted a mix of the 2006 and current text; corrected). ΑΠΔΠΧ recommendations 1/2020 (press release 1525/25.2.2020). EDPB Guidelines 2/2023 v2 | Theme, favorites, map position, PWA dismissals, gallery index and session-signal fallback in localStorage. HttpOnly auth cookies. SW cache stores visited public pages. No analytics | No information about device storage | Section "Cookies and local storage" in the privacy page (L2), naming the SW offline cache explicitly | Medium. **PARTLY / CONFLICT** (see correction 6) |
| 8 | Record of processing (art. 30) / DPIA (art. 35) | Record: likely (offline document). DPIA: no | Art. 30(5) exemption requires "occasional" processing, which guest handling is not. Omnibus IV (provisional deal 9.6.2026, **not in force**) would narrow the duty to high-risk processing | Nothing in repo (and none needed) | Offline one-page record | None in repo. Owner keeps a one-page record | Medium. **PARTLY** (pending change added) |
| 9 | Processor contracts, security, breach notification | Yes (offline) | GDPR art. 28 (Netcup, Cloudflare, webhook receiver), 32, 33–34 | n/a | Not researched by either researcher; raised by verifier 2 | None in repo. Owner obtains the DPAs (Cloudflare DPA v6.4 of 3.4.2026 exists) | Missing topic. **Not researched** |
| 10 | Climate resilience fee (ΤΑΚΚ) | Yes (host obligation offline). No explicit duty to announce it on a site without prices | Current rates since 1.1.2025 (art. 24 L. 5162/2024, A.1202/2024): STR €8/night April–October, €2/night November–March; detached houses >80 m² €15/€4. Current codified basis: art. 44 L. 5177/2025 (verifier 1). Charged to the guest before departure with a "special receipt", monthly return | No mention (booking.ts detailsPage, check-in "Good to know") | Guest not told that the fee is due on direct bookings | Optional Task L6, **with the corrected amounts** | High on structure. **PARTLY: the researcher's €1.50/€0.50 amounts are the repealed 2024 regime** |
| 11 | Consumer pre-contractual information and withdrawal | Likely, only if the host counts as a "supplier" (CJEU C-105/17 Kamenova) | L. 2251/1994 art. 3b(1)(ε),(ια), art. 3ιβ(ιβ) (no withdrawal for accommodation on fixed dates), art. 2(2) (Greek language). L. 5317/2026 art. 3ζα (withdrawal button) does **not** apply (no online contract, accommodation exempt) | Site sends a request, not a contract, and shows no prices. It publishes a cancellation policy (booking.ts L163-L168 / L251-L256) with no withdrawal statement | Missing no-withdrawal statement and "final price includes all fees" statement. Whether the published policy matches the Airbnb listing is unverified | Optional Task L7 | Medium. **PARTLY** (fee amounts corrected. The lawspot versions used date from 2014 and do not reflect L. 4933/2022 or L. 5317/2026) |
| 12 | Language | Yes | L. 2251/1994 art. 2(2) (general terms in Greek). GDPR art. 12 with WP260 rev.01 (translation where data subjects speaking that language are targeted, so English as well) | Fully bilingual en/el | None for existing text. New legal text must exist in both locales. A "Greek prevails" clause is optional | Enforced by `Record<Locale, …>` typing and the i18n-parity test in L1–L3 | High. **CONFIRMED** |
| 13 | EU ODR platform link | No | Reg. 2024/3228 repealed Reg. 524/2013; platform discontinued 20.7.2025 | No link | None | **Do not add** an ODR link | High. **CONFIRMED** |
| 14 | ADR information (KYA 70330/2015 art. 12) | Unclear. Applies only if the supplier is committed or obliged to use ADR | Art. 12(1)–(3). Directive 2025/2647 amends the ADR framework (transposition by 20.3.2028; content for traders not verified) | Nothing | None mandatory | Optional line naming the Consumer Ombudsman (Λ. Αλεξάνδρας 144, 114 71 Αθήνα, www.synigoroskatanaloti.gr) in booking.ts detailsPage | Medium. **CONFIRMED** |
| 15 | Accessibility (EAA) | No (micro-enterprise exemption for services) | Directive 2019/882, L. 4994/2022 art. 4(5), in force since 28.6.2025. "L. 5069/2024" does not exist | Advisory a11y audits only | None legally | None | Medium. **CONFIRMED** (art. 4(5) text not retrieved verbatim; "Μέρος Β'" reference unverified) |
| 16 | Property standards L. 5170/2025 art. 3 | Yes, **offline only** | L. 5170/2025 art. 3 (from 1.10.2025). Circular 19231/19.09.2025 (emergency-number list in the property, bilingual, including 112, 100, 199, 166, 108, 1056 and the poison centre) | Site claims smoke detectors and fire extinguishers (apartmentData.ts L130-L148). Check-in shows only `nearbyServices.slice(0, 2)` (CheckInInfo.tsx L414) | None for the site. The digital list is incomplete but optional | Optional Task L10. The owner verifies the safety claims are true | High. **CONFIRMED** |
| 17 | Tax status / "services beyond bed linen" | Yes (offline) | Art. 111 par. 1, art. 39A ΚΦΕ (amended by art. 27 L. 5073/2023). AADE FAQ q.16, 19, 42, 51. ΣτΕ 1905/2025 (secondary): hotel-type services indicate tourist use | Marketing mentions "Personal Service", "Luggage storage", "Host 24/7" | Possible characterisation risk. Unclear; needs an accountant | Optional Task L11 (wording) after accountant advice | High on the regime, low on the marketing risk. **CONFIRMED** |
| 18 | Local STR restrictions (Kalamata) | No | Art. 111 par. 2A (Athens districts 1–3, extended to 31.12.2026 by KYA 225563 ΕΞ 2025; Thessaloniki 1st community by art. 5 L. 5313/2026) | n/a | None today. An announced 2027 extension and the EU Affordable Housing Act proposal do not name Kalamata | None | Medium. **CONFIRMED** |
| 19 | Police guest register / foreign-guest reporting | Unclear, offline | Police Ordinance 8/1999 (as 8Α/2003) covers "τουριστικά καταλύματα" (register kept 10 years, card 3 months). **Art. 29 L. 4251/2014 is repealed** (art. 178 L. 5038/2023). Art. 24(1) L. 5038/2023 prohibits renting to third-country nationals without a passport or travel document (€1,500–3,000) | No document collection (correctly) | None for the site | None. The owner checks travel documents offline and does not add ID-copy collection (ΑΠΔΠΧ 24.06.2026 guidance against keeping ID copies) | Medium. **PARTLY** |
| 20 | Reg. (EU) 2024/1028 (STR data, from 20.5.2026) | No for the owner's site | Display duties bind online STR platforms (DSA sense). No Greek implementing change to ΑΜΑ found | n/a | None | None | Medium. Text not retrieved (EUR-Lex empty). **UNVERIFIABLE** in detail |
| 21 | Map and routing third parties (contractual, not statutory) | Yes (terms of use) | OSRM demo server: "reasonable, non-commercial use", ≤1 req/s (FOSSGIS, Germany). CARTO basemaps: new terms require an API key (transition to 30.11.2026). OSM tile policy: exact `tile.openstreetmap.org` URL and an attribution link | LeafletMap.tsx L14 (OSRM default), L167 (`{s}.` OSM subdomains), L168 (CARTO dark tiles without key) | Likely breach of the OSRM policy (R-173). CARTO and OSM items have no R-ID yet | Task L9 (R-173). CARTO and OSM items need new R-IDs before a task | Medium. Raised by verifiers |

### Corrections applied from the verifiers (stated explicitly)

1. **Framework.** Art. 111 L. 4446/2016 was amended by **art. 28** L. 5073/2023, not art. 27. Art. 27 amends art. 39A ΚΦΕ. That L. 5170/2025 amends art. 111 is **UNVERIFIABLE**: its art. 3 only refers to art. 111. The claim should be dropped unless the ΦΕΚ text shows otherwise.
2. **ΑΜΑ provision** is art. 111 **par. 2(b)**, not par. 1 (researcher 2). The phrase "σε κάθε μέσο προβολής" has been in the text since the 19.05.2017 version (L. 4472/2017).
3. **ΑΜΑ fine.** The base is gross income *of the tax year in which the violation occurs*, not "of the last tax year". Par. 5 has **no doubling on repeat**; escalation exists only in par. 2A (Athens) and in art. 3 L. 5170/2025.
4. **ΤΑΚΚ amounts.** €1.50/€0.50 (March–October / November–February) applied in **2024**. Since 1.1.2025 the rates are €8 (April–October) and €2 (November–March) for STR, and €15/€4 for detached houses over 80 m². The proposed booking.ts sentence from researcher 1 would have published wrong amounts. It is replaced in Task L6.
5. **Police reporting.** Art. 29 L. 4251/2014 was repealed by art. 178 L. 5038/2023. The successor art. 24 L. 5038/2023 contains no arrival/departure reporting duty.
6. **ePrivacy information duty.** Verifier 1 marks as UNVERIFIED that ΑΠΔΠΧ requires information even for exempt storage (the ΑΠΔΠΧ web page does not say so explicitly, and the law PDF was unreadable). Verifier 2 confirms it from press release 1525/25.2.2020 ("transparency still applies"). The verifiers **disagree**. Treat the storage section as required by the ΑΠΔΠΧ recommendation, with that caveat. The exemption for favorites, PWA dismissals, map position and gallery index is arguable but not certain. The automatic SW caching of visited pages (public/sw.js L1-L7) is a grey zone and must be named explicitly.
7. **GDPR recipients and transfers** (researcher 2). router.project-osrm.org is run by FOSSGIS e.V. (Germany), so it is **not** a third-country transfer. The art. 13(1)(f) transfer is Cloudflare (US; EU-US DPF upheld in T-553/23 on 3.9.2025, appeal C-703/25 P pending; Cloudflare DPA v6.4 also includes SCCs). OSMF tiles are stored in UK/NL via Fastly (UK adequacy renewed to 27.12.2031). **Missing recipient:** CARTO (`basemaps.cartocdn.com`, dark theme, LeafletMap.tsx L168). **Wrong claim:** geolocation does not "stay on the device". `setView([lat,lng],15)` (LeafletMap.tsx L272-L274) requests tiles around the user's position, so the tile provider learns the approximate location together with the IP. Google Fonts is allowed by CSP but never loaded, so it is not a recipient. Nginx logs do not store IPs.
8. **Legal bases.** Add 6(1)(c) (legal obligations: the Short-Term Stay Declaration needs the tenant's ΑΦΜ or passport/ID number (secondary source only), and the ΤΑΚΚ receipt holds the guest's name). Replace bundled "consent" with information (art. 7(2)/7(4)).
9. **Accessibility.** "L. 5069/2024" does not exist; L. 5069/2023 is a planning law. The "Μέρος Β'" reference for L. 4994/2022 is likely wrong (articles 1–28).
10. **Language.** The obligation for the privacy notice comes from GDPR art. 12 and WP260, not from art. 2(2) L. 2251/1994, which covers general terms. A "Greek prevails" clause is optional.
11. **Emergency list.** Circular 19231/2025 also lists 108 (Coast Guard) and 1056 (Χαμόγελο του Παιδιού) and requires a bilingual list. Its legal nature (circular or Υ.Α. in ΦΕΚ) is **UNVERIFIABLE**.
12. **ODR.** Reg. 2024/3228 is dated 19.12.2024 and was published 30.12.2024. That a leftover ODR link is "misleading" is commentators' opinion, not an explicit rule.

### Items marked UNVERIFIABLE

- That L. 5170/2025 amends art. 111 L. 4446/2016.
- The legal character of circular 19231/19.09.2025.
- Verbatim art. 4(5) L. 4994/2022 and art. 4(5) Directive 2019/882. Verbatim Reg. 2024/3228 and Reg. 2024/1028 (EUR-Lex empty).
- The ΑΠΔΠΧ information duty for exempt storage (verifiers disagree, see correction 6).
- Whether the ΤΑΚΚ amounts changed for 2026. A secondary source (15.09.2026) says no, and the AADE FAQ 02/2026 was HTTP 403. Whether the 90 m² second-floor apartment could ever be classed as a "detached house" (it should not be; confirm with an accountant).
- Whether the letters of art. 3b L. 2251/1994 changed after 2014, since the lawspot versions are old.
- The tenant data required in the Short-Term Stay Declaration (secondary source only).
- The CARTO registered seat and its transfer mechanism.

### Uncertainties

- The host's status as "supplier" or "service provider" (L. 2251/1994, P.D. 131/2003, KYA 70330/2015) depends on the Kamenova criteria (organisation, frequency, profit). It is likely but not certain.
- ΑΜΑ on a site for an **off-platform-only** property rests on interpretation. It is clear only when the property is also on Airbnb, which the site's audience suggests.
- The retention period N and any tax-law retention for direct bookings were not researched and are the owner's decision.
- The identity of the webhook receivers (BOOKING_REQUEST_WEBHOOK_URL, CHECKIN_REQUEST_WEBHOOK_URL, ALERT_WEBHOOK_URL) is unknown from the code. They must be named in the notice.
- Pending EU changes that are not in force: Omnibus IV (art. 30(5)), Digital Omnibus (art. 88a cookies), the EU Affordable Housing Act proposal (25.09.2026), and the announced 2027 extension of the Athens/Thessaloniki limits.
- Whether the published cancellation policy (30/14 days, 50%) matches the real practice and the Airbnb listing, and whether 0% refund under 14 days is fair under art. 2(6)-(7) L. 2251/1994. Not researched.
- Whether marketing phrases ("Personal Service", "Luggage storage", "24/7") could reclassify the rental as tourist accommodation. This needs an accountant.

### Missing topics (raised by verifiers, not researched)

- GDPR art. 28 processor agreements, art. 32 security, art. 33–34 breach notification (offline).
- Data minimisation of `User.countryOrigin`: collected in portalAuthService.ts L226/L236, shown only in admin (guests/page.tsx L596), no stated purpose. Needs an R-ID.
- The OSM ODbL attribution link and the exact tile URL. The CARTO API-key terms. Both need R-IDs.
- Airbnb off-platform policy (SUSPECTED, from the cost verification): the guide handed to Airbnb guests links to a direct-booking CTA (ApartmentCinematic.tsx:158 `#book-now`). Airbnb help article 2799 forbids encouraging off-Airbnb bookings. Needs an R-ID and an owner decision.
- Unfair-terms and misleading-practice review of the cancellation policy (L. 2251/1994 art. 2(6)-(7), 9α–9ε).
- Greenwashing rules (L. 5317/2026, Directive 2024/825, from 27.9.2026): no environmental claims found today (grep over src/i18n, src/data). They become relevant only if "eco" claims are added.

### Sources (accessed dates as reported)

- Art. 111 L. 4446/2016, par. 2 and 5: https://www.taxheaven.gr/laws/view/index/law/4446/year/2016/article/111/paragraph/2 and …/paragraph/5 (accessed 2026-09-28). Full article: https://www.taxheaven.gr/law/4446/2016/arthro/111 (2026-09-27/28). 2017 version: https://www.lawspot.gr/nomikes-plirofories/nomothesia/n-4446-2016/arthro-111-nomos-4446-2016-rythmiseis-gia-ti-vrahyhronia (2026-09-28).
- L. 5073/2023 art. 27/28/29 titles: https://www.taxlive.gr/%CE%AC%CF%81%CE%B8%CF%81%CE%B1-27-28-%CE%BA%CE%B1%CE%B9-29/ (2026-09-28).
- AADE FAQ 23.09.2025 (reproduction): https://www.taxheaven.gr/circulars/49191/syxnes-erwthseis-apanthseis-enhmerwmeno (2026-09-27/28).
- ΤΑΚΚ current rates: https://stegasi.gov.gr/programs/epivoli-telous-anthektikotitas-stis-vrachychronies-misthoseis/ (2026-09-28). Art. 44 L. 5177/2025: https://www.taxheaven.gr/law/5177/2025/arthro/44 (2026-09-28). A.1202/2024: https://www.taxheaven.gr/circulars/49201/a-1202-2024 (2026-09-28).
- L. 5170/2025 art. 3: https://www.taxheaven.gr/law/5170/2025/arthro/3 (2026-09-28). Circular 19231/2025: https://www.taxheaven.gr/news/71721/prodiagrafes-braxyxronias-misowshs-apo-0110-h-egkyklios-me-tis-leptomereies (2026-09-28).
- Local restrictions: https://stegasi.gov.gr/programs/prosorinoi-periorismoi-stis-vrachychronies-misthoseis/ (2026-09-27/28). Art. 29 L. 5162/2024: https://www.taxheaven.gr/law/5162/2024/arthro/29 (2026-09-28).
- Police register: mitos.gov.gr procedure "Τήρηση Βιβλίου Πελατών…" (2026-09-28). Repeal: https://www.taxheaven.gr/law/5038/2023/arthro/178 (2026-09-28). Art. 24 L. 5038/2023: https://www.taxheaven.gr/law/5038/2023/arthro/24 (2026-09-28).
- GDPR: https://gdpr-info.eu/art-13-gdpr/, /art-2-gdpr/, /art-5-gdpr/, /art-7-gdpr/, /art-12-gdpr/, /art-30-gdpr/, /art-35-gdpr/ (2026-09-27/28; EUR-Lex returned empty). L. 4624/2019 consolidated (ΑΠΔΠΧ): https://www.dpa.gr/sites/default/files/2023-06/4624_2019%20%CE%BC%CE%B5%20%CF%84%CF%81%CE%BF%CF%80%CE%BF%CF%80%CE%BF%CE%B9%CE%AE%CF%83%CE%B5%CE%B9%CF%82.pdf (2026-09-27).
- ePrivacy / ΑΠΔΠΧ: https://www.dpa.gr/el/enimerwtiko/thematikes_enotites/electronikesepikoinwnies/cookies/cookies_diadiktuo_cookies (2026-09-27/28). https://www.dpa.gr/el/enimerwtiko/deltia/systaseis-gia-ti-symmorfosi-ypeythynon-epexergasias-dedomenon-me-tin-eidiki (2026-09-27/28). Current art. 4(5) text (secondary): https://www.epixeiro.gr/public-administration/article/141598/enimerosi-peri-tis-ensomatosis-toy-e-privacy-directive-eu-cookie-law-sto-elliniko-dikaio (2026-09-28). EDPB Guidelines 2/2023 v2: https://www.edpb.europa.eu/documents/guideline/guidelines-22023-on-technical-scope-of-art-53-of-eprivacy-directive_en (2026-09-28).
- Transfers: T-553/23 press release https://curia.europa.eu/site/upload/docs/application/pdf/2025-09/cp250106en.pdf. Cloudflare DPA https://www.cloudflare.com/cloudflare-customer-dpa/. OSRM demo server https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server. OSM tile policy https://operations.osmfoundation.org/policies/tiles/ (all 2026-09-28).
- P.D. 131/2003 art. 4: https://www.lawspot.gr/nomothesia/pd-131-2003/arthro-4-proedriko-diatagma-131-2003-ypohreotika/ (2026-09-27/28).
- L. 2251/1994 arts 2, 3b, 3d, 3ιβ: https://www.lawspot.gr/nomothesia/n-2251-1994/ (article pages, 2026-09-27/28). L. 5317/2026: https://www.taxheaven.gr/law/5317/2026 (2026-09-28).
- ODR discontinuation: https://consumer-redress.ec.europa.eu/site-relocation_en (2026-09-28). ADR art. 12 KYA 70330/2015: https://www.lawspot.gr/nomothesia/kya-70330oik-2015/arthro-12-koini-ypoyrgiki-apofasi-70330oik-972015/ (2026-09-27/28). Directive 2025/2647: https://eapil.org/2026/01/23/directive-eu-2025-2647-amending-the-adr-framework-for-consumer-disputes/ (2026-09-28).
- Accessibility L. 4994/2022: https://www.taxheaven.gr/law/4994/2022 (2026-09-27/28).
- Reg. 2024/1028 (mirror): https://www.eurlexa.com/act/en/32024R1028/present/text (2026-09-28).
- Airbnb off-platform policy: https://www.airbnb.com/help/article/2799 (2026-09-28, cited by the cost verifier).

## Radical changes and running cost

### Current setup

This is the target chosen in the ADR (docs/architecture/deployment-target.md:24-34, 38-44). Nothing runs in production yet: the ADR says "accepted but not production-ready" (:156-180), and there is no live VPS, no off-site backups, and no firewall or timer evidence. The target is one Netcup x86 VPS with Cloudflare Free in front (DNS/TLS/WAF) and host Nginx as the only ingress (private identity headers + `ORIGIN_PROXY_SHARED_SECRET`). On the VPS, Docker Compose (docker/docker-compose.prod.yml) runs the `db` service (postgres:16-alpine, digest-pinned, :26), the `web` Next 16 standalone image on 127.0.0.1:3000 (:47-60), a one-off `migrate` (:63-72), and the `outbox`/`operations` workers (:75-98), fired by host timers every 1 and 5 minutes. The three images come from docker/Dockerfile.security (node:22-alpine). The ADR cost goal is about €100/year or less, excluding the domain (:139-141).

**Verified yearly cost.** Prices include 24% Greek VAT on the net price. That is correct for a private B2C customer: EU place-of-supply rule for electronically supplied services, and a 1–2-property owner is not VAT-registered, so there is no reverse charge.

| Item | Yearly EUR |
|---|---|
| Netcup VPS 500 G12.5, 24-month term (€7.03/mo incl. 19% → €7.33 with 24%) | ≈ 88 |
| Same, 12-month term (the overview page's €8.26 is the **12-month price incl. 19% VAT**, not net) | ≈ 103 |
| Same, monthly | ≈ 119 |
| Cloudflare Free | 0 |
| Off-site backup storage (required by the ADR, not built yet; R2/B2 free tier) | 0–10 |
| **Total** | **≈ 88–103 (+ domain, + backup storage if above the free tier)** |

The ADR's VPS 500 G12 plan is no longer sold. It was replaced by G12.5 on 2026-09-22 (third-party source), so ADR:38-39 and :55-56 need updating whatever option is chosen. The figure "G12 €4.96 net ≈ €74/year" is **not supported** by its cited source and should be removed.

### PostgreSQL dependencies (why a database swap is a redesign, not a connection-string change)

- `src/lib/prisma-repositories/refreshTokenRepository.ts:151-153`: `pg_try_advisory_xact_lock(${lockKey}::bigint)`. Key derivation is in `src/lib/refreshRotationLock.ts:11-21` (SHA-256 → signed int64 for the PG advisory-lock key space).
- `refreshTokenRepository.ts:124-129, 138-143`: `SELECT … FOR UPDATE` on users / refresh_token_families with `::uuid` casts. `:161` has `SET LOCAL lock_timeout = '11s'`. `:499`, `:563` use `isolationLevel: 'ReadCommitted'`.
- `src/lib/sensitiveRateLimit.ts:53-65`: `INSERT … ON CONFLICT ("key") DO UPDATE … CASE WHEN … CURRENT_TIMESTAMP … EXCLUDED … RETURNING` inside `$transaction`. `:93-96` uses `GREATEST(count-1,0)`.
- `src/lib/featureFlags.ts:54-61`: `::jsonb`, jsonb merge `"value" || EXCLUDED."value"`, `ON CONFLICT … RETURNING`.
- `src/app/api/health/ready/route.ts:16-24`: `SET LOCAL statement_timeout = '1800ms'` plus a query on `_prisma_migrations`.
- `src/lib/security-monitoring.ts:80-81`: `SET LOCAL statement_timeout` / `lock_timeout`.
- `src/lib/prismaPgConfig.ts:15-45` (pg pool options) and `src/lib/prisma.ts:1,5` (`@prisma/adapter-pg`).
- `src/lib/runtime-env-schema.js:42`: the `DATABASE_URL` refine `isPostgresUrl` refuses to start the app with any other database.
- Serializable transactions with a P2034 retry loop: `src/lib/portalAuthService.ts:43, 300-304`, `src/app/api/admin/stay-requests/[id]/route.ts:53-56`, `src/lib/prisma-repositories/checkInRequestRepository.ts:228-231`. `src/lib/privacyService.ts:196` is Serializable **without** a P2034 retry (corrected by the verifier).
- `prisma/schema.prisma:7` (`provider = "postgresql"`), **113** `@db.*` attributes (Timestamptz 45, Uuid 31, VarChar 27, Char 6, Date 4; corrected from 44), `Json` fields at :149, :174, :257, and 10 native enums at :328-379. `prisma/migrations/migration_lock.toml` is also `postgresql`.
- Migrations use PL/pgSQL `DO $$ … RAISE EXCEPTION` guards (e.g. 20260714145900_preserve_booking_ownership/migration.sql:7-71, 20260924122000_remove_dead_tables/migration.sql:10-19, 20260714150000/migration.sql:5-56), a trigger and function (20260715101000_normalize_stay_request_phones/migration.sql:19-37), regex CHECKs with `~` / `!~` (20260714150000/migration.sql:62, :37), a `NOT VALID` CHECK (20260715100000/migration.sql:25-26), partial unique indexes (20260714150000/migration.sql:260, :327; 20260715104000/migration.sql:20), CHECK constraints (20260714150000/migration.sql:217, :235-237, :316; 20260714090000/migration.sql:103), and TIMESTAMPTZ/JSONB/`::jsonb`/`::uuid`.
- Tooling tied to a PostgreSQL container: the digest in docker/docker-compose.prod.yml:26; release gates 11, 22, 23 and 30 (docs/release-verification.md:62, :73, :74, :81; line numbers corrected); scripts/check-postgres-image-policy.ts; the integration suite (84/84 in the latest PROGRESS.md:403 record; the 74 figure is an older baseline); scripts/check-prisma-integrity.mjs; `statement_timeout` in tests/integration/support/fixtures.ts:76 and database-safety.ts:313.

### Ranked options (after the verifier's corrections)

| Rank | Option | Yearly EUR (incl. 24% VAT) | Effort | What you lose | Risks |
|---|---|---|---|---|---|
| 1 | **(f) Static guide only** on Cloudflare Pages Free (or Workers Static Assets). No portal, admin or DB. Booking, check-in and messaging go through Airbnb | 0 hosting (+ domain) | 2–4 days, mostly deletions: `output: 'export'` + `images.unoptimized` (6 files use next/image); remove src/proxy.ts and move its locale redirect to `_redirects`; remove the `headers()` reads in src/app/layout.tsx:34 and src/app/[locale]/page.tsx:14; static CSP via `_headers`; delete book, booking-details, the dynamic check-in parts, guest, portal, admin, all 25 API routes, prisma/, docker/, most of scripts (12,761 LOC) and tests (18,208 LOC); drop @prisma/*, pg, bcrypt, jsonwebtoken; write a new ADR (the current one rejects Pages at :105-113) | Direct booking requests, guest portal (claim, arrival time, preferences), admin area, webhook outbox, audit/alerts, erasure flow, DB-backed rate limits. You also stop processing personal data on your own infrastructure (much smaller GDPR footprint) and drop the release ceremony, DB patching and backups | This is a product decision. Without nonces the CSP falls back to `'unsafe-inline'` or experimental SRI, which is acceptable for a site with no user data but must be stated. The Wi-Fi password, today shown only to signed-in guests inside a time window (check-in/preferences/route.ts:70-74), must **not** go on the static site; it moves to Airbnb's check-in instructions. ΑΜΑ, provider identity and the storage notice still apply (legal section) |
| 2 | **(a/b) Keep the architecture, cheapest suitable x86 VPS** | OVH VPS-1 (2 vCores/4 GB, 12-month) ≈ 57; Contabo Cloud VPS 4 ≈ 66 (24-month prepay; VAT basis, post-24-month price and setup fee unverified); Netcup VPS Lite 1 G12.5s (4 GB) ≈ 73; Netcup nano G11.5s (2 GB) ≈ 46 (sufficiency SUSPECTED, not measured); Hetzner CX23 ≈ 89 but **currently unavailable**; Oracle Always Free 0 but ARM and subject to idle reclamation | Zero code. One ADR line (same linux/amd64, so no new native qualification). ARM options (Hetzner CAX11, Oracle A1) are **not** drop-in: the ADR rejects ARM64 (:38-51) and they would need a new smoke run | Nothing functional. Headroom on 2 GB. Price certainty on hourly plans (Hetzner changed prices three times in 2026) | The real cost is operator time: the ADR's open gaps (off-site backups, restore tests, firewall and timer evidence) still have to be built, about 2–4 days before a first deploy, and then maintained |
| 3 | **(c) Managed Postgres free tier + PaaS app** (Supabase/Neon Free + Fly.io / Railway / Render) | Fly 512 MB (ams) + Supabase Free ≈ 53 with shared IPv4, ≈ 79 with dedicated IPv4; Railway Hobby ≈ 75–130 + VAT; Render Free 0 but spins down after 15 min with ~1 min cold start, and its free Postgres expires after 30 days | 2–4 days + new ADR: a new client-IP trust path per platform (no own Nginx, ADR:66-72), workers moved to platform cron, platform health checks, pooler use; gates 7, 11 and 22 become irrelevant. Neon: the 1-minute outbox worker plus the 30 s health probe need ≈ 180 CU-h/month, above the 100 free, so the cadence must change | The single-host contract (trusted ingress, loopback DB, digest-pinned PG), control over Postgres, predictable cost | Two or three vendors for one apartment. Free-tier pause or expiry (Supabase after 7 idle days). Cold starts for a guest scanning a QR. Railway **does** sleep (Serverless mode). Terms change over time |
| 4 | **(d) SQLite/libSQL on the same VPS** | Same VPS as rank 2. The only gain is that the 2 GB plan (≈ 46) becomes comfortable: saves ≈ 27–42/year | **2–4 weeks** (verifier's estimate; the analysis said 5–10 days): 113 `@db.*`, 10 enums, 19 migrations re-baselined, all raw SQL above rewritten, advisory and row locks replaced for refresh rotation, `ReadCommitted` dropped, the better-sqlite3 native module on musl requalified, 10,390 LOC of integration tests and gates 11/22/23/30 rewritten | Server-side row and advisory locks and the documented replay policy, enforced enums, guarded migrations, the option to move the DB out later | Rewriting the most sensitive code (guest refresh rotation) to save under €45/year. If the aim is simplification, rank 1 simplifies far more |
| 5 | **(e) Cloudflare Workers (OpenNext) + D1 rewrite** | Theoretically 0. Realistically Workers Paid $5/mo ≈ 68 (bcrypt cost 12 in pure JS very likely exceeds the Free plan's 10 ms CPU, SUSPECTED) | 4–8 weeks, effectively a new app. `proxy.ts` has only **experimental** OpenNext support (PR #1309 merged 2026-08-25, open bug #1400). Prisma's D1 adapter has "no transaction support currently", which breaks the outbox invariant and the Serializable flows. Also required: the D1 binding for 23 prisma importers, a cf-connecting-ip trust path, Cron Triggers, and image handling | The whole concurrency and security model, guarded migrations, the Nginx contract. Existing password hashes **survive** via bcryptjs, which is compatible with the C++ binding | Hard and changing free-tier limits (D1 enforcement since 2026-09-01). Experimental framework support. Probably paying $5/month at the end. The worst cost/risk ratio of all options |

**Hidden costs common to every option, including the "€0" static one.** The OSRM demo server default (LeafletMap.tsx:14) is restricted to non-commercial use at ≤1 req/s (R-173). CARTO dark tiles are used without the API key that the new terms require (transition until 30-11-2026). The OSM tile URL uses `{s}.` subdomains, contrary to the tile policy. You either pay for a provider, self-host (more RAM), or drop travel times.

### Verifier's corrections (verdict: PARTLY)

1. The Netcup 12-month price is ≈ €103/year, not €123: the overview's €8.26 already includes 19% VAT, and €9.50 is the monthly price.
2. "G12 €4.96 net ≈ €74" is not in the cited source. Removed.
3. Hetzner CX23 at €5.49 + €0.50 IPv4 (≈ €89) is verified but **currently unavailable**. There were three price changes in 2026, not two.
4. Fly.io: the analysis used the 1 GB price for 512 MB. The corrected figure is ≈ €53/year (shared IPv4, which is free, verified) or ≈ €79 (dedicated). Option (c) therefore costs about the same as a small VPS. Its rank 3 rests on effort, vendor count and free-tier risk, not price.
5. Railway: "no sleeping" is wrong (Serverless / App Sleeping exists).
6. OpenNext / `proxy.ts`: outdated. Support is now experimental with open bugs. The Workers bundle limit is 64 MiB on both plans.
7. bcrypt on Workers: no password-hash rewrite is needed (bcryptjs is compatible), but CPU cost likely forces the Paid plan.
8. Repo counts: 113 `@db.*`, not 44. Integration suite 84/84, not 74. Release-gate line numbers are 62/73/74/81. `privacyService.ts:196` has no P2034 retry.
9. SQLite effort is more realistically 2–4 weeks than 5–10 days.
10. The "25–50 operator hours/year" figure is an assumption with no evidence, since there has been no production release yet. Its arithmetic range should be €375–1,250. The recommendation does not depend on it.
11. Static option omissions: the `headers()` reads, the proxy's locale redirect, the CSP downgrade without nonces, and the Wi-Fi password.
12. Missing options: OVH VPS-1 (≈ €57, the cheapest x86 4 GB found) and Oracle Always Free (ARM, idle reclamation). Missing risks: the Airbnb off-platform policy against the direct-booking CTA (SUSPECTED), and the map/routing terms.
13. The verifier also recorded the stale `EXPECTED_MIGRATION` in `src/app/api/health/ready/route.ts:8`. It is **already in Review 3 as R-175/R-176**, so no new ID is needed.
14. This is a greenfield decision: nothing is paid today and no live infrastructure has to be migrated. Whether a live database with guest accounts exists from the earlier Vercel/Cloudflare Workers deployments (ADR:10-13) is unknown and must be asked.

### Plain recommendation

A radical change is worth it only in one form: **turn the site into a static guide (option f)** and move booking requests, check-in details and messaging to Airbnb. For one apartment this removes hosting cost, the database, backups, patching, the release ceremony and most of the personal-data processing. It also removes the Airbnb off-platform risk created by the direct-booking CTA. Whether to give up the portal and admin area is the owner's product decision, not a technical one.

If the owner wants to keep the portal and admin area, **no radical change pays off.** Keep the ADR architecture as is and pick the cheapest suitable x86 plan: OVH VPS-1 ≈ €57/year or Netcup VPS Lite 1 ≈ €73/year. That is zero code and one ADR update, which is needed anyway because G12 is no longer sold. All keep-the-database options now fall within ≈ €46–103/year, a spread smaller than a few hours of the owner's time. SQLite (d) and Workers/D1 (e) cost weeks to save under €45/year or nothing, and PaaS free tiers (c) trade money for cold starts and changing terms.

Before choosing, confirm two things: whether any live database with guest accounts exists, and how the map/OSRM/CARTO terms will be handled (R-173). The legal items (ΑΜΑ, provider identity, privacy notice) apply in every option.

## Proposed task plan (superseded)

Superseded on 2026-09-28 by the approved plan in PROGRESS.md ("Review 3 decisions" and "Review 3 tasks"), which adapts it to the owner's product decisions (no booking form, availability & prices page, new visual identity). The task texts below remain the reference for the task IDs that PROGRESS.md keeps.

Everything below needed owner approval before it started. Tasks tagged **[OWNER]** also need a decision. The plan follows the CLAUDE.md rules: one concern per task, no commits by the agent, and PROGRESS.md updated after every task.

**Standard gates (G-STD), part of every task:**
1. `npm run typecheck` is clean.
2. `npm run lint -- --max-warnings=0` is clean.
3. `npm run lint:security` is clean.
4. `npm test` is no worse than baseline.
5. `npm run check:dead-code` (knip) is clean.
6. `git diff --stat` shows only the files listed in the task.
7. No public API or behaviour change beyond what the task states.

**Recording the baseline:** record the exact default and integration counts at the start of Phase 3. The sources disagree: 581/581 default, and 83/83 vs 84/84 integration in PROGRESS.md.

**Regression-test gate (G-REG):** a new or changed test that fails on HEAD fff4283 and passes after the change. Where it is not feasible, the task says so.

**Visual gate (G-VIS)** for CSS tasks: before/after screenshots of the named pages in light and dark mode, at 375 px and ≥1024 px. Report computed contrast of the changed pairs (≥4.5:1 for text).

**Content gate (G-I18N)** for content tasks: `tests/unit/i18n-parity.test.ts` passes, and the exact en/el strings are listed in the task.

**Tasks tagged Docker/network** also require owner approval for the local build or install.

### Group A: High bugs and security

- **A1 (R-166): dark-mode moments/phones card CTAs.** In `src/styles/09-utilities.css` L140, L145 and L149, append `:not(.moment-card-action):not(.moment-card-phone-chip)` to the three `[data-theme="dark"] a:not(…)` selectors.
  - Gates: G-STD.
  - G-VIS on /en/moments and /en/phones, resting and hover. Expected values: primary text #e2e8f0 on #065f5b ≥6.0:1, white on hover ≥7.5:1, secondary and phone chips ≥11:1.
  - G-REG is not feasible (CSS cascade; no test harness renders computed styles). Record the computed values instead.
- **A2 (R-177): global cap on unauthenticated report endpoints.** Add a second `checkSensitiveRateLimit` call with scope `csp-report-global` (limit 500, window 3,600,000 ms) in `src/app/api/security/csp-report/route.ts`, and the same with scope `client-error-report-global` in `src/app/api/errors/route.ts`.
  - Gates: G-STD.
  - G-REG: route tests assert the second limiter call and a 429 when it denies.
  - Dropping `originalPolicy` is out of scope, and so is rerouting reports to logs **[OWNER]**.
- **A3 (R-175, R-176): readiness migration pin.** Set `EXPECTED_MIGRATION = '20260924124000_drop_refresh_token_hints'` in `src/app/api/health/ready/route.ts:L8`. Add `tests/unit/readiness-migration.test.ts`: it sorts the `prisma/migrations` directory names and asserts that the route source contains the latest name. Add no new export.
  - Gates: G-STD + G-REG (the test fails on HEAD).
- **A4 (R-185) [OWNER]: Prisma Studio exposure.**
  - Option 1: bump `prisma`, `@prisma/client`, `@prisma/adapter-pg` and the migrate `prisma` to 7.10.0, regenerate both lockfiles, and update the `allowScripts` versions.
  - Option 2 (interim, reversible): remove the `db:studio` script.
  - Gates: G-STD. For option 1 also `test:integration`, `check:prisma-integrity` and `smoke:image` (Docker/network).
- **A5 (R-257): enforced install-script allowlist.**
  - Drop `"sharp@0.35.4": true`.
  - Add a root `.npmrc` with `strict-allow-scripts=true`, and `--strict-allow-scripts` on the two `npm ci` lines in `docker/Dockerfile.security` (L20, L84).
  - Add `allowScripts` for `@prisma/engines@7.10.0` and `prisma@7.10.0` to `docker/migrate/package.json` (the versions after R3-A4; the migrate lock's only `hasInstallScript` entries).
  - Gates: G-STD, a local `npm ci`, and `docker:build` (Docker/network).
- **A6 (R-181): overrides in the migrate image.**
  - Add the three overrides `deepmerge-ts`, `fast-uri`, `mysql2` to `docker/migrate/package.json`. Since R3-A4, `@prisma/dev` 0.24.17 comes from `prisma@7.10.0`'s own pin (root override removed; the migrate lock already resolves 0.24.17).
  - Regenerate `docker/migrate/package-lock.json` (network).
  - Extend `tests/unit/migrate-image-manifest.test.ts` to assert override equality with the root manifest.
  - Gates: G-STD + G-REG (the manifest test fails before). Then `smoke:image` (Docker).
- **A7 (R-182): PostgreSQL 16.15 digest.** Follow docs/release-verification.md "Controlled PostgreSQL digest update".
  - Resolve and verify the digest with `docker buildx imagetools inspect` (plain and `--raw`) and check both architectures.
  - Replace all 8 occurrences in 7 files in one diff.
  - Gates: `validate:release-policy`, `test:release-policy`, `test:postgres-image-policy`, `check:postgres-image-policy`, `test:integration`, `smoke:image` (Docker/network).
- **A8 (R-183): Node base image re-pin.**
  - Re-pin the four `FROM` lines to the current node:22-alpine index digest.
  - Add a "Controlled Node base-image digest update" section to docs/release-verification.md.
  - Correct the impact text in REVIEW.md: no reachable CVE was shown.
  - Gates: `docker:build`, `docker:scan`, `smoke:image` (Docker/network; scanner install needs approval).
- **A9 (R-184): Nginx lock to 1.30.x (≥1.30.4).**
  - Update `deploy/nginx/image.lock.json`, `scripts/lib/release-policy.mjs:L14-L15` and `scripts/tests/release-policy.test.mjs:L224`.
  - Add one line to origin-ingress-runbook.md stating which Nginx build production runs and the minimum version.
  - Gates: `test:nginx-ingress` after a local pull (approval), `validate:release-policy`, `test:release-policy`.
- **A10 (R-178, R-241): loopback-publication check.** Replace the `3000:3000` matcher in `scripts/lib/release-policy.mjs:L571-L581` with the interpolation-neutralised check from R-241, and reject long-syntax port entries.
  - Gates: `validate:release-policy` on the real tree.
  - G-REG in `release-policy.test.mjs`: negative cases `${WEB_PORT:-3000}:3000`, `8080:3000`, bare `3000`, `0.0.0.0:${WEB_PORT:-3000}:3000`; positive case with the real web and db lines.
- **A11 (R-227) [OWNER]: HSTS preload.** Set `preload: false` in `src/lib/security-config.ts` production HSTS. Keep or drop `includeSubDomains` only after the owner confirms the hostname layout. Record the decision in docs/architecture/deployment-target.md.
  - Gates: G-STD. The smoke HSTS check (scripts/smoke-production-image.ts:L232) must still pass.
- **No task: R-197** (verifier disagreement). The proxy-level Origin check and SameSite=Strict already block these requests. A route-level check would be a third layer and is optional.

### Group B: Correctness

**Server validation and contract**

- **B1 (R-169): booking-request dates on the server.**
  - Compare to the UTC "today" inside POST: past `from` returns 422.
  - Add a `superRefine` night cap: more than 30 nights returns 422.
  - Pin the clock in `tests/routes/booking-requests.test.ts` with fake Date and `vi.useRealTimers()` in afterEach.
  - G-REG cases: past → 422, 31 nights → 422, today → 202. G-STD.
- **B2 (R-199, part 1): stay-request id validation.** In `src/app/api/admin/stay-requests/[id]/route.ts`, add a UUID check that returns 404, and make `context` required.
  - G-REG in `tests/routes/admin-dead-outbox-actions.test.ts`: `'not-a-uuid'` returns 404 **and** `$transaction` is not called. G-STD.
- **B3 (R-199 part 2, R-266, R-285(e) route part) [OWNER picks 404 vs 422 for a malformed export id]: `src/app/api/admin/guests/route.ts` query validation.**
  - Validate the export `bookingId` as a UUID.
  - Validate search `startDate`/`endDate` with `z.iso.date()`.
  - G-REG: a malformed id means `getBookingDetails` is not called; `startDate=2026-10-5` returns 422 and `searchBookingsByDateRange` is not called. G-STD.
- **B4 (R-168): admin stay-requests card.** Add `locale`, `arrivalTime` and `specialRequests` to the type and to the `<dl>` in `AdminStayRequestsClient.tsx`.
  - G-REG in `tests/components/admin-stay-requests.test.tsx`: values render, and '—' renders when absent. G-STD.
- **B5 (R-201): stay-request actions.** Add try/catch/finally, `setError('')` at start, and an `actingId`-disabled button.
  - G-REG: a rejected PATCH shows 'Unable to update request'; the button is disabled while pending. G-STD.
- **B6 (R-191, R-192): check-in 401 and verbatim errors.** In `CheckInInfo.tsx` `handleSubmitArrivalRequest`, handle 401 with a single ref-guarded `window.location.assign` to `/${locale}/portal/refresh?next=…`. Otherwise always show `ui.requestError`, never `data.error.message`.
  - G-REG in `tests/components/checkin-arrival-request.test.tsx`: 401 navigates; 404 `{error:{message:'Not Found'}}` shows the localized text. G-STD.
- **B7 (R-268): arrival requests after the stay starts.** Return 409 in POST `/api/check-in/arrival-request` when `startDate < businessToday` (UTC convention), and add a localized client message.
  - G-REG: startDate before today → 409 and create not called; today → 201. Add a `@/lib/prisma` mock to the existing 5 tests. G-STD.
- **B8 (R-206): operations worker.** Use `Promise.allSettled` with an `AggregateError` rethrow in `scripts/run-operational-maintenance.ts`.
  - G-REG in `tests/unit/worker-disconnect.test.ts`: disconnect is not called before a deferred retention resolves, and the retention counts are printed. G-STD.
- **B9 (R-204): claim-grant retention.** Add `bookingClaimGrant.deleteMany({ where: { expiresAt: { lt: days(30) } } })` to runRetention, appended at the **end** of the tuple.
  - G-REG in `tests/unit/operational-retention.test.ts`. G-STD.
- **B10 (R-264): remove the guest-data cache.** Delete `guestDataCache.ts`, `guestDatasetVersion.ts` and their unit test, and return the repository results directly from `guestDataStore.ts:L144-L150`.
  - Gates: G-STD plus the guest-data-export and admin-guests route tests.
  - G-REG is not feasible (a race); removing the code removes the defect.
- **B11 (R-265): admin phone search.** Add a GR-local fallback lookup in `guestStore.findUserByPhone`.
  - G-REG: `'691 234 5678'` resolves via `+306912345678`; the international form does a single lookup. G-STD.
- **B12 (R-200): check-in counts.**
  - The dashboard uses `limit=1` and the guests page uses `limit=6`.
  - Add `pendingArrivalCount` from `summary?.pending ?? 0` and drop the L272 filter.
  - Optional G-REG: `summary.pending: 7` shows "7 pending requests". G-STD.
- **B13 (R-208): client phone validation.** Refine the BookingForm schema with the server regex and `normalizeStayRequestPhone`.
  - New key `phoneInvalid` in `BookingFormDictionary` (src/i18n/domains/booking.ts). en: "Enter your number with the country code, starting with + (e.g. +49 171 2345678)". el: "Πληκτρολογήστε τον αριθμό σας με τον κωδικό χώρας, ξεκινώντας με + (π.χ. +49 171 2345678)".
  - G-REG: `'0049 171 2345678'` shows the field error and fetch is not called. G-I18N, G-STD.
- **B14 (R-273): form limits and 422 text.**
  - Add `maxLength={1000}` to the special-requests textarea and `maxLength={100}` to the first and last name inputs.
  - Reword `submitRejected` in booking.ts L146/L234. en: "Some details could not be accepted. Please check the form and try again." el: "Κάποια στοιχεία δεν έγιναν δεκτά. Ελέγξτε τη φόρμα και δοκιμάστε ξανά."
  - G-REG: attribute assertions and the reworded message in `booking-form-errors.test.tsx`. G-I18N, G-STD.
- **B15 (R-209):** `SearchBar.tsx:L192-L193` uses `"PP"` instead of `"MMM d, yyyy"`. Optional G-REG: el renders "10 Ιουλ 2030". G-STD.
- **B16 (R-221):** `book/page.tsx:L76` uses `location: t.locationPanel.city`. G-REG in `tests/components/i18n-copy.test.tsx`: el shows "Καλαμάτα, Ελλάδα" and not "Kalamata, Greece". G-STD.
- **B17 (R-215):** Organization `logo: absUrl('/icons/icon-512.png')` in `src/app/[locale]/page.tsx:L45`. Guarded absolute image URLs are optional. G-STD.
- **B18 (R-218):** `role="group"` in `DateRangePicker.tsx:L210`. Gates: `tests/components/date-range-picker.test.tsx`, G-STD.
- **B19 (R-232):** add reason `'attestation_rejected'` in `src/lib/net/clientIdentity.ts`. G-REG: extend the wrong-attestation case in `client-identity.test.ts`. G-STD.
- **B20 (R-237) [OWNER picks set or delete]:** either set `ENV NEXT_PUBLIC_BUILD_VERSION=${GIT_COMMIT}` in the builder stage, or remove `buildVersion` end to end. G-REG in `client-error-report.test.ts` with a stubbed env. G-STD.
- **B21 (R-251):** `validateLocalization` requires non-empty `title_${loc}` / `name_${loc}` for non-default locales. G-REG: a mocked item missing `name_el` throws. `tsx scripts/validate-content.ts` passes on real content. G-STD.
- **B22 (R-253) [OWNER picks the full fix or the comment only]:** in `PwaManager.tsx`, register only the versioned URL and otherwise attach to the existing registration. G-STD plus `tests/unit/service-worker.test.ts`.
- **B23 (R-210):** the Toast GC keeps the same array when nothing expired, and the context value is memoized. Gates: `i18n-copy` test, G-STD. Manual check that toasts still dismiss after about 3 s.
- **B24 (R-271):** add try/catch plus `logger.warn` in `copyToClipboard`. G-REG: rejected `writeText` keeps the label 'Copy' and there is no unhandled rejection. G-STD.
- **B25 (R-272):** `WifiAccessCard.tsx:L72` uses `break-all` instead of `whitespace-nowrap`. G-VIS at 360 px and 1024 px, en and el, with 8, 20 and 63-character values, and no horizontal page scroll.
- **B26 (R-267): text only.** checkin.ts L181 en: "Your requested arrival time could not be confirmed. Any arrival time confirmed earlier, otherwise the standard check-in time, still applies." L257 el: "Η ώρα άφιξης που ζητήσατε δεν μπόρεσε να επιβεβαιωθεί. Ισχύει όποια ώρα σας είχε επιβεβαιωθεί νωρίτερα, αλλιώς η κανονική ώρα άφιξης." Gates: G-I18N, G-STD.
- **B27 (R-269):** new key `errors.claimTokenInvalid` in `PortalDictionary`. en: "This claim token is invalid, expired or already used. Ask your host for a new one." el: "Ο κωδικός ενεργοποίησης δεν είναι έγκυρος, έχει λήξει ή έχει ήδη χρησιμοποιηθεί. Ζητήστε νέο από τον οικοδεσπότη." Show it only on an exchange 401.
  - G-REG: a new `tests/components/guest-claim-errors.test.tsx` (signup mode, exchange 401 shows the new text, 429 keeps the rate-limit text). G-I18N, G-STD.
- **B28 (R-270): option (a), text only.** Guest text in portal.ts L83 en: "Access opens about 7 days before check-in and closes shortly after the check-out date"; L112 el: "Η πρόσβαση ανοίγει περίπου 7 ημέρες πριν την άφιξη και κλείνει λίγο μετά την ημερομηνία αναχώρησης". Admin texts in claim-grants/route.ts:L56, access-reset/route.ts:L55 and admin/guests/page.tsx:L556 append " (UTC calendar dates)". Gates: G-I18N, G-STD.
- **B29 (R-193) [OWNER policy]:** the recommended minimum is `sameRefreshContext` on the device hash only, plus one integration case (same device hash, different IP → `concurrent`, family intact), and a reword of docs/testing.md:L100. Gates: G-STD, `test:integration` (Docker).
- **B30 (R-196), optional:** upgrade a legacy PENDING request to VERIFIED, and map `ERASURE_REQUEST_NOT_VERIFIED` to 409. G-REG: a unit case where `findFirst` returns PENDING. G-STD.
- **B31 (R-170) [OWNER: option A (store first) or option B (fail closed at start)]:**
  - Option B: add a superRefine issue in `runtime-env-schema.js`, update `.env.example`, and put dummy values in the smoke env.
  - Option A: needs a migration, `update:prisma-integrity`, `EXPECTED_MIGRATION`, and UI filter changes.
  - Gates: G-STD, `smoke:image`, and for option A `test:integration`.
- **B32 (R-213): do only if R-173 keeps the travel feature.** Add `AbortSignal.timeout(8_000)` to the OSRM fetch, change the latch to a timed latch or remove it, then drop the periodic refresh. G-REG: fetch-mocked unit tests for timeout-then-retry, latch expiry and a cache hit with no refetch. G-STD.

**Dark-mode and CSS correctness** (G-VIS on every task)

- **B33 (R-187):** delete `05-primitives.css` L213-L227, set L205 to `color: var(--placeholder-color);`, and remove `--placeholder-color-soft` (01-tokens.css:L116). The check-in placeholder at 2.88:1 remains and is recorded for a separate decision.
- **B34 (R-188):** in `04-theme.css`, set `--action-bg: var(--brand-500); --action-bg-hover: var(--brand-600);` and correct the L52 comment. Screenshots include the admin login and the moments share button.
- **B35 (R-189):** delete `07-search-listing.css` L69-L75. Add dark `.search-label { color: var(--brand-700) }` and `.search-value { color: var(--fg-default) }`. Screenshots cover the resting, hover and active states and the ≤820 px layout.
- **B36 (R-190) [OWNER approves the new `--accent-600` token or literal hexes]:** set dark `.ready` to `var(--accent-300)` and use darker light-mode accents. Check the nights sub-line.
- **B37 (R-274):** add two dark `.moments-empty-action` rules after `10-moments.css:L674`.
- **B38 (R-275):** add `background: transparent` to dark `.btn-outline`. Record ErrorSummary and the iOS tip containers as a new R-ID; do not fix them here.
- **B39 (R-223, primary only):** `FavoritesClient.tsx:L37` uses `text-muted`. The secondary items stay as separate cosmetic tasks.
- **B40 (R-277a) [OWNER visual sign-off]:** dark `.booking-button:disabled` rule after L168.
- **B41 (R-278 task A):** delete `12-apartment-checkin.css` L620-L623 so that the transform transition applies again.
- **B42 (R-279, short term):** dark-prefixed `.checkin-status-*` and optional `.checkin-chip` / contact-social rules. Record the `<p>` override (12:L220) and dead rules (12:L544-L552) as a new R-ID.
- **B43 (R-282):** delete `01-tokens.css` L140-L149 and reduce L151-L158 to `[data-theme="light"] { color-scheme: light; }`. Verify with JS disabled and the OS in dark mode.
- **B44 (R-284):** delete the full-bleed declarations at `11-contact.css` L11-L13. Check that `scrollWidth === clientWidth` with classic scrollbars.

**Tooling and docs correctness**

- **B45 (R-245):** in `scripts/system-orchestrator.sh`, `write_state "none"` moves into `prepare_database`. Manual check: `system:bootstrap` then `system:down` stops site-dev-db, and the same after `db:migrate`.
- **B46 (R-246) [OWNER picks option A (offline message) or option B (pull)]:** in `scripts/test-nginx-ingress.sh`, the missing image gets a clear message, and the header check prints a fixed message and never echoes the secret. Add the Nginx image to the prerequisites in docs/release-verification.md. Gate: `test:nginx-ingress`.
- **B47 (R-256):** `scripts/ensure-pepper.js:L37` regex becomes `/^\s*SECURITY_PEPPER\s*=\s*\S/m`. G-REG in `tests/unit/ensure-pepper.test.ts`: an empty line yields a generated 64-hex pepper. G-STD.
- **B48 (R-180): docs only.** production-image-smoke.md gets "what it does not prove" and the tag-reuse ordering. scripts/README.md gets one sentence. Gate: diff limited to the docs.
- **B49 (R-254): docs only.** Add the two-role setup SQL block to scripts/README.md "Host layout", and "two-role migration/app setup untested" to the ADR gap list.
- **B50 (R-244, R-255): docs only.** Apply the corrections listed in both findings to README.md, scripts/README.md, docs/testing.md, deployment-target.md and .env.example. The real pepper minimums are 16 and 32; raising them is a separate **[OWNER]** decision.

**Tests**

- **B51 (R-198):** route tests for `admin/flags` (401, 422 for `{}` and for a non-boolean, 200 with the exact keys, GET 200), `admin/logout` (session id revoked, cleared cookie with `Max-Age=0`, no `updateMany` without a cookie) and `admin/guests` (422 for an unknown action or a missing bookingId, 404 for an unknown id, attachment header). Gate: G-STD.
- **B52 (R-248):** add the eight listed modules to `coverage.include` in `vitest.config.ts` and run `test:coverage` under Node 22.19. Lower thresholds only to the measured values minus a margin, and only if needed; optional per-file thresholds. No production code changes.
- **B53 (R-259):** theft-signal assertions in `refresh-overlap-classification.test.ts` and the deterministic L549-L550 case. Gate: `test:integration` (Docker).
- **B54 (R-260):** `securityAuditEvent.deleteMany()` in `resetAuthFixtures`. Gate: `test:integration`.
- **B55 (R-261):** re-route the eligibility matrix through a `beforeClaim` hook and add the two post-exchange cases. Gate: `test:integration`.
- **B56 (R-263):** record per-test durations first, then add `600_000` timeouts to the A2 and A3 loops. Gate: `test:integration`.

### Group C: Legal additions

The legal gaps come from the legal section. Owner data is required where shown as `<…>`. All new strings go in both locales, typed `Record<Locale, …>` so that the i18n-parity test enforces them.

- **L1 (R-174 parts 1–2; legal rows 1–2): registration number and host identity.**
  - In `src/data/contact.ts`, add `HOST_CONTACT.legalName: '<owner full name>'` and `HOST_CONTACT.registrationNumber: '<ΑΜΑ, or ΕΣΛ/ΜΗΤΕ number if licensed>'`.
  - New domain `src/i18n/domains/legal.ts`, registered in `domains/index.ts`, with the keys:
    - `registrationLabel`: en "Property Registration Number (AMA)", el "Αριθμός Μητρώου Ακινήτου (ΑΜΑ)".
    - `hostLabel`: en "Host", el "Οικοδεσπότης".
  - Render on `/[locale]/apartment` (the ApartmentCinematic footer next to house.ts L78/L136), the `/[locale]/book` property card, `/[locale]/booking-details`, and ContactSection.
  - Add an ΑΦΜ only if the owner confirms VAT liability.
  - Offline: the owner adds the number to the Instagram profile too.
  - Gates: G-I18N, G-STD, G-VIS for the four pages en/el, and a component test asserting that the number renders on /book.
- **L2 (R-174 part 3, R-186 page part; legal rows 3, 5–7): static privacy notice.**
  - New route `src/app/[locale]/privacy/page.tsx` with `generateMetadata` and `localizedAlternates`, like about/page.tsx.
  - Content lives under `legal.privacy` in `src/i18n/domains/legal.ts`, with these sections:
    - `controller`: legalName, address Αρχιμήδους 21, 24100 Καλαμάτα, e-mail and phone from HOST_CONTACT.
    - `purposes` and `legalBases`: booking request and portal under 6(1)(b); tax obligations (Short-Term Stay Declaration, ΤΑΚΚ receipt) under 6(1)(c); security logging and rate-limit hashes under 6(1)(f).
    - `recipients`: hosting provider <Netcup, confirm>; Cloudflare (US, EU-US DPF plus SCCs); OpenStreetMap Foundation tiles (UK/NL via Fastly); CARTO dark-theme tiles; OSRM demo server run by FOSSGIS e.V. (Germany), unless R-173 removes it; the named webhook receivers `<owner names them>`; the alert webhook.
    - `location`: the "Locate me" button makes the map request tiles around the visitor's position, so the tile provider sees the approximate location and IP.
    - `retention`: the values from runRetention (sessions 7 days after expiry, refresh tokens 30 days, security events 90 days, outbox 30 days) plus the N chosen in L5.
    - `rights`: access, rectification, erasure, restriction, objection, portability, exercised via HOST_CONTACT.email, with a reply within one month (extendable by two).
    - `complaint`: ΑΠΔΠΧ, Λ. Κηφισίας 1-3, 115 23 Αθήνα, www.dpa.gr.
    - `storage`: HttpOnly session cookies `guest_session`, `guest_rt`, `admin_jwt`; localStorage keys `theme`, `favorites:v1`, `leaflet:apartment-map`, the PwaManager keys, `apartmentGalleryLastIndex` and the session-signal fallback; the service-worker offline cache of visited public pages; the statement "no analytics or advertising trackers".
  - Add the page to `src/app/sitemap.ts`. No banner.
  - Wording must be owner-approved, ideally by a lawyer.
  - Gates: G-I18N, G-STD, a route or component test that /en/privacy and /el/privacy render the controller name, and the sitemap test if one exists.
- **L3 (R-186, R-174 link part, R-171 part 3): links and sign-up text. Depends on L2.**
  - New key `privacyLink` in booking.ts: en "Privacy notice", el "Ενημέρωση για την προστασία δεδομένων". Render it next to the `terms` paragraph (booking.ts L127/L215; BookingForm.tsx L299-L302).
  - In `src/lib/guestTermsText.ts`, reword `GUEST_TERMS_TEXT`:
    - en: "I confirm my details are correct and have read the privacy notice."
    - el: "Επιβεβαιώνω ότι τα στοιχεία μου είναι σωστά και έχω διαβάσει την ενημέρωση για την προστασία δεδομένων."
    - Bump `GUEST_TERMS_VERSION` from '2026-09-24' in the same diff.
  - Put the link in a sibling element **outside** the `<span>{GUEST_TERMS_TEXT[locale]}</span>` in UnifiedGuestClient.tsx L284-L289.
  - Add a link in menuLinks.ts and ContactSection.
  - After L5 decides N, add one retention sentence to `terms`: en "Requests are kept for <N> months after the stay and then deleted." el "Τα αιτήματα διατηρούνται για <N> μήνες μετά τη διαμονή και έπειτα διαγράφονται."
  - Gates: G-I18N, G-STD, `tests/components/guest-terms.test.tsx` passing (the hash is recomputed from the constants; the L24 matcher still matches the full text node), and a component test that the link points to `/${locale}/privacy`.
- **L4 (R-167 part 1, R-171 part 2): admin erase for enquiry-only StayRequests.**
  - Extract privacyService L124-L149 into a module-private `redactStayRequest(tx, id)`, used by both paths.
  - Add `eraseStayRequestByAdmin(id, auditNote)`: Serializable, with the same LEASED-delivery check as L96-L106.
  - Add an `erase` action to the PATCH enum in `admin/stay-requests/[id]/route.ts`. It bypasses the CLOSED guard at L25 and adds `isSameOriginRequest`.
  - Add `'stay_request'` to `privacySubjectDigest`, and a confirm dialog in AdminStayRequestsClient.
  - G-REG in `tests/routes/admin-dead-outbox-actions.test.ts`: erase on OPEN and on CLOSED requests (PII redacted, audit event with the digest). G-STD.
- **L5 (R-167 part 2, R-171 part 1) [OWNER sets N; 12 months suggested]: retention.**
  - Append to the **end** of the runRetention tuple:
    - `stayRequest.deleteMany({ where: { status: { in: ['DELIVERED','CLOSED'] }, endDate: { lt: days(N) } } })`
    - `checkInRequest.updateMany({ where: { booking: { endDate: { lt: days(N) } } }, data: { guestName: null, guestEmail: null, guestPhone: null, message: null } })`
  - Gates: G-REG unit cases for both where-clauses with the existing index assertions unchanged, G-STD, and `test:integration` (outbox SetNull).
  - Also confirm with the accountant that tax retention (art. 17(3)(b)) does not require a longer N.
- **L6 (legal gap: ΤΑΚΚ, no R-ID yet) [OWNER + accountant confirm the amounts on the day]:** add one sentence to booking.ts `detailsPage.availability` using the **corrected** amounts.
  - en: "A climate resilience fee set by Greek law (currently €8 per night April–October and €2 per night November–March) is paid to the host before departure and is not included in any quoted price."
  - el: "Το τέλος ανθεκτικότητας στην κλιματική κρίση που ορίζει ο νόμος (σήμερα 8 € ανά διανυκτέρευση Απρίλιο–Οκτώβριο και 2 € Νοέμβριο–Μάρτιο) καταβάλλεται στον οικοδεσπότη πριν την αναχώρηση και δεν περιλαμβάνεται στην τιμή."
  - Gates: G-I18N, G-STD.
- **L7 (legal gap: consumer information, no R-ID yet) [OWNER confirms the policy matches the Airbnb listing]:** add two points to booking.ts `detailsPage.cancellation` (L164-L168 / L252-L256).
  - en: "For stays on fixed dates the 14-day right of withdrawal does not apply (Law 2251/1994, art. 3ιβ); the cancellation policy above applies." and "The final price, including all fees (e.g. the climate resilience fee), is stated in the host's written confirmation."
  - el: "Για διαμονή με συγκεκριμένες ημερομηνίες δεν ισχύει το 14ήμερο δικαίωμα υπαναχώρησης (ν. 2251/1994 άρθ. 3ιβ)· ισχύει η παραπάνω πολιτική ακύρωσης." and "Η τελική τιμή, συμπεριλαμβανομένων όλων των τελών (π.χ. τέλος ανθεκτικότητας στην κλιματική κρίση), αναγράφεται στη γραπτή επιβεβαίωση του οικοδεσπότη."
  - Optional ADR line (Consumer Ombudsman) in the same section.
  - Gates: G-I18N, G-STD.
- **L8 (R-195) [OWNER, two independent decisions]:**
  - (a) Keep `externalReference` on erasure by removing privacyService.ts L165. Update the unit expectation.
  - (b) Keep TermsAcceptance after erasure. This needs a forward migration (`userId String?`, `onDelete: SetNull`), `update:prisma-integrity`, `EXPECTED_MIGRATION`, and the upsert adjustment.
  - Document the choice in a comment next to L160-L169.
  - Gates: G-STD. For (b) also `test:integration`.
- **L9 (R-173) [OWNER: option A remove travel chips (recommended), B self-hosted/paid router with a Dockerfile ARG, C accept and document]:**
  - For option A, delete exactly the files and keys listed in R-173, keep the Google Directions link, remove the osrmOrigin CSP entry, and update tests.
  - Gates: G-STD, `tests/security/csp-osrm-origin.test.ts` (updated or deleted), G-VIS on /en/moments.
  - R-212 (a)–(g) and R-213 depend on this decision.
- **L10 (optional, ν. 5170/2025 complement):** in `CheckInInfo.tsx:L414`, replace `nearbyServices.slice(0, 2)` with the items tagged `emergency`. Add bilingual phones.json entries for 166, 199, 100, 108, 1056 and the Poison Centre (+30 210 7793777). Gates: G-STD, a component test listing the emergency entries.
- **L11 (optional) [OWNER + accountant]: marketing wording.**
  - Reword about.ts:L48-L49 "Personal Service" towards host availability.
  - Review "Luggage storage" (apartmentData.ts:L34, L41).
  - Change booking.ts L175/L263 "Available for instant booking" to "For quick contact" / "Για γρήγορη επικοινωνία".
  - Gates: G-I18N, G-STD.
- **Need a new R-ID in REVIEW.md before any task (not fixed here):**
  - CARTO API-key terms.
  - OSM tile URL `{s}.` and the attribution link.
  - `User.countryOrigin` minimisation.
  - The Airbnb off-platform direct-booking CTA (SUSPECTED).
  - ErrorSummary and the iOS tip in dark mode (from R-275).
  - The check-in `<p>` colour override (from R-279).
  - The admin claim-token copy missing a catch (from R-271).
  - IPv6 /64 grouping for the rate limiter (from R-177).

### Group D: Cleanup (unused / redundant)

Each item is its own task. Every "unused" deletion must quote the reference search from the finding in its report. Gates on every item: G-STD plus the named tests.

- **D1 (R-219, R-220):** delete `search.addDates` (common.ts:31/181/361) and `house.photoViewer.counter` (house.ts:30/112/170). Tests: `i18n-parity`, `apartment-copy`.
- **D2 (R-217):** remove the three `.leaflet-origin-marker` selector lines in 08-vendor.css. G-VIS on the map, light and dark.
- **D3 (R-250):** drop `:not(.btn-accent)`, `:not(.btn-secondary)` and `:not(.guide-option-card)` from the 09 selectors, and delete `.guide-option-title,` (12:L562). Dark-mode spot check.
- **D4 (R-280):** the listed unused custom properties and selectors, keeping the tokens the finding lists. Coordinate with D3 and B33.
- **D5 (R-276):** delete the dead dark body gradient (04:L60-L61) and `body[data-theme="dark"]` (05:L236).
- **D6 (R-277b):** delete the dead non-ready hover rules (07:L136-L140, L170-L172).
- **D7 (R-278 task B):** remove the duplicated apartment rules in 12:L571-L638 as specified. **[OWNER]** chooses which dark `--depth` shadow set to keep. G-VIS on /apartment.
- **D8 (R-214):** delete the dead `generateStaticParams` and `dynamic` exports and the orphaned imports. `npm run build` shows no prerender change.
- **D9 (R-216) [OWNER: are star ratings planned?]:** two tasks, (a) `rating` and (b) `updatedAt`/badge, each with typecheck, `i18n-parity` and `data-map-navigation`.
- **D10 (R-222 part a):** mechanical `?.` and `!` removal on the required dictionary keys. Part (b) is merged into D11.
- **D11 (R-224, several patches a–h as listed; R-222 part b):**
  - Tests: `accessibility-interactions` (update the ThemeToggle renders), `i18n-copy`, and knip.
  - G-VIS/SSR diff for phones, moments, book, favorites and a detail page.
- **D12 (R-225):** remove `'unsafe-inline'` from the production `scriptSrc`, and remove the stale comment.
- **D13 (R-226, R-228 part 1):** CORS `allowedHeaders: ['Content-Type','Idempotency-Key']` and `methods: ['GET','POST','PATCH','OPTIONS']` in both configs.
- **D14 (R-228 part 2):** remove the unused `SecurityEvent.userAgent` and its handleCSPViolation plumbing.
- **D15 (R-229):** delete `RateLimitError`, the Retry-After block and `rateLimitConfig`. The optional `remaining`/`resetAt` removal is a separate step.
- **D16 (R-230):** remove `enableRequestLogging`, `redactHeaders` and `SENSITIVE_HEADER_NAMES`, trim `header-redaction.test.ts`, and drop row L27 of trusted-ingress.md. Note that R-226 says to keep `SENSITIVE_HEADER_NAMES`, but that no longer applies once `redactHeaders` is gone. The report must state the reference search.
- **D17 (R-231, R-238):** remove the four unused `ApiErrorCode` members, their status-map rows and the two HttpStatusCodes entries. `processingTime` is removed too, `meta.version` is kept.
- **D18 (R-205):** pass `url` into notifyAlert and delete the unreachable branch.
- **D19 (R-194):** use `redirect: 'error'`, drop the followed-redirect branch, and update `portal-refresh-client.test.ts`.
- **D20 (R-262) [OWNER: delete or keep and fix the test]:** `evaluateHistoricalFindings`. Gate: `test:secret-scanning`.
- **D21 (R-203) step 1 only:** render `externalReference || reference || id` in admin/guests/page.tsx:L541. Step 2 (column drop) waits for the production count checkpoint (O15).
- **D22 (R-258):** docs rewrite of release-verification.md:L90-L92. Removing the override block **[OWNER]** needs `npm install` approval.
- **D23 (R-211) [OWNER]:** remove `leaflet.markercluster`, following the finding's list. Needs `npm install` approval to update the lockfile. G-VIS on the maps.
- **D24 (R-243) [OWNER]:** remove the Lighthouse chain as listed. Needs `npm install` approval. Gates: `check:dead-code`, `security:license-check`, `verify:release`.
- **D25 (R-202, R-286) [OWNER: decline or do all 16 sites together]:** zod top-level string formats. If accepted, it is one task with the finding's test list.
- **D26 (R-283), optional [OWNER]:** shared status tokens and button colour grouping. Computed styles and screenshots must be identical.
- **D27 (R-236), optional [OWNER]:** extend the `no-internal-fetch` rule. Needs an approved disable comment at StatusCluster.tsx:L102.
- **No task:** R-172 (no change warranted at this scale), R-207 (verifier disagreement; no change unless LAN dev is enabled).

### Group E: Simplification (overengineering)

All tasks here are **[OWNER]**, because each one removes a guard or a documented option.

- **E1 (R-235, R-234):** delete the Prisma idle auto-disconnect machinery and the argv heuristics. Remove `PRISMA_AUTO_DISCONNECT` and `PRISMA_IDLE_DISCONNECT_MS` from the schema and `.env.example`, and reword the worker docs.
  - Gates: G-STD, `worker-disconnect`, `validate:release-policy`, `test:release-policy`.
  - Time a local `outbox:drain` (≈1 s exit).
- **E2 (R-233):** delete `api-security-middleware.ts` and its config, with the explicit `maxBytes` and diagnostic follow-ups listed in the finding.
  - Gates: G-STD, full suite, and a retargeted `security-diagnostics.test.ts` (415 with a JSON envelope).
  - This is a behaviour change: 401/403 now come before 415.
- **E3 (R-179):** replace the Dockerfile runtime-closure analyzer with the short runner-stage checks. Make `smoke:image` mandatory in the scripts/README release sequence and update docs/release-verification.md.
  - Gates: `validate:release-policy`, `test:release-policy`, `verify:release`.
- **E4 (R-212 a–g):** seven separate tasks, one per sub-item. Each depends on the L9 decision; skip them if the travel feature is removed.
  - Update after R3-P1 (travel removed, O24): (b), (c), (d), (g) and the travel part of (a) are closed. (a) auto-fit/refit flags, (e) and (f) do not depend on travel and stay open (PROGRESS.md O31); their gates are G-STD and knip, since `csp-osrm-origin` no longer exists.
  - Gates: `csp-osrm-origin`, `core-utilities`, knip.
  - Manual check on /en/moments.
- **E5 (R-249):** (a) delete the forbidden-target list only; (b) is optional; keep (c).
  - Gates: `validate:release-policy`, `test:release-policy`, `npm test`, `test:integration`, `verify:release`.
- **E6 (R-252):** remove `LOG_PERFORMANCE` and the performance block as listed.
  - Gates: G-STD and `release-policy.test.mjs`.
- **E7 (R-242):** use the exported `SUPPORTED_NEXT_VERSION` in `secret-scanning.test.mjs:456`. The gate-3 equality check with package.json is optional.
  - Gates: `test:secret-scanning`, `validate:release-policy`.
- **E8 (R-281):** comment only, above 01-tokens.css:L91. Moving the values into a `@theme` block is optional.
- **No task now:**
  - R-240: record it as an owner option.
  - R-239: verifier disagreement; owner decision, not a defect fix.

### Group F: Nits (one grouped task)

- **N1 (R-285, R-287, R-288, R-289, R-290, R-291, R-292, R-293, R-294, R-295, R-296, R-297, R-298, R-299, R-247).** Apply each item's corrected fix exactly as written in REVIEW.md.
  - These items stay **excluded** unless the owner opts in:
    - R-288 item 12 (the proxy matcher change needs the early return, or `/sw.js`, robots and sitemap break).
    - R-294 (leave as is).
    - R-296 (keep as a documented test seam).
    - R-295 and R-290(d) (integration-only).
    - R-247 (defer with the Puppeteer 25 upgrade).
  - Keep items in separate commits by the owner for reviewability.
  - Gates: G-STD, `tests/routes/admin-refresh.test.ts`, `guest-data-export`, `apartment-copy`, `admin-requests-retry`, `admin-dead-outbox-actions`, `checkin-wifi` and `build-workers`.
  - If R-288 item 12 is included, a live check that `/sw.js` answers 200 with no redirect.
  - If R-290(d) or R-295 is included, `test:integration`.
  - R-298 Wi-Fi time must not combine `timeZoneName` with `dateStyle`/`timeStyle` (that throws a RangeError).

Task IDs in this plan (A…, B…, L…, D…) are local to Review 3. They will be prefixed `R3-` when approved tasks are copied into PROGRESS.md, so that they do not collide with the Review 2 task IDs there.

---

# Review 2: bugs, functional gaps and missing features

Repository: `qr-city-guide` @ `main` `e19facc`. Review date: 2026-09-24.
Scope: "does every feature work, what is broken, what is missing". The first review (R-001…R-103, see PROGRESS.md and `git show bd50a80:REVIEW.md`) covered legacy/unused/redundant code; its open items are not repeated here. IDs continue at R-104.

## Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 9 |
| Medium | 21 |
| Low | 30 |
| Nit | 1 group |

**Baseline (Node 22.19.0, npm 11.18.0):** `typecheck` clean, `lint -- --max-warnings=0` clean, `lint:security` clean, `npm test` 35 files / 353 tests passed. Shell default Node is 26.8.1 (`~/.local/bin/node`); everything below was run under 22.19.0.

**Method.**
1. Six review sub-agents read the code module by module (guest auth, admin, booking/check-in/outbox, public guide/i18n/PWA, infra/security, data layer/ops). Their evidence is reproduced below.
2. The lead ran the application locally (dev profile, disposable Docker PostgreSQL, simulated Nginx identity headers, a local webhook receiver) and exercised every user journey with HTTP probes and headless Chrome. See "Smoke test log" at the end.

**Status legend.** CONFIRMED = verified by reading every relevant code path or by running it. SUSPECTED = plausible, with a "To confirm" step.
**Verification legend.** LEAD = reproduced/re-read independently by the lead (command or file shown). AGENT = sub-agent evidence; lines marked "(lines re-read)" were spot-checked by the lead.

### Main themes
1. **Two production-blocking bugs in the guest onboarding path.** The admin "Issue claim" button is rejected as cross-origin for every real browser request (R-104), and no code path creates a `Booking` at all (R-105). Together they mean the guest portal cannot be used from the UI.
2. **Calendar dates modelled as instants.** Booking dates are stored one day early whenever the Node process runs east of UTC (R-106; reproduced end to end on this machine), and the date picker's first click produces a same-day range that the UI accepts (R-109).
3. **Absolute URLs built from the server bind host.** The silent session refresh always ends on the sign-in page because the 302 `Location` uses `0.0.0.0:3000` / `127.0.0.1:3000` instead of the public origin (R-108); the same mechanism causes R-104.
4. **Local development cannot exercise any write path.** The documented `system:up` dies silently before starting the app (R-107), and without the Nginx identity headers every sensitive route answers 503 (R-114), logged only at debug level.
5. **Production-only hardening that breaks the product.** COEP `require-corp` blocks the map tiles (R-111), the CSP report endpoint rejects every real browser report (R-110), and the service worker precaches a redirect and can never refresh its HTML shells (R-112, R-113).
6. Many smaller i18n, UX and admin-tooling gaps (Medium/Low).

### Areas reviewed
- All of `src/` (app routes, lib, components, i18n, data), `public/sw.js`, `public/app.webmanifest`, `prisma/` (schema + 14 migrations), `scripts/` (orchestrator, workers, standalone helpers, release gate order), `docker/`, `deploy/`, `docs/`, README/SECURITY.
- Live: 34 sitemap URLs + 40 other paths (status codes), 15 pages in headless Chrome (console errors, CSP violations, broken images, hydration), admin UI (login, all 7 pages, Issue claim), guest UI (sign-in, check-in, silent refresh, sign-out), booking UI (date picker, form submit), 60+ API calls (auth, claims, refresh/replay, booking, check-in, admin mutations), both workers.

### Areas NOT reviewed
- A production build/start (`next build` + standalone) was not run; findings that depend on production-only config (R-108 production impact, R-110, R-111, R-112, R-113) are verified by code reading plus mechanism tests, not against the production bundle.
- `scripts/lib/release-policy.mjs` internals, `scripts/tests/*` bodies, secret-scanning tooling, `tests/integration/*` (Docker suite not run).
- Visual/CSS review beyond four screenshots (all rendered correctly, including the date picker despite R-090).
- systemd/Linux behaviour (R-125, R-132) was not run on a systemd host.

### What works (exercised end to end, no defect found)
- Public guide: every sitemap URL (34) and every route-tree path returns the expected status in both locales; `/` → `/en` (302, `lang` cookie), `/en/house` → `/en/apartment` (308), unknown slugs → 404; pages hydrate without console errors, CSP violations, hydration warnings or broken images (on `localhost`; see Nits for `127.0.0.1`).
- Health (`/api/health/live`, `/ready` with migration check), `robots.txt`, `sitemap.xml`, `app.webmanifest`, `sw.js`, `version.json`, precache lists, `/api/docs` and `/api/docs/openapi`.
- Admin: login (401 wrong / 200 right, cookie flags correct), every admin page renders with live data, `/api/admin/refresh`, all admin GET endpoints, check-in request approve/reject with webhook events, logout.
- Guest auth: claim-exchange (401 bad token, 200 good), claim (422 without terms, 200 with cookies), consumed token rejected, sibling grant revoked on re-issue, `/en/check-in` gated correctly, session verification, refresh rotation (302 + new cookies), replay of the old refresh token → 401 and family revoked, sign-in with international and national phone formats, wrong password → 401, rate limit → 429, logout → 204 and cookies cleared.
- Booking API: 503 without identity, 400 without `Idempotency-Key`, 422 invalid range, 202 on create, 200 on idempotent replay; outbox row created in the same write; immediate delivery to the webhook with `Authorization: Bearer` and `Idempotency-Key: <eventId>`; stay request marked `DELIVERED`; the booking form submits and shows the confirmation.
- Check-in: preferences GET (Wi-Fi revealed 24 h before check-in), arrival request create → admin sees it → approve/reject → three webhook events → guest sees the decision.
- Workers: `drain-outbox` and `run-operational-maintenance` run against the dev DB and exit in 1 s (with `PRISMA_AUTO_DISCONNECT` unset; see R-125).

---

## Critical

### R-104: Admin "Issue claim" is rejected as cross-origin for every real browser request
- Severity: Critical
- Category: Bug
- Status: CONFIRMED (LEAD: API with browser-like `Origin` headers and a real click in headless Chrome; production origin per AGENT reading of Next internals)
- Location: src/app/api/admin/bookings/[id]/claim-grants/route.ts:L23-L26; src/lib/security-middleware-edge.ts:L163-L185 (the Host-aware check this route lacks); package.json:L22 (`next dev -H 0.0.0.0`); scripts/system-orchestrator.sh:L832 and deploy/systemd/qr-city-guide.service:L13-L14 (`HOSTNAME=127.0.0.1`); deploy/nginx/nginx.conf.template:L93-L94
- Evidence:
  ```ts
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Cross-origin admin mutation rejected');
  }
  ```
  Live (dev, server bound to 0.0.0.0, admin cookie + identity headers):
  ```
  Origin: http://localhost:3000  -> 403 {"code":"FORBIDDEN","message":"Cross-origin admin mutation rejected"}
  Origin: http://127.0.0.1:3000  -> 403 (same)
  Origin: http://0.0.0.0:3000    -> 201 {"claimToken":"claim_…"}
  no Origin header               -> 201
  ```
  Headless Chrome on http://localhost:3000/admin/guests, click "Issue claim":
  `403 POST /api/admin/bookings/1826a63a-…/claim-grants origin=http://localhost:3000` and the page shows "Cross-origin admin mutation rejected".
  Why `nextUrl.origin` is the bind host (AGENT, node_modules/next 16.3.6): `server/next-server.js:1278-1281` builds `initURL` as `${protocol}://${this.fetchHostname}:${this.port}${req.url}` whenever a hostname is configured; `web/next-url.js:15-20` normalises `127.0.0.1` to `localhost`. With `HOSTNAME=127.0.0.1` and Nginx `X-Forwarded-Proto https`, production yields `https://localhost:3000`, never the public host. The edge CORS middleware (`security-middleware-edge.ts:165-172`) already compensates with the `Host` header; this route does not.
- Problem: Browsers send `Origin` on every POST, including same-origin ones. The strict comparison against the bind-host origin therefore fails for every UI request.
- Impact: No `BookingClaimGrant` can be issued from the admin UI, locally or in production. The whole guest onboarding path (admin issues token → guest claims) is blocked from the UI; only a header-less API call (curl) works.
- Fix: Reuse the Host-aware comparison from `CORSMiddleware.isOriginAllowed` (compare `new URL(origin).host` with the `host` header and the protocol with trusted `x-forwarded-proto`), extracted into a shared helper; or drop the route-level check, since `src/proxy.ts:25` already applies the CORS origin check to every `/api/*` request and `admin_jwt` is `SameSite=Strict`.
- Fix risk: `tests/security/claim-token-transport.test.ts:191-213` asserts on this file's source; keep it green. Add a route test with `Origin: https://guide.example`, `Host: guide.example`, `x-forwarded-proto: https` and request URL `https://localhost:3000/…` expecting 201, plus a mismatching host expecting 403.

## High

### R-105: Nothing creates `Booking` rows, so the guest portal cannot be used without manual SQL
- Severity: High
- Category: Functional gap
- Status: CONFIRMED (LEAD)
- Location: src/app/admin/guests/page.tsx (no create action); src/app/api/admin/** (no booking POST); prisma/schema.prisma `model Booking`
- Evidence:
  ```
  $ grep -rnE 'booking\.(create|upsert|createMany)\(|INSERT INTO "?bookings' src scripts prisma/migrations --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.sql'
  (no matches; the only hits for "booking.*create" are `createdAt` reads)
  $ grep -rniE 'create booking|new booking|add booking|createBooking' src
  (no matches)
  ```
  The smoke test could only proceed after `INSERT INTO bookings (…) VALUES (…)` in psql; the admin UI then showed the booking and offered "Issue claim".
- Problem: Every guest flow starts from a `Booking` (claim grant → claim → check-in eligibility window), but no UI, API route, worker or import script writes one. This extends the open owner question R-008 ("how are Booking rows created in production?") from a cleanup question to a missing feature.
- Impact: In production the host cannot onboard a guest without database access.
- Fix: Add an admin form + `POST /api/admin/bookings` (dates, source, external reference) with the same admin-session and origin checks as `claim-grants`, or document the intended external import path and provide the script.
- Fix risk: New write path; must respect `bookings_provider_external_reference_key` and the eligibility window; add route tests.

### R-106: Booking dates are stored one day early when the Node process runs east of UTC
- Severity: High (Critical on any production host whose process time zone is not UTC)
- Category: Data integrity
- Status: CONFIRMED (LEAD: reproduced end to end in the UI on this machine, TZ Europe/Athens; AGENT code trace)
- Location: src/lib/dateUtils.ts:L26-L29; src/app/[locale]/book/page.tsx:L58-L61; src/components/BookingForm.tsx:L89-L92; src/app/api/booking-requests/route.ts:L26-L29,L110-L111; prisma/schema.prisma (`StayRequest.startDate/endDate @db.Date`)
- Evidence:
  ```ts
  // dateUtils.ts L28 (runs on the SERVER in book/page.tsx) -> server-LOCAL midnight
  const parsed = parse(dateString, formatString, new Date());
  // BookingForm.tsx L90-91 -> same instant as ISO
  from: dateRange.from?.toISOString(), to: dateRange.to?.toISOString(),
  // route.ts L110-111 -> DATE column gets the UTC date of that instant
  startDate: new Date(parsed.data.dateRange.from), endDate: new Date(parsed.data.dateRange.to),
  ```
  Live: opened `/en/book?checkin=2026-11-01&checkout=2026-11-05`, page and confirmation both show "Nov 1 – 5, 2026 • 4 nights"; the API returned 202; the database row:
  ```
  select start_date, end_date from stay_requests order by created_at desc limit 1;
  2026-10-31 | 2026-11-04
  ```
  `node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"` → `Europe/Athens`. No `TZ` is pinned in deploy/, docker/ or the systemd installer.
- Problem: A calendar date is parsed into server-local midnight, shipped as an instant and reduced to its UTC date on write. With a positive UTC offset the stored dates are the previous day; the UI keeps showing the intended dates, so nobody notices.
- Impact: Wrong stay dates in `stay_requests`, in the webhook payload the host receives (`request: event.stayRequest`) and in `/admin/stay-requests`. The Docker image (TZ unset → UTC) is unaffected; a host-based deployment in Europe/Athens is affected on every request.
- Fix: Transport calendar dates as strings end to end: `BookingForm` sends `format(date, 'yyyy-MM-dd')`, the Zod schema validates `/^\d{4}-\d{2}-\d{2}$/`, the route stores `new Date(\`${value}T00:00:00.000Z\`)`. Defence in depth: `Environment=TZ=UTC` in the systemd units and `TZ=UTC` in the Dockerfile.
- Fix risk: Payload shape changes; update `tests/security/client-identity-route-regression.test.ts:L211-213`; keep the `to > from` check and `stay_requests_dates_check`. Also fixes R-124.

### R-107: `npm run system:up -- --profile development` exits silently before starting the app
- Severity: High
- Category: Bug
- Status: CONFIRMED (LEAD: ran it; minimal repro)
- Location: scripts/system-orchestrator.sh:L2 (`set -euo pipefail`), L813-L815, L881 (caller in `start_app`)
- Evidence:
  ```bash
  validate_standalone_runtime_tree() {
    [[ "$PROFILE" == "production" ]] || return
  ```
  Run: after "Migrations completed successfully" the script exits with status 1 and no message; `.runtime/system/` is created but contains no `app.pid`, `state.env` or `app.log`; nothing listens on :3000.
  ```
  $ bash -c 'set -euo pipefail; f(){ [[ development == production ]] || return; echo body; }; g(){ echo before; f; echo after; }; g'
  before
  (exit 1)
  ```
  `git blame -L 814` → commit 51cc9255 (2026-07-15): the development profile has been unable to start through the orchestrator since then.
- Problem: A bare `return` after `||` returns the status of the failed `[[ ]]` test (1); under `set -e` the script dies inside `start_app` before `nohup … npm run dev`.
- Impact: The documented quick start (README, scripts/README.md) never starts the app in development; `verify_runtime` and `system:status/down` never get a state file. `--profile production` is unaffected (the test is true).
- Fix: `[[ "$PROFILE" == "production" ]] || return 0`.
- Fix risk: None. Add `bash -n` is not enough; run `system:up --profile development --skip-build` once and check `.runtime/system/app.pid`.

### R-108: Silent session refresh always ends on the sign-in page: the 302 `Location` uses the server bind host
- Severity: High
- Category: Bug
- Status: CONFIRMED (LEAD: reproduced in headless Chrome; production origin per the same Next internals as R-104)
- Location: src/app/api/portal/refresh/route.ts:L133-L136; src/lib/portalRefreshClient.ts:L83-L99; src/components/PortalRefreshRedirect.tsx:L27-L36; src/app/[locale]/check-in/page.tsx:L57-L68
- Evidence:
  ```ts
  // refresh/route.ts
  const redirectResponse = NextResponse.redirect(new URL(nextParam, req.url), 302);
  // portalRefreshClient.ts
  const response = await fetch(safeRefreshHref, { method: 'POST', credentials: 'same-origin', redirect: 'follow', … });
  …
  if (!response.ok) return { status: 'failed' };
  ```
  API: `POST /api/portal/refresh?next=/en/check-in` → `302`, `location: http://0.0.0.0:3000/en/check-in`, new `guest_session`/`guest_rt` cookies.
  Browser (signed-in guest, `guest_session` deleted to simulate the 2 h JWT expiry, `guest_rt` kept): `/en/check-in` → 307 `/en/portal/refresh?…` → `302 POST /api/portal/refresh` → `400 OPTIONS http://0.0.0.0:3000/en/check-in` → console: "Access to fetch at 'http://0.0.0.0:3000/en/check-in' (redirected from …/api/portal/refresh…) has been blocked by CORS policy" → final URL `/en/guest?flash=Please+sign+in+to+access+check-in+information`. Immediately afterwards a direct `GET /en/check-in` returned 200: the cookies had been rotated successfully.
- Problem: `req.url` in a route handler is Next's `initURL`, built from the configured bind hostname (`0.0.0.0` in dev, `127.0.0.1`/`localhost` behind Nginx), not from the `Host` header. The browser follows the redirect cross-origin, fails, and the client treats the refresh as failed although the new credentials were set.
- Impact: Every guest whose 2 h session expired while the 7-day "remember me" token is still valid is bounced to the sign-in form with "Please sign in…" although they are signed in; navigating to `/check-in` by hand works. The remember-me feature is effectively broken.
- Fix: Return a relative redirect (`new NextResponse(null, { status: 302, headers: { location: nextParam } })`) or, simpler, never redirect from the API: return 200 JSON and let `portalRefreshClient` navigate to `safeNextHref` (it already does when `response.redirected` is false).
- Fix risk: `tests/security/portal-refresh-client.test.ts` covers the follow branch; adjust. Verify with the browser flow above.

### R-109: One click in the date picker selects a same-day range, closes the calendar and enables "Check availability" with 0 nights
- Severity: High
- Category: Bug
- Status: CONFIRMED (LEAD: reproduced in headless Chrome; AGENT: react-day-picker 9.14.0 `addToRange`)
- Location: src/components/DateRangePicker.tsx:L84-L108,L248-L260 (no `min` prop); src/components/SearchBar.tsx:L214,L264; src/app/[locale]/book/page.tsx:L65,L129-L141; node_modules/react-day-picker/dist/esm/utils/addToRange.js:L15-L21
- Evidence:
  ```js
  // addToRange.js (min defaults to 0)
  if (!from && !to) { range = { from: date, to: min > 0 ? undefined : date }; }
  ```
  ```ts
  // SearchBar.tsx
  const hasValidDates = state.dateRange?.from && state.dateRange?.to;   // same day passes
  ```
  Browser on `/en`: click "Arrival", click one day → picker closed, bar text `ARRIVAL Sep 27, 2026 DEPARTURE Sep 27, 2026 Check availability 0 nights`, CTA `disabled:false`; clicking it → `/en/book?checkin=2026-09-27&checkout=2026-09-27` → "⚠️ Check-out must be after check-in".
- Problem: The first click yields `{from: X, to: X}`; the picker auto-closes after 500 ms on a "complete" range; the CTA gate does not require ≥ 1 night.
- Impact: The first interaction every visitor has with the booking widget produces an error page unless they re-open "Departure" and pick a second day.
- Fix: Pass `min={1}` to `DayPicker`, and gate auto-close, the Apply button and `hasValidDates` on `getNights(range) >= 1`.
- Fix risk: With `min=1` clicking the start day again clears the selection; update `tests/components/date-range-picker.test.tsx`.

### R-110: `/api/security/csp-report` rejects every real browser report (`.strict()` schema)
- Severity: High
- Category: Functional gap
- Status: CONFIRMED (LEAD: live POSTs; also observed once in the wild during R-108's browser run: `400 POST /api/security/csp-report`)
- Location: src/app/api/security/csp-report/route.ts:L19-L28,L49-L50; src/lib/security-config.ts:L106,L174
- Evidence:
  ```
  Chromium-shaped body (adds referrer, disposition, status-code, script-sample) -> 400 {"error":"Invalid CSP report"}
  Same body without those four keys                                          -> 204
  ```
  Schema ends with `.strict()`; `rg -l csp-report tests` → no test.
- Problem: Browsers always include `referrer`, `disposition`, `status-code` (and `script-sample` with `'report-sample'`) in `report-uri` bodies; `.strict()` rejects them.
- Impact: In production (`reportOnly: false`) no CSP violation is ever recorded; the monitoring pipeline is blind, which also hides R-111 and R-127.
- Fix: Replace `.strict()` with `.strip()` (zod default) or add the four keys as bounded optional fields; reduce `source-file`/`blocked-uri` to origin+pathname like `pathnameOnly`. Add a route test with a real Chromium payload.
- Fix risk: None functional; keep the 16 KiB cap and rate limit.

### R-111: Production `Cross-Origin-Embedder-Policy: require-corp` blocks the Leaflet map tiles
- Severity: High
- Category: Security / Functional gap
- Status: CONFIRMED (LEAD: config lines re-read, tile headers checked, browser mechanism test; not run against a production build)
- Location: src/lib/security-config.ts:L196; src/lib/security-middleware-edge.ts:L71; src/components/LeafletMap.tsx:L167-L172; node_modules/leaflet/dist/leaflet-src.js:L7386 (`crossOrigin: false` default)
- Evidence:
  ```ts
  crossOriginEmbedderPolicy: 'require-corp',   // productionConfig; development uses 'unsafe-none'
  ```
  Tile servers (HEAD, read-only): `a.tile.openstreetmap.org` and `a.basemaps.cartocdn.com` → `cross-origin-resource-policy: null`, `access-control-allow-origin: *`.
  Mechanism test (local page + real tile in headless Chrome):
  ```
  coep=0            tile naturalWidth=256 loaded
  coep=1            tile naturalWidth=0 FAILED: net::ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep
  coep=1&cross=1    tile naturalWidth=256 loaded   (crossorigin="anonymous")
  ```
- Problem: Under `require-corp` a no-CORS cross-origin image needs a CORP header; the tile servers send none and Leaflet requests tiles without `crossorigin`.
- Impact: Production only: every map (guide, apartment, check-in location) renders without base tiles. The app gains nothing from cross-origin isolation.
- Fix: `crossOriginEmbedderPolicy: 'unsafe-none'` in `productionConfig` (keep COOP), or `L.tileLayer(url, { crossOrigin: true })`.
- Fix risk: Header-only; no test asserts COEP today.
- To confirm on the real bundle: `npm run build && npm start`, open `/en`, look for `ERR_BLOCKED_BY_RESPONSE…Coep` on tile requests.

### R-112: The service worker precaches `/` (a redirect), so `/` and the PWA `start_url` fail for returning visitors
- Severity: High
- Category: PWA
- Status: CONFIRMED (LEAD: sw.js and proxy.ts re-read; browser mechanism test with a synthetic SW; not run against a production build)
- Location: public/sw.js:L8-L11,L313-L314,L451-L459; src/proxy.ts:L43-L53; public/app.webmanifest:L4
- Evidence:
  ```js
  const CORE_ASSETS = ['/', '/en','/el', '/offline', …];               // sw.js L8-11
  await Promise.allSettled(allAssets.map(u => cache.add(u).catch(() => {})));   // L314
  const cached = await caches.match(request); if (cached) { …; return cached; } // L453-459 (navigations)
  ```
  `proxy.ts:43-53` answers `/` with a 302 to `/${locale}`; manifest `"start_url": "/"`.
  Mechanism test (local server: `/` → 302 `/en`; SW with the same precache + navigation logic):
  ```
  cached "/" entry: {"redirected":true,"url":"http://localhost:3997/en","status":200}
  navigation to "/" FAILED: net::ERR_FAILED
  ```
- Problem: `cache.add('/')` stores the followed redirect as a redirected response; returning it for a navigation request (redirect mode `manual`) is a network error per the Fetch standard.
- Impact: Production only (the SW is unregistered in dev): after the first visit, opening the bare domain or launching the installed PWA shows a browser error page instead of the locale redirect. Deep links are unaffected.
- Fix: Remove `'/'` from `CORE_ASSETS` and set `"start_url": "/en"`; or in the HTML branch `if (cached.redirected) return Response.redirect(cached.url, 302)`.
- Fix risk: None; re-test PWA launch and offline reload of `/`.

### R-113: Precached HTML shells are served cache-first, never revalidated, and the SW never reinstalls on deploy
- Severity: High
- Category: PWA
- Status: SUSPECTED (AGENT; mechanism read by the lead, production `Cache-Control` not observed)
- Location: public/sw.js:L3,L32-L36,L282-L319,L451-L459; public/critical-precache.json; src/app/layout.tsx:L34-L36; scripts/generate-version.ts:L12-L25; src/components/DeferredHomeInteractiveBar.tsx:L30-L36
- Evidence:
  ```js
  const CACHE_VERSION = 'v4';                                   // hard-coded; generate-version.ts writes only version.json
  function canStore(response) { …; return !cacheControl.includes('no-store') && !cacheControl.includes('private'); }
  if (cached) { fetchInternal(request).then((res) => { if (canStore(res)) …put… }); return cached; }
  ```
  `critical-precache.json` lists 18 HTML pages that `cache.add` stores at install regardless of headers. Every page renders dynamically (`headers()` in the root layout), and Next 16 sends `private, no-cache, no-store, max-age=0, must-revalidate` for dynamic pages (`server/lib/cache-control.js:L12-L16`), so `canStore` is false and the background revalidation never replaces the shell. A new SW installs only when `sw.js` bytes change.
- Problem: After a deploy, returning visitors keep the old HTML for `/en`, `/el`, category and precached item pages, referencing the previous build's `/_next/static/<buildId>/…` chunks; lazily imported chunks 404 and the unhandled `import()` rejections leave the booking bar and contact section empty.
- Impact: Stale content and broken lazy components for returning visitors until `CACHE_VERSION` is bumped by hand.
- Fix: Network-first with cache fallback for HTML (store same-origin public HTML in the SW's own cache regardless of `Cache-Control`; keep skipping private pages and `/api`), and inject the build version into `sw.js` at build time so every deploy reinstalls. Also fixes R-112.
- Fix risk: Online loads always hit the network (already the case for non-precached pages). Test offline navigation to visited and unvisited pages.
- To confirm: production build; `curl -sI http://localhost:3000/en | grep -i cache-control`; change a dictionary string, rebuild, reload in the SW-enabled tab → old text persists.

## Medium

### R-114: In development every sensitive route answers 503 without the Nginx identity headers, and the failure is logged only at debug level
- Severity: Medium
- Category: Functional gap / Error handling
- Status: CONFIRMED (LEAD)
- Location: src/lib/net/clientIdentity.ts:L79-L83; src/lib/sensitiveRateLimit.ts:L45; src/lib/apiErrorHandler.ts:L350-L361; .env.example:L12-L14; docs/security/trusted-ingress.md:L11,L21; scripts/README.md (no local guidance)
- Evidence:
  ```ts
  if (attestation === null || attestation === '') { throw new ClientIdentityUnavailableError('missing'); }
  // apiErrorHandler.ts
  if (identityUnavailable) { if (mergedConfig.enableErrorLogging) { logger.debug('API dependency unavailable', …); } return createClientIdentityUnavailableResponse(); }
  ```
  Live: `POST /api/admin/login` (right or wrong token) → 503 `{"success":false,"error":{"message":"Service temporarily unavailable"}}`; `POST /api/booking-requests` → 503; the dev log (LOG_LEVEL=info) shows only the access line, no reason. With a 64-hex `ORIGIN_PROXY_SHARED_SECRET` and the two headers added by hand, everything works.
- Problem: The fail-closed contract is correct for production, but there is no development path (no local Nginx, no documented header simulation, no dev resolver) and the diagnostic is invisible at the default log level.
- Impact: With `npm run dev`/`system:up` the admin login, guest sign-in/claim, booking form, analytics, vitals, error and CSP reports all return 503; a misconfigured production Nginx produces the same silent 503s. Explains why the previous smoke test covered GET pages only.
- Fix: Document the local setup (64-hex secret + a tiny header-injecting dev proxy, or the checked-in Nginx template) in scripts/README.md, and log the identity failure at `warn` with the bounded `reason`. A development-only loopback resolver would touch the trust boundary and needs sign-off.
- Fix risk: Logging change only; keep the response body generic.

### R-115: `next dev` rewrites the tracked `CLAUDE.md` on every start
- Severity: Medium
- Category: Config
- Status: CONFIRMED (LEAD)
- Location: next.config.ts (no `agentRules`); node_modules/next/dist/server/lib/generate-agent-files.js; node_modules/next/dist/server/config-schema.js:L496 (`agentRules: z.boolean().optional()`)
- Evidence: dev log `✓ Generated CLAUDE.md for AI agents. Set \`agentRules: false\` in next.config to disable.`; `git diff --stat` → `CLAUDE.md | 10 ++++++++++` (a `<!-- BEGIN:nextjs-agent-rules -->` block appended). Restored by hand at the end of this review.
- Problem: Next 16.3 appends a managed block to the repository's instructions file whenever the dev server starts.
- Impact: Every developer session dirties the tree; `git diff --check`/`check:candidate-diff`-style gates and reviews see an unrelated change; the block's text conflicts with the project's own agent instructions.
- Fix: `agentRules: false` in `next.config.ts` (or decide to commit the block once).
- Fix risk: None.

### R-116: Unauthenticated, unlimited audit-table writes from a forged `Origin` on any `/api/*` path
- Severity: Medium
- Category: Security / Performance
- Status: CONFIRMED (LEAD: 5 requests → 5 rows)
- Location: src/lib/security-middleware-edge.ts:L104-L131; src/lib/security-monitoring.ts:L57-L97; src/proxy.ts:L100-L102; src/lib/api-security-middleware.ts:L9-L57
- Evidence: `for i in 1..5: GET /api/does-not-exist -H 'Origin: https://evil.example'` → 5×403; `select count(*) from security_audit_events where event_type='cors_violation'` → before 0, after 5. The health paths are skipped with the comment "Skipping avoids an attacker-controlled Origin turning a direct probe into an audit DB write"; every other `/api/*` path, including non-existent ones, still writes before any authentication or limiter.
- Problem: One uncounted INSERT per request, reachable without identity; the same shape exists for `api_security_violation` on the portal routes.
- Impact: Sustained write load and table growth from a single client while Nginx limits are in dry-run mode.
- Fix: Persist these diagnostics only when `getClientIp(request) !== 'unknown'`, or cap them with `checkSensitiveRateLimit` (scope `security-diagnostics`); skip the audit for non-existent paths.
- Fix risk: Fewer stored diagnostics for unattested traffic; update `security-boundaries` tests that expect a write.

### R-117: Guest terms acceptance stores the hash of a text the guest never sees
- Severity: Medium
- Category: Data integrity
- Status: CONFIRMED (AGENT; lines re-read)
- Location: src/lib/guestTerms.ts:L3-L12; src/app/[locale]/guest/UnifiedGuestClient.tsx:L275-L284; src/lib/portalAuthService.ts:L196-L212
- Evidence: `GUEST_TERMS_TEXT` (three English sentences, not exported, rendered nowhere) is hashed into `TermsAcceptance.contentHash`; the only checkbox shows a different one-sentence text ("I confirm my details are correct and accept the portal terms…", Greek variant on `/el`).
- Problem: The consent record does not describe what was shown.
- Impact: Any audit/DSAR answer based on `contentHash` is misleading, especially for Greek guests.
- Fix: Export the canonical per-locale terms text, render exactly it, hash what is rendered, bump `GUEST_TERMS_VERSION`.
- Fix risk: `tests/integration/auth/claim-concurrency-characterization.test.ts:463-464` asserts version/hash equality; keep the exports.

### R-118: A returning guest must know the old password; there is no reset path and the sign-up form promises a new account
- Severity: Medium
- Category: Functional gap
- Status: CONFIRMED (AGENT)
- Location: src/lib/portalAuthService.ts:L143-L155; src/app/api/portal/claims/route.ts:L61-L66; src/app/[locale]/guest/UnifiedGuestClient.tsx:L254; src/i18n/domains/portal.ts:L64,L88
- Evidence: an existing `User` with `passwordHash` must match the supplied password or the claim fails with the generic 401; the form uses `autoComplete="new-password"`, placeholder "At least 8 characters", hint "Create your guest account". `grep -rn "reset.*password\|forgot" src` → nothing; the admin UI has no reset action (R-046 deleted `updateUserPassword` as unused).
- Impact: A repeat guest who forgot last year's password can neither claim nor sign in; the host cannot help without editing the database.
- Fix: Admin action that nulls `User.passwordHash` (audited) so the next claim sets a new one; adjust the sign-up copy for existing accounts.
- Fix risk: New admin mutation needs the same session/origin checks as `claim-grants` (after R-104).

### R-119: Claim grants can be issued for bookings the exchange will always reject (ended, or starting more than 7 days out)
- Severity: Medium
- Category: Functional gap
- Status: CONFIRMED (AGENT ×2; lines re-read)
- Location: src/lib/portalAuthService.ts:L61-L66 vs L103-L109; src/lib/portalBookingEligibility.ts; src/app/admin/guests/page.tsx:L413-L421
- Evidence: `issueBookingClaimGrant` checks only existence and "already claimed"; `prepareBookingClaimExchange` requires `isPortalBookingTemporallyEligible`; the admin button shows for every non-VERIFIED booking.
- Impact: The host issues a token weeks ahead, the guest gets "The claim token is invalid", both sides suspect a typo.
- Fix: Apply the eligibility predicate at issue time (new `PortalAuthError` → 409 with an explicit message) and disable the button client-side outside the window.
- Fix risk: Integration fixtures that issue grants for future bookings may need dates inside the window.

### R-120: Admin session keep-alive restarts on every page mount, is absent on `/admin/guests`, and never redirects on hard expiry
- Severity: Medium
- Category: Logic
- Status: CONFIRMED (AGENT; UI part observed by LEAD: `/admin/guests` has no "Session: ok / Logout" header while every other admin page does)
- Location: src/components/AdminSessionManager.tsx:L5,L27-L38; src/lib/auth/admin.ts:L78-L79,L95-L123; src/app/api/admin/login/route.ts:L58; src/app/admin/guests/page.tsx (no manager)
- Evidence: single 105-minute timer started at mount and cleared on unmount; the only writer of `expiresAt` is `/api/admin/refresh`; cookie `maxAge: 7200`; after the 24 h absolute expiry the manager retries every 60 s forever.
- Impact: An active admin is logged out at login + 2 h with 403 banners; an idle tab stays alive for 24 h.
- Fix: Mount the manager once in a shared `src/app/admin/layout.tsx`; schedule from the real expiry; on 401 redirect to `/admin/login`.
- Fix risk: Layout change across all admin pages; test with fake timers.

### R-121: Admin lists are silently capped (100 check-in requests, 200 stay requests) with no pagination
- Severity: Medium
- Category: Functional gap
- Status: CONFIRMED (AGENT; lines re-read)
- Location: src/lib/prisma-repositories/checkInRequestRepository.ts:L168-L175; src/app/api/admin/check-in-requests/route.ts:L50-L60; src/app/api/admin/stay-requests/route.ts:L12-L19; src/app/admin/requests/AdminRequestsClient.tsx; src/app/admin/stay-requests/AdminStayRequestsClient.tsx
- Evidence: `take: 200`; `params.limit ?? 100`; the check-in response's `total` is the truncated length while `summary.total` is the real count; the stay-request `?status=` filter has no UI.
- Impact: Beyond the cap, older rows are unreachable from the UI and the cards disagree with the list.
- Fix: `limit`/cursor parameters + "Load more" (or "showing N of M").
- Fix risk: Keep the response shape.

### R-122: A second arrival request while one is pending is discarded server-side but the UI reports success
- Severity: Medium
- Category: Functional gap
- Status: CONFIRMED (LEAD: API part; AGENT: UI part)
- Location: src/lib/prisma-repositories/checkInRequestRepository.ts:L109-L126; src/app/api/check-in/arrival-request/route.ts:L88-L98; src/components/CheckInInfo.tsx:L602-L610,L840-L848
- Evidence: second `POST /api/check-in/arrival-request` (`17:00`) → 200 with the FIRST request (`16:30`) and `"notification":{"status":"skipped","reason":"request_already_pending"}`; the client only checks `res.ok` and shows "Your request has been sent".
- Impact: The guest believes the host received the new time; the host sees only the first.
- Fix: Branch on `notification.reason` (localized "a request is already pending"), hide the button while pending, or return 409.
- Fix risk: Two new dictionary strings.

### R-123: Check-in times saved as `H:MM` make the guest preferences endpoint return 500
- Severity: Medium
- Category: Bug
- Status: CONFIRMED (AGENT; regex lines re-read)
- Location: src/app/api/check-in/preferences/route.ts:L10-L13,L84-L90; src/lib/propertyTime.ts:L1,L30-L31
- Evidence: route regex `/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/` accepts `9:00`; `propertyTime.ts` requires `/^(?:[01]\d|2[0-3]):[0-5]\d$/` and throws inside `wifiDisclosureWindow`, called on every guest GET.
- Impact: All guests get 500 and the check-in page silently falls back to 15:00/11:00 with Wi-Fi "Unavailable" until an admin re-saves a padded value (reachable via API; the admin `<input type=time>` pads).
- Fix: Export `timePattern` and reuse it in both route schemas.
- Fix risk: Existing unpadded rows would fall back to defaults.

### R-124: `wifiAvailableAt` is returned but never shown; guests cannot tell "not yet" from "not configured"
- Severity: Medium
- Category: Functional gap
- Status: CONFIRMED (LEAD: `grep -rn wifiAvailableAt src` → only the route)
- Location: src/app/api/check-in/preferences/route.ts:L91,L102-L107; src/components/CheckInInfo.tsx:L485-L492; src/components/checkin/WifiAccessCard.tsx:L45-L60
- Impact: Before check-in minus 24 h the Wi-Fi card just says "Unavailable".
- Fix: Read `wifiAvailableAt` and render "Available from {date, time}".
- Fix risk: Low.

### R-125: Booking confirmation shows dates one day earlier for guests west of the server
- Severity: Medium
- Category: Bug
- Status: CONFIRMED (AGENT)
- Location: src/components/BookingForm.tsx:L140; src/lib/dateUtils.ts:L14-L23
- Evidence: `formatDateRange` uses `Intl.DateTimeFormat` without `timeZone` on server-midnight instants; `America/New_York` → "Sep 30 – Oct 4" for Oct 1–5.
- Fix: Covered by R-106 (calendar-date strings, or `timeZone: 'UTC'`).

### R-126: The production worker processes do not exit before systemd's 120 s timeout (`PRISMA_AUTO_DISCONNECT=false`, no `$disconnect`)
- Severity: Medium
- Category: Config
- Status: CONFIRMED (LEAD: timed locally)
- Location: scripts/install-systemd-services.sh:L178-L179 (`PRISMA_AUTO_DISCONNECT=false` in the shared env template); scripts/drain-outbox.ts; scripts/run-operational-maintenance.ts; src/lib/prisma.ts:L155-L165; src/lib/prismaPgConfig.ts:L7,L39 (`idleTimeoutMillis: 300_000`); deploy/systemd/qr-city-guide-outbox.service (`Type=oneshot`, `TimeoutStartSec=120`)
- Evidence:
  ```
  drain-outbox, PRISMA_AUTO_DISCONNECT unset          -> exits after 1 s
  run-operational-maintenance, unset                  -> exits after 1 s
  drain-outbox, PRISMA_AUTO_DISCONNECT=false          -> exits after 300 s (pg pool idle timeout; systemd TimeoutStartSec is 120 s)
  ```
- Problem: Neither script calls `prisma.$disconnect()`; with the idle disconnect disabled the pool keeps the event loop alive for 5 minutes.
- Impact: Every timer run is killed by systemd as a failure and the 1-minute timer skips activations while the unit is active.
- Fix: `finally { await prisma.$disconnect(); }` in both scripts (or `allowExitOnIdle: true` for CLI runs).
- Fix risk: None for the web process.

### R-127: DEAD outbox events have no lifecycle, so the "Dead outbox events" critical alert stays open forever
- Severity: Medium
- Category: Logic / Functional gap
- Status: CONFIRMED (AGENT ×2)
- Location: src/lib/operationalMonitor.ts:L17-L26,L136-L148,L195-L214; src/app/api/admin/stay-requests/[id]/route.ts:L25-L36; src/app/api/admin/check-in-requests/[id]/route.ts:L13-L15; src/lib/privacyService.ts:L110-L147
- Evidence: rule `count({status:'DEAD'}) > 0` with no window; retention deletes `DELIVERED` only; the only requeue is `retry_delivery` for stay requests (UI shows it only for `DELIVERY_FAILED`); check-in DEAD events have no path; erasure deliberately creates DEAD rows; `AlertStatus.ACKNOWLEDGED` is never set.
- Impact: The first exhausted check-in webhook or completed erasure opens a permanent critical alert; later failures only bump `value` and never notify.
- Fix: Retention/ack for DEAD rows (delete after N days, immediately for `payload.redacted`), a `retry_delivery` action for check-in requests, or exclude erasure rows from the rule.
- Fix risk: Decide whether stale DEAD events may be redelivered (receiver dedupes on `Idempotency-Key`).

### R-128: Production CSP hard-codes the OSRM origin while `NEXT_PUBLIC_OSRM_BASE_URL` lets operators point elsewhere
- Severity: Medium
- Category: Config
- Status: CONFIRMED (LEAD: lines re-read)
- Location: src/lib/security-config.ts:L97,L165; src/components/LeafletMap.tsx:L14
- Fix: Derive the `connect-src` entry from `new URL(process.env.NEXT_PUBLIC_OSRM_BASE_URL || 'https://router.project-osrm.org').origin`.

### R-129: Moments search never matches Greek input typed without accents or in capitals
- Severity: Medium
- Category: Bug
- Status: CONFIRMED (LEAD: code re-read; AGENT: executed against the real `/el` strings)
- Location: src/components/CategoryGridClient.tsx:L99-L112
- Evidence: only `toLowerCase()` on both sides; `"ΜΟΥΣΕΙΟ" → "μουσειο"` does not match the accented `"μουσείο"` in the data.
- Impact: On `/el/moments` searching "ΜΟΥΣΕΙΟ" or "μουσειο" shows the empty state although three museums exist.
- Fix: Normalise both sides (`NFD`, strip combining marks, lower-case, `ς → σ`); add a unit test.

### R-130: No `not-found.tsx`, so unknown categories/slugs render Next's English default 404 outside the site UI
- Severity: Medium
- Category: Functional gap / i18n
- Status: CONFIRMED (LEAD: `/en/does-not-exist` and `/el/moments/nope` render "404 | This page could not be found." with no navigation; the client render also logs React's "Encountered a script tag while rendering React component" for the root layout's inline theme script)
- Location: src/app (no `not-found.tsx`); src/app/[locale]/[category]/page.tsx:L36-L37; src/app/[locale]/[category]/[slug]/page.tsx:L53-L56
- Fix: Add `src/app/[locale]/not-found.tsx` (localized copy + link home) and optionally a root one.

### R-131: `#contact` and `#book-now` anchors target lazily mounted sections
- Severity: Medium
- Category: Bug
- Status: CONFIRMED (AGENT)
- Location: src/components/DeferredContactSection.tsx:L25-L45; src/components/ContactSection.tsx:L116; src/components/ErrorSummary.tsx:L10; src/app/[locale]/guest/UnifiedGuestClient.tsx:L183; src/components/DeferredHomeInteractiveBar.tsx:L12-L25
- Evidence: `id="contact"` exists only after the placeholder intersects or 3.5 s pass; `ErrorSummary` default `supportHref='/en#contact'` is not locale-aware; the booking bar mounts after `load` + 1800 ms.
- Impact: "Contact support" from the guest error panel lands on the hero; the apartment "Book" CTA scrolls ~2 s late.
- Fix: Put the `id` on the placeholder and mount immediately when the hash matches; make `supportHref` locale-aware.

### R-132: The documented first-time setup fails with "DATABASE_URL is required"
- Severity: Medium
- Category: Docs
- Status: CONFIRMED (AGENT; env contract re-read by LEAD: `validate_environment_contract` runs before `prepare_database`, and `ensure-pepper` writes no `DATABASE_URL`)
- Location: README.md:L20-L26; scripts/README.md:L19-L25; scripts/ensure-pepper.js:L27-L44; scripts/system-orchestrator.sh:L433-L435,L1040-L1058
- Impact: An operator following the quick start literally hits exit 14 before the advertised Docker fallback can engage (and then R-107).
- Fix: Document `cp .env.example .env.local` as step 1 (and fix its credentials, R-074), or have `ensure-pepper` append the compose `DATABASE_URL`.

### R-133: In the systemd `--foreground` start the orchestrator shell stays MainPID, so SIGTERM never reaches Node
- Severity: Medium
- Category: Ops
- Status: CONFIRMED (AGENT: process-tree repro; lines re-read by LEAD)
- Location: scripts/system-orchestrator.sh:L887-L895 (`( cd …; exec bash -lc "$app_cmd" )` in a subshell); deploy/systemd/qr-city-guide.service:L8,L17,L22-L23 (`Type=simple`, `KillMode=mixed`)
- Impact: Every `systemctl stop/restart` orphans the server and ends with SIGKILL; Next's graceful shutdown and the Prisma hooks never run.
- Fix: `exec` in the main shell (no parentheses), ideally exec'ing `node scripts/start-standalone.mjs …` directly.

### R-160: Any claim token can set the password of a password-less account
- Severity: Medium
- Category: Security
- Status: CONFIRMED (LEAD, found during B2; reproduced against a disposable PostgreSQL)
- Location: src/lib/portalAuthService.ts `consumeBookingClaimGrant`, the `existingUser` branch without `passwordHash`
- Evidence: before B2 the branch was
  ```ts
  } else {
    await tx.user.update({ where: { id: existingUser.id }, data: { passwordHash: newPasswordHash, ... } });
  }
  ```
  with no check that the grant's booking belongs to that user. The new integration test `tests/integration/auth/guest-access-reset.test.ts` "refuses a claim token of another booking for the reset account…" returns `status: 200` without the guard (1 failed / 76 passed) and 401 with it (77/77).
- Problem: A guest holding a valid grant for booking Y who enters the phone of a password-less account sets that account's password and links Y to it.
- Impact: Before B2 only legacy password-less rows were exposed (no current code creates them; the integration fixture `tests/integration/support/fixtures.ts` seeds that shape). B2's access reset deliberately clears passwords, so without a guard every reset would open an account-takeover window until the owner re-claims.
- Fix: Fixed in B2: the branch refuses with `INVALID_CREDENTIALS` unless `grant.booking.userId === existingUser.id`, so a password-less account can set a new password only through a grant for a booking it already owns (the host reset).
- Fix risk: A legacy password-less account can no longer claim a new, unrelated booking by itself; the host resets access on a booking the account owns, or erases the legacy account (open question O14).

## Low

### R-134: The `flash` query parameter is free text (content spoofing), English-only on the Greek UI, and re-appears after dismissal
- Severity: Low
- Category: Security / i18n / Bug
- Status: CONFIRMED (LEAD: `/el/check-in` → `/el/guest?flash=Please+sign+in…` renders the English sentence in the Greek error box; AGENT: re-appearance trace)
- Location: src/app/[locale]/guest/UnifiedGuestClient.tsx:L23,L35-L37,L66-L70,L72-L89; src/app/[locale]/check-in/page.tsx:L59-L60; src/app/[locale]/portal/refresh/page.tsx:L20
- Evidence: `search.get('flash')?.trim().slice(0, 300)` is rendered as the error summary; the two producers are hard-coded English; `changeMode` clears the error but the URL sync effect re-sets it from `flash` on every tab change.
- Fix: Replace the free text with a code (`?flash=session_required`) mapped to dictionary strings; strip it from the URL after reading it once.

### R-135: `GET /api/portal/sessions` never returns `bookingId`
- Severity: Low
- Category: Bug
- Status: CONFIRMED (LEAD: live body `{"authenticated":true}`)
- Location: src/app/api/portal/sessions/route.ts:L29 (`session.booking_id`); src/lib/guestSession.ts:L23 (`booking?: { id?: string }`)
- Fix: `bookingId: session.booking?.id`.

### R-136: `portalEnabled` and `checkinEnabled` can be toggled independently and produce dead ends
- Severity: Low
- Category: Config
- Status: CONFIRMED (AGENT; flag lines re-read)
- Location: src/app/[locale]/check-in/page.tsx:L21; src/app/[locale]/guest/layout.tsx:L11; src/app/api/portal/claims/route.ts:L74; src/app/api/portal/sessions/route.ts:L61; src/app/api/portal/refresh/route.ts (no flag check)
- Impact: Sign-in succeeds and lands on a 404, or refresh keeps rotating tokens while the portal is "off".
- Fix: Gate check-in on both flags, gate refresh on `portalEnabled`, couple the toggles in settings.

### R-137: Correct credentials outside the access window are reported as "Check your details"
- Severity: Low
- Category: Functional gap
- Status: CONFIRMED (AGENT)
- Location: src/lib/portalAuthService.ts:L260-L273; src/app/[locale]/guest/UnifiedGuestClient.tsx:L121-L126; src/lib/userFacingErrors.ts:L17,L29
- Fix: A portal-specific 401 message covering "wrong credentials, or booking not within 7 days / ended".

### R-138: `retry_delivery` has no state guard and reopens a CLOSED stay request
- Severity: Low
- Category: Logic
- Status: CONFIRMED (AGENT; lines re-read)
- Location: src/app/api/admin/stay-requests/[id]/route.ts:L22-L41
- Fix: Reject `retry_delivery`/`close` when `existing.status === 'CLOSED'`.

### R-139: Privacy erasure deadens a stay request's outbox events but leaves its status PENDING
- Severity: Low
- Category: Data integrity
- Status: CONFIRMED (AGENT)
- Location: src/lib/privacyService.ts:L125-L147; src/app/admin/stay-requests/AdminStayRequestsClient.tsx:L50-L53
- Fix: Set `status: 'CLOSED'` in the same update; make `retry_delivery` skip `payload.redacted` events.

### R-140: Guests list stagger animation hides the Nth card for N/10 seconds
- Severity: Low
- Category: Bug
- Status: CONFIRMED (AGENT)
- Location: src/app/admin/guests/page.tsx:L392-L398 (`transition={{ delay: 0.1 * index }}`)
- Fix: Cap the delay or drop the stagger.

### R-141: Stay-request dates render one day early in browsers west of UTC
- Severity: Low
- Category: Bug
- Status: CONFIRMED (LEAD: line re-read)
- Location: src/app/admin/stay-requests/AdminStayRequestsClient.tsx:L51 (`new Date(request.startDate).toLocaleDateString()` on a `@db.Date` value)
- Fix: Format with `{ timeZone: 'UTC' }` or slice the ISO date. (The guests page prints raw ISO strings instead, see Nits.)

### R-142: Check-in decisions can be reversed through the API but not in the UI
- Severity: Low
- Category: Functional gap
- Status: CONFIRMED (LEAD: `PATCH … {"status":"rejected"}` on an approved request → 200 + webhook)
- Location: src/app/api/admin/check-in-requests/[id]/route.ts:L13-L15,L38-L49; src/app/admin/requests/AdminRequestsClient.tsx:L252,L310-L329
- Fix: Decide the policy: offer "Change decision" in the UI, or return 409 for non-pending rows.

### R-143: The admin login form reports "Authentication failed" for 429/400/503 responses
- Severity: Low
- Category: Error handling
- Status: CONFIRMED (AGENT; lines re-read)
- Location: src/app/admin/login/AdminLoginClient.tsx:L21,L51; src/app/api/admin/login/route.ts:L19,L22,L34,L40
- Fix: Show the JSON `error` for 429/400/503.

### R-144: Server error messages are English-only and rendered verbatim in the Greek UI; check-in `<title>` is English
- Severity: Low
- Category: i18n
- Status: CONFIRMED (AGENT; R-134 overlaps)
- Location: src/components/BookingForm.tsx:L101-L104; src/app/api/booking-requests/route.ts:L60,L63,L73,L75,L95; src/app/[locale]/check-in/page.tsx:L12-L15
- Fix: Map status codes to dictionary strings on the client; localize the metadata title.

### R-145: The Greek check-in page duplicates the parking label
- Severity: Low
- Category: Logic
- Status: CONFIRMED (LEAD: lines re-read)
- Location: src/components/CheckInInfo.tsx:L949-L957 (`.includes('parking')` against Greek highlights); src/data/apartmentData.ts:L36
- Fix: Add a `parkingDetail` dictionary key.

### R-146: No tests cover the outbox state machine or the check-in routes/repository
- Severity: Low
- Category: Tests
- Status: CONFIRMED (AGENT: `grep -rl 'bookingOutbox|deliverOutboxEvent|drainOutbox|arrival-request|check-in/preferences|checkInRequestRepository' tests` → only the client-identity regression tests)
- Fix: Unit tests with a mocked `prisma` for claim/backoff/DEAD/ownership, and route tests for the check-in endpoints (would have caught R-122, R-123, R-127).

### R-147: Detail pages show raw English tag keys on `/el`
- Severity: Low
- Category: i18n
- Status: CONFIRMED (LEAD: lines re-read)
- Location: src/app/[locale]/[category]/[slug]/page.tsx:L174-L178; src/components/moments/MomentsDetailLayout.tsx:L148-L154 (vs MomentCard.tsx:L206 which translates)
- Fix: `t.momentTags?.[tag] ?? tag` in both places.

### R-148: Hard-coded "Loading map..." on the `/el` moments map
- Severity: Low
- Category: i18n
- Status: CONFIRMED (LEAD: lines re-read)
- Location: src/components/CategoryGridClient.tsx:L15-L22 (MapLoadingSkeleton already localizes `map.loading`)

### R-149: "Η Καλαματα μας" is misspelled (missing tonos) in both sources; "Brunchs"
- Severity: Low
- Category: i18n
- Status: CONFIRMED (LEAD)
- Location: src/data/categories.ts:L5; src/i18n/domains/common.ts:L490 (also L319 `brunchs: "Brunchs"`)
- Fix: "Η Καλαμάτα μας"; "Brunch".

### R-150: `X-Powered-By: Next.js` is emitted
- Severity: Low
- Category: Security
- Status: CONFIRMED (LEAD: header observed on `/en`)
- Location: next.config.ts (no `poweredByHeader: false`); deploy/nginx/nginx.conf.template (no `proxy_hide_header`)

### R-151: `database_reachable` resolves `pg` from the caller's cwd
- Severity: Low
- Category: Bug
- Status: CONFIRMED (AGENT; lines re-read)
- Location: scripts/system-orchestrator.sh:L557-L577 (heredoc without `cd "$REPO_ROOT"`, unlike L699-L703)
- Impact: From any other cwd the DB is misdiagnosed as unreachable (production `check` dies; development starts the fallback and swaps `DATABASE_URL`).

### R-152: Manual worker runs need `DATABASE_URL` in the shell; the error hint names a non-existent compose service
- Severity: Low
- Category: Docs
- Status: CONFIRMED (AGENT; LEAD ran the workers only after `set -a; source .env.local`)
- Location: scripts/README.md:L122-L128; src/lib/prisma.ts:L123 (`docker-compose up pg`; the service is `db`)

### R-153: The nginx ingress gate's test-network check depends on `rg` and passes silently when ripgrep is absent
- Severity: Low
- Category: Ops
- Status: CONFIRMED (AGENT; line re-read)
- Location: scripts/test-nginx-ingress.sh:L129-L132; docs/release-verification.md prerequisites
- Fix: `grep -En`, or fail when `rg` is missing.

### R-154: `schema.prisma` does not describe the DDL the migrations create
- Severity: Low
- Category: Migration
- Status: SUSPECTED (AGENT; mismatches confirmed by reading, generated diff not run)
- Location: prisma/schema.prisma:L233 (`familyId String`) vs migration 20260714150000:L141 (`VARCHAR(64)`); six `updated_at` DB defaults; three partial unique indexes, CHECKs and a trigger exist only in SQL
- Impact: `prisma migrate dev` would emit unrelated `ALTER`/`DROP DEFAULT`/possibly `DROP INDEX` statements.
- To confirm: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <disposable postgres> --script`.

### R-155: `system:down` cannot stop a fallback database started by `db:start`, and treats a pre-running container as "managed"
- Severity: Low
- Category: Ops
- Status: CONFIRMED (AGENT; LEAD observed: after R-107's silent exit no state file exists, so `down` would leave `site-dev-db` running)
- Location: scripts/system-orchestrator.sh:L646-L650,L853-L866,L1002-L1009,L1047-L1054

### R-156: A non-UUID booking id in `claim-grants` returns 500 instead of 404/422
- Severity: Low
- Category: Error handling
- Status: CONFIRMED (LEAD)
- Location: src/app/api/admin/bookings/[id]/claim-grants/route.ts:L29-L36; src/lib/portalAuthService.ts:L61-L62
- Evidence: `POST /api/admin/bookings/not-a-uuid/claim-grants` → 500 `INTERNAL_ERROR`; dev log: `PrismaClientKnownRequestError P2007 … invalid input syntax for type uuid: "not-a-uuid"`.
- Fix: Validate `id` with `z.string().uuid()` and throw `NOT_FOUND`/`VALIDATION_ERROR`.

### R-157: Idempotent replay with a different payload returns the original request as success
- Severity: Low
- Category: Logic
- Status: CONFIRMED (LEAD)
- Location: src/app/api/booking-requests/route.ts:L96-L99
- Evidence: same `Idempotency-Key`, `firstName` changed → 200 with the original id and `status: "delivered"`.
- Fix: Store a payload hash with the key and return 422 on mismatch (standard idempotency semantics), or document the behaviour.

### R-159: The "Recent high-severity security events" alert rule can never fire
- Severity: Low
- Category: Logic
- Status: CONFIRMED (LEAD, found during A11)
- Location: src/lib/operationalMonitor.ts:L45-L55; audit producers src/lib/portalAuthService.ts:L217 (`low`), src/app/api/errors/route.ts:L59 (`low`), src/lib/privacyService.ts:L194 (`medium`), src/lib/security-monitoring.ts (`medium` CSP events)
- Evidence: `grep -rn "severity: '\(high\|critical\)'" src` matches only the alert-rule definitions in `operationalMonitor.ts`, never an audit write.
- Problem: The rule counts `high`/`critical` audit events, but nothing produces them.
- Impact: A rule the operator believes protects them is inert; refresh-token replay (token theft) is only a log line.
- Fix: Persist replay detection as a `high` audit event, or delete the rule. (Fixed 2026-09-24 in task X2.)
- Fix risk: A new write on the refresh failure path; keep it inside the existing revocation transaction.

### R-161: The date picker's selected and range states use react-day-picker's defaults: blue accent in light mode, unreadable range middle in dark mode
- Severity: Low
- Category: Bug
- Status: CONFIRMED (LEAD, found during S8a; dev server; production CSS order to be re-checked in F4)
- Location: src/styles/08-vendor.css:L1-L3 (`.custom-day-picker { --rdp-accent-color: var(--brand-600) }`), L115-L117 (dark); vendor `node_modules/react-day-picker/src/style.css:L2-L45` (`.rdp-root` variables), imported by src/components/DateRangePicker.tsx:L15
- Evidence: headless Chrome, `/en`, picker open with a range selected (375 px):
  - Declarations of `--rdp-accent-color` in cascade order: `.custom-day-picker` (globals), `[data-theme="dark"] .custom-day-picker` (globals), `.rdp-root` = `blue` (react-day-picker stylesheet, loaded later). `.custom-day-picker` and `.rdp-root` are the same element with equal specificity, so the vendor value wins in light mode.
  - Light: computed `--rdp-accent-color: blue`; range start button `rgb(0, 0, 255)`; today's number `rgb(0, 0, 255)`.
  - Dark: range-middle cell `rgb(240, 240, 255)` (vendor `#f0f0ff`) with day text `rgb(226, 232, 240)` → contrast 1.09:1; range start/end white on `#0b998b` → 3.53:1.
  - The v8 rules that once set these states (`.rdp-day_selected`, `.rdp-day_range_middle`, `.rdp-day_today`) matched nothing under v9 (R-090, deleted in S8a with byte-identical screenshots).
- Problem: The picker's state colours come from the library defaults instead of the site palette; in dark mode the vendor light-lavender range background is combined with the dark theme's light text.
- Impact: In dark mode the dates inside a selected stay are practically invisible, and the start/end dates fail WCAG AA; in light mode the picker is off-brand (pure blue).
- Fix: Theme v9 through its own variables with a selector that outranks `.rdp-root`: `.custom-day-picker.rdp-root { --rdp-accent-color: var(--brand-700); --rdp-accent-background-color: var(--brand-100); --rdp-range_middle-color: var(--brand-900) }` and `[data-theme="dark"] .custom-day-picker.rdp-root { --rdp-accent-color: var(--brand-300); --rdp-range_middle-color: var(--fg-default) }` (in dark mode today's number is already `--fg-default` through `[data-theme="dark"] .custom-day-picker .rdp-day`). Contrast: light 4.81 (start/end, today), 9.78 (middle); dark 4.70 (start/end), 13.07 (today), 7.32 (middle). (Fixed 2026-09-24 in S8d.)
- Fix risk: Visual only; screenshot gate in both themes and three viewports.

### R-162: Glass surfaces lose their backdrop blur in Chromium because Lightning CSS keeps only the trailing `-webkit-backdrop-filter`
- Severity: Low
- Category: Bug
- Status: CONFIRMED (LEAD, found during S8a; dev CSS; the production bundle uses the same Tailwind/Lightning CSS step, to be re-checked in F4)
- Location: src/styles/06-semantic-surfaces.css:L95-L96 (`.surface-card`), L179-L180 (`.backdrop-blur`); src/styles/07-search-listing.css:L327-L328; src/styles/09-utilities.css:L13-L14, L44-L45; src/styles/12-apartment-checkin.css:L262-L263
- Evidence:
  - The served `globals` CSS has `.surface-card { -webkit-backdrop-filter: blur(20px) saturate(180%); … }` with no standard `backdrop-filter`. Six rules are affected: `.surface-card`, `.backdrop-blur`, `.floating-banner`, `.main-glass-container`, `[data-theme="dark"] .main-glass-container`, `.checkin-panel`.
  - Chrome: `getComputedStyle(.surface-card).backdropFilter === "none"`, `CSS.supports('backdrop-filter','blur(2px)') === true`.
  - Installed `lightningcss` 1.32.0 with Tailwind 4.3.2's targets (`@tailwindcss/node` `safari 16.4, chrome 111, firefox 128`):
    ```
    .a{backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)} => .a { -webkit-backdrop-filter: blur(2px); }
    .a{-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)} => .a { -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
    .a{backdrop-filter:blur(2px)}                                   => .a { -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }
    ```
- Problem: The hand-written prefix after the standard property makes the minifier treat the prefixed declaration as the winner and drop the standard one.
- Impact: In Chrome, Edge and Android browsers the translucent cards (85 % white in light mode) have no blur, so page content shows through, e.g. behind the date picker popover on mobile. Safari is unaffected.
- Fix: Delete the six manual `-webkit-backdrop-filter` lines; Lightning CSS adds the prefix for the Safari targets itself (third case above). (Fixed 2026-09-24 in S8e.)
- Fix risk: Visual only; check the served CSS keeps both declarations and screenshot the popover and a glass card.

### R-163: In dark mode the booking page's date-error box is unreadable (light red box, light text)
- Severity: Low
- Category: Bug
- Status: CONFIRMED (LEAD, found during S8b; dev server)
- Location: src/app/[locale]/book/page.tsx:L131-L144 (`bg-red-50` box, `text-red-800` message, `text-red-600` link); src/styles/09-utilities.css (unlayered `[data-theme="dark"] span, [data-theme="dark"] div, [data-theme="dark"] label, … { color: inherit }` and `[data-theme="dark"] a:not(…) { color: var(--brand-400) }`)
- Evidence: headless Chrome, `/en/book` without dates, dark theme, 390 px. The rules that set the link's colour, in cascade order: `@layer base a { color: inherit }`, `@layer utilities .text-red-600 …`, then the two unlayered dark rules above, which win over any layered Tailwind utility. Measured contrast against the box background `lab(96.5 4.19 1.52)` (Tailwind `red-50`):
  - message "Please select dates": `rgb(226, 232, 240)` → 1.13:1
  - link "← Go back to select dates": `rgb(226, 232, 240)` → 1.13:1 before S8b, `rgb(11, 153, 139)` → 3.23:1 after S8b
- Problem: The box has no dark-mode background, while the global dark rules replace its red text colours with the dark theme's light text and brand link colour.
- Impact: A guest who opens `/book` without dates in dark mode cannot read why the page refuses to continue.
- Fix: Give the box a dark background: `dark:bg-red-950/60 dark:border-red-900` (the `dark:` variant follows `data-theme`, `globals.css:L15`). The inherited light text and the brand link colour then contrast with it. Measure both texts ≥ 4.5:1. Light mode: the link is `text-red-600` on `red-50`, 4.36:1; `text-red-700` gives 5.87:1. (Both fixed 2026-09-24 in S8f.)
- Fix risk: Visual only (one element); screenshot in both themes.

### R-164: "Show all amenities" link text fails contrast (brand-600 on white, 2.93:1)
- Severity: Low
- Category: Bug
- Status: CONFIRMED (LEAD, found during S8c; dev server, light theme)
- Location: src/components/AmenitiesList.tsx:L39 (`text-sm font-medium text-brand-600 hover:text-brand-700`)
- Evidence: `/en/book?checkin=2030-07-01&checkout=2030-07-05`, 390 px, light: computed `rgb(42, 168, 154)` (`--brand-600` `#2aa89a`) on `rgb(255, 255, 255)`, 14 px / 500 → 2.93:1 (WCAG AA needs 4.5:1). Same colour before S8c (the removed shim also mapped it to `--brand-600`).
- Problem: The only control that expands the amenity list uses the lightest brand text shade.
- Impact: Low-vision guests may not notice or read the control.
- Fix: `text-brand-700 hover:text-brand-900`: both shades have light and dark values (`--brand-800` has no dark value in `04-theme.css`, so `text-brand-800` would turn dark-on-dark). Light 4.81 (hover 11.64), dark 8.78 (hover 10.88). (Fixed 2026-09-24 in S8g.)
- Fix risk: Visual only.

### R-165: The date picker's "Clear dates" button sits under the "Next month" button
- Severity: Low
- Category: Bug
- Status: CONFIRMED (LEAD, found during S8e; dev server)
- Location: src/components/DateRangePicker.tsx:L213-L223 (clear: `absolute top-0 right-0 z-10`), L238-L247 (next month: `absolute right-4 top-0 z-20`, compact `right-2`)
- Evidence: headless Chrome, picker open with a check-in selected; bounding boxes and `elementFromPoint` at the centre of "Next month":
  ```
  375 px:  clear {x:275,w:44,h:44}  next {x:259,w:44,h:44}  overlap 1232 px²  top: "Next month"
  700 px:  clear {x:343,w:28,h:28}  next {x:327,w:28,h:28}  overlap 336 px²   top: "Next month"
  1280 px: clear {x:870,w:28,h:28}  next {x:854,w:28,h:28}  overlap 336 px²   top: "Next month"
  ```
  The screenshots show "›×" drawn on top of each other.
- Problem: Both controls are absolutely positioned in the same corner; only a 16 px strip of "Clear dates" stays clickable.
- Impact: Guests who try to clear their dates often hit "Next month" instead; the two icons read as one glyph.
- Fix: Move "Clear dates" out of the caption row into the footer, as a secondary text button beside "Apply dates" (shown only when a date is selected), and keep the caption row for month navigation. (Fixed 2026-09-24 in S8h.)
- Fix risk: Layout of the picker footer; component test for the clear action and screenshots in 3 viewports.

## Nits (R-158, grouped)
- Unauthenticated `/api/admin/*` returns 403 `FORBIDDEN` "Admin credentials required"; 401 is the conventional status (`src/lib/auth/admin.ts` callers).
- `POST /api/check-in/arrival-request` returns 200 for a newly created request (201 expected).
- `useGuestSession` probes `GET /api/portal/sessions` on every public page load; anonymous visitors get a 401 console error on `/en`, `/el`, `/en/apartment`, … (`src/hooks/useGuestSession.ts:L27`).
- The sign-in limiter (5 per 15 min per phone) counts successful sign-ins too (`src/app/api/portal/sessions/route.ts:L41-L47`); a guest signing in from five devices is locked out.
- `/admin/guests` prints raw ISO strings ("2026-09-24T00:00:00.000Z to …") for booking dates (`src/app/admin/guests/page.tsx`).
- `/xx/about` is prefixed to `/en/xx/about` (302) and then 404s; fine, but a redirect chain for an invalid locale segment.
- Dev-only: pages hydrate only when opened as `http://localhost:3000`; via `http://127.0.0.1:3000` the HMR socket fails (`ERR_INVALID_HTTP_RESPONSE`) and no React handlers attach (Next dev-origin protection with `-H 0.0.0.0`). Not a product bug; document "use localhost".

---

## Smoke test log (2026-09-24, local)

**Environment.** Node 22.19.0 via nvm; Docker 29.8.0; existing `postgres:16-alpine` image (compose digest); `site-dev-db` container recreated from the existing volume (`site_postgres-dev-data`, 14 migrations already applied). `npm run dev` started by hand after R-107. Browser: puppeteer 24.43.1 with Chrome 148 (already cached).

**Local-only configuration created (gitignored `.env.local`):** `DATABASE_URL` (compose credentials), random `ADMIN_JWT_SECRET`, `ADMIN_DASH_SECRET`, `CLAIM_TOKEN_PEPPER`, `NEXT_PUBLIC_SITE_URL`/`ALLOWED_ORIGINS` (`http://localhost:3000`), `LOG_LEVEL=info`; `ensure-pepper` added `SECURITY_PEPPER`, `GUEST_JWT_SECRET`, `GUEST_WIFI_*`. For the sensitive routes a 64-hex `ORIGIN_PROXY_SHARED_SECRET` was set and every probe sent `x-origin-proxy-attestation` + `x-origin-verified-client-ip: 127.0.0.1` (simulating Nginx); `BOOKING_REQUEST_WEBHOOK_URL`/`CHECKIN_REQUEST_WEBHOOK_URL` pointed at a local receiver on 127.0.0.1:3999. The smoke-test block was removed from `.env.local` afterwards; the base development values remain.

**Data written to the local dev database (left in place):** 2 `bookings` (provider `smoke`), 1 `users` (+30 691 234 5678), sessions/refresh families, 4 `booking_claim_grants`, 2 `stay_requests` + outbox events (DELIVERED), 1 `check_in_requests` (rejected) + 3 outbox events, 1 `terms_acceptances`, 5 `security_audit_events` (cors_violation), 1 `admin_sessions`. `rate_limits` was truncated twice to get past the 5-attempt limiters. `run-operational-maintenance` applied retention (deleted 49 old analytics hits and 72 vitals from July).

**Side effects reverted:** the `nextjs-agent-rules` block that `next dev` appended to `CLAUDE.md` (R-115); the dev server, webhook receiver and `site-dev-db` were stopped (the container was stopped before this session too).

## Open questions for the owner
1. Production process time zone and deployment path (Docker vs systemd host): decides whether R-106 is already corrupting dates and whether R-133 applies.
2. How should `Booking` rows be created (R-105 / R-008): admin form, import script, or external system?
3. Local development identity (R-114): document the header simulation, ship a tiny dev proxy, or approve a development-only loopback resolver?
4. Keep Next's `agentRules` block or disable it (R-115)?
5. Service-worker strategy (R-112/R-113): network-first HTML with build-versioned `sw.js`, or drop HTML precaching?
6. Idempotency semantics for mismatched payloads (R-157).

### R-314: Item-level emoji `icon` values are no longer rendered after R3-V2d
- Severity: Low
- Category: Unused
- Status: SUSPECTED
- Location: src/data/schemas.ts:47, src/data/items/phones.json:12-56
- Evidence: `icon: z.string().optional(),` (ItemSchema); phones.json `"icon": "🆘"`, `"🚓"`, `"🚒"`; `src/app/[locale]/[category]/page.tsx:74` passes `icon: cat.icon` (category icon), not the item's.
- Problem: R3-V2d typed category icons as `IconName` and stopped passing item icons; item emoji values remain in data and schema.
- Impact: dead data; a future renderer could reintroduce emoji icons against §6.
- Fix: in R3-V8 (guide restyle) either map item icons to `IconName` (`z.enum(ICON_NAMES)`) or drop the field from the schema and data.
- Fix risk: content validation (`scripts/validate-content.ts`) and the phones page.
- To confirm: reference search for item `icon` consumers (CategoryGridClient.tsx:107, FavoritesClient.tsx:47 receive the mapped value) and render the phones page.

### R-315: House location highlight icons are never drawn (the R3-V2d bus fix is invisible)
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/components/CheckInInfo.tsx:314
- Evidence: `t.locationPanel.highlights.map(({ title, description }) => ({` drops `icon` from `src/i18n/domains/house.ts` highlights.
- Problem: the typed `icon` on each highlight has no renderer.
- Impact: none visible today; the icon data is dead until a renderer uses it.
- Fix: render `<Icon name={icon} />` in the check-in location panel during R3-V9, or drop the field.
- Fix risk: check-in component tests and G-VIS on /check-in.
- Resolution (R3-Z1): `CheckInInfo.tsx` keeps `icon` in `LocationHighlight` and its mapping and draws each highlight with the shared `@/components/icons/Icon` (whose `IconName` the house.ts data already uses; museum, plane, map-pin, beach and bus all exist there, so no fallback was needed) instead of the local fixed `mapPin`. Town Hall keeps `museum`: the set has no closer civic-building glyph. Regression test `tests/components/checkin-location-highlights.test.tsx` (en, el) failed before and passes after.

## Dead-code sweep 2026-09-29 (beyond knip; each finding verified by an independent refuter)

Scope: unused CSS, i18n keys, static assets/data fields, props/params/branches, duplicated helpers, legacy shims. 42 raised, 41 confirmed, 1 rejected (legacy ignore entries: owner-declined in R-102). Informational items (tokens without consumers yet; selectors that look dead but are library-emitted; all other i18n keys are read) are not listed as findings.

### R-316: Dead .icon rule set (no element carries class "icon")
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/styles/05-primitives.css:L192-L213
- Evidence: Rules: `.icon {width:1em;...stroke-width:1.75}` (L193-201), `.icon[data-thick="true"]` (L203-205), `.icon path,.icon circle,.icon line,.icon polyline,.icon rect` (L207-213). Searches: `grep -rnE "class(Name)?=\{?[\"'\`]([^\"'\`]* )?icon( |[\"'\`])" src public` -> 0 hits; `grep -rn "classList.add('icon" src public` -> 0; `grep -rn data-thick src public` (non-styles) -> 0. The only string token "icon" in src is the JSON key in src/data/items/phones.json ("icon": "🆘"), not a class. src/components/icons/Icon.tsx:81-94 renders `className={className}` (caller-supplied only), never a literal "icon". Token-level scan of every string/template literal in src+public (script tok.py) found no className use.
- Problem: Legacy iconography normalization targets a class no component emits; the new Icon component sets its own stroke attributes.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Delete L192-L213 (comment + three rules). knip does not analyse CSS, so it is blind to this.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K1
- Verifier: Nothing emits the `icon` class, so the finding holds up. I confirmed src/styles/05-primitives.css:L192-L213 contains the comment and the three `.icon` rules. Searches across src, public and scripts turned up only compound class names (checkin-icon-token, checkin-accent-token, home-feature-icon, contact-row-icon, guest-menu-*-icon, moment-card-service-icon and similar). The remaining matches are the JSON key "icon" in phones.json and `.icon` property accesses. None of these produce a bare `icon` class token. Icon.tsx:81-97 sets className only from its caller and sets its own stroke width of 1.75, so these rules are redundant for it. The only Leaflet divIcon class is 'leaflet-custom-marker', and Leaflet itself emits 'leaflet-marker-icon', not 'icon'. `data-thick` appears nowhere except the CSS. The rules are not referenced from docs or public, and knip does not analyse CSS. It is safe to delete L192-L213 now.

### R-317: #__next selectors are dead under App Router
- Severity: Nit
- Category: Legacy
- Status: CONFIRMED
- Location: src/styles/05-primitives.css:L229 and L236
- Evidence: L228-230: `html[data-theme="light"],\nhtml[data-theme="light"] #__next,\nhtml[data-theme="light"] .min-h-screen {`; L235-237 same under `html:not([data-theme])`. `ls src/pages pages` -> both missing (App Router only). `grep -rln '"__next"' node_modules/next/dist/server/app-render node_modules/next/dist/client/components` -> 0 files; the id is only in node_modules/next/dist/server/render.js (Pages Router renderer). `grep -rn __next src public` (outside styles) -> 0.
- Problem: `#__next` is the Pages Router root div; the App Router never renders it, so these selector-list entries never match.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Remove only the two list entries (L229 and L236); keep `html[...]` and `.min-h-screen` parts. Specificity of the remaining selectors is unchanged (each list item is scored separately).
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K1
- Verifier: Confirmed. src/styles/05-primitives.css L228-230 and L235-237 include `#__next` entries. There is no src/pages or pages directory, so the app uses only the App Router. Nothing in src, public, scripts, tests or next.config mentions `__next` outside these two CSS lines. In node_modules/next/dist, the only places that emit `id: "__next"` or call getElementById('__next') are Pages Router files: server/render.js, client/index.js and compiled/next-server/pages*.runtime.*. The one app-render match is `__next-page-redirect`, which is a different id. Next's built-in Pages fallback pages (such as _error) might still render a `#__next` div. Even then, this stylesheet is global CSS imported through the App Router layout and does not load on those pages, so the entries cannot match anything. Removing only the two `#__next` list items leaves the `html[...]` and `.min-h-screen` selectors and their specificity unchanged. It is safe to remove now (Nit).

### R-318: Dead .leaflet-origin-marker selectors (no emitter)
- Severity: Nit
- Category: Unused
- Status: CONFIRMED
- Location: src/styles/08-vendor.css:L283, L318, L420, L431
- Evidence: `.leaflet-container-custom .lmk,\n.leaflet-origin-marker .lmk {` (L282-283), `.leaflet-container-custom .lmk[data-type='apartment'],\n.leaflet-origin-marker .lmk {` (L317-318), `[data-theme='dark'] .leaflet-origin-marker .lmk` (L420), `:where(:root):not([data-theme]) .leaflet-origin-marker .lmk` (L431). `grep leaflet-origin` over src public tests scripts (non-styles) -> 0 hits; `grep -c leaflet-origin node_modules/leaflet/dist/leaflet-src.js` -> 0 (not library-emitted). LeafletMap.tsx:70-71 uses `L.divIcon({ className: 'leaflet-custom-marker' ...})` and the origin marker at L123/188 uses `buildIcon('service')`, never this class.
- Problem: Custom class not emitted by the app nor by Leaflet; these list entries never match.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Drop the four `.leaflet-origin-marker .lmk` list entries; keep the `.leaflet-container-custom .lmk...` siblings. Note L317-318 rule would then contain only the `[data-type='apartment']` selector.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K1
- Verifier: I couldn't refute this finding. Nothing outside src/styles/08-vendor.css contains "origin-marker" or "leaflet-origin". I searched src, public, tests, scripts, docs and next.config, including template strings and concatenations. The only hits for "origin" were unrelated: HTTP origin headers, the guest select id="origin" and the CSP 'original-policy' field. Leaflet itself never emits the class: `grep -c origin-marker node_modules/leaflet/dist/leaflet-src.js` returns 0. The only class LeafletMap.tsx adds to markers is 'leaflet-custom-marker' (L71). It also adds and removes 'marker-pop' at L246-247, and sets 'leaflet-container-custom' on the map container at L262. The origin prop (L43/L93/L123) is only pushed into the bounds points. It never sets a class. All four `.leaflet-origin-marker .lmk` selector-list entries (L283, L318, L420, L431) are dead, and they can be removed now. Each one is a single entry in a comma-separated selector list, so dropping it leaves the sibling `.leaflet-container-custom ...` selectors and their declarations unchanged.

### R-319: Dead class tokens inside :not() chains (btn-accent, btn-secondary, guide-option-card)
- Severity: Nit
- Category: Unused
- Status: CONFIRMED
- Location: src/styles/09-utilities.css:L214, L219, L223, L238, L243, L248
- Evidence: Each line has `a:not(.btn-primary):not(.btn-accent):not(.btn-outline):not(.btn-tint):not(.btn-secondary):not(.apartment-btn-primary):not(.home-feature-card):not(.guide-option-card):...`. Searches: `g.sh btn-accent` -> 0 hits; `g.sh btn-secondary` -> only `apartment-btn-secondary` (ApartmentCinematic.tsx:164), no bare `btn-secondary`; `g.sh guide-option` -> 0 hits. No template prefix like `btn-${` exists (prefix scan found only tab-, panel-, title-, desc-, sec-, checkin-status-).
- Problem: Three excluded classes are never emitted, so those :not() clauses are no-ops that only inflate specificity.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Remove `:not(.btn-accent)`, `:not(.btn-secondary)`, `:not(.guide-option-card)` from the six selectors. Fix risk: each removal lowers specificity by (0,1,0) (from ~0,15,2 to ~0,12,2); a rule setting anchor color with specificity in that band would now win. Visual check of dark-mode links required. Alternatively leave for R3-V12 wholesale deletion.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-V12
- Verifier: I couldn't find any use of the three classes, so the finding holds. I searched with word boundaries across src, tests, scripts, public and docs for bare `btn-accent`, `btn-secondary` and `guide-option-card`. The only hits are the six :not() selectors in src/styles/09-utilities.css (L214, L219, L223, L238, L243, L248). Everything else is a different class: `apartment-btn-secondary` (12-apartment-checkin.css, ApartmentCinematic.tsx:164) and `.guide-option-title` (12-apartment-checkin.css:729). A search for class names built at runtime (`btn-${`, a variant set to accent or secondary) found nothing. So none of the three is emitted today, and their :not() clauses exclude nothing. Removing them removes no exclusion, but it lowers each selector's specificity by (0,3,0), which is the only way it could change what renders. The finding already states that risk and correctly keeps removeNow=false, deferring to the planned R3-V12 deletion of the legacy CSS. Minor wording note: `guide-option` does appear in the CSS as `.guide-option-title`, so "0 hits" is true only for code that emits classes, not for the whole repo.

### R-320: Dead .guide-option-title in site-wide title typography list
- Severity: Nit
- Category: Unused
- Status: CONFIRMED
- Location: src/styles/12-apartment-checkin.css:L729
- Evidence: L726-735: `:where(h1,...,h6),\n.page-title,\n.section-title,\n.guide-option-title,\n.moments-hero-title, ... { font-family: var(--font-title-stack);`. `g.sh guide-option` over src public tests scripts -> 0 hits.
- Problem: List entry for a class no element carries.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Remove only the `.guide-option-title,` line at src/styles/12-apartment-checkin.css:L729. Also update the stale L562 reference in REVIEW.md R-250/D3.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K1
- Verifier: Confirmed. src/styles/12-apartment-checkin.css:L729 has `.guide-option-title,` in the title font-family list (L726-735). A repo-wide grep for "guide-option" (excluding node_modules, .next, .git) finds it only in that CSS line, in the unrelated `:not(.guide-option-card)` chains in 09-utilities.css, and in REVIEW.md (R-250, which already records this as dead). No dynamic construction exists either: grepping src, scripts, tests and public for option-title, -option, `guide-${`, 'guide-' and optionTitle turns up only security-header strings. No library emits this class. Removing it is a no-op: it is one comma-separated entry in a selector list, so the other selectors keep the same specificity and behaviour. It is safe to remove now, and the file is not in the excluded areas. REVIEW.md cites L562, which is outdated; the current line is L729.

### R-321: Dead @keyframes subtle-shimmer
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/styles/06-semantic-surfaces.css:L213-L224
- Evidence: `/* Add shimmer effect */\n@keyframes subtle-shimmer { 0%,100% {filter: brightness(1) saturate(1);} 50% {...} }`. `grep -rnw -- subtle-shimmer src public` (excluding the @keyframes line) -> 0 hits; `grep -n shimmer src/styles/*.css` -> only L213-214. No Tailwind `animate-[subtle-shimmer...]` or inline style reference. Other keyframes checked and used: toast-in (05:189 via .toast-item, emitted in Toast.tsx:40), marker-pop (08:325, class added in LeafletMap.tsx:246), heroPan (12:989/992 via .hero-ken-burns).
- Problem: Animation defined but never referenced by any animation property.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Delete src/styles/06-semantic-surfaces.css L213-L224 (the "/* Add shimmer effect */" comment through the closing brace of @keyframes subtle-shimmer). The REVIEW.md entry cites the old line range 06:L144-L156, so update it.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K1
- Verifier: I couldn't refute this one. I searched the whole repo for "shimmer" (skipping node_modules, .next and .git). In code it appears only at src/styles/06-semantic-surfaces.css:213-214, which is the comment and the @keyframes line. The other hits are REVIEW.md, which already lists it as dead, and design notes in docs/design/identity.md that talk about a future shimmer and don't reference this one. `grep -rn -e "subtle-" -e "animationName" -e 'animate-\['` over src returns only the definition, so nothing builds the animation name dynamically. No tailwind config or next.config refers to it either. The block covers L213-L224: the comment, the @keyframes rule and its closing brace. It is standalone, so removing it has no side effects.

### R-322: Dead legacy custom properties in 01-tokens.css
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/styles/01-tokens.css:L6, L45-L46, L48-L51, L61, L101, L139-L140, L148
- Evidence: Definitions: `--foreground` (L6, L148), `--badge-info-bg` (L45), `--badge-info-fg` (L46), `--badge-warn-fg` (L48), `--badge-ok-bg` (L49), `--badge-ok-fg` (L50), `--danger-600` (L51), `--accent-200` (L61), `--shadow-lg` (L101), `--color-background` (L139), `--color-foreground` (L140). For each: `grep -rnE -- "--NAME([^a-zA-Z0-9_-]|$)" src public tests scripts next.config.ts docs | grep -vE -- "--NAME\s*:"` -> 0 hits (sanity: same command for --sand-50 -> 18 hits). Tailwind check in built CSS .next/dev/static/chunks/src_app_globals_css_1igg3k2._.single.css: `grep -c 'var(--shadow-lg)'` -> 0 (`.shadow-lg` inlines `0 10px 15px -3px var(--tw-shadow-color,#0000001a)...`); no `bg-background`/`text-foreground` utilities in src; --color-background/--color-foreground are in a plain :root (L138-144), not @theme, so Tailwind generates no utility from them. NOT dead (excluded from this finding): --radius-xl (built `.rounded-xl{border-radius:var(--radius-xl)}`), --font-serif/--font-mono (`.font-serif`/`.font-mono` use them), --rdp-* in 08-vendor.css (consumed by react-day-picker/src/style.css, imported in DateRangePicker.tsx:15 and AvailabilityPlanner.tsx:5).
- Problem: Variables are set on :root/[data-theme=light] but nothing reads them. Dark-mode counterparts of --foreground, --accent-200, --badge-*, --danger-600 also exist in src/styles/04-theme.css (L4, L23, L44-L50, L114, L133, L154-L160), which is in the concurrently edited/excluded area.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Delete the listed declarations from 01-tokens.css (keep --background, --font-serif, --font-sans, --font-mono, --radius-xl). Coordinate the 04-theme.css counterparts with the job owning that file, or leave both to R3-V12.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K1
- Verifier: I tried to refute this and couldn't. All 11 declarations sit at the lines the finding gives in src/styles/01-tokens.css (6, 45, 46, 48, 49, 50, 51, 61, 101, 139, 140, 148).

1. **No readers anywhere.** I searched src, public, tests, scripts and docs with the anchored regex `--NAME([^a-zA-Z0-9_-]|$)`, leaving out the definitions themselves. Each name got 0 hits.
2. **No dynamic use.** Searches for template or concatenated custom-property names (`--${`, `` `-- ``, setProperty, getPropertyValue) turned up nothing relevant.
3. **The test file doesn't read this file.** The only dynamic token lookup is in tests/unit/design-tokens.test.ts, and it parses src/styles/tokens.css, not 01-tokens.css. No script reads 01-tokens.css.
4. **tokens.css, base.css, motion.css and globals.css don't define or read any of these names.** So removing them can't change an override order.
5. **`--shadow-lg` looks used but isn't.** The `shadow-lg` class is used (error.tsx:99, availability/page.tsx:108, about/page.tsx:27, admin/guests/page.tsx:294, ui/Surface.tsx:21). But in the built CSS (.next/dev/.../src_app_globals_css_1igg3k2._.single.css), the `.shadow-lg` rule at L2484-2486 writes the shadow value out directly and never uses `var(--shadow-lg)`. Tailwind's theme `--shadow-lg` (L169) is overridden only by the 01-tokens copy (L3640), and nothing consumes either. Removing it changes nothing on screen.
6. **`--color-background` / `--color-foreground`** are in a plain :root block, not @theme. No `bg-background` or `text-foreground` utilities exist in src.

The same set is already recorded in REVIEW.md around L3665-3675, with matching search evidence, so this is a duplicate of an existing finding rather than a new one. The fix is correct, but the matching 04-theme.css declarations (dark mode) are in the excluded file owned by the other job and should be removed in coordination with it, or left for R3-V12.

### R-323: Dead custom properties --seg-gap and --moments-card-bg-soft
- Severity: Nit
- Category: Unused
- Status: CONFIRMED
- Location: src/styles/07-search-listing.css:L3; src/styles/10-moments.css:L8, L670, L786
- Evidence: 07:L2-3 `.booking-bar {\n  --seg-gap: 1px;`; 10:L8 `--moments-card-bg-soft: color-mix(in srgb, var(--layer-surface-alt) 62%, var(--sand-50));` plus dark copies at L670 and L786. `grep -rnE -- "--seg-gap([^a-zA-Z0-9_-]|$)" src public tests scripts docs | grep -v "--seg-gap\s*:"` -> 0; same for --moments-card-bg-soft -> 0 (no var() in CSS nor TSX style props).
- Problem: Defined, never read.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Delete the declaration lines (07:L3; 10:L8, L670, L786).
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K1
- Verifier: The finding holds. I ran `git grep` across the whole repo (excluding src/generated and the lockfile) for "--seg", "moments-card-bg", "getPropertyValue" and dynamic `--${...}` template strings. The only hits for --seg-gap and --moments-card-bg-soft are their declarations: 07-search-listing.css:3 and 10-moments.css:8, 670 and 786. No var() reads them and no JS reads or sets them dynamically. The only var(--moments-card-bg...) reads are of the separate --moments-card-bg property (e.g. 10-moments.css:174, 326, 590), which the fix does not touch. Nothing inherits or consumes either property, so deleting the four lines changes no computed style. Neither file is in the excluded areas, so it is safe to remove now. The same finding is already recorded in REVIEW.md:3673.

### R-324: Fully shadowed duplicate rule blocks in 12-apartment-checkin.css
- Severity: Nit
- Category: Unused
- Status: CONFIRMED
- Location: src/styles/12-apartment-checkin.css:L2-L6, L8-L13, L16-L24, L56-L59, L76-L79, L122-L125, L143-L146, L157-L159, L161-L163, L166-L170 (shadowed by L812-L876)
- Evidence: Identical selector+body (whitespace-normalized, same context) found by dup.py: `[data-theme="dark"] .apartment-spec-badge` L8 == L817; its prefers-color-scheme copy L17 == L826; `[data-theme="dark"] .apartment-footer-text` L161 == L866; media copy L167 == L872. Same selector, same properties, later wins: `.apartment-spec-badge` L2 (border var(--page-border), background, box-shadow) vs L812 (border var(--apartment-border), same props); `[data-theme=dark] .apartment-btn-primary--depth` L56 vs L837 (box-shadow only); media copy L76 vs L849; `[data-theme=dark] .apartment-btn-secondary--depth` L122 vs L843; media L143 vs L859; `.apartment-footer-text` L157 (var(--page-muted)) vs L863 (var(--apartment-muted)). Both emitters sit inside `.apartment-cinematic-container` (ApartmentCinematic.tsx:85, :153, :170) which defines --apartment-border/--apartment-muted (12:L741-757), so the later rules always compute valid values. Partially shadowed (box-shadow only; `background` still live): L61-L65 and L82-L86 - keep those.
- Problem: Legacy block from a moved component style (L739 comment 'moved from component-level global style block') re-declares earlier rules with equal specificity, so the earlier blocks never take effect.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Delete the fully shadowed earlier blocks listed (keep L812-L876). Behavior-preserving since equal specificity and later source order already wins. Low value given R3-V12 will delete the file; can be left to that task.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-V12
- Verifier: I checked this against src/styles/12-apartment-checkin.css and could not refute it. Every listed early block has a later twin in the same file, at top level or in the same prefers-color-scheme media context, with the same selector and specificity. The later twin sets every property the early block sets: L2-6 vs L812-816 (border, background, box-shadow); L8-13 vs L817-822; L16-24 vs L826-831; L56-59 vs L837-839; L76-79 vs L849-851; L122-125 vs L843-845; L143-146 vs L859-861; L157-159 vs L863-865; L161-163 vs L866-868; L166-170 vs L872-874. A brace-depth scan shows L812 onward is not nested in any unclosed at-rule (the '}' at the start of L811/L862 only closes the preceding media block). The file has no @layer, @scope or @import. It is imported once, via src/app/globals.css:16, so moving source order cannot change this. The @supports blocks near L988 do not touch these selectors. The early blocks lose even if --apartment-border or --apartment-muted were undefined: an undefined var() does not bring back the losing declaration, it only makes the winning one fall back to its initial or inherited value. So deleting the early blocks cannot change computed styles. The finder correctly keeps L61-65 and L82-86, which are only partly shadowed (their `background` still applies), as well as the base .apartment-btn-*--depth rules, whose transform, :active and hover transforms are not re-declared later. The fix is behavior-preserving and safe to apply now; deferring it to R3-V12 is only a priority choice.

### R-325: 14 momentTags entries (en+el) can never be looked up: no content item carries these tags
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/i18n/domains/common.ts:247-250,253,256,260,262-263,267,269-272 (en) and :418-421,424,427,431,433-434,438,440-443 (el); type at common.ts:97 (momentTags: Record<string, string>)
- Evidence: momentTags is read ONLY by dynamic key lookup: src/components/moments/MomentCard.tsx:58-59 `return tags?.find(candidate => tagNames[candidate]);` + :174-175 `t.momentTags[tagKey]`; src/components/moments/MomentsDetailLayout.tsx:147 `{t.momentTags?.[tag] ?? tag}` (fed from [slug]/page.tsx:82 `momentTags: t.momentTags`). The lookup keys are item.tags from content. Items come only from src/data/items/<category>.json (src/lib/data.ts:8,25 dataRoot = src/data/items; categories.ts has only phones and moments). All distinct tags across moments.json + phones.json (node walk over every `tags` array, case preserved): `archaeology culture emergency health history hospital medical military museum outdoor police railway safety transport`. Dictionary has 28 momentTags keys; these 14 are not in that set: bar, beach, brunch, cafe, food, hiking, mountain, nearby, nightlife, restaurant, sightseeing, site, taygetos, taxi ('taxi' exists in phones.json only as an item id at :103, not as a tag). Other tag emitters checked: grep `tags(:|\s*=)` in src -> only pass-through (check-in/page.tsx:35, [category]/page.tsx:71, [slug]/page.tsx:67, CategoryGridClient.tsx:112) and mapLocations.ts:223 which lowercases item.tags for icon choice, not a dictionary lookup. Tests: tests/components/i18n-copy.test.tsx:27,35 read momentTags.emergency and .museum only (both kept). knip/tsc are blind because momentTags is typed Record<string,string> and accessed by computed key.
- Problem: 28 x 2 locale entries are carried, but 14 per locale are unreachable with the current content; the i18n translation of these strings is dead data.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Delete the 14 listed keys from both en and el momentTags blocks. No code change needed: MomentCard skips unknown tags (find returns undefined) and MomentsDetailLayout falls back to the raw tag. Caveat: if content later adds one of these tags, the detail page would show the raw English tag; re-add the key together with the content. Run tests/components/i18n-copy.test.tsx and npm test afterwards.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-C2 (tags may be used by new guide content)
- Verifier: Confirmed. momentTags is read only through computed keys: MomentCard.tsx:58-59 and 174-175, and MomentsDetailLayout.tsx:147, which gets it from [slug]/page.tsx:81. Tests read only emergency and museum (i18n-copy.test.tsx:27,35). No reference exists in scripts, docs, prisma or public, and validate-content.ts does not check tags. Items come only from src/data/items/*.json (src/lib/data.ts:8,25). The distinct tags in moments.json and phones.json are: archaeology culture emergency health history hospital medical military museum outdoor police railway safety transport. That leaves the 14 listed keys unreachable in both en and el. MomentsFilterMenu uses its own filter labels, not momentTags. Removal is safe: MomentCard's find() skips unknown tags and MomentsDetailLayout falls back to the raw tag. Removing the same keys from en and el keeps the two locales in parity. Related but outside this finding: the tag-to-class mapping in MomentCard.tsx:49-53 (beach/restaurant/food/brunch/cafe/bar/nightlife/taygetos/mountain/hiking/site/sightseeing) and filterToTags in MomentsFilterMenu.tsx both check the same absent tags, so they are equally dead with the current content and should be handled consistently.
- Resolution: DECLINED (kept), V8/C2 decision, recorded 2026-10-06: the tag labels stay for future guide content; after C2 the guide uses 11 of the 28 keys (moments.json), MomentCard skips unknown tags, and the phones data uses its own tags. Re-check if the guide content is final.

### R-326: 6 momentsFilters labels are read but their filter chips can never render with current content
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/i18n/domains/common.ts:303-313 (en: beaches, restaurants, bars, brunchs, taygetos, nearby) and :474-484 (el); logic in src/components/moments/MomentsFilterMenu.tsx:4-21,41-51 and src/components/CategoryGridClient.tsx:86-91
- Evidence: Keys are statically read by labelsFor() (MomentsFilterMenu.tsx:41-51 `beaches: ui.beaches, ... nearby: ui.nearby`), so they are NOT dead keys in the strict sense. But chips render only for availableFilters: CategoryGridClient.tsx:87-88 `MOMENTS_FILTER_KEYS.filter((filter) => (filter === 'all' || filterMomentsByCategory(items, filter).length > 0))`. filterToTags (MomentsFilterMenu.tsx:11-21) maps beaches->['beach'], restaurants->['restaurant','food'], bars->['bar','nightlife'], brunchs->['brunch','cafe'], taygetos->['taygetos','mountain','hiking'], nearby->['nearby']; none of these tags exist in moments.json/phones.json (tag set listed in the momentTags finding). Only museums (museum) and sites (archaeology, history) can ever be available. tests/components/i18n-copy.test.tsx:69 asserts momentsFilters.brunchs === 'Brunch' (would need updating).
- Problem: Six filter keys, their label strings (en+el), their filterToTags entries and the typed props (CategoryGridClient.tsx:56, MomentsFilterMenu.tsx:28-38) are effectively dead UI today; removing them is a code+content decision, not a pure key deletion.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Do not remove this as a key-only change. Either (a) keep the six filters if the owner plans to tag content with beach, restaurant, bar, brunch, taygetos or nearby, or (b) remove them in a dedicated task. That task drops beaches, restaurants, bars, brunchs, taygetos and nearby from these places: MOMENTS_FILTER_KEYS and filterToTags (MomentsFilterMenu.tsx:4-21), labelsFor and the ui prop type (MomentsFilterMenu.tsx:28-51), the filters prop type in MomentsToolbar.tsx:19-30, the momentsFilters prop type in CategoryGridClient.tsx:56, both locale blocks in src/i18n/domains/common.ts (en ~303-313, el ~474-484), and the momentsFilters.brunchs assertion in tests/components/i18n-copy.test.tsx:69. Leave the mapLocations.ts:230-233 tag classifier alone; it is independent. This needs an owner decision on the content roadmap.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-C2 (keep: C2 adds beaches/food/Taygetos content)
- Verifier: Confirmed. Items come only from src/data/items/<categoryId>.json, read at runtime by src/lib/data.ts:16-45. The only tags in moments.json are archaeology, culture, history, military, museum, outdoor and railway. phones.json has emergency, health, hospital, medical, police, safety and transport. None of these matches the tag lists for beaches, restaurants, bars, brunchs, taygetos or nearby (MomentsFilterMenu.tsx:11-21). filterMomentsByCategory (MomentsFilterMenu.tsx:88-95) filters strictly by those tags, and CategoryGridClient.tsx:86-91 shows a chip only when the filter is 'all' or matches at least one item. So these six chips never render with today's content. The beach/bar/cafe/restaurant tag checks in mapLocations.ts:230-233 are a separate map-icon classifier and do not use these keys. Classifying this as Low severity that needs an owner decision, not a key-only removal, is correct. The fix is incomplete, though: it misses a third copy of the typed props, in src/components/moments/MomentsToolbar.tsx:19-30 (`filters: {all; beaches; ...; nearby}`). CategoryGridClient.tsx:141 passes momentsFilters to it as `filters={momentsFilters}`, and it forwards them to CategoryChips as `ui={filters}` (MomentsToolbar.tsx:64).
- Resolution: option (a), V8/C2 decision, recorded 2026-10-06: the filters stay; after C2 Beaches (2), Restaurants (3) and Taygetos (1) render, and chips without content (Bars, Brunch, Nearby) stay hidden by the "render only with content" rule (guideFilters.ts).

### R-327: Unreferenced image public/house/living/living_1_booking.webp
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: public/house/living/living_1_booking.webp
- Evidence: CONFIRMED. I grepped the whole repo for each public asset basename, excluding node_modules/.next/.git/graphify-out, and got zero hits for living_1_booking.webp. Dynamic construction ruled out: `grep -rnE "_booking|living_1_|'/house/|`/house|\.webp" src scripts tests public/sw.js docs` returned only the balcony hero webps, the phones.json heroes and the tokens.css grain URLs. housePhotos.ts lists only /house/living/living_1..8.jpeg. docs/design/identity.md:941 already classifies it: "`living_1_booking`: duplicate". `git log -S living_1_booking` shows only daed8bf, which added it. File size 16706 bytes. knip cannot see it because knip does not analyse public/ static files.
- Problem: This static asset is shipped in the image and served publicly, but nothing emits its URL.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Delete public/house/living/living_1_booking.webp. The only other mention is the identity.md:941 table note ("`living_1_booking`: duplicate"), which you can update or leave.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K1
- Verifier: I tried to refute this finding and could not. Nothing in the repo points to the file.

- An exact-name grep over the whole repo (skipping node_modules, .next, .git and graphify-out) finds `living_1_booking` in one place only: the table at docs/design/identity.md:941, which already marks it "duplicate".
- No code builds the path at runtime. src/data/housePhotos.ts lists only /house/living/living_1..8.jpeg.
- The only hardcoded /house URLs are the balcony_1 images in apartment/page.tsx and HomeHero.tsx.
- No script, test, public/sw.js or next.config file reads the public/house directory or globs it.

knip does not analyse files under public/, so it cannot catch this case. The file is 16706 bytes and nothing else depends on it, so deleting it now is safe.

### R-328: Item `icon` field (emoji strings in phones.json) validated by ItemSchema but never read
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/data/items/phones.json:12,26,56,81,117; src/data/schemas.ts:48
- Evidence: CONFIRMED. phones.json:12 `"icon": "🆘"`, :26 `"🚓"`, :56 `"🚒"`, :81 `"🏥"`, :117 `"🚕"`; schemas.ts:48 `icon: z.string().optional(),` (item schema). `grep -rnE "(item|i|it|entry|x)\.(icon|featured)\b"` over src/tests/scripts gives these readers: [category]/page.tsx:74 `icon: cat.icon` (category icon, not item), CategoryGridClient.tsx:107 `icon={i.icon}` (the mapped object whose icon comes from cat.icon), FavoritesClient.tsx:47 (favorites/page.tsx:29 `icon: cat.icon`), and CheckInInfo/about/ContactSection (local arrays). No item mapping ([category]/page.tsx:66-84, [slug]/page.tsx:59-90, check-in/page.tsx:30-43) copies item.icon. The design moved to the Icon set: icon-data.test.ts:10 says "the data used to carry emoji strings as icons", and CategorySchema.icon is z.enum(ICON_NAMES).
- Problem: These are legacy emoji icons that still live in the data. The loose `z.string()` schema field accepts them, but no code renders them. Unlike CategorySchema, which rejects emoji, the item schema still permits them.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: The proposed fix is correct, with one ordering note. ItemSchema is a plain z.object, not strict, so it silently drops unknown keys. Removing only the schema line would leave dead emoji data behind with no error, so delete both parts together:
1. Remove the five "icon" keys at src/data/items/phones.json:12, 26, 56, 81 and 117.
2. Remove `icon: z.string().optional(),` at src/data/schemas.ts:48.
It can be removed now; it is not tied to a later V-task. To verify, run `npm run typecheck`, `tsx scripts/validate-content.ts`, tests/unit/data-map-navigation.test.ts, tests/unit/icon-data.test.ts and the full `npm test`.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K2
- Verifier: I tried to refute this and could not, so the finding stands. Items are only loaded through getItemsByCategory/getItem in src/lib/data.ts. Every place that uses them copies fields one by one, and none reads item.icon:
- [category]/page.tsx:66-84 and favorites/page.tsx:24-31 set `icon: cat.icon`, the category's icon.
- [slug]/page.tsx:59-90 builds MomentsDetailLayout props field by field.
- check-in/page.tsx:30-43 mapItem has no icon.
- mapLocations.ts createMapLocationFromItem has no icon.
- validation.ts only checks name_* fields.
- sitemap.ts only uses slugs.
No code passes a whole Item object to a client or serializes it. `grep -rnE "\.icon\b|\['icon'\]|\"icon\""` over src, tests and scripts finds only category icons, local arrays (about, CheckInInfo, ContactSection, TopControls) and CSS `.icon` classes. tests/unit/icon-data.test.ts only checks categories, house highlights and about items, and scripts/validate-content.ts has no icon reference. Only items/phones.json carries "icon"; moments.json has none. Knip cannot see this case because it is a JSON data key plus a schema property, not an export.

### R-329: Item `featured` flag set in data and schema but never consumed
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/data/schemas.ts:51; src/data/items/moments.json:35,67,100,133,170; src/data/items/phones.json:16,46,100
- Evidence: CONFIRMED. `grep -rn featured src tests scripts` (ts/tsx/mjs/css) finds, outside the schema, only the nav-menu `featured` (src/components/navigation/menuLinks.ts, TopControls.tsx, 02-layout.css .is-featured, data-map-navigation.test.ts:181). That is a different MenuLink type in an excluded area. No item-to-props mapping reads item.featured ([category]/page.tsx:66-84, [slug]/page.tsx:59-90, check-in/page.tsx:30-43, mapLocations.ts createMapLocationFromItem). docs/design/identity.md contains no "featured" plan for guide items.
- Problem: Eight data entries and one schema field carry a flag that has no effect. This misleads content editors into thinking featured items are highlighted.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Remove `featured: z.boolean().optional(),` from src/data/schemas.ts:51. Also remove the `"featured": true` key from moments.json (lines 35, 67, 100, 133, 170) and phones.json (lines 16, 46, 100), along with the trailing comma on the line before each one so the JSON stays valid. Leave the unrelated nav-menu `featured` in menuLinks.ts and TopControls.tsx untouched (excluded area). Afterwards run `npm run build` content validation (scripts/validate-content.ts) or `npm test` to check the JSON still parses.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K2
- Verifier: I confirmed the finding. `grep -rn featured` across src, tests, scripts, docs, public, prisma and next.config (src/generated excluded) finds only three kinds of hits. The first is the schema field at src/data/schemas.ts:51. The second is the 8 `"featured": true` keys in moments.json and phones.json. The third is the nav-menu MenuLink.featured flag in menuLinks.ts, TopControls.tsx, the 02-layout.css .is-featured rules and data-map-navigation.test.ts:181. That nav-menu flag is a separate type in an area excluded from this sweep. No component, page, map helper, script or test reads item.featured. Grepping for `...item` spreads found none, so the flag cannot reach a component through a props spread. There are no snapshot tests on the item JSON. ItemSchema is a plain `z.object` without `.strict()`, so removing the field from both the schema and the JSON is safe. Removing it from the schema alone would also be safe, because zod drops unknown keys by default. The finding does not depend on any later V-task.

### R-330: reservationUrl never populated: dead Reserve button branch and dead `cta.reserve` strings
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/data/schemas.ts:44; src/app/[locale]/[category]/[slug]/page.tsx:76; src/components/moments/MomentsDetailLayout.tsx:37,45,130-134; src/i18n/domains/common.ts:59,207,378
- Evidence: CONFIRMED. `grep -rn reservationUrl src/data tests` returns only schemas.ts:44 `reservationUrl: z.url().optional(),`. The field summary over the items JSON (node script) shows no reservationUrl key in moments.json (5 items) or phones.json (5 items). The only consumer is [slug]/page.tsx:76 `reservationUrl: item.reservationUrl || undefined,`, feeding MomentsDetailLayout.tsx:130 `{urls.reservationUrl && (<Button ...>{t.cta.reserve}</a>`. `grep -rn "\.reserve\b|'reserve'"` shows cta.reserve used only there. common.ts:207 "Reserve", :378 "Κράτηση".
- Problem: The Reserve button branch can never render, and its i18n key and type field are carried for nothing.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Remove reservationUrl from ItemSchema, the [slug] page urls prop, the MomentsDetailLayout urls type, and the conditional button block at L130-134. Also remove `reserve` from the cta type and both dictionaries in common.ts. Run typecheck and the i18n-copy test. If R3-V8 rebuilds MomentsDetailLayout anyway, this can fold into V8.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K2
- Verifier: I couldn't refute this finding. I searched the repo for `reservationUrl`, excluding node_modules, .next and the generated Prisma client. The hits are schemas.ts:44, [slug]/page.tsx:76 and MomentsDetailLayout.tsx:37,130,132, plus a stale note in REVIEW.md. src/data/items holds only moments.json and phones.json, and neither has a reservation or reserve key. I found no other source of items: the data is static JSON checked by ItemSchema, with no database or admin editor feeding it. `cta.reserve` appears only at MomentsDetailLayout.tsx:45,131,132 and common.ts:59,207,378. No test references `reservationUrl` or `reserve`. So the `{urls.reservationUrl && ...}` branch can never render. The fix is complete: the page passes the whole `t.cta` object, so removing `reserve` from the common.ts type and from both dictionaries stays type-safe once the MomentsDetailLayout prop type drops it too. It can be removed now. One addition: the REVIEW.md:3828 note that quotes the old schema line would also be stale, so it could be updated.

### R-331: sourceUrls plumbed through map and check-in types but never rendered or read
- Severity: Low
- Category: Unused
- Status: CONFIRMED
- Location: src/lib/mapUtils.ts:28,45; src/data/mapLocations.ts:39,60,208,291; src/app/[locale]/check-in/page.tsx:42; src/data/schemas.ts:45
- Evidence: CONFIRMED. A full-repo `grep -rn "sourceUrls"` (excluding node_modules/.next/.git/graphify-out/generated) shows only producers and type declarations: schemas.ts:45, mapLocations.ts:39 (MapLocation), :60 (CategoryMapItem), :84/:103-182 (landmark data), :208 `sourceUrls: [...landmark.sourceUrls]`, :291 `sourceUrls: item.sourceUrls`, mapUtils.ts:28 (MarkerData), :45 `sourceUrls: location.sourceUrls`, and check-in/page.tsx:42. No component reads it: leafletPopup.ts renders phones/directionsUrl/website/href/name/description/address only, and nothing in LeafletMap, InteractiveMap, StaticLocationMap or CheckInInfo matches. No test references it.
- Problem: The provenance URLs are copied into MapLocation, MarkerData and check-in props (including an array spread per landmark on every render) but never displayed or used. That is dead plumbing across four types.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Leave schemas.ts:45, the items JSON data and the KALAMATA_LANDMARKS entries (the landmark `sourceUrls` field at mapLocations.ts:84 and the arrays at :103-182) unchanged, as maintainer provenance. Remove only the runtime copies: MapLocation.sourceUrls (mapLocations.ts:39), the assignments at mapLocations.ts:208 and :291, MarkerData.sourceUrls (mapUtils.ts:28), the assignment at mapUtils.ts:45, and check-in/page.tsx:42. CategoryMapItem.sourceUrls (mapLocations.ts:60) can be removed once :291 is gone. Then run typecheck, lint and tests/unit/data-map-navigation.test.ts.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K2
- Verifier: I couldn't refute this finding; it is CONFIRMED. I searched the whole repo for `sourceUrls` (excluding node_modules, .next, .git, graphify-out and generated). The only hits are data, types and copy steps: schemas.ts:45, the items JSON files (moments.json, phones.json), mapLocations.ts:39/60/84/103-182/208/291, mapUtils.ts:28/45 and check-in/page.tsx:42. There is also one historical line in REVIEW.md. No component, popup, test or script reads the field. The objects that carry it are only ever built field by field: mapLocations.ts:198-209 and 280-292, mapUtils.ts:32-47, and check-in/page.tsx:30-43. None is spread, serialized or passed on in a way that could reach a generic consumer. The only `JSON.stringify` calls in LeafletMap and CheckInInfo serialize other data. Tests never mention sourceUrls. The landmark test in tests/unit/data-map-navigation.test.ts:98-108 checks only ids and coordinates, so removing the field breaks no assertion. The data itself must stay, because schemas.ts:45 validates the `sourceUrls` key in the items JSON. The fix already keeps the schema and the data. None of the affected files is in the excluded concurrent-edit areas, so the fix can be applied now.

### R-332: --grain token points at non-existent /design/grain-*.webp and has no consumer yet
- Severity: Nit
- Category: Unused
- Status: CONFIRMED
- Location: src/styles/tokens.css:155,234,311
- Evidence: CONFIRMED. tokens.css:155 `--grain: url(/design/grain-light.webp);` and :234/:311 `url(/design/grain-dark.webp)`. `ls public/design` gives "No such file or directory". `grep -rn "var(--grain)\|--grain" src` finds only these definitions and a comment in base.css:6, so there is no `var(--grain)` consumer. PROGRESS.md:312 (O37) moves gen-hero-assets, which generates these files per identity.md:613, to R3-V5.
- Problem: The token references assets that do not exist. It is harmless today because nothing uses it, so it causes no 404, but it would break if something used it before V5 generates the files.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Leave the code as it is now (Nit, not removable). Fix the plan ordering instead. Generate public/design/grain-{light,dark}.webp in R3-V4, before or together with the body `background: var(--grain) ...` rule from identity.md:612 and 1221, at least the grain part of gen-hero-assets. The other option is to postpone the body grain from V4 to V5. Record the decision in PROGRESS.md next to O37. If the grain is dropped, delete the tokens at tokens.css:155, 234 and 311 and update identity.md:401 and 612-613.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-V4 (grain asset generated there)
- Verifier: I checked the facts and they hold. Repo-wide grep for "grain" (excluding node_modules, .next, .git and .runtime) matches only 5 files. In src/styles/tokens.css, lines 155, 234 and 311 are the three definitions. src/styles/base.css:6 mentions it only in a comment. tests/unit/design-tokens.test.ts:166-168 and 224 use "grain speck" contrast labels, which are not a var(--grain) consumer. The other two are docs/design/identity.md and REVIEW.md. `ls public/design` returns "No such file or directory". Nothing consumes var(--grain) in src, public/sw.js, next.config or scripts, so no 404 happens today. knip does not look inside CSS custom properties, so this case is outside what it can see.

Removal is not the right fix. The token is intentional V2b scaffolding specified in identity.md:401 and 612-613, so "no change now" is correct.

The finding gets the phase wrong. It links the first consumer to V5. identity.md:1221 plans the first consumer for R3-V4 ("`body` switches to `bg` / `fg` / `font-text` + grain site-wide"). PROGRESS.md:312 (O37) moved gen-hero-assets, the script that generates public/design/grain-*.webp (identity.md:613), to V5. As planned, V4 would add `background: var(--grain)` to body while the webp files do not exist yet, so every page would request two missing images and get 404s until V5 lands.

### R-333: Redundant `export {};` in housePhotos.ts
- Severity: Nit
- Category: Unused
- Status: CONFIRMED
- Location: src/data/housePhotos.ts:1
- Evidence: CONFIRMED. Line 1 is `export {};`, followed by `export type HousePhotoRoomKey` and `export const housePhotosByRoom`, so the module is already an ES module.
- Problem: This leftover module marker does nothing.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Delete line 1.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K2
- Verifier: Confirmed. src/data/housePhotos.ts line 1 is `export {};`. The same file also has `export type HousePhotoRoomKey` on line 3 and `export const housePhotosByRoom` on line 5, so TypeScript already treats it as an ES module. `export {};` is only needed in a file with no other import or export, for example to satisfy `isolatedModules: true`, which is set in tsconfig. This file does not need it. Deleting the line changes no exports, types or runtime behaviour. It is safe to remove now and is not tied to any later V-task. It is a Nit.

### R-334: LeafletMap restores a saved map view from localStorage that the mount-time fit always overwrites
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/components/LeafletMap.tsx:L9, L131-L141, L157-L163, L256-L258
- Evidence: L9 `const PERSIST_KEY = 'leaflet:apartment-map';`. L134-L140 read `localStorage.getItem(PERSIST_KEY)` into initialCenter/initialZoom. L157-L163 `map.on('moveend', ...) localStorage.setItem(PERSIST_KEY, ...)`. L256-L258 `useEffect(() => { fitOriginAndMarkers(); }, [fitOriginAndMarkers, markers]);` runs in the same mount commit after the init effect (React runs passive effects in declaration order). fitOriginAndMarkers (L120-L126) calls `fitBounds` whenever pts is non-empty, and pts is never empty in production: InteractiveMap.tsx:L105 always passes `origin={APARTMENT_LOCATION}`. `grep -rn "PERSIST_KEY\|leaflet:apartment-map" src tests public` returns only LeafletMap.tsx L9/L134/L161; no test covers the restore.
- Problem: The restored center/zoom is replaced by fitBounds on the first render, so the read path never has a visible effect. The write path then stores the fitted view on every moveend. The key is also shared by the check-in map and the moments map.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Delete PERSIST_KEY, the try/localStorage block at L131-L141 (use `[center[1], center[0]]` and `zoom` directly), and the moveend listener at L157-L163. Optionally remove the stale `leaflet:apartment-map` key from the storage list in REVIEW.md:4795. Safe to do now. LeafletMap is restyled in R3-V8, and this can go first or be folded into V8.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K3
- Verifier: CONFIRMED. The only production caller is InteractiveMap.tsx:L100-L108, which renders LeafletMap with origin={APARTMENT_LOCATION}, a constant center, a numeric zoom, memoized labels and memoized markers. On mount, the init effect in LeafletMap.tsx (around L128-L240) builds the map at the restored localStorage center/zoom and sets mapRef. The effect at L256-L258 then runs fitOriginAndMarkers in the same commit (passive effects run in declaration order). Because origin is always set, pts is never empty, so fitBounds always replaces the restored view. React StrictMode's dev double-invoke re-runs every effect, so the fit still wins there.

There is one narrow case where the restore does show. If the init effect re-runs on its own because applyTiles, mapLabels, center or zoom changed identity (for example a cartoBasemapsKey or dictionary change without a remount), the fit effect does not re-run, so the restored view survives. That view is only the last view of that same instance, and the caller's props are stable, so this is not a meaningful use.

The moveend write (around L157-L163) fires after fitBounds and on every pan, and its only consumer is the redundant read. Searching src and tests for PERSIST_KEY and "leaflet:apartment-map" found hits only inside LeafletMap.tsx. tests/components/leaflet-map-tiles.test.tsx never touches localStorage.

Removing the read, the write and the constant breaks nothing at runtime. The one side effect is that the edge re-init case above would use props.center/zoom instead of the last view, which is harmless. The fix is correct as stated. Old keys already in users' browsers stay as inert data, so no cleanup code is needed. Before relying on the fix, run tests/components/leaflet-map-tiles.test.tsx.

### R-335: Map `activation` prop and its 'intent' branch are never used (click-to-load button unreachable)
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/components/ApartmentLocationMap.tsx:L16, L27, L43; src/components/InteractiveMap.tsx:L23, L33, L61, L89, L115-L123; src/i18n/domains/common.ts:L142, L319, L490 (map.loadMap)
- Evidence: `grep -rn "activation" src tests` matches only ApartmentLocationMap.tsx and InteractiveMap.tsx (definitions, defaults and pass-through). The two callers, CheckInInfo.tsx:L1055-L1062 and CategoryGridClient.tsx:L178-L185, pass locale/height/zoom/className/contentItems/cartoBasemapsKey and never `activation`. So it is always 'viewport': `if (activation === 'intent') return;` (L61) is always false and `{activation === 'intent' && (<button ...>{mapT.loadMap}</button>)}` (L115-L123) never renders. `grep -rn "loadMap\b" src tests` finds only common.ts L142/L319/L490 and InteractiveMap.tsx L121.
- Problem: A configurable activation mode with one value in practice. The 'intent' button and the `loadMap` dictionary key (en+el) are dead. knip cannot see prop values or unused object keys.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Fix as proposed, with two notes. The type key to remove is at src/i18n/domains/common.ts:L143 (and the entries at L320 en and L491 el). Remove `activation` from both prop interfaces and their default values, including the pass-through at ApartmentLocationMap.tsx:L43. Delete InteractiveMap.tsx:L61, change the L89 deps to `[hasMounted]`, and delete L115-L123. Do not touch the separate `map.loading` key ("Φόρτωση χάρτη..."), which is still in use. Removing this code can be done now and does not depend on any V-task.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K3
- Verifier: This one is confirmed. The code that uses `activation` is limited to its definitions in ApartmentLocationMap.tsx (L16, L27, L43) and InteractiveMap.tsx (L23, L33, L61, L89, L115). The only other grep hits are unrelated test titles ("activation" in date-phone-validation and service-worker tests). Only ApartmentLocationMap imports InteractiveMap. The two callers are CheckInInfo.tsx:L1055-L1062 and CategoryGridClient.tsx:L178-L185. Neither passes `activation` nor spreads props into the component. So `activation` is always 'viewport': the L61 guard never fires and the L115-L123 button never renders. `loadMap` appears only at common.ts L143 (type), L320 (en) and L491 (el), and InteractiveMap.tsx L121. The strings "Load map" and "Φόρτωση χάρτη" are not used in any test. The other Greek hit at L486 is `loading: "Φόρτωση χάρτη..."`, a different key that must stay. The redesign doc (docs/design/identity.md L1089) plans a List/Map toggle, which does not depend on this prop. Removing the code has no side effect on CSS: `btn-tint` is still used in [locale]/layout.tsx and error.tsx. One small correction to the fix: the type key is at common.ts L143, not L142.

### R-336: `includeLandmarks` option chain is always true (R-212(f) remainder)
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/components/ApartmentLocationMap.tsx:L15, L26, L32-L33; src/lib/mapUtils.ts:L53-L59; src/data/mapLocations.ts:L299-L307
- Evidence: `grep -rn "includeLandmarks" src tests scripts` matches only these three files. No caller passes it: see the two ApartmentLocationMap call sites above, and tests/unit/data-map-navigation.test.ts:L126/L161 call `getKalamataMarkers('en', [...])` / `getKalamataMarkers('en')` without options. ApartmentLocationMap defaults it to true and forwards `{ includeLandmarks }`. getKalamataMapLocations then does `const { includeLandmarks = true } = options; ... if (includeLandmarks) locations.push(...)`. REVIEW.md R-212(f) listed this as 'optionally drop includeLandmarks'. PROGRESS.md:317 shows only `includeApartment` was removed.
- Problem: There is an options object on three layers for a flag that is always true, and the `if` is always true.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Remove the prop, the `options` parameters of getKalamataMarkers and getKalamataMapLocations, and the conditional (push the landmarks unconditionally). Update the useMemo deps.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K3
- Verifier: I confirmed this by reading the code and searching the whole repo. The only place outside the three named files that mentions `includeLandmarks` is REVIEW.md. The component is rendered in two places, CategoryGridClient.tsx:178-185 and CheckInInfo.tsx:1055-1062. Both pass explicit props with no spread, and neither passes `includeLandmarks`. `getKalamataMapLocations` has one caller, mapUtils.ts:58; InteractiveMap.tsx:91 only names it in a comment. `getKalamataMarkers` is called at ApartmentLocationMap.tsx:32 and in tests/unit/data-map-navigation.test.ts:126 and :161, and none of those pass options. So the value is always the default `true`, and the `if` at mapLocations.ts:307 always runs. Removing the option leaves behavior and the existing tests unchanged. It is safe to do now; it depends on no later V-task, and none of these files is in the excluded list. The proposed fix is correct and complete.

### R-337: StaticLocationMap heading branch is dead: the only caller passes showHeading={false}, so `title`, `locationPanel.title` and `map.apartmentMarkerTitle` are unused
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/components/StaticLocationMap.tsx:L4-L10, L36-L42, L98-L103; src/components/InteractiveMap.tsx:L127; src/i18n/domains/house.ts:L43 (+ en/el `title` values of locationPanelTranslations, L181 and the el counterpart); src/i18n/domains/common.ts:L138, L315, L486
- Evidence: `grep -rn "StaticLocationMap" src tests` shows one renderer: InteractiveMap.tsx:L127 `<StaticLocationMap height={height} className="mt-4" title={mapT?.apartmentMarkerTitle} locale={locale} showHeading={false} />`. StaticLocationMap L98 `{showHeading && (... {title || lp.title} ...)}` is therefore never rendered. `grep -rnE "locationPanel|\blp\." src` finds `lp.title` only at L101 (CheckInInfo uses other locationPanel keys). `grep -rn "apartmentMarkerTitle" src tests` finds only common.ts types/values and InteractiveMap L127. `grep -rn "static-map-title" src tests` finds only L101 (no test).
- Problem: This is a configurable heading that no caller wants. Two dictionary keys (4 strings) are reachable only through the dead branch. `mapT?.` also uses optional chaining on a non-optional value. knip does not track prop values or dictionary keys.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: StaticLocationMap.tsx: remove `title?` and `showHeading?` from the props (L7, L9) and from the destructuring (L39, L41), and delete the L98-L103 block. Optionally make `icon` required in LocationHighlight (L19) and drop the `{icon && ...}` guard at L67-71. InteractiveMap.tsx:127: remove the `title={mapT?.apartmentMarkerTitle}` and `showHeading={false}` props. house.ts: remove `title` from LocationPanelDictionary (L43) and its en value (L182) and el value (L205). common.ts: remove `apartmentMarkerTitle` from the map type (L139) and its en value (L316) and el value (L487). Then run typecheck and the dictionary/icon-data unit tests.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K3
- Verifier: Confirmed. `grep -rn "StaticLocationMap|apartmentMarkerTitle|static-map-title" src tests scripts docs` finds only one renderer: InteractiveMap.tsx:127, inside <noscript>, which passes showHeading={false}. That makes the heading block at StaticLocationMap.tsx:98-103 unreachable, and it is the only place `title` and `lp.title` are read. apartmentMarkerTitle appears only in common.ts (type at L139, values at L316 and L487) and in that one prop. The other locationPanel consumers are CheckInInfo.tsx:314/346/347/1051 (highlights, locationTitle, nearby, locationDescription) and tests/unit/icon-data.test.ts (highlights). None of them uses `.title`. I found no dynamic access: no spread of t.map, mapT or locationPanel, and no uses in scripts, public or docs. The only docs hit is docs/design/identity.md:1117, which plans to restyle the component and does not depend on the heading. The side notes also hold. mapT is non-optional (L38 `const mapT = dict.map`, used without `?.` elsewhere). iconForMarkerType always returns a string, so the `{icon && ...}` guard at L67 (not L69) and `icon?:` at L19 do nothing. Small location fixes: the locationPanel `title` values are at house.ts L182 (en) and L205 (el). Removing this is safe now, since only the noscript fallback renders the component and it never showed the heading.

### R-338: StatusCluster `className` and `pollMs` props are never passed; the pollMs guard is always false
- Severity: Nit
- Category: Redundant
- Status: CONFIRMED
- Location: src/components/StatusCluster.tsx:L7, L10, L84-L85, L128, L145
- Evidence: `grep -rn "StatusCluster" src tests` shows one call site: src/app/[locale]/layout.tsx:L68-L73 `<StatusCluster labels={{...}} />` (labels only). L10 `({ className = '', labels, pollMs = 15000 }: Props)`, L85 `if (!pollMs || pollMs < 5000) return;` (always false with 15000), L145 `className={`net-status ${className}`.trim()}`.
- Problem: There are two optional props with a single constant value, plus a guard that can never trigger. It is minor noise in a component that R3-V9 restyles.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Add a module constant `const POLL_MS = 15_000;` and change the Props interface to `{ labels: Labels }`. Destructure only `{ labels }`. Delete the L85 guard. Replace both `setTimeout(probe, pollMs)` calls (L94, L117) with `POLL_MS`. Change the dependency array at L128 to `[]`. At L145, use `className="net-status"`. Before editing, confirm that the concurrently edited layout.tsx still passes no `className` or `pollMs`. Then run typecheck and lint, which will catch any new caller that passes them. Severity: Nit. It can be removed now, or folded into the R3-V9 restyle.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K7
- Verifier: Confirmed. `grep -rn StatusCluster src tests scripts docs` finds a single call site, src/app/[locale]/layout.tsx:L68-L73, and it passes only `labels`. There is no spread, and no other props are passed. `grep -rn pollMs src tests` hits only StatusCluster.tsx (L7, L10, L85, L94, L117, L128). The component is a default export used in one place, so nothing dynamic uses it. That means `className` is always '' and `pollMs` is always 15000, so the L85 guard `!pollMs || pollMs < 5000` is always false. docs/design/identity.md:1226 mentions only that R3-V9 restyles StatusCluster, not these props. One caveat: src/app/[locale]/layout.tsx is being edited concurrently by another job, which could start passing `className` (for example while reworking the header or shell). Re-check the call site before removing the prop.

### R-339: Three near-identical marker types with two field-copy mappers; `sourceUrls`/`category` are carried through but never read
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/data/mapLocations.ts:L26-L40 (MapLocation); src/lib/mapUtils.ts:L15-L51, L61-L75 (MarkerData, markerFromMapLocation, markersFromMapLocations, toLeafletMarker); src/components/LeafletMap.tsx:L11-L23, L68-L69 (LeafletMarkerData, buildIcon default); src/app/[locale]/check-in/page.tsx:L42
- Evidence: MapLocation → markerFromMapLocation → MarkerData (same 13 fields, with markerType renamed to type) → toLeafletMarker → LeafletMarkerData (drops category and sourceUrls). `grep -rn "MarkerData\b" src tests | grep -v LeafletMarkerData` shows MarkerData is consumed only by InteractiveMap (via toLeafletMarker). `grep -rn "sourceUrls" src tests` shows it is only copied (mapLocations L208/L291, mapUtils L45, check-in page L42), never rendered or tested. LeafletMarkerData.type is `type?: string` and buildIcon has `type = 'apartment'` and a `|| CATEGORY_ICON.attraction` fallback, while every marker has a required MapMarkerType whose 13 members equal the 13 CATEGORY_ICON keys. `dedupeMapLocations` (mapLocations L295-L297) and `markersFromMapLocations` (mapUtils L49-L51) are one-line wrappers of `dedupeById` and `.map`.
- Problem: It takes two copy functions and three interfaces to move the same data from the data layer to Leaflet. Provenance-only fields (`sourceUrls`) are also shipped to the client (CheckInInfo's RSC payload via the check-in page) for nothing. Every new marker field has to be added in three places.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Do this together with R3-V8. It is not safe to do now in isolation, because LeafletMap.tsx and its tests are being touched.

1. Change `LeafletMarkerData.type` to `MapMarkerType`, or have LeafletMap accept `Pick<MapLocation, 'id'|'name'|'description'|'address'|'phone'|'phones'|'website'|'directionsUrl'|'href'|'coordinates'|'markerType'>`. Then drop buildIcon's `= 'apartment'` default and the `|| CATEGORY_ICON.attraction` fallback. Type CATEGORY_ICON as `Record<MapMarkerType, string>`.
2. Delete MarkerData, markerFromMapLocation, markersFromMapLocations and toLeafletMarker in src/lib/mapUtils.ts. getKalamataMarkers can return getKalamataMapLocations(...) directly, or be removed, in which case ApartmentLocationMap calls getKalamataMapLocations. Update InteractiveMap.tsx:10-18 and :92-93 to match.
3. Inline dedupeMapLocations as dedupeById at mapLocations.ts:314.
4. Remove `sourceUrls` from MapLocation (:39) and from its assignments at mapLocations.ts:208 and :291. Remove it from the check-in page's mapItem (check-in/page.tsx:42). Keep it in the item JSON, in schemas.ts:45 and in KalamataLandmarkDefinition as provenance. It can stay optional on CategoryMapItem or be dropped there. Remove `category` from MapLocation only if nothing else is added that reads it; today it has no readers.
5. Update tests. In tests/unit/data-map-navigation.test.ts, remove the toLeafletMarker import and case (:23, :159-167) and change the `type:` expectations to `markerType:` (or to whatever field name remains). In tests/components/leaflet-map-tiles.test.tsx:170 and :198, adjust the marker literals to the new prop type.
6. Run typecheck, lint with --max-warnings=0, knip, and both test files.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-V8
- Verifier: I checked each claim and all of them hold.

1. Two copy steps. MapLocation (src/data/mapLocations.ts:26-40) is copied field by field into MarkerData by markerFromMapLocation (src/lib/mapUtils.ts:31-47). MarkerData is then copied field by field into LeafletMarkerData by toLeafletMarker (mapUtils.ts:61-75).
2. MarkerData has one production consumer. That is InteractiveMap.tsx:11,18,93, reached through ApartmentLocationMap → getKalamataMarkers.
3. `category` and `sourceUrls` are copied but never read. A grep of src/components/{CheckInInfo,ContactSection,ApartmentLocationMap,InteractiveMap}.tsx and src/components/maps/*.ts finds no read of `.category` or `sourceUrls` on a location or marker. The only other hits are the data JSON, the schema, the mapLocations assignments and the check-in page's mapItem.
4. The buildIcon default is never used. Every buildIcon call passes a type: `buildIcon('service')` at LeafletMap.tsx:188 and `buildIcon(markerData.type)` at :236.
5. The wrapper is a pure pass-through. dedupeMapLocations (mapLocations.ts:295-297) only calls dedupeById.

Nothing dynamic reads these fields. The finding is right to rate it Low and to call it overengineering rather than dead code.

The proposed fix is incomplete because tests depend on these APIs:
- tests/unit/data-map-navigation.test.ts:23 and :159-167 import and assert toLeafletMarker.
- The same file, :126-157, asserts that getKalamataMarkers output has `type: 'attraction'`, which is MarkerData's field name.
- tests/components/leaflet-map-tiles.test.tsx:170 and :198 build LeafletMarkerData literals, which would need to change if the type is replaced or renamed.
- CategoryMapItem.sourceUrls (mapLocations.ts:60) and KalamataLandmarkDefinition.sourceUrls (:84) also carry the field. The landmark definitions (:103-182) keep sourceUrls as provenance data, so only the copies into MapLocation (:208, :291) should go.

### R-340: LeafletMap `origin` prop duplicates the apartment marker that is always in `markers`
- Severity: Nit
- Category: Redundant
- Status: CONFIRMED
- Location: src/components/LeafletMap.tsx:L43, L93, L102, L109-L111, L123; src/components/InteractiveMap.tsx:L105
- Evidence: InteractiveMap L105 always passes `origin={APARTMENT_LOCATION}`. getKalamataMapLocations (mapLocations.ts L305) always starts with getApartmentMapLocation, whose `coordinates: APARTMENT_LOCATION` (L257), and InteractiveMap L91 comments 'getKalamataMapLocations always includes the apartment marker'. fitOriginAndMarkers L123 pushes origin and then every marker, so the same point is added twice. The only other uses of `origin` are in tests/components/leaflet-map-tiles.test.tsx:L202/L206.
- Problem: The origin prop, its ref and its sync effect exist only to add a duplicate bounds point.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: In src/components/LeafletMap.tsx, remove `origin?: [number, number];` (L43), the `origin,` destructure (L93), `originRef` (L102), the sync effect (L109-L111) and the push at L123. Optionally rename fitOriginAndMarkers to fitMarkers and update L208, L222 and L257-L258. You must also remove `origin={APARTMENT_LOCATION}` at src/components/InteractiveMap.tsx:L105, or the typecheck fails. In tests/components/leaflet-map-tiles.test.tsx, drop `origin={[22.1, 37.0]}` at L202 and L206 and change the test title at L200. The fitBounds call-count assertions still hold because the markers are non-empty. Gates: typecheck, lint, and vitest for leaflet-map-tiles plus any InteractiveMap/ApartmentLocationMap tests.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K3
- Verifier: Confirmed. LeafletMap has one runtime user, InteractiveMap.tsx:L100-L108, which dynamically imports it and always passes origin={APARTMENT_LOCATION} (L105). InteractiveMap has one caller, ApartmentLocationMap.tsx:L31-L38 (used from CheckInInfo and CategoryGridClient). That caller always passes markers from getKalamataMarkers. getKalamataMarkers maps getKalamataMapLocations one-to-one with no filter (mapUtils.ts:L49-L58). getKalamataMapLocations always starts with getApartmentMapLocation, whose coordinates are APARTMENT_LOCATION (mapLocations.ts:L257, L289). dedupeById keeps the first entry, so the apartment marker is never dropped, even if a content item reuses the id 'apartment'. In LeafletMap, origin is only read at L43, L93, L102, L110-L111 and L123. At L123 it only adds a bounds point that a marker already covers, so fitBounds gets the same bounds without it. No other repo code uses the prop; the only other uses are the test renders at tests/components/leaflet-map-tiles.test.tsx:L202 and L206. knip does not catch this because a prop that is passed counts as used. Removing it now is behavior-neutral for every current caller. The one theoretical difference: an InteractiveMap rendered with no markers would no longer fit to the apartment, but no such caller exists.

### R-341: Legacy home booking-bar stack duplicates the F09 availability logic (validateDateRange / getNights vs validateStay / nightsBetween)
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/dateUtils.ts:L26-L93; src/components/DateRangePicker.tsx:L4-L8, L113-L124; src/data/stayPolicy.ts:L17-L18
- Evidence: dateUtils.validateDateRange hard-codes `nights > 30` and its own en/el strings ('Maximum stay is 30 nights'). stayPolicy.ts L17 `/** Same limit as validateDateRange in src/lib/dateUtils.ts ("Maximum stay is 30 nights"). */ export const MAX_STAY_NIGHTS = 30;` is used by stayQuote.validateStay (L107). `grep -rn "dateUtils" src tests` shows it is used only by DateRangePicker.tsx, SearchBar.tsx and tests/unit/date-phone-validation.test.ts. DateRangePicker L115 is the only src caller of validateDateRange (the Apply handler). getNights duplicates calendarDate.nightsBetween over Date instead of IsoDate.
- Problem: There are two independent stay-validation rule sets with duplicated constants and copy, kept in sync by a comment. The old one only guards the Apply button of the home date picker, which then navigates to /availability where validateStay is authoritative.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Main fix: delete src/lib/dateUtils.ts (or keep only the URL-param helpers BookBar needs, rebuilt on calendarDate/IsoDate), its tests in tests/unit/date-phone-validation.test.ts, and the stayPolicy.ts:17 comment, all in R3-V5 together with SearchBar/HomeInteractiveBar/DateRangePicker. Interim fix, if one is done at all: import MAX_STAY_NIGHTS from '@/data/stayPolicy' into dateUtils.ts, use it in the `nights > 30` check (L76), and build the maximumStay text from it (e.g. `Maximum stay is ${MAX_STAY_NIGHTS} nights` / `Η μέγιστη διαμονή είναι ${MAX_STAY_NIGHTS} νύχτες`) so the number and the message cannot drift apart. The stayPolicy.ts:17 comment then no longer needs to exist. The existing test at date-phone-validation.test.ts:60 should still pass unchanged.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-V5
- Verifier: I checked this and it holds. In src/lib/dateUtils.ts, validateDateRange (L40-82) has its own `nights > 30` check (L76) and fixed en/el copy ('Maximum stay is 30 nights' / '30 νύχτες'). getNights (L27-32) is a Date-based copy of calendarDate.nightsBetween. src/data/stayPolicy.ts:17-18 keeps MAX_STAY_NIGHTS = 30 in sync only through a comment, and stayQuote.validateStay (L106-107) and quote (L151-153) use that constant. A grep found validateDateRange called only from DateRangePicker.tsx:115 (handleApply) and from tests/unit/date-phone-validation.test.ts. getNights is used by DateRangePicker L105/L262, SearchBar L195 and the same test. The import chain is HomeInteractiveBar.tsx:3 → SearchBar.tsx → dynamic import of DateRangePicker (SearchBar L31). SearchBar L183 sends the user to /{locale}/availability#..., where validateStay is the real check. The old check does even less than the finding says: when it fails, handleApply only calls logger.warn and returns, so the user never sees an error. No other emitter or consumer showed up. docs/design/identity.md (R3-V5 row) does list SearchBar.tsx, HomeInteractiveBar.tsx, DeferredHomeInteractiveBar.tsx and 'DateRangePicker.tsx (if unused)' for removal, so waiting for V5 is right. It is not safe to delete now because the live home booking bar still uses it. One thing the finding's interim fix misses: swapping only the literal 30 for MAX_STAY_NIGHTS would leave the '30 nights' text hard-coded.

### R-342: SearchBar `showPropertyHeader`/`propertyName` are dead: the only caller passes false
- Severity: Nit
- Category: Redundant
- Status: CONFIRMED
- Location: src/components/SearchBar.tsx:L24-L29, L55-L60, L200-L203; src/components/HomeInteractiveBar.tsx:L11-L12, L35-L40
- Evidence: `grep -rn "SearchBar\|BookingBar" src` shows one src caller: HomeInteractiveBar.tsx L35-L40 `<BookingBar locale={locale} propertyName={apartmentContent.shortName} subline={subline} showPropertyHeader={false} />`. The tests (tests/components/search-bar.test.tsx L16/L25/L34) render `<SearchBar locale=... />`, so they exercise the default `true`. In src, `{showPropertyHeader && (<h2>{propertyName || apartmentContent.shortName}</h2>)}` (L201-L203) never renders, and the `propertyName` passed by HomeInteractiveBar (plus its getApartmentContent call, L12) only feeds that dead branch.
- Problem: There is a prop, and a data lookup in the caller, for a header that production never shows. Tests cover a configuration production does not use.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: In src/components/SearchBar.tsx, remove `propertyName` and `showPropertyHeader` from the Props type (L26, L28) and from the destructuring (L57, L59). Remove the `{showPropertyHeader && (<h2>...</h2>)}` block (L201-L203). Keep `apartmentContent`, because the subline fallback still uses it. In src/components/HomeInteractiveBar.tsx, remove the `getApartmentContent` import (L4), the `apartmentContent` const (L12) and the `propertyName=`/`showPropertyHeader=` props (L37, L39). Otherwise, leave it for R3-V5, which replaces both components.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-V5
- Verifier: Confirmed. A search of src, tests and scripts for `SearchBar|BookingBar|showPropertyHeader|propertyName` found only one production render of the SearchBar default export (BookingBar): src/components/HomeInteractiveBar.tsx:L35-L40, and it passes `showPropertyHeader={false}`. It reaches the page through a dynamic import in DeferredHomeInteractiveBar, used by src/app/[locale]/page.tsx. So in production the `{showPropertyHeader && <h2>{propertyName || apartmentContent.shortName}</h2>}` branch at SearchBar.tsx:L201-L203 never renders. `propertyName` is read only inside that branch. In HomeInteractiveBar, `apartmentContent` (L12) is used only to build that prop (L37), so the `getApartmentContent` import (L4) and the call are dead too. tests/components/search-bar.test.tsx renders `<SearchBar locale=.../>` with the default true, but it asserts only on the availability button and router.push, never on the h2. Removing the prop does not break any test. Knip cannot catch this because it does not track unused props or constant prop values. One caveat: SearchBar must keep its own `getApartmentContent`/`apartmentContent`, because the subline fallback at L205 still uses it. Nit, and it can go now, unless R3-V5 replaces the component first.

### R-343: `pickLocalized` in mapLocations re-implements `pickLocale` from src/lib/data.ts; callers add redundant `?? item.x` fallbacks
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/data/mapLocations.ts:L212-L220; src/lib/data.ts:L83-L90; call sites src/app/[locale]/[category]/[slug]/page.tsx:L19-L20, L48-L52; src/app/[locale]/[category]/page.tsx:L69-L80; src/app/[locale]/check-in/page.tsx:L32
- Evidence: data.ts pickLocale: `(typeof lv === 'string' && lv) || (typeof bv === 'string' && bv) || (typeof ev === 'string' && ev) || undefined` (localized → base → _en). mapLocations.pickLocalized: the same order (localized → base → english), differing only in `.trim()` on each candidate. Call sites write `pickLocale(item, 'name', eff) ?? item.name`, but pickLocale already falls back to `obj[baseKey]`, so the `??` only matters when the base is '' (and then yields '').
- Problem: This is duplicated locale-fallback logic with a subtle divergence (whitespace-only strings count as present in one and absent in the other). The same item can resolve to a different name on the map than on the card.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Extract a pure `pickLocale` (no node:fs import), e.g. into src/lib/localize.ts or src/i18n. Re-export it from src/lib/data.ts so the existing imports and tests (tests/unit/data-map-navigation.test.ts:56-59) keep working. Pick one whitespace rule, then replace mapLocations.pickLocalized with that shared function. Keep the `?? item.name` fallbacks where the consumer needs a `string` type (name, and title in metadata). Only drop `?? item.summary` / `?? item.address` / `?? item.description` where the target type already accepts `undefined`, and confirm each one with `npm run typecheck`. Otherwise add a separate overload such as `pickLocaleRequired(obj, key, locale, fallback: string): string` instead of removing the fallbacks outright. Then run the data-map-navigation and search-text tests.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K8
- Verifier: The duplication is real. src/data/mapLocations.ts:L212-L220 `pickLocalized` resolves in the same order as src/lib/data.ts:L83-L90 `pickLocale` (`${key}_${locale}`, then base, then `_en`). The only difference is `.trim()`: a whitespace-only string counts as missing in pickLocalized and as present in pickLocale. The duplicate can't be dropped by just importing: data.ts starts with `import fs from "node:fs"`, and mapLocations is imported by client-side components (ApartmentLocationMap, StaticLocationMap, CheckInInfo, ContactSection, via src/lib/mapUtils.ts), so moving pickLocale to a pure module is the right approach.

Two parts of the finding are overstated.
(1) The claim that "the same item can resolve to a different name on the map than on the card" is only theoretical. It needs a whitespace-only localized or base value, and the Zod schema (src/data/schemas.ts:22-27) plus the static data have none that I found.
(2) The `?? item.name` / `?? item.summary` fallbacks do nothing at runtime, but they are not purely redundant. pickLocale returns `string | undefined`, and `?? item.name` (where `name: z.string()` is required) narrows the result to `string` for consumers that need a string: title/metadata in [slug]/page.tsx:L19, [category]/page.tsx:L69, check-in/page.tsx:L32 and mapLocations.ts:L273. Removing them would likely cause type errors unless pickLocale's signature changes too. The same applies to tests/unit/search-text.test.ts:L28-L30.

Severity is Low. It can be done now; it is not tied to any V-task.

### R-344: Outbox keeps multi-destination scaffolding after the booking-request destination was removed
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/bookingOutbox.ts:L8-L16, L29, L140-L165 (file name itself)
- Evidence: `git diff HEAD -- src/lib/bookingOutbox.ts` shows that BOOKING_DESTINATION ('booking_request_webhook') and its webhookConfig branch were just removed, leaving `const SUPPORTED_DESTINATIONS = [CHECKIN_DESTINATION];` and `function webhookConfig(destination) { if (destination === CHECKIN_DESTINATION) return {...}; return {}; }`. The `return {}` path is unreachable because L29 returns early for any destination not in SUPPORTED_DESTINATIONS. `grep -rn "BOOKING_REQUEST\|booking_request\|stayRequest" src scripts prisma/schema.prisma docker deploy .env.example` returns nothing. The module is still named bookingOutbox.ts although it now only delivers check-in webhooks.
- Problem: A one-element allowlist, a dispatch function with a dead fallback, and a file name that refers to the removed stay/booking-request feature.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: In src/lib/bookingOutbox.ts:
- Delete SUPPORTED_DESTINATIONS and webhookConfig.
- Replace L29 with `if (!candidate || candidate.destination !== CHECKIN_DESTINATION) return false;`. Keep this rejection: the leftover booking_request_webhook rows and the unknown_destination test depend on it.
- Replace L30 with `const config = { url: process.env.CHECKIN_REQUEST_WEBHOOK_URL, token: process.env.CHECKIN_REQUEST_WEBHOOK_TOKEN };`. Reading these at call time keeps the current behaviour, including tests that stub env per test.
- Change `destination: { in: SUPPORTED_DESTINATIONS }` at L145 and L159 to `destination: CHECKIN_DESTINATION`.
- Keep the `destination: candidate.destination` condition in the claim updateMany, or make it CHECKIN_DESTINATION.
- Keep the `event.checkInRequest ? ... : null` guard.

The file rename is optional and cosmetic. If it is done, it must also update CLAUDE.md, scripts/drain-outbox.ts, the arrival-request route, tests/unit/booking-outbox.test.ts and any scripts/build-workers.mjs entry. Run tests/unit/booking-outbox.test.ts, including the leftover-booking-event and unsupported-destination cases, to verify.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K4
- Verifier: Confirmed. src/lib/bookingOutbox.ts:L8-L16 has `SUPPORTED_DESTINATIONS = [CHECKIN_DESTINATION]`, and `webhookConfig` ends in `return {}`. That fallback cannot be reached, because L29 already returns false for any destination not in the list. `git diff HEAD` shows the booking-request branch was just removed. The only other users of SUPPORTED_DESTINATIONS are the drainOutbox where-clauses at L145 and L159. Nothing else refers to SUPPORTED_DESTINATIONS or webhookConfig anywhere in src, scripts, tests or docs. They are module-private, so knip cannot see this; it only reports unused exports, not dead branches inside a module.

The finder's grep skipped tests/, which hides something the fix depends on. tests/unit/booking-outbox.test.ts:L95-L117 seeds leftover 'booking_request_webhook' events and says the outbox must never claim or drain them. L209-L215 also expects an 'unknown_destination' event to be left untouched. `OutboxEvent.destination` is a free VarChar (prisma/schema.prisma:120), so the destination filter is still needed: only the list and the dispatch function around it are redundant. The proposed fix does not say to keep the L29 rejection. Removing it would let leftover booking-request rows be claimed and sent to the check-in webhook URL.

### R-345: withErrorHandler `enableErrorLogging`/`enablePerformanceLogging` options are set only by tests
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/apiErrorHandler.ts:L178-L190, L287, L324, L354, L382
- Evidence: `grep -rn "enableErrorLogging\|enablePerformanceLogging" src tests | grep -v src/lib/apiErrorHandler.ts` returns only tests/security/api-boundaries.test.ts L104/L114/L133/L148 (all `false`). The one production call with a config object, src/app/api/errors/route.ts:L87-L90, passes only `maxRequestBodySize` and `requestTimeoutMs`.
- Problem: These are configuration knobs whose only purpose is to silence logs in tests, which amounts to test-only production surface (CLAUDE.md forbids test-only helpers). Four `if (mergedConfig.enable...)` branches are always true in production.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: 1. In src/lib/apiErrorHandler.ts, remove `enableErrorLogging` and `enablePerformanceLogging` from `ErrorHandlerConfig` (L179-180) and from `DEFAULT_CONFIG` (L186-187).
2. Unwrap the four `if (mergedConfig.enable...)` guards at L287, L324, L354 and L382 so their logger calls always run.
3. In tests/security/api-boundaries.test.ts:104, 114, 133 and 148, drop the two flags from the config objects and keep `requestTimeoutMs: 25` where it is passed.
4. If the tests need to stay quiet, stub the singleton inside each test, e.g. `vi.spyOn(logger, 'error').mockImplementation(() => {})`, and do the same for `info` and `debug` as needed. Do not use `vi.stubEnv('LOG_CONSOLE','false')`, because the singleton `logger` reads that value when it is created at import time. The `restoreMocks` setting in vitest.config.ts restores the spies after each test.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K5
- Verifier: I confirmed this by searching the whole repo, excluding node_modules, .next and generated code, for `enableErrorLogging` and `enablePerformanceLogging`.
- Outside src/lib/apiErrorHandler.ts, they appear only in tests/security/api-boundaries.test.ts:104, 114, 133 and 148, always set to `false`, and in REVIEW.md prose.
- Inside apiErrorHandler.ts they appear at the interface (L179-180), DEFAULT_CONFIG (L186-187) and the four guards at L287, L324, L354 and L382.
- No production call site passes either option. The config object in src/app/api/errors/route.ts passes only `maxRequestBodySize` and `requestTimeoutMs`.
- Neither name is read through a string key or dynamic lookup.

So in production all four guards are always true. The four tests assert only status codes, headers and response bodies. None asserts on logging, so dropping the flags does not break any assertion.

The finding's proposed test replacement is wrong, though. `vi.stubEnv('LOG_CONSOLE','false')` would not silence anything. src/lib/logger-enterprise.ts:61 reads `process.env.LOG_CONSOLE` inside the logger's config, and that config is built when the module-level singleton `logger` is created at import time. That happens before the test body runs.

Low severity is right, and the change is safe to make now. It is not tied to any V-task.

### R-346: Unused HttpStatusCodes entries, inline 415, and stale header/compat comments in apiErrorHandler
- Severity: Nit
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/apiErrorHandler.ts:L1-L4, L19-L20, L23-L40, L52
- Evidence: `grep -n "HttpStatusCodes\." src/lib/apiErrorHandler.ts` shows CREATED, ACCEPTED and NO_CONTENT are never read (the constant is module-private; knip does not report unused object keys). L52 `[ErrorCodes.UNSUPPORTED_MEDIA_TYPE]: 415,` bypasses the table. L3 claims 'Features: ... rate limiting', but `grep -ni rate src/lib/apiErrorHandler.ts` finds only the RATE_LIMITED mapping, because rate limiting lives in sensitiveRateLimit.ts. L19 `// Re-export for backward compatibility` sits on `export { ErrorCodes as ApiErrorCode }`, which 10+ routes import as the normal API (grep of `ApiErrorCode.*apiErrorHandler`), so it is not a compat shim.
- Problem: Dead table entries and misleading comments (one describes a feature this module does not have, the other calls a primary export 'backward compatibility').
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Remove CREATED, ACCEPTED and NO_CONTENT from HttpStatusCodes, but keep OK because L409 uses it. Add UNSUPPORTED_MEDIA_TYPE: 415 to the table and use it at L52. Remove 'rate limiting' from the L3 feature list. Change the L19 comment so it no longer says 'backward compatibility'.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K5
- Verifier: This is a real Nit. In src/lib/apiErrorHandler.ts, HttpStatusCodes (L23-40) is private to the module: grep finds no reference to it outside this file. Inside the file, only these keys are read: the ones used in ERROR_STATUS_MAP (L44-56) and OK at L409 (the createSuccessResponse default). CREATED, ACCEPTED and NO_CONTENT are never read. L52 hard-codes 415 instead of taking it from the table. The file has no rate limiting logic. Case-insensitive greps for 'rate', 'limit' and '429' match only the L3 header, the TOO_MANY_REQUESTS entry, the RATE_LIMITED mapping and generateCorrelationId. So the 'rate limiting' in the L3 feature list is false. ApiErrorCode is imported from apiErrorHandler by 20 files in src/tests, so it is the normal API and the 'backward compatibility' comment at L19 is misleading. Removing the three keys cannot break anything, because the object is not exported and those keys have no readers. Safe to do now. The fix is complete. Keep OK, since L409 uses it.

### R-347: Logger constructor config parameter and external-integration placeholder are never used
- Severity: Nit
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/logger-enterprise.ts:L37-L44, L57-L79, L230-L234, L247, L267
- Evidence: `grep -rn "EnterpriseLogger" src tests scripts` shows only `class EnterpriseLogger` (L55) and `export const logger = new EnterpriseLogger();` (L290), so the `config?: Partial<LoggerConfig>` constructor argument is never supplied. `redactionPlaceholder` and `sensitiveFields` can only come from that unused argument, so they are effectively constants. L230-L234 is an empty comment block ('Here you could add integrations with external logging services: Datadog, New Relic, Sentry...'). L247/L267 say the overloads are 'for backward compatibility with old logger', but the (message, error) form is current usage, e.g. src/lib/guestDataStore.ts:L82/L141 `logger.error('...', error)` and ShareButton/PwaManager/favorites.ts passing an Error as the 2nd argument.
- Problem: A configurable class for a singleton, a speculative integration placeholder, and comments that mislabel live API as legacy.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: In src/lib/logger-enterprise.ts, remove the constructor parameter and the `...config` spread (keep the env-derived defaults). Move `sensitiveFields` and `redactionPlaceholder` into module constants (e.g. SENSITIVE_FIELDS, REDACTION_PLACEHOLDER), remove them from `LoggerConfig`, and update sanitizeMetadata at L123-L124 to use the constants. Delete the placeholder comment at L230-L234. Reword the L247/L267 comments to describe the supported (message), (message, error) and (message, metadata, error?) forms and keep the overloads. Then run typecheck and any logger or redaction tests.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K6
- Verifier: I checked this against the code and it holds up. `EnterpriseLogger` is not exported. The file's only export is `export const logger = new EnterpriseLogger();` at src/lib/logger-enterprise.ts:290. I grepped src, tests, scripts and docs for EnterpriseLogger, LoggerConfig, redactionPlaceholder and sensitiveFields. The only hits are inside logger-enterprise.ts: the definitions at L37-L78 and the uses at L123-L124 (`this.config.sensitiveFields.some(...)` and `return this.config.redactionPlaceholder`). The class is not exported, so no test or other module can create it with a config. That means the `config?: Partial<LoggerConfig>` argument and the `...config` spread never take effect. `sensitiveFields` and `redactionPlaceholder` are always their default values, so they are constants in practice. The comment at L230-L234 is an empty placeholder with no code. The two "backward compatibility with old logger" comments (L247, L267) describe the `(message, error)` overload, which the finder showed is current usage, so the label is misleading. Removing the parameter changes nothing at runtime and no public API is affected. Severity Nit is right. One point to add to the fix: `LoggerConfig` still types `this.config`, so either keep the interface without those two fields or narrow it. Also update L123-L124 to use the new module constants.

### R-348: Security config knobs that have the same value in every environment, with always-true branches
- Severity: Nit
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/security-config.ts:L28, L38, L66, L90, L100, L102-L111, L120, L143, L155, L157-L166, L176, L212-L247; src/lib/security-middleware-edge.ts:L31-L33, L64-L66, L86-L88, L135, L145-L147
- Evidence: Both developmentConfig and productionConfig set `contentTypeOptions: true` (L100/L155), `reportUri: '/api/security/csp-report'` (L90/L143) and `credentials: true` (L120/L176), and have identical permissionsPolicy blocks (L102-L111 and L157-L166, containing only `['self']` and `[]`). So `if (headers.contentTypeOptions)` (edge L64), `if (this.config.csp.reportUri)` (L86), both `if (this.config.credentials)` (L135/L145) and `if (csp.value)` (L31, buildCSPDirective never returns '') are always true. buildPermissionsPolicy's quote stripping, the legacy 'none' keyword, `'*'`/`'src'`, and the JSON-quoted origin paths (L216-L233) are reachable only from tests/security/api-boundaries.test.ts:L250-L256.
- Problem: A general 'framework' (file header: 'Enterprise Security Configuration Framework') for a site with two fixed configurations. It hides the fact that dev and prod differ only in CSP strictness, HSTS, frame options, COOP/CORP and CORS origins.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: This is optional. It is a Nit and the code is security-sensitive. If you do it: (1) Emit X-Content-Type-Options: nosniff, the report-uri suffix, and Access-Control-Allow-Credentials: true unconditionally. Then remove the contentTypeOptions, reportUri? and credentials fields from SecurityConfig, or make reportUri a constant. Drop the `if (csp.value)` guard at edge L31. (2) Put the identical permissionsPolicy in one shared constant. (3) If you narrow buildPermissionsPolicy to the keywords actually used ('self' and empty lists), rewrite tests/security/api-boundaries.test.ts L250-257, which exercises 'none', '*' and an origin. Replace it with an assertion on the exact emitted Permissions-Policy string. (4) Keep the literal strings 'Strict-Transport-Security' and 'buildCSPDirective'/'Content-Security-Policy' in these files. scripts/validate-security.ts L90-124 text-matches them. (5) The line references to security-config.ts in docs/design/identity.md (L777, L835, L842, L1219, L1286) already look out of date, and this edit would shift them further. Update them in the same change. Before and after the change, compare the full emitted header sets (dev and prod) with a test.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: declined (O39)
- Verifier: CONFIRMED by reading src/lib/security-config.ts L72-186 and src/lib/security-middleware-edge.ts L26-160. getSecurityConfig (L182-186) returns only developmentConfig or productionConfig, both constants in the file. Both set contentTypeOptions: true (L100/L155), reportUri '/api/security/csp-report' (L90/L143) and cors.credentials: true (L120/L176). Their permissionsPolicy blocks (L102-111 and L157-166) are identical and contain only ['self'] and []. That makes these branches always true: edge L64 `if (headers.contentTypeOptions)`, L86 `if (this.config.csp.reportUri)`, and L135/L145 `if (this.config.credentials)`. L31 `if (csp.value)` is also always true: buildCSPDirective always gets 12 directives, and L87 appends report-uri besides. A grep over src, tests, scripts, docs and next.config for getSecurityConfig, buildPermissionsPolicy, contentTypeOptions, reportUri and security-config finds no other consumer. The only callers are the edge middleware and tests/security/api-boundaries.test.ts. That test calls buildPermissionsPolicy with 'none', '*' and an origin (L250-257), so the quote-stripping, keyword and JSON-origin paths are reached only from tests. scripts/validate-security.ts reads the two files as text but only checks for the strings 'Content-Security-Policy'/'buildCSPDirective' and 'Strict-Transport-Security', which the proposed simplification keeps. The finding is accurate as a Nit, but the fix has side effects it does not mention.

### R-349: Obsolete browser headers X-Download-Options and X-DNS-Prefetch-Control: on (SUSPECTED)
- Severity: Nit
- Category: Legacy
- Status: SUSPECTED
- Location: src/lib/security-middleware-edge.ts:L73-L74
- Evidence: L73 `securityHeaders['X-DNS-Prefetch-Control'] = 'on';` L74 `securityHeaders['X-Download-Options'] = 'noopen';`. `grep -rn "X-Download-Options\|X-DNS-Prefetch" . (excluding node_modules/.next/.git)` shows no test, nginx config or doc references them. From general knowledge, not verified against docs in this sweep: X-Download-Options is honoured only by Internet Explorer 8+, and `X-DNS-Prefetch-Control: on` is the browsers' default behaviour (it only has an effect as 'off').
- Problem: These headers are sent on every response with no effect on supported browsers. SUSPECTED until confirmed against MDN (developer.mozilla.org X-DNS-Prefetch-Control; X-Download-Options is not in the Fetch/HTML specs).
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Delete only L74 `securityHeaders['X-Download-Options'] = 'noopen';`, which can go now (Nit, Legacy). Keep L73 `X-DNS-Prefetch-Control: on`: it is not a no-op, because it turns on DNS prefetching that browsers leave off by default on HTTPS pages (per MDN). Changing it to 'off' or removing it changes behaviour, so the owner should decide that separately.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K11
- Verifier: This finding is only partly correct. I checked the two lines at src/lib/security-middleware-edge.ts L73-L74. A search of the repo (src, tests, scripts, docs, deploy, config and next.config.ts, leaving out node_modules, .next, .git and generated code) finds these headers nowhere else. No test snapshots or lists the set of headers, so removing a line breaks no test.

X-Download-Options: noopen is the true legacy part. It is a header that only Internet Explorer 8 and later ever read, and IE is retired. It does nothing in supported browsers, so it can be removed now.

The claim about X-DNS-Prefetch-Control: on is wrong. MDN (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-DNS-Prefetch-Control) says: "by default, prefetching of embedded link hostnames is not performed on documents loaded over HTTPS", and "on" turns prefetching on. Production is served over HTTPS (the same builder sets HSTS). So on this site 'on' does change behaviour: it enables DNS prefetching that browsers would otherwise skip. Deleting it would change behaviour, not just remove clutter. Keeping 'on' or switching to 'off' for privacy is a decision for the owner, not dead-code cleanup.

### R-350: Default `import React` in 7 files is unused under the automatic JSX runtime
- Severity: Nit
- Category: Legacy
- Status: CONFIRMED
- Location: src/app/error.tsx:L3; src/components/ApartmentLocationMap.tsx:L2; src/components/CheckInInfo.tsx:L3; src/components/InteractiveMap.tsx:L2; src/components/LeafletMap.tsx:L3; src/components/MapLoadingSkeleton.tsx:L3; src/components/StaticLocationMap.tsx:L2
- Evidence: tsconfig.json:L18 `"jsx": "react-jsx"`. Run: `npx tsc --noEmit --incremental false --noUnusedLocals --noUnusedParameters -p tsconfig.json` (read-only, no emit). Output: `src/app/error.tsx(3,8): error TS6133: 'React' is declared but its value is never read.` and the same TS6133 for ApartmentLocationMap.tsx(2,8), CheckInInfo.tsx(3,8), InteractiveMap.tsx(2,8), LeafletMap.tsx(3,8), MapLoadingSkeleton.tsx(3,1), StaticLocationMap.tsx(2,1). ESLint does not flag this because the default import is conventionally exempt.
- Problem: This is the pre-React-17 import pattern and has no runtime effect.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Remove the `React` default binding: `import { useEffect } from 'react'` etc., and delete the import line entirely in MapLoadingSkeleton.tsx and StaticLocationMap.tsx. Typecheck afterwards.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K7
- Verifier: I checked this and it holds up. tsconfig.json:18 sets "jsx": "react-jsx", and none of the 7 listed files uses the `React.` namespace anywhere. The grep only matched each file's import line (for example `src/components/MapLoadingSkeleton.tsx:3 import React from 'react';`). Many .tsx files have no React import at all and already build and test with the automatic runtime (src/app/layout.tsx, src/app/page.tsx, src/app/[locale]/not-found.tsx), so removing these imports will not break vitest or next. Ten files import React by default. The other three are left out correctly: TopControls.tsx and ui/Button.tsx are in the excluded areas, and ApartmentCinematic presumably uses the React namespace, since the finder's tsc run did not flag it. The fix is correct and safe to apply now, and it does not depend on any V-task.

### R-351: Phone-lookup fallback (international, then Greek local) implemented twice
- Severity: Low
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/guestDataStore.ts:L24-L31; src/lib/portalAuthService.ts:L316-L329
- Evidence: guestDataStore.findUserByPhone: `const primary = normalizePhone(phone); const greekLocal = normalizePhone(phone, 'GR'); const user = primary ? await userRepository.findByPhone(primary.e164) : undefined; if (user || !greekLocal || greekLocal.e164 === primary?.e164) return user; return userRepository.findByPhone(greekLocal.e164);`. portalAuthService.authenticatePortalUser: `const primaryPhone = normalizePhone(input.phone); if (!primaryPhone) throw ...; const greekLocalPhone = normalizePhone(input.phone, 'GR'); let user = await prisma.user.findUnique({ where: { phoneE164: primaryPhone.e164 } }); if (!user && greekLocalPhone && greekLocalPhone.e164 !== primaryPhone.e164) { user = await prisma.user.findUnique(...) }`. The comment in guestDataStore says 'Same order as guest sign-in'.
- Problem: The same identity-resolution rule is duplicated and already diverges: guestDataStore still tries the GR reading when the international parse fails, while sign-in rejects. The admin phone search (guestDataExport.getBookingsByPhone) can therefore find accounts that sign-in would not resolve.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Add to src/lib/phone.ts: `export function phoneLookupCandidates(input: string): string[] { const primary = normalizePhone(input); if (!primary) return []; const gr = normalizePhone(input, 'GR'); return gr && gr.e164 !== primary.e164 ? [primary.e164, gr.e164] : [primary.e164]; }`. This keeps sign-in's reject-on-primary-null behaviour. Use it in authenticatePortalUser (reject when the list is empty, otherwise try the candidates in order with findUnique) and in guestStore.findUserByPhone (loop over userRepository.findByPhone). The only behaviour change is that the admin search stops matching 10-digit inputs that start with 0, which is the intended alignment. Put a direct unit test for the helper in tests/unit (primary only, primary plus GR, dedupe, the leading-0 case). Run the existing portalAuthService and guestDataExport route tests. Nothing here depends on a V-task, so it can be done now.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K9
- Verifier: CONFIRMED by reading. src/lib/guestDataStore.ts:L25-L33 (findUserByPhone) and src/lib/portalAuthService.ts:L316-L329 (authenticatePortalUser) both run the same rule: normalizePhone(x) first, then normalizePhone(x,'GR') only when nothing is found and the E.164 differs. The guestDataStore comment says so itself ("Same order as guest sign-in"). Callers: findUserByPhone has a single caller, guestDataExport.getBookingsByPhone (guestDataExport.ts:L88-L89), which is reached from api/admin/guests/route.ts:L65. The two copies do diverge, but only in a narrow case. Looking at src/lib/phone.ts, primary is null while the GR parse succeeds only for a 10-digit, all-digit input that starts with 0 (for example "0123456789"). The primary parse gives "+0123456789", which fails isE164 /^\+[1-9]/. The GR parse gives "+300123456789", which passes. In every other case where the GR parse succeeds, primary also succeeds. So "can find accounts sign-in would not resolve" is true only for that edge case, which is not a real Greek number, and it only affects an admin search. The duplication and its drift risk are real at Low severity. The divergence is overstated.

### R-352: system-orchestrator.sh: unused PROFILE variable and ignored --profile/--skip-build compatibility flags
- Severity: Nit
- Category: Redundant
- Status: CONFIRMED
- Location: scripts/system-orchestrator.sh:L16, L65, L125-L131; scripts/lib/release-policy.mjs:L636-L644; scripts/tests/release-policy.test.mjs:L81, L449
- Evidence: `grep -n "PROFILE" scripts/system-orchestrator.sh` returns only L16 `PROFILE="development"`, so the variable is never read. L65 says '(--profile development and --skip-build are accepted for compatibility and ignored.)'. L125-L131 accept `--profile development` and swallow `--skip-build`. `grep -rn "profile development\|skip-build" docs scripts README.md CLAUDE.md package.json` finds no caller (the package.json scripts L72-L87 pass only --db-only/--skip-migrate). release-policy.mjs L640 requires the line `^PROFILE="development"$` to exist.
- Problem: A dead variable is kept alive only because a policy regex looks for it, and the CLI accepts flags that no caller uses.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: The proposed fix is correct. For completeness:
(1) In system-orchestrator.sh, delete L16 `PROFILE="development"`, the L65 usage note, and the `--profile)` and `--skip-build)` cases (L128-L134).
(2) In release-policy.mjs validateLocalDefaults (L636-L644), drop the `!/^PROFILE="development"$/mu.test(orchestrator)` term. Keep the `orchestrator === undefined` check and the negative regex `/PROFILE="production"|--profile production|^\s*production\)/mu`.
(3) Update the L81 fixture in release-policy.test.mjs; the test passes without changes, but the fixture should stop modelling a PROFILE line. The L449 fixture can stay as it is, since it is still rejected through `production)`.
Gates: `bash -n scripts/system-orchestrator.sh`, `npm run validate:release-policy`, `npm run test:release-policy`, and a manual `npm run system:check`.
Do this as its own task, only after the owner approves reversing the S1 decision to keep these flags as compatibility no-ops.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K10
- Verifier: I verified this against the tree. In scripts/system-orchestrator.sh the only PROFILE hit is L16 (`PROFILE="development"`), so the variable is never read. The flags `--profile development` and `--skip-build` are only shifted away (L128-L134), and L65 says as much. An unknown option already falls through to `die "Unknown option: $1" 1` (L176-L177). Nothing in the repo passes `--profile development` or `--skip-build`: package.json L72-L76 passes only `--db-only`/`--skip-migrate`, and scripts/README.md L85-L90 now lists the plain `npm run system:*` commands. The only `--profile` in scripts/README.md is L199, which is the docker compose `--profile ops` and unrelated. The only other in-repo mentions of these flags are the historical records in PROGRESS.md and REVIEW.md. The one thing that still depends on L16 is the positive regex `^PROFILE="development"$` in release-policy.mjs L640. The release-policy.test.mjs L956 test (`migrate --profile production` in package.json) belongs to a different check ("must not select production by default") and is not affected. The L449 negative fixture still fails through the `production)` pattern once the positive assertion is gone, and the L81 fixture still passes. Two caveats. First, keeping these flags as no-ops was a deliberate S1 decision (PROGRESS.md L634/L672, REVIEW.md L2957: "would break any external shell alias ... keep that as a separate step"), so this is legacy to remove with the owner's approval, not a defect. Second, after the change `--profile production` exits with code 1 ("Unknown option") instead of the explicit 11 and its message. No test checks for 11. This is not in any of the excluded areas.

### R-353: Optional parameters and defaults no caller relies on (grouped nits)
- Severity: Nit
- Category: Redundant
- Status: CONFIRMED
- Location: src/lib/validation.ts:L14; src/data/mapLocations.ts:L198, L242-L243; src/data/apartmentData.ts:L150; src/lib/mapConstants.ts:L3-L8; src/components/MapLoadingSkeleton.tsx:L14-L16; src/components/ResponsiveImage.tsx:L14-L21; src/i18n/dictionaries.ts:L3-L6, L38-L42; src/components/DeferredRuntimeManagers.tsx:L6-L14
- Evidence: validateLocalization(locales = ['en','el']): the only callers (scripts/validate-content.ts:L5 and the tests) always pass locales, and the default duplicates src/i18n/config.ts. getKalamataLandmarks(locale = 'en'), getApartmentMapLocation(locale = 'en') and getApartmentContent(locale = 'en'): every call site in the grep output passes a locale. MAP_DEFAULTS.HEIGHT.DEFAULT is used only as MapLoadingSkeleton's default, and both callers pass height (CheckInInfo L65, CategoryGridClient L20). ResponsiveImage has one caller (MomentsDetailLayout L101-L110), which always passes sizes/objectPosition, so the `sizes ||` and `objectPosition || 'center'` fallbacks are dead. dictionaries.ts L5/L41 describe the merged Dictionary as 'for backward compatibility', but it is the only dictionary API. DeferredRuntimeManagers: `if (typeof window === 'undefined')` inside a function called only from useEffect is always false, and the hand-typed `requestIdleCallback?` cast predates lib.dom including it.
- Problem: These are small always-default parameters, dead fallbacks and misleading 'compat' comments. None is a bug, but each suggests flexibility that is not used.
- Impact: dead or duplicated code/data kept in the build; no runtime effect unless stated in Problem.
- Fix: Apply as proposed (make locale/locales required, delete MAP_DEFAULTS.HEIGHT.DEFAULT or make height required, drop `sizes ||`, reword the dictionaries.ts comments), with two corrections.
(1) ResponsiveImage: `objectPosition || 'center'` is not dead. heroImagePosition is usually undefined. Either leave it, or drop it knowing it is only equivalent because of the CSS default object-position of 50% 50%.
(2) DeferredRuntimeManagers: remove the `typeof window` guard and the custom `w` cast, and use `window.requestIdleCallback` / `window.cancelIdleCallback`. Keep the runtime check `if ('requestIdleCallback' in window)` and the setTimeout fallback, because Safari does not provide requestIdleCallback. Run the typecheck afterwards.
- Fix risk: typecheck/lint/tests; CSS changes need G-VIS on the affected routes.
- Task: R3-K7
- Verifier: Most sub-claims hold up. One piece of evidence is wrong.
- validation.ts:L14: the default ['en','el'] is never used. scripts/validate-content.ts:5 passes [...locales], and every test call passes ['en','el'].
- getKalamataLandmarks, getApartmentMapLocation and getApartmentContent: every caller passes a locale (the grep covered src, tests and scripts). Callers are CheckInInfo:304/380, ContactSection:74, StaticLocationMap:46, SearchBar:61, HomeInteractiveBar:12 and mapLocations:245/305/307. SearchBar has its own `locale = "en"` default, so the data-layer default adds nothing.
- MAP_DEFAULTS.HEIGHT.DEFAULT is used only as MapLoadingSkeleton's default. Both callers pass height: CheckInInfo:65 passes COMPACT and CategoryGridClient:20 passes the literal "400px".
- ResponsiveImage has one caller, MomentsDetailLayout:101-110. It always passes a `sizes` string, so the `sizes ||` fallback is dead.
- The `objectPosition || 'center'` claim is WRONG. The caller passes `item.heroImagePosition`, which is optional (MomentsDetailLayout.tsx:15). Only src/data/items/phones.json sets it, so the value is usually undefined and the fallback runs. Removing it still does not change what renders, because CSS object-position defaults to 50% 50% (center). It is redundant, not unreachable.
- dictionaries.ts L5/L41: the "backward compatibility" wording is misleading, since the merged Dictionary is the API.
- DeferredRuntimeManagers: scheduleIdle is called only inside useEffect (L46), so `typeof window === 'undefined'` is always false. tsconfig lib includes "dom", and TS lib.dom types requestIdleCallback (since TS 4.4). But Safari does not implement requestIdleCallback by default, so the runtime check and the setTimeout fallback must stay. Only the hand-written type cast can go.

### R-357: V4 replaced the literal claim-token URL sanitisation lines that the release policy checks
- Severity: Medium
- Category: Security
- Status: CONFIRMED (fixed 2026-10-04 during the K merge)
- Location: src/app/[locale]/guest/UnifiedGuestClient.tsx:51-63, 81-91; scripts/lib/release-policy.mjs:791-803
- Evidence: `npm run validate:release-policy` → "guest claim transport must retain sanitization marker: current.searchParams.delete('claimToken')". R3-V4 had changed the two deletes to `LEGACY_CLAIM_QUERY_PARAMS.forEach((name) => current.searchParams.delete(name))`.
- Problem: behaviour was unchanged, but the release gate (part of verify:release) failed; validate:release-policy was not among V4's gates.
- Impact: verify:release would have failed at release time; the policy guards that claim capabilities never stay in the URL.
- Fix (applied): restored the literal `delete('claim')` / `delete('claimToken')` calls with a comment pointing at the policy; LEGACY_CLAIM_QUERY_PARAMS stays for shellLinks. validate:release-policy passes; test:release-policy 63/63.
- Fix risk: none functional; component tests 329/329.

## Findings recorded during V12/V13 (2026-10-06)

### R-358: Tailwind scans REVIEW.md/PROGRESS.md and generates dead utilities into the global CSS
- Severity: Low · Category: Unused · Status: CONFIRMED
- Location: src/app/globals.css (@import "tailwindcss" with automatic source detection)
- Evidence: the built global chunk contains `dark:border-red-900` and `dark:bg-red-950/60` (and earlier `text-brand-*`), whose only occurrences are in the markdown files (R3-V12b notes).
- Fix: `@source not "../../*.md";` (or an explicit source list) in globals.css; re-measure the CSS size.
- Task: R3-V13f

### R-359: audit:a11y and audit:responsive:ux do not block non-loopback requests themselves
- Severity: Medium · Category: Security · Status: CONFIRMED
- Location: scripts/axe-a11y.ts, scripts/responsive-ux-audit.ts (launch options)
- Evidence: R3-V13 had to inject a preload to add local-only Chrome flags; audit-vitals.ts already sets them.
- Impact: running the advisory audits could fetch map tiles or other third-party resources from the headless browser (owner rule: no external sites).
- Fix: same launch args + request interception as scripts/audit-vitals.ts; refuse non-loopback base URLs.
- Task: R3-V13f

### R-360: /{l}/moments heading order skips h2 (h1 → guide-card h3)
- Severity: Low · Category: Maintainability (a11y) · Status: CONFIRMED (axe heading-order, moderate)
- Fix: card titles as h2, or a visually hidden h2 for the result list. Task: R3-V13f

### R-361: mobile network-status pill overlaps footer links and bottom-left text
- Severity: Low · Category: Maintainability (a11y) · Status: CONFIRMED (covers 44 % of a focused footer Privacy link; 2.4.11 AA passes)
- Location: src/app/[locale]/layout.tsx:62 (`fixed bottom-2 left-2`)
- Fix: bottom scroll padding below 640 px or move/shrink the pill when idle. Task: R3-V13f

### R-362: sticky apartment room chips cover a focused tile (23 %)
- Severity: Low · Category: Maintainability (a11y) · Status: CONFIRMED
- Fix: `scroll-margin-top` on `.apt-tile` equal to the chips' offset. Task: R3-V13f

### R-363: check-in Wi-Fi copy failure is only logged; the guest gets no feedback
- Severity: Low · Category: Error handling · Status: CONFIRMED
- Location: src/components/CheckInInfo.tsx:497-507
- Fix: show the existing failure toast/text ("select the password") like the admin claim copy (R-303 pattern). Task: R3-V13f

### R-364: leftovers after the legacy CSS removal
- Severity: Nit · Category: Unused · Status: SUSPECTED (dynamic use not ruled out for the class)
- Evidence: `--color-glow` defined in tokens.css (3 blocks) with no reader; LeafletMap.tsx adds `.shell-link` to the zoom buttons only to beat the deleted legacy link rule.
- Fix: remove both after a reference search and a visual check of the map controls. Task: R3-V13f

### R-365: guide map view hides places without coordinates (filters show "2 places" over an empty list)
- Severity: Low · Category: Bug (UX) · Status: CONFIRMED (R3-C2 G-VIS: en_moments-map-chip1-light-390.png, mapItems 0, cards 0)
- Location: src/components/guide/GuideList.tsx (`mapped = results.filter((entry) => entry.location)`)
- Problem: after C2, 13 places have no coordinates; in map view, chips like Beaches/Restaurants/Taygetos list nothing, so those places are unreachable from map view and the "numbers match this list" note sits under nothing.
- Fix: under the numbered list, an unnumbered "Not on the map" / "Χωρίς σημείο στον χάρτη" list of the filtered places without coordinates (rendered only when non-empty), plus one component test. Task: R3-C2f
- Resolution: FIXED in R3-C2 apply (GuideList "Not on the map" list + component test); verified in R3-C2f (test fails with the block disabled). Patch R3-C2f-R1.

### R-366: Directions fallback searches descriptive addresses
- Severity: Low · Category: Bug (UX) · Status: CONFIRMED
- Location: guide Directions link for places without coordinates (Google Maps free-text search on the localized address)
- Problem: for Polylimnio the query is "Near Charavgi, off the Kalamata–Pylos road", which is not a searchable place.
- Fix: search by the place name plus "Messinia, Greece" (or omit the link when the address is descriptive); test the query builder. Task: R3-C2f
- Resolution: FIXED in R3-C2f (patch R3-C2f-R1): fallback query is "<localized name>, Messinia, Greece" only when an address exists; no address and no coordinates → no link (as before); explicit directionsUrl still wins. Unit test tests/unit/guide-entries.test.ts fails on the old code.

### R-367: stale doc comment in guideFilters.ts after C2
- Severity: Nit · Category: Maintainability · Status: CONFIRMED
- Problem: the module comment still says only All, Museums and Sites show and that C2 "may add" content.
- Fix: update the comment. Task: R3-C2f
- Resolution: FIXED in R3-C2f (patch R3-C2f-R1).

### R-368: stale header comment in motion-css-gate test
- Severity: Nit · Category: Maintainability · Status: CONFIRMED (reported by the R3-R1 implementer)
- Location: tests/unit/motion-css-gate.test.ts:8
- Evidence: `// … The legacy 01-13 sheets are out of scope until R3-V12.` — the sheets were deleted in R3-V12b.
- Fix: drop the sentence. Task: nits group (after R3-C1).
- Resolution: FIXED in R3-C1f (patch R3-C1f).

### R-369: source-map-js 1.2.1 has a high advisory (GHSA-68fv-2mgg-jv7q)
- Severity: Medium · Category: Dependencies · Status: CONFIRMED (verify:release gate 23, `npm audit --omit=dev`: high=1)
- Location: package-lock.json `node_modules/source-map-js` (via next→postcss, prisma→@prisma/config→c12→magicast; dev: tailwind, jsdom, coverage)
- Evidence: audit artifact: `source-map-js high 1.0.0 - 1.2.1 … event-loop denial of service through indexed source-map section offsets` (https://github.com/advisories/GHSA-68fv-2mgg-jv7q); fixed in 1.2.2.
- Impact: release gate fails; runtime exposure is low (no untrusted source maps are parsed in production), but the gate is policy.
- Fix: `npm update source-map-js` (in range of every parent; lockfile only, 3 lines; package.json unchanged). Owner approved 2026-10-06.
- Resolution: FIXED in R3-R2 (lockfile 1.2.2, integrity sha512-KGj/8Y43…; `npm audit --omit=dev`: 0 vulnerabilities).

### R-370: dev-only high advisory in braces (lint toolchain), no fixed version published
- Severity: Low · Category: Dependencies · Status: CONFIRMED (`npm audit`: high=5, all one chain; `npm audit --omit=dev`: 0)
- Location: package-lock.json, chain eslint-config-next@16.3.6 → @next/eslint-plugin-next → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3
- Evidence: GHSA-vfj7-8cjw-p6xm (https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), range `<=3.0.3`; `npm view braces version` → 3.0.3 (latest, 2024-09-18), so no patched release exists; npm's only "fix" is downgrading eslint-config-next to 14.2.35 (breaking, wrong).
- Impact: stack-exhaustion DoS only when braces expands attacker-controlled deeply nested patterns; here it runs only in local lint over repository globs. Not in the production image; the release gate audits production dependencies only and passes.
- Fix: none now. Re-check when braces or @next/eslint-plugin-next publishes a fix; do not downgrade or override to an unreleased version.

### R-371: smoke:image offline check no longer tests offline (puppeteer 25)
- Severity: Medium · Category: Tests · Status: CONFIRMED (diagnostic copy of the smoke run)
- Location: scripts/smoke-production-image.ts, check "offline: visited page and offline fallback"
- Evidence: puppeteer-core 25.12.0 `NetworkManager.setOfflineMode` sends `Network.emulateNetworkConditions` only to the page's own clients (node_modules/puppeteer-core/lib/puppeteer/cdp/NetworkManager.js:136-185); the service-worker target is separate. Smoke run: `/el/phones` offline returned the live phones page (`fromServiceWorker=true`, cache keys then included `/el/phones`). Puppeteer was 24.43.1 at fff4283 (last 21/21).
- Impact: the check passed or failed by accident; a broken offline fallback would go unnoticed.
- Fix: also emulate offline on the service-worker target via a CDP session, restore it in `finally`. Proven: with the SW offline, `/el/phones` renders "Είστε εκτός σύνδεσης".
- Resolution: FIXED in R3-R2 (smoke 23/23).

### R-372: audit:a11y / audit:responsive:ux lose every navigation after the first page
- Severity: Low · Category: Tests · Status: CONFIRMED
- Location: scripts/axe-a11y.ts (page setup), scripts/responsive-ux-audit.ts (`blockNonLocalRequests`)
- Evidence: `[axe-a11y] Navigation returned no HTTP response` for /en/apartment, /en/favorites, /en/offline, /en/phones, /en/phones/emergency-112 once the service worker controlled the page (request interception from R-359 is on).
- Fix: `page.setBypassServiceWorker(true)` before enabling interception; the audits check rendered pages, not offline behaviour.
- Resolution: FIXED in R3-R2 (axe 22 routes, 0 violations; responsive 81 cells, 0 major/critical).

### R-373: 23 unused i18n keys in common.ts (V8 follow-up)
- Severity: Low · Category: Unused · Status: CONFIRMED (whole-repo reference search; typecheck/knip/tests after removal)
- Location: src/i18n/domains/common.ts (`CommonDictionary` type + `en` + `el`)
- Keys: `backHome`; `ui.resetAll`, `ui.back`; `labels.save`, `labels.saved`, `labels.favorites`, `labels.addFavorite`, `labels.removeFavorite`, `labels.share`; the whole `a11y` group (`placeDetails`, `viewDetailsFor`, `openMapFor`, `addNamedFavorite`, `removeNamedFavorite`); the whole `moments` group (`searchAndFilter`, `searchMoments`, `searchPlaceholder`, `noPlaces`, `clearSearch`, `filterByCategory`, `mapCaption`, `subtitle`); `map.openMap`. The last consumer of `moments`/`a11y` was the removed `src/components/CategoryGridClient.tsx` (R-222 evidence: `t.moments?.searchAndFilter … t.moments?.clearSearch`; the file no longer exists).
- Evidence (searches run over src, tests, scripts, docs, public, root; excluding node_modules/.next/.git/generated/coverage/.env*):
  - `common.ts` is spread at the top level of `Dictionary` (src/i18n/dictionaries.ts:71 `...commonTranslations[locale]`), so access is `t.<group>.<key>`; `CommonDictionary`/`commonTranslations` are referenced only in dictionaries.ts.
  - Per leaf, `grep -rnE "\b<group>(\?)?\.<key>\b|\b<group>\[['\"]<key>['\"]\]"`: 0 hits for every key above. Bare `grep -rnw <key>` for the unique names (resetAll, backHome, addFavorite, removeFavorite, placeDetails, viewDetailsFor, openMapFor, addNamedFavorite, removeNamedFavorite, searchAndFilter, searchMoments, noPlaces, clearSearch, mapCaption, openMap, subtitle): hits only in common.ts and in REVIEW.md history text.
  - Common-word keys (back, save, saved, favorites, share, filterByCategory, searchPlaceholder) checked for property access, optional chaining, destructuring and string indexing: `.back`/`back}` 0 code hits; `.save`/`.saved` hits are `t.guide.save(d)` and CheckInInfo's local `ui` built from `t.checkinInfo.panel` (CheckInInfo.tsx:326-350); `favorites` hits are `const { favorites } = useFavorites()`; `.share` 0; `filterByCategory` is the function in guideFilters.ts; `searchPlaceholder` is `t.guide.searchPlaceholder`.
  - Group-level and dynamic use: no `t.ui`/`t.labels`/`t.a11y`/`t.moments` object is passed, spread, destructured or iterated; `grep -rnE "\.(ui|labels|a11y|moments|map)\[|mapT\["` 0 hits; `Object.keys/entries` on dictionaries only touch `legal.privacy.storage.*`; `keyof Dictionary[...]` only for `categories` and `guide.phoneGroups`; scripts and public/ do not import i18n. `dictionary.a11y.*` in UnifiedGuestClient.tsx is the portal domain (`getDictionary(locale).portal`, line 19).
- Kept (dynamic use): `categories.*` (`t.categories[category.slug as keyof …]`, guideEntries.ts:89), `momentsFilters.*` (`t.momentsFilters[key]`), `momentTags` (`t.momentTags[tag]`). `map.*` other than `openMap` are read through `const mapT = dict.map` (InteractiveMap.tsx:32-45, 98) or directly.
- Impact: dead strings shipped in the client dictionary chunk in both locales (R-172 evidence: the 48 KB chunk contained `removeNamedFavorite`), and dead copy to translate and keep in parity.
- Fix: delete the keys from the type and both locales (NFC unchanged; removal only).
- Resolution: FIXED in R3-Z2 (2026-10-06). i18n-parity + i18n-copy + brand tests 20/20; `npx tsx scripts/validate-content.ts` exit 0; typecheck, lint --max-warnings=0, lint:security, knip rc=0; full suite 151 files / 1789 tests passed.

### R-374: guide map at 390 px: landmark icons and the home label hide the numbered pins (V8 follow-up)
- Severity: Low · Category: Bug · Status: CONFIRMED (DOM measurement on the dev server, non-localhost requests blocked, so only pins render)
- Location: src/components/LeafletMap.tsx (marker creation in the markers effect); fit in `fitOriginAndMarkers`
- Method: `/en/moments?map=1` and `/el/moments?map=1`, 390×844 and 1440×900, light and dark, after the M35 drop animation; bounding boxes of `.leaflet-marker-icon .map-pin`, pair overlap = intersection / smaller area; number visibility = share of 9 sample points over each number disc where `elementFromPoint` hits that pin's own marker. Fitted zoom from the blocked tile requests: 13 at 390 px, 15 at 1440 px. Captures and JSON in `.runtime/design/vis/R3-Z3/` (`before-*`, `after-*`, `after-zoomin-*`).
- Evidence (before, default fit, identical in light/dark): 390 px, 12 pins (5 numbered, home, 6 landmarks), pairs > 25%: 23rd of March Square/4 80%, home/Holy Trinity 79%, Vasileos Georgiou Square/3 65%, 23rd of March Square/5 55%, 4/5 55%, home/1 44% (en only; the el label is shorter), home/Sklavenitis 41%, Vasileos Georgiou Square/2 30%. Numbers visible: en 1 33%, 3 0%, 4 0%, 5 22%; el 3 0%, 4 0%, 5 22%. 1440 px: no pair > 25% (max 21%), every number 100% visible.
- Cause: Leaflet stacks markers by latitude only, so the southern landmark icons and the home pill sit over the guide's numbered pins. The landmarks are 98–215 m from the numbered places (23rd of March Square–4 98 m, Vasileos Georgiou Square–3 144 m, 4–5 198 m) and at zoom 13 that is 7–14 px for a 34 px pill.
- Fix: `zIndexOffset: 1000` for numbered markers (0 otherwise), so the numbers are stacked above the landmark and home pins. Not changed: the fit. Zoom 14 at 390 px would need about 346 of the frame's 351 px for the fitted span plus the home label's half-width, so no padding or pin-size change makes the fit-all view separate 4 and 5. No clustering (removed on purpose).
- Regression test: tests/components/leaflet-map-tiles.test.tsx "stacks the numbered pins above the landmark and home pins" (failed before: `expected 0 to be greater than 0`, line 194).
- Resolution: FIXED in R3-Z3 (2026-10-06). After the fix at 390 px: numbers 1, 2, 3, 5 100% visible in en/el light/dark; 4 is 11% visible under 5 (198 m apart, 14 px at zoom 13; remains as a scale limit); the en home label is 95% visible (pin 1 covers the end of "here"), el 100%. 1440 px is unchanged (all 100%). One zoom-in step at 390 px: all five numbers 100% visible, 4/5 overlap 22%. The numbered list below the map stays the primary navigation (identity §8 MapCard).
