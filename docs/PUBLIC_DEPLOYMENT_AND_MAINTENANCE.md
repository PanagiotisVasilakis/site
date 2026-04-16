# Public Deployment and Maintenance Guide

This runbook explains how to make the site publicly accessible and how to maintain it safely over time.

## 1) Production readiness checklist

Before exposing the site publicly:

1. Confirm tests and lint pass:
   - npm run lint
   - npm test
2. Build succeeds:
   - npm run build
3. Database migrations are applied to target environment.
4. Production secrets are stored in a secrets manager (not in git).
5. Domain, TLS, monitoring, backups, and alerting are configured.

## 2) Required environment variables

Set these in your hosting platform secret manager:

- NODE_ENV=production
- DATABASE_URL
- ADMIN_JWT_SECRET (min 32 chars)
- ADMIN_DASH_SECRET (min 20 chars)
- SECURITY_ENC_KEY_HEX (64 hex chars)
- SESSION_SECRET (min 32 chars)
- SECURITY_PEPPER
- NEXT_PUBLIC_SITE_URL (https://your-domain)
- ALLOWED_ORIGINS (comma-separated allowed origins)

Optional but recommended:

- VALID_API_KEYS
- RATE_LIMIT_MAX_REQUESTS
- RATE_LIMIT_WINDOW_MS

See src/lib/env.ts and SECURITY.md for policy details.

## 3) Make the site public

### Option A: Vercel (fastest for Next.js)

1. Import the repository into Vercel.
2. Add all required environment variables.
3. Set production domain (for example, app.example.com).
4. Build command: npm run build
5. Start command: npm start (or platform default for Next.js)
6. Deploy and verify smoke checks (Section 5).

### Option B: Self-hosted Node.js

1. Provision a Linux server (or container platform) with Node.js 20+.
2. Put a reverse proxy in front (Nginx/Caddy) with HTTPS.
3. Clone repo, then run the orchestrator:

```bash
./scripts/system-orchestrator.sh up --profile production
```

4. Validate readiness after startup:

```bash
./scripts/system-orchestrator.sh verify --profile production
./scripts/system-orchestrator.sh status --profile production
```

5. Run process manager (systemd/PM2) for restart-on-failure.
6. Restrict server firewall to required ports only.

### Option B1: systemd supervised runtime (recommended)

Use the built-in installer to create and manage systemd units for bootstrap + runtime:

```bash
sudo ./scripts/install-systemd-services.sh --service-name qr-city-guide
```

Installer outputs:

- /etc/systemd/system/qr-city-guide.service
- /etc/systemd/system/qr-city-guide-bootstrap.service
- /etc/qr-city-guide/qr-city-guide.env (template if missing)

Typical operations:

```bash
systemctl status qr-city-guide.service
journalctl -u qr-city-guide.service -f
systemctl restart qr-city-guide.service
systemctl start qr-city-guide-bootstrap.service
```

If your env file is not fully populated yet, install first and defer bootstrap:

```bash
sudo ./scripts/install-systemd-services.sh --service-name qr-city-guide --skip-bootstrap --no-start
```

### Option C: Containerized infrastructure

Use the repository Docker assets and your orchestrator:

- docker/Dockerfile.security
- docker/docker-compose.prod.yml

Use managed Postgres when possible, or a hardened private Postgres deployment.

## 4) DNS, TLS, and edge concerns

1. Point domain DNS to hosting target.
2. Enforce HTTPS and HSTS.
3. Ensure NEXT_PUBLIC_SITE_URL matches the public URL.
4. Set ALLOWED_ORIGINS to exact trusted origins.
5. Verify localized routing works from root (/ redirects to /en).

## 5) Post-deploy smoke test (mandatory)

After every production deploy:

1. GET /api/health returns success.
2. Home redirects correctly to locale path (/en).
3. Guest portal flow works:
   - /en/guest verify
   - redirect to /en/check-in
4. Admin analytics gate is enforced:
   - secret + admin_jwt both required for /admin/analytics
5. Security headers are present on main pages and API responses.

## 6) Maintenance runbook

### Daily

- Check uptime and /api/health.
- Review error logs and high-latency alerts.
- Confirm no unusual auth failures or rate-limit spikes.

### Weekly

- Run security scan and dependency review:
  - npm run security:scan
  - npm audit --audit-level=high
- Review performance telemetry and API timing trends.
- Verify backup jobs completed successfully.

### Monthly

- Rotate sensitive credentials where feasible.
- Patch runtime/OS and container base images.
- Review CSP and allowed origins for drift.
- Execute restore drill from backup (test environment).

## 7) Backups and recovery

1. Enable automated Postgres backups with retention policy.
2. Keep encrypted off-site backups according to compliance policy.
3. Test restore to staging at least monthly.
4. Document RPO/RTO targets and incident owners.

Related references:

- docs/SECURITY_DATA_STORAGE.md
- docs/NEON_MANAGED_DB.md
- docs/README_DB.md

## 8) Safe release workflow

1. Run pre-release checks in CI (lint, tests, build).
2. Apply migrations before traffic shift.
3. Deploy to staging first.
4. Run smoke tests.
5. Deploy to production.
6. Monitor for 30-60 minutes.
7. Roll back if severe errors appear.

Operational shortcuts:

- Bootstrap only: ./scripts/system-orchestrator.sh bootstrap --profile production
- Start services: ./scripts/system-orchestrator.sh up --profile production
- Stop services: ./scripts/system-orchestrator.sh down --profile production
- Check readiness: ./scripts/system-orchestrator.sh verify --profile production

CI check mode shortcut:

- npm run ci:orchestrator-check

The CI workflow now runs orchestrator check mode against a PostgreSQL service and validates:

1. Preflight and env contract via system-orchestrator check.
2. Migration readiness via system-orchestrator migrate.
3. Build viability via system-orchestrator build.

## 9) Incident response quick template

When production degrades:

1. Detect and classify severity.
2. Stabilize (rollback or disable affected feature).
3. Communicate status and ETA.
4. Resolve root cause.
5. Publish post-incident notes and action items.

## 10) Ownership recommendations

Define explicit owners for:

- Runtime operations
- Database and migrations
- Security and secrets
- On-call escalation

This avoids deployment and maintenance ambiguity as traffic grows.
