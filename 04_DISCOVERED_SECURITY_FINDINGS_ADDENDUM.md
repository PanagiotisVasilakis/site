# Discovered Security Findings Addendum

This append-only record preserves findings discovered after the original production audit. It does not revise the original audit verdict.

## HIGH-AUTH-02 — Revoked session could be resurrected by refresh

- **Status:** Fixed in the working tree and checkpoint commit.
- **Original behavior:** A revoked session with an active refresh family returned HTTP 200 and valid replacement credentials.
- **Root cause:** The short-session and refresh-family authorization graphs were disconnected.
- **Resolution:** Generation-bound session/token pairing with atomic revocation and rotation.
- **Compatibility impact:** Legacy unbound generations require reauthentication.
- **Verification:** Revocation regression, natural expiry, wrong binding, rollback, family isolation, and 30 deterministic race repetitions.
- **Schema/migration impact:** None.

## HIGH-AUTH-03 — Claim bypassed portal temporal eligibility window

- **Status:** Fixed in the working tree and checkpoint commit.
- **Original behavior:** A booking starting in 30 days could be claimed and receive active portal authorization.
- **Root cause:** Claim consumption checked booking expiration but not the inclusive maximum start boundary.
- **Resolution:** One canonical temporal predicate shared by claim, login, refresh, and session-access verification.
- **Verification:** Inclusive/exclusive boundary matrix, new and existing users, both remember modes, inverted-booking selection regression, and three clean PostgreSQL runs.
- **Schema/migration impact:** None.

## HIGH-AUTH-04 — Time-based grace window masked completed refresh replay

- **Status:** Fixed in the working tree.
- **Original behavior:** A predecessor replay that began after a committed rotation returned `409 REFRESH_IN_PROGRESS` when it came from the same context within five seconds, leaving the replacement session/token and family active.
- **Root cause:** Same device/IP context plus `revokedAt` age was treated as proof of concurrency without database-observed transaction overlap.
- **Database-observed classification:** A transaction-scoped PostgreSQL advisory try-lock, keyed from the immutable predecessor generation UUID, proves actual contention before the canonical `User → RefreshTokenFamily` row-lock sequence. The preflight authorization state may deny the `409` shortcut but never authorizes rotation.
- **Completed-replay behavior:** A request that owns the generation marker and re-reads an already-revoked predecessor atomically revokes the family, its tokens, and paired sessions before returning non-enumerating `401` with both auth cookies cleared. Contended requests whose preflight is revoked or ambiguous also perform an authoritative fail-closed recheck and never return `409`.
- **Concurrency compatibility:** Genuine active, approved same-context overlap remains one `200` winner plus a cookie-free `409` loser. Different-context or invalid-binding contention enters a separate bounded cleanup transaction using only `User → RefreshTokenFamily`; whether the owner or cleanup obtains the User row first, no credential survives the security event. Independent families and generations remain isolated.
- **Verification:** Completed-replay timing matrix, 20 fresh-database same-context overlaps, 15 fresh-database different-context overlaps, post-commit replay contention, invalid-binding contention, family/generation isolation, owner rollback/retry, and existing PR-02A/PR-02C regressions.
- **Schema/migration impact:** None.

## HIGH-ABUSE-03 — Missing client identity shared one durable sensitive-limit bucket

- **Status:** Fixed by `PR-P0-D1A`; clean checkpoint verification is recorded in the task evidence.
- **Original behavior:** When client-IP resolution returned the `unknown` sentinel, the durable sensitive-operation limiter treated it as an ordinary identity, derived the same privacy-HMAC key for every unidentified caller, and wrote that shared key to `rate_limits`.
- **Security and availability impact:** A request without client identity could pass the first limiter decisions and reach a sensitive route, while repeated unidentified requests could exhaust the shared bucket and deny unrelated callers. This made the planned fail-closed ingress boundary capable of both pre-limit domain mutation and a cross-caller denial-of-service condition.
- **Root cause:** The sensitive limiter constructed `ip:${ip}` unconditionally and did not distinguish a canonical client IP from the `unknown` failure sentinel before hashing, importing Prisma, or writing persistence state.
- **Zero-write resolution:** Missing or invalid client identity raises the bounded internal `CLIENT_IDENTITY_UNAVAILABLE` condition before privacy-HMAC derivation, Prisma import, rate-limit persistence, session/refresh work, or other protected domain mutation. Route handling maps the condition to a generic, non-diagnostic `503` response.
- **Representative route/database verification:** Disposable PostgreSQL run `1f26a35a5093` created and migrated three independent clean databases. In each database, the missing-identity booking route returned a generic `503` while `rate_limits`, `stay_requests`, sessions, refresh tokens/families, outbox, privacy, and security-audit tables remained at zero rows; the canonical IPv4 control succeeded and created exactly one `rate_limits` row. The complete integration suite passed 10 files and 70 tests, and its exact disposable container was removed.
- **Related finding:** `HIGH-ABUSE-02` is closed by the subsequent trusted-ingress checkpoint described below.
- **Schema/migration impact:** None.

## HIGH-ABUSE-02 — Public forwarding headers could self-assert client identity

- **Status:** Fixed by the A2 trusted-ingress checkpoint.
- **Original behavior:** `TRUST_PROXY_MODE` and request-local resolver options allowed `CF-Connecting-IP`, `X-Real-IP`, or `X-Forwarded-For` to become the canonical limiter/session context without cryptographic proof that the request traversed the trusted local proxy. A direct caller could therefore bypass the intended D1A missing-identity denial by supplying a public header.
- **Root cause:** The application encoded hop/header selection but had no independently authenticated Nginx-to-application identity channel, while no versioned reverse-proxy, Cloudflare source allowlist, app-port isolation, or origin restriction specification existed.
- **Resolution:** Nginx accepts only checked-in Cloudflare IPv4/IPv6 source ranges, overwrites every public forwarding header, and injects one canonical private IP plus a private attestation. The application accepts identity only when the IP is a bounded canonical literal and the attestation matches a root-owned 32-byte secret in constant time. Missing, malformed, duplicate, or mismatched values enter the existing `CLIENT_IDENTITY_UNAVAILABLE` zero-write contract.
- **Defense in depth:** The host Node service binds `127.0.0.1:3000`; the release policy rejects public app-port publication, wildcard proxy trust, append-style canonical forwarding, missing header overwrite/AOP/runbook material, missing Nginx syntax tests, and certificate/key files. Live firewall, Cloudflare Full (strict), AOP, and dashboard state still require operator evidence.
- **Verification:** Public/private-header matrix, IPv4/IPv6 canonicalization, duplicate and port rejection, production secret validation, explicit diagnostic redaction, invalid-attestation zero-write regressions, a disposable digest-pinned Nginx overwrite/source-isolation test, release-policy mutation tests, and the real PostgreSQL integration suite.
- **Schema/migration impact:** None.

## Findings count

- **Original audit High findings:** 10.
- **Newly discovered High findings during production-faithful testing:** 5.
- **Total High findings discovered historically:** 15.
- **New findings closed by remediation:** 5.
- **Active High findings remaining:** 10 — the original High findings, subject to their later remediation and manual evidence.
