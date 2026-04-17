# Run and Use Guide

This guide explains how to use the core flows (guest portal and admin analytics) once the system is running.

## 1) Setup and start the system first

- Canonical setup/run instructions (development, test, production): `scripts/README.md`
- Deployment and maintenance runbook: `docs/PUBLIC_DEPLOYMENT_AND_MAINTENANCE.md`

After following `scripts/README.md`, ensure the app is running and reachable at `http://localhost:3000`.

## 2) How to use the site

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

## 3) Useful commands

- Verify monitoring endpoints: ./scripts/system-orchestrator.sh verify --profile development
- System status: ./scripts/system-orchestrator.sh status --profile development
- System logs: ./scripts/system-orchestrator.sh logs --profile development --follow
- Lint: npm run lint
- Security scan: npm run security:scan
- Unit/UI tests: npm test
- API tests: npm run test:api

## 4) Quick health checks

After starting the app, check:

- /api/health responds successfully
- /en renders correctly
- /en/guest can submit valid guest verification
- /en/check-in loads after successful verification

## 5) Troubleshooting

- Missing env vars: validate values against src/lib/env.ts requirements.
- Prisma connection errors: confirm DATABASE_URL and run migrations.
- Test DB issues: ensure docker/docker-compose.test-db.yml is up and port 5433 is reachable.
- Secret issues: rerun npm run ensure-pepper and re-check .env.local.

## Related docs

- scripts/README.md
- docs/README_DB.md
- docs/TEST_DATABASE_SETUP.md
- docs/SECURITY_DATA_STORAGE.md
- SECURITY.md
