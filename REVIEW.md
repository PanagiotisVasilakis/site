# Review: refactoring and legacy / redundant / unused code

Repository: `qr-city-guide` @ `main` `cfe6ec4`. Review date: 2026-09-23. Baseline: see PROGRESS.md.

## Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 1 |
| Medium | 24 |
| Low | 76 |
| Nit | 1 group |

**Status legend**
- **CONFIRMED**: verified by reading every relevant code path, or by running it.
- **SUSPECTED**: plausible but not verified; each one has a "To confirm" step.

**Verification level**
- **LEAD**: re-checked independently by the lead reviewer with the command or file shown.
- **AGENT**: verified by a review sub-agent. Its grep commands and line quotes are reproduced here, but they were not re-run by the lead. Treat AGENT items as needing a quick re-check at execution time. Task gates will re-verify them anyway.

**Owner decisions already given**
- No external client calls any API route. A route is a deletion candidate when it has no caller in `src/`, `scripts/`, `public/sw.js` or `deploy/`.
- The deletion of `.github/` is intentional.

### Main themes
1. **Legacy auth surface outlived the claim-token migration.** Examples: portal `start`/`verify`/`onsite` routes, booking-reference linking, the secret-only refresh fallback, the dev session-mint route, and about 90 dead portal i18n keys.
2. **Orphan API surface.** About 20 routes or methods have no caller. Each carries env keys, OpenAPI entries and orchestrator/installer plumbing.
3. **Module-memory observability that nothing reads.** `metrics-collector` (665 lines), `distributed-tracing` (366), the lite no-op pair in the proxy, the in-memory `SecurityMonitor`, and `errorReporting` breadcrumbs.
4. **Frontend dead UI and duplicated content.**
   - Dead: the generic category grid, filters, map routing, JSON warmup, unused CSS/variants.
   - Duplicated: contact details and house facts in 4–5 copies that already contradict each other on `/check-in`.
5. **Tooling duplication**, e.g. the bash copy of the env contract, the Makefile, and duplicated audit scripts.
6. **Real bugs found along the way:** the booking form locks on invalid submit, the admin Health tab crashes, client error reports are dropped, and admin date search misses start-day bookings.

### Cross-cutting constraint for every task
`scripts/lib/release-policy.mjs` pins the following, and `validate:release-policy` / `test:release-policy` / the secret scan fail if any of them changes without matching policy and allowlist updates:
- package script strings (`EXPECTED_PACKAGE_SCRIPTS`, L143+)
- the 30-gate profile (L110-141)
- the Makefile development default (L659-664)
- markers in `deploy/systemd/qr-city-guide.service` (L547-549)
- the existence of some files (e.g. verify-spike, L2326-2345)
- secret-fixture positions by line and column (`EXPECTED_CURRENT_SECRET_FIXTURES`, L205+, e.g. `.env.example` line 5 col 15, `tests/security/security-boundaries.test.ts` lines 33 and 222)

### Areas reviewed
All of `src/` (app, api, lib, components, hooks, i18n, data, config, styles, types), `prisma/` (schema and migrations), `scripts/`, the root configs, `deploy/systemd`, `docker/`, `docs/`, the root `*.md` files, `tests/` (for coverage and assertions), `public/` (for asset references) and `package.json` dependencies.

### Areas NOT reviewed, and why
- `scripts/lib/release-policy.mjs` beyond ~L700, and `check-secrets.mjs`, `artifact-file-walker.mjs`, `generated-artifact-secret-disposition.mjs`, `npm-audit-evidence.ts`, `responsive-ux-audit.ts`: these are large security tooling files, read only where findings touched them.
- The bodies of `scripts/tests/*.test.mjs` and the large integration test files.
- `deploy/nginx/*` and `scripts/test-nginx-ingress.sh`, beyond the rate-limit map.
- The prose of `docs/security/*.md` (paths and routes only).
- `public/sw.js`: not reviewed for full correctness, only for coupling and asset references.
- Runtime and browser behavior. The app was not run. `test:integration` and `verify:release` were not run (they need Docker; not yet requested).

### Rejected candidate findings (checked and found not to be problems)
- **"Root `instrumentation.ts` is never loaded because the app uses `src/`."** Rejected (LEAD). After `npm run build`, `.next/server/instrumentation.js` loads chunk `server/chunks/_1f0rrf4._.js`, which contains `"Environment validation passed"`. Turbopack, the Next 16 default (`▲ Next.js 16.2.11 (Turbopack)` in the build log), includes the root file.
- **`knip --production` "unused dependency" `pg`.** False positive (AGENT). `@prisma/adapter-pg` 7.8.0 depends on `pg`, the orchestrator heredoc imports it (`system-orchestrator.sh:591`), and so do the integration tests. The direct pin anchors the version.
- **`knip --production` "unused files" under `scripts/`.** False positives. They are entry points through `package.json` scripts and systemd.
- **"`@sentry/node` override is dead."** Rejected (AGENT). `package-lock.json` has `node_modules/@sentry/node` 10.64.0 through `lighthouse`. See R-066 for its missing rationale.

---

## Critical

### R-001: `next@16.2.11` has critical advisories (unauthenticated RCE), `sharp@0.35.3` has a high one, and the release gate currently fails
- Severity: Critical
- Category: Dependencies / Security
- Status: CONFIRMED (the vulnerable versions are installed). Exploitability in this deployment was not analyzed.
- Verification: LEAD
- Location: `package.json:110` (`next`), `package.json:153` (`sharp`), `next.config.ts:12-20` (`images.remotePatterns`)
- Evidence:
  ```
  $ npm audit --omit=dev --json   (summary)
  {"moderate":2,"high":7,"critical":1,"total":10}
  critical next  >=16.0.0 <16.3.3 | Unauthenticated RCE in Image Optimization API when AVIF files are used  GHSA-2xp9-vwfh-vxw4
  critical next  >=16.0.0 <16.3.3 | Unauthenticated RCE on windows-hosted servers  GHSA-p293-qw3h-jr36
  high     sharp <0.35.4          | Vulnerabilities in libheif  GHSA-rgj7-g3m4-5g8c
  $ grep '"version"' node_modules/next/package.json node_modules/sharp/package.json -> 16.2.11, 0.35.3
  $ npm audit --audit-level=high --omit=dev ; echo $?   -> 1
  ```
  Other production-scope highs: `fast-uri`, `mysql2`, `deepmerge-ts` (via `prisma` / `@prisma/dev` under `@prisma/client`), and `nanoid` (via `next` → `postcss`).
  The full tree (`npm audit`) shows 24: 6 moderate, 17 high, 1 critical.
- Problem: The production framework version is inside a critical RCE advisory range. The image optimizer is active, because the app uses `next/image`. `validate:security` (release gate 24) runs `npm audit --audit-level=high --omit=dev` (`docs/release-verification.md:95-96`), so `verify:release` cannot pass today.
- Impact: Potential unauthenticated RCE on the image optimizer endpoint, if the AVIF precondition can be met. Separately, no release candidate can pass the mandatory local gate.
- Fix:
  - Upgrade `next` to ≥16.3.3; `npm audit` proposes 16.3.6. Also align `eslint-config-next`.
  - Upgrade `sharp` to ≥0.35.4. The `overrides` pin `sharp: "$sharp"`, so bump the direct dependency.
  - Re-run the audit and triage the remaining production-scope highs (prisma chain, nanoid).
  - Mitigation independent of the upgrade: drop the unused `images.remotePatterns` (R-067).
- Fix risk: Framework minor upgrade. Needs the full test suite, typecheck, lint, build and a visual smoke test. **The dependency upgrade needs your approval.**

---

## High

### R-002: The booking form locks after any invalid submit (`onInvalid` throws "Converting circular structure to JSON")
- Severity: High
- Category: Bug
- Status: CONFIRMED (library source read; final step executed)
- Verification: LEAD
- Location: `src/components/BookingForm.tsx:114-117,163,306`; `src/lib/logger-client.ts:35-37`
- Evidence:
  - `BookingForm.tsx:115` `logger.warn('Booking form validation failed', { errors });`
  - `logger-client.ts:35-37` `JSON.stringify(meta, null, 2)`, with no try/catch and in every environment.
  - In `@hookform/resolvers` `toNestErrors`: `Object.assign(r[o]||{},{ref:c&&c.ref})`, so every field error carries the input DOM element. The fields are registered DOM inputs (`register('firstName')`, etc., `BookingForm.tsx:180+`).
  - In `react-hook-form` 7.81.0 `handleSubmit` (`dist/index.esm.mjs:2556-2567`), `await onInvalid(...)` is not in a try, and `isSubmitting: false` comes after it.
  - Scratchpad run (jsdom, React 19.2.7): the rendered `<input>` has own keys `__reactFiber$…`, `__reactProps$…`, and `JSON.stringify({errors:{firstName:{ref: el}}})` throws `TypeError - Converting circular structure to JSON`.
  - `BookingForm.tsx:306` `disabled={isSubmitting}`.
- Problem: On `/[locale]/book` (the main conversion form), submitting with any invalid field throws inside `onInvalid`. RHF never resets `isSubmitting`, and it skips focus-to-error.
- Impact: The submit button stays disabled in the "sending" state until the page is reloaded. Guests who make one validation mistake cannot send a booking request.
- Fix: `logger.warn('Booking form validation failed', { fields: Object.keys(errors) });`. Optionally, harden `logger-client` with a try/catch around `JSON.stringify` (separate concern).
- Fix risk: Minimal. Add a component regression test that submits the form empty and asserts the button is enabled again. It must fail before the fix and pass after.

---

## Medium

### R-003: The admin "Health" tab crashes: `HealthMonitor` renders fields `/api/health` no longer returns
- Severity: Medium
- Category: Bug (Legacy)
- Status: CONFIRMED
- Verification: LEAD
- Location: `src/components/HealthMonitor.tsx:65,207-249`; `src/app/api/health/route.ts:10-15`; `src/components/ObservabilityDashboard.tsx:9,111,180-181`
- Evidence:
  ```
  api/health/route.ts:11-12   return NextResponse.json({ status: 'alive' }, ...)
  HealthMonitor.tsx:65        const data = await internalGet<HealthData>('/api/health');
  HealthMonitor.tsx:207       {healthData.summary.total}
  HealthMonitor.tsx:249       {healthData.checks.map((check) => (
  ```
  Commit `daed8bf` shrank the route from 471 lines to 19.
- Problem: `summary`, `performance` and `checks` are undefined, so rendering throws a TypeError.
- Impact: Opening Health on `/admin/dashboard` always falls into the root error boundary. The failure is also reported twice (R-027), and the tab polls every 30 s.
- Fix:
  - Preferred: delete `HealthMonitor.tsx` and the `health` tab (`ObservabilityDashboard.tsx` L9, L111, L180-181).
  - Alternative: render only `status` from `/api/health/ready`.
- Fix risk: Admin UI only. Check the Overview and Analytics tabs. There are no tests (`grep -rln HealthMonitor tests` finds nothing).

### R-004: Client error reports with a stack over 2,000 characters are rejected (422) and lost
- Severity: Medium
- Category: Bug
- Status: CONFIRMED
- Verification: LEAD
- Location: `src/lib/errorReporting.ts:154`; `src/app/api/errors/route.ts:15,27,42`
- Evidence: `errorReporting.ts:154 stack: truncate(error.stack, 5000)` vs `errors/route.ts:15 stack: z.string().max(2_000).optional()` (strict schema, validated via `validateRequestBody`). The server keeps only 5 stack lines anyway (L48-50).
- Problem: The client and server limits disagree.
- Impact: Production browser errors with long minified or React stacks are silently dropped; the client only calls `console.warn`.
- Fix: On the client, send `truncate(error.stack?.split('\n').slice(0, 5).join('\n'), 2000)`.
- Fix risk: Minimal. Add a regression test that a 6,000-character stack produces a payload that passes `errorReportSchema`.

### R-005: Admin date search and stats compare `YYYY-MM-DD` strings to full ISO datetimes
- Severity: Medium
- Category: Bug
- Status: CONFIRMED
- Verification: LEAD (executed)
- Location: `src/lib/mappers/domainMappers.ts:43-44`; `src/lib/guestDataExport.ts:168-179,212-220`; caller `src/app/admin/guests/page.tsx:129`
- Evidence:
  ```
  domainMappers.ts:43   start_date: bookingDb.startDate.toISOString(),     // "2026-07-14T00:00:00.000Z"
  guestDataExport.ts:176 return bookingStart === startDate || bookingEnd === startDate || (bookingStart <= startDate && bookingEnd >= startDate);
  $ node -e (...)  -> 2026-07-14T00:00:00.000Z === 2026-07-14 false | b<=s false | e>=s true | single-date match: false
  ```
- Problem: A proper prefix sorts first in string comparison, so the `===` branches never match and a booking that starts on the searched day is excluded.
- Impact:
  - Single-date admin search misses bookings starting that day.
  - Range search misses bookings starting on `endDate`.
  - Stats count bookings starting today as `upcoming` instead of `active`/`checked_in`.
- Fix: Compare date-only values, e.g. map `start_date`/`end_date` with `.toISOString().slice(0, 10)`, or compare `Date`s. A better option comes with R-016: push the filter into Prisma.
- Fix risk: The admin guests page renders `start_date`, so check its formatting. Add a regression test: a booking starting on the search date is returned.

### R-006: `admin/guests` wraps every failure as `ApiError`; it is logged only at debug level and `error.message` is echoed to the client
- Severity: Medium
- Category: Error handling / Security
- Status: CONFIRMED
- Verification: AGENT
- Location: `src/app/api/admin/guests/route.ts:38,163-171`; `src/app/api/metrics/route.ts:402,498`; `src/lib/apiErrorHandler.ts:382-390,447`
- Evidence:
  ```
  admin/guests/route.ts:167  throw new ApiError(ApiErrorCode.INTERNAL_ERROR, ..., { originalError: error instanceof Error ? error.message : String(error) })
  apiErrorHandler.ts:387     logger.debug('API client error', {   // every ApiError, including 500s
  apiErrorHandler.ts:447     logger.error('Unexpected API error', {   // only non-ApiError
  logger-enterprise.ts:79    production level 'info'
  ```
  `ApiError.toJSON()` serializes `details` into the response (L90-98).
- Problem: DB and runtime failures on the main admin data endpoint are invisible in production logs, and internal error text (e.g. Prisma messages) reaches the client.
- Impact: Silent admin outages and internal-detail disclosure to authenticated admins.
- Fix: Remove the outer try/catch (L38, L163-172) so `withErrorHandler`'s unexpected-error path logs at error level. Drop the `error:` detail in `metrics` (moot if R-013 is applied).
- Fix risk: No tests cover these routes. The admin UI reads only `data.error?.message`.

### R-007: Legacy guest-auth routes `portal/start`, `portal/verify` and `portal/onsite/confirm` are still live; `verify` is a second sign-in path outside the nginx auth zone
- Severity: Medium
- Category: Legacy / Security
- Status: CONFIRMED
- Verification: LEAD
- Location: `src/app/api/portal/start/route.ts`, `src/app/api/portal/verify/route.ts:16-37`, `src/app/api/portal/onsite/confirm/route.ts`; `src/lib/openapi.ts:241-255`; `deploy/nginx/nginx.conf.template:45`
- Evidence:
  ```
  verify/route.ts:28   const forwarded = new NextRequest(request.url.replace('/verify', '/sessions'), {
  verify/route.ts:37   return createSession(forwarded, context);
  nginx.conf.template:45  ~^POST:/api/(?:admin/(?:login|refresh)|portal/(?:claim-exchange|claims|sessions|refresh))$ $binary_remote_addr;
  $ grep -rnF "/api/portal/<start|verify|onsite>" src public scripts deploy docker (excl. the routes and openapi) -> 0 each
  ```
  The UI calls only `/api/portal/claims` and `/api/portal/sessions` (`UnifiedGuestClient.tsx:97`). `onsite/confirm` always returns 410. `start` returns a static form schema.
- Problem: These are leftovers of the removed phone+surname/document flow. `verify` is a working proxy to sign-in that the nginx `auth_operations` limit does not cover. The app-level limiter still applies.
- Impact: Unsupported authentication surface, and a change to `sessions` implicitly changes `verify`.
- Fix: Delete the three route directories and their OpenAPI entries (`openapi.ts:241-255`).
- Fix risk: No tests reference them. `tests/routes/public-contracts.test.ts` only asserts that there are more than 20 paths and that `/health` is present.

### R-008: Dead booking-reference linking code (`linkOrCreateBooking`) is untrusted-reference auth, and nothing creates `Booking` rows
- Severity: Medium
- Category: Legacy / Unused
- Status: CONFIRMED
- Verification: LEAD
- Location: `src/lib/guestDataStore.ts:31-42,76-137`; `src/lib/prisma-repositories/bookingRepository.ts:25-54,75-85`
- Evidence:
  ```
  guestDataStore.ts:100  const claimed = await prisma.booking.updateMany({ ... data: { userId: params.user_id, accessStatus: 'VERIFIED', claimedAt: new Date() } })
  $ grep -rn "linkOrCreateBooking\|BookingAlreadyLinkedError\|findByProviderReference" src scripts tests deploy | grep -v 'guestDataStore.ts\|bookingRepository.ts'  -> (none)
  $ grep -rn "booking\.create\|booking\.upsert\|booking\.createMany" src scripts (excl. generated) -> bookingRepository.ts:33 only
  ```
  Commit `daed8bf` removed the last callers.
- Problem: This code links a user and sets `VERIFIED` from a provider reference without a claim grant, which is exactly the flow CLAUDE.md forbids restoring. It has no callers.
- Impact: Security-sensitive dead code that could be wired back in.
- Fix: Delete `BookingAlreadyLinkedError`, `linkOrCreateBooking`, `bookingRepository.create`, `findByProviderReference` and `generateId`, plus any type aliases left unused.
- Fix risk: No tests. Typecheck and knip.
- Open question: How are `Booking` rows created in production (manual SQL or Prisma Studio)?

### R-009: The legacy secret-only refresh-token fallback and `GUEST_REFRESH_ALLOW_LEGACY_SECRET_ONLY` are unreachable in production
- Severity: Medium
- Category: Legacy / Unused
- Status: CONFIRMED
- Verification: LEAD (env key); AGENT (call graph)
- Location: `src/lib/prisma-repositories/refreshTokenRepository.ts:115-128,272-340` (branch L308-335); `src/lib/runtime-env-schema.js:89`; `.env.example:46`; `scripts/install-systemd-services.sh:184`
- Evidence:
  ```
  refreshTokenRepository.ts:308  if (process.env.GUEST_REFRESH_ALLOW_LEGACY_SECRET_ONLY !== '1') {
  refreshTokenRepository.ts:313  const activeTokens = await database.refreshToken.findMany({ where: { revokedAt: null, ... } });
  ```
  `verify` is reached only via `guestStore.verifyRefreshToken`, which has 0 callers in src and scripts (5 in tests). `rotate` and `revokeFamilyForToken` reject id-less tokens.
- Problem: The legacy branch is dead in production. If enabled, it would scan every active token with an N+1 session lookup.
- Impact: Dead auth code and a misleading operator setting in 3 places.
- Fix: Delete L308-335 and the env key in all 3 places. `parseCompositeToken` should return `null` when there is no id.
  - Decision needed: `verify` is a test oracle at 13 integration call sites. Keep it as production test support, or move an equivalent DB probe into the test helpers (docs/testing.md forbids exported test-only helpers).
- Fix risk: Run the integration refresh suites (Docker).

### R-010: The development session-mint route `api/portal/dev-mint-session` is a dev auth bypass with no caller
- Severity: Medium
- Category: Legacy / Security
- Status: CONFIRMED (the owner confirmed there are no external callers)
- Verification: LEAD
- Location: `src/app/api/portal/dev-mint-session/route.ts:21-43`; `src/lib/runtime-env-schema.js:86-87,157-158`; `scripts/system-orchestrator.sh:563-568`; `scripts/install-systemd-services.sh:182-183`; `.env.example:42-43`; `tests/security/security-boundaries.test.ts:116-117`
- Evidence:
  ```
  route.ts:24  if (process.env.NODE_ENV === 'production'
  route.ts:25    || process.env.DEV_SESSION_MINT_ENABLED !== '1'
  route.ts:39  const token = await issueGuestSession(body.userId, body.bookingId);
  $ grep -rn "dev-mint-session\|DEV_SESSION_MINT" . (excl. vendored)  -> only the files listed above plus 01_*.md:269
  ```
- Problem: The route mints a guest session for any user/booking pair, protected only by env configuration, and it is compiled into every build. CLAUDE.md says "Never add … development auth bypasses".
- Impact: One misconfiguration on a non-production host turns it into a session-minting endpoint.
- Fix: Delete the route, the env keys (schema, `.env.example`, installer), the orchestrator checks and the `it.each` row in `security-boundaries.test.ts:114-118`.
- Fix risk: `.env.example` and `security-boundaries.test.ts` hold pinned secret-fixture positions (line 5, and lines 33/222). Removing lines above those positions shifts them, so update `EXPECTED_CURRENT_SECRET_FIXTURES` and the allowlist, or remove only lines below the pinned ones.

### R-011: `SecurityAuditEvent.ipHash` is derived three ways; `/api/errors` stores an unkeyed SHA-256 of the IP
- Severity: Medium
- Category: Security / Data integrity
- Status: CONFIRMED
- Verification: AGENT (also tracked as MED-PRIV-01 in `03_…PLAN.md:430-436`)
- Location: `src/app/api/errors/route.ts:60-62`; `src/lib/security-monitoring.ts:53-56`; `src/lib/portalAuthHttp.ts:19-24` → `portalAuthService.ts:225`
- Evidence:
  ```
  errors/route.ts:62        : crypto.createHash('sha256').update(clientIp).digest('hex'),
  security-monitoring.ts:55 ? privacyHmac(event.ip, 'security-event-ip:v1')
  portalAuthHttp.ts:19      const ipHint = privacyHmac(ip, 'portal-auth:ip-hint:v1');   // also returned as ipHash
  ```
- Problem: An unkeyed IPv4 hash can be reversed by enumerating 2^32 addresses. That conflicts with "never persist raw IPs". Three derivations in one column also cannot be correlated.
- Impact: Weak pseudonymization of client-error events and inconsistent audit data.
- Fix: Use `privacyHmac(ip, 'security-event-ip:v1')` in both the errors route and the claim audit write, and drop the duplicate `ipHash` field from `requestAuthContext`.
- Fix risk: Existing rows keep their old values; retention clears them after 90 days. Update tests that assert the hash.

### R-012: `docker:security-scan` runs an unpinned third-party image with the working tree mounted read-write
- Severity: Medium
- Category: Security / Dependencies
- Status: CONFIRMED
- Verification: AGENT
- Location: `package.json:74`
- Evidence:
  - `"docker:security-scan": "docker run --rm -v \"$PWD\":/app -w /app aquasec/trivy fs ."`
  - `git grep -F "docker:security-scan"` finds no other references.
  - Every other image in the repo is digest-pinned.
- Problem: It uses a mutable `latest` tag with read-write access to the repo and to local `.env*` secrets.
- Impact: If the upstream tag is compromised, the scanner can read secrets and write to the repo.
- Fix: Delete the script (`docker:scan` / `scripts/docker-scan.sh` covers image scanning), or pin a digest and mount `:ro`.
- Fix risk: None. The script is undocumented and not a gate or a pinned script.

### R-013: The in-memory observability stack (`metrics-collector`, `distributed-tracing`, `/api/metrics`) produces data nothing consumes
- Severity: Medium
- Category: Overengineering / Unused / Performance
- Status: CONFIRMED
- Verification: LEAD (reader search); AGENT (method-level usage)
- Location: `src/lib/metrics-collector.ts` (665 lines), `src/lib/distributed-tracing.ts` (366), `src/app/api/metrics/route.ts` (508), and the writers in `apiErrorHandler.ts:335-368`, `prisma.ts:65-110`, `portal/refresh`, `portal/logout`, `admin/flags`, `check-in/complete`
- Evidence:
  ```
  $ grep -rn "getMetrics\|getApplicationMetrics\|getAggregations" src scripts (excl. metrics-collector.ts)
  src/app/api/metrics/route.ts:302,304   (only reader; useTravelMetrics.getMetrics is unrelated)
  system-orchestrator.sh:1021-1025  code="$(curl -s -o /dev/null -w '%{http_code}' "$url" ...)"; case "$code" in 200|401|403) ... return 0   # discards body
  metrics-collector.ts:587-590  setInterval(() => { this.aggregateMetrics(); }, ...)   // aggregations read only by getAggregations (0 callers)
  distributed-tracing.ts: getSpan|getTrace|getRecentTraces|analyzeTrace|buildCriticalPath -> definitions only; no caller passes a parent context
  ```
  `/api/metrics` also has internal bugs (the tags filter is ignored; `requestCount` sums response times), which are moot if it is deleted.
- Problem: About 1,500 lines of per-process state with no consumer, against CLAUDE.md "Do not add … module-memory persistence as a production source of truth". Every metric sits next to a log line that carries the same information.
- Impact:
  - Up to 10k samples per metric name are kept in memory.
  - `splice` on 10k-element arrays runs on hot paths (twice per Prisma query).
  - A 60-second aggregation timer runs with no reader.
  - `check-in/complete` leaks unfinished spans for an hour.
- Fix (one task): delete both modules and `/api/metrics`. Remove the metric and tracer calls at the writers but keep the adjacent `logger.*` lines and the Prisma `query` event used by idle disconnect (`prisma.ts:156-159,286-288`). Remove `metrics_url`/`verify_metrics_endpoint` from the orchestrator (L962-965, L1001-1031, L1037). Remove `METRICS_WRITE_API_KEYS`/`VALID_API_KEYS` from the schema, `.env.example`, the installer and the orchestrator.
- Fix risk: No tests import these modules. The pinned `.env.example` fixture sits at line 5 and these keys are below it. Run typecheck, the full suite and `test:release-policy`.

### R-014: Orphan operational and admin API routes with their env plumbing
- Severity: Medium
- Category: Unused
- Status: CONFIRMED (the owner confirmed there are no external callers)
- Verification: LEAD (caller counts); AGENT (co-changes)
- Location:
  - `src/app/api/internal/booking-outbox/`
  - `internal/cache-metrics/`
  - `alerts/`
  - `alerts/webhook/`
  - `security/dashboard/`
  - `analytics/stats/`
  - `analytics/top/`
  - `analytics/export.csv/`
  - `vitals/export.csv/`
  - `vitals/route.ts:70-75` (GET)
  - `dev/alerts/verify-spike/`
  - `og/`
- Evidence:
  ```
  $ for p in <paths>; grep -rnF "$p" src public scripts deploy docker Makefile | grep -v "^src/app/api/" | grep -v openapi.ts | wc -l
  /api/internal/booking-outbox 0, /api/internal/cache-metrics 0, /api/alerts 0, /api/analytics/stats 0, /api/analytics/top 0,
  /api/analytics/export.csv 0, /api/vitals/export.csv 0, /api/security/dashboard 0, /api/og 1 (eslint-rule exemption string only)
  verify-spike -> referenced only by scripts/lib/release-policy.mjs:2326-2345 (file-existence policy) and its test fixture
  ```
  The outbox is drained by systemd through the library (`scripts/drain-outbox.ts:1`), not over HTTP. The admin analytics page reads the repository directly.
- Problem: About 900 lines of authenticated and public handlers that nothing calls. Some of them have secret-comparison edge cases: `booking-outbox` and `alerts/webhook` compare UTF-16 lengths before `timingSafeEqual` on UTF-8 buffers (SUSPECTED throw → 500).
- Impact: Attack and maintenance surface, plus env keys (`CRON_SECRET`, `INTERNAL_API_KEYS`) and OpenAPI entries kept alive for nothing.
- Fix: Delete the routes and methods. Then clean up:
  - Dead lib parts: `APIKeyAuthMiddleware` and the `requireAPIKey` option (`api-security-middleware.ts:61-147`), `guestDataCache.metrics()`, `getGuestDatasetSnapshots`, `lib/csv.ts` (and its unit test), and `verification_failed` handling in `metrics-collector`.
  - Env keys `CRON_SECRET` and `INTERNAL_API_KEYS`, in the schema, `.env.example`, the installer, the orchestrator and `security-boundaries.test.ts:178-179`.
  - Release-policy verify-spike checks (L2326-2328, L2338-2340, L2344) and their fixture (`release-policy.test.mjs:320-323`).
  - `alerts/webhook|` in the nginx map (L49).
  - The `/api/og` exemption in `scripts/eslint-rules/internal-fetch.js:11`.
  - The OpenAPI entries.
  - `CLAUDE.md`'s `requireAPIKey` line.
  - Keep `ALERT_WEBHOOK_TOKEN`; the outbound notifier uses it.
- Fix risk:
  - Must be split into several tasks: routes, then env keys, then lib.
  - Release-policy tests must change together with the verify-spike deletion.
  - With `/api/alerts` PUT gone, alert thresholds can only be changed in code (the upsert does not update thresholds, `operationalMonitor.ts:128-131`).

### R-015: The check-in completion flow (`/api/check-in`, `/complete`, `/complete/get`) has had no client since `2c4475c`
- Severity: Medium
- Category: Unused
- Status: CONFIRMED (the owner confirmed there are no external callers)
- Verification: LEAD (callers); AGENT (lib chain)
- Location:
  - `src/app/api/check-in/route.ts`
  - `src/app/api/check-in/complete/route.ts`
  - `src/app/api/check-in/complete/get/route.ts`
  - `src/lib/prisma-repositories/checkinRepository.ts`
  - `guestDataStore.ts:151-165,287-289`
  - `guestDatasetVersion.ts:45-51`
  - `prisma/schema.prisma:85-95` (`Checkin`)
  - `openapi.ts:256-258,267-272`
- Evidence:
  ```
  $ grep -rnE "['\"\`]/api/check-in['\"\`?]" src public scripts tests -> (none)
  $ grep -rnF "/api/check-in/complete" src public scripts deploy docker (excl. routes, openapi) -> 0
  ```
  The UI calls only `/api/check-in/preferences` and `/api/check-in/arrival-request` (`CheckInInfo.tsx:481,505,543,591`).
- Problem: The routes, the repository, the cache key, the erasure step, DSAR selects and admin stats all maintain a flow nobody calls.
- Impact: Maintenance cost, plus PII retained in an unused flow.
- Fix:
  - Step 1: delete the 3 routes and their OpenAPI entries.
  - Step 2: delete `upsertCheckinCompletion`, the repository write path and the `checkins` cache key. Keep the read used by the export until the model decision is made.
  - Step 3 (decision): drop the `checkins` table with a guarded forward migration that refuses non-empty data, following the pattern of `20260715110000_remove_unused_legacy_models`.
- Fix risk: The migration step needs `update:prisma-integrity`, `verify-post-migration.sql`, `EXPECTED_MIGRATION` (`health/ready/route.ts:8`) and the docs hashes. It could lose data, so it needs your approval.

### R-016: `guestDataExport` issues N+1 and duplicate queries and filters every booking in memory
- Severity: Medium
- Category: Performance / Overengineering
- Status: CONFIRMED
- Verification: AGENT
- Location: `src/lib/guestDataExport.ts:44-50,67-85,102-108,168-186`
- Evidence:
  ```
  46  bookings.map((booking) => this.getBookingDetails(booking.id))   // per booking: findBookingById + findUserById + getCheckinCompletionByBooking
  80  const bookings = (await this.getAllBookingsRaw()).filter((b) => b.user_id === userId);
  ```
- Problem: `action=list` runs 3N+2 queries, and search/byUser/phone load all bookings.
- Impact: Admin page load grows linearly with the number of bookings and can saturate the pg pool.
- Fix: Replace these paths with single Prisma queries (`include: { user, checkin }`, `where` filters). Then re-evaluate `guestDataCache` (R-051). Keep the response shape.
- Fix risk: The admin guests page contract. Add route tests first.

### R-017: `system-orchestrator.sh` re-implements the runtime env contract in bash (about 150 lines)
- Severity: Medium
- Category: Redundant
- Status: CONFIRMED
- Verification: AGENT
- Location: `scripts/system-orchestrator.sh:406-419,437-585`
- Evidence:
  ```
  446: if [[ -z "${SECURITY_PEPPER:-}" || ${#SECURITY_PEPPER} -lt 16 ]]; then
  492: for api_key_env in VALID_API_KEYS INTERNAL_API_KEYS METRICS_WRITE_API_KEYS; do
  ```
  The same rules are in `runtime-env-schema.js:57-176` (a strict superset). The authoritative zod check runs afterwards anyway (L723-750).
- Problem: A security-relevant contract is maintained twice, in two languages.
- Impact: Contract changes need two edits, and drift gives inconsistent accept/reject decisions.
- Fix: Delete L437-584 (keep the db-only branch L424-435), plus `is_valid_url`/`is_exact_origin` once they are unused.
- Fix risk: An invalid env is now reported after `ensure_dependencies`. Test `system:check` in both profiles with a deliberately bad env. Several R-010/R-013/R-014 env removals touch the same block, so sequence them first.

### R-018: The systemd web unit likely re-runs the full bootstrap on every (re)start and may hit EROFS on `prisma generate`
- Severity: Medium
- Category: Bug
- Status: SUSPECTED
- Verification: AGENT
- Location: `deploy/systemd/qr-city-guide.service:3-5,17,27-29`; `deploy/systemd/qr-city-guide-bootstrap.service:7`; `scripts/system-orchestrator.sh:1123-1139`
- Evidence:
  ```
  service:5    Requires=__SERVICE_NAME__-bootstrap.service
  service:27   ProtectSystem=strict       service:29 ReadWritePaths=-…/.runtime -…/.next/standalone/.next/cache/images
  bootstrap:7  Type=oneshot               (grep RemainAfterExit deploy/ scripts/ -> none)
  orchestrator:1135  run_prisma_generate   (unconditional in `up`), and the output dir src/generated/prisma is not writable
  ```
- Problem:
  - (a) `prisma generate` writes to a read-only path.
  - (b) A `oneshot` unit without `RemainAfterExit` is re-activated through `Requires=` on every restart.
  - (c) `KillMode=mixed` signals bash, not the node grandchild.
- Impact: The service fails, or rebuilds and migrates on every restart.
- Fix: Owner decision tied to R-081. Either delete the host path, or add `RemainAfterExit=yes`, skip generate when `--skip-build` is set, and `exec` node in foreground mode.
- To confirm: On a disposable systemd VM, start the unit twice and check the bootstrap journal for a re-run and the web journal for EROFS.

### R-019: About 135 unused i18n keys × 2 locales (about 90 of them from the removed portal verification flow)
- Severity: Medium
- Category: Unused / Legacy
- Status: CONFIRMED
- Verification: AGENT (two agents independently, the portal keys by three)
- Location: `src/i18n/domains/portal.ts` (type L12-121, en L140-256, el L257-373); `common.ts`; `house.ts`; `checkin.ts`
- Evidence:
  - `grep -rnE "\.portal\b" src (excl. i18n)` finds only `UnifiedGuestClient.tsx:18` (`getDictionary(locale).portal`), which makes 18 static accesses. There is no dynamic access (`grep "\?\.\[|\]\["` finds only `t.categories[...]`, `momentTags`, `ht.rooms`).
  - Unused keys include:
    - portal (89 of 107): `afmLabel`, `passportLabel`, `bookingRefLabel`, `lastNameLabel*`, `hints.*`, `validation.*`, and `errors.*` except `networkError`/`networkErrorDetail`
    - common: `details`, `itemSingular`, `itemPlural`, `search.where`, `search.addLocation`, `search.search`, `ui.mainMenu`, `ui.primaryPages`, `a11y.apartmentHero`, `datePicker.bookingSummary`, `map.failed`, `map.tokenMissing` (Mapbox era)
    - house: `navSubtitle`, `location`, `overview`, `amenities`, `rules`, `checkin`, `emergency`, `amenityList`, `rulesList`
    - checkin: 15 `CheckinDictionary` keys and 10 `checkinInfo` keys
  - Six type-only fields (`LocationPanelDictionary.location*`) have no values.
  - en/el key parity is identical.
- Problem: Translation strings for features that no longer exist.
- Impact: About 400 dead lines that translators maintain.
- Fix: Delete the keys from the interfaces and both locales, one domain per task. Keys read only by dead code (the FE-11 list) are deleted together with R-020/R-022.
- Fix risk: None at runtime; `tsc` flags any reader that was missed.

### R-020: The generic (non-phones/non-moments) category UI is unreachable; `TagFilters` and `FilterDrawer` are dead in production
- Severity: Medium
- Category: Unused
- Status: CONFIRMED
- Verification: AGENT
- Location: `src/components/CategoryGridClient.tsx:3-6,74-101,129-145,194-239,295-349`; `src/components/TagFilters.tsx`; `src/components/FilterDrawer.tsx`; `tests/components/accessibility-interactions.test.tsx:99-145`; CSS `13-compatibility-admin.css:72-106`, `05-primitives.css:123-129`
- Evidence:
  - `src/data/categories.ts:3-6` defines only `phones` and `moments`.
  - `[category]/page.tsx:41-42,93-94` pass `phonesLayout={isPhones} momentsLayout={isMoments}`.
  - `CategoryGridClient.tsx:223,235`: `{!(phonesLayout || momentsLayout) && (`
- Problem: For every reachable category one layout flag is true, so the filters, map, featured grids, paging and `?tags=` sync never render.
- Impact: About 370 dead lines plus tests, and the drawer duplicates the lightbox modal-isolation code.
- Fix: Delete `TagFilters`, `FilterDrawer`, the dead blocks and state, `ListingCardSkeleton`, the related CSS and the test block. Keep `ListingCard` (favorites uses it).
- Fix risk: Confirm no new categories are planned. Retest the phones and moments pages.

### R-021: JSON "warmup" of `/api/categories` (client and service worker) feeds nothing; the category JSON API has no rendering consumer
- Severity: Medium
- Category: Legacy / Performance
- Status: CONFIRMED
- Verification: AGENT (two agents)
- Location: `src/components/DataWarmup.tsx` (rendered at `src/app/layout.tsx:55`); `public/sw.js:366-433,512-519,611-628`; `src/components/JsonFetchHud.tsx` (`[locale]/layout.tsx:46`); `src/app/api/categories/**`
- Evidence: `grep -rn "api/categories" src public (excl. routes)` finds only `DataWarmup.tsx:41,47,103,110` and `sw.js:388,397,426`. Pages render from `lib/data.ts` (`fs.readFileSync`).
- Problem: Every first visit fetches up to 1 + 3 lists plus 10 details per category, and the service worker repeats this on activate, for data no page reads.
- Impact: Wasted requests and bandwidth, including on admin pages.
- Fix: Delete `DataWarmup`, `JsonFetchHud`, `prewarmData`/`broadcastJsonMetric` in `sw.js`, then (owner decision) the 3 category routes and their OpenAPI entries.
- Fix risk: `tests/routes/public-contracts.test.ts:40-50` and `tests/integration/security/layered-rate-limiting.test.ts:63-78` use categories as the sample public route; switch them to `health/live`. Test offline navigation manually.

### R-022: `LeafletMap` and `InteractiveMap` carry about 150 lines of never-enabled features (routing, mode toggle, origin marker, many props)
- Severity: Medium
- Category: Unused / Overengineering
- Status: CONFIRMED; the persisted-view sub-point is SUSPECTED
- Verification: AGENT
- Location: `src/components/LeafletMap.tsx:78-110,150-183,214-226,423-449,481-535,570-608`; `src/components/InteractiveMap.tsx:20-41,110-140`; `src/lib/osrmClient.ts:146-165`
- Evidence: Single caller chain `ApartmentLocationMap` → `InteractiveMap` → `LeafletMap`. `InteractiveMap.tsx:145-159` passes only 13 props. `enableRouting = false` and `enableTravelModeToggle = false` are never overridden, and there is `showOriginMarker={false}`. `grep "onMarkerClick\|center=\|includeLandmarks"` finds no callers.
- Problem: The heaviest client chunk carries dead features, and `OSRMClient.getRoute` is used only by the dead routing.
- Impact: Bundle size and maintenance.
- Fix: Remove the dead props, branches and `getRoute`, and the map i18n keys they alone read.
- Fix risk: Manually check the moments, check-in and book maps. There are no tests.
- To confirm (persisted view): whether `refitOnMarkerChange` overrides the saved localStorage view on mount.

### R-023: Contact details and house facts are duplicated in 4–5 places and already contradict each other on `/check-in`
- Severity: Medium
- Category: Redundant
- Status: CONFIRMED that the values differ; the owner decides which are correct
- Verification: AGENT
- Location: `src/data/mapLocations.ts:244-254`; `src/components/ContactSection.tsx:74-115`; `src/components/CheckInInfo.tsx:366-449`; `src/i18n/domains/{booking,portal,checkin,house}.ts`; `src/app/error.tsx:201`; `src/data/apartmentData.ts`
- Evidence (the conflicting copies):
  - Quiet hours: "23:00 - 08:00" (`checkin.ts:146`) vs "after 22:00" (`house.ts:107`, `apartmentData.ts:109`).
  - Beach: "5 minutes walk" (`checkin.ts:160`) vs "5' drive" (`house.ts:234`) vs "3km, 5 min drive" (`apartmentData.ts:89`).
  - Supermarket: "AB 300m" vs "100m" vs the "Sklavenitis" landmark.
  - Four different amenity lists.
  - Commit `b4f9a63 fix(content): align stale contact details` shows this drift has already happened once.
- Problem: No single source of truth, and several copies are unused (`house.rulesList`/`amenityList`, `apartmentData.distances`/`houseRules`/`specs`/`coordinates`, the dead contact fallbacks).
- Impact: Guests see contradictory information on the same page, and every contact change needs about 5 edits.
- Fix: First delete the unused copies (a mechanical task). Then pick one source per fact, which needs your content decision.
- Fix risk: Content review. `data-map-navigation.test.ts:73-74` reads only `shortName`/`description`.

### R-024: The item detail page duplicates `MomentsDetailLayout` for the phones branch
- Severity: Medium
- Category: Redundant
- Status: CONFIRMED
- Verification: AGENT
- Location: `src/app/[locale]/[category]/[slug]/page.tsx:66-180`; `src/components/moments/MomentsDetailLayout.tsx:66-157`; `src/config/momentsLayoutConfig.ts:26-37`
- Evidence: Same structure and identical class strings (header, Suspense/ResponsiveImage, 4 CTAs, share/favorite, description, tags, JSON-LD). Only the JSON-LD fields and the image size differ.
- Problem: Two copies of one layout that have already drifted.
- Impact: UI fixes have to be made twice.
- Fix: Render `MomentsDetailLayout` for both categories and pass the extra JSON-LD fields as props.
- Fix risk: Visual check of the phones detail pages. This is a refactor, so it needs approval.

### R-025: Optional `Dictionary` domain types force about 180 literal fallbacks that duplicate complete translations
- Severity: Medium
- Category: Maintainability
- Status: CONFIRMED
- Verification: AGENT
- Location: `src/i18n/dictionaries.ts:41-51`; `CheckInInfo.tsx:321-445`; `ApartmentCinematic.tsx:8-117`; `LeafletMap.tsx:55-76`; `InteractiveMap.tsx:45-66`; `MomentCard.tsx:44-73`; `ApartmentGalleryLightbox.tsx:21-116`
- Evidence:
  - `Dictionary = CommonDictionary & { house?: …; about?: … }`, while `mergeDictionary` always sets every domain.
  - The fallback count is 181 (`grep … "(\|\||\?\?) *['\"\`]" | wc -l`).
  - There are 66 inline `isGreek ?` ternaries.
- Problem: The fallbacks never run, because en/el parity is complete. Text lives in 2–3 places, and a removed key silently shows English to Greek users.
- Impact: Maintenance cost and hidden localization regressions.
- Fix: Make the domain fields required, delete the fallbacks, `tagLabels` and `DEFAULT_MAP_LABELS`, and move the inline strings into the dictionaries.
- Fix risk: A typing change across about 20 files. This is a refactor that needs approval. Do it after R-019.

### R-026: Components defined inside render remount their subtree on every render (`DateRangePicker`, `StaticLocationMap`)
- Severity: Medium
- Category: Bug / Performance
- Status: CONFIRMED that a remount happens (React component identity); the user-visible focus loss is SUSPECTED
- Execution (T23): CONFIRMED by `tests/components/date-range-picker.test.tsx`: the calendar grid detached on selection before the fix.
- Verification: AGENT
- Location: `src/components/DateRangePicker.tsx:212,304`; `src/components/StaticLocationMap.tsx:54,110,125`
- Evidence: `DateRangePicker.tsx:212 const DatePickerContent = () => (` … `:304 <DatePickerContent />`
- Problem: A new component type is created on every render, so `<DayPicker>` remounts on each selection and month change.
- Impact: Expected loss of keyboard focus and internal picker state (accessibility) on the booking date picker.
- Fix: Inline the JSX as an element variable, or hoist it to a module-level component.
- Fix risk: Low.
- To confirm (focus loss): keyboard-navigate the calendar and select a date.

---

## Low

(Compact format. Each item still gives location, evidence, problem/impact, fix and status.)

### R-027: Root `error.tsx` reports each error twice
- Severity: Low · Category: Redundant/Bug · Status: CONFIRMED · Verification: AGENT (two agents)
- Location: `src/app/error.tsx:4,48-49,68,82-86`; `src/lib/errorBoundary.tsx:14-34`
- Evidence: `reportError(error, {...})` (L68) and `boundaryReportError(...)` → `errorReporter.reportError` (`errorBoundary.tsx:19`). `errorBoundary.tsx` is imported only by `error.tsx`.
- Impact: Two POSTs and two audit rows per error; uses 2 of the 10/min rate-limit budget.
- Fix: Delete `errorBoundary.tsx` and its use. Call `errorReporter.reportError` once in an effect with `[error]`.
- Risk: Verify one POST is sent per error.

### R-028: The `errorReporting.ts` API is mostly dead: breadcrumbs are never sent, metadata and category are discarded, and a `react-error` listener nothing dispatches
- Severity: Low · Category: Unused · Status: CONFIRMED · Verification: AGENT
- Location: `src/lib/errorReporting.ts:8-14,37-101,107,121,203-276`
- Evidence: `L121 void metadata;`. The `report` object at L150-162 has no breadcrumbs. `rg -w "reportAPIError|reportUserAction|…|setEnabled"` finds nothing outside the file. `NEXT_PUBLIC_BUILD_VERSION` is set nowhere.
- Fix: Keep `reportError`, the listeners and the `extract*` helpers; pass `category` through options; use `event.filename/lineno`; delete the rest.
- Risk: Must stay within the strict `errorReportSchema`.

### R-029: The proxy's tracing and metrics are no-ops or have no reader; the "-lite" modules assume an Edge runtime that Next 16's proxy no longer uses
- Severity: Low · Category: Legacy/Unused · Status: CONFIRMED · Verification: LEAD (no-op, importers); AGENT (docs)
- Location: `src/proxy.ts:5-6,28-192`; `src/lib/metrics-lite.ts`; `src/lib/distributed-tracing-lite.ts`; `src/lib/observability-contracts.ts`
- Evidence: `metrics-lite.ts:12-17 counter: () => noop(), …`. `grep -rln "metrics-lite\|distributed-tracing-lite" src tests` finds only `src/proxy.ts`. No reader of the `traceparent`/`x-trace-id` response headers exists. Next docs `proxy.md:223`: "Proxy defaults to using the Node.js runtime".
- Fix: Remove the tracing and metrics lines from the proxy; delete the 3 modules (after R-013), `SpanStatus.TIMEOUT/CANCELLED` (knip), the trace-context unit tests (`core-utilities.test.ts:90-115`) and the coverage include (`vitest.config.ts:51`).
- Risk: Clients lose the trace headers; nothing reads them.

### R-030: The in-memory `SecurityMonitor` keeps counters nothing reads and raises console-only alerts that duplicate a DB rule
- Severity: Low · Category: Overengineering · Status: CONFIRMED · Verification: AGENT
- Location: `src/lib/security-monitoring.ts:16-24,90-125,140-223`; `src/lib/security-config.ts:320-343`
- Evidence: `L221 console.error('🚨 Security Alert:', alert); // only sink`. `this.metrics` has no getter. `operationalMonitor.ts:44-58` already has a DB rule on `security.high.count`.
- Fix: Reduce the module to sanitize/persist/record/CSP functions, import it statically (removes the dynamic-import cycle workaround), and delete `logSecurityEvent`.
- Risk: Events must still persist; test the CSP report and a CORS violation.

### R-031: `security-middleware-edge.ts` has dead options, a header cache that never activates, and an unused `X-Nonce` response header
- Severity: Low · Category: Unused · Status: CONFIRMED · Verification: AGENT
- Location: `src/lib/security-middleware-edge.ts:18-20,37-43,74-97,124-149,259`; `src/proxy.ts:22-25,80`
- Evidence: The only caller passes `enableNonce: true`, and the cache is gated on `!nonce` (L95). The matcher `/((?!_next|.*\\..*).*)` makes `skipPaths` and `startsWith("/_next")` unreachable. `customHeaders` has no users.
- Fix: Remove the cache, `customHeaders`, `skipPaths`, the `enableNonce` option, the response `X-Nonce` and the proxy `/_next` check. Rename the file (it is not Edge).
- Risk: None; the branches don't run today.

### R-032: `security-config.ts` over-engineering: runtime Zod validation of constants, always-true flags, an unreachable `Math.random` nonce fallback, unused event types
- Severity: Low · Category: Overengineering · Status: CONFIRMED · Verification: AGENT
- Location: `src/lib/security-config.ts:9-83,225-238,260-268,311,315,320-343`
- Evidence:
  - `L231 SecurityConfigSchema.safeParse(config)` runs on every call.
  - The `enabled` flags are true in both environments.
  - `L265-267` is a fallback for environments without `crypto.randomUUID`, but Node is ≥22.19.
  - The `sql_injection_attempt`/`xss_attempt` event types are never emitted.
- Fix: Replace the schema with a TS type; remove the constant flags and checks, the fallback, the window check and the unused union members.
- Risk: The file is in the coverage include list; the `api-boundaries` tests cover it.

### R-033: `logger-enterprise.ts` has unused methods, captures a stack on every call, has a broken source filter, and uses the experimental `enterWith`
- Severity: Low · Category: Unused/Performance/Legacy · Status: CONFIRMED · Verification: AGENT
- Location: `src/lib/logger-enterprise.ts:13-22,106-120,213-240,274-296,330-332,380-438`
- Evidence:
  - `L288 source: this.getSourceInfo()` (a `new Error().stack`) is computed before `L296 if (!this.shouldLog(...)) return;`.
  - `L222 !line.includes('logger.ts')` never matches the file name.
  - `withContext`, `child`, `fatal`, `trace` and `time` have no callers.
  - `@types/node` 22.20.1 `async_hooks.d.ts:514,532` marks `enterWith` experimental.
- Fix: Check the level first; delete `getSourceInfo` and the unused methods and fields.
- Risk: One integration test imports the real logger; keep `getContext`.

### R-034: The proxy matcher skips every path containing a dot, so the `/api/*.csv` routes get no security headers or CORS check
- Severity: Low · Category: Security · Status: CONFIRMED (reading) · Verification: AGENT
- Location: `src/proxy.ts:199-201`
- Evidence: `matcher: ["/((?!_next|.*\\..*).*)"]`. `rg add_header deploy/nginx` finds nothing.
- Fix: Moot if R-014 deletes the CSV routes. Otherwise add `'/api/:path*'` to the matcher.

### R-035: `logger-client` serializes an `Error` nested in metadata as `{}`
- Severity: Low · Category: Bug · Status: CONFIRMED · Verification: AGENT
- Location: `src/lib/internalFetchClient.ts:104-107`; `src/lib/logger-client.ts:35-37`
- Evidence: `logger.error('internalFetch failed', { input, error: err instanceof Error ? err : String(err) })`. The message and stack of an Error are non-enumerable.
- Fix: Pass `err.message`, or normalize nested Errors in `logger-client`. Combine with the R-002 hardening.

### R-036: `internalFetchClient` sends a correlation header the server never reads; there are two client fetch wrappers
- Severity: Low · Category: Unused/Redundant · Status: CONFIRMED · Verification: AGENT
- Location: `src/lib/internalFetchClient.ts:5-54,70-76`; `src/lib/internalFetch.ts`
- Evidence: `L50 headers.set('X-Parent-Correlation-ID', …)`; `rg -i parent-correlation` finds only that line. The server always generates a fresh ID (`apiErrorHandler.ts:246`). `internalFetch.ts` has 3 callers and `internalFetchClient.ts` has 12. `internalPost` spreads `...init` last, so it can drop `Content-Type`.
- Fix: Delete the correlation helpers, move `internalGet`/`internalPost` onto the default wrapper, and update the 3 imports, `core-utilities.test.ts:7` and `vitest.config.ts:47`.

### R-037: Dead keys in `config.ts`, and a duplicate `ANALYTICS_RETENTION_DAYS` parse
- Severity: Low · Category: Unused · Status: CONFIRMED · Verification: AGENT
- Location: `src/lib/config.ts:3-23`; `src/lib/operationalMonitor.ts:194`
- Evidence: `rg "config\.(nodeEnv|isProd|absoluteSiteUrl|analytics)"` finds only `absoluteSiteUrl`, used in `site.ts:2` and a test.
- Fix: Reduce the file to `absoluteSiteUrl`, or inline it into `site.ts`.

### R-038: The `Metric` and `Log` models have no writers; only retention deletes from them
- Severity: Low · Category: Unused (schema) · Status: CONFIRMED · Verification: LEAD
- Location: `prisma/schema.prisma:392-414`; `src/lib/operationalMonitor.ts:209-210`
- Evidence: `grep -rnE "prisma\.(metric|log)\b|tx\.(metric|log)\b" src scripts tests` (excluding generated) finds only `operationalMonitor.ts:209-210` (`deleteMany`).
- Fix: Drop the two `deleteMany` calls, then add a guarded forward migration that refuses non-empty tables and drops them.
- Risk: Migration plus the integrity manifest, `EXPECTED_MIGRATION` and docs hashes. **Approval needed** (destructive).
- To confirm: A read-only production row count (needs your approval).

### R-039: Indexes that duplicate a primary key, a unique constraint or another index's prefix
- Severity: Low · Category: Redundant (schema) · Status: CONFIRMED · Verification: AGENT
- Location: `schema.prisma:92` (`idx_checkins_booking` = PK), `:30` (`idx_users_phone_country`; `phone_e164` is already unique), `:59` vs `:61`, `:246` vs `:252`, `:248` vs `:251`
- Fix: One forward migration with `DROP INDEX`, plus the schema, integrity and docs updates.
- Risk: Write-path only. **Approval needed.**

### R-040: Indexes with no matching query predicate
- Severity: Low · Category: Unused (schema) · Status: SUSPECTED · Verification: AGENT
- Location: `schema.prisma:27,31` (the latter indexes a password hash), `:60,62,64,81,184,206-207,224,249,250,388`
- Evidence: A grep of every `find*`/`count`/`*Many` and raw SQL found no predicates on these columns. `idx_rate_limits_count` blocks HOT updates on every rate-limit hit.
- To confirm: A read-only `pg_stat_user_indexes` query on production (needs your approval and access).

### R-041: `outbox_events.stay_request_id` lost its index in a migration and never got it back
- Severity: Low · Category: Performance (schema) · Status: CONFIRMED · Verification: AGENT
- Location: `prisma/migrations/20260714150000_trustworthy_portal_and_operations/migration.sql:177`; `schema.prisma:182-185`
- Evidence: `DROP INDEX "idx_webhook_outbox_stay_request"`. Queries filter on the column at `privacyService.ts:103,139` and `admin/stay-requests/[id]/route.ts:27`.
- Fix: `CREATE INDEX idx_outbox_events_stay_request ON outbox_events(stay_request_id)` in a forward migration.

### R-042: `User.email` is never written by live code; `CheckInRequest` guest fields are never filled or only copy linked PII
- Severity: Low · Category: Legacy / Data integrity · Status: SUSPECTED (email: legacy rows may hold data); CONFIRMED (guestName never passed) · Verification: AGENT
- Location: `schema.prisma:12,31,101-103`; `src/app/api/check-in/arrival-request/route.ts:77-83`
- Evidence: The only live User writes are `portalAuthService.ts:156,164`, and neither sets `email`. The arrival request passes `guestEmail: user?.email` (always null for new users) and `guestPhone`.
- Fix: Stop copying the fields and read through the relation. Drop the columns later with a migration.
- To confirm: `SELECT count(*) FROM users WHERE email IS NOT NULL` (read-only, needs approval). The webhook payload shape changes, so check the consumer.

### R-043: `OutboxEvent.aggregateType`/`aggregateId` are written but never read
- Severity: Low · Category: Redundant (schema) · Status: SUSPECTED (operators may query them) · Verification: AGENT
- Location: `schema.prisma:163-165,184`; `booking-requests/route.ts:124-127`; `checkInRequestRepository.ts:90-91,206-207`
- To confirm: Ask whether operators use them as an audit link (they survive the FK's `SET NULL`).

### R-044: Refresh device and IP context is stored twice under three names
- Severity: Low · Category: Redundant · Status: CONFIRMED · Verification: AGENT
- Location: `refreshTokenRepository.ts:246-259,414-416,535-536`; `schema.prisma:217-218,239-240`
- Evidence: The same value goes into `family.deviceHash` and `token.deviceHint`. Only `family.deviceHash` is checked.
- Fix: Stop writing the token-level columns and pick one name. The DSAR export selects them (`dsar/export/route.ts:73`).

### R-045: `AdminSession` has no retention
- Severity: Low · Category: Data integrity · Status: CONFIRMED · Verification: AGENT
- Location: `src/lib/operationalMonitor.ts:191-211`
- Evidence: `grep -rn "adminSession\.\(deleteMany\|findMany\|count\)" src scripts` finds nothing.
- Fix: Add a retention entry with a window longer than the grant retention (`BookingClaimGrant.issuedByAdminSessionId` is `SetNull`).

### R-046: Unused guestStore and repository methods: user writes, `revoke*`, `purgeExpired*`, and a duplicated `findEligibleForUser`
- Severity: Low · Category: Unused/Redundant · Status: CONFIRMED · Verification: LEAD (createUser, updateUserPassword, findEligibleBookingForUser); AGENT (rest)
- Location: `guestDataStore.ts:46-73,147-149,210-217,274-276`; `userRepository.ts:17-36,58-72`; `refreshTokenRepository.ts:342-368,704-719`; `bookingRepository.ts:97-119`
- Evidence: `createUser src/scripts: 0 tests: 0`; `updateUserPassword 0/0`; `findEligibleBookingForUser 0/1` (the one is a consistency test). `purgeExpired(30)` duplicates `operationalMonitor.ts:198`.
- Fix: Delete them, and drop the one consistency assertion in `portal-eligibility-consistency.test.ts:452`.

### R-047: The raw `token` input on `consumeBookingClaimGrant` is a leftover shim
- Severity: Low · Category: Legacy · Status: CONFIRMED · Verification: AGENT
- Location: `src/lib/portalAuthService.ts:113-131`
- Evidence: The production caller passes `tokenDigest` (`portal/claims/route.ts:52-59`); only an integration test passes `token`.
- Fix: Make `tokenDigest` required; have the test pre-digest the token.

### R-048: `GetClientIpOptions` is an ignored compatibility parameter
- Severity: Low · Category: Legacy · Status: CONFIRMED · Verification: AGENT
- Location: `src/lib/net/getClientIp.ts:9-17,70-71`; `security-middleware-edge.ts:176`; `tests/security/security-boundaries.test.ts:232-238`
- Evidence: `L10 * Retained only as a source-compatibility type …`, `L71 void _options;`
- Fix: Remove the interface, the parameter and the options argument.

### R-049: Exports kept only for tests (`knip --production`)
- Severity: Low · Category: Unused/Tests · Status: CONFIRMED · Verification: LEAD (knip); AGENT (per-item)
- Location and fix:
  - `guestSession.ts:170-172` `revokeGuestSession`: dead in production (logout uses `revokeGuestSessionById`). Delete it and update 2 tests.
  - `apiErrorHandler.ts:588-610` `sanitizeRequestHeaders`: used internally, but duplicates `redaction.isSensitiveFieldName` with a different header list (`user-agent` vs `x-api-key`/`forwarded`). Merge into one helper in `redaction.ts`. `header-redaction.test.ts` expectations change.
  - `net/clientIdentity.ts:60`: a re-export of `canonicalizeClientIp` for tests only. Delete it; the test imports from `getClientIp`.
  - `CLIENT_IDENTITY_UNAVAILABLE`, `PORTAL_CLAIM_EXCHANGE_COOKIE`: un-export them.
  - `createRefreshTokenRepository`: a DI seam used by the concurrency integration tests. **Decision:** keep it as a documented exception to "no exported test-only helpers"?
  - `observability-contracts.ts` `SpanStatus.TIMEOUT/CANCELLED`: see R-029.

### R-050: The snake_case mapper and facade layer only adds indirection
- Severity: Low · Category: Overengineering · Status: CONFIRMED · Verification: AGENT
- Location: `src/lib/mappers/domainMappers.ts:14-111`; `*Record` types in the repositories; `guestDataStore.ts`
- Evidence: Prisma camelCase → snake_case → camelCase again (`guestDataExport.ts:110-135`). `UserRecord.password_hash` is never read.
- Fix: A larger refactor, planned as its own task after R-008/R-046/R-016 have shrunk the facade. **Approval needed.**

### R-051: `guestDataCache` has an unused config seam and keeps erased check-in text in memory
- Severity: Low · Category: Unused/Data integrity · Status: CONFIRMED · Verification: AGENT
- Location: `guestDataCache.ts:27,129-137`; `guestDatasetVersion.ts:45-51`; `privacyService.ts:155-158`
- Evidence: `GuestDataCacheConfig` is referenced only at its definition. The `checkins` version key (`count:max(acceptedAt)`) does not change when erasure nulls `specialRequests`.
- Fix: Remove the config parameter and replace `getAllCheckins` with a count. Reconsider the cache after R-016.

### R-052: The booking eligibility predicate is written out in several places
- Severity: Low · Category: Redundant · Status: CONFIRMED · Verification: AGENT
- Location: `refreshTokenRepository.ts:197-206`; `guestSession.ts:156-159`; `portalAuthService.ts:266-276`
- Fix: Export one `isPortalBookingEligible` from `portalBookingEligibility.ts` and reuse it.

### R-053: Peppered hashing is implemented three ways; `claimTokenPepper` falls back to `SECURITY_PEPPER` despite "CLAIM_TOKEN_PEPPER is required"
- Severity: Low · Category: Redundant/Security · Status: CONFIRMED · Verification: AGENT
- Location: `src/lib/crypto.ts:36-69`; `src/lib/privacyHash.ts:3-11`; `src/lib/portalAuthService.ts:30-36`
- Fix: One shared pepper resolver, and drop the `SECURITY_PEPPER` fallback (production already requires `CLAIM_TOKEN_PEPPER`, `runtime-env-schema.js:154-155`).
- Risk: Changing the `hashSensitive` construction invalidates live refresh tokens, so defer that part.

### R-054: Guest cookie names and options are duplicated; logout hand-builds `Set-Cookie`
- Severity: Low · Category: Maintainability · Status: CONFIRMED · Verification: AGENT (two agents)
- Location: `guestSession.ts:26-27,102,180-235`; `portal/logout/route.ts:21-24`; literal `'guest_session'`/`'guest_rt'` in 8 files
- Evidence: `L189 maxAge: 60 * 60 * 2` duplicates `GUEST_SESSION_TTL_SECONDS`. `logout L22 headers.append('Set-Cookie', \`guest_session=; Path=/; …\`)`.
- Fix: Export the name constants, derive `maxAge`, and use `clearSessionCookie()`/`clearRefreshCookie()` in logout.
- Risk: Re-run `logout-characterization` (integration).

### R-055: `admin/guests?action=requests` duplicates `/api/admin/check-in-requests`, and `getAll` silently caps at 100
- Severity: Low · Category: Redundant · Status: CONFIRMED · Verification: AGENT (two agents)
- Location: `admin/guests/route.ts:116-133`; `checkInRequestRepository.ts:170,263-265`; `admin/guests/page.tsx:104`
- Fix: Point the page at `/api/admin/check-in-requests?status=all`, and delete the case and `getAll`.

### R-056: `admin/guests` has a dead `findById` action and a JSON round-trip in export; `exportBookingToFile` writes no file
- Severity: Low · Category: Unused/Legacy · Status: CONFIRMED · Verification: AGENT (two agents)
- Location: `admin/guests/route.ts:63-77,142-160`; `guestDataExport.ts:1-4,143-163`
- Fix: Delete `findById`; return the object directly, rename the method, and remove the commented `fs.writeFileSync`.

### R-057: `redactSensitiveText` does not redact claim tokens
- Severity: Low · Category: Security · Status: CONFIRMED (the gap); impact SUSPECTED · Verification: LEAD (executed)
- Location: `src/lib/redaction.ts:45-50,53`
- Evidence: `redactSensitiveText("token=claim_A1b2…xyz")` returns the string unchanged (tsx run). `looksLikeLongToken` requires a `.`, and claim tokens have the form `claim_<base64url>` (`portalAuthService.ts:56`).
- Fix: Add a `claim_[A-Za-z0-9_-]{32,}` pattern, plus a unit test.
- To confirm (impact): any path where a raw claim token can reach logged text (they were removed from URLs in `b1a82d5`).

### R-058: The DSAR and privacy routes have no UI caller
- Severity: Low (the compliance aspect is for the owner) · Category: Unused · Status: CONFIRMED (no caller) · Verification: LEAD
- Location: `src/app/api/dsar/export/`, `dsar/requests/`, `admin/privacy-requests/`
- Evidence: caller count 0 for `/api/dsar` and `/api/admin/privacy-requests`.
- **Decision:**
  - (a) add guest/admin UI entry points, or
  - (b) delete the routes, `requireSubjectOrAdmin` and the related `privacyService` functions, and adjust `client-identity-route-regression.test.ts:92,315-330`.

### R-059: `/api/docs` and `/api/docs/openapi` publish the full route map publicly
- Severity: Low · Category: Security (information exposure) · Status: SUSPECTED (owner intent) · Verification: AGENT
- Location: `src/app/api/docs/route.ts`, `docs/openapi/route.ts`; `README.md:60`
- To confirm: Is `/api/docs` used? If not, delete it (and `public-contracts.test.ts:31-38`) or put it behind the admin session.

### R-060: The analytics allowlist accepts 3 events nothing emits; the matching tracker helpers are dead
- Severity: Low · Category: Unused · Status: CONFIRMED · Verification: AGENT (two agents)
- Location: `src/app/api/analytics/route.ts:21-26,79-91`; `src/lib/tracker.ts`; `openapi.ts:80-81`
- Evidence: `origin_selected`, `no_booking_cta_clicked` and `checkin_completed` are used only in their definitions. `track()` duplicates `sanitize()`'s switch.
- Fix: Remove the 3 names from both places, and implement `track` via `sanitize`.

### R-061: The portal refresh route ignores `failure`; its `?next=` 302 makes the client server-render the check-in page twice
- Severity: Low · Category: Unused / Performance · Status: CONFIRMED (failurePath); SUSPECTED (double render) · Verification: AGENT
- Location: `src/app/api/portal/refresh/route.ts:33-43,121-147`; `[locale]/portal/refresh/page.tsx:23`; `src/lib/portalRefreshClient.ts:73-95`
- Fix: Remove the `failurePath` branch and the `&failure=` parameter. Drop the redirect branch, since the client already uses `safeNextHref`.
- To confirm (double render): check the server logs for two `/en/check-in` renders per refresh.

### R-062: The `admin/analytics` page re-implements `requireAdminPageSession`
- Severity: Low · Category: Redundant · Status: CONFIRMED · Verification: AGENT
- Location: `src/app/admin/analytics/page.tsx:3-5,15-22`
- Fix: `await requireAdminPageSession();`

### R-063: Legacy aliases: the `guest/sign-in` and `guest/sign-up` redirect pages and the proxy `/house` → `/apartment` redirect
- Severity: Low · Category: Legacy · Status: SUSPECTED (old links may exist in messages sent to guests) · Verification: AGENT
- Location: `src/app/[locale]/guest/sign-in/page.tsx`, `sign-up/page.tsx`; `src/proxy.ts:130-153`
- To confirm: nginx access logs for hits on these paths. Delete them once traffic is zero.

### R-064: `csp-report`, `analytics` and `vitals` hand-copy error and rate-limit wiring outside `withErrorHandler`; `csp-report` turns server failures into a silent 400
- Severity: Low · Category: Redundant/Error handling · Status: CONFIRMED · Verification: AGENT
- Location: `analytics/route.ts:145-181`; `vitals/route.ts:32-58`; `security/csp-report/route.ts:59-79`
- Evidence: `csp-report.ts:66 return NextResponse.json({ error: 'Invalid CSP report' }, { status: 400 }); // any non-ApiError`. The `OPTIONS` handler (L70-79) is unreachable: the proxy CORS middleware answers `/api/*` preflights.
- Fix: Wrap the handlers in `withErrorHandler` (keep the 204/201 bodies), and delete the unreachable `OPTIONS`.

### R-065: `dotenv` is a runtime dependency, but only tooling imports it
- Severity: Low · Category: Dependencies · Status: CONFIRMED · Verification: AGENT
- Location: `package.json:105`
- Evidence: `git grep dotenv` finds `prisma.config.ts` and `tests/integration/support/database-lifecycle.ts`, and no `src/`.
- Fix: Move it to `devDependencies`.

### R-066: Overrides have no documented rationale; the `@sentry/node` override jumps lighthouse's `^9` range to `^10`
- Severity: Low · Category: Dependencies · Status: CONFIRMED · Verification: AGENT
- Location: `package.json:155-162`
- Fix: Document each override's reason (advisory id) next to the release docs, and re-check both on the next lighthouse or prisma bump.

### R-067: `next.config.ts` `images.remotePatterns` is unused and widens the image optimizer's fetch set
- Severity: Low · Category: Unused/Security · Status: CONFIRMED · Verification: LEAD
- Location: `next.config.ts:12-20`
- Evidence: For all 5 hosts, there are 0 image-field references in `src`/`public`. All `image`/`heroImage` values are local (`"/moments/…"`).
- Fix: Remove the block. This reduces the R-001 attack surface but does not replace the upgrade.

### R-068: The `webpack()` dev hook and `build:turbopack` are legacy under Next 16 (Turbopack is the default)
- Severity: Low · Category: Legacy · Status: CONFIRMED · Verification: LEAD
- Location: `next.config.ts:25-33`; `package.json:26`
- Evidence: `next build --help` lists `--webpack  Builds using webpack.`, and the baseline build log shows `▲ Next.js 16.2.11 (Turbopack)`. `build:turbopack` has 0 references.
- Fix: Remove the hook and the script.
- Risk: Only `next dev --webpack` users lose the cache workaround.

### R-069: The single-run Lighthouse scripts duplicate the matrix and write unignored reports into `scripts/`
- Severity: Low · Category: Redundant/Bug · Status: CONFIRMED · Verification: AGENT
- Location: `scripts/run-lighthouse.ts`, `scripts/run-lighthouse-desktop.ts`; `package.json:63-64`
- Evidence: `run-lighthouse.ts:70 new URL(\`./lighthouse-report-${Date.now()}.html\`, import.meta.url)`. `git check-ignore` does not match these files, and they then trip the `check:candidate-diff`, conflict and release-policy scans.
- Fix: Delete both scripts and use `LH_MATRIX_PROFILES=mobile npm run audit:lighthouse:matrix`. Consider R-083 together with this.

### R-070: `axe-contrast.ts` is a near-copy and strict subset of `axe-a11y.ts`
- Severity: Low · Category: Redundant · Status: CONFIRMED · Verification: AGENT
- Location: `scripts/axe-contrast.ts`; `package.json:57`
- Fix: Delete it, plus `audit:contrast`, and update the README lines, `prune-reports.ts:15`, `.gitignore:49` and `.dockerignore:24`.

### R-071: The Makefile duplicates the `system:*` npm scripts one-to-one
- Severity: Low · Category: Redundant · Status: CONFIRMED · Verification: AGENT
- Location: `Makefile`; `package.json:85-95`
- Fix: **Decision.** Either delete the Makefile and relax `release-policy.mjs:659-664` and its fixture, or keep it and drop the duplicate `systemd:install`.

### R-072: Unreferenced npm aliases, and no-op flags in `db:*`
- Severity: Low · Category: Unused · Status: SUSPECTED (manual developer use) · Verification: AGENT
- Location: `package.json` (`build:secure`, `security:scan`, `db:generate`, `dev:clean`, `reports:prune`, and more)
- Evidence: 0 references outside `package.json`. `--skip-build --skip-migrate` do nothing with `--db-only` (`orchestrator:1126-1130`).
- To confirm: **Tell me which manual commands you use**; the rest can go. None of them are in `EXPECTED_PACKAGE_SCRIPTS`.

### R-073: `prisma.config.ts` loads env files in a different order from the documented one, and silently prefers an undocumented `DIRECT_URL`
- Severity: Low · Category: Bug · Status: CONFIRMED (code); impact SUSPECTED · Verification: AGENT
- Location: `prisma.config.ts:9-15`
- Evidence: The dev branch skips `.env.development`. `const datasourceUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;`, and `DIRECT_URL` is not in `.env.example` or the schema.
- Fix: Add `.env.development`; document and validate `DIRECT_URL`, or drop it.

### R-074: The `.env.example` `DATABASE_URL` does not match the docker-compose dev DB credentials
- Severity: Low · Category: Bug · Status: CONFIRMED · Verification: AGENT
- Location: `.env.example:5`; `docker-compose.yml:6-7`
- Evidence: `site_user:change-me` vs `devuser`/`devpass`.
- Fix: Change the value **keeping line 5, column 15** (the pinned secret fixture).

### R-075: `validate-security.ts` mixes string-presence checks with the real gate, and has a dead `info` branch and an unused export
- Severity: Low · Category: Overengineering · Status: CONFIRMED · Verification: AGENT
- Location: `scripts/validate-security.ts:17,86-131,262-269,304`
- Fix: Drop the `info` type and branch and the export. **Decision:** keep the string checks or not.

### R-076: Release gate 28 (`git diff --check`) is a strict subset of gate 29
- Severity: Low · Category: Redundant · Status: CONFIRMED · Verification: AGENT
- Location: `scripts/lib/release-gates.mjs`; `scripts/check-candidate-diff.mjs:20`
- Fix: Remove gate 28, and update `EXPECTED_GATE_PROFILE`, the docs table and the policy tests. **Approval needed** (changes the release contract).

### R-077: The migration hashes are duplicated in integration test support and in two docs
- Severity: Low · Category: Redundant · Status: CONFIRMED · Verification: AGENT
- Location: `tests/integration/support/migrations.ts:17-84`; `docs/testing.md:110-115`; `docs/release-verification.md:147-153`
- Fix: Read `prisma/integrity-manifest.json` through `scripts/lib/prisma-integrity.mjs`, and point the docs at `npm run hash:prisma-integrity`.

### R-078: The orchestrator's hand-written env-file parser behaves differently from dotenv and `@next/env`
- Severity: Low · Category: Redundant/Bug · Status: SUSPECTED · Verification: AGENT
- Location: `scripts/system-orchestrator.sh:338-377`
- To confirm: Compare `node -e "console.log(require('dotenv').parse('A=abc # c'))"` with the bash result.

### R-079: Dead helpers and leftover exports in scripts
- Severity: Low · Category: Unused · Status: CONFIRMED · Verification: AGENT
- Location: `system-orchestrator.sh:212-215` (`parse_major_version`); the exports in `check-image-assets.ts`, `prepare-standalone.mjs:17`, `check-secrets.mjs:216` and `validate-security.ts:304` (their tests were deleted in `6af0717`)
- Fix: Delete the function and drop the `export` keywords.

### R-080: The puppeteer postinstall downloads Chrome in the Docker builder and on production host installs
- Severity: Low · Category: Performance · Status: SUSPECTED (magnitude) · Verification: AGENT
- Location: `package.json:170`; `docker/Dockerfile.security:14`
- Fix: `ENV PUPPETEER_SKIP_DOWNLOAD=1` in the builder. The release policy parses the Dockerfile closely.
- To confirm: Look for the Chrome download in the `docker build` log.

### R-081: The host-based systemd production path is legacy according to the deployment ADR
- Severity: Low · Category: Legacy · Status: SUSPECTED (owner decision) · Verification: AGENT
- Location: `deploy/systemd/*`, `scripts/install-systemd-services.sh`, the production branches of the orchestrator, `Makefile:47-48`, `package.json:95`, the docs
- Evidence: `docs/architecture/deployment-target.md:29-39,176-180` ("Immutable Next.js standalone Node container"). `scripts/README.md:111` says it "must not be treated as an approved release procedure".
- **Decision:** remove it (the release-policy markers need relaxing), or mark it legacy. See R-018.

### R-082: The root audit docs 01–04 (~306 KB) are stale point-in-time records; `external-platform-cleanup.md` lists finished work as pending
- Severity: Low · Category: Legacy (docs) · Status: CONFIRMED · Verification: AGENT
- Evidence: The docs reference the missing `src/lib/upstash.ts`, `scripts/run-prisma-migrations.ts` and `.github/*`. `external-platform-cleanup.md:187-189,199-201` still lists CI/CNAME removal as pending, and its Dependabot paragraph predates the `.github` deletion.
- Fix: Move 01–04 to `docs/history/2026-07-15-audit/` unchanged and update the 4 links. Mark §6 as done and record the Dependabot decision.

### R-083: `types/lighthouse.d.ts` probably shadows lighthouse 13's own types
- Severity: Low · Category: Legacy · Status: CONFIRMED during execution (Batch F: deleting it exposed 2 real type errors in `lighthouse-matrix.ts`) · Verification: LEAD
- To confirm: Delete it locally and run `npm run typecheck`.

### R-084: The map helper API has unused members, constants and duplicated types
- Severity: Low · Category: Unused · Status: CONFIRMED · Verification: AGENT
- Location: `osrmClient.ts:10,43,167-196`; `useTravelMetrics.ts:39-40,162-175`; `mapConstants.ts:7-24`; `travelFormat.ts:4`; `mapLocations.ts:239`; `InteractiveMap.tsx:108`
- Fix: Delete the unused members, keep one `TravelMode`, and remove the second dedupe. Collapsing the 3 marker types is a separate refactor that needs approval.

### R-085: `CTAButton` and `ui/Button` are near-duplicates; unused CVA variants; dead button and badge CSS
- Severity: Low · Category: Redundant · Status: CONFIRMED · Verification: AGENT
- Location: `CTAButton.tsx`; `ui/Button.tsx`; `ui/Badge.tsx`; `ui/Surface.tsx`; `05-primitives.css:61-83,175-193`; `13-compatibility-admin.css:11-70`
- Fix: Keep `ui/Button`, replace the 8 `CTAButton` call sites, and trim the unused variants and CSS.

### R-086: The `WebVitalsReporter` widget code is unreachable (`showWidget={false}` is hard-wired)
- Severity: Low · Category: Unused · Status: CONFIRMED · Verification: AGENT
- Location: `src/components/WebVitalsReporter.tsx:22-50,87-102,149-313`
- Fix: Reduce the file to the effect plus `sendMetric`.
- To confirm (separately): whether `onFID` is deprecated in web-vitals 4.

### R-087: Hooks have unused options and return values (`useGuestSession`, `useTranslation`, TopControls `showCheckIn`)
- Severity: Low · Category: Unused · Status: CONFIRMED · Verification: AGENT
- Location: `src/hooks/useGuestSession.ts`; `src/hooks/useTranslation.ts`; `src/components/TopControls.tsx:38-56`
- Fix: Remove `enabled`, `checkSession`, `initialIsSignedIn` and `showCheckIn`. Replace `useTranslation` with `getDictionary(normalizeLocale(locale))`.

### R-088: `momentsLayoutConfig` keys are mostly unused, and some CSS is kept alive only by them
- Severity: Low · Category: Unused · Status: CONFIRMED · Verification: AGENT
- Location: `src/config/momentsLayoutConfig.ts:14-46`; `src/styles/03-home.css:86-176,227-239`; `09-utilities.css:180-189`
- Fix: Delete the unused keys and the `.guide-option-*` CSS.

### R-089: Dead CSS selectors (`.card`, `.input`, `.layer-surface`, `.dark\:text-brand-400`) and classes used in TSX that are defined nowhere
- Severity: Low · Category: Unused · Status: CONFIRMED · Verification: AGENT
- Evidence: An exact-token scan of 309 selectors. The undefined classes used in TSX are `skeleton`, `fav-btn`, `leaflet-custom-marker`, `menu-trigger` and `loading-sentinel`.
- Fix: Delete the dead selectors, and drop or define the undefined classes.

### R-090: The react-day-picker CSS targets v8 class names, but v9 is installed
- Severity: Low · Category: Legacy · Status: CONFIRMED · Verification: LEAD
- Location: `src/styles/08-vendor.css:6-320`; `12-apartment-checkin.css:167-180`
- Evidence: `node_modules/react-day-picker/package.json` has `9.14.0`. `dist/esm/UI.js` uses `selected`, `range_middle`, `today`, `month_caption`, `weekday`, `button_next`. The project CSS uses `.rdp-day_selected`, `.rdp-day_range_middle`, `.rdp-caption`, `.rdp-head_cell`, `.rdp-nav_button`.
- Impact: The custom picker states are probably unstyled, so the default stylesheet applies.
- Fix: Rewrite the selectors for v9, or delete them. A visual check is needed.

### R-091: The legacy `.dark` class shim; its `!important` rules override `.white-in-dark` on header links
- Severity: Low · Category: Legacy · Status: CONFIRMED (the visual effect is not verified) · Verification: AGENT
- Location: `src/app/layout.tsx:48`; `ThemeToggle.tsx:51,54`; `09-utilities.css:76-110`; `globals.css:15`
- Fix: Stop toggling `.dark` and delete the shim rules. Visual check in dark mode.

### R-092: `hover:text-brand-*` and `shadow-float-soft` utilities are never generated (hand-written Tailwind shims instead of `@theme`)
- Severity: Low · Category: Legacy/Bug · Status: CONFIRMED · Verification: LEAD
- Location: `src/styles/06-semantic-surfaces.css:1-51`; `01-tokens.css:103,131-138`; used at `AmenitiesList.tsx:39`, `[category]/page.tsx:62`, `favorites/page.tsx:49`, `book/page.tsx:90`, `Toast.tsx:36`
- Evidence: The built CSS (`.next/static/chunks/*.css`) has 0 `hover\:text-brand` rules, and `shadow-float-soft` appears only as `--shadow-float-soft`.
- Fix: Declare `--color-brand-*` and `--shadow-float-soft` in `@theme` and delete the shims. **Approval needed** (styling change).

### R-093: Localization and accessibility leaks: English error chrome and favorite labels on `/el`, raw keys as `alt`
- Severity: Low · Category: Bug · Status: CONFIRMED · Verification: AGENT
- Location: `UnifiedGuestClient.tsx:178`; `ErrorSummary.tsx:11-21`; `FavoritesClient.tsx:39`; `ListingCard.tsx:23`; `ApartmentCinematic.tsx:193,231-238`
- Fix: Pass `locale` and labels, and use `ht.photoAlts[altKey]` (add `bedroom_2`).

### R-094: Props that are never passed, and defaults exercised only by tests
- Severity: Low · Category: Unused · Status: CONFIRMED · Verification: AGENT
- Location: `ListingCard` (`image`, `footer`), `FavoritesClient` (`locale`), `SearchBar` (`onBooking`, `propertyName`), `StaticLocationMap`, `MapLoadingSkeleton`, `ApartmentGalleryLightbox` (`enableHaptics`), `ErrorSummary`, `Toast` duration, `trackPageview` locale, the `ThemeToggle`/`LocaleSwitcher` defaults
- Fix: Remove them; adjust the `ThemeToggle` tests if its defaults go.

### R-095: Data fields and assets that are never rendered
- Severity: Low · Category: Unused · Status: CONFIRMED · Verification: AGENT
- Location: `src/data/items/phones.json` `image` plus `public/phones/*-icon.svg` (5 files, replaced by `PhoneServiceIcon`); `schemas.ts:45,52-60` (`priceLevel`, `hours`); `sourceUrls` shipped to the client
- Fix: Delete them. **Deleting public assets needs approval.**

### R-096: Small helpers are duplicated across modules
- Severity: Low · Category: Redundant · Status: CONFIRMED · Verification: AGENT
- Evidence:
  - The `telHref` logic is reimplemented 4 times.
  - `pickLocalized` duplicates `pickLocale`.
  - Locale normalization appears about 30 times, while `normalizeLocale` already exists.
  - Inline SVGs are duplicated.
  - `BookingLabels` is declared 3 times.
  - The travel-mode emoji mapping appears twice.
- Fix: Split this into small separate tasks.

### R-097: An unused Geoapify preconnect and CSP entry
- Severity: Low · Category: Legacy · Status: CONFIRMED · Verification: AGENT
- Location: `src/app/layout.tsx:51`; `src/lib/security-config.ts:167`
- Fix: Delete both. Map tiles come from OSM and cartocdn.

### R-098: `StatusCluster` sends a HEAD probe every 15 s, even in hidden tabs
- Severity: Low · Category: Performance · Status: CONFIRMED · Verification: AGENT
- Location: `src/components/StatusCluster.tsx:88-127`
- Fix: Pause while `document.hidden`, or rely on the `online`/`offline` events.

### R-099: Home booking bar leftovers
- Severity: Low · Category: Legacy · Status: CONFIRMED · Verification: AGENT
- Location: `SearchBar.tsx:12-14,82-84,104-107,198-225`; `page.tsx:58-69`; `dateUtils.ts:54-56`
- Evidence:
  - `params.delete("adults")` and `params.delete("kids")` are a remnant of a removed feature.
  - The code re-implements `dateRangeToParams`.
  - Labels are resolved twice.
  - `getBlockedDates()` always returns `[]`.
- Fix: Remove the leftovers and reuse `dateRangeToParams`.

### R-100: `HomeFeature.icon` is ignored, and `getCategoriesWithCounts()` parses every JSON on each home request for unused counts
- Severity: Low · Category: Unused/Performance · Status: CONFIRMED · Verification: AGENT
- Location: `src/components/home/HomeFeatureGrid.tsx:3-21`; `src/app/[locale]/page.tsx:17-34`
- Fix: Drop `icon`, and use `categories` directly.

### R-101: The ApartmentCinematic "Contact Us" CTA links to `/phones`
- Severity: Low · Category: Bug · Status: SUSPECTED (intent) · Verification: AGENT
- Location: `src/components/ApartmentCinematic.tsx:220-225`
- To confirm: Should it link to `/${locale}#contact`?

---

## Nit (grouped)

### R-103: An empty or unparsable `DATABASE_URL` crashes startup with a raw `TypeError` instead of the formatted validation errors
- Severity: Low · Category: Error handling · Status: CONFIRMED · Verification: LEAD (found during the T25 smoke run)
- Location: `src/lib/runtime-env-schema.js:13-16,36`; `src/lib/env.ts` (catches only `z.ZodError`); `instrumentation.ts:15-21`
- Evidence:
  - `DATABASE_URL: z.string().url()…refine(isPostgresUrl, …)`
  - `isPostgresUrl` calls `new URL(value)` without a try/catch.
  - Running `next start` with `DATABASE_URL=` logged `An error occurred while loading instrumentation hook: Invalid URL … code: 'ERR_INVALID_URL', input: ''`, and every page returned 500.
  - HEAD has the same code, so this is pre-existing.
- Problem: Zod 4 still runs the refine after `.url()` fails, and the refine throws a `TypeError`. `validateEnv` rethrows anything that is not a `ZodError` without the per-field issue list.
- Impact: The failure is still fail-closed (the server does not start), but the operator sees `Invalid URL` with no variable name and none of the other env issues.
- Fix: `function isPostgresUrl(value) { try { const { protocol } = new URL(value); return protocol === 'postgresql:' || protocol === 'postgres:'; } catch { return false; } }`
- Fix risk: none for valid URLs. Add a unit case for `DATABASE_URL=''` and `'not a url'`.

### R-102: Nits
All CONFIRMED unless marked. Verification: AGENT.

**Code**
- `site.ts:10-19`: a `normalizeExternalUrl` placeholder shim for `yourdomain.example`, which no data contains.
- `featureFlags.ts:12`: the module `cache` is never read as a cache. The L37 log text is wrong outside production.
- `eslint.config.security.mjs:86`: a stale `fs` rule override for `api/health/route.ts`.
- `scripts/eslint-rules/internal-fetch.js:12`: `context.getFilename()` is deprecated (ESLint 9.39.5 `file-context.js:105-112`); use `context.filename`.
- `env.ts:11-24`: the memo and wrapper serve a single caller that ignores the return value.
- `runtime-env-schema.js:35-41` duplicates `hasRepeatedPattern` in `runtime-credentials.js`.
- `portalAuthHttp.ts:46-54`: signs and then re-verifies a JWT just to get `sid`.
- `prisma.ts:114-152`: `getRecommendedPoolConfig` is only logged.
- `auth/common.ts`: a single-consumer interface with a redundant `export {}`.
- Duplicated code:
  - the serializable retry loop (2×)
  - the UUID regex (2×)
  - a double read in `bookingOutbox.ts:53-60`
  - a `data.ts:7` re-export with one user
- SUSPECTED: the dynamic `await import('@/lib/prisma')` in `auth/admin.ts` and `guestSession.ts` looks unnecessary.
- Route nits:
  - the `?error=session_expired` query parameter is never read
  - `verifyAdminSession` is followed by redundant role checks
  - `guest/page.tsx` repeats the layout's `portalEnabled` check
  - `sitemap.ts`/`robots.ts` hardcode `['en','el']`
  - a stale "XSS/SQLi" comment in `preferences/route.ts:117`
  - two equivalent guest-session read paths

**Frontend**
- `sw.js:3`: `__CACHE_VERSION` is never assigned; the inert `@ts-expect-error`s; the `getQueueSize` cursor.
- `PwaManager.tsx:18`: a no-op `lang` assignment.
- Needless `"use client"` in `DescriptionBox`, `LoadingSkeleton` and `Chevrons`.
- `types/apartment.ts:4`: a redundant `export {}`.
- The `// Arabic removed` comment.
- The theme color differs between the manifest (`#2ec4b6`) and `layout.tsx` (`#36b9ab`).
- `PortalRefreshRedirect` has a pass-through wrapper and English-only copy.
- `CheckInInfo.tsx:309-319` has casts.
- `menuLinks.ts:38` has a no-op filter.
- Redundant `slug ?? toSlug(name)`.
- The balcony photo appears twice in the gallery.
- SUSPECTED:
  - `Suspense` around non-suspending children
  - two analytics offline queues (`analyticsClient.ts:27-31` vs `sw.js:483-498`)

**Tooling**
- `.gitignore` entries for removed tooling (`jscpd-report`, `.dev_pid`, `analytics-*`, `data/*.db`, `/migrations/`, `.pnp`/`.yarn`).
- A duplicated retired-dependency list in `release-policy.mjs:403-422`. Hoisting it must not shift the pinned lines.
- `Dockerfile.security:24` hard-codes the image version.
- `eslint-config-next` 16.2.10 vs `next` 16.2.11.
- `@types/spdx-expression-parse ^3` vs `spdx-expression-parse ^4`.
- `config.test.ts` stubs `VERCEL_URL`, and its `vi.unstubAllEnvs()` is redundant.
- `check-postgres-image-policy.ts` imports from `tests/`.
- `check-pepper.js:9` checks only `.env.local`.
- `.dockerignore` does not exclude `.claude/`, `CLAUDE.md`, `PROGRESS.md` or `REVIEW.md`.
- README and `scripts/README.md` overlap.
