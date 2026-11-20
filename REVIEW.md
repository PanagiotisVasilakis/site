# Review 6: whole-repo audit of 2026-11-20

Baseline HEAD `239b111` (clean tree). Earlier reviews ended at R-881; their text is in git history only.

## Summary
- Counts: Critical 0, High 0, Medium 8, Low 12, Nit 1 (R-902, added during remediation). CONFIRMED 17, SUSPECTED 4 (R-883, R-887, R-894, R-899). Added later, see the end of the file: R-903..R-909 (Low 2, Nit 5; CONFIRMED 6, SUSPECTED 1).
- Themes: public availability helpers disagree (minimum stay, unknown nights); alerting and release tooling report "fine" when they did not check;
  client error reporting; missing tests on deferred loading and worker bundles; one pass-through data layer.
- Reviewed: `src/lib`, `src/app/api`, `src/components` (availability, home, shell, guide, check-in, admin requests), `scripts`, `docker`, `prisma/schema.prisma`, test layout.
- Not reviewed: `src/generated`, lockfile, `public/` assets, design scripts (`design:*`), CSS in depth, i18n dictionaries text, `docs/` beyond the security contracts.
- Not run: integration suite, production build, Docker image build, coverage (only typecheck, knip and the default suite ran for the baseline).

## Findings

### R-882: Home BookBar offers a night the minimum stay forbids
- Severity: Medium
- Category: Bug
- Status: CONFIRMED
- Location: src/components/home/homeNights.ts:L29-L34
- Evidence: `const index = availability.nights.indexOf('o'); ... return { tonight: index === 0, date: addDays(availability.today, index) };`
  The planner instead uses `checkOutWindow` (src/components/availability/plannerState.ts:L39-L45), which applies `minimumNightsFor`.
- Problem: the first open night is reported even when no stay can start there (a one-night gap under a two-night minimum).
- Impact: the mobile BookBar and the home strip say "free tonight / from <date>", the availability page then refuses that check-in.
- Fix: take the full `PublicAvailability` and return the first night for which `checkOutWindow(night, context) !== null`.
- Fix risk: `NextFreeNight` callers (`AvailabilityBookBar.tsx`, `NightsTeaser.tsx`, `src/app/[locale]/page.tsx`); test in tests/components/home-sections.test.tsx.

### R-883: No production migration step in the runbook
- Severity: Medium
- Category: Maintainability
- Status: SUSPECTED
- Location: scripts/README.md:L121-L139; docker/Dockerfile.security:L39-L58
- Evidence: the Production section lists build and scan and "Feature flags after the first migrate" but no migrate command; the runner stage removes npm/npx and
  copies no `prisma` folder; `/api/health/ready` expects migration `20261020120000_booking_calendar_source` (src/app/api/health/ready/route.ts:L13).
- Problem: a release that adds a migration has no written step that applies it; the image cannot apply it itself.
- Impact: after such a release the app stays not-ready until someone remembers to run `prisma migrate deploy` from a checkout.
- Fix: a short "Release steps" paragraph in scripts/README.md (migrate from the release checkout with the production `DIRECT_URL`, then start the image).
- Fix risk: text only; the deploy target is an owner fact, the paragraph must stay generic.
- To confirm (SUSPECTED only): the owner says whether a migrate step exists outside the repo.

### R-884: Dead-outbox alert notifies once, then stays silent while it grows
- Severity: Medium
- Category: Error handling
- Status: CONFIRMED (by reading)
- Location: src/lib/operationalMonitor.ts:L173-L205
- Evidence: `const alert = current ? await prisma.alert.update({ where: { id: current.id }, data: { value } }) : ...` then
  `if (!alert.notificationDeliveredAt && webhookUrl) { ... notifyAlert(...) }`.
- Problem: once the webhook was delivered, a later, higher value updates the row but never notifies again; DEAD events stay 30 days.
- Impact: one dead notification is reported; the next ten are not, until an administrator resolves the alert.
- Fix: also notify when the new value is greater than `current.value`.
- Fix risk: more webhook calls for a rising value (at most one per worker run); test in tests/unit/operational-alerts.test.ts.

### R-885: Admin request card stays stale after a conflict
- Severity: Medium
- Category: Bug
- Status: CONFIRMED
- Location: src/app/admin/requests/AdminRequestsClient.tsx:L200-L219
- Evidence: L214 `if (!result.ok) {` sets the error feedback and returns; `await loadRequests(filterRef.current, false);` (L219) runs only on success.
- Problem: when another administrator already decided the request (409), the list is not reloaded.
- Impact: the card keeps its Approve/Reject buttons; each click fails again until a manual refresh.
- Fix: reload the list in the failure branch, then show the error.
- Fix risk: feedback must survive the reload (`clearFeedback = false`); test in tests/components/admin-views.test.tsx.

### R-886: License check passes when it checked nothing
- Severity: Medium
- Category: Bug
- Status: CONFIRMED (by reading)
- Location: scripts/check-licenses.ts:L78-L86
- Evidence: `const manifest = await readInstalledManifest(packagePath); if (!manifest) { continue; }`
- Problem: without `node_modules` (or with a missing package) every entry is skipped and the script still reports that all licenses comply.
- Impact: a release gate that is green without having read one license.
- Fix: fail when no package was checked; report a lockfile entry whose manifest is missing instead of skipping it silently.
- Fix risk: optional platform packages are legitimately absent (must not fail on those); no test references this script today.

### R-887: Worker bundles never run against a database in tests
- Severity: Medium
- Category: Tests
- Status: SUSPECTED
- Location: tests/unit/build-workers.test.ts; tests/integration (no reference)
- Evidence: `grep -rlE "dist/workers|build-workers|drain-outbox.mjs|run-operational-maintenance" tests/integration` printed nothing (exit 1).
- Problem: production runs `node dist/workers/*.mjs`; tests exercise the TypeScript sources and the bundle's shape, never the bundle with a live database.
- Impact: a bundling fault (adapter, generated client, env loading) would first show in production.
- Fix: one integration test that builds and runs `drain-outbox.mjs` against the disposable database and expects exit 0.
- Fix risk: integration suite time; needs Docker.
- To confirm (SUSPECTED only): read the image build and scan scripts for a smoke run of the workers.

### R-888: No test for deferred PWA loading and for "Load more"
- Severity: Medium
- Category: Tests
- Status: CONFIRMED (by grep)
- Location: src/components/DeferredRuntimeManagers.tsx:L10-L18; src/lib/motion/scheduleIdle.ts; src/app/admin/requests/AdminRequestsClient.tsx:L140-L161
- Evidence: no file under tests/ mentions `scheduleIdle`, `DeferredRuntimeManagers`, `loadMore` or `Load more`.
- Problem: the only mount of `PwaManager` (service worker registration) and the admin pagination have no test that fails when they break.
- Impact: offline support or older requests can vanish without a red test.
- Fix: one component test each.
- Fix risk: none for production code.

### R-889: `guestStore` is a pass-through layer
- Severity: Medium
- Category: Overengineering
- Status: CONFIRMED (by grep)
- Location: src/lib/guestDataStore.ts:L20-L42, L127-L157
- Evidence: nine read methods only forward to the repositories and are used only by src/lib/guestDataExport.ts (plus `findUserById` in
  src/app/api/check-in/arrival-request/route.ts:L85); `ttlDays = 7` defaults are never relied on.
- Problem: an extra layer that every test of the export has to mock.
- Impact: maintenance cost only.
- Fix: `guestDataExport` calls the repositories directly; keep `issueRefreshToken`, `rotateRefreshToken`, `revokeRefreshFamily`.
- Fix risk: ten test files mock `guestStore`; the refresh paths must not change.

### R-890: Unknown nights count as free in the planner
- Severity: Low
- Category: Bug
- Status: CONFIRMED
- Location: src/components/availability/plannerState.ts:L25-L31
- Evidence: `for (let index = nights.indexOf('b'); index !== -1; index = nights.indexOf('b', index + 1))`
- Problem: only `'b'` blocks a stay; a night coded `'u'` is treated like an open one.
- Impact: a stay can be selected across nights the calendar does not know.
- Fix: every night that is not `'o'` is unavailable.
- Fix risk: tests/unit/availability-ui-helpers.test.ts and tests/components/availability-planner.test.tsx.

### R-891: Empty `ALERT_WEBHOOK_REQUIRED=` stops the start
- Severity: Low
- Category: Bug
- Status: CONFIRMED (ran the schema)
- Location: src/lib/runtime-env-schema.js:L104
- Evidence: `ALERT_WEBHOOK_REQUIRED: z.enum(['0', '1']).optional().default('0')`; parsing `''` gives "Invalid option".
- Problem: an env file line with an empty value fails validation, other optional keys accept it.
- Impact: start exits 78 for an empty optional flag.
- Fix: treat `''` as unset.
- Fix risk: tests/security/security-boundaries.test.ts.

### R-892: Success responses carry a correlation id the logs do not have
- Severity: Low
- Category: Bug
- Status: CONFIRMED (by reading)
- Location: src/lib/apiErrorHandler.ts:L339
- Evidence: `const correlationId = requestCorrelationId || generateCorrelationId();`
- Problem: without an explicit id the response gets a fresh one, not the request's logger context id.
- Impact: an id copied from a response finds nothing in the logs.
- Fix: fall back to the logger context id first.
- Fix risk: tests/security/api-boundaries.test.ts:L98.

### R-893: The client reports the same error without limit
- Severity: Low
- Category: Performance
- Status: CONFIRMED (by reading)
- Location: src/lib/errorReporting.ts:L73-L122
- Evidence: every `reportError` call posts; the server allows 10/min per address and 500/h in total (src/app/api/errors/route.ts:L34-L50).
- Problem: one looping error on one device can use up the global budget.
- Impact: other guests' reports are dropped for the hour.
- Fix: skip a repeated `name|message|file|line` key and cap reports per page load.
- Fix risk: tests/routes/client-error-report.test.ts.

### R-894: Wi-Fi details are not asked again when the phone clock runs ahead
- Severity: Low
- Category: Bug
- Status: SUSPECTED
- Location: src/components/CheckInInfo.tsx:L263-L314
- Evidence: one timer `window.setTimeout(refetchWifi, delay + 1_000)`; a response that is still pending schedules nothing.
- Problem: if the device clock is ahead of the server the single refetch is early and the card stays pending until the guest leaves and returns.
- Impact: the guest sees "available soon" past the release time.
- Fix: one bounded extra refetch while the response still says pending.
- Fix risk: tests/components/checkin-wifi.test.tsx (fake timers).
- To confirm (SUSPECTED only): a component test with a clock ahead of the server time.

### R-895: Stack location is read only from V8 stacks
- Severity: Low
- Category: Bug
- Status: CONFIRMED (ran)
- Location: src/lib/errorReporting.ts:L124-L131
- Evidence: `stack?.match(/at.*\((.+):(\d+):(\d+)\)/)`
- Problem: Safari and Firefox stacks (`fn@url:line:col`) never match.
- Impact: reports from iPhones have no file or line.
- Fix: accept the `@url:line:col` form as well.
- Fix risk: same test file as R-893.

### R-896: `formatDistance` prints "1,000 m"
- Severity: Low
- Category: Bug
- Status: CONFIRMED (ran)
- Location: src/components/guide/guideEntries.ts:L56-L61
- Evidence: `if (km < 1) { const metres = Math.max(10, Math.round(km * 100) * 10);`
- Problem: 0.995 to 0.999 km rounds to 1000 metres.
- Impact: "1,000 m" next to "1 km" entries.
- Fix: switch to kilometres from 0.995.
- Fix risk: tests/unit/guide-entries.test.ts.

### R-897: An image built from a dirty tree records a clean commit
- Severity: Low
- Category: Maintainability
- Status: CONFIRMED (by reading)
- Location: scripts/docker-build.sh:L11-L19; scripts/image-tag.sh:L10-L13
- Evidence: `--build-arg GIT_COMMIT="$commit"` with `commit="$(git rev-parse --verify HEAD)"`; only the tag gets `-dirty`.
- Problem: the version inside the image names a commit the image was not built from. The tag does say `-dirty`.
- Impact: a retagged dirty image looks like a release build.
- Fix: refuse a dirty tree unless `ALLOW_DIRTY=1`, or pass the dirty mark into `GIT_COMMIT`.
- Fix risk: local trial builds; scripts/README.md and README.md describe the script.

### R-898: SPDX `OR` is treated as `AND`
- Severity: Low
- Category: Logic
- Status: CONFIRMED (by reading)
- Location: scripts/check-licenses.ts:L261
- Evidence: `return isAllowedSpdxExpression(node.left) && isAllowedSpdxExpression(node.right);`
- Problem: `(MIT OR GPL-3.0)` is refused although one allowed alternative is enough.
- Impact: false failures (strict, not unsafe).
- Fix: `||` for `OR` nodes, `&&` for `AND`.
- Fix risk: same file as R-886.

### R-899: Development pepper fallback in crypto.ts looks unnecessary
- Severity: Low
- Category: Overengineering
- Status: SUSPECTED
- Location: src/lib/crypto.ts:L3-L57
- Evidence: the issue and rotate paths call `requestAuthContext` -> `privacyHmac` -> `requirePepper` before `hashSensitive`.
- Problem: about 45 lines of fallback for a state the callers cannot reach.
- Impact: maintenance cost; a second way to obtain the pepper.
- Fix: `hashSensitive` / `verifySensitive` read `requirePepper('SECURITY_PEPPER')` lazily.
- Fix risk: build without a pepper (NEXT_PHASE) and tests/security/security-boundaries.test.ts:L575-L580; docs/security/runtime-credential-contract.md.
- To confirm (SUSPECTED only): `npm run build` without a pepper after the change.

### R-900: Dead `//` check and a comment that no longer holds
- Severity: Low
- Category: Redundant
- Status: CONFIRMED (by reading)
- Location: src/components/OfflineActions.tsx:L10-L15
- Evidence: `if (!target || target.startsWith('//')) return null;` while src/lib/safeLocalPath.ts:L25 already has `if (target.pathname.startsWith('//')) return null;`
- Problem: the comment says `toSafeLocalPath` still returns `//host`; it does not.
- Impact: misleading text about a security helper.
- Fix: drop the second check and correct the comment (also tests/components/offline-actions.test.tsx:L52).
- Fix risk: none if the helper keeps its check.

### R-901: Unused index `idx_rate_limits_count`
- Severity: Low
- Category: Unused
- Status: CONFIRMED (by reading)
- Location: prisma/schema.prisma:L293
- Evidence: `@@index([count], map: "idx_rate_limits_count")`; the only other reference in the tree is the migration that created it.
- Problem: no query filters or sorts by `count`.
- Impact: one extra index write per rate-limit update.
- Fix: drop it in a forward migration and move `EXPECTED_MIGRATION`.
- Fix risk: a migration and a readiness constant for a very small gain.

### R-902: check-pepper.js says the server validates the pepper in development
- Severity: Nit
- Category: Maintainability
- Status: CONFIRMED
- Location: scripts/check-pepper.js:L3-L5
- Evidence: the comment reads "It does not block `npm run dev` (the server's environment validation does)"; the only parse of the runtime env schema is
  scripts/start-standalone.mjs:L4,L12 (found by the T13 reviewer and re-checked by the decision agent in O-2.6); `next dev` runs no such validation.
- Problem: the comment promises a check that development does not have.
- Impact: a developer without a pepper expects a start-up error and gets one at the first hash call instead (since T13).
- Fix: reword the comment.
- Fix risk: none (comment only).

## Resolutions (2026-11-20; ledger: agent-knowledge/audit-20261120/ledger.tsv; decisions: agent-knowledge/audit-20261120/decisions/O-1.md, O-2.md)
- R-882: FIXED (T01). red logs/T01/red-home-sections.log, green logs/T01/green-vitest.log; patch T01
- R-883: FIXED (T12). runbook paragraph "Applying migrations" in scripts/README.md (generic); owner question open: who runs it in production
- R-884: FIXED (T02). red logs/T02/red-vitest.log + fu-red.log, green fu-green.log; patch T02 (O-1.3, O-2.1)
- R-885: FIXED (T03). red logs/T03/red-vitest.log, green green-vitest.log; patch T03
- R-886: FIXED (T04). red logs/T04/red-vitest.log + fu-red.log, green fu-green.log; real tree license check exit 0; patch T04 (O-1.9, O-2.2)
- R-887: FIXED (T10). tests/integration/operations/worker-bundle.test.ts passed in logs/F-integration.log (20 files, 99 tests); no red run possible (test-only)
- R-888: FIXED (T09). mutation red logs/T09/red-1..3, green green-vitest.log; patch T09
- R-889: DECLINED. O-1: maintenance-only gain; rewriting the guestStore mocks (37+ references) costs more than the layer
- R-890: DECLINED. O-1: unknown nights are only the tail past the sync horizon; a correct fix reaches five places; Booking.com stays the authority
- R-891: FIXED (T05). red logs/T05/red-vitest.log, green green-vitest.log; patch T05
- R-892: FIXED (T06). red logs/T06/red-vitest.log, green green-vitest.log; patch T06
- R-893: FIXED (T07). red logs/T07/red.log, green green.log; patch T07
- R-894: FIXED (T11). red logs/T11/red.log, green green.log; patch T11 (O-1.8, O-2.3)
- R-895: FIXED (T07). red logs/T07/red.log, green green.log; patch T07
- R-896: FIXED (T08). red logs/T08/red-vitest.log, green green-vitest.log; patch T08
- R-897: FIXED (T12). red logs/T12/red.log, green green.log; patch T12 (O-1.6)
- R-898: FIXED (T04). red logs/T04/red-vitest.log, green green-vitest.log; patch T04
- R-899: FIXED (T13). red logs/T13/red.log, green green.log; reviewer at max PASS; build with empty SECURITY_PEPPER exit 0 (logs/W-build-nopepper.log); patch T13
- R-900: FIXED (T14). green logs/T14/vitest-green.log (removal of an unreachable check; no red run possible); patch T14
- R-901: DECLINED. O-1: needs its own migration and readiness constant for one index entry per write; fold into the next migration
- R-902: DEFERRED-OWNER (T13). the permission system refused the implementer's edit of scripts/check-pepper.js; intended change in patches/R-902-owner.patch

## Findings added on 2026-11-20 (the seven smaller items of the audit report; the owner left "fix them if worth it" to the lead's judgment)

### R-903: A dismissed update banner flashes on every page load
- Severity: Low
- Category: Bug
- Status: CONFIRMED (by reading)
- Location: src/components/PwaManager.tsx:L86-L97
- Evidence: `if (dismissedUpdate && updateKey && dismissedUpdate === updateKey) return;` then `b.style.display = 'flex';`, called right after
  `reg.waiting.postMessage({ type: 'REQUEST_VERSION' })`; `data-update-key` is set only later, by the message handler (L209), which then hides the banner (L213-L214).
- Problem: on a fresh page the banner has no key yet, so a stored dismissal can never match in `showBanner`.
- Impact: a guest who dismissed an update sees the banner appear and vanish on each full page load while that worker waits.
- Fix: while a dismissal is stored and the key is not known yet, do not show; the version reply shows the banner when the update is a different one.
- Fix risk: a waiting worker that never answers stays unannounced for a guest who dismissed an earlier update; tests/components/pwa-manager.test.tsx.

### R-904: No test guards the Dockerfile COPY of the start-up modules
- Severity: Low
- Category: Tests
- Status: CONFIRMED (by grep)
- Location: docker/Dockerfile.security:L56-L60; scripts/start-standalone.mjs:L3-L4
- Evidence: the image CMD runs `scripts/start-standalone.mjs`, which imports `../src/lib/runtime-env-schema.js` (which imports `./runtime-credentials.js`) and `zod`;
  each needs its own `COPY` line. tests/unit/build-workers.test.ts:L40-L45 guards only the `dist/workers` line.
- Problem: a new import in those modules without a matching COPY passes every local gate.
- Impact: the image exits at start with a module-not-found error; seen first when the image is run.
- Fix: one unit test that walks the relative imports from the start script and expects a COPY line for each file and package.
- Fix risk: none for production code.

### R-905: `DATABASE_URL` accepts an `options` parameter
- Severity: Nit
- Category: Security
- Status: SUSPECTED
- Location: src/lib/runtime-env-schema.js:L82
- Evidence: `DATABASE_URL: z.url().min(1, ...).refine(isPostgresUrl, ...)`; no rule on query parameters; docs/security/runtime-credential-contract.md has none either.
- Problem: none shown: the value is set by the operator, not by a request.
- Impact: no concrete case found.
- Fix: none proposed.
- Fix risk: -
- To confirm (SUSPECTED only): a path by which someone other than the operator sets the URL.

### R-906: ESLint does not ignore `tmp-build-workers-*`
- Severity: Nit
- Category: Maintainability
- Status: CONFIRMED (by reading)
- Location: eslint.config.mjs (ignores); .gitignore:L44 has `/tmp-build-workers-*/`
- Evidence: the ignore list holds node_modules, .next, coverage, out, build, dist, next-env.d.ts only.
- Problem: a lint run started while a worker-bundle test is running would lint the temporary bundle.
- Impact: a possible spurious lint failure when lint and tests run at the same time; the folder is removed by the test.
- Fix: add `tmp-build-workers-*/**` to the ignores.
- Fix risk: a lint ignore is a change reserved to the owner.

### R-907: The planner evaluates `checkOutWindow` more than once per day
- Severity: Nit
- Category: Performance
- Status: CONFIRMED (by reading)
- Location: src/components/availability/AvailabilityPlanner.tsx:L188-L225
- Evidence: `checkOutWindow(day, context)` at L192, L212 and L225 inside per-day callbacks.
- Problem: repeated work for at most a few hundred days per render.
- Impact: none measurable.
- Fix: none proposed (micro-optimization).
- Fix risk: -

### R-908: Two exports are used outside their module only by tests
- Severity: Nit
- Category: Maintainability
- Status: CONFIRMED (by grep)
- Location: src/lib/availability/stayQuote.ts:L33 (`rateForNight`); src/lib/availability/icalParser.ts:L35 (`IcalParseErrorCode`)
- Evidence: `grep -rn "rateForNight\|IcalParseErrorCode" src tests scripts`: besides their own modules only tests/unit/stay-quote.test.ts and tests/unit/ical-parser.test.ts.
- Problem: both are production code (used inside their modules), exported so that the tests can reach them.
- Impact: none; knip passes.
- Fix: un-export and rewrite seven assertions to go through `minimumNightsFor`.
- Fix risk: weaker, indirect assertions for no gain.

### R-909: The claim-grants and access-reset routes are near copies
- Severity: Nit
- Category: Redundant
- Status: CONFIRMED (diff)
- Location: src/app/api/admin/bookings/[id]/claim-grants/route.ts; src/app/api/admin/bookings/[id]/access-reset/route.ts
- Evidence: 57 and 55 lines; `diff` shows 22 differing lines: the schema, the service call, the body limit and three messages. The shared part is the usual
  route frame (auth, body validation, error mapping).
- Problem: about 45 shared lines.
- Impact: two places to touch when the frame changes.
- Fix: a shared helper taking the schema, the service call and the messages.
- Fix risk: a new abstraction over two security-sensitive admin routes for about 40 lines.

## Resolutions of R-903..R-909 (2026-11-20; the owner left the choice to the lead: "fix them if you think it is worth it")
- R-903: FIXED (T15). red logs/T15/red-vitest.log, green green-vitest.log; reviewer PASS; patch T15
- R-904: FIXED (T16). red logs/T16/red-extra-file.log (temporary extra expectation), green green.log; reviewer PASS; patch T16
- R-905: DECLINED. lead judgment on the owner's delegation (2026-11-20): no concrete case; the URL is operator-set
- R-906: DECLINED. lead judgment: small gain; a lint ignore is owner-reserved; one line in eslint.config.mjs ignores if the owner wants it
- R-907: DECLINED. lead judgment: micro-optimization with no measurable effect
- R-908: DECLINED. lead judgment: production functions tested directly; un-exporting only weakens the tests
- R-909: DECLINED. lead judgment: a new abstraction over two security-sensitive routes for about 40 lines

## Correction and new finding after the live check (2026-11-20)
- R-905: FIXED (T17). The DECLINED line above was wrong and the lead's error: scripts/README.md:62 states the requirement ("`DATABASE_URL`, without an
  `options` query parameter") and node_modules/pg/lib/connection-parameters.js:57-60 parses the connection string over the config, so an `options` value in the
  URL replaces the `-c TimeZone=UTC` pin of src/lib/prismaPgConfig.ts:49. The schema now refuses it. red logs/T17/red.log, green green.log; reviewer PASS; patch T17

### R-910: Workers and the dev server never check `DATABASE_URL` for an `options` parameter
- Severity: Low
- Category: Data integrity
- Status: CONFIRMED (code path); impact SUSPECTED
- Location: src/lib/prisma.ts:L16-L27; src/lib/prismaPgConfig.ts:L36-L50; scripts/start-standalone.mjs:L12
- Evidence: `runtimeEnvSchema.parse(process.env);` appears only in scripts/start-standalone.mjs:12 (`grep -rn "runtimeEnvSchema" src scripts`: that line and its
  import). src/lib/prisma.ts:17 reads `process.env.DATABASE_URL` and passes it to `buildPrismaPgAdapterArgs(connectionString)`, which sets
  `options: '-c TimeZone=UTC'` next to `connectionString` without looking at the URL's own `options`.
- Problem: the rule added for R-905 guards the web server's start only. `node dist/workers/drain-outbox.mjs`, `run-operational-maintenance.mjs` and
  `next dev` build the pool from the raw URL.
- Impact: only when a worker's environment carries an `options` parameter (the web server with the same value refuses to start, exit 78): that worker's
  sessions lose the UTC pin and timestamps are written or read with the server's zone offset. Not reproduced.
- Fix: throw in `buildPrismaPgAdapterArgs` when the URL has an `options` parameter (message without the URL), with one test in
  tests/unit/prisma-adapter-config.test.ts; the schema rule stays as the fail-closed start-up message.
- Fix risk: a deployment that sets `options` today stops instead of running without the pin; the owner must know before it ships.
- To confirm (SUSPECTED only): start a worker against a local database with `?options=-c%20TimeZone%3DEurope%2FAthens` and read `SHOW TimeZone`.
