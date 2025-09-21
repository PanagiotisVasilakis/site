# Guest Portal & Check-in — Next Steps (Authoritative Roadmap)

Last updated: 2025-09-21

## Goals

- Returning guests can sign in quickly without re-verification where safe.
- Dynamic, robust verification: GR (AFM+phone) and Abroad (passport+phone), plus booking reference flow.
- Security, privacy, and observability hardened for production.

## High-priority (P1)

### 1. Returning Guest Persistence (Refresh Tokens)

- Add GuestRefreshToken storage (hashed) and rotation policy.
- Issue HttpOnly `guest_rt` cookie on successful verification (opt-in "Remember me").
- Add `/api/portal/refresh` to mint booking-scoped session from refresh when eligible (current/future booking).
- Add `/api/portal/logout` to revoke refresh + clear cookies.
- Auto-refresh: SSR reads `guest_rt` and silently restores session; rotate token.
- Tests: issue/rotate/replay/expired/revoked.

### 2. Verification Strategy #2 (Phone + Identity Window)

- Match by phone + AFM/passport within stay window when reference is missing.
- If multiple matches, select nearest upcoming or present chooser.
- Tests for tie-break and negative cases.

### 3. Rate-limit Hardening

- Progressive limits by IP and phone.
- Add audit logs for verification attempts (actor, outcome, reason, correlation id).

### 4. UX/i18n/a11y Polish

- i18n keys for current literals (arrival time invalid, saving, success toast); error summaries & focus management.
- Input masking/hints for phone and IDs; passport rules (per-country overrides with sane default).

## Medium-priority (P2)

### 5. Booking Confirmation Redirect Contract

- Implement `/api/bookings/:id/confirm` that mints session and 302 → `/{locale}/check-in?bookingId=…`
- Track `checkin_nav_shown` reason=booking_confirmed.

### 6. Nav Gating Consistency + Analytics

- Ensure header/footer/mobile menus use the same SSR flag; fire `checkin_nav_hidden` on signout/expiry.

### 7. DSAR & Retention

- Retention toggles for AFM/passport; purge tooling; DSAR export endpoints.

### 8. Dashboards & SLOs

- Funnel conversion/time-to-verify/error-rate charts; alert thresholds to match success criteria.

## Contracts & Schemas

- Cookie: `guest_rt` (HttpOnly; Secure; SameSite=Lax; Path=/; exp 30–90d) → rotates on refresh.
- `POST /api/portal/refresh` → 200: session minted | 204: no current/future booking | 401 invalid.
- `POST /api/portal/logout` → 204, revokes active refresh.
- Phone+identity match: select booking overlapping [now, future] with nearest start_date; else 404.

## Acceptance Criteria

- Return users continue seamlessly when valid refresh exists and booking is eligible.
- Verification flow supports reference+lastName and phone+identity window matching.
- Audit logs include correlation ids.
- Nav gating consistent across all menus; events emitted for shown/hidden/clicked.
- All new strings localized (EN/EL); a11y meets WCAG AA for added flows.

## Work Breakdown (Sequenced)

- Store: add GuestRefreshToken; audit log collection; passport rules config.
- Session: helpers for refresh cookie create/parse/clear; SSR auto-mint; security.
- APIs: refresh, logout, booking confirm; add phone+identity lookup.
- UI: remember-me option; i18n keys; input masking; error summary focus.
- Security: rate-limits and audit logs.
- Observability: metrics for refresh success/error; dashboards and alerts.

## Risks & Mitigations

- Token theft → rotate on use; device binding; IP/geo anomaly → additional checks.
- Over-matching bookings → conservative tie-break; require reference if ambiguity persists.
- SMS delivery issues → email magic link fallback.

## Tracking & Ownership

- Create tasks under this roadmap; each task must have tests and acceptance criteria.
