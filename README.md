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
npm run system:up
```

`ensure-pepper` writes the local `.env.local` (docker-compose `DATABASE_URL` and development secrets), so no manual copy of `.env.example` is needed. The development orchestrator validates the environment, provisions a local PostgreSQL fallback when needed, applies migrations, starts the app, and verifies readiness plus a localized page. See [scripts/README.md](scripts/README.md) for the complete runbook.

## Release verification

```bash
npm run verify:release
```

This repository-owned command is the mandatory local gate for a commit that may later become a production release. It includes static policy, integrity, test, lint, real disposable-PostgreSQL, and production-format build checks. It requires local Docker, performs no deployment or persistent migration, and is not centrally enforced. See [Release verification](docs/release-verification.md) and [Testing strategy](docs/testing.md).

## Operations

Production runs three immutable Docker images of one commit (web, workers, migrate) on the VPS behind the pinned Nginx container (host network) (see the [deployment target](docs/architecture/deployment-target.md)); the host orchestrator is a local development helper only. The production workers are the `outbox` and `operations` one-off services of `docker/docker-compose.prod.yml`, run by host timers (see "Worker schedule" in [scripts/README.md](scripts/README.md)):

- a one-minute leased outbox drain for check-in webhooks;
- a five-minute operational alert, retention and Booking.com calendar sync run (the calendar itself is fetched at most every 30 minutes).

`npm run outbox:drain` and `npm run operations:check` run the same workers in development only.

Production startup never loads `.env.local` and requires an explicit trusted-proxy topology. Secrets are injected at runtime from root-owned VPS configuration.

Production runs as non-root containers built from `docker/Dockerfile.security`. `NEXT_PUBLIC_SITE_URL=https://your-host.example npm run docker:build` builds three images of one commit (`scripts/docker-build.sh`): the web runtime `villa-app:<first 12 hex of the commit>`, the workers `…-workers` (both operational workers bundled by `scripts/build-workers.mjs`, no checkout or `node_modules` inside) and `…-migrate` (the Prisma CLI from its own lockfile in `docker/migrate/`, plus this commit's migrations). The tag carries `-dirty` when the working tree has uncommitted changes; the HTTPS site URL is required because Next.js compiles canonical URLs and the sitemap into the output, and the commit is recorded in `public/version.json` and the `org.opencontainers.image.revision` label.

## Design system

The visual identity and its implementation spec are in [docs/design/identity.md](docs/design/identity.md). Global CSS is `src/app/globals.css`: Tailwind, then `src/styles/tokens.css`, `base.css`, `motion.css` and the component sheets in `src/styles/components/`; there are no legacy style sheets. Every CSS animation is behind the motion gate (`data-motion="full"` and `prefers-reduced-motion: no-preference`, checked by `tests/unit/motion-css-gate.test.ts`). Fonts are self-hosted woff2 files in `src/app/fonts/`. Committed design assets are regenerated with `npm run design:hero` (hero crops, depth maps, grain), `npm run design:og` (Open Graph cards in `public/og/`) and `npm run design:icons` (app icons and favicon).

## Open owner inputs

Status on 2026-10-21:

- still open: which Booking.com link to publish (the Share link in the code or the canonical property URL; only a `https://www.booking.com/Share-<token>` link, or the same on `booking.com`, passes `isBookingComListingUrl` in `src/lib/contactLinks.ts`, so a canonical property URL also needs a change of that function and of `tests/unit/contact-links.test.ts`, otherwise the Booking.com button disappears from the home, apartment and availability pages and the site shows no error), the owner's wording for Booking.com bookings (the "how to book" step makes no payment or confirmation claim until then), the Booking.com export URL (`BOOKING_ICAL_URL`: a secret that the owner creates in the Booking.com extranet with booked and closed dates and sets in the production environment; until it is set no calendar is shown) and the legal questions on the privacy notice. The privacy notice (`src/i18n/domains/legal.ts`) names Booking.com everywhere since 2026-10-21 (changed with the owner's permission; `git grep -n -i 'air[b]nb' -- src/i18n/domains/legal.ts` prints nothing). Whether the notice must list Booking.com as a recipient at all and as a source of the booking data, and what tax law needs for the unlinked booking rows, stay with the owner or a lawyer.
- awaiting the owner's confirmation: the accented Greek spelling of the host's name (`HOST_CONTACT.legalName` in `src/data/contact.ts`; the owner typed it without accents);
- settled and recorded where they apply: the host's name, address and ΑΜΑ, and that ΑΦΜ and ΓΕΜΗ are not shown (`HOST_CONTACT` in `src/data/contact.ts`); the Booking.com listing link (`BOOKING_COM_LISTING_URL`); no published price, total, fee line or cancellation policy; Booking.com as the only channel and the only calendar source (`BOOKING_ICAL_URL`); the hostess's name is not published (`HOST_PROFILE.name` stays empty); 12 months of guest-data retention (`GUEST_DATA_RETENTION_MONTHS`).

## Documentation

- [Selected deployment target](docs/architecture/deployment-target.md)
- [Release verification](docs/release-verification.md)
- [Production-image smoke](docs/deployment/production-image-smoke.md)
- [Trusted ingress contract](docs/security/trusted-ingress.md) and [origin runbook](docs/deployment/origin-ingress-runbook.md)
- [Layered rate-limiting contract](docs/security/layered-rate-limiting.md)
- [Booking claim-token transport](docs/security/claim-token-transport.md)
- [Runtime credential contract](docs/security/runtime-credential-contract.md)
- [Setup and runtime](scripts/README.md)
- [Visual identity and design system](docs/design/identity.md)
- [Testing strategy](docs/testing.md)
- [Secret handling and incident response](SECURITY.md)
