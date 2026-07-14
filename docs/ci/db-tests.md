# Database CI gate

The canonical GitHub Actions implementation is the `database` job in `.github/workflows/ci.yml`. It starts PostgreSQL 16, applies every committed migration, runs the dedicated database Vitest configuration, and then runs the production-profile orchestrator check. Every step is a hard gate.

Required variables point to the same isolated database:

```bash
export DATABASE_URL='postgresql://ci_user:ci_pass@127.0.0.1:5432/site_ci_test'
export DIRECT_URL="$DATABASE_URL"
export TEST_DATABASE_URL="$DATABASE_URL"
```

The database name must end in `_test`. This prevents accidental execution against development, staging, or production databases.

Local equivalent:

```bash
docker compose -f docker/docker-compose.test-db.yml up -d postgres-test
export TEST_DATABASE_URL='postgresql://testuser:testpass@127.0.0.1:5434/site_test'
DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL" npm run test:db
```

`npm run ci:orchestrator-check` expects an already reachable database and passes `--no-docker-fallback`; CI provisioning and application orchestration are deliberately separate responsibilities.

Do not use `continue-on-error`, `|| true`, or a production credential in this job. Store managed-database credentials in the CI secret store and never print connection URLs in logs.
