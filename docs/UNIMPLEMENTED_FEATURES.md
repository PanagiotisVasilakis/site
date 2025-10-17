# Unimplemented Features

Last updated: October 17, 2025

## Completed Capabilities

- Guest content directory with multilingual support.
- Offline-ready PWA with service worker caching.
- Analytics, booking flow, and guest check-in portal.
- Admin dashboards, rate limiting, CSP, tracing, health checks, and SEO enhancements.

## Work Still Outstanding

### Metrics Dashboard (`ObservabilityDashboard.tsx`)

- Placeholder copy still renders in the **metrics** tab.
- Needs charts for request rate, latency, error rate, cache efficiency, and custom business counters.
- Suggestion: integrate a charting library such as Recharts.

### Analytics Dashboard (`ObservabilityDashboard.tsx`)

- Current view shows a “coming soon” message.
- Should surface funnels (home → category → detail → booking), session stats, bounce rates, and device breakdowns.
- Back-end data already exists in `/api/analytics`; work is UI + aggregation.

### Tracing Dashboard (`ObservabilityDashboard.tsx`)

- Trace tab also shows placeholder copy.
- Future work: waterfall visualization for spans, with filtering by trace ID, duration, or status.
- Requires durable trace storage (e.g., Jaeger/Zipkin or custom DB) plus an API layer.

### Correlation IDs in Browser Fetches (`internalFetchClient.ts`)

- ✅ `internalFetchClient.ts` now captures `x-correlation-id` response headers, stores them in session storage, and forwards them via `X-Parent-Correlation-ID` on subsequent requests.
- Next refinement opportunity: surface the active correlation ID in `JsonFetchHud` or console for easier debugging.

- ### Auth Module Migration (`src/lib/auth/index.ts`)

- ✅ All project imports now target concrete auth modules (`@/lib/auth/admin`, `@/lib/auth/guest`, `@/lib/auth/common`).
- ✅ Legacy re-export shim removed from `src/lib/auth/index.ts`.
- Consider deleting the now-superfluous `src/lib/auth.ts` compatibility file in a future cleanup after confirming no external tooling depends on it.

## Recommendations

- Prioritize dashboards if observability UX becomes a roadmap item.
- Schedule a short refactor sprint to finish correlation ID propagation and auth import cleanup.
- Re-run `npm run build` and `npm run lint` before shipping any dashboard work to confirm Edge readiness.
