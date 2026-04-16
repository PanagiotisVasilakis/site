# Run and Use Guide

This guide explains how to run the site locally and how to use the core flows (guest portal and admin analytics).

## 1) Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL (local or managed), or Docker for local DB
- Linux/macOS shell (Windows users can run via WSL)

## 2) Install dependencies

From the repository root:

```bash
npm ci
```

## 3) Configure environment variables

Create a local env file (if you do not already have one):

```bash
touch .env.local
```

Required values are validated in src/lib/env.ts. At minimum, set:

- DATABASE_URL
- ADMIN_JWT_SECRET
- ADMIN_DASH_SECRET
- SECURITY_ENC_KEY_HEX
- SESSION_SECRET

Security helper (recommended):

```bash
npm run ensure-pepper
```

This creates/updates .env.local with secure values for SECURITY_PEPPER and SECURITY_ENC_KEY_HEX when missing.

## 4) Start a local database

Option A: existing local PostgreSQL

- Create a database and point DATABASE_URL to it.

Option B: Docker test database (quick and reproducible)

```bash
docker-compose -f docker/docker-compose.test-db.yml up -d
export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5433/site_test"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
```

If you use this option for app runtime too, set:

```bash
export DATABASE_URL="$TEST_DATABASE_URL"
```

## 5) Run the site (development)

Preferred full-system command:

```bash
./scripts/system-orchestrator.sh up --profile development --skip-build
```

This command performs env checks, DB auto-detect/fallback, Prisma generation, migrations, app startup, and health verification.

Alternative (app only):

```bash
npm run dev
```

Open http://localhost:3000.

Locale routing is enforced by middleware, so root redirects to /en by default.

## 6) Build and run in production mode (locally)

Preferred orchestrated command:

```bash
./scripts/system-orchestrator.sh up --profile production
```

Alternative manual commands:

```bash
npm run build
npm start
```

Open http://localhost:3000 and verify key pages.

## 7) How to use the site

### Guest flow

1. Open /en/guest (or /el/guest).
2. Choose origin (Greece or Abroad).
3. Enter phone + AFM/passport details and submit.
4. On success, you are redirected to /en/check-in (or /el/check-in).
5. Complete check-in information and submit.

### Admin analytics flow

Access to /admin/analytics requires both:

- Admin secret (x-admin-secret header or token query param in middleware)
- Valid admin_jwt cookie (verified server-side)

Set ADMIN_DASH_SECRET and ADMIN_JWT_SECRET before trying this flow.

## 8) Useful commands

- Full bootstrap only: ./scripts/system-orchestrator.sh bootstrap --profile production
- Start full system: ./scripts/system-orchestrator.sh up --profile production
- Stop full system: ./scripts/system-orchestrator.sh down
- Verify monitoring endpoints: ./scripts/system-orchestrator.sh verify
- System status: ./scripts/system-orchestrator.sh status
- System logs: ./scripts/system-orchestrator.sh logs --follow
- Dev server: npm run dev
- Build: npm run build
- Start built app: npm start
- Lint: npm run lint
- Security scan: npm run security:scan
- Unit/UI tests: npm test
- API tests: npm run test:api

## 9) Quick health checks

After starting the app, check:

- /api/health responds successfully
- /en renders correctly
- /en/guest can submit valid guest verification
- /en/check-in loads after successful verification

## 10) Troubleshooting

- Missing env vars: validate values against src/lib/env.ts requirements.
- Prisma connection errors: confirm DATABASE_URL and run migrations.
- Test DB issues: ensure docker/docker-compose.test-db.yml is up and port 5433 is reachable.
- Secret issues: rerun npm run ensure-pepper and re-check .env.local.

## Related docs

- docs/README_DB.md
- docs/TEST_DATABASE_SETUP.md
- docs/SECURITY_DATA_STORAGE.md
- SECURITY.md
