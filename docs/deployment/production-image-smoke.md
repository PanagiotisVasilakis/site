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
  images of the same tag must exist). `docker:build` builds for `linux/amd64`, the
  production platform, whatever the daemon's architecture, and checks that all
  three tags report it; see "Platform" below;
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

## Platform

Production is `linux/amd64` ([deployment target](../architecture/deployment-target.md)),
and the release host is an Apple-silicon Mac, whose Docker daemon is `arm64`.
`npm run docker:build` therefore builds `--platform linux/amd64` by default
(`DOCKER_BUILD_PLATFORM` overrides it for a local experiment; such images are never
smoked, scanned or shipped) and exits 1 when any of the three tags reports another
`os/architecture`. Smoke the amd64 images, not a native build:

```bash
DOCKER_DEFAULT_PLATFORM=linux/amd64 npm run smoke:image
```

The script passes its environment to every `docker compose` call unchanged, so
Compose creates all services for amd64 and none silently falls back to the native
architecture; the digest-pinned PostgreSQL image is then pulled in its amd64 variant
(a registry pull the first time). On Apple silicon the containers run under
emulation (QEMU, or Rosetta when Docker Desktop's "Use Rosetta for x86_64/amd64
emulation" is on), which is much slower than a native run. The fixed waits in the
script (10 to 60 seconds) were tuned for native speed and not measured under
emulation. A pass is one complete run that reports no `FAIL`; a pass of arm64 images
proves nothing about the VPS. A `FAIL` whose reason is a timeout may come from the
emulation: re-run once. If the same check times out again, or any other check fails,
investigate it as a defect; never repeat the run until it goes green.

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
   a reload, and its cache is named after the build. A page that the guest
   reaches by a client-side link from `/en/stay` (the guide tile, not visited
   before) is kept by the worker and opens offline with its heading (R-628). A
   visited page renders offline. An unvisited page is answered by the offline
   fallback at `/{locale}/offline?from=<page>` (R-648) and must hydrate there:
   React has attached the handler of the Retry button, no page error is raised,
   no error-boundary text appears, and the 112 call tile is in the page. No CSP
   violation or console error occurs while online.
5. The guest journey over HTTP with the identity headers: admin sign-in, booking
   creation, claim-grant issue, claim exchange and claim, `/en/check-in` with the
   guest session, an arrival-time request (`201`) approved by the admin, and the
   silent refresh in the browser (refresh cookie only, `/en/check-in` ends on
   `/en/check-in`).
6. One run each of the `outbox` and `operations` services, parsed from their
   JSON output.

Every check is reported as `ok` or `FAIL` with its reason; the exit code is 1
when any check failed. The browser launch is a fatal check: when Chrome cannot
start, the report still prints, the checks after it are reported as skipped, and
the exit code is 1. The browser reaches the container as
`http://localhost:<port>`, which Chrome treats as a secure context, so the
production `Secure` cookies are sent exactly as behind HTTPS.

## What it does not prove

The live Nginx/Cloudflare ingress, backups, the host timers and the production
hostname are outside the container and remain evidence items of the ADR.

It never checks the response of `/_next/image`, so it does not prove that the sharp
and libvips files of the runner image load (R-753): when they cannot, the optimizer
silently answers the original JPEG with status 200 and every smoke check stays
green. The smoke removes its containers at the end, so this is a manual step on the
released `web` container, after `up -d --wait web` on the VPS (the exact command and
its expected output are in [`scripts/README.md`](../../scripts/README.md#production)):
request `/_next/image?url=%2Fhouse%2Fbalcony%2Fbalcony_2.jpeg&w=640&q=75` with
`Accept: image/webp` (no identity header: the proxy does not run for `/_next/*`),
and expect `content-type: image/webp`. `image/jpeg` is the fallback and means the
release is not ready.

It does not prove the identity of the artifact that reaches the VPS either. After
`docker load` there, `docker image inspect --format '{{.Architecture}} {{.Id}}'` of
the three tags must read `amd64` and the image IDs that `docker:build` printed for
the scanned images (same README section).

The smoked images are a localhost build of the same commit and Dockerfile, not
the release artifact. `NEXT_PUBLIC_SITE_URL` is compiled into the image (ADR,
Consequences), and the runtime environment schema rejects a runtime URL that
differs from it, so the smoke cannot start the images built for the production
URL: their `web` container fails environment validation at start.
