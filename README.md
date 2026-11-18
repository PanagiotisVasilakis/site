# Kalamata Guest Guide

Localized Next.js guest guide, public availability page, and authenticated guest check-in portal backed by PostgreSQL and Prisma.

## Core flows

- Public site: locale-prefixed pages under `/en` and `/el`: home, apartment, availability, the Kalamata guide (`/moments`, `/phones`, favourites) and the privacy notice. The guide map uses CARTO basemaps when `CARTO_BASEMAPS_KEY` is set and the standard OpenStreetMap tiles otherwise; there are no travel-time estimates.
- Availability: `/en/availability` and `/el/availability` show the free nights and the nights that are not available (booked or closed) from the Booking.com calendar export (`BOOKING_ICAL_URL`, a secret URL that the owner creates in the Booking.com extranet with booked and closed dates, synced server-side by the operations worker at most every 30 minutes or manually from the admin) and apply the minimum stay of the administrator's rate periods. The public site shows no price, total or cancellation policy (owner decision of 2026-10-15): the administrator still enters a final price per night in each rate period, but it is only stored and the public read never selects it. There is no booking form: guests book on Booking.com (`BOOKING_COM_LISTING_URL` in `src/data/contact.ts`, a public link, not a secret; shown only while the link is valid), or call or message the host on WhatsApp. Without a fresh calendar (the export URL unset, or no successful sync within 12 hours) the page shows a notice and the contact options instead of the calendar.
- In-stay hub: `/en/stay` and `/el/stay` (not indexed) gather the guest portal and check-in links (when those features are enabled; Wi-Fi and check-out unlock after sign-in), important phones with `112`, the guide and favourites, with no booking call-to-action.
- Guest access: an administrator issues a short-lived, one-time booking claim token. The guest claims the booking with a phone number and password; later sign-ins use those credentials.
- Sessions: short-lived guest/admin cookies, server-side session records, rotating refresh-token families, absolute expiry, logout revocation, and replay detection.
- Check-in requests: persisted with transactional outbox notifications for creation and status changes.
- Operations: database-backed security audit events, alert rules, privacy (erasure) requests, retention (`GUEST_DATA_RETENTION_MONTHS` = 12), the Booking.com calendar sync, and retry workers.

Legacy phone plus surname/document verification is intentionally not part of the supported authentication flow.

## Quick start

Use Node 22.19 and npm 11.18, then:

```bash
npm ci
npm run ensure-pepper
npm run db:start
npm run db:migrate
npm run dev
```

`ensure-pepper` writes the local `.env.local` (docker-compose `DATABASE_URL` and development secrets), so no manual copy of `.env.example` is needed. For routes requiring verified client identity in development, run `npm run dev:proxy` alongside `npm run dev` and open `http://localhost:3001`. See [scripts/README.md](scripts/README.md) for the complete runbook.

## Local verification

```bash
npm run validate:local
npm run test:integration
```

`validate:local` runs TypeScript typechecking, ESLint (`--max-warnings=0`), coverage-enforced Vitest tests, and security/build validation. `test:integration` runs the disposable PostgreSQL 16 integration suite (requires local Docker). See [Testing strategy](docs/testing.md).

## Operations

Production runs a single unified non-root Docker image built from `docker/Dockerfile.security` (`NEXT_PUBLIC_SITE_URL=https://your-host.example npm run docker:build`, tagged by `scripts/image-tag.sh` as `villa-app:<first 12 hex of the commit>`). The image contains both the standalone Next.js web server (`scripts/start-standalone.mjs server.js`) and the bundled operational workers under `/app/dist/workers/` (`drain-outbox.mjs` and `run-operational-maintenance.mjs`, bundled by `scripts/build-workers.mjs`):

- a one-minute leased outbox drain for check-in webhooks (`node dist/workers/drain-outbox.mjs`);
- a five-minute operational alert, retention and Booking.com calendar sync run (`node dist/workers/run-operational-maintenance.mjs`; the calendar itself is fetched at most every 30 minutes).

`npm run outbox:drain` and `npm run operations:check` run the same workers in development only.

Production startup never loads `.env.local` and requires an explicit trusted-proxy topology. Secrets are injected at runtime from the deployment environment. The tag carries `-dirty` when the working tree has uncommitted changes; the HTTPS site URL is required because Next.js compiles canonical URLs and the sitemap into the output, and the commit is recorded in `public/version.json` and the `org.opencontainers.image.revision` label.

## Design system

The visual identity and its implementation spec are in [docs/design/identity.md](docs/design/identity.md). Global CSS is `src/app/globals.css`: Tailwind, then `src/styles/tokens.css`, `base.css`, `motion.css` and the component sheets in `src/styles/components/`. Every CSS animation is behind the motion gate (`data-motion="full"` and `prefers-reduced-motion: no-preference`, checked by `tests/unit/motion-css-gate.test.ts`). Fonts are self-hosted woff2 files in `src/app/fonts/`. Committed design assets are regenerated with `npm run design:hero` (hero crops, depth maps, grain), `npm run design:og` (Open Graph cards in `public/og/`) and `npm run design:icons` (app icons and favicon).

## Open owner inputs

- **Still open (`src/data/contact.ts`, `src/i18n/domains/legal.ts`):** confirm whether to publish the current Booking.com Share link (`BOOKING_COM_LISTING_URL`, which must pass `isBookingComListingUrl` in `src/lib/contactLinks.ts` alongside a matching check in `tests/unit/core-utilities.test.ts`), confirm owner wording for Booking.com reservations, set the secret `BOOKING_ICAL_URL` in production, and obtain final legal review for the privacy notice (`src/i18n/domains/legal.ts`).
- **Settled:** `HOST_CONTACT` (`legalName`, `address`, `registrationNumber` ΑΜΑ; ΑΦΜ and ΓΕΜΗ intentionally omitted), `HOST_PROFILE` (`name`, `languages`, `replyTime` intentionally blank), no public nightly pricing or cancellation policy, Booking.com as the single external listing/iCal source, and 12-month guest-data retention (`GUEST_DATA_RETENTION_MONTHS`).

## Documentation

- [Trusted ingress contract](docs/security/trusted-ingress.md)
- [Layered rate-limiting contract](docs/security/layered-rate-limiting.md)
- [Booking claim-token transport](docs/security/claim-token-transport.md)
- [Runtime credential contract](docs/security/runtime-credential-contract.md)
- [Setup and runtime](scripts/README.md)
- [Visual identity and design system](docs/design/identity.md)
- [Testing strategy](docs/testing.md)
- [Secret handling and incident response](SECURITY.md)
