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
