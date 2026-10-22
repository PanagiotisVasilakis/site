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
  and guest authentication, claims, guest session refresh (the `portal-refresh`
  limiter: 60 requests per 15 minutes on the client-address dimension only,
  checked only when a refresh cookie is present), sensitive public writes,
  and privacy/security writes. Keys use the verified
  ingress identity and context-separated HMACs; raw credentials are never key
  material. The client-address dimension keys an IPv4 client (including an
  IPv4-mapped IPv6 address) by its full address and an IPv6 client by its /64
  network, because one subscriber normally controls a whole /64; only the
  limiter groups addresses this way. All dimensions are updated in one
  transaction. A successful guest sign-in gives back its phone-number attempt
  (`refundSensitiveIdentifierAttempt`), so only failed attempts count against
  an account; the client-address dimension keeps counting every attempt. A
  correct administrator token gives back its attempt on the address row
  (`refundAdminLoginAttempt`, see "Administrator login source isolation").

Confirmed PostgreSQL saturation returns a generic `429`. A PostgreSQL limiter
failure rolls back all limiter dimensions, returns a generic `503`, and must
occur before domain mutation. A `Retry-After` header is emitted only where the
layer has a deterministic reset contract. Missing or invalid client identity
uses the zero-write `CLIENT_IDENTITY_UNAVAILABLE` path (see
[trusted ingress](trusted-ingress.md)).

Guest sign-in (`POST /api/portal/sessions`) runs one cost-12 bcrypt comparison
for every well-formed phone number, whether or not the number has an account, so
that the response time does not reveal which numbers do. Each comparison holds
one thread of Node's libuv pool (four threads by default) for about 0.2 s on a
current CPU. The PostgreSQL limiter bounds these comparisons per client address
(five per 15 minutes for an IPv4 address or an IPv6 /64) and per phone number,
not globally; a flood spread over many addresses is left to Cloudflare and, once
enforcement is approved, to the Nginx `auth_operations` zone.

Expired `rate_limits` rows are deleted by `runRetention` in the versioned
operations worker. Operators must verify the timer runs and alert on cleanup
age/table growth; the application must not create persistent limiter rows for
public reads.

## Administrator login source isolation

Administrator login has no anonymous, globally enforcing bucket. Until named
administrator identities exist, the authoritative budget is the privacy-HMAC
key of the verified source (the full IPv4 address, or the IPv6 /64, see above):
five attempts in a fixed fifteen-minute window. Only wrong tokens count: a
correct token gives its attempt back (`refundAdminLoginAttempt` in
`src/lib/auth/adminLoginBudget.ts`, a PostgreSQL update of the same row that
never reopens a spent window), so an operator who signs in repeatedly is not
locked out while every wrong guess keeps counting. Saturating source A does not
consume source B's budget unless both are IPv6 addresses in one /64, while A's
sixth attempt is still denied with `429` in the shared API error envelope and a
`Retry-After` header for the rest of the window.

Public forwarding headers cannot select that source; the limiter requires the
private canonical IP and a valid proxy attestation. Credentials and
attacker-supplied administrator hints are never key material.

Every administrator login attempt that the limiter admits (a correct one included),
and the first refusal of each window, is stored as a security audit event (`security_audit_events`, path `/api/admin/login`, written by
`src/app/api/admin/login/route.ts`):

| Event type | Severity | When | `details` |
| --- | --- | --- | --- |
| `admin.login_succeeded` | `low` | the secret matched and the admin session exists | `adminSessionId` |
| `admin.login_failed` | `medium` | an attempt the limiter admitted, with the wrong secret (`401`) | `remainingAttempts` |
| `admin.login_rate_limited` | `medium` | an attempt the limiter refused (`429`) | `limit` (5), `windowMinutes` (15), `windowEndsAt` |

A row holds the correlation id and the keyed hash of the verified client address
that all security events share (the privacy HMAC of the canonical address, never
the address and never a forwarding header). The submitted secret, its length and
any part of it are neither stored nor logged. A refusal is stored once per limiter
window and bucket, however many requests are refused: the event id derives from
the end of the window, so the primary key drops the repeats and the limiter table
gets no extra row (two buckets whose windows end in the same millisecond share one
refusal event). A source therefore writes at most five `admin.login_failed`
events and one refusal event per window. `admin.login_succeeded` events are not
bounded by the limiter, because a correct token is refunded; they need the
administrator secret. A flood from many sources is left to Cloudflare and Nginx,
as for the guest sign-in limiter. A request that ends before the
limiter (login disabled, invalid or oversized body, no attested client address,
limiter store failure) writes no event. The write is best effort: a failure is
logged (`Admin login audit event could not be stored`) and never changes the
answer.

None of the three events is `high`, and the only security alert rule ("Recent
high-severity security events", `src/lib/operationalMonitor.ts`) counts `high`
and `critical` events, so a guessing run or an internet scan opens no alert and
nothing counts these events as a metric. `runRetention` deletes security events
90 days after they occurred, whatever their type. The answers `401` and `429`
also appear as the info log line `API request completed` with that status in the
application log, and the Nginx access log (`origin_safe` format, `$status` field)
records that status too.
Named-identity progressive budgets and durable off-host alerting are future
work.

Code and deterministic route/PostgreSQL regressions (the events:
`tests/security/admin-login-audit.test.ts`; the source isolation:
`tests/security/admin-rate-limit-isolation.test.ts` and
`tests/integration/security/admin-rate-limit-isolation.test.ts`) establish this
contract.
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
- authentication failures versus limiter denials (for the administrator login the
  `admin.login_failed` and `admin.login_rate_limited` events); and
- reported false positives during qualification.

The repository does not select a monitoring vendor. Dedicated Redis/Valkey is
reconsidered only after measured PostgreSQL contention or a demonstrated
multi-instance throughput requirement, and requires a new reviewed ADR. It is
never introduced as a hidden readiness or per-request dependency.
