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

This repository-owned command is the mandatory local gate for a commit that may later become a production release. It includes static policy, integrity, test, lint, real disposable-PostgreSQL, and production-format build checks. It requires local Docker, performs no deployment or persistent migration, and is not centrally enforced. See [Release verification](docs/release-verification.md) and [Testing strategy](docs/testing.md). Optional browser audits remain available through `audit:a11y`, `audit:responsive:ux` and `audit:vitals`; they are advisory, run against a local server only, and refuse non-loopback URLs.

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

Owner inputs (status on 2026-10-21):

- supplied by the owner on 2026-10-14: the address and ΑΜΑ (`HOST_CONTACT` in `src/data/contact.ts`) and the Booking.com listing link (`BOOKING_COM_LISTING_URL`);
- supplied by the owner on 2026-10-15: the host's name, «Παναγιώτης Βασιλάκης / Panagiotis Vasilakis» (`HOST_CONTACT.legalName`: one string in both scripts, shown in the footer, in the apartment and availability page heads and in the controller list of the privacy notice; the owner typed it without accents, so the standard accented Greek spelling is used and awaits the owner's confirmation); that the nightly prices are final but are not published (the public site shows no price, total, fee line or cancellation policy, and the cancellation rule of 2026-10-14 is withdrawn); and that, for now, the owner uses only Booking.com. The host is a private individual and «Dolce Far Niente» is only the brand, so the ΑΦΜ and a ΓΕΜΗ number are deliberately not shown;
- supplied by the owner on 2026-10-20: that Booking.com is the only channel on the site and the only calendar source (the Booking.com iCal export with booked and closed dates, `BOOKING_ICAL_URL`); that the hosts are the owner's mother, who writes the home letter, and the owner, so the feminine host texts stay and her name is not published (`HOST_PROFILE.name` stays empty); and that 12 months of guest-data retention are enough (`GUEST_DATA_RETENTION_MONTHS` = 12, unchanged);
- still open:
  - which Booking.com link to publish (the Share link in the code or the canonical property URL; only a `https://www.booking.com/Share-<token>` link, or the same on `booking.com`, passes `isBookingComListingUrl` in `src/lib/contactLinks.ts`, so a canonical property URL also needs a change of that function and of `tests/unit/contact-links.test.ts`, otherwise the Booking.com button disappears from the home, apartment and availability pages and the site shows no error);
  - the owner's wording for Booking.com bookings (the "how to book" step makes no payment or confirmation claim until then);
  - the Booking.com export URL (`BOOKING_ICAL_URL`: a secret that the owner creates in the Booking.com extranet with booked and closed dates and sets in the production environment; until it is set no calendar is shown);
  - the legal questions on the privacy notice. The notice (`src/i18n/domains/legal.ts`) names Booking.com everywhere since 2026-10-21 (changed with the owner's permission; `git grep -n -i 'air[b]nb' -- src/i18n/domains/legal.ts` prints nothing). Five questions stay with the owner or a lawyer: (1) whether the notice must list Booking.com as a recipient at all; (2) its role as a controller and as a source of the booking data; (3) international transfers; (4) what tax law needs for the unlinked booking rows; (5) the controller entry. Drafted but unapplied wording for the other privacy findings (arrival notifications and the copy in the notification service, what remains after an erasure, server logs and backups, cookies and browser storage) is in [docs/privacy/proposed-notice-changes.md](docs/privacy/proposed-notice-changes.md);
  - the GDPR operating inputs that only the owner can supply, marked `<OWNER: ...>` in [docs/privacy/](docs/privacy/README.md): the name and country of the arrival-notification service and the rule for its copy of the guests' data, the data processing agreements (hosting provider, Cloudflare, notification service, backup provider), the backup provider and its retention, the retention that has no end today (erasure records, arrival-request rows without contact data, the Nginx access log, container logs), and the contacts for an incident;

## Documentation

- [Selected deployment target](docs/architecture/deployment-target.md)
- [Release verification](docs/release-verification.md)
- [Production-image smoke](docs/deployment/production-image-smoke.md)
- Launch and operation of the VPS: [day-0 runbook](docs/deployment/day-0-runbook.md), [backup and restore](docs/deployment/backup-and-restore.md), [monitoring and alerting](docs/deployment/monitoring-and-alerting.md), [Cloudflare checklist](docs/deployment/cloudflare-checklist.md); the host scripts and env templates are in [deploy/host/](deploy/host/README.md)
- [Trusted ingress contract](docs/security/trusted-ingress.md) and [origin runbook](docs/deployment/origin-ingress-runbook.md)
- [Layered rate-limiting contract](docs/security/layered-rate-limiting.md)
- [Booking claim-token transport](docs/security/claim-token-transport.md)
- [Runtime credential contract](docs/security/runtime-credential-contract.md)
- [Privacy operating documents](docs/privacy/README.md): [data subject requests](docs/privacy/dsar-runbook.md), [breach runbook](docs/privacy/breach-runbook.md), [record of processing](docs/privacy/record-of-processing.md), [processors](docs/privacy/processors.md), [proposed notice changes](docs/privacy/proposed-notice-changes.md)
- [Host handbook](docs/operations/host-handbook.md)
- [Adding a licensed guide photo](docs/operations/guide-photos.md)
- [Setup and runtime](scripts/README.md)
- [Visual identity and design system](docs/design/identity.md)
- [Testing strategy](docs/testing.md)
- [Secret handling and incident response](SECURITY.md)
