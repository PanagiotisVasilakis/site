# Database setup (dev & prod) — quick start

This document explains how to bring up a local PostgreSQL database for development and testing, how to run Prisma migrations, and how to perform a quick connectivity smoke test. It also includes notes for production Docker Compose usage.

> **Using the managed Neon instance?** See [`docs/NEON_MANAGED_DB.md`](docs/NEON_MANAGED_DB.md) for the provisioned production/staging/test databases, connection-string conventions, and rotation procedures. The local Docker instructions below still apply if you want an offline development database.

## Files added

- `docker-compose.yml` — development-friendly compose file exposing Postgres on host port `5433` as service `db`.
- `docker-compose.test-db.yml` — repo-provided test compose that exposes `postgres-test` on host `5433`.
- `docker-compose.prod.yml` — example production compose using `.env` and safer defaults.
- `.env.example` — example env vars and connection strings.

## High-level plan

1. Ensure Docker daemon is running on your machine (native Linux or WSL + Docker Desktop).
2. Start the development database: `docker-compose up -d` (or target the service `db`).
3. Export `TEST_DATABASE_URL` or `DATABASE_URL` so Prisma can connect.
4. Run Prisma migrations.
5. Run a small smoke test to confirm connectivity.

## 1) Start Docker (common environments)

Native Linux (systemd):

```bash
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker "$USER"  # then log out and back in
```

WSL (Windows + Docker Desktop):

- Start Docker Desktop on Windows and enable WSL integration for your distro (e.g. Ubuntu).
- Or install Docker inside WSL and start the service:

```bash
sudo service docker start
```

If `docker` commands fail with "Cannot connect to the Docker daemon" or FileNotFoundError, the daemon is not running or the CLI can't find it.

Verify with:

```bash
docker --version
docker info
```

If `docker info` reports errors, follow Docker Desktop or your OS docs to start the daemon.

## 2) Start the development DB

The repository includes `docker-compose.yml` (dev) and `docker-compose.test-db.yml` (test). Choose the one you want:

Dev (recommended for local dev):

```bash
docker-compose up -d
# or target only the db service
docker-compose up -d db
```

Test (the repo's test file):

```bash
docker-compose -f docker-compose.test-db.yml up -d postgres-test
```

Notes:

- If your system has the newer Docker CLI with the `compose` subcommand, either use `docker compose` (space) or keep using `docker-compose` if available. Many hosts still ship `docker-compose` as a separate Python binary.
- If you get `unknown shorthand flag: 'f'` when using `docker compose -f`, use `docker-compose -f ...` instead. If `docker-compose` is missing, install the Compose plugin or use Docker Desktop.

## 3) Export env vars for Prisma

Set `TEST_DATABASE_URL` for tests and `DATABASE_URL` for runtime. For the included compose files the host port is `5433`.

```bash
export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5433/site_test"
export DATABASE_URL="postgresql://devuser:devpass@localhost:5433/site_dev"
```

You can also create a `.env` file (do NOT commit secrets!) using `.env.example` as a template.

## 4) Run Prisma migrations

After the DB is up and env vars are set:

```bash
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
# or for development
DATABASE_URL="$DATABASE_URL" npx prisma migrate dev
```

If you see connection errors, verify the container is healthy:

```bash
docker ps --filter "name=postgres" --filter "status=running"
docker logs site-dev-db  # or site-test-db
```

## 5) Smoke test Prisma connectivity

Use a tiny Node one-liner (tsx) to confirm Prisma can run a query:

```bash
npx tsx -e "import { PrismaClient } from '@prisma/client'; const p=new PrismaClient(); await p.$connect(); const r = await p.$queryRaw`SELECT 1 as ok`; console.log(r); await p.$disconnect();"
```

If you see `[{ ok: 1 }]` (or similar) the DB is reachable.

Need the exact lookup workflow from Issue 1 (including migrations and env vars)? The **[CI Database Testing Guide](docs/testing/db-lookup.md#issue-1-lookup-smoke-test-workflow)** covers the scripted command that targets the `docker-compose.test-db.yml` service and explains how to interpret the results.

## Troubleshooting

- "Cannot connect to the Docker daemon": start the daemon or use Docker Desktop with WSL integration.
- "unknown shorthand flag: 'f'": your installed `docker` is the older CLI; use `docker-compose -f` or install the Compose plugin.
- Name resolution errors (Temporary failure in name resolution): check host DNS (`/etc/resolv.conf`) and network. If inside WSL, restart WSL (`wsl --shutdown`) and Docker Desktop.
- If `prisma` complains about missing `DATABASE_URL`, ensure the env var is set in the shell that runs Prisma or use `DATABASE_URL=... npx prisma ...` inline.

## Production notes

- `docker-compose.prod.yml` uses `.env` to avoid keeping secrets in source. Use a secrets manager in real deployments.
- Bind production Postgres to the host with caution; prefer a managed DB or internal-only network.

## Files you may use

- `docker-compose.yml` — dev convenience (service `db` on host port 5433)
- `docker-compose.test-db.yml` — existing test file (service `postgres-test` on host port 5433)
- `docker-compose.prod.yml` — example for production deployment
- `.env.example` — copy to `.env` and fill secrets

If you want, I can also: add a small npm script to start the dev DB, or attempt to run the smoke test from here (I can't start Docker daemon from this environment). Tell me which option you prefer.
