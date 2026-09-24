# Testing strategy

Last verified: 2026-07-16.

## Purpose

The repository uses Vitest 4 with explicit TypeScript imports, jsdom only for browser-facing components, and Testing Library for user-observable UI behavior. Release verification is local and repository-owned; see [Release verification](release-verification.md).

The design goal is high-signal regression protection, not assertions against implementation details. Tests cover boundary behavior, security invariants, failure modes, accessibility interactions, and public response contracts.

## Test layers

- `tests/unit`: pure formatting, validation, date/time, data, map, navigation, and adapter configuration.
- `tests/security`: environment fail-closed rules, JWT and database-session contracts, request-body limits, error sanitization, privacy hashing/redaction, trusted proxies, durable rate limiting, limiter failure responses, and portal refresh behavior.
- `tests/components`: jsdom interaction tests for theme state, locale synchronization, modal focus management, safe fallbacks, and request cancellation.
- `tests/routes`: public health, OpenAPI, and category response contracts.

The default suite deliberately does not connect to PostgreSQL, webhooks, OSRM,
or another live service. Persistence and network boundaries are mocked at
their adapters. This keeps `npm test` fast, repeatable, and independent of
subscriptions or infrastructure availability.

The separate `tests/integration` profile uses a real, disposable PostgreSQL 16 container. It is opt-in, excluded from the default Vitest profile, and owns its complete container/database lifecycle. It does not use the development Compose service or any caller-supplied database URL.

## Commands

```bash
npm test                 # complete deterministic suite
npm run test:unit        # pure unit tests
npm run test:security    # security and boundary tests
npm run test:components  # jsdom component tests
npm run test:routes      # public route contracts
npm run test:integration # disposable PostgreSQL migration/integration foundation
npm run test:watch       # interactive local development
npm run test:coverage    # suite plus enforced coverage gate
npm run validate:local   # typecheck, lint, coverage, security/build validation
npm run verify:release   # complete mandatory local release gate
npm run hash:prisma-integrity # deterministic Prisma integrity hashes
npm run check:prisma-integrity # verify the committed static history baseline
npm run validate:release-policy # verify the restricted local release profile
npm run check:postgres-image-policy # verify/pull the approved OCI index
```

The system orchestrator's `--strict` option also runs lint, typecheck, and the coverage gate before build or startup.

## Disposable PostgreSQL integration lifecycle

`npm run test:integration` requires a running local Docker socket/daemon and the exact image pinned in `tests/integration/support/postgres-image-policy.ts`. Remote Docker contexts are rejected. The launcher verifies the raw multi-platform OCI index, pulls the exact digest, and validates the canonical local repository digest before every run. It never falls back to `docker-compose.yml`, `site-dev-db`, a persistent volume, or an externally supplied URL.

One invocation performs this lifecycle:

1. Generate a random run ID, synthetic database role/password, and opaque fingerprint.
2. Verify and pull the official digest-pinned PostgreSQL 16 Alpine OCI index, including its `linux/amd64` and `linux/arm64/v8` descriptors.
3. Start one uniquely named and labelled PostgreSQL 16 container on a Docker-assigned `127.0.0.1` port. PostgreSQL data lives on tmpfs and the container has no restart policy or persistent data volume.
4. Wait on Docker health and a real PostgreSQL fingerprint; there is no fixed startup sleep.
5. Mark the control database with the run fingerprint.
6. Give each suite/worker lifecycle a fresh database with its own `public` schema and derived fingerprint. Database isolation is required because historical migrations explicitly reference `public` objects.
7. Apply the entire committed migration chain through `prisma.integration.config.ts`. This config reads only the generated `TEST_DATABASE_URL`; it does not load dotenv files and cannot prefer an inherited `DIRECT_URL`.
8. Seed only fixed synthetic fixtures (`example.invalid`, the reserved fictional `202-555-0100` number, fixed UUIDs/dates, and no password/token).
9. Disconnect clients, guard and drop suite databases, then guard and remove the exact container in the outer runner's `finally` block.

Two parallel invocations use different container names, ports, roles, databases, tmpfs filesystems, and fingerprints. Vitest workers allocate different databases inside their invocation. A normal assertion failure, migration failure, `SIGINT`, or `SIGTERM` still reaches the outer teardown. `SIGKILL`, Docker daemon failure, or host loss cannot run process cleanup; any leftover container remains uniquely labelled and has tmpfs-only database data. Inspect it without a wildcard operation:

```bash
docker ps -a --filter label=com.qr-city-guide.integration.disposable=true
```

Do not use `docker prune` or remove a container by label alone. Confirm its exact container ID, run-ID/repository/fingerprint labels, pinned image, tmpfs mount, and loopback mapping before removing that exact ID.

### Fail-closed database guard

All migration, seed, failure-fixture, cleanup, drop, and teardown helpers pass through one central test-only guard. Before connection it requires the non-trivial runner opt-in, an exact runner-generated URL, a strict run-specific database/user name, no production/staging/development label, the generated loopback port, and no match with database URLs inherited from the process or local dotenv files. It then verifies the exact Docker container ID, disposable labels, pinned image ID, port mapping, tmpfs storage, and health.

After connection, the guard checks `current_database()`, `current_user`, database owner, PostgreSQL major version, internal server port, and the database comment fingerprint. Unsafe static targets are rejected before Docker inspection, connection, or destructive SQL. URLs, usernames, and passwords are redacted from captured migration diagnostics and are never passed as command-line arguments.

The dedicated config and guard are defense in depth, not permission to provide a database URL manually. Run the integration suite only through `npm run test:integration`.

## Claim and logout characterization

Booking-claim races run through two independent child application contexts, each with its own Prisma pool and PostgreSQL `application_name`. A synthetic database lock holds the authoritative write boundary until `pg_stat_activity` and `pg_blocking_pids` show both claimants in the same database wait graph; `setImmediate` only yields while polling that state. The suite uses 15 literal fresh migrated databases for different-identity claims and 15 for identical claims. Each race must produce one `200` winner, one generic `401` loser, one owner and consumed grant, and one complete remember-enabled session/family/token graph with `Session.id === RefreshToken.id`; no losing user, terms, audit, session, family, or token may survive.

The non-race matrix covers new and existing users with remember enabled and disabled, sibling-grant revocation, wrong-password and owned-booking denial, generic invalid grant states, and a real claim-to-refresh rotation. Logout coverage exercises session-only, matching, malformed, already-revoked, mismatched, and repeated credentials through the route. Every logout returns `204`, clears both cookies, and preserves authorization graphs that were not explicitly presented.

## Portal booking eligibility policy

Portal access uses booking calendar dates, not elapsed durations. `Booking.startDate` and `Booking.endDate` are PostgreSQL `DATE` columns surfaced by Prisma as UTC-midnight `Date` values, so the established portal convention is a UTC calendar date. `PROPERTY_TIME_ZONE` applies to property time-of-day behavior and does not redefine this authentication boundary.

The canonical inclusive temporal predicate is:

```text
endDate >= businessToday
AND startDate <= businessToday + 7 calendar days
AND startDate <= endDate
```

Each operation captures its clock once, derives the window with UTC calendar arithmetic, and uses `src/lib/portalBookingEligibility.ts`. Claim consumption applies the predicate to the booking re-read inside its Serializable transaction before user, password, ownership, grant, terms, or audit mutations. Login, refresh issuance/rotation, and session-access verification use the same temporal policy while retaining their separate `VERIFIED` and ownership requirements. The PostgreSQL integration matrix covers ended-yesterday, ends-today, starts-today, `+1`, `+7`, `+8`, and inverted ranges across those flows.

## Refresh rotation overlap and replay policy

Refresh concurrency uses a transaction-scoped PostgreSQL advisory try-lock derived from the immutable predecessor generation UUID. Raw refresh credentials, elapsed time, IP, and device fingerprints do not prove overlap. The marker is attempted before the canonical `User → RefreshTokenFamily` row-lock order and is released automatically on commit or rollback.

Only a contender whose committed preflight shows an active generation, valid session/booking binding, and approved same context may map observed marker contention to cookie-free `409 REFRESH_IN_PROGRESS`; the owner remains the sole `200` winner. Every different-context, invalid-binding, revoked, or ambiguous contender ends its try-lock transaction and enters a separately bounded cleanup transaction using `User → RefreshTokenFamily`. If the owner locks User first, cleanup revokes every committed descendant; if cleanup locks User first, the owner later observes the revoked family and cannot issue a credential.

A request that owns the marker and authoritatively re-reads an already-revoked predecessor is completed replay: it atomically revokes the family, all family tokens, and paired sessions before returning `401` and clearing both auth cookies. Integration coverage uses PostgreSQL lock barriers rather than ordering sleeps and includes 20 same-context overlaps, 15 different-context overlaps, five fresh-database completed-replay commit witnesses, invalid bindings, family/generation isolation, and owner rollback/retry.

## Prisma integrity hashing

Run `npm run hash:prisma-integrity` from the repository root. The schema hash covers the raw `prisma/schema.prisma` bytes. The migration-tree hash recursively includes every regular file below `prisma/migrations`, including `migration_lock.toml`; it byte-sorts UTF-8 relative paths and hashes a versioned, length-prefixed path/content stream. Ambiguous or duplicate paths, symbolic links, and special files fail closed; filesystem traversal order, timestamps, and metadata are excluded. `npm run check:prisma-integrity` compares those bytes with the canonical committed `prisma/integrity-manifest.json`; only the explicit `npm run update:prisma-integrity` command rewrites that baseline.

The current values are recorded only in `prisma/integrity-manifest.json`. The integration support (`tests/integration/support/migrations.ts`) reads the same manifest through `checkPrismaIntegrity` and compares its per-migration SHA-256 values with the applied `_prisma_migrations` checksums.

The earlier `b1763086454bf563257bbba8b092b89cea1bdd962e442da0bec49af9bbd6450c` / `bcb0d280c005f31d08a1c98a46cd3e2301b97256c5b68b88d52907c6c5bc8bd2` discrepancy was file-scope drift, not a migration change: the first command included `migration_lock.toml` among all 15 files, while the second selected only the 14 `*.sql` files. The versioned utility above is the canonical process for subsequent reports.

This manifest is static repository evidence only. It does not read a live `_prisma_migrations` table or prove that staging/production is migrated, drift-free, or compatible.

## Coverage policy

`vitest.config.ts` lists the critical authored-code coverage scope explicitly. Generated Prisma files, declarations, page composition, and infrastructure that requires live services are not counted in this percentage.

The initial verified baseline is:

- statements: 88.40%; enforced minimum 88%;
- branches: 82.07%; enforced minimum 82%;
- functions: 91.04%; enforced minimum 91%;
- lines: 89.75%; enforced minimum 89%.

Coverage thresholds are regression gates, not a claim that every repository line is tested. A new critical module should be added to the coverage scope with meaningful tests. Do not exclude difficult production code merely to preserve the percentage.

## Test quality rules

- Assert public behavior and security outcomes rather than private call order, except at external adapter boundaries.
- Use controlled clocks and mocked network/persistence responses; do not use arbitrary sleeps.
- Never add `NODE_ENV=test` behavior, authentication bypasses, exported test-only helpers, or in-memory production fallbacks.
- Verify success, malformed input, authorization failure, timeout/abort, and upstream failure where applicable.
- Keep tests isolated. Restore environment variables, globals, timers, DOM state, and mocks after each test.
- A production bug found by a test is fixed in production code; the assertion is not weakened to match unsafe behavior.

## Known boundaries

The integration foundation proves the existing migration chain from an empty PostgreSQL 16 database, final Prisma access, deterministic fixture isolation, guarded cleanup, and sanitized migration failure. The committed auth integration suites separately cover claim eligibility, refresh revocation, rollback, isolation, and deterministic concurrency regressions. They do not inspect live schema drift, production migration state, historical data shapes, backup/restore behavior, or production topology. `verify:release` is necessary repository evidence, not production readiness; live migration rehearsal, runtime verification, backup/restore, and topology checks belong to a separately authorized release phase.
