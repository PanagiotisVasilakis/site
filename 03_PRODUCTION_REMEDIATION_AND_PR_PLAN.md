# Production Remediation and Pull Request Plan

**Repository:** `qr-city-guide`

**Planning baseline:** commit `e6dc63f18fe9fc32c8df7cf3a2db0e13c9e2c1c7`

**Inputs read in full:** `01_SYSTEM_ARCHITECTURE_AND_REPOSITORY_MAP.md` and `02_PRODUCTION_SECURITY_AND_PERFORMANCE_AUDIT.md`

**Scope:** planning only. This document does not apply a fix, install a dependency, create a migration, change the Prisma schema, modify infrastructure, or access production resources.

## 1. Executive remediation summary

The audit conclusion remains valid: the current checkout is suitable only for an isolated, supervised staging environment with synthetic data and staging-only credentials. It is not approved for production traffic, production PII, or production schema changes.

The focused live-code recheck found:

- no confirmed Critical finding;
- all ten reported High findings still relevant;
- no false positive and no true duplicate among the High findings;
- two High items (`HIGH-OPS-01` and `HIGH-DEPLOY-02`) are release-evidence gaps, not confirmed application defects;
- three groups can be delivered as unified workstreams without losing traceability: observability (`HIGH-REL-01` + `MED-REL-01` + `MED-AUTH-02`), migration compatibility (`HIGH-MIG-02` + `MED-MIG-01` + `LOW-MIG-01`), and environment-safe migration execution (`HIGH-MIG-01` + `MED-ENV-01`).

The remediation is organized into 22 tasks:

- **P0:** eight tasks that must close before any production launch;
- **P1:** eight tasks that must close/pass, or be proven feature-disabled/not applicable, before real users; risk acceptance is not counted as a passing control in this recommended launch path;
- **P2:** four capacity and operational-efficiency tasks required before growth beyond a measured limited-production ceiling;
- **P3:** two non-blocking correctness/maintenance tasks.

`INFO-PAY-01` does not justify a payment implementation task. The required action is a launch-time scope attestation that no payment flow exists in this repository or externally. If that statement is false, payment becomes a separate high-risk audit and delivery scope.

The safest dependency order is:

1. build the real-PostgreSQL test foundation;
2. make current gates mandatory, then scan full history/artifacts early so a leaked credential is rotated before later P0 promotion;
3. independently fix the admin lockout and claim-token URL behavior;
4. remove production defaults, complete the read-only migration baseline, and establish the state-specific manifest/compatibility boundary;
5. establish named admin identity/MFA/RBAC through schema, session, provider, capability, and retirement PRs;
6. enter controlled staging with an immutable artifact;
7. centralize observability/paging before P1 controls depend on their evidence, and prove backup/restore before real traffic;
8. close the remaining P1 security controls;
9. execute state-specific production cutover only after Phase B, delay schema contract to a later release, and measure/remediate database/background-job limits before growth.

There are two distinct staging meanings:

- **Exploratory disposable staging:** allowed now by the audit, but only with synthetic/non-sensitive data, isolated staging secrets/Redis/webhooks, no production credentials, and explicit supervision.
- **Promotion-quality controlled staging:** begins after Phase A exit. Its evidence can be used for a production decision; production remains blocked until Phase B exit.

## 2. Verified production blockers

### 2.1 Critical findings

No Critical finding was reported or found during the focused recheck. Production secrets, cloud IAM, network controls, database privileges, backup configuration, and live service behavior were not accessible, so the absence of a code-confirmed Critical does not attest those external boundaries.

### 2.2 High finding verification

| Finding | Live conclusion | Current evidence | Independence and dependencies | Breaking-change exposure | Plan disposition |
|---|---|---|---|---|---|
| `HIGH-AUTH-01` | **Confirmed** | `src/app/api/admin/login/route.ts:14-44` accepts one `ADMIN_DASH_SECRET`; `src/lib/auth/admin.ts:13-20,52-59,84-112` creates a fixed `admin` principal without a person; `prisma/schema.prisma:197-208` stores no operator; `src/lib/rbac.ts:4-8` is boolean admin authorization. | Distinct from the lockout flaw. Depends on an identity-provider/MFA decision, role matrix, additive schema compatibility, audit attribution, and `REM-01`. | High: login API/UI, session/JWT claims, authorization, schema, and admin operations change. | `REM-03`, P0. |
| `HIGH-ABUSE-01` | **Confirmed** | `src/app/api/admin/login/route.ts:22-30` passes literal `identifier: 'admin'`; `src/lib/sensitiveRateLimit.ts:28-35,42-68` increments the same identifier bucket for every source and denies when any dimension exceeds five. | Independently fixable before the admin redesign; later becomes identity-aware. | Low behavioral change to 429/backoff semantics; brute-force protection must remain. | `REM-04`, P0. |
| `HIGH-WEB-01` | **Confirmed** | `src/app/[locale]/guest/UnifiedGuestClient.tsx:20-29,48-72` reads and rewrites `claim` in the query; `:85-95` submits it as a bearer capability. `src/lib/portalAuthService.ts:44-85,88-115` confirms its claim authority and lifetime. | Independent of auth/migrations. Depends on an explicit delivery-UX decision and a compatibility/cutover plan for already issued grants. | Medium: query-based links stop being accepted; token-only manual entry remains available. | `REM-05`, P0. |
| `HIGH-MIG-01` | **Confirmed** | `scripts/run-prisma-migrations.ts:33-52,230-237` orders `prod` before `staging` in one process; `package.json:17` exposes the combined command. | Distinct from migration destructiveness; coupled to `MED-ENV-01`, CI protection, separated credentials, and target fingerprinting. | Intentional operator-interface break: combined/default production commands must fail closed. | `REM-06`, P0. |
| `HIGH-MIG-02` | **Confirmed design risk; live impact depends on applied state** | `prisma/migrations/20260714150000_trustworthy_portal_and_operations/migration.sql:1-345` combines validation, rewrites, renames, indexes/FKs, and immediate drops. `20260715110000_remove_unused_legacy_models/migration.sql:1-39` performs guarded destructive cleanup. | Depends on the live `_prisma_migrations` state, data size/shape, topology, `REM-01`, `REM-06`, backup/restore, old/new artifacts, and a migration rehearsal. | Very high. Applied migration SQL/checksums must never be rewritten. Binary-only rollback may be unsafe. | `REM-07`, P0; `REM-09` is a mandatory production execution dependency. |
| `HIGH-REL-01` | **Confirmed for repository sinks; external collection unknown** | `src/lib/metrics-lite.ts:1-17` is no-op; `distributed-tracing-lite.ts:28-64` exports nothing; Node collectors are in-process; `logger-enterprise.ts:279-314` writes only console; Edge rate-limit signals therefore vanish in-repo. | Can be additive through existing contracts. Depends on provider/SLO/redaction/on-call decisions and staging fault injection. Overlaps, but is not duplicated by, `MED-REL-01`. | Low application compatibility risk; high privacy/cardinality/cost risk if implemented poorly. | `REM-10`, P1 and hard production-traffic gate. |
| `HIGH-DEPLOY-01` | **Confirmed in repository; external enforcement unknown** | `.github/` contains only Dependabot and Copilot instructions; local gates in `package.json:24-59` have no versioned remote enforcement. | Distinct from artifact runtime evidence. Depends on CI platform, branch/environment protection, runner trust, and artifact registry. | No application break; intentionally makes previously optional gates mandatory. | `REM-02`, P0. |
| `HIGH-TEST-01` | **Confirmed** | Fourteen test files are deterministic/mock-oriented; `vitest.config.ts:25-65` excludes claim transactions, refresh repository, outbox, privacy service, migration runner, and most routes from coverage; no live-Postgres or product E2E suite exists. | Cross-cutting prerequisite, not a substitute for per-fix regression tests. Needs disposable PostgreSQL, isolated fixtures, browser execution, and CI resources. | No runtime break; may expose existing defects and lengthen gates. | `REM-01`, P0. |
| `HIGH-OPS-01` | **Needs manual verification; not a confirmed missing backup** | `docs/deployment-migration-rehearsal.md:7-33,77-107` documents a procedure, but no repository evidence proves provider backups/PITR, retention, alerting, or a timed restore. | External dependency for destructive migration and production data. Needs provider access and approved RPO/RTO/retention. | No application break; restore must target an isolated new resource. | `REM-09`, P1 and hard production-data/migration gate. |
| `HIGH-DEPLOY-02` | **Needs manual verification; not a confirmed artifact failure** | Build/container/readiness mechanisms exist, but no evidence ties the current commit to a built, scanned, started artifact with production-class PostgreSQL, Redis, proxy, and webhook behavior. | Depends on `REM-01`, `REM-02`, `REM-06`, isolated staging, artifact identity, and representative dependencies. | The exercise may reveal a real packaging/config/schema break. | `REM-08`, P1 and hard production-promotion gate. |

Additional deployment sequencing risk verified in live code: `scripts/system-orchestrator.sh:1180-1203` executes migrations before the optional strict quality gate and production build. `REM-02`, `REM-06`, and `REM-08` therefore require **build and validate first, migrate later, then promote the validated digest**. If required build-time public configuration makes staging and production digests different, the production digest must repeat the complete staging-equivalent gate rather than inherit evidence.

### 2.3 Deduplication and wording corrections

- No High finding is removed.
- `HIGH-OPS-01` and `HIGH-DEPLOY-02` must close with recorded external evidence; repository changes alone cannot close them.
- `HIGH-DEPLOY-01` means no versioned repository CI was found. Existing organization-level protection, if any, must be inspected before new infrastructure is selected.
- `HIGH-REL-01` means the repository has no durable exporter. A hosting platform may already ingest stdout, but that must be demonstrated and tested.
- `HIGH-MIG-02` is not permission to edit old SQL. Its remediation branches on actual applied/checksum state.

## 3. P0/P1/P2/P3 roadmap

Effort sizes are relative complexity, not calendar promises: **XS** localized; **S** small bounded change; **M** cross-file; **L** cross-module or infrastructure-coupled; **XL** multi-layer/high-risk program.

| Task | Priority | Findings | Outcome | Production gate | Effort |
|---|---|---|---|---|---|
| `REM-01` | P0 | `HIGH-TEST-01` | Production-faithful critical-flow test foundation | Yes | XL |
| `REM-02` | P0 | `HIGH-DEPLOY-01` | Mandatory CI and protected release gate | Yes | L |
| `REM-03` | P0 | `HIGH-AUTH-01` | Named admins, MFA, least privilege, actor attribution | Yes | XL |
| `REM-04` | P0 | `HIGH-ABUSE-01` | Admin abuse control without universal lockout | Yes | S |
| `REM-05` | P0 | `HIGH-WEB-01` | Claim capability removed from URL transport/persistence | Yes | M |
| `REM-06` | P0 | `HIGH-MIG-01`, `MED-ENV-01` | Explicit single-environment promotion boundary; build before migrate | Yes | M |
| `REM-07` | P0 | `HIGH-MIG-02`, `MED-MIG-01`, `LOW-MIG-01` | Immutable baseline, state-specific migration disposition, expand-contract framework | Yes | XL |
| `REM-14A` | P0 | `MED-SEC-01` | Full-history/artifact secret discovery, rotation, and release gate | Yes | M |
| `REM-08` | P1 | `HIGH-DEPLOY-02` | Immutable artifact proven in production-equivalent staging | Yes | L |
| `REM-09` | P1 | `HIGH-OPS-01` | Automated backup/PITR evidence and timed restore | Yes | L |
| `REM-10` | P1 | `HIGH-REL-01`, `MED-REL-01`, `MED-AUTH-02` | Central telemetry, durable auth events, off-host paging | Yes | XL |
| `REM-11` | P1 | `MED-AUTH-01` | Stronger guest-password defense without account enumeration | Pass required while password creation is enabled | M |
| `REM-12` | P1 | `MED-WEB-01` | Fresh, signed, replay-safe inbound alert webhook | If enabled | M |
| `REM-13` | P1 | `MED-ABUSE-01` | Route/risk/identity-aware rate budgets | Measured acceptance required | M |
| `REM-14B` | P1 | `LOW-ENV-01` | Truthful required-secret-to-consumer and rotation contract | Evidence required | S |
| `REM-15` | P1 | `MED-PRIV-01` | Consistent keyed IP pseudonymization | Privacy gate | S |
| `REM-16` | P2 | `MED-DB-01`, `MED-DB-04` | Bounded admin and analytics queries | Before scale beyond measured ceiling | L |
| `REM-17` | P2 | `MED-DB-02` | Measured DSAR phone index/query plan | If plan misses budget | S |
| `REM-18` | P2 | `MED-DB-03` | Batched, observable retention maintenance | Before material data growth | M |
| `REM-19` | P2 | `MED-PERF-01` | Request path limited to durable outbox enqueue | Capacity/latency dependent | M |
| `REM-20` | P3 | `LOW-AUTH-01` | Correct portal session-status contract | No | XS |
| `REM-21` | P3 | `INFO-DEP-01` | Isolated major-dependency maintenance program | No current vulnerability | M |

Finding `INFO-PAY-01` is closed only as **scope attestation**, not code work: confirm that no external payment, live-mode, refund, ledger, or payment webhook exists. Any contrary answer creates a new audit scope before launch.

## 4. Detailed task specifications

### REM-01 — Production-faithful critical-flow test foundation

- **Priority:** P0.
- **Related findings:** `HIGH-TEST-01`.
- **Objective:** Make stateful security, transaction, migration, and browser behavior reproducibly testable before risky remediation begins.
- **Problem being solved:** The green suite mocks persistence/network boundaries and omits the claim, refresh, outbox, privacy, migration, and most route workflows that carry production risk.
- **Affected files/modules:** `tests/**`, new integration/E2E test configuration, `vitest.config.ts`, `package.json`, `docs/testing.md`, `prisma/migrations/**`, `portalAuthService`, `refreshTokenRepository`, `bookingOutbox`, `privacyService`, auth routes, and API authorization routes.
- **Dependencies:** A disposable PostgreSQL service, synthetic fixtures, isolated test secrets, a browser runner already available through the repository toolchain, and CI capacity from `REM-02` for enforcement. No production/staging database may be reused.
- **Proposed implementation:** Add a separate live-PostgreSQL integration profile that requires an explicitly test-labelled URL, migrates a fresh database, seeds deterministic synthetic data, and cleans by isolated schema/database rather than shared global state. Add critical suites for claim atomicity, refresh rotation/replay, guest/admin session revocation, route authorization, outbox lease/retry/crash recovery, privacy export/hold/erasure, rate-limit atomics, full migration history, and browser guest/admin journeys. Keep per-feature regression tests in the PR that changes that feature.
- **Security considerations:** Test guards must reject non-test hosts/databases and never add production bypasses. Fixtures contain no PII or real credentials. Failure logs redact tokens, phones, cookies, URLs, and connection strings.
- **Database considerations:** Exercise actual unique/partial indexes, FKs, serializable conflicts, lock behavior, transaction rollback, and PostgreSQL timeouts. Each worker receives isolated state.
- **Migration requirements:** No production schema change. The test environment must apply the existing chain from empty and from approved historical snapshots.
- **Backward compatibility:** No runtime contract change. Gate duration may increase and must be measured/parallelized without hiding failures.
- **Tests required:** The task is the test program: unit helpers plus live integration, API, browser E2E, migration, and concurrency suites enumerated in section 8.
- **Manual verification:** Prove the database guard refuses a staging/production-labelled URL; intentionally break claim atomicity, refresh replay revocation, outbox ownership, authorization, and migration preflight one at a time and confirm the corresponding suite fails.
- **Acceptance criteria:** A fresh database reaches the expected migration state; every enumerated critical workflow has at least one success, denial/failure, and state-invariant case; concurrent claim has exactly one winner; refresh replay revokes the family; unauthorized/cross-subject route cases return 401/403 without data; outbox lease ownership and erasure rollback are proven; critical modules are no longer absent from enforced coverage solely because of the allowlist.
- **Deployment steps:** Land test infrastructure first in non-blocking CI, stabilize deterministic fixtures, then make the critical integration/API/E2E jobs mandatory before merging remediation PRs.
- **Rollback or roll-forward strategy:** Revert an isolated flaky test harness change only while retaining existing gates; fix flaky fixtures/time controls forward. Never disable the entire critical suite to unblock a release.
- **Risks:** Accidental connection to a real database, nondeterministic concurrency tests, excessive CI time, and false confidence from overly mocked fixtures.
- **Estimated effort:** XL.

### REM-02 — Mandatory CI and protected release gate

- **Priority:** P0.
- **Related findings:** `HIGH-DEPLOY-01`.
- **Objective:** Ensure every merge and promotion is tied to reproducible, mandatory validation and an auditable artifact.
- **Problem being solved:** Repository quality/security commands are currently manual, and production bootstrap can mutate schema before strict validation/build.
- **Affected files/modules:** `.github/workflows/**` or the chosen versioned external pipeline definition, `package.json`, validation scripts, branch/environment protection, artifact registry/provenance configuration, and release documentation.
- **Dependencies:** CI platform and protection-policy decision; `REM-01` for live DB jobs; `REM-14A` adds the full-history/artifact secret gate immediately after the CI baseline; `REM-06` supplies the protected migration stage.
- **Proposed implementation:** Use locked Node/npm versions and `npm ci`; run conflict, type, lint, security lint, unit/component/route/security, live DB, Prisma validation, migration, dependency/license, build, image/SBOM, and smoke stages. Build once before any migration and promote by digest. Use pinned actions/images, least-privilege tokens, OIDC/short-lived deployment credentials, no production secrets in PR jobs, concurrency cancellation, and protected staging/production environments.
- **Security considerations:** Fork/PR code receives no deployment secrets; workflow permissions default read-only; logs/artifacts are scrubbed; action/image versions are pinned; emergency bypass is narrowly authorized and audited.
- **Database considerations:** CI uses disposable PostgreSQL only. Production migration is a separate protected job that receives one environment credential after earlier evidence passes.
- **Migration requirements:** No schema migration. CI must validate migration history/checksums and execute supported upgrade paths.
- **Backward compatibility:** No app break. This intentionally blocks merges/releases that previously could bypass local checks.
- **Tests required:** Deliberately failing test/lint/build/migration-drift/secret fixtures in an isolated branch; pipeline contract tests; artifact digest equality checks.
- **Manual verification:** Inspect actual branch rules, required checks, environment approvals, runner trust, artifact retention, and bypass permissions. Verify any pre-existing external CI before duplicating it.
- **Acceptance criteria:** A normal contributor cannot merge when any required gate fails; a staging failure prevents production promotion; the production job cannot start without protected approval; the recorded commit, artifact digest, SBOM, scan, and schema manifest are linked; migrations never run before build/test success.
- **Deployment steps:** Run in report-only mode, eliminate flakiness, require PR checks, enable protected staging, then enable protected production promotion.
- **Rollback or roll-forward strategy:** Revert or quarantine one defective gate with documented approval while retaining all other gates; fix forward. Do not restore a manual-only release path.
- **Risks:** Flaky/slow gates, unsafe third-party actions, leaked CI metadata, and an overbroad emergency bypass.
- **Estimated effort:** L.

### REM-03 — Named administrator identities, MFA, least privilege, and actor attribution

- **Priority:** P0.
- **Related findings:** `HIGH-AUTH-01`.
- **Objective:** Replace normal shared-secret administration with individually revocable, MFA-protected operators and capability-based authorization.
- **Problem being solved:** One bearer secret grants every admin action, cannot revoke one person, has no reliable actor attribution, and exposes all PII/destructive operations through one role.
- **Affected files/modules:** `src/app/api/admin/login`, admin login/UI routes, `src/lib/auth/admin.ts`, `src/lib/rbac.ts`, every sensitive admin action, `AdminSession`, claim-grant attribution, security audit events, runtime env schema, OpenAPI/docs, and admin tests.
- **Dependencies:** Decision `D-01` (IdP/protocol, phishing-resistant MFA, recovery, role matrix, break-glass); `REM-01`, `REM-02`, and the expand-contract rules in `REM-07`.
- **Proposed implementation:** Prefer a managed OIDC identity boundary rather than creating a new local password/MFA system. Add an operator/principal record and role/capability mapping additively; link new sessions to a stable actor; make `verifyAdminSession` return a named principal; enforce per-action capabilities; store actor IDs for flag changes, exports, claim grants, privacy actions, alert changes, and operational commands. Roll out in compatibility mode, enroll at least two operators, then disable `ADMIN_DASH_SECRET` for routine production login. If retained, break-glass must be separately controlled, disabled by default, independently alerted, and never indistinguishable from a person.
- **Security considerations:** Pin issuer/audience/nonce/state/PKCE; require provider MFA evidence (`acr`/`amr`) and lifecycle disablement; prevent account auto-provisioning; use least privilege and explicit denial; rotate/revoke all old admin sessions at cutover; avoid actor PII in tokens/logs.
- **Database considerations:** Additive principal/role/session linkage first; nullable compatibility fields during transition; index stable provider subject; retain historical actor references according to audit policy.
- **Migration requirements:** Yes, forward-only expand-and-contract migrations. Do not combine identity schema, login cutover, and removal of the old path in one migration/PR.
- **Backward compatibility:** A bounded dual-compatibility window is required. Old shared-secret sessions remain only until named access is verified; contract/removal occurs later. Admin API responses should remain stable unless versioned/documented.
- **Tests required:** OIDC state/nonce/issuer/audience failures, MFA missing, inactive operator, role denial for every sensitive action, per-operator revocation, session expiry/refresh, CSRF/origin, audit actor attribution, legacy-session cutover, and two-operator browser E2E.
- **Manual verification:** Enroll two non-production operators; verify phishing-resistant MFA, offboarding, targeted revocation, role changes, emergency access, IdP audit logs, and actor IDs on every sensitive event.
- **Acceptance criteria:** Two operators authenticate as distinct identities with MFA; revoking operator A does not affect B; a read-only role receives 403 on every mutation/export/erasure outside its capabilities; every listed sensitive action records the stable actor ID; routine production login rejects `ADMIN_DASH_SECRET`; all pre-cutover sessions are revoked.
- **Deployment steps:** Approve ADR/role matrix; deploy additive schema; deploy provider adapter and audit fields dark; enroll/test operators; enable named login; observe; revoke legacy sessions; disable routine shared-secret login; later contract unused compatibility fields.
- **Rollback or roll-forward strategy:** Before cutover, roll back the app while additive schema remains. After legacy sessions are revoked/shared login disabled, prefer forward fix; a break-glass path may be activated only under its audited incident procedure, not as routine rollback.
- **Risks:** IdP outage/lockout, incorrect role mapping, broken admin automation, identity takeover, accidental PII export in claims/logs, and scope expansion into a custom auth rewrite.
- **Estimated effort:** XL.

### REM-04 — Admin abuse control without universal lockout

- **Priority:** P0.
- **Related findings:** `HIGH-ABUSE-01`.
- **Objective:** Constrain abusive sources while preserving a legitimate admin's ability to authenticate from another source.
- **Problem being solved:** The literal global identifier lets five anonymous requests deny all admin login attempts for the window.
- **Affected files/modules:** `src/app/api/admin/login/route.ts`, `src/lib/sensitiveRateLimit.ts`, rate-limit/security tests, and later named-identity hooks from `REM-03`.
- **Dependencies:** `REM-01` test support. It is independently deliverable before `REM-03`; durable centralized alerting follows in `REM-10`.
- **Proposed implementation:** Remove the enforcing literal `admin` dimension. Before identity migration, enforce a privacy-keyed per-source budget and keep aggregate failures as a non-blocking security signal. After named identities exist, add an identity-specific progressive budget/unlock policy that cannot be chosen arbitrarily by an anonymous caller. Preserve timing-safe credential comparison and non-enumerating responses.
- **Security considerations:** Do not replace the global DoS with unlimited distributed guessing, username enumeration, fail-open storage behavior, raw IP storage, or attacker-controlled high-cardinality keys.
- **Database considerations:** Reuse the atomic `RateLimit` store; define cleanup/retention and indexes only if measurement shows need. No new schema is required for the immediate fix.
- **Migration requirements:** None for the immediate fix.
- **Backward compatibility:** 429 behavior changes intentionally; the successful login contract/cookie remains unchanged.
- **Tests required:** Five failures from source A then valid login from B; sixth failure from A denied; simultaneous requests; window reset; database failure behavior; privacy-hashed keys; distributed attempts produce a signal without blocking all sources.
- **Manual verification:** Run the exact staging sequence through the real proxy/client-IP topology and confirm source identity cannot be spoofed.
- **Acceptance criteria:** After five invalid attempts from A, A is constrained and a valid request from B succeeds; no single anonymous identifier bucket can deny every source; invalid responses remain non-enumerating; no raw IP/token is persisted; regression tests fail if the literal global bucket is restored.
- **Deployment steps:** Ship the limiter change and tests independently; monitor 401/429/success distributions; add named-identity dimension only after `REM-03`.
- **Rollback or roll-forward strategy:** Prefer a fast forward fix or a conservative per-source threshold/key-version adjustment. Never restore an anonymous global enforcing bucket; emergency access must use the separately controlled break-glass path from `REM-03`.
- **Risks:** Reduced protection against distributed brute force, incorrect proxy identity, and overly permissive thresholds.
- **Estimated effort:** S.

### REM-05 — Remove booking claim capabilities from URL transport and persistence

- **Priority:** P0.
- **Related findings:** `HIGH-WEB-01`.
- **Objective:** Keep a reusable booking-activation credential out of address bars, history, referrers, analytics, screenshots, and routine access logs.
- **Problem being solved:** The guest client reads `?claim=`, keeps it in state, and writes it back to the URL for a credential valid until consumption/revocation/expiry.
- **Affected files/modules:** `src/app/[locale]/guest/UnifiedGuestClient.tsx`, `src/app/admin/guests/page.tsx`, claim-grant API/docs/OpenAPI, guest validation, analytics initialization, security headers, and browser/security tests.
- **Dependencies:** Decision `D-02` on the guest delivery UX and approval of the `D-14` browser/device/locale matrix before implementation. The repository already supports displaying/copying a token and manual guest entry, so the default minimal plan does not require email/SMS or a new provider.
- **Proposed implementation:** Stop generating/documenting claim query links and distribute the opaque token only through the approved channel for manual entry. Inventory any externally composed links, stop issuance, then wait out or explicitly revoke/reissue active URL-distributed grants (API permits up to 24 hours) before removing query support. On the guest page, delete `claim` parsing/rewriting and scrub an unexpected `claim` parameter without consuming or logging it; show a generic instruction to paste a fresh token. Because client-side scrub cannot prevent logging of the initial request, configure CDN/reverse-proxy/app access logging to omit query strings or specifically redact the `claim` key before persistence. Add a route-specific `no-referrer` policy as defense in depth, not as the primary fix. If a clickable link is a hard product requirement, design a separate one-time server exchange only after a threat review; it must end at a clean URL before analytics/navigation and must not put the raw capability in access logs.
- **Security considerations:** Preserve 256-bit token generation, HMAC-at-rest, one-time consumption, expiry, rate limiting, and non-enumerating failures. Never move the token to local/session storage or analytics state.
- **Database considerations:** Existing grants may be revoked/reissued during cutover through normal application behavior. No model change is needed for token-only delivery.
- **Migration requirements:** None.
- **Backward compatibility:** Manual token entry remains compatible. Query-link compatibility ends only after the maximum active grant window is cleared or grants are reissued. This operational break must be communicated to whoever distributes tokens.
- **Tests required:** Component/unit tests proving query input is ignored/scrubbed; E2E claim success by manual entry; URL/history/referrer/analytics/error/log inspection; replay/expiry/revocation; unexpected query; navigation before/after failed claim.
- **Manual verification:** Inspect browser history, address bar, CDN/reverse-proxy/app access logs and logging configuration, analytics, error events, CSP reports, screenshots, and request `Referer` through both the approved token-only flow and a synthetic hostile/legacy `?claim=` request.
- **Acceptance criteria:** A newly issued claim succeeds by approved token entry and never places the token in a URL; no raw claim appears in browser history/referrer/analytics/error/CSP evidence; a synthetic unexpected `?claim=` request is ignored/scrubbed by the app and its query value is omitted/redacted before CDN/proxy/app log persistence; an old query link does not silently activate/prefill; consumed/revoked tokens fail; all active legacy URL grants are expired or deliberately reissued before cutover.
- **Deployment steps:** Inventory delivery process; stop URL issuance; wait/revoke/reissue; deploy query removal and tests; verify with synthetic grants; monitor invalid-claim rate without logging token values.
- **Rollback or roll-forward strategy:** Roll forward by issuing a fresh token through the approved channel. Do not restore persistent query credentials as rollback. Revert only UI text if needed.
- **Risks:** Breaking undocumented host workflows, support burden from expired links, accidentally logging tokens during verification, and overengineering a new delivery subsystem unsupported by current requirements.
- **Estimated effort:** M.

### REM-06 — Explicit environment and migration promotion boundary

- **Priority:** P0.
- **Related findings:** `HIGH-MIG-01`, `MED-ENV-01`.
- **Objective:** Make every mutating command target exactly one explicit environment, after a validated immutable artifact exists.
- **Problem being solved:** The combined runner touches production before staging; convenience commands/defaults select production; bootstrap migrates before strict tests/build; one process can hold both credentials.
- **Affected files/modules:** `scripts/run-prisma-migrations.ts`, `scripts/system-orchestrator.sh`, `package.json`, `Makefile`, systemd bootstrap/release jobs, deployment docs, and command-contract tests.
- **Dependencies:** `REM-02`, isolated staging/production credentials, protected deployment environments, and a reliable resource fingerprint supplied by the database/provider.
- **Proposed implementation:** Remove/deprecate the dual-target `deploy:all` path; require a mandatory explicit target with no production default; run one environment/credential per job; fingerprint the target resource before mutation; require staging evidence as an input to a separate protected production job; build/test/sign first, then migrate, then deploy the approved digest; separate runtime, migrator, and backup roles. Enforce protected CI/provider single-flight as the primary concurrency control. Use a PostgreSQL advisory lock only if one demonstrably held session spans the actual Prisma execution, after verifying Prisma 7's own migration-lock behavior. Remove blind whole-command retries: only a failure proven to occur before migration execution and to be transient may retry automatically; after execution may have started, stop and inspect migration/schema state. Ambiguous old aliases must fail with instructions, never fall back to production.
- **Security considerations:** PR/staging jobs cannot read production secrets; URLs are redacted; approval identity is logged; short-lived credentials are preferred; `DATABASE_URL` and `DIRECT_URL` must point to the same approved resource identity.
- **Database considerations:** The migrator receives temporary least-privilege DDL authority; the app role does not. Staging and production are separately locked and audited.
- **Migration requirements:** No application schema change.
- **Backward compatibility:** Intentional breaking operator/CLI change. Update all documented and external callers before deleting aliases.
- **Tests required:** Missing target, unknown target, mismatched fingerprint/URLs, staging failure, production attempt without approval, simultaneous runner, Prisma/native lock behavior, pre-execution transient retry, post-start failure with no automatic retry, dual-credential environment, build failure, and redacted log tests using harmless disposable endpoints.
- **Manual verification:** Inspect actual CI secret scopes, provider resource identifiers, systemd/bootstrap invocation, external schedulers, and branch/environment approvals.
- **Acceptance criteria:** No repository command mutates production by default; no process/job requires both staging and production credentials; staging failure blocks production; build/test success predates migration; a production mutation requires explicit target, matching fingerprint, protected authorization, and proven single-flight behavior; a failure after migration may have started stops for state inspection and is not blindly retried; old ambiguous commands exit non-zero before connecting.
- **Deployment steps:** Add safe commands/tests; switch staging automation; rotate/remove dual-scope credentials; dry-run disposable targets; enable staging gate; update production automation; remove unsafe aliases/defaults.
- **Rollback or roll-forward strategy:** Revert only to a previous explicit single-environment job. Never restore the production-first runner or production default.
- **Risks:** Operator confusion, incomplete external-caller inventory, incorrect fingerprint, and a release stall while credentials are separated.
- **Estimated effort:** M.

### REM-07 — Immutable migration baseline, safe disposition, and expand-contract framework

- **Priority:** P0.
- **Related findings:** `HIGH-MIG-02`, `MED-MIG-01`, `LOW-MIG-01`.
- **Objective:** Determine the real migration state and establish a state-specific, measurable, forward-only path without rewriting applied history.
- **Problem being solved:** The repository contains a destructive non-rolling chain, blocking DDL without explicit budgets, and readiness bound to a manually maintained migration string.
- **Affected files/modules:** `prisma/migrations/**`, `prisma/schema.prisma`, `prisma.config.ts`, `_prisma_migrations`, `scripts/run-prisma-migrations.ts`, `scripts/verify-post-migration.sql`, `src/app/api/health/ready/route.ts`, release manifest/tooling, and migration runbooks/tests.
- **Dependencies:** `REM-01`, `REM-02`, `REM-06`; decisions `D-03`, `D-04`, and numeric migration budgets from `D-10`; read-only database inventory; production-like clone; old/new artifacts. `REM-09` and `REM-10` must pass before any production destructive step.
- **Proposed implementation:** First collect environment/resource identity, PostgreSQL version, migration names/checksums/status/timestamps, application-owned schema drift, table/index sizes, row counts, constraints, and legacy-table state. Then apply the decision matrix in section 6.3, including the mixed state where the main destructive migration is applied but the later legacy cleanup is pending/failed. Re-authoring is allowed only if every persistent/shared/released context proves the destructive files unapplied: in that branch, replace/retire those pending files and regenerate the ordered chain/manifest rather than appending a new migration behind them; reset only authorized disposable environments. Otherwise preserve the files and use the immutable maintenance path. For future work enforce additive schema, dual compatibility, idempotent chunked backfill, validation, new-read cutover, old-binary drain, and delayed contract. Generate an artifact-specific migration manifest plus a two-sided compatibility barrier. Freeze a forward-readable migration-name convention such as `..._compat_db_epoch_<N>_min_app_epoch_<M>`; every old/new readiness implementation generically scans all successfully applied rows for that pattern. Additive/backfill/cutover work stays within the current compatibility epoch; a contract increments the DB epoch and minimum app epoch, so even an artifact built before that unknown future marker parses it and becomes unready.
- **Security considerations:** Read-only inventory credentials, redacted evidence, no outbound integrations from clones, and explicit data-owner disposition for ownership/MFA/cache legacy rows. Migration provenance/checksums are tamper-evident.
- **Database considerations:** Set measured lock/statement budgets; monitor blocked sessions, WAL/disk/replica lag, pool saturation, invalid indexes/constraints, and long transactions. Use `CREATE INDEX CONCURRENTLY` only outside explicit transactions and only after provider/Prisma rehearsal; use `NOT VALID`/`VALIDATE CONSTRAINT` where appropriate; backfill by stable key in bounded resumable transactions.
- **Migration requirements:** Potentially yes, but only after the applied-state decision. Never edit an applied SQL/checksum. Contract cleanup is always a later release.
- **Backward compatibility:** Old and new binaries must coexist through additive/backfill/cutover phases. If the immutable historical migration must run as written, use an approved write freeze/maintenance deployment and declare binary-only rollback unsafe after commit.
- **Tests required:** Empty database; every supported historical snapshot; pending/failed/checksum-mismatch history; ambiguous ownership; non-empty retired tables; production-volume clone; interrupted/resumed backfill; concurrent traffic; old/new binary matrix; compatibility-epoch lower/upper bound; an artifact built before an unknown future contract marker parsing it and becoming unready; lock-budget abort; pre-start retry versus post-start stop; generated manifest drift; post-migration invariants.
- **Manual verification:** Confirm applied state/checksums in every environment, deployment topology, acceptable downtime/write freeze, provider online-DDL behavior, data-volume budgets, legacy-data disposition, and restore time.
- **Acceptance criteria:** Every persistent/shared/release-relevant environment has a signed inventory and no unexplained application-owned checksum/schema drift; a documented decision branch exists for each risky migration; the selected path passes production-like rehearsal within the concrete numeric lock/duration/WAL budgets from `D-10`; old/new coexistence passes where promised; the stable marker parser recognizes an unknown future contract row and makes the older out-of-range/under-minimum artifact unready; constraints/indexes are valid; post-verify succeeds; CI rejects stale manifests, destructive same-release contract, and unbudgeted blocking DDL; no applied migration file is modified.
- **Deployment steps:** Inventory and freeze decisions; restore production-like clone; preflight; backup/PITR gate; rehearse exact path with traffic; archive metrics/evidence; apply staging; validate old/new/readiness; obtain go/no-go; only then execute the protected production sequence.
- **Rollback or roll-forward strategy:** Before contract, roll back the binary while the additive schema remains. After destructive commit, preserve the failed database and use a forward fix or restore/PITR into a new resource followed by controlled cutover. Never run destructive reverse SQL against production data.
- **Risks:** Data loss, downtime, applied-checksum divergence, locks/WAL amplification, invalid ownership assumptions, and falsely treating a maintenance deployment as rolling-compatible.
- **Estimated effort:** XL.

### REM-08 — Immutable artifact and production-equivalent runtime gate

- **Priority:** P1.
- **Related findings:** `HIGH-DEPLOY-02`.
- **Objective:** Prove that a specific commit and artifact digest builds, starts, behaves securely, and degrades safely with production-class dependencies before promotion.
- **Problem being solved:** Static success does not prove standalone packaging, generated assets, native modules, runtime env, proxy behavior, PostgreSQL/Redis connectivity, workers, or security headers.
- **Affected files/modules:** `docker/Dockerfile.security`, build/start scripts, `scripts/validate-security.ts`, liveness/readiness, release pipeline/evidence store, staging proxy/PostgreSQL/Redis/webhook sinks, and smoke tests.
- **Dependencies:** `REM-01`, `REM-02`, `REM-06`, the staging branch of `REM-07`, isolated production-equivalent staging, decision `D-05` about artifact registry/signing and build-time public URL configuration, and the approved `D-14` browser/device/locale matrix. Production promotion also depends on `REM-09` and `REM-10`.
- **Proposed implementation:** Build the production container once after all gates; generate digest, SBOM, vulnerability/license scan, and provenance; deploy that exact digest to staging with synthetic data, staging-only Redis/webhooks/secrets, intended TLS/proxy topology, and the real worker/scheduler model. Exercise non-root/read-only filesystem, startup, live/ready, representative APIs, auth/cookies, CSP/CORS/headers, graceful SIGTERM/restart, dependency outage/recovery, outbox/operations timers, and prior-digest rollback. Resolve whether `NEXT_PUBLIC_SITE_URL` can be runtime-neutral; if not, record that staging and production artifacts are separately built and cannot claim digest promotion equivalence.
- **Security considerations:** No production secret/data in staging; external calls terminate at controlled sinks; SBOM/scan artifacts do not expose env values; image/actions are pinned; proxy identity and TLS are tested end-to-end.
- **Database considerations:** The artifact carries an expected schema manifest; staging migration evidence must match it. Connection pool, TLS, role grants, and maximum replica count are exercised/inspected.
- **Migration requirements:** Staging applies only the approved migration path. No production migration occurs in this task.
- **Backward compatibility:** Run the previous and candidate artifact against the compatible staging schema; verify rollback before any contract migration.
- **Tests required:** Production build, container/image scan, container smoke, runtime header/cookie tests, representative API/E2E, dependency fault injection, graceful shutdown, worker/timer, and prior-digest canary rollback.
- **Manual verification:** Reverse-proxy hops/client IP, registry immutability, runtime resource limits, public URL behavior, actual systemd/container scheduling, SBOM/provenance retention, and artifact approval identity.
- **Acceptance criteria:** Evidence links commit, digest, SBOM, scans, schema manifest, and staging run; live and ready are correct during healthy/unhealthy dependencies; security headers/cookies pass through the intended proxy; synthetic auth/outbox flows pass; Redis/PostgreSQL/webhook failure is bounded and observable; restart loses no durable work. Production may select that exact approved digest only if build-time public configuration is environment-neutral; otherwise the production-specific digest repeats the complete staging-equivalent gate and cannot inherit evidence from a different digest.
- **Deployment steps:** Build/sign/scan; pull/place the digest in controlled staging without starting it or routing traffic; execute the approved state-specific schema phase in the order required by the compatibility matrix; then start the candidate, run readiness/smoke/security/fault/load checks, and only afterward route staging traffic. An additive expand phase may intentionally use a different old/new ordering, but only the tested matrix is allowed. Archive evidence and approve/reject the artifact. Production remains disabled until Phase B exit.
- **Rollback or roll-forward strategy:** Redeploy the prior digest only while schema compatibility is proven. Otherwise follow the `REM-07` forward-fix/restore decision tree.
- **Risks:** Environment-specific build output, native/standalone packaging drift, non-equivalent staging services, accidental production integration, and treating a rebuilt artifact as the tested artifact.
- **Estimated effort:** L.

### REM-09 — Backup, PITR, and timed isolated restore

- **Priority:** P1.
- **Related findings:** `HIGH-OPS-01`.
- **Objective:** Establish and demonstrate recoverability before production data or irreversible migration steps.
- **Problem being solved:** The repository documents backup expectations but cannot prove scheduled backups/PITR, encryption, retention, failure alerting, or a recent application-valid restore.
- **Affected files/modules:** Database-provider backup/PITR, IAM/KMS, alerting, DR evidence/runbooks, isolated restore environment, and `scripts/verify-post-migration.sql`. This may close with external evidence rather than a code PR.
- **Dependencies:** Decision `D-04` (RPO, RTO, retention, failure domain, legal/privacy), provider access, an isolated restore target, and application validation from `REM-01`/`REM-08`.
- **Proposed implementation:** Enable/verify encrypted scheduled backups plus continuous PITR where supported; use a distinct least-privilege backup identity; retain copies across the relevant provider failure domain; monitor backup age/failure/PITR lag; protect deletion/change with MFA/approval/audit. Restore a recent production-format backup into a new isolated resource with outbound integrations disabled, then validate migration history/checksums, row counts, ownership, constraints/indexes, privacy/audit data, and representative application behavior. Rehearse cutover with a write fence, measure the actual recovery-point-to-failure lost-write delta, and define reconciliation/replay or explicit loss disposition before switching resources.
- **Security considerations:** Restored PII remains in a restricted network/account; credentials and dump paths never enter the repository/logs; access/deletion is audited; evidence is redacted.
- **Database considerations:** Verify physical/logical compatibility, extensions, roles/grants, sequences, `_prisma_migrations`, consistency at the recovery point, and sufficient disk/WAL capacity.
- **Migration requirements:** None. A fresh recovery marker/verified backup becomes a prerequisite for every destructive or non-rollback-compatible production step.
- **Backward compatibility:** None.
- **Tests required:** Timed full restore, point-in-time selection, intentional backup-failure alert, application smoke, post-migration verification on the restored target, write-fence enforcement, synthetic post-recovery-point writes, lost-write delta calculation, reconciliation/idempotent replay, and split-brain denial.
- **Manual verification:** Provider console/API configuration, encryption keys, retention/deletion policy, audit logs, backup ownership, measured RPO/RTO, and restore/cutover authority.
- **Acceptance criteria:** An approved RPO/RTO exists; provider evidence shows current successful backups/PITR and alerting; a recent recovery point is restored into a new isolated resource; measured recovery and cutover meet the approved targets; the lost-write/RPO delta is quantified and reconciled/replayed or explicitly dispositioned; data/migration/application verification passes; evidence and the next drill trigger are recorded.
- **Deployment steps:** Configure controls; test alerts; create/identify recovery point; restore into isolated target; validate; destroy/retain the target according to policy; attach evidence to the release gate.
- **Rollback or roll-forward strategy:** Never restore over the failed production database. Preserve it, restore/PITR to a new resource, verify, establish a write fence, reconcile/replay the measured delta, then perform a controlled cutover or choose a forward fix. Never silently discard writes newer than the recovery point.
- **Risks:** False confidence from listing rather than restoring a backup, PII exposure in the drill, unmeasured DNS/application cutover time, and recovery outside the target window.
- **Estimated effort:** L.

### REM-10 — Central telemetry, durable authentication events, and off-host paging

- **Priority:** P1.
- **Related findings:** `HIGH-REL-01`, `MED-REL-01`, `MED-AUTH-02`.
- **Objective:** Make application, Edge, database, security, and worker failures durable, correlated, multi-instance aware, and actionable off host.
- **Problem being solved:** Metrics/traces are process-local or no-op, logging is console-only in code, threshold state is per-process, and credential failures/limiter denials do not reach durable security monitoring.
- **Affected files/modules:** observability contracts, metrics/tracing implementations, enterprise logger, Prisma instrumentation, Edge security middleware, `security-monitoring`, auth/claim/session routes, operational monitor, alert delivery, runtime env, and runbooks.
- **Dependencies:** Decision `D-06` (provider, SLOs, retention, redaction, sampling, page/escalation), `REM-03` actor IDs, `REM-08` staging runtime, and provider endpoints/credentials.
- **Proposed implementation:** Keep current interfaces and add supported external exporters/collectors rather than a broad rewrite. Emit structured service/instance/build/trace identity; centralize logs, metrics, traces, and exceptions; provide an Edge-compatible path; persist privacy-minimized auth outcomes and rate-limit blocks; evaluate thresholds over a shared durable source; deduplicate/escalate off-host alerts. Define dashboards/SLO signals for 5xx, latency, DB pool/errors, Redis failures/503s, auth abuse, dead/stale outbox, worker/timer failures, readiness, and backup freshness.
- **Security considerations:** Default-deny telemetry fields; no raw claim/session/refresh/admin tokens, cookies, passwords, phones, full URLs/query strings, raw IPs, or arbitrary request bodies. Bound tag cardinality, encrypt transport/storage, limit access/retention, and validate provider data residency.
- **Database considerations:** Reuse `SecurityAuditEvent` where suitable; avoid synchronous telemetry writes on critical request paths; size retention/indexes and ensure observability failure cannot exhaust the application DB.
- **Migration requirements:** Prefer none by using existing event fields/JSON. Any new stable actor/event key is additive and follows `REM-07`.
- **Backward compatibility:** Additive dual-publish window; console remains temporary fallback until external receipt is proven. Do not remove local operational DB alerts prematurely.
- **Tests required:** Unit redaction/cardinality/export retry; auth failure/429 persistence; multi-instance threshold; exporter outage; controlled 5xx/slow DB/Redis down/dead outbox/service crash; restart durability; alert dedup/escalation.
- **Manual verification:** Provider receipt/retention/access, dashboards, correlation across proxy/app/DB/worker, page delivery to the actual incident channel, and deletion/redaction behavior.
- **Acceptance criteria:** Controlled 5xx, slow query, Redis failure, dead outbox, admin/guest auth abuse, and service crash appear centrally with build/service/trace correlation; signals survive instance restart; each configured production-severity scenario pages off host exactly according to dedup/escalation rules; sampled events contain none of the prohibited data; exporter failure is visible and does not break requests.
- **Deployment steps:** Approve data contract/provider; deploy exporters dark; validate redaction and dual-publish; build dashboards; enable alerts in staging; run fault drills; enable production collection; test paging before users.
- **Rollback or roll-forward strategy:** Disable a faulty exporter through a safe switch while preserving console/durable security events, then fix forward. Do not silence incident alerts globally.
- **Risks:** PII/credential leakage, high cardinality/cost, synchronous latency, alert storms, vendor outage, and dashboards that aggregate incorrectly across instances.
- **Estimated effort:** XL.

### REM-11 — Stronger guest-password defense

- **Priority:** P1.
- **Related findings:** `MED-AUTH-01`.
- **Objective:** Reject common/compromised new passwords without weakening long-password support, privacy, or non-enumerating auth behavior.
- **Problem being solved:** New credentials accept any 8–128-character value, so a common breached password can protect a booking despite bcrypt cost 12.
- **Affected files/modules:** portal claim/password validation, guest validation/UI text, auth service, error mapping, runtime/config for the chosen breach corpus/service, and tests.
- **Dependencies:** Decision `D-07` on password/account recovery and compromised-password checking mode; `REM-01`, `REM-10` for load and privacy-safe outcomes. No email subsystem should be invented.
- **Proposed implementation:** Adopt a length-first policy with a higher recommended minimum, allow long/passphrase/Unicode input, and check new passwords against an approved compromised-password corpus using a local/offline set or privacy-preserving prefix protocol. Never send/store/log the raw password. Apply to claim/new-password events, not every login. Preserve bcrypt and rate limiting; define bounded behavior when the checker is unavailable.
- **Security considerations:** No composition-rule theater, account enumeration, raw-password telemetry, or unbounded external call. Normalize only with a documented policy that does not surprise existing users.
- **Database considerations:** Existing hashes remain valid. No mass rehash/reset is required; opportunistic hash-policy upgrades may be considered only as separate evidence-based work.
- **Migration requirements:** None.
- **Backward compatibility:** Existing users continue to sign in. Only new password selection changes. Recovery remains a separate product/security decision.
- **Tests required:** Known compromised/common rejection, long/passphrase/Unicode acceptance, boundary lengths, unavailable checker, bcrypt concurrency/latency, no raw password in mocks/logs, and non-enumerating API responses.
- **Manual verification:** Review localized guidance, false positives, privacy properties/provider terms, and a full claim flow on constrained network conditions.
- **Acceptance criteria:** The approved compromised fixtures are rejected; an approved long passphrase succeeds; existing hashes still authenticate; checker failure follows the approved bounded policy; responses do not reveal whether a phone/account exists; no raw password leaves process memory through logs/telemetry/network other than the approved privacy-preserving check.
- **Deployment steps:** Select mechanism/policy; add tests; deploy in staging with metrics that contain no password data; validate latency; enable for new credentials; monitor safe aggregate rejection/error rates.
- **Rollback or roll-forward strategy:** Disable only the compromised-password check through an approved switch if its dependency fails, retaining length/rate/bcrypt controls, then fix forward.
- **Risks:** User lockout without recovery, privacy leak to a third party, latency/availability coupling, Unicode incompatibility, and excessive false rejection.
- **Estimated effort:** M.

### REM-12 — Fresh, signed, replay-safe inbound alert webhook

- **Priority:** P1.
- **Related findings:** `MED-WEB-01`.
- **Objective:** Authenticate the exact request, enforce freshness, and make duplicate external alert events idempotent.
- **Problem being solved:** A static bearer authorizes requests indefinitely; timestamps are not bounded and repeated external events create repeated durable records.
- **Affected files/modules:** `src/app/api/alerts/webhook/route.ts`, raw-body/crypto helper, runtime env/schema, `SecurityAuditEvent` or an additive inbound-receipt model, Prisma schema/migration, docs/OpenAPI, and webhook tests.
- **Dependencies:** Emitter support and key-rotation decision, `REM-01`, `REM-07` for additive migration, and `REM-10` for alerting on invalid/replayed traffic.
- **Proposed implementation:** Require source/key ID, unique event ID, timestamp, and HMAC signature over a canonical version + timestamp + event ID + raw body. Enforce a documented clock-skew window and constant-time comparison. Insert a minimal receipt/idempotency record with a unique `(source,eventId)` key in the same transaction as the event; duplicates return the documented idempotent response without another event. Support overlapping current/next keys for bounded rotation, then remove bearer-only mode.
- **Security considerations:** Sign raw bytes before JSON normalization; bound body/time/cardinality; prevent timing leaks; never echo signatures/tokens; define clock synchronization and replay retention.
- **Database considerations:** Add a small receipt/idempotency structure or equivalent unique columns; index cleanup time; keep receipt+event atomic; retention must exceed the maximum accepted replay horizon.
- **Migration requirements:** Yes, additive unique replay/idempotency storage. Split schema and handler/cutover into separate PRs.
- **Backward compatibility:** Emitter sends both old auth and new signature during a staging verification window; server moves from observe to require; bearer-only production mode is then removed.
- **Tests required:** Valid signature, changed body, wrong key/source, stale/future timestamp, same event replay sequential/concurrent, key rotation overlap/expiry, transaction failure, payload limits, and constant response shape.
- **Manual verification:** Verify emitter canonicalization, clock, key custody/rotation, proxy body preservation, and that a repeated staging delivery creates one durable event.
- **Acceptance criteria:** One valid event creates exactly one receipt and one audit event; identical sequential/concurrent replay creates no second event; stale/future/invalid signatures are rejected; current/next key rotation works for the approved overlap; raw secrets/signatures are absent from logs; bearer-only requests fail after cutover.
- **Deployment steps:** Add receipt schema; deploy dual verification in staging; update emitter; validate; require signatures; rotate once; enable production; remove bearer-only compatibility later.
- **Rollback or roll-forward strategy:** During overlap, temporarily accept the previous signing key, not unsigned/bearer-only traffic. Fix canonicalization forward; retain unique receipts.
- **Risks:** Emitter coordination, clock skew, signature canonicalization mismatch, unbounded receipt growth, and accepting a replay after premature retention cleanup.
- **Estimated effort:** M.

### REM-13 — Route-, risk-, and identity-aware rate budgets

- **Priority:** P1.
- **Related findings:** `MED-ABUSE-01`.
- **Objective:** Prevent one noisy route/client behind shared NAT from exhausting all unrelated API access while retaining a separate abuse-wide guard.
- **Problem being solved:** A single 100/15-minute IP bucket covers every API route before handler-specific controls.
- **Affected files/modules:** `src/lib/security-config.ts`, `src/lib/security-middleware-edge.ts`, Upstash keying/config, sensitive route policies, runtime env, dashboards, and load/security tests.
- **Dependencies:** Decision `D-10` on traffic/SLO/risk classes; real proxy identity; `REM-04` semantics, `REM-08` fault testing, and `REM-10` metrics.
- **Proposed implementation:** Define a small allowlisted risk taxonomy (auth, public write, telemetry, admin, internal, read) from normalized route/method templates; give each an independently measured budget; include authenticated stable identity where trustworthy; retain a broader abuse-wide source budget that cannot starve health/internal/admin classes; keep production Redis fail-closed and sensitive DB limits. Avoid raw dynamic paths or user input in keys.
- **Security considerations:** Do not create bypasses through route variation, spoofable headers, fail-open Redis behavior, raw IP retention, or unbounded key cardinality. Internal endpoints retain their own credentials and limits.
- **Database considerations:** No schema change expected. Validate Redis key TTL/namespace isolation and PostgreSQL limiter cleanup separately.
- **Migration requirements:** None.
- **Backward compatibility:** 429 thresholds/buckets change; response format and `Retry-After` remain stable.
- **Tests required:** Route classification, path-parameter normalization, shared-NAT page journey, noisy telemetry versus auth/admin, authenticated identities, Redis failure/recovery, spoofed proxy headers, cardinality, and distributed load.
- **Manual verification:** Replay a representative staging journey from shared-IP clients and confirm actual proxy-hop identity and no unexplained 429s.
- **Acceptance criteria:** Exhausting the telemetry/public-write budget does not exhaust auth/admin/internal budgets; an abusive source is still constrained by its relevant and abuse-wide budgets; no key contains a raw IP/user value/dynamic ID; Redis loss returns the approved bounded failure; thresholds are linked to recorded load evidence rather than guesses.
- **Deployment steps:** Observe current route volumes; define budgets; shadow/classification metrics; enable in staging; load/fault test; canary production with alerting; adjust only through reviewed config.
- **Rollback or roll-forward strategy:** Roll back one class threshold/key version while retaining identity/risk isolation and distributed fail-closed protection. If an emergency change returns to the shared bucket under a separately authorized incident exception, `REM-13` immediately reopens, remains OPEN rather than PASS, and freezes Phase B promotion/production canary until a measured forward fix restores isolation.
- **Risks:** Misclassification/bypass, shared-NAT false positives, cardinality/cost, and incorrect proxy trust.
- **Estimated effort:** M.

### REM-14A — Full-history and artifact secret discovery/rotation gate

- **Priority:** P0.
- **Related findings:** `MED-SEC-01`.
- **Objective:** Discover and neutralize any credential in repository history or release artifacts before later P0 authentication/migration work is eligible for promotion.
- **Problem being solved:** Current checks cover a short filename/pattern list and can miss credentials in unexpected files, old refs/blobs, generated output, or release artifacts.
- **Affected files/modules:** CI/security scanner configuration, `scripts/validate-security.ts`, `.gitignore`, restricted finding/rotation runbook, release artifact gate, and secret-custody evidence.
- **Dependencies:** `REM-02`; approved maintained history-aware scanner; false-positive, restricted-triage, incident, and rotation procedure; `D-05` CI/runner/artifact protection.
- **Proposed implementation:** Run the scanner over the current tree, every ref/blob, pushes/PR deltas, and release artifacts without printing matched values. Baseline only independently reviewed non-secret fixtures. For every true hit, identify the owning system and exposure window, revoke/rotate it, inspect access/use, invalidate derived access where required, and record incident disposition before continuing. Add current-delta and artifact scans as mandatory gates after the restricted one-time history scan closes.
- **Security considerations:** Scanner output and evidence are access-restricted/redacted; historical deletion or Git rewrite never substitutes for revocation; no example credential passes production validators; staging/production values are independent and least privilege.
- **Database considerations:** Rotation effects on database credentials, peppers, JWT/session keys, claim hashes, and recovery access must be assessed before rotation; this task does not invent data re-encryption for an unconsumed key.
- **Migration requirements:** None.
- **Backward compatibility:** Scanner enforcement has no intended runtime API change. A true credential rotation may intentionally invalidate sessions/tokens or connections and needs its system-specific controlled rotation path.
- **Tests required:** Synthetic secret in the current delta, unexpected filename, old history blob, and release artifact blocks the gate; allowlisted fixture does not; output/log/artifact evidence never reveals the value; deliberate gate failure blocks merge/promotion.
- **Manual verification:** Run the restricted all-ref scan; inspect managed-store/IAM creation age/access, staging/production separation, rotation ownership, and any existing external scanner; verify every true hit's revocation rather than only repository deletion.
- **Acceptance criteria:** The approved all-ref/artifact scan reports zero unresolved true credentials; a synthetic secret in each required location blocks without value disclosure; every true hit has recorded revoke/rotate, access review, consequence validation, and incident disposition; independent staging/production custody is evidenced; later P0 promotion remains blocked while any hit is open.
- **Deployment steps:** Configure restricted report-only scan; triage; rotate/invalidate/investigate true hits; rerun to closure; enable mandatory delta/artifact gates; retain redacted signed evidence.
- **Rollback or roll-forward strategy:** Narrowly correct a false-positive rule or allowlist only a proven non-secret fixture. Never disable global scanning, expose a matched value, un-revoke a credential, or let later P0 work bypass an open hit.
- **Risks:** Secret disclosure in scanner logs, disruptive rotation, false positives, incomplete ref/artifact coverage, unsafe Git-history rewrite pressure, and missed external copies.
- **Estimated effort:** M.

### REM-14B — Truthful runtime-secret contract

- **Priority:** P1.
- **Related findings:** `LOW-ENV-01`.
- **Objective:** Ensure every required runtime secret has a real consumer and tested rotation consequence, without inventing cryptographic use for unused configuration.
- **Problem being solved:** `SECURITY_ENC_KEY_HEX`, its previous value, and `SESSION_SECRET` are required/documented even though the live repository recheck found no runtime consumer, creating misleading startup and rotation obligations.
- **Affected files/modules:** Runtime env schema, orchestrator/bootstrap, `.env.example`, security/deployment documentation, configuration tests, and external consumer inventory.
- **Dependencies:** Closed `REM-14A` scan/custody gate; external deployment/job inventory; `D-05` and `D-11` configuration/secret-store decisions.
- **Proposed implementation:** Generate a config-to-consumer inventory covering application, workers, scripts, deployment jobs, and external integrations. If the three keys remain unused, remove their required status and claims rather than assigning artificial use. Retain only secrets exercised by actual code and document rotation behavior, previous-key overlap only where implemented, owner, and failure semantics.
- **Security considerations:** Do not weaken a proven consumer, log values, or make production defaults. Required staging/production secrets remain independent, least privilege, managed externally, and fail closed where the live consumer requires it.
- **Database considerations:** Document the effects of rotating DB credentials, `SECURITY_PEPPER`, JWT/session keys, and claim/privacy hashes. No schema change or re-encryption is justified for an unused key.
- **Migration requirements:** None.
- **Backward compatibility:** Removing an unused requirement improves startup compatibility. Rotating consumed peppers/JWT/session secrets can invalidate sessions/tokens and requires the already implemented overlap or a planned cutover.
- **Tests required:** Generated consumer-map assertion; minimal valid startup with only truly required values; missing-consumed-secret denial; rotation/previous-key behavior for every retained consumer; orchestrator and documentation contract tests.
- **Manual verification:** Inventory external jobs/services and the managed secret store; verify IAM, age/access, environment separation, owner, and real rotation behavior without recording values.
- **Acceptance criteria:** Every required secret maps to at least one named executable consumer and passing missing/rotation test; the three currently unused keys are either removed from required/documented protection claims or backed by newly discovered existing consumers (not invented scope); minimal staging startup passes; production/staging separation is evidenced.
- **Deployment steps:** Complete external inventory; update env contract/docs/tests; validate minimal staging startup and rotations; promote through the exact artifact gate.
- **Rollback or roll-forward strategy:** Re-add a requirement only if a real pre-existing consumer is proven and tested; fix rotation behavior forward. Never reintroduce misleading requirements merely to preserve documentation.
- **Risks:** Missing an external consumer, invalidating sessions during a retained-secret rotation, startup drift between scripts/app, and overstating what a configured key protects.
- **Estimated effort:** S.

### REM-15 — Consistent keyed IP pseudonymization

- **Priority:** P1.
- **Related findings:** `MED-PRIV-01`.
- **Objective:** Apply the existing secret-keyed, context-separated pseudonymization policy to client-error IP metadata.
- **Problem being solved:** `/api/errors` stores enumerable plain SHA-256 of the source IP while other security paths use `privacyHmac`.
- **Affected files/modules:** `src/app/api/errors/route.ts`, `src/lib/privacyHash.ts`, security event documentation, retention/rotation runbooks, and tests.
- **Dependencies:** `SECURITY_PEPPER` custody/rotation evidence from `REM-14A` and truthful consumer mapping from `REM-14B`; `REM-10` telemetry inspection.
- **Proposed implementation:** Replace the raw hash with `privacyHmac(clientIp, 'client-error-ip:v1')`; keep `unknown` null; document context/version and rotation/retention behavior. Do not attempt to reverse or re-hash old SHA values; let them expire through retention or delete them only under an approved privacy operation.
- **Security considerations:** No raw IP in DB, logs, error details, or telemetry; unique contexts prevent cross-dataset linkage; pepper absence remains fail-closed in production.
- **Database considerations:** Existing `CHAR(64)` remains compatible. Historical hashes require no schema/backfill.
- **Migration requirements:** None.
- **Backward compatibility:** Hash values change and cannot be correlated across versions without an explicit approved transition; API responses are unchanged.
- **Tests required:** Determinism within context, separation across contexts, unknown handling, production missing pepper, DB payload inspection, and no raw/plain-hash logging.
- **Manual verification:** Generate a staging client error and inspect the stored event and central telemetry; review old-event retention.
- **Acceptance criteria:** New client-error events store exactly the v1 HMAC output; the same IP in a different context produces a different value; raw IP/plain SHA is absent from DB/logs/telemetry; production fails closed without the pepper; no historical destructive backfill is attempted.
- **Deployment steps:** Ship helper use/tests; verify in staging; monitor event ingestion; retain/delete old values only under existing policy.
- **Rollback or roll-forward strategy:** Fix forward with a new context version if necessary. Reverting to raw SHA is not an acceptable rollback.
- **Risks:** Breaking legitimate correlation, pepper rotation ambiguity, and accidental raw-IP logging during debugging.
- **Estimated effort:** S.

### REM-16 — Bounded admin and analytics queries

- **Priority:** P2.
- **Related findings:** `MED-DB-01`, `MED-DB-04`.
- **Objective:** Make admin listing/search/statistics and analytics summaries bounded in rows, queries, memory, and reporting window.
- **Problem being solved:** Admin flows load all records and execute N+1/quadratic work; analytics summaries scan full retained tables and query per metric name.
- **Affected files/modules:** `src/app/api/admin/guests/route.ts`, `src/lib/guestDataExport.ts`, `src/lib/guestDataStore.ts`, admin UI pagination, `src/lib/analyticsRepository.ts`, analytics API/UI, schema only if measured indexes/pre-aggregation are justified, and performance tests.
- **Dependencies:** Production-scale synthetic dataset, decision `D-10` on query/latency budgets, `REM-01`, `REM-08`, and `REM-10`. Index work follows `REM-07`/`REM-17` rules.
- **Proposed implementation:** Add cursor pagination and hard page/export caps; push reference/phone/date filters and relations into bounded database queries; replace unbounded `Promise.all`/`checkins.some` with joins/aggregates; separate large export as an explicitly bounded/streamed workflow if required. Require analytics time windows, combine per-metric queries, and use measured pre-aggregation only if direct bounded queries miss budgets.
- **Security considerations:** Preserve admin authorization and data-minimization; cursor values are opaque/validated; exports remain audited; no cache may leak data across principals.
- **Database considerations:** Capture query count, `EXPLAIN (ANALYZE, BUFFERS)`, pool wait, memory, temp files, locks, and p95/p99 at retention-scale data before/after. Add indexes only when plans prove value.
- **Migration requirements:** None for query/pagination changes; any index/summary structure is additive and delivered separately under `REM-07`.
- **Backward compatibility:** Version or adapt list response for pagination; keep single-booking export stable. UI must handle cursors and bounded totals.
- **Tests required:** Pagination ordering/no duplicates/gaps, filters, authorization/export audit, constant query-count assertions across dataset sizes, analytics mandatory windows, scale/load tests, and UI navigation.
- **Manual verification:** Compare representative plans and application p95/p99/pool/memory under concurrent public traffic.
- **Acceptance criteria:** List responses never exceed the configured page cap; SQL count per page is bounded independently of total bookings; statistics use database aggregation without O(bookings × check-ins); analytics endpoints enforce a maximum reporting window and avoid per-name query growth; all measured paths meet the approved budgets without degrading representative public traffic.
- **Deployment steps:** Add API pagination compatibly; update UI; canary admin list; optimize statistics; then bound analytics and observe DB metrics. Deliver any measured index separately.
- **Rollback or roll-forward strategy:** Revert one query/UI slice while retaining hard caps; disable pre-aggregation reads until rebuilt; avoid reverting to an unbounded export in production.
- **Risks:** API/UI contract break, incorrect aggregate semantics, missing records at cursor boundaries, and premature indexing/pre-aggregation.
- **Estimated effort:** L.

### REM-17 — Measured DSAR phone index

- **Priority:** P2.
- **Related findings:** `MED-DB-02`.
- **Objective:** Keep phone-subject export/erasure lookup within the approved transaction/query budget at production scale.
- **Problem being solved:** `StayRequest.phone` participates in privacy lookup but lacks an index, making a sequential scan likely as data grows.
- **Affected files/modules:** `prisma/schema.prisma`, a new forward migration, `src/lib/privacyService.ts`, DSAR export route, migration/plan tests, and post-migration SQL.
- **Dependencies:** Representative cardinality/selectivity and normalized-value evidence; `REM-07`; production-like `EXPLAIN`; `REM-09` before production DDL.
- **Proposed implementation:** First capture parameterized plans for email-only, phone-only, and combined subject predicates. If the phone path misses the approved budget, add the narrowest useful index (and normalize lookup/storage only if evidence proves mismatch). Build online/concurrently outside an explicit transaction when production size/write activity requires it; validate index state and re-capture plans.
- **Security considerations:** Plans/evidence redact subject values; do not add broad searchable copies of PII or log DSAR identifiers.
- **Database considerations:** Measure index size/write cost, selectivity, WAL/locks, and whether the `OR` predicate uses bitmap plans; avoid an index that the planner cannot use.
- **Migration requirements:** Conditional additive index migration; never edit old migrations. Follow concurrent-index recovery/invalid-index cleanup runbook.
- **Backward compatibility:** Additive and query-compatible.
- **Tests required:** Query correctness, case/normalization cases, production-size plan assertions, concurrent writes during index creation, invalid/interrupted index recovery, and erasure transaction timing.
- **Manual verification:** Review `EXPLAIN (ANALYZE, BUFFERS)` in staging, lock/WAL impact, and the final valid index catalog state.
- **Acceptance criteria:** A before-plan documents the issue; if added, the index is valid and the representative phone/combined query meets the approved buffer/time budget without unacceptable write cost; privacy export/erasure results are unchanged; no raw subject value appears in evidence.
- **Deployment steps:** Measure; approve migration; verify backup; create index in staging under traffic; validate/rehearse; deploy protected production DDL; post-verify and monitor.
- **Rollback or roll-forward strategy:** Drop only an unused/problematic new index through a later safe forward migration after confirming no dependency; never roll back data.
- **Risks:** Index unused due to `OR`/normalization, lock/WAL pressure, increased write cost, and leaking PII in query evidence.
- **Estimated effort:** S.

### REM-18 — Batched and observable retention maintenance

- **Priority:** P2.
- **Related findings:** `MED-DB-03`.
- **Objective:** Bound deletion work, transaction duration, WAL, retries, and interference with user traffic.
- **Problem being solved:** Eleven unbatched `deleteMany` calls run in one transaction every five minutes with no row/time budget or checkpoint.
- **Affected files/modules:** `src/lib/operationalMonitor.ts`, operations script/service/timer, retention configuration, metrics/alerts, and integration/load tests.
- **Dependencies:** Retention/DSAR/legal-hold decision `D-13`, production-scale expired data, `REM-10`, and database budgets from `D-10`.
- **Proposed implementation:** Separate retention classes/schedules; delete by indexed cutoff/stable key in bounded transactions; cap rows/runtime per invocation; checkpoint/progress and resume; prevent overlapping workers with a durable/advisory lock; expose deleted/remaining/duration/failure/WAL-related signals; coordinate vacuum/autovacuum and alert on backlog.
- **Security considerations:** Preserve legal/privacy holds and audit retention; prevent arbitrary model/cutoff input; do not log deleted PII.
- **Database considerations:** Verify every cutoff predicate has a usable index; measure dead tuples, WAL, locks, statement timeouts, autovacuum, and replica lag. Keep alert evaluation independent so a retention failure does not suppress alerts.
- **Migration requirements:** None initially; an index/checkpoint model is added only if measurements require it, under `REM-07`.
- **Backward compatibility:** Same retention outcome, reached incrementally rather than atomically in one run.
- **Tests required:** Batch boundaries, resume after failure, concurrent workers, hold preservation, backlog, timer overlap, time/row budget, and load with foreground traffic.
- **Manual verification:** Seed retention-scale expired data; observe locks/WAL/dead tuples/p95/autovacuum; stop/restart midway and confirm progress.
- **Acceptance criteria:** No transaction deletes more than the configured batch; a forced mid-run failure resumes without reprocessing/loss; concurrent invocations do not overlap; protected records remain; alert evaluation still runs; backlog/duration/failure are centrally visible; foreground workload stays within approved budgets.
- **Deployment steps:** Add metrics/locks; enable small batches in staging; tune from evidence; canary one data class; expand class by class; monitor vacuum/backlog.
- **Rollback or roll-forward strategy:** Pause the worker or lower batch size; resume later. Never reverse deleted data—recovery uses `REM-09` only for an actual erroneous deletion incident.
- **Risks:** Retention backlog, policy violation, missed holds, bloat, and timer starvation.
- **Estimated effort:** M.

### REM-19 — Worker-only durable outbox delivery

- **Priority:** P2.
- **Related findings:** `MED-PERF-01`.
- **Objective:** Bound user/admin request latency to the durable transaction and move external webhook delivery exclusively to supervised workers unless a product requirement proves synchronous delivery necessary.
- **Problem being solved:** Several routes await up to five seconds of external delivery even though the event is already committed to an outbox and a worker/timer exists.
- **Affected files/modules:** booking request, arrival request, admin check-in request routes; `src/lib/bookingOutbox.ts`; response contracts/UI; worker/timer; metrics/alerts; tests/docs.
- **Dependencies:** Decision `D-09` on synchronous product semantics; healthy supervised worker evidence from `REM-08`; backlog/paging from `REM-10`.
- **Proposed implementation:** After the aggregate+event transaction commits, return a stable `queued` result without calling `deliverOutboxEvent` in the request. Let the lease/retry/dead-letter worker deliver. Preserve idempotency keys and transactional event creation. Provide delivery state only through the existing authorized operational surfaces; do not poll external receivers from the request.
- **Security considerations:** Keep destination allowlisting/secrets server-side; do not expose receiver errors/secrets; ensure retries are idempotent and privacy erasure races remain controlled.
- **Database considerations:** Verify transaction atomicity, worker lease indexes/capacity, backlog growth, retry scheduling, and shutdown recovery.
- **Migration requirements:** None expected.
- **Backward compatibility:** Booking requests already return `queued`; arrival/admin notification may change from immediate `sent` to `queued`. Document and update clients; do not promise delivery in the request response.
- **Tests required:** Route latency with 5-second/down receiver, enqueue atomicity, exactly one logical event, duplicate request, worker lease race, retry/dead transition, crash/restart, shutdown, and UI response handling.
- **Manual verification:** Fault-inject slow/down receiver under concurrent staging load; verify fast responses, eventual delivery, no duplicate downstream effect, backlog alert, and recovery.
- **Acceptance criteria:** No affected request performs outbound webhook fetch; p95 request latency remains within the approved local-transaction budget when receiver delays/fails; committed events are eventually delivered or become centrally alerted `DEAD`; duplicates do not produce duplicate logical effects; worker restart recovers expired leases.
- **Deployment steps:** Confirm product contract; update response/tests; deploy worker monitoring first; remove one inline path at a time; fault/load test; enable remaining paths.
- **Rollback or roll-forward strategy:** Fix worker capacity/retry forward. Re-enabling inline delivery is not the default rollback because it reintroduces dependency coupling. A temporary exception requires the explicit `D-09` product contract, measured latency/capacity/SLO evidence, an owner/expiry, and incident monitoring; it reopens `REM-19`, remains OPEN, and prevents Phase C exit until worker-only delivery or the separately evidenced synchronous requirement passes.
- **Risks:** Worker not installed/healthy, backlog growth, changed admin UX, downstream non-idempotency, and delayed notification expectation.
- **Estimated effort:** M.

### REM-20 — Correct portal session-status response contract

- **Priority:** P3.
- **Related findings:** `LOW-AUTH-01`.
- **Objective:** Return the verified session booking ID from the actual typed payload.
- **Problem being solved:** The GET route reads nonexistent `session.booking_id` instead of `session.booking?.id`.
- **Affected files/modules:** `src/app/api/portal/sessions/route.ts`, response type/OpenAPI if declared, and route contract tests.
- **Dependencies:** `REM-01` route test support; otherwise independent.
- **Proposed implementation:** Read the booking ID from the verified nested booking payload and make the response type explicit so an invalid property fails type/contract checks.
- **Security considerations:** Continue deriving the booking from the verified DB-backed session; never accept a request-supplied booking ID.
- **Database considerations:** Read-only existing session/booking lookup.
- **Migration requirements:** None.
- **Backward compatibility:** Corrects an omitted/undefined field to its intended value; clients must tolerate the now-present ID.
- **Tests required:** Valid session returns the owned booking ID; expired/revoked/wrong-booking sessions are denied; response schema/type test.
- **Manual verification:** Call the endpoint with a synthetic valid staging guest session and inspect the response.
- **Acceptance criteria:** A valid session returns exactly its verified booking ID; no `undefined`/missing ID is serialized for valid state; invalid sessions still receive the existing denial; TypeScript and route contract tests fail if `booking_id` is referenced again.
- **Deployment steps:** Ship the localized route/test change through normal CI and smoke the endpoint.
- **Rollback or roll-forward strategy:** Simple revert if an undocumented client rejects the field; preferably fix that client forward.
- **Risks:** Undocumented client dependency on the malformed response is unlikely but possible.
- **Estimated effort:** XS.

### REM-21 — Isolated major-dependency maintenance program

- **Priority:** P3.
- **Related findings:** `INFO-DEP-01`.
- **Objective:** Prevent long-term support drift without turning non-vulnerable major upgrades into a production-blocking mega-PR.
- **Problem being solved:** Several packages have newer majors, while the current lockfile audit is clean.
- **Affected files/modules:** `package.json`, lockfile, types/build/test configs, and only the modules affected by each selected upgrade.
- **Dependencies:** Stable `REM-01`/`REM-02`; current vendor advisories/changelogs at execution time.
- **Proposed implementation:** Group upgrades by tightly coupled family, one branch/PR at a time; read breaking/security notes; update types/config/code minimally; run full gates, browser/runtime smoke, and image scan. Prioritize end-of-support or security value, not version count. Keep unrelated UI/refactor work out.
- **Security considerations:** Verify package provenance, maintainer/advisory changes, lockfile integrity, install scripts, and transitive diff. Never use blind `npm audit fix --force`.
- **Database considerations:** None unless a future ORM/database upgrade is separately scoped and migration-rehearsed; none of the informational packages justify schema work now.
- **Migration requirements:** None for this finding.
- **Backward compatibility:** Review per major; preserve runtime/API/browser behavior or explicitly version the change.
- **Tests required:** Full unit/integration/E2E/security/build/image gates plus focused compatibility tests from each changelog.
- **Manual verification:** Browser/device smoke for UI majors, Docker/native-module startup for Sharp/Puppeteer, and current advisory/license review.
- **Acceptance criteria:** Each PR upgrades one coherent family; all required gates and focused compatibility checks pass; no new high/moderate unresolved vulnerability or disallowed license appears; runtime smoke passes; rollback is a clean package/lockfile revert.
- **Deployment steps:** Select highest-value family; update in isolated branch; stage/canary; observe; repeat only after closure.
- **Rollback or roll-forward strategy:** Revert that family's package/lockfile/code changes; do not revert unrelated remediation.
- **Risks:** Transitive behavior changes, TypeScript/ESLint rule churn, browser regressions, and accidental scope creep.
- **Estimated effort:** M.

## 5. Pull request sequence

This sequence treats a task as a workstream and splits it when schema, authentication, frontend, or infrastructure concerns can be reviewed independently. Conditional migration PRs are opened only after `REM-07` state discovery; an external evidence task is not disguised as a code PR.

| Order and title | Objective | Tasks / findings | Likely files or modules | Tests | Dependency | Deployment risk | Rollback strategy | Definition of done |
|---|---|---|---|---|---|---|---|---|
| **PR-01 — test: disposable PostgreSQL integration foundation** | Create safe database lifecycle, fixtures, and migration-from-empty support. | `REM-01`; `HIGH-TEST-01` | `tests/integration/**`, test config, `package.json`, `docs/testing.md`, existing migrations | Test-URL guard, clean/pending/failed history fixtures, fresh-chain test | None | Low runtime; medium CI isolation risk | Revert harness only; retain existing suite | Test guard rejects non-test DB; fresh chain passes deterministically; no real secret/data. |
| **PR-02 — test: claim and refresh concurrency characterization** | Capture current claim ownership and refresh-family invariants before auth changes. | `REM-01`; `HIGH-TEST-01` | `portalAuthService`, refresh repository, portal routes, `tests/integration/auth/**` | One-winner claim, existing-user claim, replay revocation, expiry/logout, cross-booking denial | PR-01 | No runtime; concurrency flake risk | Fix fixtures/time controls; do not delete cases | Each invariant has success/failure/concurrency evidence against PostgreSQL. |
| **PR-03 — ci: mandatory baseline and static migration-history scaffold** | Enforce current quality/integration gates, build-before-migrate ordering, and static history checks without pretending live drift is known. | `REM-02`; `HIGH-DEPLOY-01`; supports `REM-07` | `.github/workflows/**` or equivalent, validation scripts, release docs, static migration-history checker | Intentional unit/integration/lint/build/static-history failure, job-permission and artifact-contract tests | PR-01; CI platform decision | Medium operational | Revert one faulty job, not the protected pipeline | Required checks block merge; PR jobs lack production secrets; the build artifact precedes deploy jobs; full manifest/live-drift enforcement remains explicitly assigned to PR-09. |
| **PR-04 — security: enforce full-history and artifact secret scanning** | Scan all refs/blobs, PR deltas, and release artifacts before more P0 work can be promoted. | `REM-14A`; `MED-SEC-01` | scanner config, CI, restricted security runbook | Synthetic secret in history, odd filename, current delta, and artifact; redacted output | PR-03; approved scanner | Low runtime; high operational impact if a real secret is found | Fix a false-positive rule narrowly; never suppress a real secret globally | All refs/artifacts are covered and findings never disclose values; every real hit is rotated, invalidated, investigated, and keeps later P0 promotion blocked until closure. |
| **PR-05 — security: remove universal admin lockout** | Constrain abusive source A without denying a valid login from source B. | `REM-04`; `HIGH-ABUSE-01` | admin login, sensitive limiter, security tests | A/B source regression, concurrent attempts, reset, DB failure | PR-01/03 | Low behavioral | Forward-fix threshold/key behavior; never restore the global bucket | A is limited, B succeeds, and brute-force, timing, and privacy invariants remain. |
| **PR-06 — security: remove claim credentials from URLs** | End query parsing/persistence while preserving the approved token entry path. | `REM-05`; `HIGH-WEB-01` | guest client, admin token instructions, docs/OpenAPI, proxy/log configuration, browser tests | Query ignore/scrub, approved token-only E2E, hostile legacy query, history/referrer/proxy/app-log/analytics inspection | `D-02`; approved `D-14`; active URL-grant cutover; PR-03 | Medium guest activation | Reissue the token; never restore URL transport or persistence | New flow works; neither approved nor hostile flows retain a claim in URL-derived evidence; legacy grants are expired/reissued. |
| **PR-07 — test: route authorization, outbox, and privacy state** | Close the remaining critical test foundation in reviewable suites. | `REM-01`; `HIGH-TEST-01` | route tests, outbox/privacy modules, PostgreSQL fixtures | Full authorization matrix, lease/retry/crash, hold/export/erasure/rollback | PR-01/03 | No runtime; medium suite complexity | Fix/isolate fixtures; never weaken an invariant | Unauthorized/cross-subject routes deny; durable worker/privacy invariants pass; jobs are mandatory. |
| **PR-08 — deploy: explicit single-environment migration command** | Remove dual-target runner, production defaults, migrate-before-build paths, blind retries, and concurrent execution. | `REM-06`; `HIGH-MIG-01`, `MED-ENV-01` | migration runner, orchestrator, `package.json`, `Makefile`, systemd/release docs | Missing target, fingerprint mismatch, staging failure, dual credential, single-flight/concurrent runner, pre-execution transient failure, ambiguous started execution | PR-03; protected environments/credentials | Medium operator break | Use the prior proven explicit job only; never reintroduce a combined/default production path | One protected job mutates one fingerprinted environment; no blind whole-command retry; build and authorization precede migration. |
| **PR-09 — migration: manifest, drift gate, and two-sided readiness epoch** | Bind artifacts to immutable checked history and make unsupported old/new artifact-schema pairs unready without installing readiness DDL through unsafe pending history. | `REM-07`; `LOW-MIG-01`; supports `HIGH-MIG-02` | migration tooling, readiness route, release manifest, stable marker-name parser, postverify SQL | Checksum/status/allowlisted-drift fixtures; exact epoch predicate; pre-marker artifact sees unknown future contract marker; old artifact on additive/contracted schema; missing migration | PR-01/03/08; completed read-only inventory; `D-10` numeric migration budgets | Medium readiness risk | Revert the manifest consumer while retaining the drift report and unsupported-pair traffic block | Base state derives from known applied checksums; a frozen forward-readable migration-name convention exposes future contract DB/min-app epochs to old code without a new table or forced pending migration; readiness requires valid required checksums, `db.currentEpoch` in `artifact.supportedDbRange`, and `artifact.appEpoch >= db.minAppEpoch`. |
| **PR-10A — migration: conditional schema-only expand** | Replace the proven-unapplied destructive pending branch with an ordered additive expand; do not change reads or delete legacy shape. | `REM-07`; `HIGH-MIG-02`, `MED-MIG-01` | proven-unapplied migration files, state-selected additive migration, generated manifest, postverify SQL | Empty/historical snapshots, authorized disposable reset, old/new binary on expanded schema, lock/WAL/duration budgets | `D-03`; PR-09; signed proof that affected files are unapplied in every persistent/shared/released context | Medium/high DDL | Previous binary remains supported on additive schema; forward-fix the additive object if needed | Only proven-unapplied files are replaced/retired; no additive migration is merely appended behind destructive pending history; ordered chain/manifest is regenerated; authorized disposable DBs reset; expand is independently clone-rehearsed within numeric budgets and preserves every old reader/writer. |
| **PR-10B — migration: dual-compatible application and resumable backfill runner** | Teach application/workers both shapes and provide an idempotent, checkpointed operator without executing it in production. | `REM-07`; `HIGH-MIG-02`, `MED-MIG-01` | compatibility code, backfill runner, checkpoint/progress telemetry, runbook | Pre-expand rejection; expanded unfilled/partial/full states; resume/crash/concurrency; old/new matrix | PR-10A; PR-16 observability contract before production execution | Medium application/data | Redeploy previous binary while expanded shape remains; pause the runner | Dual read/write is deterministic; runner is single-flight, bounded, resumable, side-effect free, and passes clone/load tests. |
| **PR-10C — migration: separate new-read cutover** | Provide a separately reviewable read switch; non-production convergence permits merge, while each environment's own validated backfill permits activation. | `REM-07`; `HIGH-MIG-02` | read-path compatibility flag/code and cutover runbook | Old/new read equivalence, mixed versions, rollback before contract, incomplete-backfill denial | Non-production `REL-MIG-01`; PR-10B; production activation requires production `REL-MIG-01` | Medium/high behavior | Return reads to the old compatible shape; retain new data | The PR merges only after non-production convergence; the switch defaults off; production new reads enable only after production convergence/postverify; previous reads remain immediately selectable; no schema contract occurs. |
| **PR-10D — migration: delayed contract release** | Remove obsolete structures only after a later production compatibility window and complete binary/job drain. | `REM-07`; `HIGH-MIG-02`, `MED-MIG-01` | standalone contract migration named with the frozen DB/min-app epoch marker, postverify and recovery runbook | Artifact built before this marker parses it and becomes unready; drained-worker proof; clone maintenance rehearsal; constraint/data postverify | PR-10C; stable production observation; `REM-09`; explicit go/no-go in a later release | High/irreversible | No binary-only rollback; stop, forward-fix, or restore/PITR under the approved runbook | Contract is its own protected release after fresh recovery evidence/drain; the successfully applied forward-readable marker raises DB/min-app epochs and prevents every older incompatible binary from receiving traffic. |
| **PR-11 — auth: additive admin-principal schema** | Add stable named-principal, role-link, and attribution structures without changing login/session behavior. | `REM-03`; `HIGH-AUTH-01` | Prisma schema, new additive migration, schema-level repository/types | Migration, null/old-row compatibility, constraints/indexes, old-binary compatibility | `D-01`; PR-07/09 | Medium schema | Old binary runs on the additive schema | Schema-only PR migrates safely and does not change routine authentication or authorization. |
| **PR-12 — auth: actor/session dual-write compatibility** | Persist stable actor identity alongside legacy-compatible sessions before provider cutover. | `REM-03`; `HIGH-AUTH-01` | admin auth/session types, session repository, audit relations | Actor persistence, old/new session behavior, revoke/expiry, audit linkage | PR-11 | Medium auth internals | Revert to legacy session reads while retaining nullable additive data | New sessions can carry actor identity; legacy sessions remain explicitly bounded/tested; no OIDC UI/provider dependency is introduced. |
| **PR-13 — auth: OIDC and MFA-protected admin login** | Add named provider login/session creation alongside the temporary legacy path. | `REM-03`; `HIGH-AUTH-01` | admin login/callback/UI, auth adapter, runtime env, session code | State/nonce/PKCE/issuer/audience/MFA, inactive user, cookie/session E2E | PR-12; IdP staging configuration | High auth availability | Keep the bounded legacy path temporarily under a compatibility gate | Two named staging operators authenticate with MFA; invalid provider/MFA cases deny; targeted revoke works. |
| **PR-14 — authz: capability enforcement and actor-attributed audit** | Replace boolean all-powerful authorization per sensitive action. | `REM-03`; `HIGH-AUTH-01` | `rbac.ts`, every admin route/action, audit service, admin UI | Negative matrix for flags/exports/grants/privacy/alerts, role change/revoke | PR-13 | High authorization | Roll back one capability map while named identity remains | Read-only operator receives 403 for prohibited actions; every sensitive action stores actor ID. |
| **PR-15 — auth: retire routine shared-secret administration** | Revoke legacy sessions and disable `ADMIN_DASH_SECRET` for normal production login. | `REM-03`; `HIGH-AUTH-01` | login route/UI, env schema/docs, break-glass runbook | Legacy token/session rejection, emergency-path alert, two-operator access | PR-13/14; enrollment/offboarding proof | High cutover | Audited break-glass only; fix forward | Routine secret login fails; old sessions are revoked; named admins/RBAC/audit all pass. |
| **PR-16 — observability: central exporter adapters and redaction contract** | Export durable structured logs/metrics/traces/errors before P1 controls rely on their evidence. | First half `REM-10`; `HIGH-REL-01` | logger, metrics/tracing, Edge path, Prisma, runtime config | Redaction/cardinality, exporter outage/retry, restart, trace correlation | `D-06`; PR-09; provider staging | Medium performance/privacy | Disable a faulty exporter while retaining local/durable fallback | Controlled signals arrive centrally with build/service/trace identity and no prohibited fields. |
| **PR-17 — security ops: durable auth events and off-host paging** | Aggregate multi-instance abuse/operational thresholds and page reliably. | Second half `REM-10`; `MED-REL-01`, `MED-AUTH-02` | auth routes, security monitor, operational monitor, alert delivery | Auth/429 events, multi-instance/restart, dedup/escalation | PR-16; PR-14 actor identity | Medium alert noise | Disable one noisy rule, not whole paging | Auth abuse and failure scenarios persist and page exactly per tested policy. |
| **PR-18 — auth: compromised-password defense for new credentials** | Add privacy-safe new-password screening and guidance. | `REM-11`; `MED-AUTH-01` | claim validation/service/UI, config, tests | Compromised/common, long/Unicode, unavailable checker, bcrypt load, redaction | `D-07`; PR-16 telemetry/redaction contract | Medium activation UX | Disable only the external checker if approved; retain baseline controls | Approved compromised set rejects; existing login works; no raw password leaves or logs. |
| **PR-19 — webhook: additive inbound receipt/idempotency storage** | Create a minimal unique replay record independently of handler cutover. | `REM-12`; `MED-WEB-01` | Prisma schema/new migration, repository, cleanup policy | Migration, unique concurrency, atomic rollback, retention | PR-09; emitter event-ID contract; PR-16 | Medium schema | Old binary ignores additive table | Unique `(source,eventId)` works under concurrency; no handler behavior changes. |
| **PR-20 — webhook: require freshness and signed raw-body requests** | Authenticate the exact payload and suppress replay. | `REM-12`; `MED-WEB-01` | alert webhook, crypto/raw-body helper, env/docs/OpenAPI | Signature/body change, stale/future timestamp, replay, key rotation | PR-19; emitter dual-sign staging; PR-17 paging | Medium external integration | Previous signing key during overlap, never unsigned bearer | One event/receipt; replay/stale/invalid deny; bearer-only mode is removed after cutover. |
| **PR-21 — abuse: partition API rate-limit budgets** | Isolate route/risk classes and authenticated identities under measured thresholds. | `REM-13`; `MED-ABUSE-01` | security config/Edge middleware/Upstash keys | Classifier, shared NAT, noisy telemetry, Redis/proxy faults | `D-10`; PR-05; PR-16/17 | Medium availability | Roll back one key version/threshold, not identity isolation | Exhausting one class does not deny unrelated critical classes; abuse-wide guard and paging remain. |
| **PR-22 — config: align required secrets with real consumers** | Remove misleading unused requirements and test real rotation consequences. | `REM-14B`; `LOW-ENV-01` | env schema, orchestrator, `.env.example`, docs/tests | Consumer map, minimal valid startup, consumed-secret rotation | PR-04; external consumer inventory | Medium startup config | Re-add only a proven requirement | Every required secret has an exercised consumer; unused keys are not required or claimed. |
| **PR-23 — privacy: keyed HMAC for client-error IP metadata** | Replace enumerable SHA with a context-separated HMAC. | `REM-15`; `MED-PRIV-01` | error route, privacy hash helper/tests | Exact HMAC/context separation, missing pepper, stored payload | PR-22 pepper contract; PR-16 redaction | Low | Introduce a new context/version forward; never return to raw SHA | New events contain only approved HMAC/null; no destructive history rewrite. |
| **PR-24 — db: cursor-paginated admin guest queries** | Remove unbounded reads, N+1 behavior, and quadratic statistics. | First half `REM-16`; `MED-DB-01` | admin guest route/UI, guest store/export | Cursor ordering, filters, SQL count, scale/load, auth/export audit | `D-10` numeric budgets; PR-16 metrics; staging dataset | Medium API/UI | Retain a hard cap while reverting the cursor slice | Page/query count is bounded; aggregates are DB-side; numeric budgets pass. |
| **PR-25 — db: bounded analytics reporting windows and queries** | Avoid full-retention and per-metric query growth. | Second half `REM-16`; `MED-DB-04` | analytics repository/routes/UI | Maximum windows, combined query, plan/p95/load | PR-24 measurement tooling; `D-10` | Medium dashboard semantics | Revert one query while keeping the maximum window | No per-name query growth or unbounded scan; approved numeric budgets pass. |
| **PR-26 — db: measured DSAR phone index** | Add only an index proven necessary by query plans. | `REM-17`; `MED-DB-02` | schema/new migration, privacy queries, postverify | Plans, online creation/interruption, concurrent writes | PR-09; `REM-09`; before/after evidence; `D-10` | Medium DDL | Drop later through a safe reviewed step if harmful | A valid measured index improves the approved plan, or evidence records that no index is needed. |
| **PR-27 — jobs: batched retention with overlap protection** | Bound deletes/WAL/locks and keep alert evaluation independent. | `REM-18`; `MED-DB-03` | operational monitor, timer/service, metrics | Batch/resume/failure/concurrency/hold/load | PR-16/17; `D-10`; `D-13` | Medium data operations | Pause or lower the batch; deleted data is not reversibly recreated | Batch/runtime caps, resumability, holds, and foreground budgets pass. |
| **PR-28 — outbox: remove inline external delivery from requests** | Return after durable enqueue and use a supervised lease worker. | `REM-19`; `MED-PERF-01` | three routes, outbox worker, response UI/docs | Slow/down webhook, route latency, lease/retry/crash/idempotency | `D-09`; PR-16/17; worker/alerts proven | Medium notification behavior | Fix the worker forward; any temporary inline exception requires `D-09`, measured SLO evidence, owner/expiry, reopens `REM-19`, and blocks Phase C exit | No affected handler fetches externally; fast queued response and eventual/dead visibility pass. |
| **PR-29 — api: correct portal session booking ID** | Fix the localized response contract. | `REM-20`; `LOW-AUTH-01` | portal sessions route/type/OpenAPI | Valid/invalid session route contract | PR-07 test foundation | Low | Clean revert | Verified booking ID is returned; the wrong property cannot compile or pass the contract test. |
| **PR-30.x — maintenance: one dependency family per PR** | Upgrade only a justified coherent major family in isolation. | `REM-21`; `INFO-DEP-01` | Family-specific package/lock/config/affected modules | Full gates plus current vendor-specific/browser/native smoke | Phase C stability; live advisory/changelog review | Varies by family | Revert that family only | Every actual family PR re-instantiates all task fields from Section 4 using current evidence. Initial families are separate: types/toolchain, browser/audit tooling, UI libraries, and runtime/native dependencies where applicable. |

### 5.1 Non-PR release and infrastructure gates

| Gate | Related task | Required evidence | Why it is not closed by a code PR |
|---|---|---|---|
| **REL-01 — immutable artifact staging exercise** | `REM-08` | Digest/SBOM/scans/provenance, production-equivalent staging logs, runtime security/smoke/fault results, and the executed `D-14` matrix | It depends on the real registry, proxy, services, and runtime. |
| **REL-MIG-01 — controlled backfill execution and validation** | `REM-07` | Approved target fingerprint, exact runner digest, single-flight lease, checkpoints, numeric lock/WAL/lag/runtime budgets, convergence/postverify report, and go/no-go record | Executing and validating a data backfill is a protected release operation, not a mergeable source-code change. |
| **OPS-01 — backup/PITR and restore drill** | `REM-09` | Provider configuration/audit, backup freshness, isolated timed restore, application/data validation | Backup may exist entirely in the provider and must be exercised. |
| **INF-01 — branch/environment protection** | `REM-02`, `REM-06` | Required checks, bypass restrictions, secret scoping, approval and OIDC evidence | Repository YAML cannot prove organization settings. |
| **INF-02 — central telemetry and paging configuration** | `REM-10` | Provider access/retention, dashboards, page routing/dedup/escalation drill | External signal receipt and human escalation cannot be statically proven. |
| **SEC-01 — production secret custody/rotation** | `REM-14A`, `REM-14B` | Managed-store inventory, independent env values, IAM/access logs, history/artifact scan, consumer map, and rotation drill | Values/custody and external consumers cannot be proved solely from repository changes. |

## 6. Database migration strategy

### 6.1 Non-negotiable rules

1. Applied migration SQL and checksums are immutable.
2. `prisma db push`, ad-hoc production DDL, speculative `migrate resolve`, and destructive down migrations are prohibited release mechanisms.
3. Build/test/sign the application artifact before migration; deploy the already identified digest afterward.
4. One job receives one environment credential. Staging success is evidence for, not part of, a separately authorized production job.
5. Every irreversible step has a fresh recovery point and a successfully demonstrated restore path.
6. Contract/drop work occurs only after old binaries are drained and compatibility evidence is complete.
7. Exactly one protected migration job may execute per target. Prefer CI/provider concurrency controls; use a PostgreSQL advisory lock only if one session demonstrably spans the complete Prisma execution and that behavior is verified for the pinned Prisma version.
8. Never blindly retry a whole migration command. Retry only a proven transient failure that occurred before execution began; once execution may have started, inspect `_prisma_migrations`, schema, locks, and data before choosing resume, forward-fix, or restore.

### 6.2 Baseline the existing schema and migration history

For every persistent/shared or release-relevant development, staging, rehearsal, and production database, collect read-only evidence. A local disposable database that is deliberately reset from the checked-in chain is not required to receive a signed baseline:

- provider/resource identity, `current_database()`, PostgreSQL version, and environment label;
- `_prisma_migrations`: name, checksum, start/finish/rollback timestamps, and applied-step count;
- hashes of every checked-in migration SQL file and comparison with applied checksums;
- `prisma migrate status` and a schema drift diff executed against an isolated clone;
- table/index sizes and row counts for users, bookings, access/legacy tables, refresh tokens, outbox, analytics, stay requests, privacy, alerts, metrics/logs;
- constraint/index validity, duplicate/null/ownership preflight counts, and legacy MFA/cache row presence.

Stop on an unexplained resource identity, applied checksum mismatch, failed/partial state, missing preservation migration, or unexplained application-owned out-of-band schema object. Before drift comparison, maintain and review an explicit allowlist for provider/system/extension-owned objects; the allowlist identifies ownership and rationale and must never hide an application table, column, index, constraint, trigger, function, or policy. Do not “repair” evidence during discovery.

If an existing database has a schema but no trustworthy migration history, first reproduce and diff it on a clone. Baseline/`resolve --applied` is permissible only after exact schema equivalence, file provenance, backup, and an explicit data-owner/release decision; it is never a shortcut for a failed migration.

### 6.3 Decision matrix for the current destructive chain

| Observed state | Required path | Prohibited action |
|---|---|---|
| `20260714150000...` and `20260715110000...` applied successfully in production | Preserve SQL/checksums; run ownership/data/index/constraint post-verification; establish that state as baseline; use expand-contract only for future changes. | Editing/splitting the applied files or pretending they remain pending. |
| `20260714150000...` applied while `20260715110000...` is pending or failed | Preserve the first migration and checksum; export/inspect/classify any non-empty `mfa_*` and `cache` data plus the exact second-migration state; select an audited forward-fix or restore path. Cleanup is a later approved contract only after ownership and preservation decisions. | Deleting guarded rows, editing the first migration, or using `migrate resolve`/ad-hoc DDL to manufacture a clean state. |
| Neither risky migration applied in any persistent/shared/released context | After recorded proof, replace/retire only those unapplied pending files, regenerate the ordered chain/manifest as expand, backfill/read-cutover, and delayed-contract units, and reset only authorized disposable environments. | Assuming absence without querying every environment, or appending an additive migration after the destructive pending files (which would still execute first). |
| Applied in staging but not production | Either recreate staging from an authorized production clone before safe re-authoring, or keep checksums and use a rehearsed maintenance/write-freeze execution. | Silent checksum edit or marking a replacement applied. |
| Failed/partial in any persistent environment | Freeze writes/deploys; preserve state/logs; inspect transaction/schema/data; restore or implement an audited forward fix; resolve only after the underlying state is corrected and documented. | `migrate resolve` merely to clear an error, manual deletion of guarded rows, or guessed ownership. |
| Immutable migration must run against legacy production data | Production-size clone rehearsal; fresh PITR marker; stop old writers; run measured migration under budgets; postverify; start exact new artifact; controlled traffic. This is a maintenance deployment, not rolling compatibility. | Keeping old binaries live after renamed/dropped structures or relying on binary-only rollback. |

### 6.4 Framework for future changes

The normal sequence is deliberately multi-release:

```text
Baseline evidence
  -> Expand schema (additive, old binary compatible)
  -> Deploy compatible binary / dual read-write
  -> Idempotent resumable backfill
  -> Validate data and constraints
  -> Cut new reads; keep old shape available
  -> Drain every old binary and pass compatibility window
  -> Contract/drop in a later release
```

- **Expand:** nullable columns, new tables, and compatibility views; avoid rename/drop/type rewrite in the same release. A PostgreSQL enum value is not automatically compatible with an old generated Prisma client: prove the old client can read it and do not write the new value until old binaries drain, or use an explicitly compatible representation.
- **Dual compatibility:** candidate binary understands both shapes; writes are idempotent and deterministic; rollback does not lose new data.
- **Backfill:** stable-key/keyset batches, bounded transaction/row/time budget, checkpoint, idempotency, pause/resume, retry, progress/lag metrics, and no outbound side effects.
- **Validate:** null/duplicate/ownership/cardinality checks, checksums/counts, application reads, and constraint validation.
- **Cutover:** switch reads only after backfill convergence and mixed-version tests.
- **Contract:** separate later migration after old instances/jobs are proved absent and a new recovery point exists.

### 6.5 Schema drift and readiness

- Generate an ordered migration manifest with file checksums as part of the artifact.
- CI compares repository history, supported historical fixtures, and generated manifest.
- Release preflight compares the whole required applied set, not only one row.
- Readiness implements a **two-sided compatibility epoch/barrier** without a compatibility table. PR-09 freezes a forward-readable migration-directory-name convention, for example `..._compat_db_epoch_<zero-padded-N>_min_app_epoch_<zero-padded-M>`. Every readiness version scans **all** successfully applied, non-rolled-back `_prisma_migrations` rows with a generic parser, including marker names absent from its own manifest. The pre-marker checked history maps to the documented base epoch/minimum without a DB write. Additive/backfill/read-cutover migrations stay inside that compatibility epoch; a later contract migration carries a higher DB/min-app marker. Readiness must never run a pending destructive migration merely to bootstrap metadata.
- The exact compatibility predicate is: all artifact-required names/checksums/statuses are valid **and** `db.currentEpoch` is within `artifact.supportedDbRange` **and** `artifact.appEpoch >= db.minAppEpoch`. An older binary may remain ready on a newer additive schema only while that predicate holds. A successfully applied future contract marker is parseable even by an artifact built before it existed and raises `db.minAppEpoch`, making that artifact unready before traffic.
- Readiness fails when a required migration is missing/failed/rolled back, a required checksum differs, the marker syntax/order is invalid, or either side's compatibility range is unsupported. Tests must cover additive rollback, missing history, malformed/non-monotonic markers, a pre-marker artifact parsing an unknown future contract marker, future unsupported schema, and post-contract old-artifact denial.
- Any application-owned production object outside the versioned contract is a stop condition until reconciled on a clone and recorded. Provider/system/extension objects are accepted only through the reviewed explicit allowlist from Section 6.2.

### 6.6 Backfills, indexes, constraints, and large tables

- Run backfills outside deploy request time through a resumable operator/worker with kill switch and observability.
- Preflight disk/WAL/replica-lag headroom and concurrent write rate; pause when approved thresholds are crossed.
- For a large index, use `CREATE INDEX CONCURRENTLY` only when supported/rehearsed and outside an explicit transaction. Detect and clean an invalid interrupted index through a reviewed forward step.
- For uniqueness, find/remediate duplicates first and build a concurrent unique index where appropriate. Only a suitable non-partial unique index may be attached as a table unique constraint; a partial unique index remains an index-level invariant and must be represented/tested as such rather than falsely treated as an attachable constraint.
- For FK/CHECK on large data, consider `NOT VALID` followed by `VALIDATE CONSTRAINT`, after PostgreSQL/provider behavior is rehearsed.
- Set intentional short `lock_timeout` and bounded `statement_timeout`; an exceeded budget aborts/pause rather than waiting indefinitely or blindly retrying.
- Capture locks, blockers, duration, WAL, disk, temp files, dead tuples, pool wait, replica lag, query p95/p99, and foreground error rate.

### 6.7 Mixed-version deployments

The compatibility matrix must cover the previous and candidate app/worker versions against pre-expand, expanded/unbackfilled, partially backfilled, fully backfilled, cutover, and contracted schemas. Only supported cells may be used in rollout/rollback. Workers, scheduled jobs, and one-off scripts count as binaries and must be drained/upgraded too.

### 6.8 Rollback and roll-forward

- Before contract: stop traffic to the candidate and redeploy the previous digest against the still-compatible expanded schema.
- During backfill: pause and resume/fix forward; never delete new data merely to reverse progress.
- After destructive contract or the immutable historical migration commits: preserve the failed DB and evidence; choose an audited forward fix or PITR/restore into a **new** resource, validate, then cut over.
- For a write-bearing maintenance/restore cutover, first verify backup/PITR and restore capability; then install the explicit write fence, drain in-flight work, record the last durable write markers, and capture/verify the final post-fence recovery point before mutation/cutover. Quantify the RPO/lost-write delta and define reconciliation or idempotent replay before reopening writes. Never silently discard the delta.
- Never restore over the only failed database and never run handcrafted reverse/drop SQL as an emergency rollback.

### 6.9 Migration test, backup, deployment, and post-verification gate

Blocking test matrix:

- empty database to latest;
- every supported historical production snapshot to target;
- pending, failed, rolled-back, and checksum-mismatch history;
- ambiguous ownership/duplicates/invalid phone/non-empty legacy tables;
- production-volume data with representative concurrent reads/writes;
- interrupted/resumed backfill and concurrent runner;
- old/new app and worker compatibility;
- lock/statement budget abort and invalid concurrent index recovery;
- restore followed by the exact migration and postverify sequence.

Production sequence:

1. confirm approved artifact, manifest, change set, maintenance/compatibility plan, and go/no-go authority;
2. confirm healthy backup/PITR capability and a recent successful restore drill; this is not yet the final maintenance recovery marker;
3. run read-only preflight and compare environment fingerprint/checksums/drift;
4. acquire the protected single-flight authority;
5. if the selected path is a maintenance/restore cutover, drain writers, install the write fence, wait for in-flight work, record the last durable-write marker, then capture and verify the final post-fence recovery point. For a rollback-compatible online path, capture a fresh recovery marker under its rehearsed concurrent-write policy;
6. execute the single-environment migration under measured budgets;
7. verify migration rows/checksums, invalid constraints/indexes, ownership/cardinality/null/duplicate invariants, and row counts;
8. start the exact approved digest; require live/ready, representative auth/API/outbox/privacy smoke, and correct headers;
9. canary traffic only if the schema is rollback-compatible. An immutable maintenance migration requires a full controlled cutover after the fence and has no binary-only rollback; monitor errors, latency, locks, pool, WAL/lag, outbox, and alerts in either path;
10. when restore/cutover moved the write authority, calculate the actual lost-write/RPO delta, reconcile or replay it under the approved policy, and verify no split-brain writer remains;
11. record success/failure evidence and keep contract cleanup for its later independently authorized release.

## 7. Security hardening checklist

| Item | Current status | Required action | Related task | Verification method |
|---|---|---|---|---|
| Named admin identities | FAIL | Replace normal shared-secret login with individually managed principals. | `REM-03` | Two distinct operators authenticate and are independently revocable. |
| Phishing-resistant admin MFA | FAIL | Enforce and verify provider MFA evidence. | `REM-03` | Missing/weak MFA denied; approved MFA succeeds; recovery audited. |
| Admin least privilege/RBAC | FAIL | Define capabilities and enforce them per action. | `REM-03` | Negative matrix returns 403 for every unauthorized sensitive action. |
| Admin actor attribution | FAIL | Persist stable operator ID on sessions and sensitive audit events. | `REM-03`, `REM-10` | Inspect flags, exports, grants, privacy, and alert events. |
| Targeted admin revocation/offboarding | FAIL | Revoke one operator/session without rotating everyone. | `REM-03` | Revoke A; A fails immediately while B remains active. |
| Universal admin lockout resistance | FAIL | Remove the anonymous global enforcing identifier. | `REM-04` | Five failures from A; valid login from B succeeds. |
| Guest JWT algorithm and DB session validation | PASS | Preserve and add real integration coverage. | `REM-01` | Invalid algorithm/signature, revoked/expired session, and wrong booking deny. |
| Admin JWT algorithm and DB session validation | PASS | Preserve through named-principal migration. | `REM-01`, `REM-03` | Revoked/expired/wrong-type token denial. |
| Refresh rotation/replay | PARTIAL | Prove live DB concurrency and family revocation. | `REM-01` | One valid rotation; reused token revokes family under concurrency. |
| Claim token randomness/HMAC/one-time use | PARTIAL | Preserve server controls and remove URL transport/persistence. | `REM-05` | Consume/replay/expiry tests plus history/log/referrer inspection. |
| Guest/admin cookie flags | PASS | Reverify on the exact deployed artifact/proxy. | `REM-08` | Browser inspection of HttpOnly/Secure/SameSite/path/expiry. |
| Guest password strength | PARTIAL | Add compromised-password defense for new credentials. | `REM-11` | Common password rejects; long passphrase succeeds; existing login remains. |
| Password/account recovery | NOT IMPLEMENTED | Decide an approved recovery model; do not assume email. | `D-07` | Product/security sign-off and end-to-end recovery test if added. |
| Email verification | NOT IMPLEMENTED | Record N/A for phone-primary identity or create separate scope. | `D-07` | Explicit scope confirmation; test only if introduced. |
| Durable auth failures/limiter blocks | FAIL | Emit privacy-safe durable events and global alerts. | `REM-10` | Trigger failure/429 across instances; central event and page appear. |
| Route authorization / IDOR | PARTIAL | Enforce a complete API/E2E/DAST denial matrix. | `REM-01`, `REM-03` | User A/non-admin cannot access user B/admin resources. |
| JSON content type, size, and schema validation | PASS | Preserve in mandatory route tests/CI. | `REM-01`, `REM-02` | Invalid type, oversize, malformed, and unknown fields reject. |
| SQL parameterization | PASS | Preserve; review every new raw SQL statement. | `REM-02`, `REM-07` | Static review/security lint and parameterized integration tests. |
| CSRF/origin/local redirect behavior | PARTIAL | Complete authenticated DAST and exact-runtime testing. | `REM-01`, `REM-08` | Cross-origin admin/guest mutations and unsafe redirects reject. |
| CSP/HSTS/CORS/referrer/permissions headers | PARTIAL | Verify after TLS/proxy/CDN on the exact artifact. | `REM-08` | Browser/curl header suite including nonce behavior and redirects. |
| HTTPS and trusted proxy identity | NEEDS MANUAL VERIFICATION | Prove TLS termination, hop count, header overwrite, and canonical URL. | `REM-08`, `D-11` | External scan and instrumented requests through every proxy hop. |
| Production Redis fail-closed limiter | PARTIAL | Exercise outage/recovery and namespace isolation. | `REM-08`, `REM-13` | Remove Redis; protected API gets bounded 503; recovery succeeds. |
| Route/risk/identity-aware rate limiting | FAIL | Partition budgets; retain abuse-wide control. | `REM-13` | Shared-NAT/noisy-route load without unrelated critical 429s. |
| Bot/spam resistance | PARTIAL | Measure abuse; add a challenge only if evidence/requirement demands it. | `REM-13`, `D-10` | Synthetic bot/shared-NAT load and accepted residual-risk record. |
| Inbound alert webhook authenticity | PARTIAL | Replace bearer-only mode with signed raw-body requests and rotation. | `REM-12` | Changed body/key/signature rejects; rotation overlap passes. |
| Inbound alert webhook freshness/replay | FAIL | Enforce timestamp window and unique event receipt. | `REM-12` | Stale/future rejects; repeated/concurrent ID creates one event. |
| Outbound webhook idempotency/retry | PARTIAL | Prove downstream idempotency, worker leases, dead-letter operations. | `REM-01`, `REM-19` | Slow/down/duplicate/crash staging receiver tests. |
| Full-history/current/artifact secret scanning | FAIL | Enforce maintained scanner and rotate real findings. | `REM-14A`, `REM-02` | All-ref scan plus synthetic secret block without value disclosure. |
| Secret storage, independence, and rotation | NEEDS MANUAL VERIFICATION | Inventory managed-store/IAM/age/access and exercise rotations. | `REM-14A`, `REM-14B`, `D-11` | Provider evidence and per-secret rotation test. |
| Runtime secret contract accuracy | FAIL | Remove unused requirements or prove real consumers. | `REM-14B` | Generated consumer map; startup/rotation tests. |
| Dependency vulnerability/license controls | PASS | Keep recurring gates; isolate future major upgrades. | `REM-02`, `REM-21` | Release-commit audit/license/SBOM results. |
| Client IP pseudonymization | PARTIAL | Use context-separated keyed HMAC for client errors. | `REM-15` | Stored/logged payload inspection and context-separation test. |
| Log/error redaction | PARTIAL | Validate centrally across proxy/app/worker/exporter. | `REM-10` | Canary fixtures for tokens, phones, URLs, IPs, cookies, passwords. |
| Central logs, metrics, traces, and errors | FAIL | Add durable external sinks with service/build/trace identity. | `REM-10` | Fault signals survive restart and correlate across components. |
| Off-host paging/dedup/escalation | FAIL | Configure and drill actionable pages. | `REM-10` | Controlled page fires exactly per policy and records acknowledgement. |
| DB TLS, least-privilege grants, and pool budget | NEEDS MANUAL VERIFICATION | Inspect provider/app/migrator roles and connection capacity. | `REM-08`, `D-11` | Provider config and concurrent connection/failure test. |
| Migration promotion boundary | FAIL | Enforce explicit staging-first, separate credentials/approval. | `REM-06` | Disposable target tracing proves production cannot start early. |
| Schema drift/checksum enforcement | PARTIAL | Add manifest, all-history comparison, and stop conditions. | `REM-07` | Dirty/checksum-mismatch fixture blocks release. |
| Rolling schema compatibility | FAIL | Use expand-contract/mixed-version matrix or explicit maintenance plan. | `REM-07` | Old/new artifacts pass every promised schema phase. |
| Backup/PITR | NEEDS MANUAL VERIFICATION | Prove automation, encryption, retention, and failure alerts. | `REM-09` | Provider evidence and backup-age/failure alert test. |
| Restore readiness | NEEDS MANUAL VERIFICATION | Complete timed isolated application-valid restore. | `REM-09` | RPO/RTO measurement plus data/app verification. |
| Mandatory CI/protected release | FAIL | Add mandatory versioned gates and verify provider rules. | `REM-02` | Deliberate failure blocks merge and production promotion. |
| Artifact provenance/runtime | NEEDS MANUAL VERIFICATION | Build once, identify/scan/stage/smoke the exact artifact. | `REM-08` | Archived commit/digest/SBOM/scan/runtime evidence. |
| Payment controls | NOT IMPLEMENTED | Confirm no repository/external payment scope; audit separately if present. | `D-08` | Product/architecture/infrastructure inventory attestation. |
| File upload controls | NOT IMPLEMENTED | Record N/A unless a new upload boundary is introduced. | Scope decision | Route/infrastructure inventory. |

## 8. Testing plan

### 8.1 Test layers and launch blocking status

| Category | Required coverage | Environment/data | Measurable pass condition | Blocking for production launch |
|---|---|---|---|---|
| **Unit** | Key construction/HMAC contexts, validation, password policy, webhook canonical signature/freshness, URL scrub behavior, role/capability decisions, cursor mapping, migration-manifest parsing, batch calculations. | Deterministic Node/jsdom; synthetic values; no services. | All cases pass; no sleeps/order/global leakage; every remediation helper has failure/boundary cases. | Per-task blocker, but never sufficient alone. |
| **Integration** | Live PostgreSQL claim/session/refresh, admin principals/RBAC, rate-limit atomics, outbox leases/retries, privacy holds/export/erasure, constraints and retention. | Disposable isolated PostgreSQL migrated from repository; synthetic fixtures. | State invariants and rollback checks pass; DB guard rejects any non-test target. | **Yes.** |
| **API** | Every sensitive method/action: auth/authorization, cookies, origin/CSRF, body type/size/schema, response contracts, idempotency, 401/403/409/429/503 semantics. | Exact Next artifact against test services. | Complete route/action matrix passes; user A/non-admin receives no user B/admin data; unexpected 5xx = 0. | **Yes.** |
| **End-to-end** | Guest token entry without URL leakage, claim, login, refresh/logout, check-in, DSAR; admin OIDC/MFA, role denial, claims/privacy/alerts; navigation/history. | Browser against controlled staging; synthetic identities/data. | Required journeys pass every approved browser/version/device/viewport/OS/locale cell in `D-14`; claim absent from history/referrer/proxy/app logs/analytics; all denial journeys remain denied. | **Yes.** |
| **Security** | Auth bypass/IDOR, token replay/leakage, CSRF/CORS/redirect, rate-limit DoS/bypass/shared NAT, signed webhook replay, headers/cookies, secret scan, dependency/image/SBOM, redaction. | CI plus controlled DAST/fault staging; no production destructive testing. | No High/Critical scanner/DAST result; all known abuse regressions pass; accepted false positives documented. | **Yes.** |
| **Migration** | Empty DB, every supported snapshot, drift/checksum/failed history, ambiguous data, expand/backfill/cutover/contract, concurrent traffic, timeout/invalid index, postverify. | Disposable DB plus a sanitized production-volume clone or restricted approved restore enclave with outgoing integrations disabled. | Selected path completes within numeric `D-10` abort budgets; two-sided artifact/DB compatibility passes; invariants/indexes/constraints are valid; no applied checksum edit. | **Yes.** |
| **Concurrency** | Claim one-winner, refresh replay revocation, admin limiter atomics, webhook idempotency, outbox lease owner, privacy/retention conflicts, single migration runner. | Live PostgreSQL/Redis as applicable; deterministic barriers, not sleeps. | Exactly one permitted winner/effect; no duplicate logical event/data leak; losing operations return documented outcome and preserve state. | **Yes.** |
| **Load/performance** | Shared-NAT page/API journey, auth hashing, admin list, analytics, DSAR, retention under foreground load, slow/down webhook, DB pool, Redis, worker backlog, soak/restart. | Production-equivalent staging and retention-scale synthetic data. | Meets approved p50/p95/p99/error/pool/lock/WAL/backlog budgets and establishes a documented safe traffic ceiling. | **Yes for initial ceiling; blocks traffic above measured ceiling.** |
| **Smoke** | Exact digest start, live/ready, representative public/guest/admin APIs, security headers/cookies, DB/Redis/webhook, worker/timer, SIGTERM/restart, prior-digest rollback. | Every staging/production deployment. | All checks pass against recorded digest/schema manifest; failure halts traffic/promotion. | **Yes on every deployment.** |
| **Manual production verification** | Provider TLS/proxy/IAM/secrets, branch protection, artifact registry, backup restore, alert page, scheduler, rollback/forward authority, incident contacts. | Provider/organization configuration; isolated drills; non-destructive production observations. | Evidence is current, redacted, linked to release, and approved; every High manual item is PASS. | **Yes.** |

### 8.2 Critical scenario inventory

The following scenarios must exist as named, searchable tests/evidence:

- two simultaneous claims for one grant produce one owner and one consumed grant;
- an existing password-bearing phone cannot be linked with a wrong password;
- refresh replay revokes its family; a different family remains valid;
- revoked/expired/wrong-booking sessions cannot read or mutate guest data;
- every admin capability has at least one allowed and one 403 role case;
- five admin failures from A do not deny a valid B login;
- a claim token never appears in browser/proxy/app/telemetry evidence;
- one webhook event ID produces one durable event across sequential/concurrent delivery;
- one outbox event has one active lease owner, recovers after crash, and eventually delivers or becomes visible `DEAD`;
- privacy hold prevents erasure, failed erasure rolls back, successful erasure matches the model inventory;
- destructive/current migration preflight fails safely on ambiguity/non-empty guarded data;
- candidate and previous artifacts coexist for every declared compatible schema phase;
- an intentionally stale migration manifest/checksum prevents readiness/release;
- a restored database passes row/invariant/app smoke before any cutover;
- Redis, PostgreSQL, webhook, and telemetry failures produce bounded behavior and actionable alerts.

For the highest-risk invariants, the suite must be mutation-proven: deliberately break claim atomicity, refresh family revocation, outbox lease ownership, route authorization, URL removal, or migration preflight in an isolated branch and verify the corresponding test fails.

### 8.3 Gate placement

- **Every PR:** unit, static/type/lint/security, focused integration/API tests, migration/schema validation when relevant.
- **Protected main/release candidate:** full live-DB, concurrency, browser E2E, all-ref/delta secret policy, dependency/license, production build, image/SBOM scan.
- **Controlled staging:** exact-artifact runtime security, DAST, migration clone rehearsal, dependency fault injection, load/soak, worker/timer, paging, rollback.
- **Every deployment:** digest/schema smoke and readiness before traffic.
- **Before first production data/traffic:** restore drill, production secret/IAM/proxy evidence, all High closures, Phase B exit.

## 9. Production launch checklist

No `PARTIAL`, `FAIL`, or unresolved `NEEDS MANUAL VERIFICATION` High-severity row can be treated as launch-ready. `NOT IMPLEMENTED` items require an explicit N/A/scope decision; they are not silently considered PASS.

| Launch item | Current status | Blocking condition / required evidence | Related task or decision |
|---|---|---|---|
| Guest login/claim | PARTIAL | Live DB/API/E2E success/failure/concurrency; no URL capability leakage. | `REM-01`, `REM-05`, `REM-11` |
| Admin login | FAIL | Named identities, MFA, targeted revoke; shared secret rejected for routine login. | `REM-03`, `REM-04` |
| Password reset/account recovery | NOT IMPLEMENTED | Explicitly approve an operator-assisted or new secure recovery model; blocker if recovery is a product requirement. | `D-07` |
| Email verification | NOT IMPLEMENTED | Record N/A for current phone-primary flow or create separate audited scope. | `D-07` |
| Session creation/refresh/revocation/logout | PARTIAL | Live DB and concurrency suite passes expiry/replay/logout/wrong-booking cases. | `REM-01`, `REM-03` |
| Authorization / IDOR | PARTIAL | Complete route/action negative matrix, admin roles, DAST. | `REM-01`, `REM-03` |
| Request validation/body limits | PASS | Preserve through mandatory API tests; no unexplained bypass. | `REM-01`, `REM-02` |
| Rate limiting | PARTIAL | Admin universal lockout fixed; risk partitions/shared-NAT/Redis fault pass. | `REM-04`, `REM-13` |
| Bot/spam protection | PARTIAL | Measured abuse/load acceptance or evidence-backed additional control. | `REM-13`, `D-10` |
| HTTPS/canonical origin | NEEDS MANUAL VERIFICATION | TLS/cert/redirect/canonical URL and real proxy topology pass external checks. | `REM-08`, `D-11` |
| Security headers/cookies | PARTIAL | Exact artifact behind intended proxy passes CSP nonce, HSTS, CORS, referrer, cookie tests. | `REM-08` |
| Secret management | NEEDS MANUAL VERIFICATION | Managed store, least privilege, independence, all-ref scan, consumer map, and rotation evidence. | `REM-14A`, `REM-14B` |
| Environment separation | FAIL | Staging jobs have no prod credentials; no default/combined production command. | `REM-06` |
| Migration baseline/drift | FAIL | Signed state/checksum inventory; no unexplained drift/failed migration. | `REM-07` |
| Migration safety/mixed versions | FAIL | Selected path rehearsed under budgets with backup and compatibility/maintenance proof. | `REM-07`, `REM-09` |
| Database constraints/indexes | PARTIAL | Postverify shows all required constraints/indexes valid; partial uniques exercised. | `REM-01`, `REM-07`, `REM-17` |
| Database TLS/grants/pool | NEEDS MANUAL VERIFICATION | App/migrator/backup roles and maximum connections fit capacity. | `REM-08`, `D-11` |
| Scheduled backups/PITR | NEEDS MANUAL VERIFICATION | Current successful encrypted backup/PITR, retention, failure alert evidence. | `REM-09` |
| Restore test | NEEDS MANUAL VERIFICATION | Recent isolated timed restore meets approved RPO/RTO and app/data checks; write fence, cutover, lost-write delta, reconciliation/replay, and split-brain prevention are rehearsed. | `REM-09`, `D-04`, `D-12` |
| Payment live mode, webhook, refund, reconciliation | NOT IMPLEMENTED | Confirm payment is absent everywhere; otherwise stop and audit separately. | `D-08` |
| Inbound alert webhook verification | FAIL | Signed freshness/replay/rotation tests and emitter cutover pass. | `REM-12` |
| Outbound booking/check-in webhooks | PARTIAL | Receiver idempotency, slow/down behavior, worker retry/dead/recovery pass. | `REM-01`, `REM-19`, `D-09` |
| Central monitoring/errors/traces | FAIL | Exact artifact signals survive restart and correlate centrally. | `REM-10` |
| Alerting/on-call delivery | FAIL | Controlled 5xx/auth abuse/Redis/dead-outbox/slow-DB/service-crash pages per policy. | `REM-10`, `D-12` |
| Logs/redaction/retention | PARTIAL | Central samples contain no prohibited credentials/PII and retention/access is approved. | `REM-10`, `REM-15` |
| Liveness/readiness | PARTIAL | Exact artifact reports correct states for schema, DB, Redis, startup/shutdown. | `REM-07`, `REM-08` |
| Artifact build/SBOM/scan/provenance | NEEDS MANUAL VERIFICATION | Commit/digest/SBOM/scan/provenance and registry immutability evidence archived. If production needs a different build-time `NEXT_PUBLIC_SITE_URL`, the production-specific digest repeats every staging-equivalent gate and does not inherit another digest's evidence. | `REM-02`, `REM-08`, `D-05` |
| Load/soak/capacity ceiling | NOT IMPLEMENTED | Production-equivalent test establishes approved initial traffic/resource ceiling. | `REM-08`, `REM-13`, `REM-16`–`REM-19`, `D-10` |
| Deployment smoke | NEEDS MANUAL VERIFICATION | Digest/schema smoke passes before traffic for staging and production. | `REM-08` |
| Binary rollback | PARTIAL | Prior digest rollback rehearsed only on compatible schema. | `REM-07`, `REM-08` |
| Database forward-fix/restore decision | FAIL | State-specific runbook rehearsed; no destructive down migration. | `REM-07`, `REM-09` |
| Workers/timers | NEEDS MANUAL VERIFICATION | Installed/enabled, single-flight, restart-safe, failure-paged. | `REM-08`, `REM-10`, `REM-18`, `REM-19` |
| Incident contacts/procedure/authority | NEEDS MANUAL VERIFICATION | Current incident channel, escalation, go/no-go, rollback, restore, and break-glass authority recorded and drilled. | `D-12` |

## 10. Implementation phases

### Phase A — Production blockers (P0 only)

**Scope:** `REM-01` through `REM-07`, plus the early secret-discovery/rotation gate `REM-14A`.

This phase builds the test/CI safety net, runs the full-history/artifact secret gate before later P0 promotion, closes the admin availability and claim-credential flaws, introduces named/MFA administration through compatibility steps, separates environment/migration authority, and establishes the immutable migration baseline and safe disposition. External P1 controls are inventoried here but not claimed complete.

No production traffic or production migration is allowed. Disposable exploratory staging may be used under the audit's restrictions, but its results are not promotion evidence until the Phase A gates are in place.

### Phase B — Controlled staging and real-user safety (P1)

**Scope:** `REM-08` through `REM-13`, `REM-14B`, and `REM-15`, plus production-equivalent validation of every P0 result.

The first activity is deployment of the exact candidate artifact to isolated controlled staging. The application-facing staging environment uses synthetic or irreversibly sanitized data, staging-only identities/secrets/integrations, restricted access, and disabled/controlled outbound delivery. It is used for runtime security, DAST, auth, webhook, Redis/DB/webhook fault injection, central observability/paging, secret/config, password, rate-limit, privacy validation, and a baseline load/soak test that establishes a conservative initial canary ceiling.

No real user, production PII, or production migration is allowed in application-facing staging before this phase exits. A separate, tightly restricted restore/migration rehearsal enclave may contain production-format or approved restored data only under `D-04` privacy, network, IAM, retention/deletion, audit, and outbound-disable controls; it is never exposed as normal staging and its evidence is redacted. A P1 task may be conditionally N/A only with explicit requirement/evidence (for example an inbound webhook disabled in production); a High finding cannot be silently deferred.

### Phase C — Limited production readiness and operational hardening

**Scope:** `REM-16` through `REM-19`, load/soak/capacity evidence, canary procedures, and production smoke/incident drills.

After Phase B exit, a deliberately small limited-production canary may begin within the measured capacity ceiling. Database queries, indexes, retention, and outbox request coupling are remediated where measured budgets require it. Limits are evidence-based, not guessed.

### Phase D — Growth readiness and maintenance

**Scope:** `REM-20`, `REM-21`, recurring restore/migration/secret/incident drills, capacity forecasting, and only evidence-backed future scale work.

Growth beyond the Phase C ceiling requires headroom evidence and stable operational ownership. No cache, queue, payment, email, upload, multi-tenancy, or platform rewrite is added without a separate requirement/finding.

## 11. Phase exit criteria

### 11.1 Phase A exit

All of the following are required:

- `REM-01` critical live-DB/API/concurrency foundations pass and are mandatory.
- `REM-02` CI is mandatory; an intentional failure blocks merge; build precedes every migration job.
- `REM-14A` reports zero unresolved true credentials across all refs/artifacts; synthetic current/history/artifact fixtures block without disclosure; every true hit is revoked/rotated/investigated before further P0 promotion.
- `REM-04`: failures from source A do not deny valid admin B; A remains constrained.
- `REM-05`: active URL-distributed claim grants are cleared/reissued and new claims are absent from URL/history/referrer/log/analytics evidence.
- `D-14` is approved before PR-06 and the focused claim journey passes its required browser/device/locale cells; the complete candidate matrix remains a Phase B runtime gate.
- `REM-03`: two named operators authenticate with MFA; targeted revocation and the agreed role-denial matrix pass; routine shared-secret production login is disabled; sensitive actions carry actor IDs.
- `REM-06`: no default/combined production command exists; staging and production credentials/jobs are separate; target fingerprint and protected authorization are enforced.
- `REM-07`: each persistent/shared or release-relevant environment has a recorded migration/checksum/drift inventory completed before PR-09 assumptions are accepted; the current destructive chain has a state-specific decision; `D-10` supplies numeric migration abort budgets; clone rehearsal and two-sided manifest/readiness tests pass; no applied SQL is changed.
- There is no unresolved P0 acceptance criterion or unexplained Critical/High regression in the Phase A scope.
- The controlled application-facing staging environment has synthetic/irreversibly sanitized data, staging-only secrets/Redis/webhooks, no production credentials, restricted access, and controlled outbound sinks. Any production-format restore rehearsal is confined to the separately approved restricted enclave.

**Recommended controlled staging deployment point:** immediately after these criteria pass. It is the transition from Phase A to Phase B and the mechanism used to close `HIGH-DEPLOY-02`; it is not production approval.

### 11.2 Phase B exit

All of the following are required:

- `REM-08`: exact commit/digest/SBOM/scan/provenance passes production-equivalent staging startup, security, smoke, fault, graceful restart, worker, and prior-digest tests.
- `REM-09`: backup/PITR/retention/failure alerting is evidenced and a recent isolated restore meets approved RPO/RTO with data/application verification, rehearsed write fence/cutover, quantified lost-write delta, reconciliation/replay, and split-brain prevention.
- `REM-10`: central telemetry survives restart; controlled 5xx, Redis failure, auth abuse, dead outbox, slow DB, and service crash produce correlated signals and tested off-host paging without prohibited data.
- `REM-11` through `REM-13`, `REM-14B`, and `REM-15` meet their acceptance criteria or an explicitly scoped feature-disabled/N/A condition is proven. Generic “accepted risk” is not evidence.
- All ten High findings are closed: confirmed code findings have passing tests/runtime evidence and manual High findings have recorded PASS evidence.
- Full API authorization matrix, the explicit `D-14` browser/device/locale E2E matrix, DAST, migration, concurrency, image/secret, and deployment smoke suites pass on the candidate.
- Baseline load/soak covers shared NAT, auth, current admin/analytics queries, retention, webhook/outbox, DB pool, Redis, and workers; it establishes a conservative initial traffic/data ceiling. Any P2 finding that cannot meet that ceiling is promoted and remediated before canary.
- Production/staging secrets, TLS/proxy identity, DB grants/pool, Redis namespace, webhook sinks, timers, branch/environment protection, and incident authority are manually verified.
- Production migration/rollback/forward-fix and go/no-go runbooks reference the exact artifact/schema state and current recovery evidence.

Only after this exit may a limited production canary be considered.

### 11.3 Phase C exit

All of the following are required:

- A load/soak result defines the allowed traffic/data/instance ceiling and approved p50/p95/p99/error/pool/lock/WAL/backlog budgets.
- `REM-16`: admin/analytics page size, SQL count, reporting window, memory, and latency are bounded and measured.
- `REM-17`: the DSAR plan meets budget, with a valid measured index if required.
- `REM-18`: the `D-13` retention/DSAR/legal-hold policy is approved; retention batches resume safely, preserve holds, do not overlap, expose backlog/failures, and stay inside foreground/WAL/lock budgets.
- `REM-19`: receiver failure no longer holds affected request paths. A genuinely synchronous product requirement may substitute only with explicit `D-09` semantics and passing capacity/SLO/fault evidence; a temporary inline rollback exception leaves the task OPEN and cannot satisfy this exit.
- Canary production smoke passes on the promoted digest/schema manifest; no unresolved Sev-1/Sev-2 event remains.
- Backup freshness, readiness, error/latency SLOs, DB saturation, Redis, workers/outbox, and paging stay within approved bounds throughout the observation window.
- Binary rollback while compatible and the forward-fix/restore decision path have been rehearsed.

### 11.4 Phase D exit

All of the following are required before declaring growth readiness:

- `REM-20` is closed and `REM-21` upgrades are either completed family-by-family or explicitly scheduled by support/security value.
- Capacity headroom covers the approved growth forecast without crossing Phase C saturation limits.
- Restore, migration, secret rotation, failover/incident, and paging drills have recurring triggers and retained evidence.
- Dependency, runner/action, image-base, and license/advisory updates are recurring and auditable.
- Runbooks, escalation, break-glass, restore, and release authority are current and do not depend on undocumented knowledge.
- Any new payment/email/upload/cache/queue/multi-tenant boundary has its own requirement, threat model, tests, and launch gate.

## 12. Risks and unresolved decisions

### 12.1 Decisions required before implementation or promotion

| ID | Decision required | Why it cannot be inferred safely | Blocks |
|---|---|---|---|
| `D-01` | Admin identity provider/protocol, phishing-resistant MFA, operator lifecycle/recovery, role/capability matrix, and break-glass model. | No identity provider or named admin domain exists in the repository. | `REM-03`, PR-11–15, Phase A exit. |
| `D-02` | Approved claim delivery UX: default token-only manual entry, or a separately threat-modeled non-URL one-time exchange if clickable links are mandatory. | The repository only shows/copies tokens; external host delivery behavior is unknown. | `REM-05`, PR-06. |
| `D-03` | Actual migration/checksum state per persistent environment, whether staging may be recreated, deployment topology, and permitted maintenance/write freeze. | Repository files cannot reveal live `_prisma_migrations` or running instances. | `REM-07`, conditional PR-10A–10D, any production migration. |
| `D-04` | RPO, RTO, backup retention/encryption/failure domain, restore frequency, and legal disposition of legacy/backup data. | These are business/provider requirements. | `REM-09`; production data; destructive migration. |
| `D-05` | CI platform, branch/environment protection, registry/signing/provenance, runner trust, and staging/prod public-URL artifact strategy. | External organization/provider configuration is unknown; `NEXT_PUBLIC_SITE_URL` is currently a build input. | `REM-02`, `REM-08`, immutable promotion claim. |
| `D-06` | Observability provider, data region/retention/access, SLOs, sampling/cardinality, paging channel, dedup, and escalation. | No external sink/on-call contract is in the repository. | `REM-10`, Phase B exit. |
| `D-07` | Guest password minimum/guidance, compromised-password checker failure policy, and supported account recovery; whether email verification is N/A. | There is password auth but no reset/email verification subsystem or requirement. | `REM-11`; launch checklist disposition. |
| `D-08` | Confirm whether any external/hidden payment, refund, ledger, checkout, or payment webhook exists. | Current repository has none, but external business flows are unknown. | Payment checklist attestation; separate audit if yes. |
| `D-09` | Whether immediate outbound webhook delivery is a hard product requirement and the downstream idempotency/SLA contract. | Current code both enqueues and attempts inline delivery; intent is ambiguous. | `REM-19`. |
| `D-10` | Approve **numeric** initial traffic/data/instance ceilings; p50/p95/p99/error budgets; migration lock-wait, statement duration, WAL growth, disk/replica-lag, connection-pool and foreground-error abort thresholds; shared-NAT assumptions; rate-limit classes/thresholds; and bot-risk acceptance. Record units, measurement window, abort owner, and evidence source. | No production traffic/capacity evidence or objectives exist; adjectives such as “short”, “bounded”, or “low” are not executable gates. | `REM-07`, `REM-13`, `REM-16`–`REM-19`, PR-09/10A–10D, Phase A migration rehearsal and Phase C. |
| `D-11` | Hosting topology, TLS/CDN/WAF, trusted proxy hops, staging/prod isolation, DB TLS/grants/pool/instances, Redis plan/namespace, and worker scheduler. | These controls live outside the repository. | `REM-06`, `REM-08`, launch infrastructure gates. |
| `D-12` | Incident contacts/channel, escalation, release go/no-go, emergency bypass, break-glass, binary rollback, restore, and cutover authority. | Organizational authority cannot be assumed. | Phase B/C exits and every production release. |
| `D-13` | Retention/DSAR/legal-hold periods and acceptable maintenance schedules. | Code has defaults, but policy ownership and production volume are unknown. | `REM-18`, backup retention, privacy verification. |
| `D-14` | Supported browser, browser-version, device/viewport, operating-system, and locale matrix, including the required Greek and English claim/admin journeys and accessibility baseline. Approve the matrix before PR-06; run the focused claim cells in Phase A and the complete candidate matrix in Phase B. | “Supported browsers” is not defined in the repository, so E2E acceptance cannot be measured consistently. | `REM-05`, PR-06 and Phase A focused claim exit; `REM-08`, `REL-01`, full browser E2E and Phase B exit. |

### 12.2 Principal delivery and production risks

| Risk | Trigger / failure mode | Mitigation in this plan |
|---|---|---|
| Applied migration history is edited | Re-authoring risky SQL without checking shared DB state. | Immutable checksums, signed inventory, state decision matrix, CI drift gate. |
| Authentication turns into a large rewrite | Building custom credentials/MFA and changing auth/RBAC/schema/UI together. | Managed identity preference and PR-11–15 schema/session/provider/capability/retirement split. |
| Admin availability regresses | New limiter/IdP/role mapping blocks all operators during an incident. | Independent source-A/B fix, two enrolled operators, targeted revoke, tested break-glass. |
| Claim capability leaks during “compatibility” | Legacy link remains logged/history-visible or moved to browser storage. | Stop URL issuance, clear active grants, manual token default, explicit evidence inspection. |
| Green CI creates false confidence | Live DB/E2E/migration paths remain outside coverage or gates are bypassable. | `REM-01`, mutation proof, branch/environment protection and deliberate failure tests. |
| Migration blocks or loses data | Unbounded locks/rewrite, old binary after drops, invalid legacy assumptions. | Clone/load rehearsal, budgets, write freeze if unavoidable, backup/restore, no reverse SQL. |
| Staging is not production-equivalent | Different artifact, build URL, proxy, Redis, data shape, scheduler, or DB behavior. | Digest/schema evidence, explicit equivalence gaps, production-like clone and manual topology checks. |
| Backup exists but cannot restore | Stale/corrupt/inaccessible copy or slow cutover. | Timed isolated restore with application validation and approved RPO/RTO. |
| Observability leaks PII/secrets or overloads service | Raw URL/token/phone/IP/password fields, high-cardinality tags, synchronous export. | Allowlisted redaction contract, cardinality bounds, staging canaries, exporter fallback/fault tests. |
| Alerting is noisy or silent | Per-instance thresholds, exporter outage, bad dedup/escalation. | Shared durable signals, multi-instance/restart drills, exact page scenarios. |
| Performance fixes create schema/load incidents | Unmeasured index/pre-aggregation/backfill or large one-shot delete. | Plan-first measurement, separate migration PRs, online techniques, batching/pause. |
| External scope invalidates the verdict | Hidden payment/email/CI/backup/proxy behavior differs from repository assumptions. | Explicit attestations and manual verification; new trust boundary gets separate audit. |
| Emergency bypass becomes normal path | CI/admin/migration controls are disabled to ship. | Narrow audited authority, expiry, evidence, and fix-forward requirement; never global silent disable. |

The recommended production path requires every launch-blocking finding to close with PASS evidence or a proven feature-disabled/N/A disposition. A governance exception may separately record risk acceptance only if organizational policy permits it; it must identify the exact open finding/criterion, compensating control, evidence, owner, expiry/review trigger, and rollback/incident response. It remains OPEN, cannot convert an unverified control into PASS, and does not satisfy this plan's Phase B production gate.

## 13. Manual and infrastructure verification items

These checks are future execution requirements. They were not performed while creating this plan and must not expose secret values in evidence.

| Area | Manual/infrastructure verification | Required evidence | Blocks / relates to |
|---|---|---|---|
| Source control | Existing external CI, branch protection, required reviews/checks, signed commits/provenance, bypass accounts. | Screenshots/API export or policy record tied to repository/default branch. | `REM-02`, `HIGH-DEPLOY-01` |
| CI runners | Runner isolation, pinned actions/images, fork permissions, cache poisoning controls, OIDC and log/artifact retention. | Runner/workflow security review and deliberate untrusted-PR test. | `REM-02`, `D-05` |
| Artifact registry | Immutability, digest promotion, signature/attestation verification, SBOM/scan retention, deletion access. | Registry policy and candidate digest record. | `REM-08` |
| Build/runtime | In controlled staging run `npm ci`, `npm run validate:security`, production container build/scan/SBOM, startup, live/ready, representative smoke. | Command logs/results tied to commit/digest; generated changes not committed unless intended. | `REM-08`, `HIGH-DEPLOY-02` |
| Public URL/artifact | Determine whether staging and production require different `NEXT_PUBLIC_SITE_URL` build outputs. | Recorded build-once compatibility decision and verified runtime behavior. | `D-05`, `REM-08` |
| Admin IdP | Issuer/audience/client config, MFA policy, enrollment/offboarding/recovery, group/role mapping, audit logs, outage/break-glass. | Two-operator staging drill and provider policy export. | `REM-03`, `D-01` |
| Claim delivery | Identify every host/support process that creates or sends claim URLs/tokens and maximum active TTL. | Delivery inventory, active-grant cutover/reissue record, channel approval. | `REM-05`, `D-02` |
| Secrets | Managed-store inventory, generation strength, environment independence, age/access, rotation owner/runbook, and consumer mapping; no values recorded. | Redacted metadata and successful rotation behavior. | `REM-14A`, `REM-14B`, `D-11` |
| History scan | Approved scanner over all refs/blobs and release artifacts; triage without value exposure. | Restricted signed result and rotation records for any true hit. | `REM-14A` |
| TLS/CDN/proxy | Certificate/HTTPS redirect/HSTS, canonical origin, hop count, overwrite of forwarded headers, WAF/CDN cache/CORS behavior. | External scan and instrumented request traces. | `REM-08`, `D-11` |
| Redis/Upstash | Separate namespace/token, TLS/provider availability, quotas/retention, fail-closed outage/recovery, shared-NAT behavior. | Provider config and fault/load results. | `REM-08`, `REM-13` |
| Database identity | Exact resource/environment fingerprint and PostgreSQL version for every DB; staging/prod credential separation. | Redacted inventory and connection-role mapping. | `REM-06`, `REM-07` |
| Migration state | `_prisma_migrations` names/checksums/status, schema drift, table/index sizes, legacy rows, ownership/duplicate preflight. | Signed read-only baseline for each environment. | `REM-07`, `D-03` |
| DB security/capacity | TLS verification, app/migrator/backup grants, connection proxy/pool, max instances, statement/query/lock settings. | Provider/config review and controlled connection/failure test. | `REM-08`, `D-11` |
| Migration rehearsal | Sanitized production-volume clone, exact candidate path, old/new binary matrix, single-flight behavior, locks/WAL/lag/duration, no-blind-retry failure handling, and postverify. | Rehearsal report against the numeric `D-10` thresholds and a signed go/no-go record. | `REM-07`, `D-10` |
| Backup/PITR | Schedule, encryption/KMS, retention/failure domain, deletion/access audit, backup-age/failure/PITR-lag alerts. | Provider policy/current-success evidence. | `REM-09`, `D-04` |
| Restore | Restore a recent point into an isolated new resource; validate migration history, rows, constraints and application; rehearse write fence, final durable-write marker, cutover authority, lost-write/RPO delta calculation, reconciliation/idempotent replay, split-brain prevention, and reopening writes. | Timed RPO/RTO report, quantified/reconciled write delta, cutover evidence, and cleanup/retention record. | `REM-09`, `D-04`, `D-12` |
| Inbound webhook | Emitter canonicalization, clock, unique event ID, signing keys/rotation, proxy raw-body preservation. | Dual-sign/replay/freshness staging test and cutover confirmation. | `REM-12` |
| Outbound webhooks | Destination ownership/auth, downstream idempotency, retry/SLA, data retention; slow/down/duplicate receiver behavior. | Controlled receiver logs correlated to one logical event. | `REM-19`, `D-09` |
| Observability | Central stdout/export receipt, data region/retention/access, redaction, instance/build/trace correlation, exporter outage. | Provider samples and fault-drill report. | `REM-10`, `D-06` |
| Paging/on-call | Channels, dedup/escalation/ack, 5xx/auth/Redis/DB/outbox/crash/backup scenarios. | Controlled page drill with acknowledgement/escalation record. | `REM-10`, `D-12` |
| Workers/systemd | Installed/enabled timers/services, single-flight, restart, failure status/paging, expected frequencies. | Service/timer status and induced failure/recovery test. | `REM-08`, `REM-18`, `REM-19` |
| Capacity | Production-equivalent load/soak, shared NAT, DB pool, memory/CPU, admin/analytics/retention/outbox, saturation/recovery. | Approved ceiling and p50/p95/p99/error/resource evidence. | `REM-13`, `REM-16`–`REM-19`, `D-10` |
| Browser support | Execute public, token-only claim, guest, and admin/MFA journeys for the approved browser/version/device/viewport/OS/locale matrix; include Greek and English and the agreed accessibility baseline. | Versioned `D-14` matrix and per-cell automated/manual result tied to the candidate digest. | `REM-05`, `REM-08`, `D-14` |
| Payment/email/upload scope | Confirm absent or inventory every external flow/service. | Product/architecture/infrastructure attestation. | `D-07`, `D-08`; separate audit if present |
| Incident response | Current contacts/channel, severity, go/no-go, emergency bypass, break-glass, rollback/restore/cutover authority and communications. | Reviewed runbook and tabletop/drill record. | `D-12`, Phase B/C exits |

## 14. Final recommended calendar sequence without dates or staffing assumptions

“Window” means dependency order, not duration. Parallel work is listed only where it does not merge unrelated risk into one PR.

| Sequence window | Primary work | Safe parallel work | Exit evidence / next gate |
|---|---|---|---|
| **Window 0 — Decisions and external inventory** | Resolve `D-01`–`D-05`, numeric migration portions of `D-10`, and the `D-14` support matrix; inventory external CI, IdP, claim delivery, artifact registry and backup provider; complete the read-only `REM-07` resource/migration/checksum/drift/legacy-data baseline before PR-09 makes state assumptions. | Begin `D-06`–`D-09` and `D-11`–`D-13` workshops/evidence requests. | Every release-relevant DB target/state is known; numeric abort budgets, browser matrix, and state branch are approved; no evidence was mutated; auth/claim/CI decisions allow P0 branches. |
| **Window 1 — Test substrate** | **PR-01** disposable PostgreSQL foundation; **PR-02** claim/refresh concurrency characterization. | Prepare synthetic data and route/outbox/privacy test cases. | Fresh migration and auth invariants pass; test DB guard proven. |
| **Window 2 — Enforcement and early secret discovery** | Merge **PR-03** mandatory CI baseline, then **PR-04** full-history/artifact secret scanning. | Finalize resource fingerprints, protected branch/environment settings, and restricted finding-handling procedure. | Deliberate failures block merge; PR jobs have no production credentials; scan output is redacted. A real secret hit stops later P0 promotion, triggers rotation/invalidation/investigation, and is treated as P0 until closed. |
| **Window 3 — Independent immediate security fixes** | **PR-05** admin universal-lockout fix; **PR-06** claim URL removal after active-grant cutover. | **PR-07** remaining route/outbox/privacy tests. | Source A/B and both approved/hostile credential-leak acceptance evidence pass. These reduce production risk but are not launch approval. |
| **Window 4 — Migration/release boundary** | **PR-08** explicit single-environment/single-flight command, then **PR-09** manifest, allowlisted drift, and two-sided readiness epoch using the already completed baseline. | Prepare the production-volume clone/restricted rehearsal enclave and `OPS-01` evidence request. | No unsafe command/default/blind retry; signed state supports the selected decision branch; readiness rejects unsupported artifact/schema pairs. |
| **Window 5 — Conditional migration safety without contract** | If `D-03` permits re-authoring, merge **PR-10A** schema-only expand and **PR-10B** dual-compatible code/backfill runner; execute `REL-MIG-01` only against the approved non-production rehearsal/eligible staging target; after convergence evidence, merge **PR-10C** read cutover with activation still environment-gated. If history is immutable, rehearse its maintenance path instead and do not create fictitious replacement PRs. | Design the admin-principal additive schema on the approved migration framework. | Each unit has separate review/test/rollback evidence; numeric `D-10` budgets pass; no applied checksum changes. **PR-10D is explicitly not executed here** and remains queued for a later post-production compatibility window. |
| **Window 6 — Named administration** | **PR-11** schema-only principal structures; **PR-12** actor/session dual-write; **PR-13** OIDC/MFA; **PR-14** RBAC/audit; **PR-15** shared-secret retirement, each merged and promoted independently. | Continue IdP enrollment, offboarding, recovery, targeted-revoke, and break-glass drills. | Two MFA operators, targeted revoke, role-denial matrix, actor audit, and routine shared-secret rejection pass. **Phase A exits only when every P0 criterion passes.** |
| **Window 7 — First promotion-quality controlled staging deployment** | Build/sign/scan and deploy the candidate artifact to isolated application-facing staging; start `REL-01`/`REM-08`. | Prepare the restricted restore enclave and `OPS-01`; configure the observability provider dark. | This is the recommended controlled staging point. It has synthetic/sanitized data and no production credentials/traffic. Digest evidence is exact only if build-time public configuration is environment-neutral. |
| **Window 8 — Detection before dependent P1 controls** | **PR-16** central exporters/redaction, then **PR-17** durable auth/security events and off-host paging. | Run initial runtime DAST/fault smoke; continue backup/restore preparation. | Controlled failures are durable, correlated, redacted, and page per policy; later P1 controls may rely on this evidence. |
| **Window 9 — Remaining P1 and recovery proof** | **PR-18** password defense; **PR-19/20** webhook receipt/signing; **PR-21** rate partitions; **PR-22** runtime-secret contract; **PR-23** IP HMAC. Complete `REM-09`/`OPS-01` timed restore, write-fence/cutover/reconciliation drill, `D-14` browser matrix, incident drills, and full staging load/fault/security gates. | Repeat the exact selected migration rehearsal and validate external TLS/proxy/Redis/DB/secret controls. | Every P1 criterion and all ten High findings have PASS or proven feature-disabled/N/A evidence; Phase B exit checklist passes. |
| **Window 10 — Production go/no-go and state-specific cutover** | **Re-authored compatible path:** apply PR-10A expand, deploy the PR-10B dual-compatible artifact with PR-10C reads OFF, execute production `REL-MIG-01` under `REM-09`/`REM-10` gates, prove convergence/postverify, then activate PR-10C and admit a deliberately small canary with prior-read/binary rollback. **Immutable non-rolling path:** drain writers, install the write fence, capture the final recovery marker, execute a full controlled maintenance cutover, validate/reconcile the RPO delta, and do **not** claim binary-only rollback. | Observation-only capacity capture; no schema contract or unrelated DDL. | Production convergence, not non-production convergence, authorizes PR-10C activation. Use the same staged digest only when build-time configuration is runtime-neutral. If `NEXT_PUBLIC_SITE_URL` requires a production-specific build, that new digest repeats the complete staging-equivalent validation and cannot inherit the staging digest's evidence. Health/security/SLO/recovery signals remain inside the initial ceiling. |
| **Window 11 — Delayed contract release** | After stable production observation and a separately approved compatibility/drain window, decide and, only if still required, execute **PR-10D** as its own protected contract release with fresh recovery evidence and the DB minimum-app-epoch barrier. | No other DDL or unrelated application rollout. | Every old app/worker/job/script is absent; old artifact is unready; postverify passes. Failure follows forward-fix/new-resource restore, not binary-only rollback. |
| **Window 12 — Measured performance and operations** | **PR-24** admin pagination, **PR-25** analytics bounds, conditional **PR-26** DSAR index, **PR-27** `D-13`-governed retention batching, **PR-28** worker-only outbox. | Load/soak and query-plan evidence per isolated PR. | Phase C budgets and operational exit criteria pass before raising the traffic/data ceiling. |
| **Window 13 — Correctness and maintenance** | **PR-29** session contract; **PR-30.x** one current-evidence dependency family at a time. | Establish recurring restore/migration/secret/incident/dependency drills and capacity forecasting. | Phase D exit; future growth remains bounded by measured evidence and new trust-boundary audits. |

### Final stop point

This document is the complete planning deliverable. No remediation has been applied. Implementation should begin only after selecting a specific task/phase and resolving its listed blocking decisions.
