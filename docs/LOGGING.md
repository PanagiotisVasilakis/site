# Logging changes

This note documents a small change to reduce noisy warning logs from the dev server.

- Problem: Repeated 401 / UNAUTHORIZED API responses were being logged at WARN level which spammed the console during normal unauthenticated requests.
- Change: 401 / UNAUTHORIZED responses are now logged at DEBUG level in two places:
  - `src/lib/apiErrorHandler.ts` — Auth-related ApiError instances (status 401) are logged with `logger.debug` instead of `logger.warn` (minimal metadata).
  - `src/lib/internalFetchClient.ts` — Client-side internal fetch now logs 401 responses with `logger.debug` instead of `logger.warn`.

Rationale: Many apps make unauthenticated requests from the browser that intentionally receive 401 responses (e.g., sessionless checks). Logging these at WARN obscures real issues. Critical errors and other non-OK responses remain WARN/ERROR.

If you want to change behavior further:

- Sample 401s instead of logging every one (coalescing) — useful in high-traffic scenarios.
- Emit a metric/counter for unauthorized responses and alert on spikes instead of logging each occurrence.

Files changed:

- `src/lib/apiErrorHandler.ts`
- `src/lib/internalFetchClient.ts`
