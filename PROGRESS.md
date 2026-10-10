# Progress

## Goal
Review 3 remediation plus the approved product changes (plan approved 2026-09-28; full plan `~/.claude/plans/snappy-swinging-moth.md`, outside the repo): security updates, availability & prices page instead of the booking form, OSRM removal, new visual identity and design system, content, legal pages; last, the legal identity data. One concern per task; per-task patches in `.runtime/review-patches/`; nothing committed by the agent.

## Current state (2026-10-06)
- Every planned task is done except the two the owner deferred (R3-L6/L7, R3-L1). R3-A7 is code-done; its linux/amd64 integration gate waits for the production host. A read-only audit (2026-10-06) checked findings R-165…R-372 against PROGRESS, the plan and the current code: all DONE, MOOT or DECLINED, except R-182 (amd64 gate) and R-370 (watch item, no upstream fix). R-315 was fixed by R3-Z1; R-325/R-326 are kept by the V8/C2 decision (Resolution lines added). R-354…R-356 do not exist (the dead-code sweep ends at R-353).
- The tree is `main` @ `f7958fa`, which contains all Review 3 work. The 107 per-task patches in `.runtime/review-patches/R3-*.patch` (gitignored, local) are the history of the tasks. The owner reviews and commits.
- This file was condensed on 2026-10-06. The full task-by-task log (gates per task, lane and merge notes, Reviews 1–2 questions O1–O21) is in `.runtime/archive/PROGRESS-full-2026-10-06.md` (local, gitignored). Reviews 1–2 history is also in git (`bd50a80`, `e19facc`, `fff4283`).

## Release baseline (2026-10-06, final run after R3-Z, Node 22.19.0 / npm 11.18.0, Docker 29.8.1)
- `verify:release` 30/30 PASSED (182.6 s). Default suite 151 files / 1790 tests; integration 22 files / 121 tests; coverage 92.52/86.02/94.44/93.66 (thresholds 88/82/91/89); typecheck, lint (0 warnings), lint:security, knip, licenses, Prisma integrity (24 migrations), secret scans, release policy 63/63.
- `docker:build` (NEXT_PUBLIC_SITE_URL=https://localhost:3002): runner `sha256:78327af7…`, workers `sha256:9fe3ca01…`, migrate `sha256:2bdc06a3…` (tag `villa-app:fff428332ef4-dirty`; never deploy a `-dirty` tag). `smoke:image` 23/23.
- `npm audit --omit=dev`: 0. Full `npm audit`: 5 high, all the dev-only braces chain (R-370, no fixed release yet).
- Advisory audits (local production build, non-local requests blocked): axe 22 routes en/el, 0 violations; responsive-ux 81 cells: 36 pass, 45 minor (touch targets below the 44×44 AAA guidance on chips/segmented buttons/link arrows, where AA is 24×24; possible text clipping on the kinetic hero text), 0 major/critical; vitals (CPU ×4, slow 4G): LCP 724–960 ms, CLS 0, TBT ≤ 40 ms, INP proxy ≤ 40 ms.
- Reference: Review 3 start (2026-09-28) was 86 files / 600 tests, integration 16 / 84.

## Review 4 (2026-10-06 to 10-10): deep review of `f7958fa` and its follow-up, awaiting owner review and commit
- `REVIEW.md` now holds Review 4 only: 226 findings, R-375…R-600 (0 Critical, 2 High, 12 Medium, 171 Low, 41 Nit; 219 CONFIRMED, 7 SUSPECTED). Reviews 2–3 are in `git show f7958fa:REVIEW.md`, Review 1 in `git show bd50a80:REVIEW.md`.
- Status: Phase 1 (review) done on 2026-10-09 without code changes. The owner then delegated the decisions and the fixes (section "Review 4 follow-up" below); the follow-up finished on 2026-10-10 with everything uncommitted in the working tree. Next: the owner reviews the diff, stages the ten deletions and commits by the commit map (`.runtime/review4/commit-map.md`).
- Scope decisions (owner, 2026-10-06/07):
  - Whole repository, lean plan (chosen 2026-10-07 because of the usage limits): "Areas NOT reviewed" in `REVIEW.md` lists what it left out (65 files, mostly integration suites, release policy, orchestrator, browser audits and test infrastructure).
  - Network limited to `npm audit` and official sources.
  - Local production build plus a throwaway PostgreSQL container for runtime checks; Docker Desktop was restarted for it on 2026-10-07.
- Baseline 2026-10-06 (Node 22.19.0): `verify:release` 30/30 (186.3 s), default 151/1790, integration 22/121, coverage 92.52/86.02/94.44/93.66, `npm audit --omit=dev` 0.
- New since the baseline: `npm audit --omit=dev` reported 2 High (next, sharp), so release gate 24 failed until the pins moved (R-383); task T12 moved them on 2026-10-09 (next 16.3.8, sharp 0.35.5) and the audit reports 0 again. Next announced another security release for 2026-10-14; re-checking it is the future item T60 (not planned in this run).
- Owner decisions the findings ask for (each finding's Fix names them):
  - The empty-feed policy for the Airbnb sync (R-384).
  - The first state of the guest feature flags after the first migration (R-435).
  - Whether the requester text in erasure records needs a retention period (R-458).
- Notes for the next agent:
  - Next free finding ID: R-627 (the follow-up recorded R-601…R-626; `REVIEW.md` now holds 252 findings: 0 Critical, 2 High, 12 Medium, 195 Low, 43 Nit; 244 CONFIRMED, 8 SUSPECTED; every finding has a Resolution line).
  - The lab database container `review4-pg` is stopped, not removed (`docker rm review4-pg` removes it); the local production server is stopped.
  - The review's tooling (manifest, collector, probes) was in the session scratchpad and is gone after a reboot.

<!-- R4-FOLLOWUP:BEGIN -->
## Review 4 follow-up (plan decided 2026-10-09)
- On 2026-10-09 the owner delegated every decision to a decision agent (Opus 5.5, max effort; read-only) and the edits to Sonnet 5.5 and Haiku 5.5 subagents. The agent decided the 226 findings (60 tasks fix 120; 106 declined, deferred or merged, each with a reason), the owner questions and the approvals below. The owner still reviews and commits everything; nothing is committed by an agent. GitHub and every remote stay read-only.
- Plan files (local, gitignored): `.runtime/review4/` (decisions.md, decisions.json, tasks/Txx.md, findings/R-nnn.md, per-task patches in `.runtime/review-patches/R4-Txx.patch`). Per wave the lead runs typecheck, lint, lint:security, knip and the default suite; `verify:release`, `docker:build` and `smoke:image` run once at the end. The tooling and state of the follow-up are copied to `.runtime/review4/` too (impl-batch.js, impl-tools/ with run-gates.mjs, status.json, amendments.md, new-findings.md; see README-impl-tools.md there).
- Dependency installs: on 2026-10-09 the owner pre-approved `npm install` / `npm update` / `npm uninstall` for the repo dependencies, on condition that the impact is studied first and the changes the upgrade needs are made (rule saved in the global CLAUDE.md and in memory). The lead ran the T12 install after reading the Next 16.3.7/16.3.8 release notes, the advisories and the registry metadata; agents still cannot run `npm install` (the permission system denies it), so the lead runs installs and Sonnet/Haiku agents adapt the code afterwards.
- Owner-only (not done by agents): stage the ten deletions together with the other changes (the lead removed them with plain `rm` on the owner's authorization of 2026-10-10): `src/data/housePhotos.ts`, six JPEGs under `public/house` (living_3, bedroom_4, bedroom_2_2, bedroom_2_4, bathroom_1, bathroom_5), `instrumentation.ts`, `src/lib/env.ts`, `lsall.err`; correct CLAUDE.md: the Environment paragraph (L65; instrumentation.ts and src/lib/env.ts are gone, start-up validation is `scripts/start-standalone.mjs`) and, in the Content paragraph, the pinned `slug` and the strict build gate (T24); optionally add the seven deny entries (`Bash(git add *)`, `git rm`, `git mv`, `git restore`, `git apply`, `git worktree`, `git update-index`) to `.claude/settings.json` (the decision agent denied agents changing permission settings); on the production host rotate the Nginx error log daily with `rotate 13` (the current file plus 13 rotated files is at most 14 days; O62, O95; a host with `rotate 14` changes it) and confirm with `man 8 logrotate` and `logrotate -d`; check the production env file (nobody else may read it): no `LOG_LEVEL=fatal`, no patterned or placeholder peppers, no pepper equal to ADMIN_JWT_SECRET, GUEST_JWT_SECRET or ADMIN_DASH_SECRET, no `options=` in DATABASE_URL (T35, O70, R-605); the privacy-notice wording (O82); restart the `next dev` server that was running during the install (started before the upgrade, PID 14448 when checked); remove the stopped lab container with `docker rm review4-pg` if it is no longer needed. The deferred R3-L1, R3-L6/L7 stay deferred (R-393 is fixed inside L6/L7). Future item: T60, the Next re-check after the security release announced for 2026-10-14.

### Decisions taken by the decision agent
- O47 (R-384): Empty Airbnb feed policy: may a valid calendar with no future events replace the stored snapshot? → Not on a scheduled run: if the stored snapshot has future nights, the sync records the failure 'empty_feed' and keeps the snapshot.
- O48 (R-435): What state should the guest feature flags have after the first migration? → Keep the migration seed: portal and check-in are ON after the first migrate.
- O49 (R-458): How long may the requester text in erasure records be kept? → Do not record the requester's identity at all.
- O50 (R-446): Slug policy for guide items → URLs stay derived from the English name.
- O51 (R-172): Should the dictionary-in-client-bundle question be reopened? → No. R-172 stays declined.
- O52 (R-472): Should the PROPERTY_TIME_ZONE env key be retired? → No. The Wi-Fi window switches to the stayPolicy constant. The env key stays in the schema and the release tooling, documented as not read.
- O53 (R-550, R-554): What happens to the schema states that nothing produces? → Keep PrivacyRequestType.EXPORT, PrivacyRequestStatus.REJECTED, AlertStatus.ACKNOWLEDGED and acknowledgedAt.
- O54 (R-376): Should the per-phone limiter also merge the two buckets of a 10-digit number typed with and without '+'? → No. Fix only the whitespace bypass and accept two buckets for 10-digit international numbers.
- O55 (R-496): How should the limiter stop someone who knows a guest's number from locking that guest out? → For claims, key the limiter on the verified grant digest instead of the phone.
- O56 (R-403): Should Prisma keep its own SIGTERM/SIGINT hooks? → No, remove them.
- O57 (R-440): What happens to an erased guest's PENDING arrival request? → The erasure transaction sets it to REJECTED and keeps its booking link.
- O58 (R-449): Upper bound for manual bookings → At most 180 nights, with dates in the years 0100-9999.
- O59 (R-460): May the home and apartment pages be replayed offline? → No. They become network-only like /availability, so offline they show the offline page.
- O60 (R-430, R-486): What happens to the second photo catalogue and the eight excluded photos? → Delete housePhotos.ts and the six photos with no planned use: living_3, bedroom_4, bedroom_2_2, bedroom_2_4, bathroom_1 and bathroom_5.
- O61 (R-466): The root instrumentation.ts is never loaded by Next (R-466): delete it or move it to src/? → Delete instrumentation.ts and src/lib/env.ts.
- O62 (R-503): The Nginx error log can hold visitor IPs (PROGRESS Q1, R-503): what to do? → Option (a): keep the warn-level error log and the dry-run rate-limit lines, rotate the log daily on the host and keep 14 days, and add one retention line to the privacy notice in en and el.
- O63 (R-457): Cap for the calendar sync backoff → 45 minutes.
- O64 (R-441): Should failed manual 'Sync now' runs move the scheduled backoff? → No. A failed manual run records the error but leaves consecutiveFailures and nextAttemptAt unchanged.
- O65 (R-393): Should the climate-fee breakdown keys be fixed now, and how? → Use index keys, but only inside the deferred R3-L6/L7 fee-schedule task.
- O66 (R-455): Should the admin get an editor for the standard check-in/check-out times? → Not now. The defaults 15:00 and 11:00 stay.
- O67 (R-583): Keep framer-motion on the admin guests page? → Keep it (the identity §13 default).
- O68 (R-542, R-543, R-544): Slim the category model and remove the duplicated category copy? → Keep the model as it is.
- O69 (R-551, R-552): refresh_token_families.ip_hash and the IP hint plumbing → Stop writing the family ip_hash, with no migration.
- O70 (R-507): Strength policy for SECURITY_PEPPER and CLAIM_TOKEN_PEPPER in production → Reject patterned values, placeholder-like values (replace, changeme, placeholder, example) and values that reuse an active credential.
- O71 (R-506): Rate limit for POST /api/portal/refresh → 60 requests per 15 minutes per client address, with no identifier, and checked only when a refresh cookie is present.
- O72 (R-461): Should verify:release refuse any Node other than 22.x? → No.
- O73 (R-533, R-535): Restore the auth test rows that T1 removed? → Yes, restore them exactly.
- O74 (R-569): Admin route nits that were left to the owner → Keep the login route's 400 for an empty development secret (production already answers 503), and do not add an ADMIN_COOKIE_NAME constant.
- O75 (R-596): Test-quality nits the owner might want pinned, and the malformed CANCELLED event → Only part (1) is done. Parts (2)-(5) are not pinned, and a malformed CANCELLED event keeps failing the whole sync (part 6).
- O76 (R-540, R-541, R-484, R-485, R-580, R-597): Design-system copy and icon choices → Keep the §6 icon palette, the check-in page's own icon set and the arrow characters in the PWA banners.
- O77 (R-385, R-426): How should the mobile menu learn the feature flags? → From the session status request the header already makes: GET /api/portal/sessions answers 404 while the portal is off, and it now also returns checkinEnabled.
- O78 (I-02): Should the coverage include list in vitest.config.ts be widened with modules that gained tests in this follow- → No. The include list and the thresholds stay unchanged in this follow-up.
- O79 (I-10, T58): Should production start-up also reject SECURITY_PEPPER equal to CLAIM_TOKEN_PEPPER, and stop echoing the ALLOW → No to both. O70 stays as T35 implemented it: the peppers are compared only with the three active auth credentials.
- O80 (I-05, T61, R-408, R-400): How should the QuoteBar's 96 px scroll padding win over the network pill's 56 px below 640 px, and is the narr → Double the class inside :has (`:root:has(.quote-bar.quote-bar)`, specificity (0,3,0)) in calendar.css (T61), and do not edit stay.css.
- O81 (R-601, T62): Where does a successful sign-in or claim send the guest while the check-in flag is off? → To /{locale}/stay (built from STAY_HUB_PATH) in both POST routes.
- O82 (I-06, I-09): Do agents correct the privacy notice for the pages that are no longer stored (O59) and for what check_in_reque → No. Both go to the owner's legal review, with the suggested wording in the owner notes; legal.ts is not edited in this follow-up.
- O83 (R-602, I-12, R-410, R-411): R-602 re-found the symlink main-module guard. Is it fixed now? → No. R-602 is recorded as a duplicate of R-410 and R-411 and stays declined with them.
- O84 (J-01, R-604, T58): Should the claim exchange cookie carry an issue time that the server checks, so that its five-minute lifetime  → No. Record the gap as R-604 (Low, accepted), and state the real bound in docs/security/claim-token-transport.md (T58 addendum). The cookie format stays `digest.mac`.
- O85 (J-02, R-605, T58, T41, R-510): Should the application refuse or merge an `options` parameter in DATABASE_URL, so that it cannot replace T41's → No code change. The runbook states that DATABASE_URL must not carry an `options` parameter (T58 addendum), and the override is recorded as R-605 (Low, accepted).
- O86 (J-11, LC-13, R-497, T38): Must the API's error answers (the X-Error-Code responses of withErrorHandler: 401, 404, 422 and the others) al → No. R-497 stays as T38 implemented it: createSuccessResponse and the booking export carry no-store. LC-13's pass criterion is corrected to those responses.
- O87 (J-08): Should the Wi-Fi reveal follow the local clock (15:00 the day before check-in) across a DST change, instead of → No. The reveal stays 24 hours of elapsed time before the check-in instant. This is an owner note, not a finding.
- O93 (T50): How is the one lint:security error at tests/components/portal-refresh-redirect.test.tsx:123 (the deliberate ho → Option C, applied by the lead on the owner's explicit instruction of 2026-10-10 ("T50: apply the override"): a scoped override in eslint.config.security.mjs that turns no-script-url off for …
- O88 (R-606, R-387, T67): Unknown-number sign-in now costs one bcrypt(12) compare that only the per-address and per-phone buckets bound  → Accept the cost. Keep the constant-time compare (R-387) and the PostgreSQL limiter as they are; no in-process admission cap and no UV_THREADPOOL_SIZE change. T67 documents the per-attempt cost and the per-address bound in …
- O89 (R-617, T68, T03): While the page is zoomed in, a one-finger sideways drag that starts on the hero does not pan the page (touch-a → No code change. Keep the hero's touch-action and the sideways-drag view. identity.md states the limit and the workarounds, a two-finger pan or a drag that starts below the hero (T68). R-617 is recorded as Low, accepted.
- O90 (R-607, T02): Should phone input strip invisible Unicode format characters (for example U+202A and U+202C) before normalizat → Not now. R-607 is recorded as Low, accepted. If a guest reports a failed sign-in or claim with a pasted number, strip the format characters in normalizePhone (src/lib/phone.ts) and in the limiter's normalizeIdentifier …
- O91 (T64, T65, T66, T67, T68, T69): Do the Wave 6 fixes need another independent QA pass? → No. The per-task gates, the per-batch and wave-end gates (LC-16), the guards LC-18 and LC-19 and the lead's line-by-line review of the T65 and T66 diffs are enough.
- O92 (R-610, T19, O49): The erasure audit note is stored through redactSensitiveText, whose phone heuristic masks 'YYYY-MM-DD hh' as a → Accept. R-610 is recorded as Low; no code or text change. The owner, the only administrator, writes dates in erasure notes with the month in letters or with a word before the hour (for example 1 Jan 2030 10:30, or 2030-01-01 at …
- O94 (R-626, T70): R-626: the T65 address split [^\p{L}\p{N}_.@+-] cuts at combining marks, no test pins its \p{N}, and an RFC-va → Fix parts (a) and (b) in T70; accept part (c).
- O95 (R-625, O62, T67, T71): With daily and rotate 14, the documented logrotate rule keeps the current error.log plus 14 rotated files, so  → Change the count. In T71 (documentation only, batch W6C3 with T70), the runbook rule uses rotate 13 and says why: the current file plus 13 rotated files is at most 14 days with one run a day. The published '14 days' in en and el …

### Approvals given by the decision agent
- APPROVED: (a) Package upgrade for R-383 (task T12): next and eslint-config-next 16.3.6 -> 16.3.8, sharp 0.35.4 -> 0.35.5
- APPROVED: (a) Conditional follow-up upgrade of next and eslint-config-next after the Next security release announced for 2026-10-14 (task T60)
- APPROVED: (b) Read-only network use on official primary sources
- DENIED: (c) Prisma schema change with a forward migration
- DENIED: (d) Deny rules in .claude/settings.json for git add, rm, mv, restore, apply, worktree and update-index

### Tasks (one concern each; gates per task in the task spec)
**Wave 1: High, Medium and the release blocker**
- [x] T01: PwaManager survives blocked site storage (R-375) — DONE — gates: typecheck, lint, lint:security clean; default suite 152 files / 1817 tests; patch R4-Txx
- [x] T02: Phone numbers are normalized the same way for the limiter, the claim and sign-in (R-376, R-397) — DONE — gates: typecheck, lint, lint:security clean; default suite 152 files / 1817 tests; patch R4-Txx
- [x] T03: Home page stays usable under zoom (R-377, R-379) — DONE — gates: typecheck, lint, lint:security clean; default suite 152 files / 1817 tests; patch R4-Txx
- [x] T04: Map tiles follow an explicit Day or Night choice (R-378) — DONE — gates: typecheck, lint, lint:security clean; default suite 152 files / 1817 tests; patch R4-Txx
- [x] T05: Offline precache: no cookie side effects, and the offline pages' scripts are included (R-380, R-381) — DONE — gates: typecheck, lint, lint:security clean; default suite 152 files / 1817 tests; patch R4-Txx
- [x] T06: Wide-screen planner navigation follows the months on screen (R-382) — DONE — gates: typecheck, lint, lint:security clean; default suite 154 files / 1865 tests; patch R4-Txx
- [x] T07: A scheduled sync never publishes an empty feed over stored future nights (R-384) — DONE — gates: typecheck, lint, lint:security clean; default suite 154 files / 1865 tests; patch R4-Txx
- [x] T08: Mobile menu offers Sign in and Check-in only while the feature is on (R-385) — DONE — gates: typecheck, lint, lint:security clean; default suite 154 files / 1865 tests; patch R4-Txx
- [x] T09: Admin retry acts only on genuine notification failures (R-386, R-436) — DONE — gates: typecheck, lint, lint:security clean; default suite 154 files / 1865 tests; patch R4-Txx
- [x] T10: Portal auth reveals neither which accounts exist nor other guests' passwords (R-387, R-594) — DONE — gates: typecheck, lint, lint:security clean; default suite 154 files / 1865 tests; patch R4-Txx
- [x] T11: Unknown locale segments answer 404 instead of pages without security headers (R-388) — DONE — gates: typecheck, lint, lint:security clean; default suite 155 files / 1872 tests; patch R4-T11
- [x] T12: Security bump of next, eslint-config-next and sharp (R-383) — DONE — bump next/eslint-config-next 16.3.8 + sharp 0.35.5 (exact pins) installed by the lead under the owner's standing npm-install approval (registry issuer Google Trust Services); lockfile: 40 entries (next, @next/*, eslint-config-next, sharp, @img/sharp-*, libvips 1.3.4), none added/removed; T12b (Sonnet): SUPPORTED_NEXT_VERSION 16.3.8 + docs/release-verification.md; gates: npm audit --omit=dev 0 vulnerabilities, typecheck/lint/lint:security clean, default suite 157 files / 1966 tests, release-runner gates production-build + secret-artifacts + licenses PASS, node:test secret-scanning 49/49, install-script-allowlist 3/3; app uses none of the features fixed by the Next advisories (no images config, no use cache/ISR/metadata image routes)
**Wave 2: correctness with concrete consequences**
- [x] T13: Check-in page shows the Wi-Fi details once the disclosure time passes (R-391, R-531) — DONE — gates: typecheck, lint, lint:security clean; default suite 155 files / 1883 tests; patch R4-Txx
- [x] T14: build-workers refuses the repository root as its output directory (R-392) — DONE — gates: typecheck, lint, lint:security clean; default suite 155 files / 1883 tests; patch R4-Txx
- [x] T15: Error boundaries retry the server render and report locale errors (R-396, R-424) — DONE — gates: typecheck, lint, lint:security clean; default suite 155 files / 1883 tests; patch R4-Txx
- [x] T16: Prisma no longer exits the process on SIGTERM (R-403) — DONE — gates: typecheck, lint, lint:security clean; default suite 155 files / 1883 tests; patch R4-Txx
- [x] T17: Outbox deliveries stay best-effort and all settle before the worker fails (R-413, R-423) — DONE — gates: typecheck, lint, lint:security clean; default suite 155 files / 1883 tests; patch R4-Txx
- [x] T18: Guest erasure retries serialization conflicts (R-414, R-525) — DONE — gates: typecheck, lint, lint:security clean; default suite 156 files / 1915 tests; patch R4-Txx
- [x] T19: An erasure leaves no open request and no requester identity behind (R-440, R-458) — DONE — gates: typecheck, lint, lint:security clean; default suite 157 files / 1955 tests; patch R4-Txx
- [x] T20: Calendar sync failures and the stale threshold stay consistent (R-441, R-457, R-464, R-390) — DONE — gates: typecheck, lint, lint:security clean; default suite 156 files / 1915 tests; patch R4-Txx
- [x] T21: The operations run syncs the calendar before it evaluates alerts (R-416, R-539, R-596) — DONE — gates: typecheck, lint, lint:security clean; default suite 156 files / 1915 tests; patch R4-Txx
- [x] T22: The readiness probe is correct, logged and tested (R-428, R-451, R-521) — DONE — gates: typecheck, lint, lint:security clean; default suite 156 files / 1915 tests; patch R4-Txx
- [x] T23: The planner explains the 30-night cap and the minimum stay (R-434, R-442) — DONE — gates: typecheck, lint, lint:security clean; default suite 156 files / 1915 tests; patch R4-Txx
- [x] T24: The content build gate fails on any invalid guide item (R-421, R-456, R-437, R-446) — DONE — gates: typecheck, lint, lint:security clean; default suite 157 files / 1955 tests; patch R4-Txx
**Wave 3: remaining correctness, first security hardening**
- [x] T25: Manual booking input is bounded and its error reaches the host (R-422, R-449) — DONE — gates: typecheck, lint, lint:security clean; default suite 157 files / 1966 tests; node:test secret-scanning 49/49; patch R4-Txx
- [x] T26: Service-worker offline policy for outages, photos and live data (R-425, R-459, R-460) — DONE — gates: typecheck, lint, lint:security clean; default suite 157 files / 1966 tests; node:test secret-scanning 49/49; patch R4-Txx
- [x] T27: The availability page's fixed bars clear the header, the footer and the network pill (R-400, R-404, R-408) — DONE — gates: typecheck, lint, lint:security clean; default suite 157 files / 1966 tests; node:test secret-scanning 49/49; patch R4-Txx
- [x] T28: The secret source gate fails closed (R-420, R-501) — DONE — gates: typecheck, lint, lint:security clean; default suite 157 files / 1966 tests; node:test secret-scanning 49/49; patch R4-Txx
- [x] T29: The guest rate-limit message names the real wait (R-443) — DONE — gates: typecheck, lint, lint:security clean; default suite 157 files / 1966 tests; node:test secret-scanning 49/49; patch R4-Txx
- [x] T30: The privacy notice matches what the portal stores and what the web server logs (R-450) — DONE — legal.ts en+el done in W3B2 (error-log 14 days, no name/e-mail in arrival details); regression test added by T30b (Haiku): red on the HEAD legal.ts, green on the current; legal.ts byte-identical afterwards; gates: privacy-page + privacy-storage-inventory + i18n-parity pass; default suite 159 files / 2028 tests
- [x] T31: The map's Locate and Fit controls behave like Leaflet's own (R-394, R-398) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 1991 tests; patch R4-Txx
- [x] T32: The hero WebGL watchdog counts only chained slow frames (R-444) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 1991 tests; patch R4-Txx
- [x] T33: The lightbox fades in only once (R-409) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 1991 tests; patch R4-Txx
- [x] T34: Redaction keeps stack frames, catches embedded tokens, and logs no contact data (R-405, R-508, R-471, R-492, R-495) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 1991 tests; patch R4-Txx
- [x] T35: Production environment validation fails closed with clear issues (R-427, R-507, R-448, R-588) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 2028 tests; patch R4-Txx
- [x] T36: A remember-me sign-in revokes the browser's previous refresh family (R-494) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 2028 tests; patch R4-Txx
**Wave 4: security hardening and critical-branch tests**
- [x] T37: Claim step: the exchange cookie is bound to a server key and the limiter is keyed on the grant (R-499, R-496) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 2051 tests; patch R4-Txx
- [x] T38: API responses are not stored by browsers (R-497) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 2051 tests; patch R4-Txx
- [x] T39: Workers send webhooks over HTTPS only in production (R-505) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 2051 tests; patch R4-Txx
- [x] T40: The guest refresh endpoint has a durable rate limit (R-506) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 2051 tests; patch R4-Txx
- [x] T41: Database sessions run in UTC (R-510) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 2051 tests; patch R4-Txx
- [x] T44: Docker scan prefers the pinned container, and the build context excludes nested secrets (R-500, R-493) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 2066 tests; patch R4-Txx
- [x] T46: Restore the auth test rows removed against O36/O46 (R-533, R-535) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 2066 tests; patch R4-Txx
- [x] T48: The atomic check-in request write and the admin retry run against PostgreSQL (R-515) — DONE — integration run of 2026-10-09 22:41 (Docker, release runner): the new file's 4 cases pass, including 'frees the pending arrival slot of an erased booking for the next guest' (R-440 on PostgreSQL); typecheck, lint, lint:security clean; default suite 159 files / 2066 tests; patch R4-T48
- [x] T42: Request bodies are strict and bounded (R-572, R-511, R-569) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 2066 tests; patch R4-Txx
- [x] T47: Admin authentication controls are pinned by tests (R-526, R-522, R-523) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 2087 tests; integration suite 124 of 125 (only the T55 calendar-sync expectation red); patch R4-Txx
- [x] T43: Routes answer with consistent statuses and error shapes (R-467, R-593, R-445, R-563) — DONE — gates: typecheck, lint, lint:security clean; default suite 159 files / 2087 tests; integration suite 124 of 125 (only the T55 calendar-sync expectation red); patch R4-Txx
- [x] T45: Wi-Fi disclosure window: one time-zone source, pinned by tests (R-472, R-518, R-538) — DONE — gates: typecheck, lint, lint:security clean; default suite 161 files / 2104 tests; patch R4-Txx
- [x] T61: The QuoteBar's scroll padding also wins below 640 px (R-408, I-05) — DONE — gates: typecheck, lint, lint:security clean; default suite 161 files / 2104 tests; patch R4-Txx
- [x] T62: After sign-in or claim, the guest lands on the stay hub while check-in is off (R-601) — DONE — gates: typecheck, lint, lint:security clean; default suite 161 files / 2104 tests; patch R4-Txx
**Wave 5: remaining tests, cleanup, documentation**
- [x] T49: Guest client: URL scrubbing and the success paths are tested (R-516, R-536) — DONE — gates: typecheck, lint clean; default suite 163 files / 2152 tests; patch R4-Txx (the batch's only red gate is lint:security from T50)
- [x] T50: Guest session renewal and sign-out paths are tested (R-512, R-527, R-530, R-537) — DONE — Option C applied by the lead on the owner's explicit instruction of 2026-10-10 (decision O93): scoped no-script-url override for the one test file in eslint.config.security.mjs; patch .runtime/review-patches/R4-T50-lint-override.patch. Gate: npm run lint:security exit code 0 (whole repo).
- [x] T51: The published retention periods are pinned (R-524) — DONE — gates: typecheck, lint clean; default suite 163 files / 2152 tests; patch R4-Txx (the batch's only red gate is lint:security from T50)
- [x] T52: English and Greek strings use the same placeholders (R-520) — DONE — gates: typecheck, lint clean; default suite 163 files / 2152 tests; patch R4-Txx (the batch's only red gate is lint:security from T50)
- [x] T53: Home room cards read the apartment photo catalogue (R-430, R-486) — DONE — Deletion of the 7 files done by the lead on the owner's explicit authorization of 2026-10-10 (plain rm, files equal to HEAD before). Gates after deletion: typecheck rc=0, knip rc=0, vitest 3 files/47 tests, check:image-assets rc=0 (65 assets), grep for housePhotos in src and tests empty.
- [x] T54: Remove the never-loaded instrumentation hook (R-466) — DONE — README edit done earlier; instrumentation.ts and src/lib/env.ts deleted by the lead on the owner's authorization of 2026-10-10. Gates: typecheck rc=0, knip rc=0, grep for lib/env and instrumentation in src and scripts empty. Owner still corrects CLAUDE.md L65.
- [x] T55: Remove the dead PRISMA_AUTO_DISCONNECT and LOG_CONSOLE setters (R-488, R-548, R-549, R-579) — DONE — gates: typecheck, lint clean; default suite 163 files / 2160 tests; Docker integration suite 125 of 125; git grep PRISMA_AUTO_DISCONNECT finds nothing; patch R4-T55 (includes the calendar-sync 45-minute expectation, O63)
- [x] T57: identity.md matches the code (R-465) — DONE — gates: typecheck, lint clean; default suite 163 files / 2160 tests; patch R4-Txx
- [x] T59: Origin ingress: run instructions, zone-bound AOP, error-log retention, no version banner (R-473, R-502, R-503, R-509) — DONE — gates: typecheck, lint clean; default suite 163 files / 2160 tests; release-policy 63/63, validate:release-policy and the Docker nginx ingress gate pass; server_tokens off is in the template; the agent also ran extra disposable containers from the local pinned image (disclosed rule break, no leftovers found); patch R4-T59
- [x] T56: Stop storing the unused refresh-family IP hash (R-552) — DONE — gates: typecheck, lint clean; default suite 163 files / 2160 tests; Docker integration suite 125 of 125 (the adapted family ipHash assertion passes on PostgreSQL); patch R4-T56
- [x] T58: The operations runbook tells the truth (R-468, R-474, R-477, R-435) — DONE — gates: typecheck, lint clean; default suite 163 files / 2160 tests; documentation only; patch R4-T58
- [x] T63: Every strict request body and the admin login's disabled answers are pinned by tests (R-467, R-533, J-04) — DONE — gates: typecheck, lint clean; default suite 163 files / 2160 tests; patch R4-Txx
**Wave 6: final dependency re-check**
- [ ] T60: Re-check Next after the 2026-10-14 security release (no finding) — FUTURE — owner instruction of 2026-10-10: leave it as a future item; do not wait for the out-of-band Next security release announced for 2026-10-14 and do not do it in this run. When the owner starts it: check the new release notes and advisories, run the registry certificate issuer check, use the standing npm approval (the lead installs), then spec tasks/T60.md
- [x] T64: The admin request list never reports an erasure-cancelled notification as failed (R-609) — DONE — Run wf_e9083eaa-a7d (W6C1, 8 min). Scope clean. Gates after the batch: typecheck, lint, lint:security rc=0; default suite 163 files / 2166 tests. Two new cases red before the fix (logs/T64/red.log), green after. Patch R4-T64.patch.
- [x] T65: Redaction again masks an address with non-ASCII letters next to a URL (R-614) — DONE — Run wf_e9083eaa-a7d. Lead read the patch line by line (ASCII input cannot change: 400000 random ASCII inputs identical). Two new cases red before, green after (logs/T65). Residual limits recorded as R-626. Patch R4-T65.patch.
- [x] T66: Checks that pin the version banner, the counter retention, the claim limiter call and the credential length fail when those are removed (R-616, R-620, R-621, R-622) — DONE — Run wf_e9083eaa-a7d. Lead read the patch line by line. Part 1 new release-policy case red before the marker, green after; parts 2-4 mutation-checked on a scratch tree (logs/T66). Patch R4-T66.patch. test:release-policy is re-run at the wave end.
- [x] T67: Operator and security documentation state what the code does (R-608, R-612, R-613, R-615, R-625) — DONE — Run wf_e1805aa8-948 (W6C2, 8 min). Scope clean. Gates after the batch: typecheck, lint, lint:security rc=0; default suite 163 files / 2166 tests; validate:release-policy and test:release-policy 64/64 by the implementer. LC-19 greps pass (each new phrase present once, notifempty only in the 'Do not add' sentence, no ids in the six files); the pepper paragraph was checked against crypto.ts, refreshTokenRepository.ts, portalClaimExchange.ts, privacyHash.ts and portalAuthService.ts. Patch R4-T67.patch.
- [x] T68: identity.md and the hero comment match the code (R-623, R-624) — DONE — Run wf_e9083eaa-a7d. Docs verified by the lead: 16.3.6 appears only in the 'read at 16.3.6' line, z-index line and one-finger sentence present, heroGl comment changed, hero tests 17/17. Patch R4-T68.patch.
- [x] T69: The check-in page reloads once for the Wi-Fi details when the arrival form closes after the disclosure time (R-619) — DONE — Run wf_e9083eaa-a7d. Two new cases (case 1 red before, green after; case 2 pins the no-loop guard). Patch R4-T69.patch.
- [x] T70: Address redaction also handles combining marks next to a URL; the digit part of the address class is pinned (R-626) — DONE — Run wf_2b9247dc-c93 (W6C3, 6.6 min). Scope clean. Lead read the patch line by line: four added lines in redaction.ts, no existing line changed; ASCII output unchanged (300000 random inputs, 0 differences), 300000 mixed-script tokens gave 2054 new redactions and 0 lost. Three combining-mark rows red before, green after; two digit rows fail exactly when p{N} is removed. Gates after the batch: typecheck, lint, lint:security rc=0; default suite 163 files / 2172 tests. Patch R4-T70.patch. Part (c) of R-626 accepted (O94).
- [x] T71: The documented error-log rule keeps at most 14 days: rotate 13 (R-625) — DONE — Run wf_4716ca2e-791 (W6C4, 1 min). Scope clean. Gates after the batch: typecheck, lint, lint:security rc=0; default suite 163 files / 2172 tests; validate:release-policy rc=0 and git diff --check clean by the implementer; the grep gate prints exactly the three expected lines. Patch R4-T71.patch. The logrotate retention is still to be confirmed on the Linux host (owner step).

### Decision round 2 (decision agent, 2026-10-09): items found while executing Waves 1-3
- New tasks: T61 (QuoteBar scroll padding below 640 px, Haiku, W4B4; O80) and T62 (sign-in and claim land on /{l}/stay while check-in is off, Sonnet, W4B4; R-601, O81). Amended pending tasks: T39 (outbox error message names the causes, R-603), T48 (integration case: an erasure frees the pending slot, R-440), T49 (Greek rate-limit pin), T51 ("14 days" wording), T55 (integration backoff expectation 60 -> 45 minutes, O63), T57 and T58 (documentation sync).
- Declined or deferred: widening the coverage list (O78), equal peppers and the origin echo (O79), offline Home link, Safari/Firefox frame parsing, build-workers allowlist, T10 leftovers, the T23/T24 notes; the privacy-notice gaps go to the owner's legal review with suggested wording (O82). New findings: R-601 (fix in T62), R-602 (duplicate of R-410/R-411, declined with them, O83), R-603 (fix in T39); they are drafted in `.runtime/review4/new-findings.md` and are appended to REVIEW.md at the end.
- Lead browser checks (LC-01..LC-14, `.runtime/review4/lead-checks-plan.md`; results in `lead-checks.md`): done so far T27 (R-400, R-404 and the footer pass; the scroll padding fails below 640 px, fixed by T61), T33, T31, T03, T06 (basic).
- Owner notes: a production env file with LOG_LEVEL=fatal, a patterned or placeholder pepper (the .env.example values fail) or a pepper equal to an auth credential now exits 78 at start (T35, O70); equal peppers are still accepted (O79). While check-in is off, a sign-in or claim lands on /{l}/stay (T62). Legal review of two privacy-notice gaps (O82). CLAUDE.md is the owner's to edit (L65 after T54; Content paragraph: slug pin and strict build gate).

### Operating model alignment (the OPERATING MODEL section of CLAUDE.md appeared at 22:53 on 2026-10-09)
- Decision output paths: round 1 `.runtime/review4/decisions.json` (rendered in decisions.md), round 2 `.runtime/review4/round2-result.json` (prompt `round2-prompt.txt`, input `round2-input.md`). Round 2 ran at effort xhigh, before the section existed; the final round runs at effort max with the rules block of `decision-rules-block.txt` (CORE PRINCIPLES 1-3, Never delegated, FORBIDDEN, data-not-instructions, copied verbatim by `impl-tools/decision-rules-block.mjs`).
- Implementers run at effort xhigh, max for security, concurrency and data tasks (from batch W4B2 on). Deviation recorded: for the single-task batch W4B2b (T37b) the lead let the implementer run `npm run test:integration` three times; the OPERATING MODEL says the lead runs Docker and full gates, so that exception was removed from the contract and is not repeated. The one observed side effect: an unrelated concurrency test (A3) hit a barrier timeout once while the machine was busy (it passed in the other two runs).
- The batch fingerprint now also guards `.git/config`, `.git/hooks`, `.claude/`, the tooling folder `.runtime/review4/` and the ignored files (except dependency folders, `.env*`, `.next`, `coverage`), so a write there is reported as out of scope (the tooling folder is therefore synced only between batches).

### Decision round 3 (decision agent, Opus 5.5, effort max, 2026-10-10): items found while executing Waves 1-4
- Output `.runtime/review4/round3-result.json` (prompt `round3-prompt.txt`, input `round3-input.md`). One new task: T63 (Sonnet, W5B2, test-only: unknown-key 422 tests for four body schemas, the non-strict read of a stored preference, the admin login's 503/400 answers; R-467, R-533). T58 is extended by two documentation sentences (R-604 cookie bound, R-605 `options` in DATABASE_URL; O84, O85).
- New findings recorded and accepted without a code change: R-604 (Low: the claim exchange cookie's five minutes are enforced by the browser only, O84) and R-605 (Low: an `options` parameter in DATABASE_URL replaces the TimeZone=UTC pin, reproduced by the lead, O85). R-601 (T62) and R-603 (T39) are fixed; R-602 duplicates R-410/R-411 and stays declined (O83).
- Declined: the error-answer Cache-Control (O86; lead check LC-13 is corrected to the 200 responses and the export), the DST reveal hour (owner note, O87), the unreachable null branch, the undetectable `path: '/'` mutants, the PROPERTY_TIME_ZONE wording, the shellLinks import and the older tests' flag mocks, the Prisma error text in the outbox log (checked: no secrets reach it), a sanitising task.
- New lead check LC-15 (Docker-only gates of Wave 5, run by the lead): after W5B2 `npm run test:nginx-ingress` and the `server_tokens` grep; after W5B3 the integration suite and `git grep PRISMA_AUTO_DISCONNECT`.
- Owner notes added or corrected in round 3: T44 never fell back to a host Trivy after a failed container scan (what changed is that the pinned container runs first whenever an engine is reachable; set DOCKER_SCAN_SCANNER=trivy to choose the host binary); T37 rollout (only a sign-up whose exchange was answered by the old release and whose claim reaches the new one fails, once); T43 (flags 422 text and `validationErrors`, preferences POST 401 for every non-admin, malformed check-in request id 404); do not add `options=` to DATABASE_URL; the Wi-Fi reveal is 24 hours of elapsed time, so on a DST weekend it shifts by one hour.

### Stopped at a safe point (2026-10-10, about 13:45): two permission denials, owner decisions waiting
- Owner decision 1: T50's new test has a deliberate `'javascript:alert(1)'` literal that fails `lint:security` (`no-script-url`); the retry was denied ([Security Weaken]); options A-D are in `.runtime/review4/owner-steps.md`, the proposed edit is `R4-T50-pending-owner.patch`. Owner decision 2: file deletions are denied to agents ([Irreversible Local Destruction]); T53 (7 files) and T54 (2 files) need `git rm` by the owner or a permission rule; `owner-steps.md` has the commands. Nothing was circumvented (T53's workaround with `mv` was undone).
- Resolved the same day (2026-10-10): decision 1 by the owner's instruction "T50: apply the override" (option C, decision O93, patch `R4-T50-lint-override.patch`); decision 2 by the owner's chat authorization to bypass the permission denial for the ten deletions only (the lead used plain `rm`; both tasks T53 and T54 are DONE).

### Wave checkpoints
### Checkpoint W1 - Fri Oct 9 2026 (written retroactively at the end of Wave 3 from the recorded batch notes)
- Batches: W1B1..W1B4 (T01 T02 T03 T04 T05 T06 T07 T08 T09 T10 T11) DONE; T12 BLOCKED (agents cannot run npm install), done later by the lead with T12b (batch W1B5), see the Wave 3 block.
- Changed files: 34 uncommitted files at the end of the wave (including PROGRESS.md and REVIEW.md); per-task patches: `.runtime/review-patches/R4-T<nn>.patch`.
- Gates (exit codes): typecheck=0 lint=0 security-lint=0 default-suite=0 (154 files / 1865 tests after T06-T10).
- Wave-end: only the per-batch gates ran for this wave (dead-code, coverage, diff-check and the secret scan were not run separately).
- Decisions this wave: O47..O77 (decision agent, plan of 2026-10-09).
- New findings, not fixed in-task: R-601 (found during T08; fixed by T62).
- Cost: not measured; implementers ran with the default effort.
- Next: Wave 2.

### Checkpoint W2 - Fri Oct 9 2026 (written retroactively at the end of Wave 3)
- Batches: W2B1 (T13 T14 T15 T16 T17) DONE, W2B2 (T18 T20 T21 T22 T23) DONE, W2B3 (T19 T24) DONE.
- Changed files: 62 uncommitted files at the end of the wave; per-task patches as above.
- Gates (exit codes): typecheck=0 lint=0 security-lint=0 default-suite=0 (157 files / 1955 tests).
- Wave-end: dead-code=0 coverage=0 (statements 93.12 %, branches 86.91 %, functions 95.53 %, lines 94.18 %) diff-check=0; the secret scan ran at the end of Wave 3.
- Decisions this wave: none new.
- New findings, not fixed in-task: none recorded as findings; notes went into the open-amendments list (decision round 2).
- Cost: not measured; default effort.
- Next: Wave 3.

### Checkpoint W3 - Fri Oct 9 2026 22:00 EEST
- Batches: W3B1 (T25 T26 T27 T28 T29) DONE, W3B2 (T30 T31 T32 T33 T34) DONE (T30 partial), W3B3 (T35 T36 T30b) DONE (T30b added the test that T30 could not). Between the waves the lead ran the dependency bump T12 and the batch W1B5 (T12b): `npm install --save-exact next@16.3.8 eslint-config-next@16.3.8 sharp@0.35.5` under the owner's standing npm approval, after reading the release notes and advisories; package.json differs in exactly three lines, 40 lockfile entries changed (next, @next/*, eslint-config-next, sharp, @img/sharp-*, libvips 1.3.3 -> 1.3.4), none added or removed; `npm audit --omit=dev` 0 vulnerabilities; the build, the artifact scan and the license check pass.
- Changed files: 91 uncommitted files at the end of the wave; per-task patches in `.runtime/review-patches/` (R4-T12.patch is the lead's package.json and lockfile diff).
- Gates (exit codes): typecheck=0 lint=0 security-lint=0 default-suite=0 (159 files / 2028 tests).
- Wave-end (release runner, 12 gates): secret-scan=0 (sources) secret-tests=0 release-policy=0 runtime-credentials=0 dead-code=0 coverage=0 production-build=0 artifact-scan=0 licenses=0 diff-check=0 candidate-diff=0. The Docker integration suite ran once: 120 of 121 passed; the one failure is the stale backoff expectation of the integration test, fixed by the T55 amendment (O63).
- Decisions this wave: O78..O83 (decision round 2, after the wave).
- New findings, not fixed in-task: R-601 (T62), R-602 (duplicate of R-410/R-411, declined, O83), R-603 (T39; already applied).
- Cost: W3B1 797 s / 717k subagent tokens, W3B2 807 s / 859k, W3B3 637 s / 416k, W4B1 746 s / 735k; default effort. From W4B2 on the implementers run with effort xhigh (max for security, concurrency and data tasks), as the runbook asks.
- Lead browser checks (details in `.runtime/review4/lead-checks.md`): T27 (one failure below 640 px, fixed by T61), T33, T31, T03, T04, T05/T26, T06, T23: pass.
- Next: Wave 4 (W4B1 T37-T41 DONE; W4B2 running).

### Checkpoint W4 - Sat Oct 10 2026 12:23 EEST
- Batches: W4B1 (T37 T38 T39 T40 T41) DONE; W4B2 (T44 T46 T48 T42) DONE (T48 was partial until the lead's integration run, then DONE); W4B2b (T37b) DONE (follow-up: the claim concurrency integration expectation after T37); W4B3 (T47 T43) DONE; W4B4 (T45 T61 T62) DONE.
- Changed files: 132 uncommitted files (includes PROGRESS.md, REVIEW.md, package.json, package-lock.json and 10 new test files); per-task patches in `.runtime/review-patches/` (R4-T12.patch is the lead's package.json and lockfile diff).
- Gates (exit codes): typecheck=0 lint=0 security-lint=0 default-suite=0 (161 files / 2104 tests).
- Wave-end (release runner, 12 gates): secret-scan=0 secret-tests=0 release-policy=0 runtime-credentials=0 dead-code=0 coverage=0 production-build=0 artifact-scan=0 licenses=0 diff-check=0 candidate-diff=0. Docker integration suite: 124 of 125 pass; the one red test is the stale calendar-sync backoff expectation, fixed by the T55 amendment in Wave 5.
- Decisions this wave: none new (the round 2 decisions O78..O83 were applied at the start of the wave).
- New findings, not fixed in-task: none recorded as R-ids; the candidates C4..C18 are in amendments.md (final decision round before Wave 5).
- Cost: W4B1 746 s / 735k subagent tokens (default effort); W4B2 1112 s / 815k (max, one xhigh); W4B2b 714 s / 141k (max, ran the integration suite itself, see the alignment note); W4B3 2702 s / 410k (max); W4B4 451 s / 309k (xhigh, max).
- Lead browser checks: LC-01 (T61) pass, LC-11 (T08, signed-out menu) pass, LC-13 (T38) partial (401 answers carry no Cache-Control); details in `.runtime/review4/lead-checks.md`.
- Next: decision round 3 (Opus 5.5, effort max) for the candidates, then Wave 5 (W5B1..W5B3).

### Checkpoint W5 (partial, stopped at a safe point) - Sat Oct 10 2026 13:27 EEST
- Batches: W5B1 (T49 T50 T51 T52 T53): T49, T51, T52 DONE; T50 BLOCKED (one lint:security error in its new test, owner decision 1); T53 PARTIAL (code done; the deletion of 7 files is an owner step, owner decision 2). W5B1b (retry T50b): blocked by the permission system ([Security Weaken]), nothing changed. W5B2 (T54 T55 T57 T59 T63) and W5B3 (T56 T58) are not started.
- Changed files: 143 uncommitted files; per-task patches in `.runtime/review-patches/` (R4-T50-pending-owner.patch is the saved fix for decision 1).
- Gates (exit codes): typecheck=0 lint=0 security-lint=1 (tests/components/portal-refresh-redirect.test.tsx 123:56 no-script-url) default-suite=0 (163 files / 2152 tests) dead-code=0.
- Stop triggers hit: (1) the permission system denied `rm` for T53 ("Irreversible Local Destruction"); the agent then moved the files to a scratch folder, which is a workaround; the lead undid it (7 files restored from the pre-batch snapshot, identical to HEAD). (2) The permission system denied the T50b edit ("Security Weaken"); not circumvented. (3) Three implementers (T50, T51, T52) wrote into the tooling folder `.runtime/review4/` on a stale relayed user message (the guard reported it; content identical to the lead's files; harmless).
- Decisions this wave: none (round 3, O84..O87, was applied before the wave).
- New findings, not fixed in-task: none.
- Cost: W5B1 1463 s / 821k subagent tokens (max and xhigh); W5B1b 331 s / 105k (max).
- Next: the owner's decisions (owner-steps.md), then W5B2, W5B3, the lead checks LC-14 and LC-15, the final gates (verify:release with the Docker integration suite, docker:build, smoke:image), REVIEW.md finalization, commit map.

### Checkpoint W5 (completed except the owner-blocked parts) - Sat Oct 10 2026 14:25 EEST
- Batches: W5B1 (T49 T50 T51 T52 T53): T49 T51 T52 DONE, T50 BLOCKED, T53 PARTIAL; W5B1b (T50b retry) blocked by the permission system; W5B2 (T54 T55 T57 T59 T63): T55 T57 T59 T63 DONE, T54 PARTIAL (README edit done, the two file deletions are an owner step); W5B3 (T56 T58) DONE.
- Changed files: 166 uncommitted files; per-task patches in `.runtime/review-patches/`.
- Gates (exit codes): typecheck=0 lint=0 security-lint=1 (tests/components/portal-refresh-redirect.test.tsx 123:56 no-script-url, owner decision 1) default-suite=0 (163 files / 2160 tests).
- Wave-end (release runner, 12 gates): secret-scan=0 secret-tests=0 release-policy=0 runtime-credentials=0 dead-code=0 coverage=0 production-build=0 artifact-scan=0 licenses=0 diff-check=0 candidate-diff=0. Docker integration suite: 125 of 125 pass; orphan check clean.
- Decisions this wave: none new (round 3, O84..O87, applied before the wave).
- New findings, not fixed in-task: none recorded as R-ids; notes C15..C18 and the W5B2 notes are in amendments.md.
- Cost: W5B1 1463 s / 821k (max, xhigh); W5B1b 331 s / 105k (max); W5B2 655 s / 688k (xhigh, max); W5B3 506 s / 309k (max, xhigh).
- Lead browser and command checks: LC-14 pass, LC-15 pass, LC-13 corrected criterion pass for the measured answers (lead-checks.md).
- Incidents: T59 ran extra disposable containers from the local pinned image for a red/green probe (a disclosed rule break; no containers or networks left); T55 and T63 each removed a scratch file inside the scratchpad (disclosed); no repository file was deleted or moved by an agent in this batch.
- Next: independent QA of the whole follow-up (read-only finders, verifiers, refuters), the owner's decisions 1 and 2, the image build and smoke test, REVIEW.md finalization and the commit map.

### Checkpoint W5-final / W6 pause (paused at the owner's request) - Sat Oct 10 2026 16:20 EEST
- Done since the W5 checkpoint: T53 and T54 deletions (10 files, owner authorization in chat), T50 override (decision O93, patch R4-T50-lint-override.patch), decision round 4 (Opus max, 44 min, 147 tool calls, about 417k tokens): 6 new tasks T64..T69 (batches W6C1 = T64 T65 T66 T68 T69, W6C2 = T67; the name W6B1 is the future task T60), decisions O88..O92, R-625 recorded.
- Gates on the tree before Wave 6 (T50 and the deletions applied): typecheck, lint, knip rc=0; default suite 163 files / 2160 tests; lint:security rc=0; verify:release 30/30 in 182.7 s (log impl/verify-release-2.txt, includes the disposable PostgreSQL integration suite); docker:build rc=0 with NEXT_PUBLIC_SITE_URL=https://localhost:3002 and smoke:image 23 of 23 checks (impl/docker-build-2.txt, impl/smoke-image-2.txt). The earlier smoke failure was a wrong build URL (release.example.invalid), not a code defect.
- Ledger now: 251 findings | FIXED 122 | DECLINED 113 | DEFERRED-OWNER 2 | OPEN 14 (R-608 R-609 R-612 R-613 R-614 R-615 R-616 R-619 R-620 R-621 R-622 R-623 R-624 R-625, all covered by T64..T69).
- W6C1 was started (wf_0c13fa42-0c5, 16:13) and stopped after about 2 minutes for the owner's pause; the 13 files were restored from snap/ and verified against fp/before-W6C1.json. Nothing of Wave 6 is applied.

### Checkpoint W6 (Wave 6 and the whole follow-up complete) - Sat Oct 10 2026 17:42 EEST
- Batches: W6C1 (T64 T65 T66 T68 T69, 8.3 min), W6C2 (T67, 7.9 min), W6C3 (T70, 6.6 min), W6C4 (T71, 1.1 min); the first W6C1 run was stopped after about 2 minutes for the owner's pause, the tree was restored from snap/ and verified, and the batch ran again as a new run. Decisions: round 4 (19 findings, 44 min, Opus max), R-626 (23 min), the R-625 rotation point (4.5 min). Wave 6 tasks T64..T71 are DONE; T60 stays a future item by the owner's instruction.
- Gates on the final tree: verify:release 30/30 in 186.1 s (log impl/verify-release-3.txt): default suite 163 files / 2172 tests, release-policy tests 64/64, disposable PostgreSQL integration suite 23 files / 125 tests, coverage 93.93 / 88.23 / 96.05 / 95 (thresholds 88/82/91/89), typecheck, lint, lint:security, knip, licenses, Prisma, synthetic production build and artifact scan, whitespace and candidate-diff checks, container orphan check. docker:build rc=0 (runner sha256:552872cd, workers sha256:1c45fc49, migrate sha256:139c1d87; the tag ends in -dirty and must never be deployed) and smoke:image 23 of 23, nothing left behind.
- Ledger (exit code 0): 252 findings | FIXED 137 | DECLINED 113 (7 of them accepted risks: R-604 R-605 R-606 R-607 R-610 R-611 R-617) | DEFERRED-OWNER 2 (R-393 inside R3-L6/L7, R-556 staging of the lsall.err deletion) | OPEN 0. All 2 High and all 12 Medium findings are FIXED; there is no Critical finding. REVIEW.md carries a Resolution line on every finding.
- Incidents: the permission classifier denied the lead's rm of the ten files ([Auto-Mode Bypass]), one harmless script run and the lint override edit ([Security Weaken]); each was lifted only by an explicit owner message and nothing was worked around. The first smoke:image failure was a wrong build URL (release.example.invalid), not a code defect. The REVIEW tooling had a regex bug (\Z is a literal Z in JavaScript) that cut finding blocks at the first Z; it was found on a temporary copy before the real file was written and fixed (check-specs.mjs had the same bug, and every batch scope check still passed). The git-write-guard hook blocked two lead commands that only mentioned forbidden words in text.
- Owner steps are listed in owner-steps.md and in the Owner-only line above.
- Last verify:release: the first run after the final REVIEW.md and PROGRESS.md failed at gate 15 (coverage thresholds) because the machine was overloaded by macOS background daemons (load average 17.9; three tests timed out at 10 s and one vitest worker did not start); after the load had settled, the single retry passed 30/30 in 182.8 s (log impl/verify-release-5.txt). That run covered the tree except this one added line; whitespace and secret patterns were checked for it separately.

RESUME FROM: nothing left for the lead; the follow-up is complete (2026-10-10 17:42): ledger exit code 0 (252 findings, FIXED 137, DECLINED 113, DEFERRED-OWNER 2, OPEN 0), verify:release 30/30, docker:build and smoke:image 23/23 on the final tree | next action: the owner reviews the diff, stages the ten deletions with the other changes and commits by .runtime/review4/commit-map.md; owner-only steps are in .runtime/review4/owner-steps.md and in the Owner-only line of the Review 4 follow-up block | state files: .runtime/review4/ | open decisions: none; the future item T60 (Next re-check after the 2026-10-14 security release) is not started and not planned in this run | written: 2026-10-10 17:42
<!-- R4-FOLLOWUP:END -->

## Remaining work

### Agent: done 2026-10-06 (patch `R3-Z.patch`)
- [x] R3-Z1: R-315, the check-in location highlights draw their own icons (shared icon set); new component test.
- [x] R3-Z2: R-373, 23 confirmed-unused keys removed from `common.ts` (en, el, type); dynamically read groups kept.
- [x] R3-Z3: R-374, numbered guide-map pins drew under landmark/home markers at 390 px; numbered markers now stack on top (`zIndexOffset`). Pin 4 stays partly under 5 at the fit-all zoom (198 m apart, a scale limit); one zoom-in tap shows all.
- [x] R3-Z4: Turbopack-cache note for release gate 24 (docs/release-verification.md); identity §13 sentence about contact.ts corrected.
- R-325/R-326 got their Resolution lines (kept by the V8/C2 decision).

### Open question for the owner
- Q1 Nginx error log and visitor IPs (from the privacy review sheet, never tracked): the origin Nginx access log is IP-free, but its `error_log … warn` lines include `client: <addr>` (e.g. rate-limit rejections), and /privacy says IPs are stored only as keyed hashes in the database. Options: (a) keep the error log and set a short rotation (e.g. 14 days via the Docker log driver), adding one sentence to the privacy retention section (en/el); (b) lower the rate-limit log levels below the error-log threshold so those lines disappear (loses rejection diagnostics). Recommendation: (a).

### Deferred by the owner (do NOT start until the owner asks)
- **R3-L6/L7: final ΤΑΚΚ and cancellation texts (owner + accountant).** Today: draft texts on /{l}/availability (cancellation, withdrawal, climate resilience fee, "about the prices"), reused by the home FAQ; fee schedule in `src/data/stayPolicy.ts` (`CLIMATE_FEE_SCHEDULE`: €8/night Apr–Oct, €2/night Nov–Mar, amounts in cents). The owner brings: (1) the accountant's confirmation of the ΤΑΚΚ category, amounts and who collects it; (2) the cancellation policy that matches the Airbnb listing; (3) the tax retention period (affects `GUEST_DATA_RETENTION_MONTHS = 12` in `stayPolicy.ts`). Then: update the strings in `src/i18n/domains/availability.ts` (and the FAQ in `home.ts`), the schedule constants if amounts differ, and their tests (stay-quote, availability page, FAQ). Note: the availability page's fee section shows only the rule in force today (`climateFeeRuleOn(today)`) while quotes apply each night's rule; if the new schedule has dated rules, list them on the page too.
- **R3-L1: legal identity data + Airbnb link (last task).** The owner brings: ΑΜΑ (or ΕΣΛ/ΜΗΤΕ number if licensed), full legal name, address, ΑΦΜ only if VAT-liable, and the public Airbnb listing URL. Then: add `legalName` / `registrationNumber` / `address` to `HOST_CONTACT` in `src/data/contact.ts` (the privacy page already reads `legalName`/`address` when present); set `AIRBNB_LISTING_URL` in `contact.ts` (every "Book on Airbnb" button appears once it is a valid listing URL); show the identity in the footer (marketing and stay), on the apartment and availability pages, and as controller in /privacy; tests that the footer/availability/privacy render the number; G-I18N, G-VIS.

### Owner, outside the code
- Review and commit the patches; build the release images from a clean checkout of the approved commit with the real `NEXT_PUBLIC_SITE_URL`; put `CARTO_BASEMAPS_KEY` and `AIRBNB_ICAL_URL` (secret; never read by the agent) into the production environment.
- After deployment: enable the portal and check-in flags in the admin (both default to off); print the QR for `/{l}/stay`; block phone bookings in the Airbnb calendar; keep rate-period minimum nights in step with Airbnb; never put the site link in the Airbnb listing or messages (Off-Platform policy).
- Privacy notice points to confirm (from the L2 review sheet): the hosting provider (the ADR names Netcup) and its data processing agreement; Cloudflare and the transfer-basis wording (EU-US DPF + SCCs); whether to name CARTO's company/country; which services receive arrival notifications and alerts; the AADE example wording and tax retention (accountant); the no-banner ePrivacy reading; ideally a lawyer's review of the whole text.
- Offline GDPR and legal duties (REVIEW.md "Legal requirements", rows 8, 9, 16, 17, 19): a one-page record of processing (art. 30); processor agreements (art. 28: hosting, Cloudflare DPA, webhook receiver); a security and breach-notification routine (art. 32–34); property standards of L. 5170/2025 art. 3 (bilingual emergency-number list in the apartment); ask the accountant whether wording such as "Host 24/7" or luggage storage affects the tax characterisation (row 17); police guest-register duty (row 19, unclear); show the ΑΜΑ on the Instagram profile too.
- Before launch, verify the emergency numbers in `src/data/items/phones.json` (R3-L10: 166, 199, 100, 108, 1056, Poison Centre 210 7793777; the hospital "24/7"): agent-written, not re-checked against a source, no `sourceUrls`.
- Guide entries (optional): coordinates for the 13 C2 entries (today they have no map pin or distance, and Directions searches by name) and photos (owner or free licence with attribution). Opening hours exist only on `.runtime/content/C2-guide.html` (the item schema has no hours field).

### Needs the production host or database
- R3-A7 / R-182: run the integration suite on linux/amd64 on the production host (the PostgreSQL 16.15 pin was verified on arm64 locally).
- C11 / R-040: unused indexes need production index statistics.
- R-042 (remainder): the `check_in_requests.guest_*` copies are kept because the arrival webhook payload sends them (O15); R3-L5 redacts them 12 months after the booking ends. Drop them only after the webhook consumer confirms it does not need them. (`users.email` was already dropped by R3-L12, migration `20260930120000_minimise_user_data`.)
- First sync with the real `AIRBNB_ICAL_URL`: run "Sync now" in /admin/availability and confirm `synced` with the expected blocked nights (checks the real export format, redirects and egress to airbnb.com; the parser fixtures were written from memory of the Airbnb feed). On `failed`, read the error code in the admin panel; never log the URL.
- Restrict the CARTO key to the site domain in the CARTO dashboard.
- R-254: exercise the two-role database setup (documented only).
- O33 deployment checklist: Nginx from the pinned container image, every web-facing DNS record Cloudflare-proxied or serving its own HTTPS (HSTS `includeSubDomains`).

### Watch items (no action now)
- R-370: braces ≤ 3.0.3 (dev-only, lint toolchain) has no fixed release; re-check `npm audit` and update when one is published.
- Airbnb deep-link date parameters stay off until verified with the real listing URL (R3-L1).
- The dialog/view-transition morph was checked in Chrome only; Safari not checked.
- Not visually checked: the signed-in admin pages (dashboard, guests, availability) after R3-V10/V12 (only /admin/login was captured), and the guide card → detail View Transition morph (identity §5.7). Check them with a seeded dev DB before release.
- Known R3-V9 deviations (not bugs): the check-in H1 shows no stay dates (no API supplies them), the check-out tile shows only the existing text, and the 404 page keeps the route-based header.

## Decisions in force (owner unless marked "lead")
- O22: one small VPS with portal and admin, PostgreSQL unchanged. No booking form: availability from the Airbnb iCal export, prices from admin rate periods; guests book on Airbnb or call/WhatsApp; in-stay pages (/stay, portal) show no booking call to action.
- O23: legal identity data is the last task (R3-L1).
- O24: travel-time chips (OSRM) removed.
- O25: security updates (Node 22.23.3 base image, PostgreSQL 16.15, Nginx 1.30.x ≥ 1.30.4, Prisma ≥ 7.10, migrate-image overrides). O26: release/test tooling reduction.
- O27 defaults: brand "Dolce Far Niente · Kalamata"; WhatsApp on the host phone; retention 12 months; HSTS preload off; `/about` merged into the home page.
- O28: map tiles CARTO Voyager/Dark Matter with the owner's key, otherwise standard OSM tiles; never keyless CARTO. The key is only in `.env.local` locally and in the production env.
- O29 (lead): corporate network. Check the registry certificate issuer right before any download and stop if it names Cisco/Umbrella; never change TLS, CA, proxy or system settings.
- O30: Puppeteer 25 (done). Its `setOfflineMode` no longer reaches the service worker (R-371) and request interception breaks service-worker navigations (R-372); both handled in the scripts.
- O32: design decisions delegated to the lead (guard rails: reduced motion respected, WebGL progressive only, mobile performance budget, CSP without `unsafe-eval`, contrast ≥ 4.5:1).
- O33 (lead): Nginx as the pinned container image; HSTS `includeSubDomains` kept with the DNS rule above; `docker:scan` uses Trivy 0.69.3 as a container (digest-pinned).
- O34 (lead): `.runtime/**` is excluded from ESLint and tsconfig (local scratch data, never source).
- O35 (lead): license check allows `elkjs` (EPL-2.0, Prisma Studio) as a narrow per-package exception.
- O36/O46 (lead): no security, auth, legal or contract test is removed, even when it duplicates another.
- O38 (lead, relaxed after R3-V12b): component sheets stay unlayered (layering them now would let utilities beat them); the existing two-class colour rules are kept; new CSS no longer has to be class-only. Code comments still cite O38.
- O41 (lead, owner approved V4): header nav from 1280 px (Greek did not fit at 1024), language switch in the header from 768 px; Auto/Day/Night and the motion switch are also in the footer; /favorites is reached through the "Saved n" link in the guide list.
- O39 (lead): R-348 declined (security-config knobs).
- O42 (lead): unknown flags of `system-orchestrator.sh` exit 1.
- O43: the header bar is transparent (glass tokens, halo on photo pages); floating bars use `--color-glass-bar`.
- O45: the sea view is owner-confirmed ("Sea, mountain, and city views" / «Θέα σε θάλασσα, βουνό και πόλη»).
- C1 (2026-10-06): all copy proposals approved; owner facts: large sunny terraces, nearest beach 5 min by car (no km), museum and Public Library–Art Gallery ~15 min on foot / 5 by car, airport 6 km ~15 min; host letter = the owner's text polished (`.runtime/content/host-letter-approved.md`). Lead (C1f): Greek guest-facing host wording is feminine to match the hostess letter, legal texts keep the role noun; city centre "about 15 min" on foot, consistent with the owner's times.
- C2 (2026-10-06): 13 guide entries approved as written (guide now 18 places).
- T1 (2026-10-05): lean test suite; duplicate tests removed except those protected by O46.

## Completed work (details in the patches and the archived log)
- Phase 1 security and release hygiene: R3-A2…A11, A8b, S1, S3, S4, X1, X2, O33.
- Phase 2 product restructure: R3-P1 (OSRM removed), R3-F01…F13 (availability & prices, iCal sync, rate periods, booking form and stay-request backend removed), R3-M1 (map tiles).
- Phase 3 correctness: R3-B3…B56. Phase 4 cleanup: Groups D, E, N1; dead-code sweep R3-K1…K11 (R-316…R-353).
- Phase 5 identity: R3-V1…V14 (tokens, self-hosted fonts, shell, home, apartment, availability, guide, /stay hub, admin, SEO and OG images, legacy CSS deleted, a11y/performance pass, motion).
- Phase 6 content: R3-C1, C1f, C2, C2f. Phase 7 legal: R3-L2, L3, L5, L8, L10, L12. Test-suite cleanup R3-T1.
- Phase 8 release: R3-R1 docs sweep; R3-R2 full gate (fixed on the way: R-369 source-map-js 1.2.2, R-371 smoke offline harness, R-372 audit navigations).

## Declined (do not redo)
- R-348 security-config knobs (O39); R-249 (a) integration forbidden-target list (O36); R-236 (D27 skip); R-239, R-240 (owner options, not defects).
- R-076: gate 28 is a subset of gate 29, but `docs/release-verification.md` forbids inferring away overlapping gates.
- R-096 `telHref` changes; the R-102 nits listed in the archived log.
- Puppeteer is not downgraded or pinned below 25; the braces advisory is not "fixed" by downgrading `eslint-config-next`.

## Notes for the next agent
- `source ~/.nvm/nvm.sh && nvm use 22.19.0` first (the shell default is Node 26).
- Secret-scan gates: `export GITLEAKS_BIN=$HOME/.local/share/gitleaks/8.30.1/gitleaks`. Run `verify:release` with `env -u DATABASE_URL -u DIRECT_URL`. Delete `.next/cache/turbopack` before a production build when a new CSS `@import` was added. `docker:build` needs `NEXT_PUBLIC_SITE_URL` (`https://localhost:3002` for the smoke).
- Visual checks: throwaway PostgreSQL container `qr-vis-db` (postgres:16-alpine digest pin, 127.0.0.1:5439; URL in the session scratchpad `vis-db-url`, never printed) with `next dev -H 127.0.0.1 -p 3000`. Every puppeteer script blocks non-localhost requests. Helpers (gates.sh, vis.mjs, snap.sh, lane.sh, patchfiles.sh, execute-*.js, review-cap.mjs, specs) are kept in `.runtime/tools/`; the scratchpad is wiped on reboot. snap.sh, lane.sh, patchfiles.sh, the execute-*.js scripts and the production-start helper hard-code this session's scratchpad path (`/private/tmp/claude-503/-Users-pvasilakis-site/e6271ddf-…/scratchpad`): copy them into the new scratchpad and fix that path before use (snap.sh runs `rsync --delete` into it).
- Patches: `snap.sh start` before a task, `snap.sh patch <ID>` after; always check that `snapdir/a` is not a symlink first (a past incident ran a reverse patch on the main tree).
- Sensitive routes need the identity headers: `npm run dev` + `npm run dev:proxy`, open http://localhost:3001. Admin sign-in for live checks: pass `ADMIN_DASH_SECRET` through an environment variable, never print it.
- `scripts/lib/release-policy.mjs` checks content (gate strings, 30-gate profile, image pins, fixtures by hash). Run `validate:release-policy` + `test:release-policy` after touching scripts, compose files, docs it reads, or fixtures. `UnifiedGuestClient.tsx` keeps the literal `searchParams.delete('claim')` / `('claimToken')` lines the policy checks (R-357).
- After deleting or renaming a route, regenerate the route types (`npx next typegen`, or `npm run build`) before `npm run typecheck`; `tsconfig.json` includes `.next/types` and `.next/dev/types`, which stay stale otherwise.
- Every schema/migration change: `npm run update:prisma-integrity` and `EXPECTED_MIGRATION` in `src/app/api/health/ready/route.ts`.
- Local Docker builds can fail on transient DNS; retry instead of changing the Dockerfile.
- Do not edit `REVIEW.md` findings retroactively; add a `Resolution:` line or a new R-ID (next free: R-627; Review 4 used R-375…R-600, the follow-up recorded R-601…R-626).
