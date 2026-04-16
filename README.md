This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Coverage Badge Endpoint

The route `/api/coverage` returns a Shields.io style JSON badge computed from `coverage/lcov.info`. Run `npm test` (which generates lcov) before build/deploy to update values. In CI, tests run prior to build so the badge reflects the latest commit.

## Project Guides

- Run and use the site locally: [docs/RUN_AND_USE_GUIDE.md](docs/RUN_AND_USE_GUIDE.md)
- Make the site public and maintain it: [docs/PUBLIC_DEPLOYMENT_AND_MAINTENANCE.md](docs/PUBLIC_DEPLOYMENT_AND_MAINTENANCE.md)

## System Orchestrator

Use the orchestrator for one command startup of database, build, app runtime, and monitoring checks:

```bash
# Full production-style startup (auto-detect DB, fallback to local Docker DB if needed)
./scripts/system-orchestrator.sh up --profile production

# Local development profile (skips mandatory production build)
./scripts/system-orchestrator.sh up --profile development --skip-build

# Stop app and local fallback DB (if orchestrator started it)
./scripts/system-orchestrator.sh down
```

Make shortcuts are available:

```bash
make up PROFILE=production
make up-dev
make status
make logs-follow
make down
```

Equivalent npm scripts:

```bash
npm run system:up
npm run system:status
npm run system:verify
npm run system:down
```

Production supervision with systemd:

```bash
sudo ./scripts/install-systemd-services.sh --service-name qr-city-guide
systemctl status qr-city-guide.service
```

CI check mode:

```bash
npm run ci:orchestrator-check
```

This command now enforces Node 20+/npm 10+ automatically and provisions a temporary local PostgreSQL instance when `DATABASE_URL` is not reachable.

## Architecture: Direct Verification Only

The guest portal uses a direct verification flow without extra challenge steps. The unified page at `/{locale}/guest` supports Sign‑in and Sign‑up modes with:

- Origin selection (Greece vs Abroad) and phone + AFM/Passport details
- Submission to `/api/portal/verify` which issues session cookies on success
- Redirect to `/{locale}/check-in` upon success

Analytics are constrained to a minimal, PII-safe set:

- portal_opened
- origin_selected
- form_submitted
- auth_mode_changed
- no_booking_cta_clicked
- checkin_viewed
- checkin_completed

No optional challenge flags or strings are present in the codebase; i18n dictionaries have been pruned accordingly.
