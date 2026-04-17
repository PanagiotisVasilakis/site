# Setup and Run Guide (Development, Test, Production)

Last updated: 2026-04-17

This document explains how to set up this repository and run the site in development, test, and production modes.

## 1) Prerequisites

- Node.js 20+ (from `.nvmrc`)
- npm 10+
- PostgreSQL (managed or local), or Docker for local fallback/test databases
- Linux/macOS shell (Windows via WSL is fine)

### 1.1) Upgrade to Node 20+ (Linux/WSL)

If your terminal is still on Node 18, use one of these paths.

Option A (recommended): install nvm and switch to Node 20

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 20
nvm alias default 20
nvm use 20
npm install -g npm@10
node -v && npm -v
```

Option B: system-wide Node 20 via NodeSource

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g npm@10
node -v && npm -v
```

After upgrading, reinstall dependencies to align native modules and lockfile state:

```bash
rm -rf node_modules
npm install
```

## 2) One-time setup

From the repository root:

```bash
npm ci
npm run ensure-pepper
```

`npm run ensure-pepper` creates missing local `SECURITY_PEPPER` and `SECURITY_ENC_KEY_HEX` values in `.env.local`.

## 3) Environment files and required variables

The orchestrator reads env files by profile using this order (first file wins for each variable):

- production: `.env.production.local`, `.env.local`, `.env.production`, `.env`
- development: `.env.development.local`, `.env.local`, `.env.development`, `.env`
- test: `.env.test.local`, `.env.test`, `.env`

For full app bootstrap/start (`up`, `bootstrap`, `build`, `migrate`), set at least:

- `DATABASE_URL` (valid PostgreSQL URL)
- `ADMIN_JWT_SECRET` (minimum 32 chars)
- `ADMIN_DASH_SECRET` (minimum 20 chars)
- `SECURITY_ENC_KEY_HEX` (64 hex chars)
- `SESSION_SECRET` (minimum 32 chars)

Recommended for realistic runtime checks:

- `NEXT_PUBLIC_SITE_URL`
- `ALLOWED_ORIGINS`
- `VALID_API_KEYS` (metrics endpoint check can use the first key)

## 4) Development mode

### Preferred (full-stack orchestrated)

```bash
./scripts/system-orchestrator.sh up --profile development --skip-build
```

What this does:

- Validates runtime and env contract
- Ensures dependencies are installed
- Ensures database connectivity (falls back to local Docker DB if needed)
- Runs Prisma generate and migrations
- Starts the app and verifies health/metrics endpoints

Useful follow-up commands:

```bash
./scripts/system-orchestrator.sh status --profile development
./scripts/system-orchestrator.sh logs --profile development --follow
./scripts/system-orchestrator.sh down --profile development
```

### App-only development server

```bash
npm run dev
```

Open `http://localhost:3000` (middleware redirects root to `/en`).

## 5) Test mode

Use a dedicated test database and avoid pointing tests to production/staging data.

### A) Run test suites with dedicated Postgres (recommended)

```bash
# Start test DB container
docker compose -f docker/docker-compose.test-db.yml up -d

# If your machine only has docker-compose (legacy), use:
# docker-compose -f docker/docker-compose.test-db.yml up -d

# Point test tooling to the DB
export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5433/site_test"

# Apply schema to test DB
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy

# Run tests
NODE_ENV=test TEST_DATABASE_URL="$TEST_DATABASE_URL" npm test
NODE_ENV=test TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:api
```

Cleanup:

```bash
docker compose -f docker/docker-compose.test-db.yml down
```

### B) Run the app in test profile (for runtime-style checks)

```bash
./scripts/system-orchestrator.sh up --profile test --skip-build
./scripts/system-orchestrator.sh verify --profile test
./scripts/system-orchestrator.sh down --profile test
```

## 6) Production mode

Before production startup, ensure production secrets are loaded from a secret manager or secure env file.

Recommended sequence:

```bash
./scripts/system-orchestrator.sh check --profile production
./scripts/system-orchestrator.sh up --profile production
./scripts/system-orchestrator.sh verify --profile production
./scripts/system-orchestrator.sh status --profile production
```

`up --profile production` already includes dependency checks, DB readiness, Prisma generate, migrations, and build.

Stop production runtime:

```bash
./scripts/system-orchestrator.sh down --profile production
```

### Optional: systemd supervision for long-running hosts

```bash
sudo ./scripts/install-systemd-services.sh --service-name qr-city-guide
systemctl status qr-city-guide.service
journalctl -u qr-city-guide.service -f
```

## 7) Equivalent npm and make shortcuts

npm shortcuts:

- `npm run system:up`
- `npm run system:down`
- `npm run system:status`
- `npm run system:verify`
- `npm run system:migrate`
- `npm run db:start`
- `npm run db:migrate`

Make shortcuts:

- `make up PROFILE=production`
- `make up-dev`
- `make status`
- `make logs-follow`
- `make down`

## 8) Quick troubleshooting

- Runtime fails immediately with version error: use Node 20+ and npm 10+.
- Env validation fails: check `DATABASE_URL`, `ADMIN_JWT_SECRET`, `ADMIN_DASH_SECRET`, `SECURITY_ENC_KEY_HEX`, `SESSION_SECRET`.
- Database unreachable: start Docker and rerun orchestrator, or set a reachable managed `DATABASE_URL`.
- Tests fail on DB connection: verify `TEST_DATABASE_URL`, run migrations again, and confirm test DB container health.

## 9) Related docs

- `docs/RUN_AND_USE_GUIDE.md`
- `docs/PUBLIC_DEPLOYMENT_AND_MAINTENANCE.md`
- `docs/TEST_DATABASE_QUICK_START.md`
- `docs/TEST_DATABASE_SETUP.md`
- `docs/README_DB.md`