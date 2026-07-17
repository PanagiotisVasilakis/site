# Cloudflare to origin ingress runbook

This is an operator specification, not evidence that a live firewall or
Cloudflare dashboard has been changed.

## Preconditions

- Cloudflare DNS records for the production hostname are proxied.
- SSL/TLS mode is **Full (strict)** and the origin certificate matches the
  hostname.
- **Authenticated Origin Pull** is enabled and Nginx trusts the current
  Cloudflare Origin Pull CA. The CA certificate is provisioned outside Git.
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

Render only `${ORIGIN_PROXY_SHARED_SECRET}` in
`deploy/nginx/nginx.conf.template` (for the official image, set
`NGINX_ENVSUBST_FILTER=ORIGIN_PROXY_SHARED_SECRET`). Replace the hostname
placeholder, mount the origin certificate/key and AOP CA from root-owned paths,
and run `nginx -t` before reload. The active configuration must retain complete
header overwrite, official `set_real_ip_from` ranges, safe logs, and the
loopback upstream.

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
