# Managed Neon PostgreSQL setup

This document captures the managed database that now backs the project. It also contains the exact steps to reproduce the environment, rotate credentials, or switch regions/providers if you ever want to make adjustments later on.

> **Scope.** The instructions below apply to the Neon project `site-managed` that was created specifically for this repository. They intentionally keep compute usage near the free tier (0.5 Compute Units ≈ 0.5 GB RAM) so you can scale down costs when the database is idle.

## 1. Current Neon topology (production, staging, tests)

| Purpose      | Branch name | Database        | Role (owner)         | Endpoint host (pooler)                              |
|--------------|-------------|-----------------|----------------------|-----------------------------------------------------|
| Production   | `main`      | `site_prod`     | `site_prod_owner`    | `ep-summer-leaf-ag8cudcw-pooler.c-2.eu-central-1.aws.neon.tech` |
| Staging      | `staging`   | `site_staging`  | `site_staging_owner` | `ep-small-dream-agefnpx5-pooler.c-2.eu-central-1.aws.neon.tech` |
| Automated tests | `test`   | `site_test`     | `site_test_owner`    | `ep-rapid-violet-agi0bd51-pooler.c-2.eu-central-1.aws.neon.tech` |

Project metadata:

- Organization: `org-steep-cake-02287295`
- Project ID: `lingering-bread-59552124`
- Region: `aws-eu-central-1`
- Compute: fixed at **0.5 CU** (approx. 0.5 GB RAM) with the pooled connection proxy enabled for each endpoint.
- Passwordless access remains enabled (Neon free tier requirement). Restrict access with the allowlist before going live in production.

> **Why poolers?** Prisma opens multiple short-lived connections. Neon’s pooled endpoints (`pgbouncer=true`) keep the total connection footprint extremely low, which is important on the free tier.

## 2. How to retrieve connection strings safely

Never commit credentials to the repository. Use the Neon CLI (`npm install -g neonctl`) or the web console to fetch a fresh URL when you need it.

Examples (replace `<project-id>` if you clone/rename the project in the future):

```bash
# Production
neonctl connection-string main \
  --project-id lingering-bread-59552124 \
  --role-name site_prod_owner \
  --database-name site_prod \
  --pooled --prisma

# Staging
neonctl connection-string staging \
  --project-id lingering-bread-59552124 \
  --role-name site_staging_owner \
  --database-name site_staging \
  --pooled --prisma

# Tests / CI
neonctl connection-string test \
  --project-id lingering-bread-59552124 \
  --role-name site_test_owner \
  --database-name site_test \
  --pooled --prisma
```

The `--prisma` flag automatically adds sane defaults:

- `pgbouncer=true` (use the pooled proxy)
- `sslmode=require` and `channel_binding=require`
- `connect_timeout=30`, `pool_timeout=30`

After copying the URL, tighten it further by appending conservative limits:

```
…&pool_timeout=15&connection_limit=2
```

Those values keep at most two pooled connections per environment and make Prisma fail fast when the pool is exhausted. Adjust upward only if you observe saturation under load tests.

## 3. Environment variables you must set

| Target | Variable | Value (recommended) |
|--------|----------|---------------------|
| Production runtime | `DATABASE_URL` | Production connection string with `pgbouncer=true&connection_limit=2&pool_timeout=15` |
| Staging runtime | `DATABASE_URL` | Same string but pointing to the staging branch/database |
| CI / automated tests | `TEST_DATABASE_URL` | Test connection string with the same query parameters |
| Local Prisma CLI | `prisma/.env` | Add `DATABASE_URL="…"` (production or staging string). Keep this file untracked. |

**Deployment tip:** store the URLs in your platform’s secret manager (GitHub Actions, Vercel, Fly.io, etc.). For GitHub Actions add them as repository secrets and reference them in the workflow.

### Local Prisma CLI helper

Create or update `prisma/.env` **locally** (the repository already ignores `.env*` files) with the string you want to target:

```dotenv
# prisma/.env (do not commit)
DATABASE_URL="postgresql://site_prod_owner:***@ep-summer-leaf-ag8cudcw-pooler.c-2.eu-central-1.aws.neon.tech/site_prod?pgbouncer=true&sslmode=require&channel_binding=require&connect_timeout=30&pool_timeout=15&connection_limit=2"
```

Swap in the staging or test URL whenever you need to run migrations against those branches.

## 4. Rotating credentials or recreating the databases

1. **Install the CLI:** `npm install -g neonctl`
2. **List organizations:** `neonctl orgs list`
3. **Switch to your project:** `neonctl set-context --project-id lingering-bread-59552124`
4. **Rotate a password:**
   ```bash
   neonctl roles update site_prod_owner \
     --project-id lingering-bread-59552124 \
     --branch main \
     --reset-password
   ```
   The CLI prints the new password once. Update all relevant secrets immediately.
5. **Create new databases/roles:** use `neonctl databases create` and `neonctl roles create` (mirrors what was done for staging and test above).
6. **Delete unused branches:** `neonctl branches delete <branch>`.

> **Alternative:** Everything above can also be done in the Neon web console if you prefer a UI. The CLI commands are included so automation (GitHub Actions, shell scripts) can replicate the environment deterministically.

## 5. Running migrations and smoke tests

1. Export the appropriate URL:
   ```bash
   export DATABASE_URL="postgresql://…"  # prod or staging string
   ```
2. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```
3. Run the existing connectivity check (Prisma client one-liner):
   ```bash
   npx tsx -e "import { PrismaClient } from '@prisma/client'; const p=new PrismaClient(); await p.$connect(); const r=await p.$queryRaw`SELECT 1 as ok`; console.log(r); await p.$disconnect();"
   ```
4. For automated smoke tests, export `TEST_DATABASE_URL` and execute `npm run test -- --runInBand` (or the minimal subset you prefer).

> **Note:** The Codespaces-based CI environment where this automation ran cannot reach port 5432 on Neon (likely egress filtering). You may need to run step 2 from a local machine or hosted runner with unrestricted outbound connectivity. The database itself is reachable once those network constraints are lifted.

## 6. Tuning & maintenance checklist

- **Auto-suspend:** Free-tier projects cannot change the suspend timeout programmatically. If Neon later lifts that restriction, patch the project with `suspend_timeout_seconds` set to `300` to save cost.
- **Connection pooling:** Keep using pooled URLs. Direct endpoints (`pgbouncer=false`) will exhaust the free-tier connection allowance quickly.
- **IP allow list:** Once you know the final deployment IP ranges, update the project allow list so only those ranges can connect.
- **Backups:** Neon keeps 7-day PITR on the free plan. Consider upgrading if you need longer retention.
- **Monitoring:** The Prisma instrumentation already logs pool recommendations. Watch for `Prisma client initialization` logs during deployment; they will remind you if you forget to append the `connection_limit` / `pool_timeout` parameters.

## 7. Switching regions or providers later

1. Create a new Neon project in the target region via `neonctl projects create --region-id <region>`.
2. Recreate branches/databases/roles following the same pattern.
3. Update secrets (`DATABASE_URL`, `TEST_DATABASE_URL`) and redeploy.
4. Run `prisma migrate deploy` + the Prisma connectivity smoke test to confirm the new environment is healthy.

Keeping all of the above in version control means you can audit how the managed database was provisioned and repeat it any time with minimal guesswork.
