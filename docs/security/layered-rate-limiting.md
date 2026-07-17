# Layered rate-limiting contract

The selected production topology is deliberately local and layered:

```text
Cloudflare Free (coarse abuse controls)
  -> Nginx (request-rate and connection controls)
  -> Next.js + PostgreSQL (authoritative sensitive-operation limits)
```

Upstash, Redis, Valkey, a Cloudflare Worker, and process-local authoritative
counters are not production dependencies. Public reads do not write limiter
state. They rely on the edge/proxy layers, safe caching, and bounded queries.

## Layer ownership

- Cloudflare supplies coarse network and abuse controls. Its API is not a
  readiness dependency.
- Nginx has separate `auth_operations`, `public_writes`, and `broad_api`
  request zones plus a per-client connection zone. The checked-in rates and
  bursts are observation defaults, not load-qualified production thresholds.
  `limit_req_dry_run on` and `limit_conn_dry_run on` must remain enabled until
  staging/load evidence and false-positive review approve a versioned change
  to enforcement. When enforcement is enabled, Nginx uses `429` for
  request/connection rejection.
- PostgreSQL is authoritative only for sensitive operations: administrator
  and guest authentication, claims, security-relevant refresh context,
  sensitive public writes, and privacy/security writes. Keys use the verified
  ingress identity and context-separated HMACs; raw credentials are never key
  material. All dimensions are updated in one transaction.

Confirmed PostgreSQL saturation returns a generic `429`. A PostgreSQL limiter
failure rolls back all limiter dimensions, returns a generic `503`, and must
occur before domain mutation. A `Retry-After` header is emitted only where the
layer has a deterministic reset contract. Missing or invalid client identity
continues to use the D1A zero-write `CLIENT_IDENTITY_UNAVAILABLE` path.

Expired `rate_limits` rows are deleted by `runRetention` in the versioned
operations worker. Operators must verify the timer runs and alert on cleanup
age/table growth; the application must not create persistent limiter rows for
public reads.

## Operational signals

Monitor bounded categories, never request bodies, credentials, raw header
chains, or high-cardinality route values:

- Cloudflare blocked and challenged request totals;
- Nginx passed, delayed, dry-run, and rejected totals by `auth`,
  `public_write`, and `broad_api` layer;
- application `429` and `503` totals by bounded operation category;
- PostgreSQL limiter latency and errors;
- limiter-table row count, key cardinality, oldest expired row, and cleanup
  age;
- authentication failures versus limiter denials; and
- reported false positives during qualification.

The repository does not select a monitoring vendor. Dedicated Redis/Valkey is
reconsidered only after measured PostgreSQL contention or a demonstrated
multi-instance throughput requirement, and requires a new reviewed ADR. It is
never introduced as a hidden readiness or per-request dependency.
