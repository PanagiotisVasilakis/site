# Guest Data Cache Diagnostics

The guest data caching layer that backs `guestStore.getAll*` has an associated diagnostics
endpoint that surfaces cache health and dataset version telemetry.

## Endpoint

```
GET /api/internal/cache-metrics
```

* **Authentication** – requires an API key accepted by the API security middleware.
  Provide the key via either the `Authorization: Bearer <key>` header or the `X-API-Key`
  header. Valid keys are configured through the `VALID_API_KEYS` environment variable.
* **Caching** – responses are not cacheable (`Cache-Control: no-store, private`).
* **Format** – JSON payload containing the current cache metrics and dataset snapshots.

Example request using `curl`:

```
curl -H "Authorization: Bearer $VALID_API_KEY" \
     https://<hostname>/api/internal/cache-metrics
```

## Response Schema

```
{
  "generatedAt": "2024-04-24T09:40:18.512Z",
  "cache": {
    "hits": 12,
    "misses": 4,
    "invalidations": 7,
    "entries": {
      "bookings": {
        "cached": true,
        "version": "42:1713951378512",
        "rowCount": 42,
        "latestChange": "2024-04-24T09:36:05.102Z",
        "fetchedAt": 1713951378512,
        "size": 42
      },
      "users": { "cached": false, ... },
      ...
    }
  },
  "datasets": {
    "bookings": { "version": "42:1713951378512", "rowCount": 42, ... },
    ...
  }
}
```

* `cache.entries[*].cached` indicates whether a dataset is currently cached in-memory.
* `cache.entries[*].version` combines the row count and latest timestamp used to validate
  cached data. When the underlying dataset changes, the version changes.
* `datasets` reflects fresh snapshots collected at request time and can be compared with
  cached versions to debug staleness.

## Operational Guidance

* Call the diagnostics endpoint when investigating mismatches between exports and database
  state. A high miss count accompanied by infrequent invalidations may signal heavy churn
  or dataset version drift.
* Each mutation pathway within `guestStore` (user creation, booking linkage, onsite
  registration, etc.) invalidates the relevant datasets automatically. If you add new
  mutation logic touching these tables, be sure to invalidate the appropriate keys to keep
  the cache consistent.
