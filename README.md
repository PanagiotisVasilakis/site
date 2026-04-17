# QR City Guide

This README is intentionally concise and points to the canonical runbooks.

## Setup and Runtime

For complete setup and run instructions (development, test, production), use:

- [scripts/README.md](scripts/README.md)

## Use Flows

For guest and admin usage flows after the system is running, use:

- [docs/RUN_AND_USE_GUIDE.md](docs/RUN_AND_USE_GUIDE.md)

## Deployment and Operations

- [docs/PUBLIC_DEPLOYMENT_AND_MAINTENANCE.md](docs/PUBLIC_DEPLOYMENT_AND_MAINTENANCE.md)
- [docs/README_DB.md](docs/README_DB.md)
- [docs/TEST_DATABASE_SETUP.md](docs/TEST_DATABASE_SETUP.md)

## Coverage Badge Endpoint

The route `/api/coverage` returns Shields.io style JSON computed from `coverage/lcov.info`. Run `npm test` before build/deploy to refresh coverage values.

## Architecture Summary

The guest portal uses a direct verification flow on `/{locale}/guest`:

- Select origin (Greece or Abroad)
- Submit phone + AFM/passport details to `/api/portal/verify`
- Receive session cookies on success and redirect to `/{locale}/check-in`

Analytics events are intentionally minimal and PII-safe:

- `portal_opened`
- `origin_selected`
- `form_submitted`
- `auth_mode_changed`
- `no_booking_cta_clicked`
- `checkin_viewed`
- `checkin_completed`
