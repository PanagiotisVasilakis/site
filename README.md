# QR City Guide

This README is intentionally concise and points to the canonical runbooks.

## Setup and Runtime

For complete setup and run instructions (development, test, production), use:

- [scripts/README.md](scripts/README.md)

## Use Flows

The guest portal uses the localized `/{locale}/guest` entry point. Operational
setup and the available guest/admin commands are documented in
[scripts/README.md](scripts/README.md).

## Deployment and Operations

- [Database CI](docs/ci/db-tests.md)
- [Database lookup testing](docs/testing/db-lookup.md)
- [Security and secret handling](SECURITY.md)

## Coverage Badge Endpoint

The route `/api/coverage` returns Shields.io style JSON computed from `coverage/lcov.info`. Run `npm run test:coverage` before build/deploy to refresh coverage values.

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
