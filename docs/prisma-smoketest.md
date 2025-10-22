# Prisma Smoke Test Utility

The Prisma smoke test script (`scripts/prisma-smoketest.ts`) verifies that the application can talk to the
configured PostgreSQL database using the generated Prisma client. It is designed for local validation,
continuous integration checks, and post-deployment health probes.

## Capabilities

The smoke test performs three independent checks:

1. **Client initialisation** – ensures the Prisma client can establish a connection using `DATABASE_URL`.
2. **Connectivity probe** – runs a lightweight `SELECT 1 AS ok` query to validate network and authentication.
3. **Model access (optional)** – calls `prisma.user.count()` to confirm that generated client bindings match the
   deployed schema. This step can be disabled when the `users` table is unavailable (for example, in temporary
   scratch databases).

Each stage is wrapped in a configurable timeout (default 5000 ms) and reports individual durations so you can
spot slowdowns early.

## Prerequisites

Before running the smoke test, ensure that:

- `DATABASE_URL` points at a reachable PostgreSQL instance.
- The database has been migrated to the same schema expected by this repository (e.g. run `npm run prisma:migrate:deploy`).
- Prisma client artefacts are up to date (`npm run prisma:generate`) when schema changes land.

## Usage

Add the command to your workflow via npm:

```bash
npm run prisma:smoketest
```

Additional CLI options are forwarded after a `--` separator:

- `--timeout=<ms>` – adjust the per-step timeout (defaults to `5000`).
- `--no-verify-user` – skip the `User` model check and only run the connectivity probe.
- `--json` – emit structured JSON output for machine parsing.
- `--quiet` – suppress human-readable summaries (errors still go to stderr).
- `--help` – display inline documentation.

### Example invocations

Run with structured output and a longer timeout:

```bash
npm run prisma:smoketest -- --json --timeout=10000
```

Smoke test a read-only replica that does not expose the `users` table:

```bash
npm run prisma:smoketest -- --no-verify-user
```

## Exit codes

- `0` – all checks passed.
- `1` – validation failed (missing env vars, timeout, Prisma error, etc.). Detailed error messages are printed
to stderr and include serialised metadata when available.

## Troubleshooting

- **Missing `DATABASE_URL`** – set the environment variable locally or via your CI/CD secret manager.
- **Time-outs** – verify network reachability, VPN access, or database load. Increase `--timeout` only after
  confirming infrastructure health.
- **Schema mismatches** – regenerate the Prisma client or deploy migrations so the `User` model is available.

Because the script is a thin wrapper around Prisma, all standard Prisma environment variables (TLS settings,
connection limits, etc.) remain compatible. No additional dependencies are required beyond the packages
listed in `package.json`.
