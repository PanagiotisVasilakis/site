# Local release verification

`npm run verify:release` is the repository-owned, mandatory local gate for a
commit that may later be selected for a production release. It is deliberately
human-enforced: it is not continuous integration, a protected pre-merge check,
an independent approval, or an automatic deployment.

Run the canonical command from the repository root:

```bash
npm run verify:release
```

## Prerequisites

- Node `22.19.x` and npm `11.18.x`, as declared by the repository;
- dependencies installed from the committed `package-lock.json`;
- the checksum-locked Gitleaks 8.30.1 binary selected through
  `GITLEAKS_BIN`, as documented in
  [`security/secret-scanning.md`](security/secret-scanning.md);
- a local Docker daemon reachable through a Unix or Windows named-pipe socket,
  plus Docker Buildx;
- enough local disk for the digest-pinned PostgreSQL image, disposable database,
  coverage output, and Next.js build; and
- registry/network availability for read-only OCI registry inspection, an
  immutable pull into the local Docker image store, and the existing production
  dependency audit.

Remote Docker daemons are rejected before image pull or container creation. The
gate never consumes inherited database destinations: ordinary child processes
receive unreachable hostile DB/PG values, the integration suite creates its own
random disposable database, and the build receives a complete synthetic
production environment under `.invalid` origins. The orchestrator copies only a
small allowlist of non-secret host variables and never prints the environment.

The complete warm-cache H0 run measured approximately 2.5 minutes on the
verified workstation. Cold registry access, the intentionally repeated test
coverage, and the production build can extend that substantially; reserve
approximately 5–15 minutes. This is an operational estimate, not a timeout or
performance guarantee.

## Exact gate order

The orchestrator uses argument-vector process spawning with `shell: false`,
stops at the first mandatory failure, returns non-zero, and prints only gate
names and durations in its own sanitized PASS/FAIL summary. Each child gate's
normal output is streamed unchanged under the restricted environment, so it can
be diagnosed without the orchestrator printing environment values.

| # | Gate | Repository command |
| ---: | --- | --- |
| 1 | Tracked source/build-input secret scan | `npm --ignore-scripts run check:secrets:sources` |
| 2 | Secret-scanning positive/negative fixtures | `npm --ignore-scripts run test:secret-scanning` |
| 3 | Local release policy | `npm --ignore-scripts run validate:release-policy` |
| 4 | Release-policy negative/positive fixtures | `npm --ignore-scripts run test:release-policy` |
| 5 | Standalone production credential startup matrix | `npm --ignore-scripts run test:runtime-credentials` |
| 6 | Offline Cloudflare ingress manifest | `npm --ignore-scripts run check:cloudflare-ips` |
| 7 | Disposable Nginx trusted-ingress integration | `npm --ignore-scripts run test:nginx-ingress` |
| 8 | Conflict markers | `npm --ignore-scripts run check:conflicts` |
| 9 | Prisma integrity manifest | `npm --ignore-scripts run check:prisma-integrity` |
| 10 | Prisma integrity policy tests | `npm --ignore-scripts run test:prisma-integrity` |
| 11 | PostgreSQL image-policy tests | `npm --ignore-scripts run test:postgres-image-policy` |
| 12 | Complete default tests | `npm --ignore-scripts run test` |
| 13 | Explicit unit tests | `npm --ignore-scripts run test:unit` |
| 14 | Explicit security tests | `npm --ignore-scripts run test:security` |
| 15 | Coverage thresholds | `npm --ignore-scripts run test:coverage` |
| 16 | TypeScript | `npm --ignore-scripts run typecheck` |
| 17 | Primary lint, zero warnings | `npm --ignore-scripts run lint -- --max-warnings=0` |
| 18 | Security lint | `npm --ignore-scripts run lint:security` |
| 19 | Dead code/dependency surface | `npm --ignore-scripts run check:dead-code` |
| 20 | Dependency licenses | `npm --ignore-scripts run security:license-check` |
| 21 | Prisma schema validation | `npm --ignore-scripts run prisma:validate` |
| 22 | Live PostgreSQL OCI-index/provenance check | `npm --ignore-scripts run check:postgres-image-policy` |
| 23 | Real disposable-PostgreSQL integration suite | `npm --ignore-scripts run test:integration` |
| 24 | Synthetic production/security build | `npm --ignore-scripts run validate:security` |
| 25 | Generated release-artifact secret scan | `npm --ignore-scripts run check:secrets:artifacts` |
| 26 | Final Prisma integrity manifest | `npm --ignore-scripts run check:prisma-integrity` |
| 27 | Final deterministic Prisma hash evidence | `npm --ignore-scripts run hash:prisma-integrity` |
| 28 | Git whitespace/error check | `git diff --check` |
| 29 | Staged and untracked candidate whitespace | `npm --ignore-scripts run check:candidate-diff` |
| 30 | Disposable-container orphan check | `npm --ignore-scripts run check:integration-orphans` |

`proxy-agent@8.0.2` is a dev-only peer-resolution anchor and is intentionally
not imported by application code. Knip ignores exactly that dependency, while
full `npm ls` and explicit dependency-tree evidence remain mandatory; nested
`proxy-agent@6.5.0` remains required for the legacy Puppeteer chain.

`package.json` `overrides` and their reasons:

- `next@16.3.6` → `postcss`, `sharp`: keep Next's nested copies on the patched
  direct versions (`postcss` GHSA-fxqj-rqcc-2cmp, `sharp` GHSA-rgj7-g3m4-5g8c).
  Rename the key whenever `next` is bumped.
- `baseline-browser-mapping`: GHSA-w5vr-8v7q-w6rv (reached through `next`).
- `deepmerge-ts`, `mysql2`, `fast-uri`: `prisma@7.x` pins vulnerable versions
  (GHSA-ggr8-5vv4-36mx, GHSA-3f6p-5ww8-9rcr, GHSA-7p8r-x3mc-p8w7 and related).
  `npm audit --omit=dev` includes them because `prisma` is a peer of
  `@prisma/client`. `@prisma/config` only calls `deepmerge(a, b)`, and `mysql2`
  is used only by Prisma Studio's MySQL adapter. Remove these overrides when
  Prisma ships patched pins.
- `@prisma/dev`, `@sentry/node`: pre-existing pins for the Prisma CLI and the
  Lighthouse chain. Re-check both on the next Prisma or Lighthouse upgrade.

`scripts/lib/generated-artifact-secret-disposition.mjs` supports exactly one
Next version (`SUPPORTED_NEXT_VERSION`). A Next upgrade must update that
constant and the matching fixture in `scripts/tests/secret-scanning.test.mjs`,
after confirming that the build's manifest schema still validates.

The default Vitest suite and the explicit unit/security/coverage invocations
overlap intentionally. The explicit gates preserve the agreed release contract
and coverage thresholds; the default suite also covers component and route
surfaces. No mandatory suite is inferred away merely because another command
currently includes some of its files.

The production/security gate invokes
`npm --ignore-scripts run validate:security`. Its single dependency audit is
`npm audit --audit-level=high --omit=dev --json`: the production-only scope and
High threshold are unchanged. The validator writes the exact JSON stdout and
complete stderr to permission-restricted files in a unique operating-system
temporary directory outside the repository, reports the absolute JSON artifact
path and SHA-256, and fails closed for invalid evidence or process failures.
High or Critical findings remain release-blocking; lower severities are reported
without being filtered or suppressed.

The live image check is placed immediately before integration because it can
perform registry I/O and an immutable image pull. The integration lifecycle
repeats the exact reference, OCI-index, pulled-image, running-container,
loopback, and PostgreSQL-major-version checks before using the database.

## Failure and disposable-container cleanup

Any failed, interrupted, skipped, or bypassed gate means the candidate has not
passed. Correct the cause and rerun the complete canonical command for the same
candidate tree. Results from a prior commit or a partial rerun are not release
evidence.

After an integration attempt, the orchestrator performs the orphan check even
when a later gate fails. To inspect manually:

```bash
npm run check:integration-orphans
docker ps -aq --filter label=com.qr-city-guide.integration.disposable=true
```

If the second command returns IDs, do not delete on that label alone. Inspect
each exact ID and prove the disposable flag plus its run ID, repository ID, and
48-character fingerprint labels; the approved image reference and image ID;
tmpfs-backed PostgreSQL data/tmp/run paths; and a single loopback-only `5432`
mapping. Only after the complete identity matches may those exact IDs be removed
with `docker rm -f -- <id...>`. Then rerun
`npm run check:integration-orphans`. Never use broad `docker system prune`, name
globs, or unrelated container deletion as release cleanup.

Raw Docker, registry, migration, and environment diagnostics are deliberately
withheld where they could contain credentials. Investigate locally without
copying secret-bearing output into commits or release records.

## Canonical Prisma integrity baseline

The baseline is the committed `prisma/integrity-manifest.json`; print the
current values with `npm run hash:prisma-integrity` and compare them with
`npm run check:prisma-integrity`.

The checker hashes the repository schema and deterministic migration tree. It
does not inspect a live `_prisma_migrations` table, detect live schema drift, or
prove that a production database can be migrated safely. A separately
authorized migration change must update the integrity manifest in the same
reviewed change; H0 does not authorize one.

## Controlled PostgreSQL digest update

The current approved reference is:

```text
postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777
```

A digest change is a separate, small supply-chain review:

1. Inspect the official Docker Library tag with
   `docker buildx imagetools inspect postgres:16-alpine` and again with `--raw`.
2. Select the top-level multi-platform OCI-index digest, never an
   architecture-specific child or third-party mirror.
3. Verify the raw index contains official `linux/amd64` and `linux/arm64/v8`
   PostgreSQL 16 Alpine descriptors.
4. Update the constants in
   `tests/integration/support/postgres-image-policy.ts`, both Docker Compose
   files, `scripts/lib/release-gates.mjs`, the independent expectation in
   `scripts/lib/release-policy.mjs`, affected fixtures, and this documentation
   in one reviewed diff.
5. Run both image-policy commands, the full integration suite on supported host
   architectures, and `npm run verify:release` before accepting the update.

Never accept a digest from a blog, mutable provider build, or unauthenticated
copy-and-paste without verifying the registry bytes and provenance.

## Restricted policy boundary

`npm run validate:release-policy` is a static, repository-specific checker. It
rejects any active `.github/workflows/**` file; `pull_request_target`; known
Vercel, Wrangler/Pages, OpenNext, and GitHub Pages artifacts; direct retired
platform dependencies and deployment scripts; an altered gate profile;
deployment, push, publication, or persistent migration inside the local gate;
tag-only PostgreSQL references; production-default database mutation; and
commands that combine staging and production database credentials.

It intentionally scans active package/scripts/configuration surfaces and known
deployment artifact locations, not natural-language historical reports or this
manual cleanup runbook. It is not a general shell, YAML, Docker, or data-flow
parser. A reviewed change could alter both policy and tests, so code review and
operator discipline remain necessary.

Every internal npm gate uses `--ignore-scripts`, and the policy rejects `pre*`
and `post*` hooks for the canonical command and mandatory gate scripts. The
outer `npm run verify:release` invocation is still rooted in the reviewed
`package.json`; like any repository-owned executable, a malicious unreviewed
change to that entry point is outside the command's self-trust boundary.

## What the command does not prove or perform

The command does not:

- deploy, publish, push Git, push an image, contact a deployment API, or trigger
  an automatic environment change;
- run `prisma migrate deploy`, select a persistent database, or mutate staging
  or production;
- prove live database drift, backup creation/restoration, reverse-proxy or
  Cloudflare behavior, Netcup firewall state, worker scheduling, load capacity,
  immutable production-image identity, rollback, RPO, or RTO; or
- make the selected architecture production-ready by itself.

The accepted target and its current blockers are recorded in
[`architecture/deployment-target.md`](architecture/deployment-target.md).
External retirement remains a separately authorized procedure in
[`deployment/external-platform-cleanup.md`](deployment/external-platform-cleanup.md).
