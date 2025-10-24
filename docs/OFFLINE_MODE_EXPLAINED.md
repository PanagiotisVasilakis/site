# Offline Mode Guide

## What Matters

- Progressive Web App runtime keeps core flows working without network access.
- Service worker caches HTML, JSON, media, and analytics events so returning users get instant loads.
- Version metadata in `public/version.json` coordinates cache invalidation and update banners.

## Architecture Overview

### Service Worker

- Location: `public/sw.js`.
- Roles:
  - Precache critical assets during install.
  - Apply cache strategies per resource type.
  - Queue analytics events in IndexedDB when offline.
  - Manage cache cleanup and quota handling.

```javascript
// Sample: versioned cache name
const cacheName = `guest-guide-${meta.version}-${meta.precacheHash}`;
```

### Precaching Workflow

```bash
npm run build
  ├─ tsx scripts/generate-precache.ts
  ├─ tsx scripts/validate-content.ts
  ├─ tsx scripts/generate-version.ts
  └─ next build
```

- `public/critical-precache.json`: minimal install set.
- `public/precache.json`: full catalog for background warm up.
- `public/version.json`: ties cache version to git build.

### Runtime Caching Strategies

| Resource                     | Strategy                  | Notes                                      |
|------------------------------|---------------------------|--------------------------------------------|
| Page navigation (HTML)       | Offline first             | Falls back to locale offline page.         |
| JSON/API responses           | Stale while revalidate    | Serves cache, refreshes in background.     |
| Images and static assets     | Cache first with validate | Guards against corrupted cache entries.    |
| Analytics POST requests      | Queue and background sync | Flushes when connectivity returns.         |

```text
Offline first ⇒ respond from cache → trigger background revalidation.
```

## User Experience Flow

1. User opens a route while online.
2. Service worker caches the HTML and dependent assets.
3. If the user later loses connectivity, the cached version renders instantly.
4. Offline analytics events are persisted and replayed on reconnect.

Offline fallback pages live at `src/app/[locale]/offline/page.tsx` and provide retry/home actions.

## Client Integrations

### Data Warmup (`src/components/DataWarmup.tsx`)

- Prefetches category JSON after hydration.
- Schedules deeper warmup during idle time.
- Uses `logger-client` to stay Edge-compatible.

### PWA Manager (`src/components/PwaManager.tsx`)

- Registers the service worker on `load`.
- Displays update banner when `version.json` changes.
- Handles install prompts and manual refresh requests.

### Analytics Queue (`src/lib/analyticsClient.ts`)

- Sends via `navigator.sendBeacon` when possible.
- Falls back to fetch with `keepalive`.
- Enqueues payloads for background sync if offline.

## Developer Checklist

- Run `npm run build` to regenerate precache files and version metadata.
- When adding new routes or assets, confirm they appear in the `generate-precache` output.
- Update CSP directives (`src/lib/security-config.ts`) for any new remote origins used while offline.
- Test offline behavior with Chrome DevTools → Application → Service Workers → "Offline".
- Review the [Manual refresh playbook](#manual-refresh-playbook) before release to confirm operators know the recovery steps.

## Manual refresh playbook

Operators can use the following sequence when the service worker (SW) needs to be refreshed outside of an automated deployment. Each action lists prerequisites so teams can select the least disruptive option first.

1. **Trigger the SW update prompt from the PWA Manager**
   - **Prerequisites:** Update has shipped to production, and `public/version.json` on the CDN reflects the new build number.
   - Open the app in an authenticated session and wait for the update toast. If it does not appear within 60 seconds, proceed to step 2.

2. **Manually re-fetch `version.json`**
   - **Prerequisites:** Operator has browser DevTools access.
   - In DevTools → Console, run `fetch('/version.json', { cache: 'reload' }).then(res => res.json())` to confirm the version matches the release tag.
   - If the response matches the desired version but the page is still stale, continue to step 3.

3. **Hard reload to bypass HTTP caches**
   - **Prerequisites:** User can safely refresh the current page without losing data.
   - Use hard reload shortcuts (Chrome: `Shift` + `Cmd/Ctrl` + `R`; Firefox: `Cmd/Ctrl` + `Shift` + `R`) or open DevTools → Network tab → enable "Disable cache" → refresh.
   - After reload, check the Application → Service Workers panel to verify the new SW is "activated and running".

4. **Append a cache-busting query**
   - **Prerequisites:** Link sharing and deep links allow query parameters.
   - Navigate to the page with a `?cache-bust=<timestamp>` query string to force a network fetch of HTML and JSON payloads.
   - If the new SW takes control, remove the query string and reload once more to ensure standard URLs work.

5. **Temporarily disable the SW registration**
   - **Prerequisites:** Issue is blocking, and the operator has permission to run scripts in the browser console.
   - In DevTools Console run: `navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.unregister()));` then refresh the page.
   - Once the fresh content loads, re-enable offline support by running `PwaManager.register()` from the same console session or by signing out and back in (registration occurs on load).

6. **Escalate to cache eviction**
   - **Prerequisites:** CDN/hosting admin access and confirmation that the build artifacts are correct.
   - Purge the `version.json`, `sw.js`, and precache manifests (`precache.json`, `critical-precache.json`) from the CDN cache. After propagation, revisit step 1 to validate the update sequence.

### Troubleshooting

| Symptom                        | Likely Cause                                    | Fix                                                         |
|--------------------------------|-------------------------------------------------|-------------------------------------------------------------|
| Stale content after deployment | Old cache not invalidated                       | Verify `public/version.json` changed and SW activates once. |
| Assets missing offline         | Not included in precache or cache strategy      | Update precache script or cache handler.                    |
| Analytics data gaps            | Background sync disabled or queue size exceeded | Inspect `QUEUE_ANALYTICS` messages in SW console.           |
| Dev server uses old SW         | Stale registration in development               | Unregister SW (handled by `PwaManager` during dev).         |

## Open Improvements

- Propagate correlation IDs to client fetches (see TODO in `src/lib/internalFetchClient.ts`).
- Build a UI for observability dashboards (`src/components/ObservabilityDashboard.tsx`).
- Expand offline analytics metrics surfaced in `/api/analytics`.
