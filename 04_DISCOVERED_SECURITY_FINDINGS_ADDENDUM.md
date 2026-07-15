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

## Findings count

- **Original audit High findings:** 10.
- **Newly discovered High findings during production-faithful testing:** 3.
- **Total High findings discovered historically:** 13.
- **New findings closed by remediation:** 3.
- **Original active High findings remaining:** 10, subject to later remediation and manual evidence.
