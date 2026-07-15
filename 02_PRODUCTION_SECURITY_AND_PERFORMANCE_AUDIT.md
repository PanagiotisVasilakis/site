# Production Security and Performance Audit

**Repository:** `qr-city-guide`

**Audit date:** 2026-07-15

**Audit mode:** Strictly read-only review of the current checkout. No application code, dependency, schema, migration, environment, database, payment, email, or production resource was changed.

**Architecture guide used:** `01_SYSTEM_ARCHITECTURE_AND_REPOSITORY_MAP.md`, fully read and then independently checked against the live checkout.

**Runtime used for safe static checks:** Node `v22.19.0`, npm `11.18.0`.

**Git state at audit start:** `main...origin/main`; the architecture report was already untracked. This report is the only file created by this stage.

## 1. Executive summary

The codebase has several strong foundations: database-backed guest and admin sessions, explicit JWT algorithm checks, rotating refresh-token families with replay revocation, one-time HMAC-digested claim grants, consistent Prisma parameterization, bounded JSON parsing, strict payload schemas on sensitive routes, production CSP/HSTS/CORS controls, distributed rate limiting as a production environment requirement, durable outbox delivery, hardened systemd/container definitions, and clean static/test/dependency gates.

No confirmed Critical vulnerability was found in the reviewed checkout. Production approval is nevertheless blocked by ten High findings, two of which are release-evidence gaps that require environment/infrastructure verification:

- the administrator security boundary is a single shared bearer secret, without individual operator identity or MFA;
- an unauthenticated actor can lock every administrator out of the login endpoint with five attempts per 15-minute window;
- booking claim bearer tokens are deliberately retained in URL query strings;
- the all-environment migration runner mutates production before staging;
- a major migration combines data rewrites, enum/table renames, new constraints/indexes, and destructive drops in one non-rolling-compatible transaction;
- application metrics/traces and Edge security/rate-limit metrics are process-local or no-op, and application errors have no repository-integrated external error sink;
- there is no automated CI/release gate in the repository;
- critical database/auth/outbox/privacy/migration flows lack real integration or end-to-end coverage;
- no repository evidence proves automated backup/PITR and recent restore testing;
- the current production build, runtime startup, dependency services, and migration rehearsal were intentionally not executed under this read-only audit and remain release evidence gaps.

The clean 176-test suite and static gates are meaningful but do not compensate for these production-control gaps. The system is suitable for controlled staging after using isolated staging credentials and data, but it is not ready for production traffic or production migrations.

## 2. Production verdict

### READY FOR CONTROLLED STAGING

This verdict means:

- **Allowed:** isolated staging deployment with synthetic/non-sensitive data, staging-only secrets, staging Redis, staging webhook receivers, and explicit operational supervision.
- **Not approved:** production launch, production database migration, production PII processing, or treating current monitoring/backup evidence as sufficient.
- **Promotion condition:** all High findings must be closed or explicitly risk-accepted by accountable owners, and all High manual-verification items must have recorded passing evidence.

Reasons this is not `READY FOR LIMITED PROD` or `READY FOR PROD`:

1. the admin authentication and lockout model creates both compromise and availability risks;
2. the claim credential transport can expose a booking activation capability;
3. the migration order and destructive migration design do not provide a safe staging gate or rolling rollback path;
4. production detection, CI enforcement, backup recovery, live dependency, build, and migration-rehearsal evidence is incomplete.

## 3. Critical and High findings

### Critical findings

No Critical finding was confirmed from the current source tree. This does not mean the deployed environment is free of Critical risk; production secrets, network controls, cloud IAM, database grants, backup integrity, and live service configuration were outside direct verification.

### HIGH-AUTH-01 — Shared-secret admin identity has no individual identity, MFA, or operator attribution

- **Location:** `src/app/api/admin/login/route.ts:9-44`; `src/lib/auth/admin.ts:13-20,52-82,84-135`; `src/lib/rbac.ts:4-8`; `prisma/schema.prisma:197-208`.
- **Real issue:** all administrators authenticate by presenting the same `ADMIN_DASH_SECRET`. The resulting JWT and `AdminSession` identify only a session, not a human/operator account. There is no MFA challenge, per-user credential, role separation, or durable actor identity attached to sensitive actions.
- **Failure/attack scenario:** the shared secret is copied into an insecure channel, browser/password manager, shell history, or former operator's possession. The holder can create a fully privileged session, export guest PII, issue booking claim tokens, change feature flags/preferences, and execute privacy erasures. Audit records cannot reliably attribute the action to a specific operator.
- **Impact:** complete administrative compromise, sensitive-data exposure, destructive privacy actions, weak non-repudiation, and no targeted revocation of one administrator without rotating the shared secret for everyone.
- **Confidence:** **Confirmed**.
- **Recommended direction:** move the production admin boundary to individual identities with phishing-resistant MFA, least-privilege roles, named-session audit attribution, lifecycle/revocation controls, and emergency access separated from routine administration.
- **Verification:** create two test operators in staging; prove distinct identities/MFA, per-operator revocation, role denial, and actor IDs on every sensitive audit event. Confirm the shared secret is no longer accepted for normal production login.

### HIGH-ABUSE-01 — Five anonymous requests can lock out every administrator

- **Location:** `src/app/api/admin/login/route.ts:22-30`; `src/lib/sensitiveRateLimit.ts:28-35,38-69`.
- **Real issue:** every admin login attempt increments both an IP key and the same global identifier key derived from the literal `admin`. Access is allowed only when every key remains within the limit of five. The identifier key is therefore shared by all users and all source IPs.
- **Failure/attack scenario:** an unauthenticated attacker submits five invalid tokens. The global `identifier:admin` record reaches the limit; the sixth request from the legitimate administrator, even from another IP, receives 429. The attacker can repeat this every window.
- **Impact:** trivial, remotely repeatable denial of all administrative access for 15-minute windows, including during incidents.
- **Confidence:** **Confirmed** from the key construction and route configuration.
- **Recommended direction:** use a limiter design that cannot turn an anonymous global identifier into a universal lock, while preserving per-source abuse resistance and adding controlled backoff/alerting for the real admin identity system.
- **Verification:** in isolated staging, send five failed requests from source A and then perform a valid login from source B. The valid login must remain possible while the abusive source is constrained and the event is alerted.

### HIGH-WEB-01 — One-time booking claim credentials are retained in URL query strings

- **Location:** `src/app/[locale]/guest/UnifiedGuestClient.tsx:20-30,48-72,85-105`; `src/lib/portalAuthService.ts:44-85,88-115`; `src/lib/security-config.ts:193-201`.
- **Real issue:** the client intentionally reads `?claim=...`, stores the bearer token in state, and writes it back into the URL with `router.replace`. The token authorizes activation of an unclaimed booking and remains valid for up to 30 minutes until consumed/revoked.
- **Failure/attack scenario:** the URL is retained in browser history, copied in screenshots/support messages, captured by reverse-proxy/access logs, or sent as the full same-origin `Referer`. A party obtaining the still-valid URL can claim the booking with a new phone/password when no existing account owns that phone.
- **Impact:** unauthorized booking activation and access to the booking-scoped guest portal, check-in data, and time-windowed property information.
- **Confidence:** **Confirmed**. Actual proxy/browser/log exposure is deployment-dependent, but placing and retaining the bearer capability in the URL is explicit.
- **Recommended direction:** transfer the capability through a channel that does not persist it in URLs/logs/history, or consume it immediately into a short-lived server-side flow state and remove it from the address bar before other requests/navigation.
- **Verification:** exercise the complete staging claim flow and inspect browser history, address bar, server/reverse-proxy logs, analytics, error reports, and `Referer` headers. No reusable claim credential should appear after initial handoff.

### HIGH-MIG-01 — The multi-environment migration runner executes production before staging

- **Location:** `scripts/run-prisma-migrations.ts:26-52,139-217,230-237`; `package.json:15-17`.
- **Real issue:** `ENVIRONMENTS` is ordered `prod`, then `staging`, and `main()` executes that list sequentially. Staging therefore cannot act as a pre-production migration gate for this command.
- **Failure/attack scenario:** a migration is incompatible with real data or the deployed binary. `npm run prisma:migrate:deploy:all` applies it to production successfully or partially encounters runtime consequences before staging is even attempted. A later staging failure cannot protect production.
- **Impact:** production-first schema mutation, outage/data risk, and invalid release sequencing.
- **Confidence:** **Confirmed**.
- **Recommended direction:** make staging rehearsal and verification a hard prerequisite to a separately authorized production migration; avoid one command that holds both environment credentials and automatically crosses the promotion boundary.
- **Verification:** use disposable databases and command tracing to prove staging is migrated, validated, and explicitly approved before any production command can start; prove production credentials are absent from staging jobs.

### HIGH-MIG-02 — Destructive migration is not rolling-deployment or rollback compatible

- **Location:** `prisma/migrations/20260714150000_trustworthy_portal_and_operations/migration.sql:1-58,60-188,325-345`; `prisma/migrations/20260715110000_remove_unused_legacy_models/migration.sql:1-39`; `docs/deployment-migration-rehearsal.md:55-77,101-107`.
- **Real issue:** one transaction performs preflight checks, data backfills, enum-value and table renames, column/type changes, index replacement, foreign-key changes, and immediate drops of legacy tables/columns. The later cleanup migration drops old MFA/cache structures. Old and new application versions cannot be assumed schema-compatible during a rolling deployment, and rollback depends on database restore/reconstruction rather than a compatible down path.
- **Failure/attack scenario:** old instances remain alive while the migration renames/drops structures, or the new binary fails after the schema commits. Old instances error against the new schema; rolling back only the binary cannot restore service.
- **Impact:** deployment outage, inability to perform a fast application rollback, and elevated data-recovery risk.
- **Confidence:** **Confirmed** for destructive/non-compatible DDL; exact outage likelihood depends on deployment topology and database contents.
- **Recommended direction:** use expand-and-contract releases with explicit compatibility windows, preflight/backfill phases, delayed destructive cleanup, and a rehearsed restore/forward-fix decision path.
- **Verification:** run old and new binaries concurrently against a disposable production-size database through every deployment phase; prove both versions work until old instances are drained and prove rollback/restore time objectives.

### HIGH-REL-01 — Production observability is process-local, no-op at Edge, and not connected to an external error sink

- **Location:** `src/lib/metrics-lite.ts:1-17`; `src/lib/distributed-tracing-lite.ts:28-64`; `src/lib/metrics-collector.ts:104-145,158-176`; `src/lib/distributed-tracing.ts:15-35,65-112,115-177`; `src/lib/logger-enterprise.ts:279-314`; `src/lib/prisma.ts:41-111`; `src/lib/security-middleware-edge.ts:175-233`; `src/lib/operationalMonitor.ts:16-59,68-108`.
- **Real issue:** Edge counters/timers are explicit no-ops; Node metrics and spans are bounded in-process maps with no exporter; the enterprise logger writes only to console; and the source tree has no Sentry/APM/log-aggregation integration. Database operational alerts cover only dead/stale outbox and recent high-severity security events. Proxy rate-limit backend failure counters disappear in the no-op Edge sink.
- **Failure/attack scenario:** an instance experiences rising latency, Prisma errors, 503 rate-limit failures, or auth abuse. Data is split across process memory and journald, disappears on restart, and may never trigger an off-host page. Multiple instances expose inconsistent metrics.
- **Impact:** delayed detection/triage, incomplete incident evidence, misleading dashboards, and inability to correlate failures across instances.
- **Confidence:** **Confirmed** for repository behavior. An external platform may collect stdout/network metrics, but no such integration was available for verification.
- **Recommended direction:** establish durable centralized logs, metrics, traces, and error reporting with off-host alert delivery, instance/service identity, SLOs, and tested paging. Keep DB business/security alerts as a complementary signal, not the sole detection path.
- **Verification:** generate controlled 5xx, slow-query, Redis-unavailable, outbox-dead, and auth-abuse events in staging; prove they appear centrally with correlation IDs and cause a timely off-host alert after an instance restart.

### HIGH-DEPLOY-01 — No automated CI or protected release gate exists in the repository

- **Location:** `.github/` contains only `dependabot.yml` and `copilot-instructions.md`; `.github/copilot-instructions.md:29-43` explicitly describes manual validation; `package.json:24-59` defines gates but does not enforce them remotely.
- **Real issue:** the repository intentionally has no GitHub Actions workflow or equivalent versioned pipeline definition. Passing tests locally does not prove every pushed/merged/released commit passed the same checks.
- **Failure/attack scenario:** a change is merged or deployed without tests, security lint, dependency audit, build, schema validation, or migration rehearsal. A local environment discrepancy or skipped command becomes a production regression.
- **Impact:** uncontrolled release quality, weak provenance, and preventable security/reliability regressions.
- **Confidence:** **Confirmed** for the repository. Branch protection or an external CI system was not accessible and requires manual verification.
- **Recommended direction:** enforce reproducible, mandatory, least-privilege CI and deployment promotion gates with protected branches, immutable artifacts, dependency/security checks, and recorded approvals.
- **Verification:** inspect repository/organization rules and external pipelines; prove a deliberately failing test/build/security check blocks merge and production promotion.

### HIGH-TEST-01 — Critical stateful workflows lack real database integration and end-to-end tests

- **Location:** `tests/` has 14 test files; `vitest.config.ts:12-24,25-73`; compare untested `src/lib/portalAuthService.ts`, `src/lib/prisma-repositories/refreshTokenRepository.ts`, `src/lib/bookingOutbox.ts`, `src/lib/privacyService.ts`, `scripts/run-prisma-migrations.ts`, and most `src/app/api/**/route.ts`.
- **Real issue:** the 176 passing tests are primarily unit/static-contract tests with mocked Prisma. Coverage is restricted to an explicit allowlist that excludes the claim transaction, refresh rotation repository, outbox leasing/retry, privacy erasure, admin login route, destructive migrations, and most API routes. No live Postgres integration suite or browser end-to-end suite exists in the repository.
- **Failure/attack scenario:** a transaction isolation bug, partial unique-index mismatch, migration/data-shape failure, refresh replay race, outbox lease race, authorization regression, or erasure failure passes all current tests.
- **Impact:** high-risk regressions can be released despite green test/coverage gates.
- **Confidence:** **Confirmed** from test inventory and coverage configuration.
- **Recommended direction:** add production-faithful Postgres integration, migration, concurrency, and end-to-end security tests for the critical workflows, and make coverage represent those paths instead of only an allowlist.
- **Verification:** demonstrate tests that fail under intentionally broken claim atomicity, admin auth, subject authorization, refresh replay, outbox leasing, erasure, migration preflight, and old/new schema compatibility.

### HIGH-OPS-01 — Backup/PITR and restore readiness are documented but not evidenced

- **Location:** `docs/deployment-migration-rehearsal.md:13-33,77-107`; no versioned backup job/provider configuration was found in `deploy/`, `scripts/`, or `.github/`.
- **Real issue:** the repository documents taking and checking a dump, but contains no evidence that production has scheduled backups/PITR, encryption/retention controls, isolated backup credentials, alerting, or a recent timed restore test.
- **Failure/attack scenario:** a destructive migration, operator error, provider failure, or data corruption occurs and the available backup is missing, stale, corrupt, or too slow to meet recovery objectives.
- **Impact:** prolonged outage or irreversible loss of booking, guest, check-in, privacy, and audit data.
- **Confidence:** **Needs verification**; these controls may exist entirely in the hosting platform.
- **Recommended direction:** establish owned RPO/RTO, automated encrypted backups/PITR, cross-failure-domain retention, access controls, monitoring, and recurring restore drills.
- **Verification:** review provider configuration and audit logs, then restore a recent production-format backup into an isolated environment and record completeness, RPO, RTO, and application validation results.

### HIGH-DEPLOY-02 — Current production artifact and live dependency behavior were not verified

- **Location:** `package.json:22-27,55-59`; `scripts/validate-security.ts:170-183`; `scripts/system-orchestrator.sh:35-72`; `docker/Dockerfile.security:1-62`; `src/app/api/health/ready/route.ts:13-53`.
- **Real issue:** by audit constraint, no production build, Docker build/scan, production-like startup, live Postgres/Redis/webhook check, migration deploy, or runtime health/security-header test was executed. Static success cannot establish deployability.
- **Failure/attack scenario:** generated assets, standalone packaging, runtime env validation, native modules, database permissions, Redis connectivity, reverse-proxy identity, or CSP/runtime behavior fails only in the production artifact/environment.
- **Impact:** failed deployment, immediate 503s, broken rate limiting, unavailable APIs, or security policy drift.
- **Confidence:** **Needs verification**.
- **Recommended direction:** produce an immutable artifact in a controlled pipeline and exercise it in production-equivalent staging with real dependency classes and synthetic data before promotion.
- **Verification:** execute the commands in section 16 against staging, archive logs/artifact digest/SBOM/scan results, and verify liveness, readiness, representative APIs, headers, auth, outbox, and rollback.

## 4. Authentication review

Strong confirmed controls:

- Guest JWT verification pins `HS256`, contains identifiers rather than PII, and is checked against an active database session plus booking ownership, verified status, and access dates (`src/lib/guestSession.ts:9-15,28-47,83-120`).
- Refresh tokens use random composite tokens, salted+peppered hashes, absolute family expiry, rotation, conditional revocation, and family revocation on replay (`src/lib/prisma-repositories/refreshTokenRepository.ts:69-88,138-203,229-360`).
- Claim tokens are 256-bit random values stored as HMAC digests, expire, are one-time, and are consumed in a serializable transaction with retry (`src/lib/portalAuthService.ts:25-35,44-85,88-208`). Existing password-bearing accounts require the existing password during a new booking claim (`:116-128`).
- Admin JWTs pin `HS256` and require a live, non-revoked database session with sliding two-hour and absolute 24-hour expiry (`src/lib/auth/admin.ts:52-82,84-135`).
- Auth cookies are `HttpOnly`, `Secure` in production, and SameSite Lax for guest / Strict for admin (`src/lib/guestSession.ts:131-185`; `src/app/api/admin/login/route.ts:46-55`).

Related High findings: `HIGH-AUTH-01`, `HIGH-ABUSE-01`, and `HIGH-WEB-01`.

### MED-AUTH-01 — Guest password policy is only length-based

- **Location:** `src/app/api/portal/claims/route.ts:15-22`; `src/app/api/portal/sessions/route.ts:15-19`; `src/lib/portalAuthService.ts:8-10,99-100`.
- **Real issue:** passwords permit any 8–128-character string; there is no compromised-password check or evidence of password-strength evaluation. Bcrypt cost 12 protects stored hashes but does not prevent common/reused passwords.
- **Scenario:** a guest chooses a common eight-character password that is guessed within the account's allowed attempts or reused from a breach.
- **Impact:** account/booking portal compromise; targeted account lockout is also possible because identifier limits are keyed by phone.
- **Confidence:** **Confirmed**.
- **Recommended direction:** use a modern length-first password policy with compromised-password screening and user guidance; retain rate limits without creating easy targeted lockouts.
- **Verification:** test common/breached/long passwords and confirm safe rejection, non-enumerating responses, and acceptable bcrypt latency under concurrency.

### MED-AUTH-02 — Login failures and sensitive rate-limit blocks are not durably audited

- **Location:** `src/app/api/admin/login/route.ts:22-35`; `src/app/api/portal/sessions/route.ts:41-56`; `src/app/api/portal/claims/route.ts:33-59`; `src/lib/sensitiveRateLimit.ts:38-69`; compare `src/lib/api-security-middleware.ts:115-129`.
- **Real issue:** admin/guest credential failures and sensitive limiter denials return errors but do not emit the durable security events used by operational monitoring. The declared `auth_failure` and `rate_limit_exceeded` event types are not used for these routes.
- **Scenario:** credential stuffing or repeated targeted lockout occurs without a searchable, durable security trail or an alert rule receiving the relevant event.
- **Impact:** delayed detection and incomplete forensic evidence.
- **Confidence:** **Confirmed**.
- **Recommended direction:** record privacy-preserving, correlated auth outcomes and limiter blocks with bounded cardinality, retention, and alert thresholds.
- **Verification:** trigger failures/blocks in staging and prove durable events and off-host alerts without storing credentials, raw phone numbers, or raw IPs.

### LOW-AUTH-01 — Authenticated session status returns an undefined booking ID

- **Location:** `src/app/api/portal/sessions/route.ts:21-30`; `src/lib/guestSession.ts:9-15`.
- **Real issue:** the response reads `session.booking_id`, but the payload shape is `session.booking?.id`.
- **Scenario:** a client calls the authenticated GET status endpoint and receives no booking ID despite a valid session.
- **Impact:** API contract/runtime correctness defect; authorization itself remains checked.
- **Confidence:** **Confirmed**.
- **Recommended direction:** align the response with the typed payload and contract tests.
- **Verification:** issue a valid guest session and assert the GET response returns the actual booking ID.

## 5. Authorization review

No confirmed IDOR or privilege-escalation path was found in the reviewed routes.

- Guest check-in, arrival-request, preferences, DSAR, and export paths validate the live guest session and derive the subject/booking from that session.
- Admin APIs consistently call `isAdminRequest()` or `verifyAdminSession()` before PII reads and mutations.
- DSAR subject query parameters are rejected for non-admin callers and `requireSubjectOrAdmin()` rechecks ownership (`src/app/api/dsar/export/route.ts:17-45`).
- Admin claim grants require a live admin session and the claim transaction records the issuing admin session (`src/app/api/admin/bookings/[id]/claim-grants/route.ts:18-38`; `src/lib/portalAuthService.ts:44-82`).

Residual risk is dominated by the coarse single-admin role described in `HIGH-AUTH-01`: once authenticated, the operator has every administrative capability. Manual route-by-route DAST remains required because most routes lack integration/E2E coverage (`HIGH-TEST-01`).

## 6. Input handling and web security

Strong confirmed controls:

- `readJsonBody()` enforces content type, declared and streamed byte limits, abort handling, UTF-8 decoding, and JSON parsing (`src/lib/apiErrorHandler.ts:479-537`).
- Sensitive route bodies are bounded and validated with Zod; high-risk objects commonly use `.strict()`.
- Prisma queries use parameterized APIs/tagged templates. The only reviewed unsafe SQL calls use fixed strings for transaction-local timeouts/readiness (`src/app/api/health/ready/route.ts:15-25`; `src/lib/security-monitoring.ts:70-87`). No user-controlled SQL interpolation was found.
- Production security config enforces CSP with request nonces, HSTS, frame denial, MIME sniffing protection, strict referrer policy, Permissions Policy, and explicit CORS handling (`src/lib/security-config.ts:169-243`; `src/lib/security-middleware-edge.ts:99-171,313-400`).
- Local redirect handling rejects cross-origin and encoded-separator tricks (`src/lib/safeLocalPath.ts:1-29`).
- JSON-LD uses a dedicated serializer and request nonce; public API docs escape HTML before interpolation.
- No file-upload surface was found.

Related High finding: `HIGH-WEB-01`.

### MED-WEB-01 — Incoming alert webhook has no freshness or replay/idempotency control

- **Location:** `src/app/api/alerts/webhook/route.ts:9-27,30-61`; `prisma/schema.prisma:271-283`.
- **Real issue:** a static bearer token authenticates the request, but supplied timestamps are not checked against a freshness window and external alert IDs are not unique in storage. Every valid replay creates a new audit event.
- **Scenario:** a captured legitimate webhook request is replayed repeatedly, or a leaked long-lived token is used from distributed IPs to generate misleading events and storage/alert noise.
- **Impact:** audit pollution, operational confusion, and bounded but repeatable database write amplification.
- **Confidence:** **Confirmed**.
- **Recommended direction:** use signed requests with timestamp/freshness, replay-safe event IDs, rotation, and source-specific authentication.
- **Verification:** replay the same staging webhook and verify only one event is accepted; submit stale/future timestamps and invalid signatures and verify rejection/audit behavior.

## 7. Abuse resistance and rate limiting

Production startup correctly requires Redis/Upstash for the proxy-wide limiter and fails closed when the backend or trustworthy client identity is unavailable (`src/lib/runtime-env-schema.js:119-126,152-161`; `src/lib/security-middleware-edge.ts:186-236`). Sensitive operations also use a PostgreSQL-backed atomic limiter (`src/lib/sensitiveRateLimit.ts:38-69`).

Related High finding: `HIGH-ABUSE-01`.

### MED-ABUSE-01 — One shared IP bucket covers every API route

- **Location:** `src/lib/security-config.ts:216-221`; `src/lib/security-middleware-edge.ts:175-194,205-236,293-309`.
- **Real issue:** the production global limit is 100 requests per 15 minutes and its key contains namespace+IP but no route/method/risk class. Every API request from the same public IP consumes the same bucket before route logic runs.
- **Scenario:** guests behind hotel/mobile/corporate NAT, or one noisy browser, consume the bucket and block unrelated login, booking, telemetry, admin, and internal API calls from that public IP for the remainder of the window.
- **Impact:** false-positive denial and cross-endpoint noisy-neighbor behavior; a local attacker sharing NAT can disrupt others.
- **Confidence:** **Confirmed** for keying/threshold; real-user impact requires traffic measurement.
- **Recommended direction:** partition limits by route/risk class and authenticated identity where available, retain separate abuse-wide controls, and size thresholds from measured legitimate traffic.
- **Verification:** replay a production-like page/API journey from shared-IP load clients and measure 429s; prove noisy telemetry cannot exhaust authentication/operational budgets.

## 8. Secrets and dependency security

Confirmed positive evidence:

- `.env*` files are ignored and only `.env.example` is tracked (`.gitignore:34-36`). No tracked private-key/common-token signature was found by the limited current-tree pattern scan.
- Production runtime validation requires HTTPS site origin, explicit trusted proxy topology, independent JWT/pepper secrets, Redis rate limiting, and webhook tokens when webhook URLs are configured (`src/lib/runtime-env-schema.js:31-163`).
- Docker uses a digest-pinned base image and a non-root, read-only runtime filesystem (`docker/Dockerfile.security:1-18,27-60`). Systemd units apply strong sandboxing (`deploy/systemd/qr-city-guide.service:7-40`).
- `npm audit --audit-level=moderate` returned **0 vulnerabilities** on 2026-07-15. The license allowlist check passed.
- Dependabot is configured weekly for npm and Docker (`.github/dependabot.yml:1-55`).

### MED-SEC-01 — Repository secret checks are not a comprehensive current-tree/history scanner

- **Location:** `scripts/validate-security.ts:35-75,141-168`; `SECURITY.md:34-37`.
- **Real issue:** the built-in check examines three env filenames and a short fixed list of secret files. It does not scan every tracked blob, full Git history, entropy/signature patterns, deleted files, or commit metadata. `SECURITY.md` asks operators to run such a scan, but no tool/config/pipeline enforces it.
- **Scenario:** a credential committed under an unexpected filename or removed from the latest tree remains retrievable from Git history while the repository check passes.
- **Impact:** credential compromise and false confidence in the deployment gate.
- **Confidence:** **Confirmed** for scanner scope; whether history contains a secret is **Needs verification**.
- **Recommended direction:** enforce a maintained secret scanner on current tree, history, pushes/PRs, and release artifacts, with rotation procedures for findings.
- **Verification:** run an approved history-aware scanner against all refs and review findings without printing secret values into logs.

### LOW-ENV-01 — Required encryption/session secrets have no runtime consumer

- **Location:** `src/lib/runtime-env-schema.js:39-43`; `scripts/system-orchestrator.sh:462-473`; repository-wide usage shows `SECURITY_ENC_KEY_HEX`, `SECURITY_ENC_KEY_HEX_PREVIOUS`, and `SESSION_SECRET` only in validation/bootstrap documentation.
- **Real issue:** production refuses startup without secrets that do not protect any current data/session path, while comments imply encryption/key rotation support that is not implemented.
- **Scenario:** operators rotate or recover these values believing data depends on them, or production startup fails because an unused secret is missing.
- **Impact:** configuration drift, operational confusion, and misleading security posture.
- **Confidence:** **Confirmed** from current-tree references.
- **Recommended direction:** make the environment contract match real cryptographic consumers and document actual rotation consequences.
- **Verification:** generate a runtime configuration-consumer map and prove every required secret has an exercised purpose and rotation test.

### INFO-DEP-01 — Several dependencies have newer major releases

- **Location:** `package.json:79-150`; live `npm outdated` output.
- **Finding:** current versions satisfy the lockfile and have no audited vulnerability, but newer majors exist for `@types/node`, `@types/spdx-expression-parse`, ESLint, `eslint-plugin-security`, Framer Motion, Puppeteer, React Day Picker, Sharp, TypeScript, and Web Vitals.
- **Impact:** not a present vulnerability; future maintenance/support drift.
- **Confidence:** **Confirmed** as of 2026-07-15.
- **Recommended direction:** assess major upgrades in isolated branches with compatibility/security review rather than treating `npm outdated` exit 1 as a production failure.
- **Verification:** repeat `npm outdated` and review vendor changelogs/advisories at upgrade time.

## 9. Database design and query behavior

Positive findings include foreign keys for core ownership relations, database-backed sessions, unique phone/provider-reference/idempotency constraints, partial uniqueness for one pending check-in and one open erasure request, indexed outbox delivery/leases, and default query/statement/lock timeouts in the Prisma PostgreSQL adapter (`src/lib/prismaPgConfig.ts:6-13,32-78`).

### MED-DB-01 — Admin guest list/search/statistics perform unbounded reads and N+1/quadratic work

- **Location:** `src/app/api/admin/guests/route.ts:38-45,92-117,135-155`; `src/lib/guestDataExport.ts:44-49,79-84,102-108,168-185,191-232,235-245`.
- **Real issue:** `getAllBookings()` reads every booking, then launches per-booking booking/user/check-in queries via unbounded `Promise.all`. Date search first loads all bookings. Statistics loads all bookings/users/check-ins and calls `checkins.some()` for every booking, giving O(bookings × check-ins) CPU behavior. There is no pagination or hard dataset cap.
- **Scenario:** as records grow, one authenticated admin page action floods the connection pool with hundreds/thousands of concurrent queries and allocates the full dataset, delaying public traffic or exceeding the 30-second route deadline.
- **Impact:** database saturation, high memory/CPU, admin endpoint failure, and collateral latency.
- **Confidence:** **Confirmed** for algorithm/query shape; failure threshold needs load testing.
- **Recommended direction:** push filtering/aggregation/relations into bounded database queries, paginate, cap concurrency/results, and establish query budgets.
- **Verification:** seed production-scale staging data, record SQL count, pool wait, p95/p99 latency, memory, and query plans for every admin action.

### MED-DB-02 — Stay-request phone matching lacks an index

- **Location:** `prisma/schema.prisma:137-157`; `src/lib/privacyService.ts:87-95`; `src/app/api/dsar/export/route.ts:92-105`.
- **Real issue:** privacy erasure/export matches `StayRequest` by `email OR phone`; email is indexed but phone is not.
- **Scenario:** a large stay-request table requires a sequential scan for phone-only subjects during time-sensitive DSAR work, inside the erasure transaction in one path.
- **Impact:** slow DSAR operations, longer transactions/locks, and missed response objectives under volume.
- **Confidence:** **Highly likely**; the actual plan/cardinality requires `EXPLAIN (ANALYZE, BUFFERS)`.
- **Recommended direction:** align indexes/data model with normalized subject lookup patterns after measuring selectivity and write cost.
- **Verification:** run parameterized `EXPLAIN (ANALYZE, BUFFERS)` on representative production-size staging data for email-only, phone-only, and combined matches.

### MED-DB-03 — Retention deletes every data class in one unbatched transaction every five minutes

- **Location:** `src/lib/operationalMonitor.ts:191-225`; `deploy/systemd/qr-city-guide-operations.timer:1-12`; `deploy/systemd/qr-city-guide-operations.service:6-14`.
- **Real issue:** eleven `deleteMany` operations run in one Prisma transaction, with no batch size, row budget, progress checkpoint, or workload-specific schedule. The operations timer invokes this together with alert evaluation every five minutes.
- **Scenario:** after backlog/traffic growth, one maintenance run deletes many rows, generates large WAL/dead tuples, holds transaction resources, times out the systemd job, or competes with user traffic; the whole transaction retries from scratch on failure.
- **Impact:** latency spikes, bloat, lock/resource pressure, failed maintenance, and delayed alert evaluation.
- **Confidence:** **Highly likely** at scale; current production cardinalities were not available.
- **Recommended direction:** use bounded, observable batches with workload-specific schedules, statement budgets, vacuum awareness, and failure checkpoints.
- **Verification:** load production-scale expired data in staging and measure locks, WAL, dead tuples, duration, retries, and application p95 during maintenance.

### MED-DB-04 — Analytics summary queries aggregate the full retained tables

- **Location:** `src/lib/analyticsRepository.ts:46-58,89-130,133-148`; `prisma/schema.prisma:321-345`.
- **Real issue:** distinct-path and vitals percentile summaries have no mandatory time predicate; the subquery for first-seen paths groups the entire hit history, and vitals retrieval issues one query per distinct metric name.
- **Scenario:** telemetry growth turns an admin dashboard request into large scans/sorts and repeated queries while ingestion continues.
- **Impact:** slow dashboards and database contention.
- **Confidence:** **Highly likely** at material telemetry volume; plans/cardinality need live verification.
- **Recommended direction:** define bounded reporting windows/pre-aggregation and query-specific indexes based on real plans.
- **Verification:** capture `EXPLAIN (ANALYZE, BUFFERS)` and p95 on production-scale staging telemetry at retention limits.

### MED-PRIV-01 — Client-error IP addresses use unsalted SHA-256 rather than the repository HMAC policy

- **Location:** `src/app/api/errors/route.ts:42-63`; compare `src/lib/privacyHash.ts:1-11` and `src/lib/security-monitoring.ts:53-67`.
- **Real issue:** the client-error route stores `SHA-256(raw IP)` while other security/auth paths use a secret-keyed, context-separated HMAC. The IP address space is enumerable, making raw SHA hashes susceptible to offline dictionary recovery.
- **Scenario:** a database export/leak enables an attacker to enumerate common IPv4 values and recover source addresses from stored audit hashes.
- **Impact:** avoidable privacy exposure and inconsistent data-protection guarantees.
- **Confidence:** **Confirmed**.
- **Recommended direction:** apply the same keyed, context-separated pseudonymization and lifecycle policy to every stored IP-derived identifier.
- **Verification:** inspect new error events and confirm no raw or plain-hash IP representation is stored or logged; test rotation/retention consequences.

## 10. Migration safety and rollback risk

Related High findings: `HIGH-MIG-01` and `HIGH-MIG-02`.

Positive evidence: migrations include explicit ambiguity checks, ownership preservation, uniqueness guards, a legacy outbox-lease recovery migration, and a guarded refusal to drop non-empty retired tables.

### MED-MIG-01 — Large migration uses blocking DDL/index creation without explicit execution budgets

- **Location:** `prisma/migrations/20260714150000_trustworthy_portal_and_operations/migration.sql:60-88,141-188,219-260,271-284,325-345`; `scripts/run-prisma-migrations.ts:139-217`.
- **Real issue:** the transaction rewrites data, alters types/tables, and creates multiple non-`CONCURRENTLY` indexes. The migration runner retries the entire `prisma migrate deploy` command but sets no migration-specific `lock_timeout`/`statement_timeout`.
- **Scenario:** production-size tables or active writes make DDL wait for locks or block traffic for an unbounded period; retrying repeats contention without changing the underlying condition.
- **Impact:** deployment stall and application outage/latency.
- **Confidence:** **Highly likely** under nontrivial data/concurrency; exact lock behavior needs rehearsal.
- **Recommended direction:** measure and separate online-safe phases, set intentional lock/statement budgets, and schedule unavoidable blocking work with an approved maintenance/rollback plan.
- **Verification:** run the exact migration against a production-size clone under representative concurrent traffic while monitoring locks, blocked sessions, duration, and old/new application behavior.

### LOW-MIG-01 — Readiness depends on a manually maintained migration name

- **Location:** `src/app/api/health/ready/route.ts:6-31`.
- **Real issue:** `EXPECTED_MIGRATION` is a source-code string that must be updated whenever a migration is added.
- **Scenario:** a migration is added without updating the constant, or the constant advances while deployment sequencing differs; healthy instances report false-ready or false-not-ready relative to the intended release.
- **Impact:** deployment/probe errors and manual synchronization burden.
- **Confidence:** **Confirmed**.
- **Recommended direction:** bind schema compatibility to generated/release metadata or a deliberate compatibility contract that cannot silently drift.
- **Verification:** add a temporary migration in an isolated branch and prove an automated test fails until readiness/release metadata is correctly synchronized.

## 11. Payment and transactional integrity

### INFO-PAY-01 — No payment implementation exists in the reviewed repository

- **Location:** all 51 `src/app/api/**/route.ts` files and `package.json:79-150`; no payment provider SDK, checkout route, webhook, ledger, charge/refund state, or payment secrets were found.
- **Finding:** payment idempotency, signature verification, duplicate-event handling, refund consistency, and payment reconciliation are **not applicable to the current codebase** and were not live-tested.
- **Impact:** none for the present feature set. If payment capability exists outside this repository, it remains unaudited and must not inherit this verdict.
- **Confidence:** **Confirmed** for the current tree.
- **Recommended direction:** treat any future payment addition as a new high-risk trust boundary requiring a separate threat model and audit before production.
- **Verification:** product/architecture owner confirms there is no external or hidden payment flow; repeat repository and infrastructure inventory before launch.

Transactional strengths in non-payment workflows include database uniqueness for idempotency keys, transactional creation of stay/check-in requests plus outbox events, conditional outbox leases, and serializable retry loops on claim/status flows.

## 12. Performance and scalability

Related findings: `MED-DB-01`, `MED-DB-02`, `MED-DB-03`, `MED-DB-04`, and `MED-ABUSE-01`.

### MED-PERF-01 — Durable outbox delivery still blocks user/admin requests on a five-second external fetch

- **Location:** `src/app/api/booking-requests/route.ts:87-128`; `src/app/api/check-in/arrival-request/route.ts:77-98`; `src/app/api/admin/check-in-requests/[id]/route.ts:48-72`; `src/lib/bookingOutbox.ts:28-148`.
- **Real issue:** after committing the durable outbox event, request handlers immediately claim and deliver it, awaiting an external webhook with a five-second timeout and additional database work. The worker/timer already exists for asynchronous delivery.
- **Scenario:** a webhook receiver is slow or unavailable. Every booking/check-in/admin update holds a request and database work for up to the external timeout before returning `queued`, consuming server capacity during an outage.
- **Impact:** avoidable tail latency and reduced throughput; external dependency health leaks into user-facing latency even though durability is already decoupled.
- **Confidence:** **Confirmed**.
- **Recommended direction:** define whether synchronous delivery is an explicit product requirement; otherwise keep request latency bounded to durable enqueue and let the supervised worker deliver with observable SLOs.
- **Verification:** make the staging webhook delay/fail and measure p95/p99, concurrent capacity, returned status, eventual delivery, and duplicate handling.

No repository load test establishes capacity, saturation point, connection-pool sizing, or p95/p99 objectives. Those are manual blockers in section 16.

## 13. Reliability and observability

Related High finding: `HIGH-REL-01`.

Positive controls:

- liveness and readiness are separated; readiness checks SQL, expected migration, and production Redis (`src/app/api/health/live/route.ts`; `src/app/api/health/ready/route.ts:13-90`);
- outbox events use lease ownership, expiry recovery, exponential backoff, maximum attempts, and systemd timers (`src/lib/bookingOutbox.ts:28-190`; `deploy/systemd/qr-city-guide-outbox.timer:1-12`);
- systemd restarts the app on failure and applies service sandboxing (`deploy/systemd/qr-city-guide.service:17-40`);
- generic API errors do not expose unexpected internal exception messages (`src/lib/apiErrorHandler.ts:419-444`).

### MED-REL-01 — Security threshold alerts are process-local and only print to console

- **Location:** `src/lib/security-monitoring.ts:90-108,110-137,160-223,227-249`.
- **Real issue:** the security monitor buffers at most 1,000 events in one process, evaluates thresholds per instance, and `triggerAlert()` only calls `console.error`. Persistence failures are swallowed after console logging.
- **Scenario:** distributed abuse stays below each instance threshold, an instance restarts and loses its window, or journald is not actively paged; threshold breach never reaches an operator.
- **Impact:** missed/delayed security response and incomplete alert semantics.
- **Confidence:** **Confirmed**.
- **Recommended direction:** evaluate security thresholds over a shared durable stream/store and deliver tested off-host notifications with deduplication and escalation.
- **Verification:** distribute events across multiple staging instances, restart one, and prove the global threshold still pages an operator exactly once.

## 14. Environment and deployment readiness

Related High findings: `HIGH-DEPLOY-01`, `HIGH-DEPLOY-02`, and `HIGH-OPS-01`.

Positive controls:

- production environment validation fails closed for missing database/auth/HTTPS/proxy/Redis settings;
- the production orchestrator forbids Docker fallback and `.env.local` loading;
- systemd and Docker run non-root with hardened/read-only filesystems;
- the Docker base image is digest pinned and the app exposes a readiness healthcheck.

### MED-ENV-01 — Convenience commands default to production

- **Location:** `scripts/system-orchestrator.sh:13-24,35-72`; `Makefile:3-15,35-45`; `package.json:12,68-77`.
- **Real issue:** the orchestrator and Makefile default to `production`; several `npm run system:*` scripts omit an explicit profile; `npm run migrate` explicitly selects production. A routine-looking local command can enter production validation/build/migration behavior when production credentials are present.
- **Scenario:** an operator with production environment variables runs `make migrate`, `npm run migrate`, or `npm run system:migrate` assuming a local/staging default and mutates the production database.
- **Impact:** accidental production changes and elevated operator-error risk.
- **Confidence:** **Confirmed** for defaults; actual credential exposure is environment-dependent.
- **Recommended direction:** make environment selection explicit and require a separate authorization/promotion barrier for production-mutating commands.
- **Verification:** run commands with harmless instrumented disposable URLs and prove ambiguous/default invocations cannot target the production-labelled environment.

## 15. Testing gaps

Related High findings: `HIGH-TEST-01`, `HIGH-DEPLOY-01`, and `HIGH-DEPLOY-02`.

Missing or insufficient automated evidence:

- real Postgres tests for constraints, migrations, transaction isolation, lock behavior, and query plans;
- concurrent claim consumption and existing-account claim behavior;
- full refresh rotation/replay/family revocation repository behavior;
- admin login, the global limiter lockout case, CSRF/origin behavior, and per-route authorization matrix;
- outbox lease races, abandoned leases, retry exhaustion, receiver idempotency, and worker crash recovery;
- privacy export/erasure completeness, active holds/deliveries, rollback on failure, and data-remanence checks;
- old/new binary coexistence across schema changes and rollback/restore drills;
- browser E2E claim/session/check-in/DSAR/admin flows;
- production artifact/container startup and runtime CSP/CORS/cookie/security-header verification;
- performance/load/soak tests with production-scale data and NAT/shared-IP traffic;
- DAST and history-aware secret scanning.

The explicit coverage allowlist can report high percentages while excluding most of these risk-bearing paths (`vitest.config.ts:25-73`).

## 16. Manual verification required before production

The following items were not executed because they would build artifacts, change generated files, require live dependencies, mutate databases, require production credentials, or depend on external infrastructure. They are required release evidence, not optional polish.

### Production artifact and runtime

1. In controlled staging with production-equivalent non-production secrets:
   - `npm ci`
   - `npm run validate:security` (includes production build)
   - `docker build --build-arg NEXT_PUBLIC_SITE_URL=https://staging.example.invalid -f docker/Dockerfile.security -t villa-app:audit .`
   - `npm run docker:scan` or the organization's approved image scanner
   - generate/retain an SBOM and image digest
2. Start the exact artifact behind the intended reverse proxy and verify:
   - `/api/health/live` and `/api/health/ready`;
   - trusted IP extraction for the real hop topology;
   - Redis failure/recovery and rate-limit behavior;
   - CSP nonce, HSTS, CORS, cookie flags, cache headers, and no credential-bearing URLs/logs;
   - graceful SIGTERM, restart, and dependency loss.

### Database and migrations

1. Clone/sanitize production-scale data into an isolated environment.
2. Run the documented migration preflight and exact `prisma migrate deploy` sequence with old/new binaries and representative traffic.
3. Capture locks, duration, WAL, blocked queries, constraint failures, and post-migration verification.
4. Obtain query plans for the findings in section 9, for example using parameterized `EXPLAIN (ANALYZE, BUFFERS)` in staging—not production ad hoc.
5. Prove connection limits, pool wait timeout, statement/query/lock timeouts, database TLS, least-privilege grants, and maximum instance count do not exceed PostgreSQL capacity.

### Backup, restore, and rollback

1. Verify provider PITR/scheduled backup configuration, encryption, retention, access logs, and failure alerting.
2. Restore a recent backup into an isolated environment and validate row counts, migrations, application behavior, and RPO/RTO.
3. Rehearse binary rollback, forward fix, and database restore decisions for the destructive migration.

### Security operations

1. Run an approved history-aware secret scanner across all refs without exposing secret values in CI logs.
2. Verify production secrets are independent, randomly generated, stored in a managed secret store/root-owned environment file, and have owned rotation/runbooks.
3. Perform authenticated/unauthenticated DAST for the complete authorization matrix, CSRF/origin handling, token replay, claim URL leakage, and rate-limit bypass/DoS.
4. Prove central logs/metrics/traces/error events and off-host paging for controlled 5xx, auth abuse, Redis failure, dead outbox, slow DB, and service crash.
5. Verify branch protection, mandatory CI, artifact provenance/signing, dependency update handling, and emergency rollback authority.

### Capacity and reliability

1. Load/soak test representative public pages and API journeys, including shared-NAT clients.
2. Establish SLOs and measured p50/p95/p99, error rate, saturation, connection-pool wait, and maximum safe throughput.
3. Fault-inject slow/down webhooks, Redis, PostgreSQL, and network failures; prove bounded degradation and recovery.
4. Verify systemd timers are installed/enabled, cannot overlap harmfully, and alert on repeated failure.

## 17. Complete findings table

| ID | Category | Severity | Confidence | Location | Finding | Impact | Recommended direction | Verification |
|---|---|---|---|---|---|---|---|---|
| HIGH-AUTH-01 | Authentication | High | Confirmed | `admin/login`, `auth/admin`, `AdminSession` | Shared admin secret; no named identity, MFA, roles, or actor attribution | Full admin compromise and weak accountability | Individual MFA identities and least privilege | Multi-operator staging auth/revocation/audit test |
| HIGH-ABUSE-01 | Abuse resistance | High | Confirmed | `admin/login:22-30`, `sensitiveRateLimit:28-69` | Literal global `admin` identifier lets five anonymous attempts lock everyone out | Repeatable admin denial of service | Non-global, identity-aware anti-abuse design | Fail from IP A; valid login from IP B must succeed |
| HIGH-WEB-01 | Web security | High | Confirmed | `UnifiedGuestClient:20-72` | Booking claim bearer token retained in URL query | Claim leakage and unauthorized booking activation | Non-URL handoff or immediate server-side consumption/URL removal | Inspect history/logs/referrers through staging flow |
| HIGH-MIG-01 | Migrations | High | Confirmed | `run-prisma-migrations:33-52,230-237` | Production migrations execute before staging | Production-first schema risk | Separate staged promotion with production authorization | Trace disposable staging/prod sequence |
| HIGH-MIG-02 | Migrations | High | Confirmed | `20260714150000...:1-345` | Destructive, non-rolling-compatible migration and restore-dependent rollback | Deployment outage/data recovery risk | Expand-contract and compatibility window | Old/new concurrent rehearsal and rollback drill |
| HIGH-REL-01 | Observability | High | Confirmed | metrics/tracing/logger/Edge modules | Metrics/traces are local/no-op and errors lack integrated external sink | Missed incidents and incomplete evidence | Central durable telemetry and tested paging | Inject failures across instances and restart |
| HIGH-DEPLOY-01 | Deployment | High | Confirmed | `.github/`, `package.json` | No versioned automated CI/release gate | Unvalidated commits can ship | Mandatory protected CI/promotion pipeline | Prove failing gate blocks merge/deploy |
| HIGH-TEST-01 | Testing | High | Confirmed | `tests/`, `vitest.config.ts` | Critical DB/auth/outbox/privacy/migration flows absent from integration/E2E tests | Green suite misses stateful production failures | Production-faithful DB/concurrency/E2E coverage | Mutation/fault tests must fail as expected |
| HIGH-OPS-01 | Recovery | High | Needs verification | deployment rehearsal docs; no backup job in tree | Backup/PITR/restore controls are not evidenced | Potential irreversible loss/prolonged outage | Automated backups and recurring restore drills | Isolated restore with recorded RPO/RTO |
| HIGH-DEPLOY-02 | Deployment | High | Needs verification | build/orchestrator/Docker/readiness paths | Current artifact and live dependencies not exercised by this audit | Build/startup/runtime security failure may remain | Production-equivalent staging artifact gate | Build, scan, start, health and representative API tests |
| MED-AUTH-01 | Authentication | Medium | Confirmed | portal claim/session schemas | Password policy only checks 8–128 length | Guessable/reused guest passwords | Length-first plus breached-password screening | Password-policy and bcrypt-load tests |
| MED-AUTH-02 | Authentication/Monitoring | Medium | Confirmed | admin/guest auth routes, sensitive limiter | Credential failures and limiter blocks are not durably audited | Abuse detection/forensics gap | Privacy-safe durable auth events and alerts | Trigger failures and inspect central event/alert |
| LOW-AUTH-01 | Authentication/API | Low | Confirmed | `portal/sessions:21-30` | Reads nonexistent `session.booking_id` | Missing booking ID in status response | Align typed payload and contract | Authenticated route test |
| MED-WEB-01 | Webhook security | Medium | Confirmed | `alerts/webhook:9-61` | No webhook freshness or replay idempotency | Audit pollution/write abuse | Signed fresh replay-safe requests | Replay/stale request tests |
| MED-ABUSE-01 | Rate limiting | Medium | Confirmed | Edge limiter key/threshold | All APIs share one 100/15m IP bucket | Shared-NAT/noisy-neighbor denial | Risk/route/identity-partitioned budgets | Production-like NAT load test |
| MED-SEC-01 | Secrets | Medium | Confirmed | `validate-security:35-75,141-168` | Built-in secret check does not scan all blobs/history | Historical/renamed credentials may remain | Enforced history-aware scanner | Scan all refs and review results |
| LOW-ENV-01 | Environment | Low | Confirmed | env schema/orchestrator | Required encryption/session secrets have no consumer | Startup drift and misleading rotation model | Contract-to-consumer alignment | Runtime secret-consumer map |
| INFO-DEP-01 | Dependencies | Informational | Confirmed | `package.json`, `npm outdated` | Newer major releases exist; audit is clean | Maintenance drift only | Planned compatibility upgrades | Repeat audit/outdated and advisory review |
| MED-DB-01 | Database/Performance | Medium | Confirmed | admin guests/export | Unbounded N+1 queries and quadratic statistics | Pool/CPU/memory saturation | Bounded paginated DB-side queries | Production-scale SQL-count/load test |
| MED-DB-02 | Database | Medium | Highly likely | `StayRequest` schema; DSAR queries | Phone lookup has no index | Slow DSAR scans/transactions | Query-aligned index after measurement | `EXPLAIN ANALYZE BUFFERS` |
| MED-DB-03 | Database/Reliability | Medium | Highly likely | retention job and timer | Eleven unbatched deletes in one frequent transaction | WAL/lock/bloat/latency spikes | Bounded observable retention batches | Scale/failure/vacuum test |
| MED-DB-04 | Database/Performance | Medium | Highly likely | analytics repository | Full-retention aggregates and per-metric queries | Dashboard scans and contention | Bounded/pre-aggregated reporting | Production-scale query plans/p95 |
| MED-PRIV-01 | Privacy | Medium | Confirmed | client error route | Raw SHA-256 IP pseudonym differs from keyed HMAC policy | Offline recovery of IPs | Keyed context-separated pseudonymization | Inspect stored events and rotation behavior |
| MED-MIG-01 | Migrations | Medium | Highly likely | large 20260714 migration/runner | Blocking DDL/index creation has no explicit lock/statement budget | Migration stall/outage | Measured online phases and budgets | Concurrent production-size rehearsal |
| LOW-MIG-01 | Readiness | Low | Confirmed | health readiness route | Expected migration name is manually hardcoded | Probe/release drift | Generated compatibility metadata | Automated drift test |
| INFO-PAY-01 | Payments | Informational | Confirmed | routes/dependencies | No payment implementation in current tree | Payment risks are N/A, external flows unaudited | Separate audit if introduced | Owner confirmation and future inventory |
| MED-PERF-01 | Performance/Reliability | Medium | Confirmed | booking/check-in/admin routes; outbox | Request awaits five-second external webhook despite durable enqueue | Tail latency and reduced capacity | Worker-led delivery unless sync is required | Slow/down webhook load test |
| MED-REL-01 | Security monitoring | Medium | Confirmed | `security-monitoring` | Security threshold buffer is per-process and alerts only to console | Missed distributed events/pages | Shared evaluation and off-host notification | Multi-instance/restart threshold test |
| MED-ENV-01 | Deployment safety | Medium | Confirmed | orchestrator/Make/package scripts | Routine commands default/select production | Accidental production mutation | Explicit environment plus authorization barrier | Instrumented disposable-target command test |

## Appendix A — Commands executed and results

All commands below were non-mutating with respect to application behavior and production resources.

| Command | Result |
|---|---|
| `node --version` | Pass — `v22.19.0` |
| `npm --version` | Pass — `11.18.0` |
| `git status --short --branch` | `main...origin/main`; architecture report untracked before this report |
| `npm run typecheck` | Pass |
| `npm run lint -- --max-warnings=0` | Pass, zero warnings |
| `npm run lint:security` | Pass, zero warnings |
| `npm audit --audit-level=moderate` | Pass — 0 vulnerabilities |
| `npm test` | Pass — 14 files, 176 tests |
| `npm run check:conflicts` | Pass |
| `npm run check:dead-code` | Pass |
| `npx prisma validate` | Pass |
| `npm run security:license-check` | Pass |
| `git diff --check` | Pass |
| `npm outdated` | Exit 1 because newer major versions exist; informational, listed in `INFO-DEP-01` |
| limited tracked-file signature scan | No match for the selected private-key/AWS/GitHub/OpenAI token signatures; not a substitute for history-aware scanning |

Not executed: `npm run build`, `npm run validate:security`, `npm run test:coverage`, Docker build/scan, system orchestrator startup, browser/DAST/load tests, live database queries, migrations, webhook delivery, emails, payments, secret reads, production endpoints, backup, or restore.

## Appendix B — Files central to this audit

- Architecture and runtime: `01_SYSTEM_ARCHITECTURE_AND_REPOSITORY_MAP.md`, `package.json`, `src/proxy.ts`, `src/lib/runtime-env-schema.js`
- Authentication/authorization: `src/lib/portalAuthService.ts`, `src/lib/guestSession.ts`, `src/lib/portalAuthHttp.ts`, `src/lib/prisma-repositories/refreshTokenRepository.ts`, `src/lib/auth/admin.ts`, `src/lib/rbac.ts`
- Web/abuse: `src/lib/security-config.ts`, `src/lib/security-middleware-edge.ts`, `src/lib/api-security-middleware.ts`, `src/lib/apiErrorHandler.ts`, `src/lib/sensitiveRateLimit.ts`, `src/lib/net/getClientIp.ts`
- Database/migrations: `prisma/schema.prisma`, `prisma/migrations/**/migration.sql`, `src/lib/prisma.ts`, `src/lib/prismaPgConfig.ts`, `scripts/run-prisma-migrations.ts`
- Stateful/operational flows: `src/lib/bookingOutbox.ts`, `src/lib/privacyService.ts`, `src/lib/operationalMonitor.ts`, `src/lib/guestDataExport.ts`, `src/lib/analyticsRepository.ts`
- Deployment/observability/testing: `docker/Dockerfile.security`, `deploy/systemd/*`, `scripts/system-orchestrator.sh`, `scripts/validate-security.ts`, `vitest.config.ts`, `tests/**`, `.github/**`
