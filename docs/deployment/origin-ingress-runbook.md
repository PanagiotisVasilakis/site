# Cloudflare to origin ingress runbook

This is an operator specification, not evidence that a live firewall or
Cloudflare dashboard has been changed.

## Preconditions

- Cloudflare DNS records for the production hostname are proxied.
- Every other web-facing DNS record of the domain is also proxied or serves
  valid HTTPS itself, because the application sends HSTS with
  `includeSubDomains`. Universal SSL covers only the apex and first-level
  subdomains (e.g. `www`), so do not host a web service on a deeper subdomain
  such as `a.b.example.com` without its own certificate. Mail (MX) records
  are not affected by HSTS.
- SSL/TLS mode is **Full (strict)** and the origin certificate matches the
  hostname.
- **Authenticated Origin Pull** is enabled with a client certificate that belongs
  to this zone (uploaded to Cloudflare as a custom or per-hostname AOP
  certificate), and Nginx trusts only the CA that issued it. Do not trust
  Cloudflare's shared default pull CA. The CA certificate is provisioned outside
  Git and mounted at `/etc/nginx/tls/cloudflare-origin-pull-ca.pem`.
- `ORIGIN_PROXY_SHARED_SECRET` is generated with `openssl rand -hex 32`, stored
  root-only, and injected into both the application and rendered Nginx config.
- The Next.js process binds `127.0.0.1:3000`; PostgreSQL remains loopback/private.

## Atomic firewall update

1. Export the current firewall rules and retain a tested console recovery path.
2. Resolve the checked-in `deploy/nginx/cloudflare-ips.json` through the offline
   integrity check. Separately run `npm run check:cloudflare-ips:current` from an
   approved network and review any IPv4 or IPv6 delta before changing rules.
3. Build a replacement ruleset that allows TCP 80/443 only from every listed
   Cloudflare IPv4 and IPv6 range. Keep SSH management access as a separate,
   explicitly approved source rule. Do not mix it into the Cloudflare set.
4. Validate the replacement ruleset without activating it, then apply it
   atomically with an automatic timeout rollback.
5. From Cloudflare, verify the public hostname. From a non-Cloudflare source,
   verify direct origin 80/443 is rejected. Verify port 3000 and PostgreSQL are
   not public from either address family.
6. Cancel the automatic rollback only after all checks pass. Archive sanitized
   rule hashes and timestamps, never origin secrets or private keys.

If validation fails, trigger the timed rollback or restore the exported ruleset
through the provider console. Do not temporarily allow `0.0.0.0/0` or `::/0`.

## Nginx rendering and validation

Production Nginx must run the official image pinned in
`deploy/nginx/image.lock.json` (currently `nginx:1.30.5-alpine`, the tested
build) and never a build older than 1.30.4 on the stable branch or 1.31.3 on
mainline (CVE-2026-42533).

Render only `${ORIGIN_PROXY_SHARED_SECRET}` in
`deploy/nginx/nginx.conf.template` (for the official image, set
`NGINX_ENVSUBST_FILTER=ORIGIN_PROXY_SHARED_SECRET`). Replace the hostname
placeholder, mount the origin certificate/key and AOP CA from root-owned paths,
and run `nginx -t` before reload. The active configuration must retain complete
header overwrite, official `set_real_ip_from` ranges, safe logs, and the
loopback upstream.

### Run

Run the pinned image with host networking. Nginx must reach the application at
`127.0.0.1:3000`; on a bridge network that address is the Nginx container
itself, so every request fails with `502`. Keep `WEB_PORT` at `3000`.

```sh
docker run -d --name origin-nginx --restart unless-stopped --network host \
  -v <host-dir>/nginx.production.conf:/etc/nginx/nginx.conf:ro \
  -v <host-dir>/includes:/etc/nginx/trusted-ingress:ro \
  -v <host-dir>/tls:/etc/nginx/tls:ro \
  -v <host-log-dir>:/var/log/nginx \
  <repository>@<digest>
```

- `<repository>@<digest>` is the reference in `deploy/nginx/image.lock.json`.
- `--restart unless-stopped` brings the ingress back after a host reboot or a Docker daemon restart, as the `db` and `web` services of `docker/docker-compose.prod.yml` come back. For a container started without it, run `docker update --restart unless-stopped origin-nginx`.
- `<host-dir>/includes` holds `cloudflare-realip.conf` and `cloudflare-geo.conf`
  from `deploy/nginx/includes/`. `<host-dir>/tls` holds `origin.crt`,
  `origin.key` and `cloudflare-origin-pull-ca.pem`. This is the same layout that
  `scripts/test-nginx-ingress.sh` uses.
- If the image's own template step renders the file instead of mounting
  `nginx.production.conf`, mount the hostname-replaced template at
  `/etc/nginx/templates/nginx.conf.template`, set
  `NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx`, and do the hostname replacement before
  the container starts.

Run `docker exec origin-nginx nginx -t` before every reload.

### Error log rotation

The error log (`/var/log/nginx/error.log`) is written to the host through the
`<host-log-dir>` mount above. Events at level `warn` and above, including the
dry-run rate-limit lines, can include the client address and the request line.
The log is kept for 14 days, as the privacy notice states. Rotate it daily on
the host with a logrotate rule in `/etc/logrotate.d/`:

```
<host-log-dir>/error.log {
    daily
    rotate 13
    missingok
    postrotate
        docker kill -s USR1 origin-nginx
    endscript
}
```

`rotate 13` keeps the current file and 13 rotated files, one day each, so a line
is deleted at the latest when it is 14 days old (later only if a daily run is
late or missed). A count of 14 would keep lines for up to 15 days.

`docker kill -s USR1` makes the Nginx master reopen its log files, so new events
go to the new file. This rule covers only `error.log`. `access.log` is written to
the same directory and needs its own rotation rule before go-live.

Do not add `notifempty`: logrotate would then skip the rotation on a day without
new lines, and the files already rotated would stop ageing, so they could be
kept longer than 14 days.

## CIDR and credential rotation

Cloudflare publishes range changes before use. Review the official IPv4/IPv6
sources, update the JSON manifest and both generated includes together, run the
offline/current checks and disposable Nginx test, then update firewall and Nginx
atomically. Never auto-apply a fetched range.

For shared-secret rotation, render the new secret to a separate root-owned
configuration, validate it, update the app environment, and perform a bounded
coordinated restart. A mismatch intentionally returns `503`. For origin/AOP
certificate rotation, install parallel new files, validate chain/hostname,
switch paths atomically, reload, probe through Cloudflare, then retire old files.

## Evidence limitations

Static release policy cannot prove live firewall enforcement, Cloudflare proxy
status, dashboard TLS mode, AOP enablement, certificate validity, or Netcup
network reachability. Those require dated operator evidence for every release.
