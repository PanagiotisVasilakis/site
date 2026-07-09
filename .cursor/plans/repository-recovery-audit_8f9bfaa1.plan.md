---
name: repository-recovery-audit
overview: Recover the pushed `main` branch without rewriting its recent merge, close the confirmed access-control and credential exposures, then harden CI and simplify proven dead or duplicated code. Secret rotation and any coordinated history rewrite remain explicit operator actions, not automatic repository edits.
todos:
  - id: stabilize-main
    content: Resolve committed conflict markers, preserve both feature sets, and add a conflict-marker CI guard
    status: pending
  - id: rotate-and-untrack-secrets
    content: Coordinate Neon credential rotation, untrack environment files, and prepare separately approved history remediation
    status: pending
  - id: secure-booking-confirmation
    content: Require verified booking ownership, remove client userId trust, and replace insecure route tests
    status: pending
  - id: repair-ci-tooling
    content: Align runtimes and repair Docker, security, lint, coverage, API, DB, and accessibility gates
    status: pending
  - id: fix-runtime-bugs
    content: Correct auth state, locale/a11y behavior, cache/analytics contracts, and confirmed frontend regressions
    status: pending
  - id: remove-debris-refactor
    content: Delete verified dead code, consolidate duplicate infrastructure, and split monoliths after stabilization
    status: pending
  - id: verify-recovery
    content: Run the complete quality, security, build, container, responsive, and accessibility verification matrix
    status: pending
isProject: false
---

# Repository Recovery and Quality Plan

## Confirmed assessment
- `main` is clean and matches `origin/main`, but commit `ec340d3` pushed unresolved conflict markers in [`src/components/TopControls.tsx`](src/components/TopControls.tsx), [`src/components/ThemeToggle.tsx`](src/components/ThemeToggle.tsx), and [`src/i18n/domains/common.ts`](src/i18n/domains/common.ts). Typecheck and lint fail; 7 test files cannot transform.
- Real Neon credentials are tracked in [`.env.production`](.env.production), [`.env.staging`](.env.staging), and [`.env.test`](.env.test). They must be rotated before repository cleanup; do not reuse or echo them.
- [`src/app/api/bookings/[id]/confirm/route.ts`](src/app/api/bookings/[id]/confirm/route.ts) can mint a guest session without identity proof and trusts a client-supplied `userId`. Existing tests currently assert that insecure behavior.
- CI/tooling has independently confirmed breakage: stale Dockerfile paths, runtime-version drift, broken security scripts, non-enforced lint/coverage, and disabled API/DB coverage.

## Phase 1: Stabilize `main`
- Resolve all conflict blocks with a forward-fix commit: retain the redesigned typed menu/dialog, retain localized theme accessibility labels, localize the check-in label, and union both required UI translation key sets (`closeFilters`/`done` included).
- Add a repository/CI conflict-marker guard so staged or pushed source cannot contain `<<<<<<<`, `=======`, or `>>>>>>>`.
- Re-run typecheck, lint, tests, and a production build before any refactoring.

## Phase 2: Close critical exposure paths
- Operator action first: rotate/revoke the exposed Neon credential and inspect provider access logs.
- Untrack all three environment files and replace them with placeholder-only examples/documentation. Prepare a separate, explicitly approved history-cleaning procedure because it requires coordinated force-pushes and clone replacement.
- Redesign booking confirmation to require authenticated ownership or mandatory server-verified booking identity; ignore client `userId`; issue session/access only for the booking’s canonical user. Replace the tests that currently expect anonymous success with bypass/IDOR regression tests.
- Remove or quarantine the unused insecure auth implementations in [`src/lib/auth/rotateTokens.ts`](src/lib/auth/rotateTokens.ts) and [`src/lib/auth/sessionCookie.ts`](src/lib/auth/sessionCookie.ts); add replay/family-revocation tests to the live refresh-token path.

## Phase 3: Repair CI and delivery contracts
- Standardize Node 22.19 and npm 11.18 from `.nvmrc`/`package.json` across all workflows, Docker stages, orchestration checks, and docs.
- Correct Docker workflow paths to `docker/Dockerfile.security`; verify `.npmrc*` copying; fix `test:security` and ESLint 9 security-lint commands.
- Make lint blocking, generate and enforce coverage deliberately, re-enable the meaningful API contract suite, and run DB-backed tests against the CI Postgres service.
- Fix the deploy audit gate and accessibility report selection so stale reports cannot produce false green checks.
- Untrack build-generated PWA manifests (`precache`, `critical-precache`, `version`) and generate them consistently during build.

## Phase 4: Fix high-confidence product/runtime bugs
- Make global guest auth state truthful outside `/check-in`, emit cross-tab logout updates, and preserve the conditional check-in action.
- Correct locale semantics (`<html lang>`), make hidden top controls inert, standardize dark-mode skeletons, and consolidate the duplicate guest URL replacement effect.
- Fix the internal cache-metrics API-key scope contract, remove the analytics busy-wait/repeated-load path, and verify feature-flag/cache behavior across instances.
- Validate whether guest-count removal was intentional; then either restore capacity behavior or delete the stale `SearchBar` API and labels with explicit tests.

## Phase 5: Reduce proven debris and structural debt
- Delete verified orphans: [`src/components/GuideOptionCard.tsx`](src/components/GuideOptionCard.tsx) and [`src/hooks/useTheme.ts`](src/hooks/useTheme.ts).
- After reference confirmation, remove the redundant `/house` shim, legacy logger/export, orphan DB scripts, stale Knip entry, and broken documentation links.
- Consolidate client-IP extraction, Prisma URL parsing, marker deduplication, repository record mapping, and DB bootstrap logic behind one implementation each.
- Only after correctness is restored, split the largest modules (`CheckInInfo`, `UnifiedGuestClient`, `LeafletMap`, and `TopControls`) by domain with behavior-preserving tests.

## Verification and handoff
- Required gates: clean secret/conflict scan; `npm ci`; typecheck; blocking lint; unit/integration/DB tests; coverage; production build; Docker build; focused auth/booking regression tests; English/Greek light/dark responsive and accessibility checks.
- Keep the broken merge in history and fix forward. Do not amend or rewrite `main`; treat secret-history removal as a separate coordinated operation requiring explicit approval.