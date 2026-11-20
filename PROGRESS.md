# Progress

## Goal
Fix the 20 findings of the 2026-11-20 whole-repo audit (R-882..R-901 in REVIEW.md); every finding ends FIXED, DECLINED or DEFERRED-OWNER.

## Baseline (HEAD 239b111, clean tree, Node 22.19.0, 2026-11-20)
- Build: not run for the baseline
- Tests: default suite 105 files, 1618 passed, 0 failed
- Lint/Typecheck: typecheck exit 0; knip (`check:dead-code`) exit 0; lint not run for the baseline

## State files
- Ledger (machine-readable): agent-knowledge/audit-20261120/ledger.tsv; gate: `bash agent-knowledge/audit-20261120/ledger.sh` (exit 1 while a finding is OPEN)
- Task specs: agent-knowledge/audit-20261120/tasks/; per-task patches: agent-knowledge/audit-20261120/patches/; logs: agent-knowledge/audit-20261120/logs/
- Tooling: agent-knowledge/audit-20261120/tools.sh (fp, check, snap, scope, patch, restore). The folder is git-ignored (.gitignore:59).
- REVIEW.md and PROGRESS.md are in the project root and untracked (the owner removed the earlier ones in d6ccb2e); the owner decides whether to commit them.
- Model roles come from the named agent types (planner, implementer, reviewer); no alias probe was run.

## Decisions (round O-1, planner; full text: agent-knowledge/audit-20261120/decisions/O-1.md)
- O-1.1: REVIEW.md and PROGRESS.md stay in the project root, untracked, outside the commit map.
- O-1.2: the seven one-line items of the audit report are not part of this run (reported to the owner as not done).
- O-1.3: R-884 re-notifies on a rise only for the two count rules, through a per-rule `notifyOnIncrease` flag (age rules rise on every run).
- O-1.4: R-888 is one test-only task in B2 (shares admin-views.test.tsx with T03).
- O-1.5: R-883 is generic text only and rides with R-897 in T12; who runs the production migration is an owner fact.
- O-1.6: R-897 refuses a dirty tree unless `ALLOW_DIRTY=1` (GIT_COMMIT must be 40 hex characters, so no dirty mark there).
- O-1.7: R-899 is fixed with a lazy `requirePepper('SECURITY_PEPPER')`; the hash input stays byte-identical; lead gates build and integration; reviewer at max.
- O-1.8: R-894 gets one bounded follow-up refetch 60 s after a successful on-time refetch.
- O-1.9: R-886: a missing manifest is an issue unless the lockfile entry is `optional` or `devOptional`; zero checked packages fails.
- O-1.10: B1 = T01-T08, B2 = T09-T14.
- DECLINED by O-1: R-889 (pass-through layer: rewrite of the mocks costs more than the layer), R-890 (unknown nights can only be the tail past the sync
  horizon; a correct fix reaches five places), R-901 (index drop needs its own migration and readiness constant; fold into the next migration).

## Tasks
- [x] T01: home next free night respects the minimum stay (R-882) — B1 DONE (red/green logs in logs/T0x, patch in patches/)
- [x] T02: re-notify a growing count alert (R-884) — B1 DONE (red/green logs in logs/T0x, patch in patches/)
- [x] T03: reload the request list after a failed decision (R-885) — B1 DONE (red/green logs in logs/T0x, patch in patches/)
- [x] T04: license check fails when it checked nothing; SPDX OR (R-886, R-898) — B1 DONE (red/green logs in logs/T0x, patch in patches/)
- [x] T05: empty ALERT_WEBHOOK_REQUIRED counts as unset (R-891) — B1 DONE (red/green logs in logs/T0x, patch in patches/)
- [x] T06: success responses reuse the logger correlation id (R-892) — B1 DONE (red/green logs in logs/T0x, patch in patches/)
- [x] T07: client error reports: no repeats, per-page cap, Safari/Firefox stacks (R-893, R-895) — B1 DONE (red/green logs in logs/T0x, patch in patches/)
- [x] T08: formatDistance never prints "1,000 m" (R-896) — B1 DONE (red/green logs in logs/T0x, patch in patches/)
- [x] T09: tests for deferred PWA loading and "Load more" (R-888) — B2 DONE (logs in logs/T.., patch in patches/)
- [x] T10: integration test running the bundled outbox worker (R-887) — B2 DONE (logs in logs/T.., patch in patches/)
- [x] T11: one follow-up Wi-Fi refetch (R-894) — B2 DONE (logs in logs/T.., patch in patches/)
- [x] T12: refuse dirty image builds; document the migration step (R-897, R-883) — B2 DONE (logs in logs/T.., patch in patches/)
- [x] T13: crypto.ts reads SECURITY_PEPPER at call time (R-899) — B2 DONE (logs in logs/T.., patch in patches/)
- [x] T14: drop the redundant `//` check in OfflineActions (R-900) — B2 DONE (logs in logs/T.., patch in patches/)

## Open Questions
- Owner: where and by whom `prisma migrate deploy` runs for production releases (R-883; the runbook text stays generic).

### Checkpoint B1 - 2026-11-20
- Batch B1 (T01 T02 T03 T04 T05 T06 T07 T08) DONE; T04 needed one retry (type error in its new test: spawnSync env lacked NODE_ENV).
- Changed files: 16 (15 modified, 1 new test); per-task patches: agent-knowledge/audit-20261120/patches/T01..T08.patch
- Gates (exit codes): scope=0 typecheck=0 lint=0 default-suite=0 (106 files, 1632 passed). Logs: agent-knowledge/audit-20261120/logs/B1-*.log
- Lead tooling fault, fixed: snapshot copies ended in .ts and were seen by tsc and ESLint; snapshots now end in .orig.
- Rule break reported by T05's implementer: a recursive grep also scanned `.env*` files; its log holds one matching line, from `.env.example` only (checked by count, no value printed).
- Cost: planner round 188k tokens / 15 min; B1 implementers about 500k tokens in total, each under 2 min.
- Next: B2 (T09..T14), then build, integration, knip, coverage, one review round.

## Decisions (round O-2, planner; full text: agent-knowledge/audit-20261120/decisions/O-2.md; reviewers' digest: decisions/review-1.md)
- O-2.1: T02 also retries a re-notification that failed (`|| alert.notificationLastError`), with a regression test.
- O-2.2: T04 skips only `optional` lockfile entries; a missing `devOptional` package is an issue (reverses half of O-1.9; npm 11.18.0 docs).
- O-2.3: T11 comments corrected. O-2.4: T12 runbook sentences corrected (DIRECT_URL precedence, 503 body and log line).
- O-2.5: accepted: in development, logout without a pepper now throws instead of answering 204 (production start-up requires the pepper).
- O-2.6: new finding R-902 (comment in scripts/check-pepper.js) to be fixed with T13: NOT applied, see below.

### Checkpoint FINAL - 2026-11-20
- Batches: B1 (T01-T08) DONE, B2 (T09-T14) DONE, follow-ups after review (T02 T04 T11 T12) DONE; T13 follow-up (R-902) BLOCKED: the permission system refused
  the implementer's Edit of scripts/check-pepper.js; nobody worked around it; intended edit in agent-knowledge/audit-20261120/patches/R-902-owner.patch.
- Retries: T04 and T12 once each (type error: spawnSync env lacked NODE_ENV in the new tests).
- Changed files: 28 (24 modified, 4 new tests; an earlier version of this line said 23 and 5, which was a miscount) plus REVIEW.md and PROGRESS.md; list: agent-knowledge/audit-20261120/changed-files.txt; per-task patches: patches/T01..T14.patch.
- Gates (exit codes, logs/F-*.log): typecheck=0 lint=0 default-suite+coverage=0 (108 files, 1640 passed; statements 94.34, branches 88.43, functions 96.75, lines 95.45)
  knip=0 diff-check=0 license-check=0 integration=0 (20 files, 99 passed) build=0; build with an empty SECURITY_PEPPER=0 (logs/W-build-nopepper.log).
- Scope checks: B1=0 B2=0 follow-ups=0; .git/config, .git/hooks and .claude/ hashes unchanged from the baseline fingerprint.
- Secret scan (gitleaks 8.30.1, redacted, copies of the changed files, before the follow-ups): 1 hit, generic-api-key, tests/security/security-boundaries.test.ts:38,
  a test fixture line that is identical at HEAD and in no patch. Not rerun after the follow-ups (they add no credential-like text).
- Review: two reviewers (general at xhigh for T01-T12 and T14; max for T13). The follow-up changes were checked by the lead's gates and by reading the changed
  conditions, not by a second reviewer round.
- Ledger: FIXED 17, DECLINED 3 (R-889, R-890, R-901), DEFERRED-OWNER 1 (R-902), OPEN 0; `bash agent-knowledge/audit-20261120/ledger.sh` exits 0.
- Commit map: agent-knowledge/audit-20261120/COMMIT-MAP.md (12 groups; T03+T09 and T05+T13 share a test file).
- Cost: planner 188k + 51k tokens; 14 implementers about 0.95M tokens with follow-ups; reviewers 160k + 152k.
- Not done in this run (O-1.2), named only in the audit report: PwaManager update-banner flash; a test guarding the Dockerfile COPY of the startup modules;
  `DATABASE_URL` `options` not rejected; an ESLint ignore for `tmp-build-workers-*`; the planner computing `checkOutWindow` twice; test-only exports
  `rateForNight` and `IcalParseErrorCode`; near-copy routes `claim-grants` / `access-reset`.

## Owner-only steps
- Review the diffs and commit (COMMIT-MAP.md). Nothing was committed or staged.
- R-902: apply patches/R-902-owner.patch to scripts/check-pepper.js if you want the comment corrected.
- R-883: confirm where and by whom `npx prisma migrate deploy` runs for production releases.
- R-884: a re-notification is sent as `operational_alert.opened` with the original `openedAt`; confirm the webhook receiver does not drop it as a duplicate.
- R-897: `npm run docker:build` on an uncommitted tree now needs `ALLOW_DIRTY=1`.
- Declined R-889, R-890, R-901: say so if you want them done anyway.

### Checkpoint B4 - 2026-11-20 (the seven smaller items; owner: "fix them if you think it is worth it")
- The lead gathered evidence for all seven and recorded them as R-903..R-909 in REVIEW.md. The choice was left to the lead by the owner's message, so no
  decision round was run; the lead wrote the two specs (tasks/T15.md, T16.md).
- [x] T15: a dismissed update banner stays hidden until the worker names its version (R-903) — DONE, reviewer PASS
- [x] T16: a test guards the Dockerfile COPY lines of the start-up modules (R-904) — DONE, reviewer PASS
- DECLINED by the lead: R-905 (no concrete case), R-906 (small gain; lint ignores are owner-reserved), R-907 (micro-optimization), R-908 (un-exporting only
  weakens the tests), R-909 (a new abstraction over two security-sensitive routes for about 40 lines).
- Changed files now: 31 (27 modified, 4 new tests; list: agent-knowledge/audit-20261120/changed-files.txt); patches T15.patch, T16.patch; commit map groups 13 and 14.
- Gates (exit codes, logs/G-*.log): scope=0 typecheck=0 lint=0 default-suite+coverage=0 (108 files, 1642 passed) knip=0 diff-check=0 build=0.
  Integration suite not rerun (neither task touches code it covers).
- Reviewer notes on T16, not acted on: the import walker does not follow `export ... from`, checks only the package folder (not its dependencies) and would
  accept a commented-out COPY line; none applies to the three start-up files today.
- Ledger: FIXED 19, DECLINED 8, DEFERRED-OWNER 1 (R-902), OPEN 0.

### Live browser check - 2026-11-20 (owner: "can you play with them yourself and see?")
- Setup, all local and removed afterwards: PostgreSQL 16 container `audit-livecheck-pg` on 127.0.0.1:55439 (24 migrations), `next dev` on 127.0.0.1:3100 behind
  `scripts/dev-proxy.mjs` on localhost:3101, headless Chrome through the repo's puppeteer. Every env key was exported with generated test values, so
  `.env.local` was neither read nor used; webhooks, `BOOKING_ICAL_URL` and `CARTO_BASEMAPS_KEY` were empty. Working tree: no file changed by the check.
- Maps (CONFIRMED in the browser): `/en/moments?map=1` 1 map, 8/8 OpenStreetMap tiles (HTTP 200), 12 markers, zoom-in loads the next tiles, a marker opens its
  popup (name, `tel:` link, directions link); `/el/moments?map=1` at 390x844: 6/6 tiles, 12 markers, no horizontal overflow; the check-in page map loads when
  scrolled into view: 8/8 tiles, 15 markers. Console errors: 0.
- Admin (CONFIRMED): wrong token 401 with the message; test token opens `/admin`; booking created (201); claim grant issued (201).
- Guest (CONFIRMED): sign-in for an unknown account 401; sign-up with the claim token `claim-exchange` 200, `claims` 200, lands on `/en/check-in`, the exchange
  cookie is gone, `guest_session` and `guest_rt` are HttpOnly; with the access cookie deleted the page renews through `/api/portal/refresh` (one 409 "retryable"
  answer for the parallel request, then 200) and returns to check-in; sign out 204, both cookies gone, `/en/check-in` then shows the sign-in page; wrong password
  401 with the message and no cookie; right password with the phone typed in the Greek local form 200; `/el/check-in` renders. Console errors: 0.
- A first sign-up attempt answered 401: the step runner had typed the phone twice into the field (`normalizePhone` correctly rejected it). Tool error, not a defect.
- Update banner (T15): computed display `none` on the guest and check-in pages (no waiting worker in a dev server, so the banner logic itself was not exercised).
- Not checked: production build behind a real proxy, Secure cookies over https, the service worker, real phones, CARTO tiles, admin sign-out, the host access reset.

### Checkpoint B5 - 2026-11-20 (correction of the lead's wrong decline of R-905)
- The lead had declined R-905 with "no concrete case"; scripts/README.md:62 names the case. The owner had left the choice of the seven items to the lead, so the
  lead reversed its own decision and wrote tasks/T17.md.
- [x] T17: the start-up schema refuses a `DATABASE_URL` with an `options` parameter (R-905) — DONE, reviewer PASS (red logs/T17/red.log, green green.log)
- Changed files: still 31 (both T17 files were already changed by T05/T13); patch T17.patch; commit map group 5 now lists T05, T13, T17.
- Gates (exit codes, logs/H-*.log): scope=0 typecheck=0 lint=0 default-suite+coverage=0 (108 files, 1643 passed; stmts 94.35, branches 88.43, funcs 96.75,
  lines 95.46) knip=0 diff-check=0. Build and integration suite not rerun (one refine in the schema; no repo file defines a URL with `options`).
- New finding R-910 (Low, from the T17 reviewer): workers and `next dev` do not pass through the schema, so the rule guards the web server only. OPEN: it was
  found after the owner's delegation and waits for the owner's go.
- Ledger: FIXED 20, DECLINED 7, DEFERRED-OWNER 1 (R-902), OPEN 1 (R-910); ledger.sh exits 1 until R-910 is closed.

## Open Questions (2026-11-20)
- R-910: fix it (a throw in `buildPrismaPgAdapterArgs` plus one test) or decline it?
- T17 makes the web server refuse to start (exit 78) when the production `DATABASE_URL` carries an `options` parameter. The lead did not read any real
  environment value, so the owner should check the production value before deploying.
