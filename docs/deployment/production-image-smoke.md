# Production-image smoke

`npm run smoke:image` starts the three images of the checked-out commit with the
production Compose definition (`docker/docker-compose.prod.yml`) as an isolated
project, applies the migrations, and checks the running container the way a
release would be used. It is a local proof for the deployment ADR's
"production-image smoke" requirement and a mandatory step of the release
sequence in [`scripts/README.md`](../../scripts/README.md#production). It is not
part of `verify:release`, which does not include it because it needs the
locally built images.

## What it needs

- the images from `NEXT_PUBLIC_SITE_URL=https://localhost:3002 npm run docker:build`
  (or another reference in `SMOKE_APP_IMAGE`; the `-workers` and `-migrate`
  images of the same tag must exist);
- a local Docker daemon with Compose v2 and the digest-pinned PostgreSQL image;
- the repository's dev dependencies (Puppeteer downloads its browser on
  `npm ci` unless `PUPPETEER_SKIP_DOWNLOAD` is set);
- free loopback ports `3002` (web) and `55432` (PostgreSQL); override with
  `SMOKE_WEB_PORT` and `SMOKE_DB_PORT`.

The localhost build uses the same `villa-app:<sha>`, `-workers` and `-migrate`
tags (`scripts/image-tag.sh`) as the release build, so the later build
overwrites the earlier one. Run the smoke first, then run the release
`docker:build` with the production URL, and scan, save and record only the image
IDs that this last build prints.

The runtime configuration is generated per run with fresh random secrets into a
`0700` directory under the operating-system temp directory and deleted at the
end; nothing is read from `.env.local` and no persistent database is touched.
The project name is `qr-city-guide-smoke`; `down -v` removes its containers,
network and volume even when a check fails.

## What it checks

1. Images present, `compose config` valid, `db` healthy, `migrate` applies the
   committed migrations, `web` healthy and `/api/health/ready` = 200.
2. Response headers of `/en`: a per-request CSP nonce and no `'unsafe-inline'`
   in `script-src`, `img-src` allowing `https:` images together with
   `cross-origin-embedder-policy: unsafe-none` (the map tiles), HSTS exactly
   `max-age=63072000; includeSubDomains` (no `preload`),
   `x-frame-options: DENY`, no `x-powered-by`. `/version.json` names the build.
   `/en/availability` answers `200`, and the legacy `/en/book` answers `308` to
   `/en/availability` with no query and the same CSP and `nosniff` headers.
3. Sensitive routes answer `503` without the Nginx identity headers; a
   Chromium-shaped CSP report with the identity headers is accepted (`204`).
4. In headless Chrome: the service worker installs and controls the page after
   a reload, its cache is named after the build, a visited page and an unvisited
   page both render offline (the unvisited one as the offline fallback), and
   no CSP violation or console error occurs while online.
5. The guest journey over HTTP with the identity headers: admin sign-in, booking
   creation, claim-grant issue, claim exchange and claim, `/en/check-in` with the
   guest session, an arrival-time request (`201`) approved by the admin, and the
   silent refresh in the browser (refresh cookie only, `/en/check-in` ends on
   `/en/check-in`).
6. One run each of the `outbox` and `operations` services, parsed from their
   JSON output.

Every check is reported as `ok` or `FAIL` with its reason; the exit code is 1
when any check failed. The browser reaches the container as
`http://localhost:<port>`, which Chrome treats as a secure context, so the
production `Secure` cookies are sent exactly as behind HTTPS.

## What it does not prove

The live Nginx/Cloudflare ingress, backups, the host timers and the production
hostname are outside the container and remain evidence items of the ADR.

The smoked images are a localhost build of the same commit and Dockerfile, not
the release artifact. `NEXT_PUBLIC_SITE_URL` is compiled into the image (ADR,
Consequences), and the runtime environment schema rejects a runtime URL that
differs from it, so the smoke cannot start the images built for the production
URL: their `web` container fails environment validation at start.
