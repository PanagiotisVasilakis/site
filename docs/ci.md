# Continuous integration baseline

Last verified: 2026-07-16.

## CI workflow and mandatory job graph

`.github/workflows/ci.yml` runs for every pull request and every push to `main` on GitHub-hosted `ubuntu-24.04` runners. Newer runs for the same pull request or branch cancel older runs; unrelated branches use different concurrency keys. The workflow has `contents: read` by default, checkout does not persist credentials, and the aggregate job explicitly has no token permissions.

The stable check names and ownership are:

| Check | Mandatory work | Timeout | Primary owner on failure |
| --- | --- | ---: | --- |
| `CI / policy` | lockfile install, conflict-marker check, workflow policy, static Prisma manifest, PostgreSQL image policy | 10 min | repository/CI policy owner |
| `CI / quality` | default, unit, security and coverage tests; typecheck; zero-warning lint; security lint; dead-code; dependency licenses; Prisma validation and hashes | 20 min | author of the affected code or test |
| `CI / integration-postgres` | hostile inherited environment plus the disposable real-PostgreSQL integration suite and orphan check | 20 min | database/auth integration owner |
| `CI / production-build` | full synthetic production environment, runtime-schema validation, `validate:security` and production build | 20 min | build/security owner |
| `CI / required` | aggregate result only; every mandatory dependency must be `success` | 5 min | inspect the failed dependency |

`CI / required` uses `if: always()` and fails for a failed, cancelled, or skipped dependency. It performs no checkout and receives no secrets. There are no path filters, deployment steps, persistent migrations, production environments, or self-hosted runners in this baseline.

The workflow installs Node from `.nvmrc`, installs the repository's exact npm `11.18.0`, and then uses `npm ci`. The policy job deliberately uses `--ignore-scripts`; normal quality, integration, and build jobs run the existing lockfile-controlled lifecycle.

Local equivalents are the commands named in the workflow. The CI-specific set is:

```bash
npm run test:ci-policy
npm run check:ci-policy
npm run test:prisma-integrity
npm run check:prisma-integrity
npm run test:postgres-image-policy
npm run check:postgres-image-policy
npm run check:integration-orphans
```

The current local suites complete in seconds, the real PostgreSQL suite normally completes in roughly one to two minutes after the image is available, and the production build normally completes in under a minute on the verified workstation. CI timeouts include cold dependency/image download margin while remaining bounded.

To retry, first reproduce the failed command locally. On GitHub, use **Re-run failed jobs** for the same commit; do not make an empty commit merely to retrigger CI. Registry or GitHub service failures should be identified separately from repository failures.

## Workflow supply-chain policy

Only these verified official Action commits are allowed:

- `actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` (`v7.0.0`)
- `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` (`v7.0.0`)

The full SHAs were checked against the corresponding tags in the official `actions/*` repositories. Tags remain human-readable comments only; executable references use the immutable commits.

`scripts/validate-ci-policy.mjs` is a deliberately restricted, repository-owned YAML profile, not a general YAML parser. It accepts only the current workflow, jobs, commands, Action allowlist, permissions, runner, timeouts, synthetic environments, digest pin, and aggregate dependency graph. Unsupported YAML features fail closed. It also rejects `pull_request_target`, secrets, write permissions, self-hosted runners, mutable PostgreSQL references, disabled integration coverage, and all migration/deployment execution.

This validator is a drift guard, not an independent trust root: a reviewed change could alter both policy and tests. Required branch protection and code review remain necessary.

## Disposable PostgreSQL image

The integration runtime uses both a readable tag and an immutable OCI-index digest:

```text
postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777
```

The tag communicates the intended PostgreSQL line; Docker resolves the immutable digest. At verification time the digest was the official multi-platform OCI index for PostgreSQL 16.14 on Alpine 3.24 and contained both `linux/amd64` and `linux/arm64/v8` manifests.

The policy CLI hashes the exact raw index bytes, verifies OCI index media type, required platforms, and official Docker Library provenance, pulls the exact reference, and checks the canonical local `RepoDigests`, Linux architecture, and image ID. The integration lifecycle repeats those checks before launch. The existing database guard then verifies the running container's exact configured reference and image ID, labels, tmpfs storage, loopback port, health, and live PostgreSQL major version 16. Diagnostics with raw Docker output are withheld.

For a controlled update:

1. Inspect the official tag with `docker buildx imagetools inspect postgres:16-alpine` and `--raw`.
2. Select the top-level OCI-index digest, not an architecture-specific child; verify `linux/amd64` and `linux/arm64/v8`.
3. Update the approved constants, workflow allowlist, tests, and documentation in one small reviewed diff.
4. Run the image-policy checks and the complete integration suite on the supported host architectures.
5. Merge only after every mandatory check passes.

Digest updates are never accepted from a blog or mirror and must not be automated without the reviewed diff and passing integration evidence.

## Static Prisma history baseline

`prisma/integrity-manifest.json` records the manifest format, generator/checker versions, raw schema hash and byte count, deterministic migration-tree hash, exact byte-sorted relative file list, per-file hashes/byte counts, and total file count. `npm run check:prisma-integrity` is read-only and fails for malformed/noncanonical manifests, schema mismatch, changed/missing/unexpected migrations, invalid hashes/counts, unsorted/duplicate/ambiguous paths, symbolic links, or special files.

For a separately authorized new migration, run `npm run update:prisma-integrity` and review both the migration and manifest diff. The manifest proves only the repository bytes and committed history. It does not inspect `_prisma_migrations`, applied production checksums, live schema, compatibility, or staging/production drift; `HIGH-MIG-02` and `REM-07` therefore remain open for PR-09.

## Build-before-migrate policy

PR-03 contains no deployment or persistent migration job. The current validator rejects every such command, so migration cannot precede build in this baseline. PR-08 must explicitly extend the versioned policy before adding a protected migration path. That future path must be non-PR, depend on successful quality, integration and production build, bind an immutable commit/artifact identity, use only one protected environment credential scope, and never combine staging and production credentials.

## GitHub settings checklist

Workflow YAML does not configure branch protection. An administrator must verify these settings for `main`:

- require a pull request before merge;
- require `CI / required` from the expected GitHub Actions App/source;
- optionally require the branch to be up to date when strict mode is desired;
- require conversation resolution;
- disallow bypassing the rule;
- restrict direct pushes;
- block force pushes and branch deletion.

Do not report these controls as active until GitHub settings or API evidence confirms them.

Staging/production environments, required reviewers, approval separation, environment-scoped secrets, OIDC/cloud trust, deployment concurrency, and artifact promotion belong to later protected deployment work. They are not created or proven by PR-03.
