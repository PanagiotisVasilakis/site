# Progress

## Goal
Review 3 remediation plus the approved product changes (plan approved 2026-09-28; full plan `~/.claude/plans/snappy-swinging-moth.md`, outside the repo): security updates, availability & prices page instead of the booking form, OSRM removal, new visual identity and design system, content, legal pages; last, the legal identity data. One concern per task; per-task patches in `.runtime/review-patches/`; nothing committed by the agent.

## Current state (2026-10-06)
- Every planned task is done except the two the owner deferred (R3-L6/L7, R3-L1). R3-A7 is code-done; its linux/amd64 integration gate waits for the production host. A read-only audit (2026-10-06) checked findings R-165…R-372 against PROGRESS, the plan and the current code: all DONE, MOOT or DECLINED, except R-182 (amd64 gate) and R-370 (watch item, no upstream fix). R-315 was fixed by R3-Z1; R-325/R-326 are kept by the V8/C2 decision (Resolution lines added). R-354…R-356 do not exist (the dead-code sweep ends at R-353).
- The tree is `main` @ `fff4283` + all Review 3 work, uncommitted. 107 per-task patches in `.runtime/review-patches/R3-*.patch` (gitignored, local). The owner reviews and commits.
- This file was condensed on 2026-10-06. The full task-by-task log (gates per task, lane and merge notes, Reviews 1–2 questions O1–O21) is in `.runtime/archive/PROGRESS-full-2026-10-06.md` (local, gitignored). Reviews 1–2 history is also in git (`bd50a80`, `e19facc`, `fff4283`).

## Release baseline (2026-10-06, final run after R3-Z, Node 22.19.0 / npm 11.18.0, Docker 29.8.1)
- `verify:release` 30/30 PASSED (182.6 s). Default suite 151 files / 1790 tests; integration 22 files / 121 tests; coverage 92.52/86.02/94.44/93.66 (thresholds 88/82/91/89); typecheck, lint (0 warnings), lint:security, knip, licenses, Prisma integrity (24 migrations), secret scans, release policy 63/63.
- `docker:build` (NEXT_PUBLIC_SITE_URL=https://localhost:3002): runner `sha256:78327af7…`, workers `sha256:9fe3ca01…`, migrate `sha256:2bdc06a3…` (tag `villa-app:fff428332ef4-dirty`; never deploy a `-dirty` tag). `smoke:image` 23/23.
- `npm audit --omit=dev`: 0. Full `npm audit`: 5 high, all the dev-only braces chain (R-370, no fixed release yet).
- Advisory audits (local production build, non-local requests blocked): axe 22 routes en/el, 0 violations; responsive-ux 81 cells: 36 pass, 45 minor (touch targets below the 44×44 AAA guidance on chips/segmented buttons/link arrows, where AA is 24×24; possible text clipping on the kinetic hero text), 0 major/critical; vitals (CPU ×4, slow 4G): LCP 724–960 ms, CLS 0, TBT ≤ 40 ms, INP proxy ≤ 40 ms.
- Reference: Review 3 start (2026-09-28) was 86 files / 600 tests, integration 16 / 84.

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
- Do not edit `REVIEW.md` findings retroactively; add a `Resolution:` line or a new R-ID (next free: R-375).
