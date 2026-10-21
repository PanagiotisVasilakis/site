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
  [`security/secret-scanning.md`](security/secret-scanning.md). The lock lists
  the `darwin-arm64` (Apple-silicon macOS) artifact only, so another platform
  needs a reviewed lock addition first;
- a local Docker daemon reachable through a Unix or Windows named-pipe socket,
  plus Docker Buildx. The release images (outside `verify:release`) are
  `linux/amd64`, the production platform, although the release host is an
  Apple-silicon Mac: `npm run docker:build` builds that platform by default and
  fails when a tag reports another one, so the build and the production-image
  smoke run under emulation and are much slower than a native run (see
  [Release images: platform and identity](#release-images-platform-and-identity));
- enough local disk for the digest-pinned PostgreSQL image, disposable database,
  coverage output, and Next.js build;
- the digest-pinned Nginx image from `deploy/nginx/image.lock.json`
  (`repository@digest`) already present in the local Docker image store. Gate 7
  does not pull it and fails with the exact `docker pull` command when it is
  missing; and
- registry/network availability for read-only OCI registry inspection, an
  immutable pull into the local Docker image store, and the existing production
  dependency audit.

Remote Docker daemons are rejected before image pull or container creation. The
gate never consumes inherited database destinations: ordinary child processes
receive unreachable hostile DB/PG values, the integration suite creates its own
random disposable database, and the build receives a complete synthetic
production environment under `.invalid` origins. The orchestrator copies only a
small allowlist of non-secret host variables and never prints the environment.

A warm-cache run takes approximately 2.5 minutes on the reference
workstation. Cold registry access, the intentionally repeated test
coverage, and the production build can extend that substantially; reserve
approximately 5–15 minutes. This is an operational estimate, not a timeout or
performance guarantee.

Gate 24 runs `npm run build` (`next build`) in the working tree and reuses
`.next/cache`. When a change adds a new CSS `@import` to
`src/app/globals.css`, delete `.next/cache/turbopack` before
`npm run verify:release`: a stale Turbopack cache can drop the new sheet.
Docker builds start clean (`.next` is in `.dockerignore`).

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

`package.json` `overrides` and their reasons:

- No `next`-scoped override. `next@16.3.8` pins `postcss` 8.5.23 exactly (a
  nested copy; GHSA-fxqj-rqcc-2cmp affects `<= 8.5.22`) and `sharp` `^0.35.4`
  (dedupes to the root 0.35.5; GHSA-wq5f-xc86-pv6w is fixed in 0.35.5). A
  version-keyed override would only dedupe `postcss` and would silently stop
  applying on the next `next` bump. Whenever `next` is bumped, re-check with
  `npm ls postcss sharp` and `npm audit --omit=dev` (must report 0).
- `baseline-browser-mapping`: GHSA-w5vr-8v7q-w6rv (reached through `next`).
- `deepmerge-ts`, `mysql2`: `prisma@7.10.0` pins vulnerable versions exactly
  (`@prisma/config` → `deepmerge-ts` 7.1.5, `prisma` → `mysql2` 3.15.3;
  GHSA-ggr8-5vv4-36mx, GHSA-3f6p-5ww8-9rcr and related). `fast-uri`
  (GHSA-7p8r-x3mc-p8w7 and related) arrives through `@prisma/dev` →
  `@prisma/streams-local` → `ajv` with the caret range `^3.0.1`; the override
  keeps it at a patched version. `npm audit --omit=dev` includes them because
  `prisma` is a peer of `@prisma/client`. `@prisma/config` only calls
  `deepmerge(a, b)`, and `mysql2` is used only by Prisma Studio's MySQL adapter.
  Remove these overrides when Prisma ships patched pins (re-check with
  `npm ls deepmerge-ts mysql2 fast-uri`).
- The former `@prisma/dev` pin was removed with the Prisma 7.10.0 upgrade,
  which requires `@prisma/dev` 0.24.17 itself.

`scripts/lib/generated-artifact-secret-disposition.mjs` supports exactly one
Next version (`SUPPORTED_NEXT_VERSION`). A Next upgrade must update that
constant (the test fixture follows it) after confirming that the build's
manifest schema still validates.

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
prove that a production database can be migrated safely. A migration change
must regenerate the manifest (`npm run update:prisma-integrity`) in the same
reviewed change.

## Controlled PostgreSQL digest update

The current approved reference is:

```text
postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
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

## Controlled Node base-image digest update

All four stages of `docker/Dockerfile.security` (`builder`, `workers`,
`migrate`, `runner`) use one Node base image. The current approved reference is
Node 22.23.3 on Alpine 3.24:

```text
node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
```

Review it on each Node 22.x security release. A digest change is a separate,
small supply-chain review:

1. Inspect the official Docker Library tags `node:22-alpine` and the exact
   release tag (for example `node:22.23.3-alpine`) with
   `docker buildx imagetools inspect`, and again with `--raw`.
2. Select the top-level multi-platform OCI-index digest, never an
   architecture-specific child or third-party mirror. Both tags must resolve to
   it, and the SHA-256 of the `--raw` bytes must equal it.
3. Verify the raw index contains official `linux/amd64` and `linux/arm64/v8`
   descriptors, and that `NODE_VERSION` in each platform's image config
   (`--format '{{json .Image}}'`) is the intended release.
4. Replace every occurrence of the old digest (the four `FROM` lines and this
   documentation) in one reviewed diff, keeping the `node:22-alpine@sha256:`
   form, and confirm that a repository search finds no old digest left
   outside the `REVIEW.md` and `PROGRESS.md` journals.
5. Run `npm run verify:release`, then the release image sequence in
   [`scripts/README.md`](../scripts/README.md#production): `npm run docker:build`
   with `NEXT_PUBLIC_SITE_URL=https://localhost:3002` and
   `DOCKER_DEFAULT_PLATFORM=linux/amd64 npm run smoke:image`;
   then `npm run docker:build` with the production `NEXT_PUBLIC_SITE_URL` and
   `npm run docker:scan` on that last build. Accept the update only after all of
   them pass. The build fails closed if the pinned `dumb-init` apk version no
   longer resolves on the new Alpine base.

## Controlled Nginx digest update

The Nginx reference is the `repository@digest` in `deploy/nginx/image.lock.json`,
and gate 7 (`npm run test:nginx-ingress`) builds its image reference from that
file. The release policy requires the lock's `repository@digest` to equal the
independent constant `EXPECTED_NGINX_IMAGE` in `scripts/lib/release-policy.mjs`,
and its `mediaType` to be the OCI image index. The fixtures in
`scripts/tests/release-policy.test.mjs` write `repository`, `digest` and
`mediaType` the same way. A digest change is a separate, small supply-chain
review, and it changes the lock (its `tag` and `verifiedAt` fields included),
`EXPECTED_NGINX_IMAGE` and those fixtures in one reviewed diff, together with the
runbook text "currently `nginx:<tag>`" in
`docs/deployment/origin-ingress-runbook.md`:

1. Inspect the official `nginx` tag with `docker buildx imagetools inspect` and
   again with `--raw`; the SHA-256 of the raw bytes must equal the digest.
2. Select the top-level multi-platform OCI-index digest, never an
   architecture-specific child or a third-party mirror.
3. Pull that exact `repository@digest` into the local Docker image store (gate 7
   does not pull it), then run `npm run validate:release-policy`,
   `npm run test:release-policy` and `npm run verify:release` before accepting the
   update.

## Release images: platform and identity

None of this is part of `verify:release`; the commands are in
[`scripts/README.md`](../scripts/README.md#production).

- **Platform.** The ADR fixes the production platform at `linux/amd64`
  ([`architecture/deployment-target.md`](architecture/deployment-target.md)), while
  the release host (the Gitleaks lock holds `darwin-arm64` only) is `arm64`. A
  native build would ship arm64 images that fail on the VPS with `exec format
  error` at the first `migrate`. `npm run docker:build` therefore passes
  `--platform linux/amd64` unless `DOCKER_BUILD_PLATFORM` overrides it, prints the
  platform and the image ID of each tag, and exits 1 when `docker image inspect
  --format '{{.Os}}/{{.Architecture}}'` of the web, `-workers` or `-migrate` tag
  differs from the requested platform. It also rejects a `NEXT_PUBLIC_SITE_URL`
  that is not a bare https origin. An override other than `linux/amd64` prints a
  warning; such images are never scanned, saved or shipped.
- **Smoke.** `DOCKER_DEFAULT_PLATFORM=linux/amd64 npm run smoke:image` runs the
  amd64 images (emulated on Apple silicon, so slow). The accepted result is one
  complete run without a `FAIL`; a timeout `FAIL` is re-run once, and the same check
  timing out again, or any other `FAIL`, is investigated as a defect (never repeat
  the run until it goes green).
- **Identity on the VPS.** After `docker load`,
  `docker image inspect --format '{{.Architecture}} {{.Id}}'` of the three tags must
  read `amd64` and the IDs that `docker:build` printed for the scanned images;
  otherwise the deployment stops.
- **Image optimizer (R-753).** The smoke never checks the response of
  `/_next/image`. After `up -d --wait web`, a request for
  `/_next/image?url=%2Fhouse%2Fbalcony%2Fbalcony_2.jpeg&w=640&q=75` with
  `Accept: image/webp` (no identity header: the proxy does not run for `/_next/*`)
  must answer `content-type: image/webp`; `image/jpeg` is the silent fallback of a
  sharp or libvips that cannot load, and the release is not ready.
- **Timers.** `docker/.env` is the single source of the `APP_IMAGE` that the
  operator and the cron-run workers read; after each release the create events of
  the next `outbox` and `operations` runs must name the new `-workers` tag.

## Container image vulnerability scan

`npm run docker:scan` scans the three images of one build (web, `-workers`,
`-migrate`) with `scripts/docker-scan.sh`. It is not part of
`verify:release`; run it after `npm run docker:build`. Every scanner fails on a
HIGH or CRITICAL vulnerability, and the script exits 127 instead of passing
when no scanner is available. `DOCKER_SCAN_SCANNER` selects the scanner:

| Value | Scanner |
| --- | --- |
| `auto` (default) | the pinned Trivy container if a Docker engine is reachable, else a host `trivy` binary if installed, else Docker Scout |
| `trivy` | the host `trivy` binary |
| `trivy-container` | the pinned Trivy container (below) |
| `scout` | the Docker Scout CLI plugin |

Docker Scout comes last because it sends the image SBOM to Docker's service.

**Trivy container mode.** Nothing is installed on the host. The script writes
the image with `docker save` to `image.tar` in a private directory created by
`mktemp -d` under `$TMPDIR` (default `/tmp`; it needs free disk space for one
image and is removed on exit), then runs the official Trivy image pinned by
digest:

```text
aquasec/trivy:0.69.3@sha256:bcc376de8d77cfe086a917230e818dc9f8528e3c852f7b1aff648949b6258d1c
```

The container runs with `--read-only` (plus a `noexec` tmpfs on `/tmp`),
`--cap-drop ALL` and `--security-opt no-new-privileges`. It receives only the
tarball, mounted read-only (`:ro`), and its database cache. It never receives
the Docker socket, so it cannot reach the Docker engine or other images. The
cache is the named Docker volume `qr-city-guide-trivy-cache` rather than a host
directory, so no root-owned files appear in the operator's home on a Linux host
and removal is one command (`docker volume rm qr-city-guide-trivy-cache`).
`docker save` writes the tarball with mode `0600`, and the container's root has
no `CAP_DAC_OVERRIDE`, so the script makes the tarball world-readable inside its
private `0700` directory.

Only downloads leave the machine. Trivy fetches its vulnerability database
(and, when it scans Java archives, its Java database) from
`ghcr.io/aquasecurity`, pinned instead of the default `mirror.gcr.io` first
choice, and matches the image locally. `--skip-version-check` and
`--disable-telemetry` together suppress Trivy's update check and usage ping
(Trivy 0.69.3 skips the request only when both are set), and `--offline-scan`
stops dependency lookups against external APIs. Nothing about the image is
uploaded.

**Why 0.69.3.** The Trivy releases 0.69.4 to 0.69.6 and their images (and
`latest` during that window) were compromised from 2026-03-19 (the TeamPCP
supply-chain attack, advisory GHSA-69fq-xp46-6x23, which names 0.69.2 and
0.69.3 as safe). Never use a tag without the digest. The pinned image was
created on 2026-03-03, before the compromise, and its multi-platform index has
the same digest on Docker Hub (`aquasec/trivy`) and GHCR
(`ghcr.io/aquasecurity/trivy`). Change the pin like the other base images:
inspect both registries with `docker buildx imagetools inspect` and `--raw`,
check that the SHA-256 of the raw bytes equals the digest on both, check the
release against Aqua's advisories, and update the script, the pinned value in
`tests/unit/docker-scan-script.test.ts` and the reference and version wording
in this section in one reviewed diff.

**Coverage limits.** Trivy reports the Alpine `apk` packages and the
`package.json` files under `node_modules`. The `-workers` image has no
`node_modules`: `scripts/build-workers.mjs` bundles its dependencies (including
`pg` and the Prisma runtime) into two `.mjs` files, so Trivy checks only its
`apk` packages there, and the bundled npm code is covered by the root
`npm audit --omit=dev` in `validate:security`. The Node runtime that the official
base image installs outside `apk` is not in its report, so Node security
releases are tracked through the base-image update above. Trivy 0.69.3 has no
end-of-life entry for Alpine 3.24 and logs `This OS version is not on the EOL
list`; the vulnerability data itself comes from the downloaded database.

## Restricted policy boundary

`npm run validate:release-policy` is a static, repository-specific checker. It
checks these families and reports each failure by name:

- **Gate profile and deny-list:** the exact ordered gate profile. A gate command
  that deploys, pushes, publishes or runs a persistent migration (Vercel,
  Wrangler and Pages, Cloudflare Pages, GitHub Pages, git push, Docker registry,
  Docker Compose and Buildx push, package publication, `prisma migrate`,
  `migrate deploy`, `system:migrate`, `db:migrate`) is named before the profile
  comparison.
- **Packages and scripts:** the exact script profile; retired or unsafe scripts;
  no npm `pre*` or `post*` lifecycle hook on the local release path; no automatic
  deployment-oriented script; forbidden commands in package scripts; database
  mutation that does not select production by default; no script that consumes
  staging and production database credentials together; no retired deployment
  dependency or alias.
- **Active surfaces:** no active `.github/workflows/**` file and no
  `pull_request_target`; no known Vercel, Wrangler/Pages, OpenNext or GitHub Pages
  artifact and no other retired deployment artifact; no forbidden command pattern,
  and no combined staging and production database credentials, in `scripts/`,
  `deploy/`, `docker/`, `Dockerfile` and `docker-compose.yml`.
- **PostgreSQL:** `docker-compose.yml` and `docker/docker-compose.prod.yml` must
  name exactly the approved digest-pinned image (tag-only references are
  rejected); the integration constants keep the approved tag and digest; the
  hostile integration and synthetic production environments are the exact
  reviewed values; `scripts/system-orchestrator.sh` is development-only.
- **Trusted ingress:** the production Nginx markers (Cloudflare real IP and
  origin pull, private identity headers overwritten, `server_tokens off`, loopback
  upstream); no wildcard trusted proxy and no `$proxy_add_x_forwarded_for`; the
  Cloudflare CIDR manifest and generated includes; the Nginx image lock against
  `EXPECTED_NGINX_IMAGE` (OCI index media type); the origin-proxy shared secret in
  the start-up schema; the application identity code (constant-time attestation
  check, no public forwarding header as a candidate); the phrases of
  `docs/deployment/origin-ingress-runbook.md`; no certificate or key file
  (extensions key, pem, p12, pfx, crt) under `deploy/nginx`.
- **Production Compose ports and mode:** every `ports:` entry of
  `docker/docker-compose.prod.yml`, including flow-style and alias values, must be
  a loopback short-syntax mapping (`127.0.0.1:` or `[::1]:`); `network_mode: host`
  is forbidden; the `web`, `outbox` and `operations` services must each set
  `NODE_ENV: production` in their own `environment:` block.
- **Layered rate limiting:** the Nginx `auth_operations`, `public_writes` and
  `broad_api` zones with dry-run and 429 status settings; readiness depends on the
  PostgreSQL/schema check and on no external rate-limiting service; the PostgreSQL
  limiter is atomic and fails closed with a generic 503; expired-row cleanup; the
  nine phrases of `docs/security/layered-rate-limiting.md`; no external limiter
  configuration.
- **Secret scanning:** the Gitleaks lock equals the reviewed 8.30.1 artifact
  (`darwin-arm64` only); the gate's restricted markers; the scanner configuration
  (maintained defaults plus database-URL and private-key rules, no added allowlist,
  no disabled rule, no global `.gitleaksignore`); exactly six IR-01 baseline
  fingerprints; the value-exact fixture allowlist; Docker inputs that exclude
  `.env` files and PEM keys; `docs/security/secret-scanning.md` must exist.
- **Claim-token transport:** claim capabilities are not created or consumed through
  URLs; claim consumption uses and clears only the server-controlled exchange
  cookie; `Referrer-Policy: no-referrer` on the guest claim UI; the Nginx
  configuration uses `$uri` and no `$request_uri`, and the `origin_safe` log format
  is defined, used by the access log and free of forbidden variables; `no-store`
  and `no-referrer` on admin claim issuance; `docs/security/claim-token-transport.md`.
- **Runtime credentials:** the centralized credential readers for admin JWT, guest
  JWT and admin login; no fixed development guest credential; no `NEXT_PUBLIC_*`
  secret, token or key reference in the admin, guest and admin-login sources; the
  retired names `JWT_SECRET`, `SESSION_SECRET`, `SECURITY_ENC_KEY_HEX` and
  `SECURITY_ENC_KEY_HEX_PREVIOUS` are forbidden in the active configuration files
  (among them `.env.example`, `scripts/README.md` and `SECURITY.md`);
  `docs/security/runtime-credential-contract.md`.
- **Verify implementation:** `scripts/verify-release.mjs` keeps its restricted
  markers, spawns processes with argument vectors (no exec APIs) and contains no
  deployment or migration command.
- **Dockerfile:** every external `FROM` instruction of `docker/Dockerfile.security`
  is `node:<major>-alpine@sha256:<64 hex>`, with an optional `AS` name, and all
  stages share one digest (the Node digest); the `runner` stage has exactly one
  `USER 1001:1001`, no `ADD`, and a `RUN` that removes `npm` and `npx`.

The checks read these surfaces with text patterns and fixed markers. They do not
model the files copied into the images, their imports, or the instructions of the
`workers` and `migrate` stages beyond their `FROM` lines. That the three images
start with everything they import is proven at run time
by `npm run smoke:image`, a mandatory release step outside `verify:release`
because it needs the locally built images (see the release sequence in
[`scripts/README.md`](../scripts/README.md#production)).

It intentionally scans active package, script, configuration and deployment
surfaces and known deployment artifact locations. Natural-language documentation
is not scanned in general; the documents named above are read only for their
fixed phrases or required existence, and `SECURITY.md` and `scripts/README.md`
are read for retired credential names. It is not a general shell, YAML, Docker,
or data-flow parser. Calls built as an argument vector (for example
`spawn('docker', ['push', image])`) are not visible to these text patterns, so a
reviewer must read them directly. A reviewed change could alter both policy and
tests, so code review and operator discipline remain necessary.

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
