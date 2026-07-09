# Test DB lookup verification

This guide documents the quick smoke test that verifies whether the Docker-based test database is reachable and migrated before running assertions. It is intended to accompany the scripted workflow introduced in Issue 1 and provides additional context for manual troubleshooting.

## Issue 1 lookup smoke test workflow

The commands below replicate the CI lookup locally. They target the `postgres-test` service defined in [`docker/docker-compose.test-db.yml`](../../docker/docker-compose.test-db.yml) and rely on the same `TEST_DATABASE_URL` string that Vitest expects.

### 1. Ensure the Docker service is running

Bring up the Postgres service that ships with the repository:

```bash
docker compose -f docker/docker-compose.test-db.yml up -d postgres-test
```

The compose file exposes the container as `site-test-db` on host port `5433` with credentials `testuser` / `testpass` and database `site_test`.

### 2. Export the expected URL

The smoke test and Prisma migrations assume the following connection string. Export it into your current shell session before proceeding:

```bash
export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5433/site_test"
```

### 3. Run migrations exactly as scripted

Issue 1’s helper script runs Prisma migrations against the test database prior to executing assertions. Replicate the same step manually so the schema matches your application:

```bash
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
```

### 4. Execute the scripted lookup check

Use the exact command emitted by the Issue 1 script to run the lookup/creation assertions with the correct environment variables:

```bash
NODE_ENV=test TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5433/site_test" npm test
```

This runs the Vitest suite against the Docker-hosted database, ensuring Prisma uses the dedicated test URL instead of your development database.

### 5. Interpreting results

- ✅ **All assertions green** – The test runner connected to `postgres-test`, applied migrations, and successfully exercised the database-backed code paths. Your test database is reachable.
- ❌ **Failures or hangs** – Most commonly indicate a connection problem (container not running, wrong `TEST_DATABASE_URL`) or unapplied migrations (the schema Prisma expects is missing). Re-run the migration command above and confirm the Docker service is healthy with `docker ps` and `docker logs site-test-db`.

If problems persist after verifying connectivity, inspect Prisma logs (`DEBUG=prisma:*`) or run `psql "$TEST_DATABASE_URL" -c "\\dt"` to confirm the schema state.
