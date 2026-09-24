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
uses the zero-write `CLIENT_IDENTITY_UNAVAILABLE` path (see
[trusted ingress](trusted-ingress.md)).

Expired `rate_limits` rows are deleted by `runRetention` in the versioned
operations worker. Operators must verify the timer runs and alert on cleanup
age/table growth; the application must not create persistent limiter rows for
public reads.

## Administrator login source isolation

Administrator login has no anonymous, globally enforcing bucket. Until named
administrator identities exist, the authoritative budget is the privacy-HMAC
key of the verified source: five attempts in a fixed fifteen-minute window.
Saturating source A does not consume source B's budget, while A's sixth attempt
is still denied.

Public forwarding headers cannot select that source; the limiter requires the
private canonical IP and a valid proxy attestation. Credentials and
attacker-supplied administrator hints are never key material. Bounded
route/status counters keep a non-enforcing aggregate failure signal.
Named-identity progressive budgets and durable off-host alerting are future
work.

Code and deterministic route/PostgreSQL regressions establish this contract.
Manual evidence is still pending: run the A/B sequence through the staging
proxy topology, confirm forwarding-header spoofing is rejected there, and
observe the 401/429/success distributions.

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
