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
npm run system:up
```

`ensure-pepper` creates or completes `.env.local` with local development values only: the docker-compose `DATABASE_URL` (`devuser`/`devpass` on port 5433 unless `POSTGRES_*` are set) and development secrets. It never overwrites an existing value and never generates or edits production secrets.

Environment loading order:

- development: `.env.development.local`, `.env.local`, `.env.development`, `.env` (dotenv, same precedence as `next dev`)
- production: the images contain no `.env*` files (`.dockerignore`), so the configuration comes only from `APP_ENV_FILE` / `MIGRATE_ENV_FILE`.

## Sensitive routes in development

Admin login, guest sign-in and claims, error and CSP reports
resolve the client identity only from the two private headers that Nginx
overwrites in production (see `docs/security/trusted-ingress.md`). A browser
cannot send them, so `next dev` alone answers `503 Service temporarily
unavailable` on those routes, and the server logs
`Client identity unavailable; request rejected before persistence` with the
bounded reason.

Run the local stand-in for the Nginx hop next to the dev server:

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
  `GUEST_JWT_SECRET`
- `SECURITY_PEPPER` (at least 16 characters) and `CLAIM_TOKEN_PEPPER` (at least 32 characters); use `openssl rand -hex 32` for both (`npm run ensure-pepper` generates 64 hex characters for each locally). Neither falls back to the other or to a built-in value
- in production, start-up also rejects (exit 78) a `SECURITY_PEPPER` or `CLAIM_TOKEN_PEPPER` that is a repeated pattern, contains `replace`, `changeme`, `placeholder` or `example` (any case), or equals `ADMIN_JWT_SECRET`, `GUEST_JWT_SECRET` or `ADMIN_DASH_SECRET`; the two peppers are not compared with each other
- `GUEST_WIFI_NETWORK`, `GUEST_WIFI_PASSWORD`

Production additionally requires:

- `ORIGIN_PROXY_SHARED_SECRET`, generated with `openssl rand -hex 32` and injected into both Nginx and the application
- no external limiter variables: authoritative sensitive-operation limits use
  PostgreSQL and verified ingress identity. Cloudflare and Nginx provide coarse
  protection; see `docs/security/layered-rate-limiting.md`.

If the check-in webhook URL is configured, its token is mandatory;
production webhook URLs must use HTTPS.

Optional `BOOKING_ICAL_URL` is the Booking.com calendar export URL (iCal), the only source of the availability calendar: the owner creates it in the Booking.com extranet with booked and closed dates and copies the link (public guides show `https://ical.booking.com/v1/export?t=<token>` and an older form `https://admin.booking.com/hotel/hoteladmin/ical.html?t=<token>`). It is read server-side only by the calendar sync (see "Operational workers"); without it the availability page shows no calendar, only a notice and the contact options. A reservation and a closed date are not told apart: both show as booked, and only dates are stored. It is a secret (the `t` query parameter is a token): set it only in the production environment (the root-owned runtime configuration file that `APP_ENV_FILE` names), never in `.env.local`, and never commit or log it. The schema accepts only https on the default port, no userinfo, a non-empty query, and exactly these host and path pairs: `ical.booking.com` with `/v1/export`, `admin.booking.com` with `/hotel/hoteladmin/ical.html`; the fetch applies the same check to the start URL and to every redirect. A set value that the schema rejects stops the web container at start-up (exit 78; the message names the variable and never the value), and `restart: unless-stopped` repeats that until the line is fixed. So print the shape of the link before adding it, on any computer with Node.js 22 and without writing the link to a file: `printf 'Paste the link and press Enter: '; read -rs U; printf '\n'; U="$U" node -e 'let u; try { u = new URL(process.env.U) } catch { console.log("not an absolute URL"); process.exit(1) } const P = { "ical.booking.com": "/v1/export", "admin.booking.com": "/hotel/hoteladmin/ical.html" }; const known = Object.hasOwn(P, u.host); console.log([u.protocol === "https:" ? "https:" : "other-protocol", known ? u.host : "other-host", known && P[u.host] === u.pathname ? u.pathname : "other-path", u.searchParams.get("t") ? "t" : "no-t", ...(u.username || u.password ? ["USERINFO"] : [])].join(" "))'; unset U` must print `https: ical.booking.com /v1/export t` or `https: admin.booking.com /hotel/hoteladmin/ical.html t`; any other output means that the link is not the expected export link: `other-protocol`, `other-host`, `other-path`, `USERINFO` or `not an absolute URL` would stop the web container at start-up, and `no-t` shows that the link has no non-empty `t` parameter, the token (the start-up check only requires a non-empty query). The command prints only fixed words: the protocol, the host and the path only when they are the expected ones (otherwise `other-protocol`, `other-host` or `other-path`), `t` or `no-t`, `USERINFO`, or `not an absolute URL`; it never prints any other part of the link. After the edit run `docker compose -f docker/docker-compose.prod.yml up -d --wait web`; if web does not become healthy, `docker compose -f docker/docker-compose.prod.yml logs --tail 20 web` names the rejected variable: delete the `BOOKING_ICAL_URL` line and run the same `up -d --wait web` again (the site then works without a calendar). Delete the retired calendar variable from the environment file: nothing reads it any more. Set `BOOKING_ICAL_URL` in production only after the privacy notice (`src/i18n/domains/legal.ts`) names Booking.com everywhere: `git grep -n -i 'air[b]nb' -- src/i18n/domains/legal.ts` must print nothing.

Optional `CARTO_BASEMAPS_KEY` (https://carto.com/basemaps/apikey/) is read server-side at request time and sent to browsers in the map tile URLs (CARTO Voyager in light, Dark Matter in dark); without it the map uses the standard OpenStreetMap tiles in both themes. It is public by design but should not be logged; restrict it to the site domain in the CARTO dashboard.

Optional `LOG_LEVEL` accepts `trace`, `debug`, `info`, `warn` or `error`; the production start-up validation (`scripts/start-standalone.mjs`) rejects any other value, including `fatal`.

Never place secrets in `NEXT_PUBLIC_*` variables.
See `docs/security/runtime-credential-contract.md` for the production strength,
isolation, startup, and rotation requirements.

## Orchestrator commands

```bash
npm run system:check
npm run system:up
npm run system:verify
npm run system:status
npm run system:logs
npm run system:down
```

`verify` requires all of the following: liveness, database-backed readiness, and a successfully served `/en` page. A `Ready` log line alone is not considered successful startup.

Development may start a disposable Docker database when the configured database is unreachable. The production Docker image has no fallback database and fails closed.

The orchestrator refuses a `DATABASE_URL` whose host is not `localhost`, `127.0.0.1` or `[::1]` unless `--allow-remote-db` is given, requires `DIRECT_URL` to be unset or equal to `DATABASE_URL` before it applies migrations, and never starts production services: it runs `npm run dev` and the development `docker-compose.yml` fallback.

## Local release verification

The repository intentionally has no GitHub Actions workflow. Run the complete mandatory local release gate with:

```bash
npm run verify:release
```

The command requires a local Docker daemon, fails on the first mandatory gate, and never deploys or migrates a persistent database. It is not centrally enforced and can be bypassed by a human; see [Release verification](../docs/release-verification.md).

Individual checks are also available:

```bash
npm test
npm run test:coverage
npm run typecheck
npm run lint -- --max-warnings=0
npm run lint:security
npm run check:dead-code
npm run validate:security
npm run validate:release-policy
npm run check:prisma-integrity
npm run check:postgres-image-policy
```

The default suite does not contact a live PostgreSQL, webhook, or third-party
API. `test:integration` is the isolated exception: it owns a digest-pinned
disposable PostgreSQL container and synthetic databases. `verify:release`
never targets a persistent environment. See [Testing strategy](../docs/testing.md)
and [Release verification](../docs/release-verification.md).

Optional browser audits are manual, advisory commands: `audit:a11y` (axe), `audit:responsive:ux` and `audit:vitals` (LCP, CLS, TBT and an INP proxy on a throttled mobile profile, for a local production build). They are local-only: each refuses a non-loopback base URL, and its headless browser can reach no other host.

Committed design assets are regenerated with `npm run design:hero` (hero crops, depth maps, grain tiles), `npm run design:og` (the Open Graph cards in `public/og/`) and `npm run design:icons` (app icons and favicon); see `docs/design/identity.md`.

## Production

Production runs the immutable images built from `docker/Dockerfile.security`
behind the pinned Nginx container (host network), as selected in
[the deployment target](../docs/architecture/deployment-target.md). The host
orchestrator above is a development helper and cannot target production. The
production compose file pins `NODE_ENV: production` on its `web`, `outbox` and
`operations` services, overriding any `NODE_ENV` in the env file. `web` also sets
`KEEP_ALIVE_TIMEOUT=65000`: Node closes an idle keep-alive connection after 5 s,
the Nginx upstream (`keepalive 32`, no `keepalive_timeout`) keeps one for its
default 60 s and would sporadically reuse a connection that Node just closed
(502), so keep the value above 60000 as long as Nginx stays at its default. The
image-optimizer tmpfs of `web` is capped at 256 MB (Next.js evicts at half of the
free space), and the stop grace periods are 30 s for `web` and 60 s for `db`
(PostgreSQL's fast shutdown ends with a checkpoint).
Backups, the live ingress evidence and the release approval are still open gaps
in that ADR; the mechanics below are what the repository provides.

**Artifacts of one release commit.** On the release host, from a clean checkout of
the approved SHA:

```bash
NEXT_PUBLIC_SITE_URL=https://localhost:3002 npm run docker:build      # smoke build, same tags, linux/amd64
DOCKER_DEFAULT_PLATFORM=linux/amd64 npm run smoke:image               # mandatory; stop on any FAIL
NEXT_PUBLIC_SITE_URL=https://your-host.example npm run docker:build   # villa-app:<sha>, -workers, -migrate, linux/amd64
npm run docker:scan                                                    # pinned Trivy container, else host Trivy or Docker Scout; all three
docker save villa-app:<sha> villa-app:<sha>-workers villa-app:<sha>-migrate | gzip > release-<sha>.tar.gz
```

`scripts/image-tag.sh` refuses nothing but marks an uncommitted tree with `-dirty`;
never ship such a tag. Record the three image IDs (and the platform) that
`docker:build` prints: the check on the VPS compares them.

**Platform.** Production is `linux/amd64` (the x86 VPS of
[the deployment target](../docs/architecture/deployment-target.md)), while the only
supported release host is an Apple-silicon Mac (`arm64`: the Gitleaks lock lists
`darwin-arm64` only). A native build there would produce arm64 images that fail on
the VPS with `exec format error` at the first `migrate`. So `npm run docker:build`
builds for `linux/amd64` by default whatever the Docker daemon's own architecture,
prints the platform, and exits 1 when `docker image inspect --format
'{{.Os}}/{{.Architecture}}'` of any of the three tags differs from it.
`DOCKER_BUILD_PLATFORM` (for example `linux/arm64`) overrides it for a local
experiment and prints a warning; never scan, save or ship such images. The amd64
build runs under emulation (QEMU, or Rosetta when Docker Desktop's "Use Rosetta for
x86_64/amd64 emulation" is on) and is much slower than a native one.
`NEXT_PUBLIC_SITE_URL` must be a bare https origin (`https://host[:port]`, at most
one trailing slash, no path, query, fragment or credentials); the script rejects
anything else without echoing it. The `NEXT_PUBLIC_SITE_URL` in `APP_ENV_FILE` must
be the identical string, because the web container refuses to start when it differs
from the URL compiled into the image.

`smoke:image` must run against these amd64 images. It hands its environment to
Compose unchanged, so `DOCKER_DEFAULT_PLATFORM=linux/amd64` makes Compose create
every service for amd64, the digest-pinned PostgreSQL image included (its amd64
variant is pulled from the registry the first time), and nothing silently falls back
to the native architecture. On Apple silicon the containers run emulated: the run is
slow, and the smoke's fixed waits (10 to 60 seconds) were tuned for a native run and
not measured under emulation. A pass is one complete run without any `FAIL`. A
`FAIL` whose reason is a timeout may come from the emulation: re-run once. If the same
check times out again, or any other check fails, investigate it as a defect; never
repeat the run until it goes green.

**Host layout.** `docker/docker-compose.prod.yml` is the only production
definition. `docker/.env` on the host (root-owned, mode `0600`, next to the compose
file, for example `/opt/qr-city-guide/docker/.env`) is the single source of truth
for every variable the file interpolates. Compose reads `.env` from the directory of
the file named by `-f`, not from the current directory, so the operator and the cron
entries below read the same file. Compose interpolates the whole file before it
selects a service, so each of these six is needed even for the `--no-deps` worker
runs (a missing one stops the run with `required variable ... is missing a value`):

- `APP_IMAGE` — the web image reference, e.g. `villa-app:0123456789ab`; the
  `-workers` and `-migrate` references derive from it;
- `APP_ENV_FILE` — root-owned file with the runtime configuration from
  "Required runtime configuration" above (`DATABASE_URL` uses host `db`);
- `MIGRATE_ENV_FILE` — root-owned file for `migrate deploy`, with the migration
  role's `DATABASE_URL` (least privilege: the application role must not own DDL);
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` for the bundled PostgreSQL.

Optional in the same file: `POSTGRES_PORT` (loopback port of the database, default
`5432`) and `WEB_PORT` (loopback port of the application, default `3000`).

Never `export` any of them in a shell or a profile. A variable in the shell
environment overrides `docker/.env`, so an `export APP_IMAGE=...` would change what
`$C` does for that shell only, while the timers (clean cron environment) keep
reading the old file and silently run the previous worker image after the release.
`env | cut -d= -f1 | grep -E '^(APP_IMAGE|APP_ENV_FILE|MIGRATE_ENV_FILE|POSTGRES_)'`
(names only) must print nothing in the operator's shell. Two shell definitions,
neither exported, are used in the commands below, which run from the directory that
holds `docker/`; `dbpsql` lets `psql` read `POSTGRES_USER` and `POSTGRES_DB` from the
`db` container's own environment (filled from `docker/.env`), so the shell needs
neither:

```bash
C="docker compose -f docker/docker-compose.prod.yml"
dbpsql() { $C exec db sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"; }
```

**Quoting in env files.** Compose interpolates the values of `docker/.env`,
`APP_ENV_FILE` and `MIGRATE_ENV_FILE`. In an unquoted or double-quoted value, `$name`
and `${name}` are replaced by the Compose variable of that name, or by nothing:
`ab$cd` reaches the container as `ab`, with a warning `The "cd" variable is not set`,
so a secret is silently shortened. In an unquoted value a space followed by `#` starts
a comment (`ab #cd` becomes `ab`); a `#` directly after a character is kept. Single
quotes keep a value literal (`'ab$cd #ef'`), and `$$` is a literal `$`. Prefer
secrets that need none of this: `openssl rand -hex 32` produces hex only, and the
database passwords should be hex too, because they also sit in `DATABASE_URL`. After
editing, both checks must pass; the second one alone would print `0` for a `config`
that failed outright (a missing variable, an unreadable env file) and does not
contain the text it looks for. The warning names the text after the `$`, so do not
paste its lines anywhere:

```bash
$C --profile ops config -q >/dev/null 2>&1 && echo config-ok   # must print config-ok
$C --profile ops config -q 2>&1 | grep -c 'is not set'         # must print 0
```

The bundled PostgreSQL creates only `POSTGRES_USER`. Create the two roles once,
as `POSTGRES_USER`, before the first `migrate` run, so that `_prisma_migrations`
and every table are created by the migration role and covered by the default
privileges (the password values come from the secret store). Open
`dbpsql -v ON_ERROR_STOP=1` and paste the script below with `<POSTGRES_DB>` replaced
in both places (`$C exec db printenv POSTGRES_DB` prints it). It has two
parts because `CREATE ROLE` is cluster-wide and `ALTER DATABASE` changes the
catalog entry, so the connected database does not matter for them, while
`ALTER DEFAULT PRIVILEGES` is per database and covers only objects that
`qr_migrator` creates later in the database it was run in: without the
`\connect`, run from another database (`postgres`, for instance), it succeeds
without effect on the application database, and `qr_app` then cannot read the
tables the first `migrate` creates.

```sql
CREATE ROLE qr_migrator LOGIN PASSWORD '<from secret store>';
CREATE ROLE qr_app LOGIN PASSWORD '<from secret store>';
-- PostgreSQL 15+ no longer grants PUBLIC CREATE on schema public; the database
-- owner owns that schema, so the migration role can create tables in it.
ALTER DATABASE <POSTGRES_DB> OWNER TO qr_migrator;

-- Per database: connect to the application database before the next two statements.
\connect <POSTGRES_DB>
ALTER DEFAULT PRIVILEGES FOR ROLE qr_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qr_app;
ALTER DEFAULT PRIVILEGES FOR ROLE qr_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO qr_app;
```

`MIGRATE_ENV_FILE` then uses `qr_migrator` and `APP_ENV_FILE` uses `qr_app`.

After the first `migrate` (and again after a release that adds tables), prove the
result in a `dbpsql` session (`POSTGRES_USER` on `POSTGRES_DB`). Check 1 must return
no rows, check 2 must show `tables` equal to `tables_app_can_read_write`,
`sequences` equal to `sequences_app_can_use` and `tables` above 0
(`_prisma_migrations` counts as a table), and check 3 must show `f`, `f`, `f`, `0`,
`t`:

```sql
-- Check 1: every object in schema public belongs to the migration role (no rows).
SELECT c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
  AND c.relowner <> 'qr_migrator'::regrole;
SELECT t.typname, pg_get_userbyid(t.typowner) AS owner
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype = 'e' AND t.typowner <> 'qr_migrator'::regrole;

-- Check 2: qr_app can read and write every table and use every sequence.
SELECT count(*) FILTER (WHERE c.relkind IN ('r', 'p')) AS tables,
       count(*) FILTER (WHERE c.relkind IN ('r', 'p')
         AND has_table_privilege('qr_app', c.oid, 'SELECT')
         AND has_table_privilege('qr_app', c.oid, 'INSERT')
         AND has_table_privilege('qr_app', c.oid, 'UPDATE')
         AND has_table_privilege('qr_app', c.oid, 'DELETE')) AS tables_app_can_read_write,
       count(*) FILTER (WHERE c.relkind = 'S') AS sequences,
       count(*) FILTER (WHERE c.relkind = 'S'
         AND has_sequence_privilege('qr_app', c.oid, 'USAGE')
         AND has_sequence_privilege('qr_app', c.oid, 'SELECT')) AS sequences_app_can_use
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public';

-- Check 3: qr_app has no DDL rights, the migration role has them (f, f, f, 0, t).
SELECT has_schema_privilege('qr_app', 'public', 'CREATE') AS app_can_create_in_public,
       has_database_privilege('qr_app', current_database(), 'CREATE') AS app_can_create_schema,
       (SELECT rolsuper OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = 'qr_app') AS app_has_role_powers,
       (SELECT count(*) FROM pg_class WHERE relowner = 'qr_app'::regrole) AS objects_owned_by_app,
       has_schema_privilege('qr_migrator', 'public', 'CREATE') AS migrator_can_create;
```

Then try the DDL as the application role; every command must fail and change
nothing (the `SET ROLE` ends with the session):

```bash
dbpsql -c 'SET ROLE qr_app; CREATE TABLE public.ddl_probe (id int);'                    # permission denied for schema public
dbpsql -c 'SET ROLE qr_app; ALTER TABLE public._prisma_migrations ADD COLUMN ddl_probe int;'  # must be owner of table _prisma_migrations
```

A non-empty check 1, or a `tables_app_can_read_write` below `tables`, means that the
default privileges were not in place when the tables were created (typically the
script ran without the `\connect`): run the two `ALTER DEFAULT PRIVILEGES`
statements in the application database and repair the existing objects as described
below before starting `web`, whose readiness check reads `_prisma_migrations` as
`qr_app`.

Default privileges apply only to objects created later. For a database already
migrated by another role, do both, in that database, before the first `migrate`:
`REASSIGN OWNED BY <old role> TO qr_migrator;` (tables including `_prisma_migrations`,
sequences, types, functions), then
`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO qr_app;` and
`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO qr_app;`.

PostgreSQL refuses `REASSIGN OWNED BY` for its bootstrap superuser
(`cannot reassign ownership of objects owned by role ... because they are required by the database system`),
and in the bundled PostgreSQL that superuser is `POSTGRES_USER`, usually the old
role. In that case change the owners one by one instead, in the same database:
`ALTER TABLE <table> OWNER TO qr_migrator;` for every table in schema `public`,
`_prisma_migrations` included (a sequence owned by a table column moves with its
table), and `ALTER TYPE <type> OWNER TO qr_migrator;` for every enum type in
schema `public`; or restore a dump taken with `pg_dump --no-owner` while
connected as `qr_migrator`. Then run the two `GRANT` statements above. Try this
on a scratch copy of the database first.

The production-image smoke
uses one role for both files, so this two-role setup is not yet tested.

The application is published on `127.0.0.1:${WEB_PORT:-3000}` only; Nginx is the
sole ingress. Every application container runs read-only, without capabilities
and with `no-new-privileges`.

**Release sequence** (as root, from the directory that holds `docker/`;
`C="docker compose -f docker/docker-compose.prod.yml"`; no `export` anywhere, see
"Host layout"):

```bash
cp -p docker/.env docker/.env.prev                # the running release's file, kept for the rollback
docker load < release-<sha>.tar.gz
docker image inspect --format '{{.Architecture}} {{.Id}}' villa-app:<sha> villa-app:<sha>-workers villa-app:<sha>-migrate
# edit docker/.env: set APP_IMAGE=villa-app:<sha>, the only line that changes
env -i PATH="$PATH" HOME="$HOME" $C --profile ops config --images    # as a timer sees it: the <sha> tags, not the old ones
$C up -d --wait db
$C --profile ops run --rm migrate          # applies this commit's migrations, exits 0 on "No pending migrations"
$C up -d --wait web                        # the web image waits for a healthy db and reports /api/health/ready
```

- Each `docker image inspect` line must read `amd64 sha256:...` with exactly the
  image ID that `docker:build` printed for the same tag. Any other architecture or
  ID means that this archive is not what was built and scanned: stop before editing
  `docker/.env`. (If the build Mac and the VPS use different image stores, the
  `.Id` of the same image can differ; compare
  `docker image inspect --format '{{json .RootFS.Layers}}'` of both sides instead.)
  This comparison has not been exercised yet: before the first real release, do one dry run of build, scan,
  save, load and this comparison between the Mac and the VPS (the scan of amd64
  images from an arm64 daemon included), and note which of the two comparisons holds
  for your image stores.
- Run `cp -p` once per release. If the sequence is repeated after `docker/.env` was
  edited, restore the file from `docker/.env.prev` first.
- The `migrate` image derives from `APP_IMAGE`, so `docker/.env` is saved before the
  migration, and from that moment the next timer tick (the outbox runs every minute)
  already starts the new `-workers` image against the old schema. Save the file and
  run `up -d --wait db` and `migrate` without a pause. When a release needs its
  schema before its worker runs (a new column the worker reads or writes), comment
  out the two cron entries of "Worker schedule" before the edit and restore them
  after `migrate`, or the runs in that window fail.
- `config --images` prints the web, `-migrate` and `-workers` references of
  `<sha>` plus the PostgreSQL image; an old tag there means the edit was not saved
  or a variable overrides it.

**After `up -d --wait web`.**

1. The timers use the new image. The `outbox` and `operations` containers are
   `run --rm` and gone after each run, so `$C ps` cannot show them (it shows `web`
   with `villa-app:<sha>`); read the container create events instead, after the
   next minute tick for `outbox` and the next five-minute tick for `operations`:

   ```bash
   docker events --since 6m --until 0s --filter event=create --filter label=com.docker.compose.project=qr-city-guide --format '{{.Actor.Attributes.image}} {{.Actor.Attributes.name}}'
   ```

   Events are listed oldest first. The newest `outbox` line and the newest
   `operations` line must name `villa-app:<sha>-workers`; the previous tag after the
   release means the timers read another file or a stale variable. Fix that before
   leaving, because the previous worker image would run against the new schema.
2. The image optimizer works (R-753). The smoke never checks the response of
   `/_next/image` and leaves no container running, so check the released `web` on
   the VPS (use `WEB_PORT` if set). The request needs no identity header, because the
   proxy does not run for `/_next/*`, so no secret goes on the command line:

   ```bash
   curl -sS -o /dev/null -D - -H 'Accept: image/webp' \
     'http://127.0.0.1:3000/_next/image?url=%2Fhouse%2Fbalcony%2Fbalcony_2.jpeg&w=640&q=75' | grep -i '^content-type'
   ```

   It must print `content-type: image/webp`. `image/jpeg` with status 200 is the
   silent fallback of an optimizer whose sharp or libvips cannot load in the image:
   `$C logs web` names the error, and the release is not ready.

**Rollback.** Keep the previous images loaded (never prune them before the new
release has proven itself) and `docker/.env.prev` until then. Rolling back means
restoring the file, not exporting a variable: `cp -p docker/.env.prev docker/.env`,
`$C up -d --wait web`, then the timer check above, which shows the previous
`-workers` tag again. Migrations are forward-only, so roll back only to a release
that ran on the same schema.

**Feature flags after the first migrate.** A database migrated from empty has the
guest portal and check-in switched on: the migration
`20260714090000_comprehensive_remediation` seeds the `feature_flags` setting with
both flags `true`, and the production default of off applies only when that row is
missing. Switch them off in `/admin/settings` right after `up -d --wait web` if the
launch should be dark.

**Upgrading a database that already holds data** (not yet exercised on this project;
try it on a scratch database first). Some migrations refuse to drop data
(`RAISE EXCEPTION 'Refusing to ...'`) and are applied one by one, so check the
database before `run --rm migrate`; every count must be 0:

```bash
dbpsql -c "SELECT
  (SELECT count(*) FROM users) AS users,                                       -- 20260930120000
  (SELECT count(*) FROM bookings WHERE reference IS NOT NULL) AS booking_refs,  -- 20260929120000
  (SELECT count(*) FROM stay_requests) AS stay_requests,                       -- 20260928215800
  (SELECT count(*) FROM outbox_events WHERE destination = 'booking_request_webhook'
     OR aggregate_type = 'stay_request') AS booking_events;"
```

Run it only against a database that predates these migrations, since the queried
columns disappear. A non-zero count needs an export or retention decision and
explicit SQL first. After a refused run, mark it rolled back before retrying:
`$C --profile ops run --rm migrate node node_modules/prisma/build/index.js migrate resolve --rolled-back <migration name>`.

The migration `20261020120000_booking_calendar_source` re-keys the single `calendar_sync_state` row to `booking` and resets its cached snapshot (blocked nights, horizon, sync history; dates only). It refuses only on a hand-edited table (a row with another id, or both ids): check with `dbpsql -c "SELECT id FROM calendar_sync_state;"` (one row expected) before `run --rm migrate`. The previous release cannot run on the migrated database (readiness answers 503 because the database schema is newer than the image, and that release reads the retired row id), so a bad release after this migration is fixed forward: the `APP_IMAGE` of `docker/.env` that the timers read already names the new release before `migrate` (see the release sequence), and `web` moves to it right after `migrate`. Then set `BOOKING_ICAL_URL` (see "Required runtime configuration") and run the first sync: press "Sync now" in /admin/availability once; it must answer "Synced: N blocked nights" with N equal to the booked and closed nights of the next 365 nights in the extranet; one known reservation (its check-in night crossed out, its check-out day free) and one date closed by hand must show as booked on /en/availability and /el/availability; and an operations run about 30 minutes after the click must move "Last success" without a click. While the stored snapshot holds no night from today on, every run accepts an empty calendar, so N = 0 while the extranet has blocked dates means a wrong link or the wrong export option: delete `BOOKING_ICAL_URL` and run `docker compose -f docker/docker-compose.prod.yml up -d --wait web` again (web reads the variable only when its container is created) until the link is fixed. The scheduled operations run (every 5 minutes) can make this first sync on its own within 5 minutes after the variable is set, before "Sync now" and these checks, so do the checks right after setting it.

**Worker schedule.** The workers are one-off services of the same Compose file;
run them from host timers with single-flight and bounded execution, e.g. root's crontab:

```cron
* * * * *   cd /opt/qr-city-guide && flock -n /run/lock/qr-outbox.lock timeout 55 docker compose -f docker/docker-compose.prod.yml --profile ops run --rm --no-deps outbox
*/5 * * * * cd /opt/qr-city-guide && flock -n /run/lock/qr-operations.lock timeout 280 docker compose -f docker/docker-compose.prod.yml --profile ops run --rm --no-deps operations
```

Each run prints one JSON line (or a `failed` event on stderr and exit 1). Cron
mails that output or drops it; append `2>&1 | logger -t qr-<worker>` (or use
systemd timers) to get it into journald. `| logger` hides the job's exit status
unless pipefail is set, so the pipeline can look successful to cron when the job
failed. Cron does not inherit the operator shell, so all six variables of "Host
layout" must be in `docker/.env` (Compose needs them even for these `--no-deps`
runs); that is also why a release changes `APP_IMAGE` there and never in a shell,
and why the check after `up -d --wait web` reads the create events of the next runs.
`--no-deps` keeps a database outage from restarting `db` from a timer. The operations worker's `ALERT_WEBHOOK_URL` reports a
failing outbox job, but nothing reports an operations job that fails or does not
run; watch it from outside. The availability calendar depends on this timer: the scheduled calendar sync and the stale-calendar alert both run only inside an operations run, so if the timer stops, the calendar stops updating and no alert opens. /admin/availability then marks the calendar stale three hours after the last success, and after 12 hours the public pages drop the calendar and show the contact options.

**Production-image smoke (mandatory).** `npm run smoke:image` starts the three
images of the checked-out commit with the same Compose file as an isolated
project and checks migrations, health, security headers, the service worker, the
guest journey and both workers; see
[Production-image smoke](../docs/deployment/production-image-smoke.md).
It is the only check that each image starts with every module it imports
(`validate:release-policy` checks the Dockerfile `runner` stage only
statically), so do not release a commit whose smoke run reported a `FAIL`.
It needs a `https://localhost:3002` build that reuses the release tags, so run
it before the release `docker:build` and scan, save and record only the images
of that later production-URL build. Both builds are `linux/amd64`, and the smoke
runs those images with `DOCKER_DEFAULT_PLATFORM=linux/amd64` (see "Platform").

## Operational workers

In production the workers are the `outbox` and `operations` services of
`docker/docker-compose.prod.yml` (see the schedule above), built from
`scripts/build-workers.mjs` into the `-workers` image.

Manual development runs use `tsx`, which does not read `.env.local` by itself, so give
it the file with `--env-file` (the app and the orchestrator load it themselves):

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
- Readiness fails (503): the web log names the cause in one warn line: `Readiness: database check failed` (the check threw: no SQL connection, a statement timeout, no `_prisma_migrations` table because the database was never migrated (run the migrate service), or no privilege to read that table; the line carries only the error name, so run the readiness query of `src/app/api/health/ready/route.ts` by hand as the application's database role to see which), `Readiness: expected migration is not applied` (run the migrate service), or `Readiness: database schema is newer than this image` (a newer migration is applied; deploy the image that ships it). Liveness alone does not prove the app is ready.
- Production proxy validation fails: verify the Cloudflare source allowlist,
  Nginx header overwrite, and private attestation contract; do not trust a
  public forwarding header directly.
- Outbox backlog: inspect `outbox_events.last_error`, the destination URL/token, and the outbox service journal.
