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

## Findings count

- **Original audit High findings:** 10.
- **Newly discovered High findings during production-faithful testing:** 2.
- **Total High findings discovered historically:** 12.
- **New findings closed by this checkpoint:** 2.
- **Original active High findings remaining:** 10, subject to later remediation and manual evidence.
