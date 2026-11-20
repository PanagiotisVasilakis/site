# Setup and runtime runbook

## Requirements

- Node.js >= 22.19 (22.19.x tested, `.nvmrc`)
- npm 11.18.x
- PostgreSQL 16+, or Docker for a disposable development database
- macOS or Linux shell

Verify the active shell, because `.nvmrc` does not switch Node automatically:

```bash
node --version
npm --version
```

## First-time development setup

```bash
npm ci
npm run ensure-pepper
npm run db:start
npm run db:migrate
npm run dev
```

`ensure-pepper` creates or completes `.env.local` with local development values only: the docker-compose `DATABASE_URL` (`devuser`/`devpass` on port 5433 unless `POSTGRES_*` are set) and development secrets. It never overwrites an existing value and never generates or edits production secrets.

Environment loading order:

- development: `.env.development.local`, `.env.local`, `.env.development`, `.env` (dotenv, same precedence as `next dev`)
- production: the image contains no `.env*` files (`.dockerignore`), so configuration comes only from injected runtime environment variables.

## Sensitive routes in development

Admin login, guest sign-in and claims, error and CSP reports
resolve the client identity only from the two private headers that the trusted
edge proxy sets in production (see [Trusted ingress contract](../docs/security/trusted-ingress.md)). A browser
cannot send them, so `next dev` alone answers `503 Service temporarily
unavailable` on those routes, and the server logs
`Client identity unavailable; request rejected before persistence` with the
bounded reason.

Run the local stand-in for the trusted proxy hop next to the dev server:

```bash
npm run ensure-pepper   # adds a local 64-hex ORIGIN_PROXY_SHARED_SECRET if missing
npm run dev             # terminal 1: next dev on :3000
npm run dev:proxy       # terminal 2: loopback proxy on :3001
```

Then open `http://localhost:3001`. The proxy (`scripts/dev-proxy.mjs`) drops
any client-supplied private headers, adds the attestation and the socket peer
address, forwards HTTP and HMR WebSocket traffic, and refuses to run with
`NODE_ENV=production`. Use `localhost`, not `127.0.0.1`: `next dev` blocks its
development resources for other hosts, and pages would not hydrate.

## Required runtime configuration

The authoritative schema is `src/lib/runtime-env-schema.js`; `scripts/start-standalone.mjs` validates the environment before it loads `server.js` and exits 78 on a schema failure. Required for the application:

- `DATABASE_URL`, without an `options` query parameter: the application pins every database session to `TimeZone=UTC` through the PostgreSQL `options` startup parameter (`src/lib/prismaPgConfig.ts`), and node-postgres lets an `options` value in the URL replace that pin
- independently generated `ADMIN_JWT_SECRET`, `ADMIN_DASH_SECRET`, and
  `GUEST_JWT_SECRET` (the schema requires them only when `NODE_ENV` is `production`)
- `SECURITY_PEPPER` (at least 16 characters) and `CLAIM_TOKEN_PEPPER` (at least 32 characters); use `openssl rand -hex 32` for both (`npm run ensure-pepper` generates 64 hex characters for each locally). Neither falls back to the other or to a built-in value
- in production, start-up also rejects (exit 78) a `SECURITY_PEPPER` or `CLAIM_TOKEN_PEPPER` that is a repeated pattern, contains `replace`, `changeme`, `placeholder` or `example` (any case), or equals `ADMIN_JWT_SECRET`, `GUEST_JWT_SECRET` or `ADMIN_DASH_SECRET`; the two peppers are not compared with each other
- `GUEST_WIFI_NETWORK`, `GUEST_WIFI_PASSWORD`

Production additionally requires:

- `ORIGIN_PROXY_SHARED_SECRET`, generated with `openssl rand -hex 32` and injected into both the edge proxy (e.g. Cloudflare Transform Rule) and the application
- no external limiter variables: authoritative sensitive-operation limits use
  PostgreSQL and verified ingress identity. Edge WAF/CDN provides coarse
  protection; see [Layered rate-limiting contract](../docs/security/layered-rate-limiting.md).

If the check-in webhook URL is configured, its token is mandatory;
production webhook URLs must use HTTPS.

Optional `BOOKING_ICAL_URL` is the Booking.com calendar export iCal URL (a secret tokenised link created in the Booking.com extranet covering both bookings and closures; usually `https://ical.booking.com/v1/export?t=<token>`, or legacy `https://admin.booking.com/hotel/hoteladmin/ical.html?t=<token>`). Without it, `/[locale]/availability` shows a notice and contact options instead of a calendar. It is a secret (the `t` query parameter is a token): set it only in the production environment, never in `.env.local`, and never commit or log it. Set it in production only after the privacy notice (`src/i18n/domains/legal.ts`) names Booking.com everywhere: `git grep -n -i 'air[b]nb' -- src/i18n/domains/legal.ts` must print nothing.

- **Validation rule:** Production start-up (`scripts/start-standalone.mjs`, exit 78 on failure) and runtime fetch redirects require `https:`, default port, no userinfo, a non-empty `t`/query, and either `ical.booking.com` (`/v1/export`) or `admin.booking.com` (`/hotel/hoteladmin/ical.html`).
- **Safe local shape check (prints fixed labels only, never the secret):**

  ```bash
  printf 'Paste the link and press Enter: '; read -rs U; printf '\n'
  U="$U" node -e 'let u; try { u = new URL(process.env.U) } catch { console.log("not an absolute URL"); process.exit(1) } const P = { "ical.booking.com": "/v1/export", "admin.booking.com": "/hotel/hoteladmin/ical.html" }; const known = Object.hasOwn(P, u.host); console.log([u.protocol === "https:" ? "https:" : "other-protocol", known ? u.host : "other-host", known && P[u.host] === u.pathname ? u.pathname : "other-path", u.searchParams.get("t") ? "t" : "no-t", ...(u.username || u.password ? ["USERINFO"] : [])].join(" "))'
  unset U
  ```

Optional `LOG_LEVEL` accepts `trace`, `debug`, `info`, `warn` or `error`; the production start-up validation (`scripts/start-standalone.mjs`) rejects any other value, including `fatal`.

Never place secrets in `NEXT_PUBLIC_*` variables.
See [Runtime credential contract](../docs/security/runtime-credential-contract.md) for production strength,
isolation, startup, and rotation requirements.

## Local verification

Run the local verification suite with:

```bash
npm test
npm run test:coverage
npm run typecheck
npm run lint -- --max-warnings=0
npm run check:dead-code
npm run check:image-assets
npm run security:license-check
npm run validate:security
npm run validate:local
npm run test:integration
```

`npm run dev` runs `scripts/check-pepper.js` automatically (`predev`), `npm run build` runs `scripts/validate-content.ts` and `scripts/generate-version.ts`, and `npm run start` runs `scripts/prepare-standalone.mjs` (`prestart`).

The default suite does not contact a live PostgreSQL, webhook, or third-party
API. `test:integration` is the isolated exception: it owns a digest-pinned
disposable PostgreSQL container and synthetic databases. See [Testing strategy](../docs/testing.md).

Committed design assets are regenerated with `npm run design:hero` (hero crops, depth maps, grain tiles), `npm run design:og` (the Open Graph cards in `public/og/`) and `npm run design:icons` (app icons and favicon); see [Visual identity](../docs/design/identity.md).

## Production

Production runs the unified immutable image built from `docker/Dockerfile.security` (`target: runner`).

**Building and scanning one release commit.** From a clean checkout of the approved SHA:

```bash
NEXT_PUBLIC_SITE_URL=https://your-host.example npm run docker:build   # builds villa-app:<sha>
npm run docker:scan                                                    # pinned Trivy container, else host Trivy or Docker Scout
```

`docker:build` refuses a tree with uncommitted changes. `ALLOW_DIRTY=1` builds a local trial image tagged `-dirty` whose recorded commit does not match its contents: never ship it. Record the image ID that `docker:build` prints.

**Applying migrations.** The image contains neither the Prisma CLI nor the migrations, so it cannot migrate its database. When a release adds a migration, apply it before you start the new image: from a checkout of the same commit, after `npm ci`, run `npx prisma migrate deploy` with the production database URL exported in the shell as `DIRECT_URL`. `prisma.config.ts` uses `DIRECT_URL` before `DATABASE_URL` and also loads the checkout's `.env*` files without overriding exported variables, so a `DIRECT_URL` from a `.env*` file wins over an exported `DATABASE_URL`. Until it is applied, `/api/health/ready` answers 503 with `{"status":"not_ready"}` and the server logs `Readiness: expected migration is not applied`.

**Feature flags after the first migrate.** A database migrated from empty has the
guest portal and check-in switched on: the migration
`20260714090000_comprehensive_remediation` seeds the `feature_flags` setting with
both flags `true`, and the production default of off applies only when that row is
missing. Switch them off in `/admin/settings` right after startup if the
launch should be dark.

## Operational workers

In production the workers are bundled by `npm run build:workers` (`scripts/build-workers.mjs`) into `/app/dist/workers/` inside the unified production image:
- `node dist/workers/drain-outbox.mjs` (scheduled every 1 minute)
- `node dist/workers/run-operational-maintenance.mjs` (scheduled every 5 minutes)

In development you can run `npm run outbox:drain` / `npm run operations:check` (when env vars are already exported in the shell) or pass `.env.local` explicitly with `tsx --env-file`:

```bash
npx tsx --env-file=.env.local scripts/drain-outbox.ts
npx tsx --env-file=.env.local scripts/run-operational-maintenance.ts
```

`--env-file` reads only the file it names: it does not apply the
`.env.development.local` and `.env` precedence of `next dev`, and a variable already
set in the shell takes precedence over the file.

Both exit when their run finishes: they disconnect Prisma explicitly, which is
what lets the process exit (idle pool connections would otherwise keep it alive
for up to 300 s).

The outbox worker uses bounded attempts, exponential backoff, leases, abandoned-lease recovery, and a terminal `DEAD` state. The operations worker first syncs the Booking.com calendar (reservations and closures alike) when `BOOKING_ICAL_URL` is set (a scheduled fetch at most every 30 minutes, backing off up to 45 minutes after repeated failures; the admin can also start one manually, at most once a minute), and only then evaluates database alert rules, retries failed alert notifications and applies retention, so the stale-calendar alert reads the state the same run leaves behind. A scheduled sync can fail with `empty_feed` (keeping the stored snapshot) when the calendar has no blocked nights from today on but the snapshot still has some; "Sync now" accepts a genuinely empty calendar. The "Stale availability calendar" alert opens after three hours without a successful sync. A missing required alert webhook makes the operations run fail. A `DEAD` event opens the "Dead outbox events" alert until it is handled: "Retry notification" (arrival requests) requeues it, and retention deletes it after 30 days. Events cancelled by a guest erasure are `DEAD` by design; they never open the alert and are deleted on the next operations run.

Guest data retention (`GUEST_DATA_RETENTION_MONTHS` in `src/data/stayPolicy.ts`, 12 months after the booking end date; confirmed by the owner on 2026-10-20): each operations run clears the name, e-mail, phone and message of check-in requests whose booking ended that long ago, and erases, through the same audited path as the admin "Erase guest" action (privacy request with an automatic-retention note, `privacy.erasure.completed` audit event), up to 25 guest accounts whose every booking ended that long ago. Bookings stay, unlinked, with their platform reservation code. An erasure, by the admin or by retention, also sets the guest's pending arrival request to REJECTED; the request keeps its booking link, so the booking can receive a new request. Each erasure re-checks the cutoff inside its transaction, so a guest who claims a new booking between selection and erasure is skipped (counted as `guestErasuresSkipped`) and keeps the account. A failed erasure makes the run fail after the rest of the batch has been attempted.

## Troubleshooting

- Version error: switch the active shell to Node 22.19/npm 11.18 and reinstall with `npm ci`.
- A style sheet newly `@import`ed into `src/app/globals.css` is missing from a local `npm run build`: a stale Turbopack cache can drop it. Delete `.next/cache/turbopack` before the build whenever a change adds such an import. Docker builds start without `.next` (`.dockerignore`), so they are not affected.
- Readiness fails (503): the web log names the cause in one warn line: `Readiness: database check failed` (the check threw: no SQL connection, a statement timeout, no `_prisma_migrations` table because the database was never migrated (run `prisma migrate deploy`), or no privilege to read that table; the line carries only the error name, so run the readiness query of `src/app/api/health/ready/route.ts` by hand as the application's database role to see which), `Readiness: expected migration is not applied` (run `prisma migrate deploy`), or `Readiness: database schema is newer than this image` (a newer migration is applied; deploy the image that ships it). Liveness alone does not prove the app is ready.
- Production proxy validation fails: verify the edge transform rule / proxy
  header overwrite and private attestation contract; do not trust a
  public forwarding header directly.
- Outbox backlog: inspect `outbox_events.last_error`, the destination URL/token, and the outbox worker logs.
- `next dev` or `next build` run by a coding agent may send the installed Next version to `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk` and stop once with an upgrade recommendation when an advisory applies (`experimental.agentUpgrade` defaults to `'security'` since Next 16.4.0; `next.config.ts` leaves it at the default). Retry the same command, or run the build from a plain shell. Docker builds are not affected.
