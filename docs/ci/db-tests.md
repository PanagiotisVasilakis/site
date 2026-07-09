# CI database testing checklist

This guide documents how our continuous integration jobs provision PostgreSQL, configure the `TEST_DATABASE_URL` Prisma relies on, run migrations, and execute the Vitest suite that verifies database-backed features. The intent is to make the workflow reproducible whether your pipeline uses ephemeral Docker services or a long-lived managed instance.

## Zero-to-green checklist

1. Provision or connect to a PostgreSQL instance that is dedicated to CI (see options below).
2. Export `TEST_DATABASE_URL` so Prisma, migration tooling, and Vitest all point to the same database.
3. Execute `npx prisma migrate deploy` **against the test URL** to bring the schema up to date.
4. Run `npm run ci:test:db` and fail the pipeline immediately if the command exits non-zero.

The remaining sections expand on each step with provider-specific commands and troubleshooting tips.

## Orchestrator check mode in CI

The repository CI pipeline includes an orchestrator check-mode sequence that validates startup prerequisites without launching a long-running server process:

```bash
npm run ci:orchestrator-check
```

This command executes:

1. system-orchestrator check (env + DB contract)
2. system-orchestrator migrate (Prisma readiness)
3. system-orchestrator build (production build path)

Additional behavior for reliability:

- If local runtime is below required Node/npm versions, it bootstraps a portable Node runtime under `.runtime/tools`.
- If `DATABASE_URL` is unreachable, it provisions a temporary local PostgreSQL container and tears it down automatically after the run.

Use this command in pipeline jobs where you want deployment-grade validation in a non-daemon CI context.

## 1. Provisioning PostgreSQL for CI

We support two provisioning models. Pick the option that matches your provider and cost envelope.

### Option A: Ephemeral container (recommended for per-run isolation)

Use the repository's `docker/docker-compose.test-db.yml` to start a disposable PostgreSQL 16 service. CI systems with Docker support (GitHub Actions, Buildkite with Docker plugin, etc.) can launch it directly:

```bash
docker compose -f docker/docker-compose.test-db.yml up -d postgres-test
```

Key details from the compose file:

- Service name: `postgres-test` (container name `site-test-db`)
- Credentials: `testuser` / `testpass`
- Database: `site_test`
- Host port: `5433`

When the service is started inside CI the hostname that Prisma should reach is the Docker service name (`postgres-test`). A typical connection URL therefore looks like:

```bash
export TEST_DATABASE_URL="postgresql://testuser:testpass@postgres-test:5432/site_test?schema=public"
```

> **Tip:** Add a health-check step (`docker compose ps --status=running`) so jobs only proceed once the database is accepting connections.

### Option B: Managed Postgres (Neon, RDS, Cloud SQL, …)

If Docker is unavailable or you prefer managed infrastructure, create a dedicated test branch/instance using the process in [`docs/NEON_MANAGED_DB.md`](../NEON_MANAGED_DB.md). Recommended minimums:

- Provision a **non-production** database/user pair scoped to CI only.
- Enforce automated cleanup of transient data (nightly truncation or reset scripts).
- Enable TLS and IP allow-listing to limit who can reach the database.

After provisioning, construct `TEST_DATABASE_URL` with the managed endpoint and CI credentials:

```bash
export TEST_DATABASE_URL="postgresql://ci_tester:${CI_PG_PASSWORD}@${NEON_HOST}/${CI_DB_NAME}?sslmode=require"
```

Rotate the password on a regular cadence and update the secret in your CI system accordingly.

## 2. Configuring `TEST_DATABASE_URL`

Prisma reads `TEST_DATABASE_URL` when Vitest executes database-backed specs. Each CI job **must** export the variable before running migrations or tests:

```bash
echo "TEST_DATABASE_URL=$TEST_DATABASE_URL" >> "$GITHUB_ENV"   # GitHub Actions example
export TEST_DATABASE_URL=...                                     # Shell-based runners
```

Guidelines:

1. Do **not** overload `DATABASE_URL`. Keep it pointing to development/staging so application scripts remain safe.
2. Always include `?schema=public` (or the schema you expect) to avoid Prisma creating a new schema implicitly.
3. When the pipeline runs inside Docker, use the service hostname (`postgres-test`) rather than `localhost`.

## 3. Apply Prisma migrations in CI

The pipeline must apply migrations to the CI database before Vitest executes. Invoke Prisma with the test URL explicitly so there is no risk of mutating production data:

```bash
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
```

`prisma migrate deploy` exits non-zero if migrations fail (conflicts, missing privileges, etc.). Allow the job to fail fast—do **not** mask the exit code.

## 4. Run the Vitest database suite (`npm run ci:test:db`)

The repository exposes a dedicated script for database-backed tests:

```json
"ci:test:db": "NODE_ENV=test vitest run --reporter=default"
```

Run it immediately after migrations:

```bash
NODE_ENV=test TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run ci:test:db
```

### Expected output

**Successful run**

```
> npm run ci:test:db
>
> vitest run --reporter=default
✓ bookingLookup › returns existing booking when lookup id matches (2.13s)
✓ bookingLookup › creates placeholder booking when none exists (3.02s)

Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  5.19s
```

**Failure example (blocks the build)**

```
> npm run ci:test:db
>
> vitest run --reporter=default
× bookingLookup › returns existing booking when lookup id matches (0.43s)
  → P3018 The record searched for in the where condition (`id`) does not exist.

Test Files  1 failed (1)
      Tests  1 failed | 1 skipped
   Duration  1.01s
Error: Command failed with exit code 1.
```

Vitest propagates a non-zero exit status when any assertion fails. CI workflows **must treat this as a hard failure**—do not use `continue-on-error` or conditional success wrappers.

## 5. Secrets management in CI

Secure handling of database credentials is mandatory. Follow these practices per provider.

### GitHub Actions

1. Store `TEST_DATABASE_URL` (and, if needed, the raw password) as encrypted repository or environment secrets (`Settings → Secrets and variables`).
2. Inject it in the workflow YAML using the `env` block:

   ```yaml
   jobs:
     db-tests:
       runs-on: ubuntu-latest
       env:
         TEST_DATABASE_URL: ${{ secrets.CI_TEST_DATABASE_URL }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version-file: '.nvmrc'
         - run: npm ci
         - run: docker compose -f docker/docker-compose.test-db.yml up -d postgres-test
         - run: DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
         - run: npm run ci:test:db
   ```

3. Never echo the URL to logs. If debugging is required, mask it with `echo "${TEST_DATABASE_URL}" | sed 's/:[^:@]*@/:***@/'` or use GitHub's built-in secret masking.

### Buildkite

1. Inject secrets through the [environment hook](https://buildkite.com/docs/pipelines/secrets#environment-hooks). Example hook (`.buildkite/hooks/environment`):

   ```bash
   #!/usr/bin/env bash
   export TEST_DATABASE_URL="$(aws ssm get-parameter --with-decryption --name /site/ci/test_database_url --query Parameter.Value --output text)"
   ```

2. Mark the hook executable and rely on Buildkite's agent hooks to source it before each step.
3. Steps can then reference the variable directly:

   ```yaml
   steps:
     - label: ":postgres: CI database tests"
       command:
         - docker compose -f docker/docker-compose.test-db.yml up -d postgres-test
         - DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
         - npm run ci:test:db
   ```

4. Prefer secret stores (AWS SSM, Vault, Doppler) over inline pipeline YAML to keep credentials out of git.

### Other CI providers

- **GitLab CI/CD:** Store the URL in a [masked variable](https://docs.gitlab.com/ee/ci/variables/#add-a-cicd-variable-to-the-ui) named `TEST_DATABASE_URL` and reference it via the `variables` block on the job. When using the shared Docker executor, add a service container definition that matches the Docker Compose example above.
- **CircleCI:** Use [Context secrets](https://circleci.com/docs/contexts/) or project-level environment variables. Add the Postgres service through the `docker` executor stanza and run the same migrate/test commands in the `steps` list.
- Regardless of provider, confine test credentials to least privilege, rotate them regularly, and avoid persisting them to logs or artifact uploads.

## 6. Troubleshooting

- **Vitest cannot connect:** Ensure `TEST_DATABASE_URL` points to the correct host (`postgres-test` for Docker) and that the container's health check passed before tests started.
- **Migrations fail with permission errors:** Revisit the managed service user's grants. The CI role needs `CREATE`, `ALTER`, and `DROP` within the schema Prisma manages.
- **Buildkite hooks not executing:** Confirm the hook file has Unix line endings and executable bit (`chmod +x .buildkite/hooks/environment`).

Document updates welcome—keep this checklist synchronized with any future pipeline changes.
