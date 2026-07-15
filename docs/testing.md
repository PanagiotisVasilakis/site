# Testing strategy

Last verified: 2026-07-15.

## Purpose

The repository uses Vitest 4 with explicit TypeScript imports, jsdom only for browser-facing components, and Testing Library for user-observable UI behavior. The suite is local-only: no GitHub Actions workflows are installed and running tests cannot create GitHub notifications.

The design goal is high-signal regression protection, not assertions against implementation details. Tests cover boundary behavior, security invariants, failure modes, accessibility interactions, and public response contracts.

## Test layers

- `tests/unit`: pure formatting, validation, date/time, data, map, navigation, and adapter configuration.
- `tests/security`: environment fail-closed rules, JWT and database-session contracts, request-body limits, error sanitization, privacy hashing/redaction, trusted proxies, durable rate limiting, Redis responses, and portal refresh behavior.
- `tests/components`: jsdom interaction tests for theme state, locale synchronization, modal focus management, safe fallbacks, and request cancellation.
- `tests/routes`: public health, OpenAPI, and category response contracts.

The suite deliberately does not connect to PostgreSQL, Upstash, webhooks, OSRM, or another live service. Persistence and network boundaries are mocked at their adapters. This keeps the default run fast, repeatable, and independent of subscriptions or infrastructure availability. Live database migrations, readiness, and deployment connectivity remain separate operational checks.

## Commands

```bash
npm test                 # complete deterministic suite
npm run test:unit        # pure unit tests
npm run test:security    # security and boundary tests
npm run test:components  # jsdom component tests
npm run test:routes      # public route contracts
npm run test:watch       # interactive local development
npm run test:coverage    # suite plus enforced coverage gate
npm run validate:local   # typecheck, lint, coverage, security/build validation
```

The system orchestrator's `--strict` option also runs lint, typecheck, and the coverage gate before build or startup.

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

## Known boundary

The deterministic suite cannot prove real PostgreSQL transaction semantics or deployment topology. Before production deployment, also run the migration rehearsal, `system:check`, `system:verify`, and `validate:security` against the target environment.
