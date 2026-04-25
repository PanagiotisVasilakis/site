# Performance Improvement Plan

## Performance Snapshot

- [ ] Shared first-load JS around 103 kB; heavy routes like `[locale]/guest` (~161 kB) and `[locale]/book` (~138 kB) likely feel sluggish on mid-tier mobile.
- [ ] Enable persisting load-time telemetry by turning on `NEXT_PUBLIC_ENABLE_PERF_TELEMETRY` and reviewing the structured logs (`WebVitalsReporter`, `/api/performance`).
- [ ] Validate expected LCP (1.5–2.5 s on good 4G, sub-second on desktop) via Lighthouse or built-in telemetry.

## Improvement Opportunities

- [x] Restore SSG where possible by refactoring cookie reads (`cookies()`) out of locale routes or replacing with `headers()`/`draftMode()` (`src/app/[locale]/layout.tsx`).
- [x] Gate `DataWarmup` and service-worker precache to avoid eager category/item fetches on first paint (e.g., auth guards or stricter `requestIdleCallback`) (`src/components/DataWarmup.tsx`).
- [x] Defer the Leaflet bundle (~70 kB) with `next/dynamic` and `ssr: false` so the map code loads only when needed (`src/components/LazyInteractiveMap.tsx`).
- [x] Audit Prisma client initialization to eliminate redundant `.init()` calls that trigger repeated cold starts during build (`src/lib/prisma.ts`).

## Next Steps

- [x] Enable telemetry in staging, capture a baseline set of Web Vitals from `/api/performance` logs (telemetry now defaults on in production via `WebVitalsReporter`).
- [ ] Run Lighthouse in Mobile/Slow 4G mode and record render-blocking assets (use `npm run lighthouse:mobile`).
- [x] Finish removing `cookies()` from static routes to regain SSG and lower server cost (`src/app/page.tsx`).

### Telemetry Checklist

- Set `NEXT_PUBLIC_ENABLE_PERF_TELEMETRY=false` to opt out when needed; production builds send metrics by default.
- Review structured logs in `/api/performance` (look for `Performance report processed successfully`).
- Capture before/after comparisons for key pages (guest booking, favorites, offline) and store the JSON payloads.

### Lighthouse Workflow

- Ensure the dev server is running (`npm run dev`) or point `LH_URL` at staging.
- Run `npm run lighthouse:mobile` to generate a Slow 4G mobile report.
- Run `npm run lighthouse:desktop` to generate a desktop performance report for the same route.
- The script saves an HTML snapshot in the `scripts/` directory; archive it with the date for trend tracking.

### Lighthouse Matrix Workflow

- Run `npm run audit:lighthouse:matrix` to measure key routes under both mobile and desktop profiles.
- Reports are saved under `reports/lighthouse-matrix/` as JSON and Markdown.
- For CI gating, run `npm run ci:lighthouse:matrix` (fails when score threshold is breached or major/critical severity appears).
- Override defaults when needed:
  - `LH_BASE_URL` to target staging.
  - `LH_MATRIX_PATHS` to use a custom route list.
  - `LH_MATRIX_PROFILES` to choose mobile, desktop, or both.
  - `CHROME_PATH` to force a specific Chrome/Chromium binary.

### Responsive UX Workflow

- Run `npm run check:browser-runtime` first on Linux to verify that Chrome/Chromium can launch.
- Run `npm run audit:responsive:ux` to audit core routes across phone and desktop viewport presets.
- Reports are saved under `reports/responsive-ux/` as both JSON and Markdown, plus screenshots per route x viewport cell.
- For CI gating, run `npm run ci:responsive:ux` (fails when major or critical issues are detected).
- Override defaults when needed:
  - `RESPONSIVE_BASE_URL` to target staging.
  - `RESPONSIVE_PATHS` to audit a custom route list.
  - `RESPONSIVE_VIEWPORTS` to limit to specific presets.
  - `RESPONSIVE_CHROME_PATH` to force a specific Chrome/Chromium binary when Puppeteer runtime libraries are unavailable.

Linux runtime note:

- If launch errors mention `libasound.so.2`, install `libasound2` (or `libasound2t64` on newer distros).
