# Database setup & verification — Dev DB (WSL2) ✅

This document explains the precise, reproducible steps we used to get a local PostgreSQL development database running in a WSL2 environment (Ubuntu, no systemd), wire it to Prisma, apply migrations and verify the app can use it. It includes exact commands, why each step is needed, and troubleshooting guidance.

## Goals / success criteria

- Docker daemon running on the WSL2 host
- Postgres dev container `site-dev-db` running and healthy
- `DATABASE_URL` available to CLI and the Next dev server
- Prisma migrations applied and Client generated
- A quick smoke test (Prisma) succeeds

## Environment assumptions

- WSL2/Ubuntu (no systemd)
- Docker installed but dockerd may not be started by the distribution
- Repo root: `/home/pvs/site`

If your environment differs, adapt the commands below.

## 1) Start Docker daemon (WSL2 / no systemd)

Why: WSL2 distributions don't run systemd by default; `docker` CLI needs the Docker daemon (`dockerd`) running on the host. Starting `dockerd` directly is the reliable approach here.

Commands (run in WSL2 shell):

```bash
# start dockerd detached and write logs so job-control doesn't stop it
sudo nohup dockerd > /tmp/dockerd.log 2>&1 &
disown
sleep 3
# verify daemon is responsive
docker version --format 'Client: {{.Client.Version}} / Server: {{.Server.Version}}'
docker ps
```

If `docker ps` errors, inspect the daemon log:

```bash
tail -n 200 /tmp/dockerd.log
```

Common WSL notes:
- If `nohup`/job-control causes `dockerd` to be stopped, use `sudo setsid dockerd >/tmp/dockerd.log 2>&1 &`.
- Running `dockerd` as root is expected; use the `docker` CLI as your normal user after the daemon starts.

## 2) Start the development Postgres container

Why: The repository includes a `docker-compose.yml` with a `db` service (postgres:16-alpine) that maps host port 5433 → container 5432. We use it for local development and Prisma migrations.

Commands:

```bash
cd /home/pvs/site
docker-compose up -d db
# ensure container is running and healthy
docker ps --filter "name=site-dev-db" --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"
docker logs --tail 200 site-dev-db
```

What to expect: the `site-dev-db` container should reach a `healthy` state and list `0.0.0.0:5433->5432` in Ports. The container init logs show PostgreSQL starting and listening.

If the container fails or exits, `docker logs site-dev-db` will show why (permission issues, port conflicts, or missing locales on Alpine are common but often harmless warnings).

## 3) Provide `DATABASE_URL` to tools and Next

Why: Prisma and the Next server read `DATABASE_URL` (Prisma also loads `.env` by default). The CLI earlier failed with P1012 because `DATABASE_URL` was not defined in the environment where `prisma` ran.

There are two recommended approaches:

- Short-lived (current shell only):

```bash
export DATABASE_URL="postgresql://devuser:devpass@localhost:5433/site_dev"
```

- Persistent for Next CLI & VS Code (recommended): create `.env` or `.env.local` in the repo root. Example contents:

```text
DATABASE_URL="postgresql://devuser:devpass@localhost:5433/site_dev"
# optional: persist the SECURITY_PEPPER used by the app
# SECURITY_PEPPER="replace-with-dev-pepper"
```

After creating `.env` / `.env.local`, restart any running Node/Next processes so they inherit the variable.

## 4) Apply migrations and generate Prisma Client

Why: The database created by the container starts empty. To match the app schema we apply the repository's migrations and generate Prisma Client.

Commands:

```bash
# apply migrations to create tables
npx prisma migrate deploy

# verify introspection (optional) and update schema if needed
npx prisma db pull

# generate Prisma Client used by the app
npx prisma generate
```

Expected outcome: migrations apply successfully (you'll see each migration name). `npx prisma db pull` should introspect models. `prisma generate` writes `node_modules/@prisma/client`.

## 5) Smoke test (quick verification)

Run a fast check that Prisma can query the DB and the Next dev server uses the same `DATABASE_URL`:

```bash
# from repo root (ensure .env/.env.local present or DATABASE_URL exported)
npx prisma db pull
npx prisma studio # opens a GUI at http://localhost:5555

# or run the app and exercise the signup API
npm run dev
# POST to http://localhost:3000/api/portal/verify with a sample payload
```

If the API returns 500 and logs indicate "Prisma client is not initialized" or "Environment variable not found: DATABASE_URL", that means the running Node process doesn't have the env var; restart it in a shell where the var is set or ensure `.env` exists and is readable by Next.

## Troubleshooting & diagnostics (systematic)

1) Docker daemon problems

- Check: `sudo systemctl status docker` (not available in WSL2); instead inspect `/tmp/dockerd.log`.
- Useful logs:

```bash
tail -n 200 /tmp/dockerd.log
```

Look for errors about permission, cgroups, or missing sockets.

2) Container start failures

- Inspect container logs:

```bash
docker logs --tail 200 site-dev-db
```

- Common issues:
   - Locale warnings on Alpine (`sh: locale: not found`) — usually harmless.
   - Permission issues — ensure Docker process had permissions to create mounted volumes.

3) Prisma / DATABASE_URL errors

- If `npx prisma db pull` says "Environment variable not found: DATABASE_URL":
   - Add `DATABASE_URL` to `.env` or export it in the shell you're running Prisma from.
   - Confirm `echo $DATABASE_URL` prints the expected value.

- If Prisma introspects an empty DB, apply migrations: `npx prisma migrate deploy`.

4) Next server still shows errors after env changes

- Restart the dev server process. Processes don't magically pick up new env files.
- If running via VS Code launch/Tasks, ensure the task picks up `.env` or restart VS Code.

## Useful commands (summary)

```bash
# Start dockerd in WSL2
sudo nohup dockerd > /tmp/dockerd.log 2>&1 &
sleep 3
docker ps

# Start DB
cd /home/pvs/site
docker-compose up -d db
docker ps --filter "name=site-dev-db"
docker logs --tail 200 site-dev-db

# Provide DATABASE_URL (persisted for tools)
echo 'DATABASE_URL="postgresql://devuser:devpass@localhost:5433/site_dev"' > .env

# Apply migrations and generate client
npx prisma migrate deploy
npx prisma db pull
npx prisma generate

# Start the Next dev server
npm run dev
```

## Notes and next steps

- If you prefer automation, the repository includes `./scripts/install-postgres-and-setup.sh` which attempts to install and configure PostgreSQL on the host — that script requires systemd and may fail under WSL2; prefer the Docker approach described above for WSL2.
- For CI, use `docker-compose.test-db.yml` and `TEST_DATABASE_URL` to isolate test DBs.

---

If you want, I can also:
- Add the succinct `npm` scripts suggested (db:start/db:stop/db:logs) to `package.json` for one-line convenience.
- Create a tiny `scripts/db-check.sh` that runs the verification steps and prints a summary status.

Tell me which of those you'd like and I'll apply the change.
