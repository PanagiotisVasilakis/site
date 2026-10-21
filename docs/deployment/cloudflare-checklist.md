# Cloudflare checklist

The Cloudflare settings that this application depends on, each with the reason and a check.
Cloudflare Free is the edge in front of the origin ([deployment target](../architecture/deployment-target.md));
this page does not replace the [origin ingress runbook](origin-ingress-runbook.md), which specifies
the Nginx side, the firewall and the Authenticated Origin Pull trust. Work through it at step 8 of
the [day-0 runbook](day-0-runbook.md), and again after any change of the zone.

Status: written from the application's behaviour (headers, caching, the pages) as it follows from the
code, not checked against a live Cloudflare zone. Cloudflare renames and moves settings, changes
defaults and limits its plans, so this page names each setting by the name the application depends on
and the value it needs, and leaves the location in the dashboard, the labels, the rule syntax, the
defaults and the limits of the Free plan to Cloudflare's documentation. Search the dashboard and the
documentation for the setting's name. Replace `H` with the canonical host in every check.

## 1. DNS and the origin address

| Setting | Value | Why |
| --- | --- | --- |
| Records for the canonical host (`A`, and `AAAA` when the VPS has IPv6) | Proxied (orange cloud) | The firewall lets only Cloudflare reach port 443, and the application takes the client identity only from the attested Cloudflare hop. |
| Any other record that points at the VPS address | None, and never DNS-only (grey cloud) | A DNS-only record, a `mail.` or `ftp.` host, an `ip4:` entry in an SPF record, or an MX record whose target is the VPS publishes the address that the proxy hides. |
| Records for other names in the zone | Proxied, or serving valid HTTPS | The application sends HSTS with `includeSubDomains` (section 10). |

Origin address hygiene: do not put the VPS address in e-mail headers (send mail from elsewhere), in
error pages, in the repository or in tickets. If the address was ever served unproxied, treat it as
known: the Netcup firewall and Authenticated Origin Pull are what protect the origin then. Whether
Netcup can give the server another address is a question for Netcup.

## 2. SSL/TLS

| Setting | Value | Why |
| --- | --- | --- |
| SSL/TLS encryption mode | **Full (strict)** | Nginx serves a certificate for the canonical host; strict makes Cloudflare validate it. Flexible would try plain HTTP to a server that has none, and Full does not validate the certificate. |
| Always Use HTTPS | On | Plain HTTP requests get a redirect at the edge. The origin has no port 80 listener. |
| Minimum TLS Version | 1.2 | The same floor as `ssl_protocols TLSv1.2 TLSv1.3` in the Nginx template. |
| TLS 1.3 | On | |
| Automatic HTTPS Rewrites | On | Rewrites `http://` references in HTML to `https://`. The application emits none (check: no `http://` in `src` or `href`), so it never changes the HTML; if it did, the page would no longer match what React rendered. |
| HSTS (Cloudflare's own setting) | Off | The application sends `Strict-Transport-Security: max-age=63072000; includeSubDomains`, and one source for that header is enough (section 10). |
| Origin CA certificate | One, for the canonical host | The `origin.crt` of Nginx ([day-0 runbook](day-0-runbook.md), section 6). Note its expiry date. |
| Authenticated Origin Pulls | **On, with the certificate of this zone** | See below. |

**Authenticated Origin Pull with your own certificate.** Use Cloudflare's documentation for the
zone-level setup with a custom certificate, and the openssl recipe and the origin side in the
[day-0 runbook](day-0-runbook.md), section 6. The trap: Cloudflare also offers a setting that uses a
shared certificate and publishes the matching shared CA file. Do not enable it, and never put that CA
file into `cloudflare-origin-pull-ca.pem`: every Cloudflare customer's zone would then pass your Nginx,
so someone else's zone pointed at your address would bypass your Access, WAF and rate-limit rules. The
file name `cloudflare-origin-pull-ca.pem` is historical; the file is the CA that signed your client
certificate.

Checks:

```sh
curl -sSI http://H/ | head -n 3                                  # 301 to https://H/
curl -sS --tlsv1.3 -o /dev/null -w '%{http_code}\n' https://H/en  # 200
```

The minimum TLS version needs a client that can still speak TLS 1.1, and many current `curl` builds
cannot (`curl --tls-max 1.1` then fails on your side with "no protocols available", which proves
nothing about the server). Use `openssl s_client` and compare with a control:

```sh
openssl s_client -connect H:443 -servername H -tls1_1 -cipher 'DEFAULT:@SECLEVEL=0' </dev/null 2>&1 | grep -i -E 'alert|Protocol'
# refused by the server: "tlsv1 alert protocol version" (alert number 70)
openssl s_client -connect H:443 -servername H -tls1_2 </dev/null 2>&1 | grep -E '^ *Protocol'
# control: Protocol  : TLSv1.2
```

If your OpenSSL rejects the `-tls1_1` option or reports that no protocol is available, the first
check cannot be done from this computer; do not read that as a pass.

## 3. Settings that must be off: they rewrite or inject into the page

The pages carry a per-request Content Security Policy nonce and React hydrates the HTML exactly as the
server rendered it. Anything that edits the HTML or adds a script breaks one of the two.

| Setting | Value | Why |
| --- | --- | --- |
| Email Address Obfuscation | **Off** | The host's e-mail address (`HOST_CONTACT` in `src/data/contact.ts`) is in the server-rendered HTML of several pages. Cloudflare replaces it with a `/cdn-cgi/l/email-protection` link and adds a script, so the HTML no longer matches the React tree (hydration errors) and the added script has no nonce (CSP violation). |
| Rocket Loader | **Off** | It rewrites the `<script>` tags to load later (`data-cf-settings`), which breaks the nonce policy and the order of hydration. |
| Web Analytics, automatic setup | **Off** | It injects a beacon script from `static.cloudflareinsights.com`, which the CSP blocks, and the privacy notice states that there are no analytics. |
| Every other feature that rewrites the HTML, JavaScript or CSS of a page or injects a script into it | Off | The same reason. Cloudflare's documentation lists its optimization features and says which are current; read each entry for "rewrites" or "injects". |

Check (must print `0`):

```sh
curl -sS https://H/en | grep -c -E 'email-protection|rocket-loader|data-cf-settings|cloudflareinsights|cdn-cgi/scripts'
```

## 4. Caching

| Setting | Value | Why |
| --- | --- | --- |
| Rules that cache HTML (a "cache everything" style rule, or an edge TTL on page paths) | **None** | Every page response carries its own CSP nonce and `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`. A cached page would give one visitor's nonce to everyone, so the scripts of all of them would be blocked, and it could show a stale signed-in state. |
| Browser Cache TTL | Respect Existing Headers | The application sets the headers deliberately. |
| `/sw.js`, `/version.json`, `/app.webmanifest` | No cache rule, no Edge TTL | They are served with `Cache-Control: public, max-age=0`. The service worker finds a new build through `/version.json`; a cached copy delays every update. |
| `/_next/static/*` | Optional cache rule (eligible for cache) | These files have content hashes in their names and are served with `public, max-age=31536000, immutable`, so caching them at the edge is safe and saves origin traffic. Cloudflare already caches static file types by default and follows these headers. Skip the rule if you are unsure. |
| Public media (`/house`, `/moments`, `/phones`, `/og`, `/brand`, `/design`, `/icons`) | Optional | Look at the `Cache-Control` of one file first; only add an Edge TTL for files that change rarely. |

Check: a page is never a cache hit.

```sh
curl -sSI https://H/en | tr -d '\r' | grep -i -E '^(cache-control|cf-cache-status)'
# cache-control: private, no-cache, no-store, max-age=0, must-revalidate
# cf-cache-status: DYNAMIC
```

## 5. Canonical host redirect

The site has one canonical host, the host of `NEXT_PUBLIC_SITE_URL`. Nginx forces the `Host` header of
every request to its `server_name`, so a visit through an alias (for example `www.H` when `H` is
canonical, or the reverse) loads pages but every `POST` under `/api/` from that page answers `403 CORS
violation`: the browser's `Origin` names the alias and the application sees the canonical host.
Sign-in, claims, check-in and error reports then fail while the page looks fine. Alias traffic must
never reach the origin.

1. Create the alias record (`A`/`AAAA`, proxied; a placeholder address is common for a name that only
   redirects). Without a proxied record Cloudflare cannot answer for the name.
2. Create one redirect at Cloudflare (its redirect rules; the documentation has the current way to
   write one): every request for the alias host name gets a permanent redirect (status `301`) to
   `https://H` with the same path and the same query string.
3. Do not add the alias to `ALLOWED_ORIGINS` or to the Nginx `server_name`.

```sh
curl -sSI https://www.H/en?x=1 | tr -d '\r' | grep -i -E '^(HTTP|location)'     # 301, location: https://H/en?x=1
```

## 6. Rate limiting for the API

One rule at the edge, as a coarse net. The authoritative limits for sign-in, claims and the other
sensitive operations are in PostgreSQL ([layered rate-limiting contract](../security/layered-rate-limiting.md)),
and the Nginx request limits are in dry-run mode by the owner's decision: they log what they would
reject and reject nothing, until staging and load evidence approve enforcement.

Create one rate-limiting rule at Cloudflare (its WAF rate-limiting rules; the documentation has the
current syntax and says which windows, durations and actions the Free plan allows):

- it matches only `POST` requests whose path starts with `/api/`;
- it counts per client IP address;
- a proposed start: 30 requests in 10 seconds, action **block** for the shortest duration the plan
  offers. Pick the window and the duration the plan allows; these numbers are a proposal for the
  owner to confirm after watching the security events for two weeks;
- the action is block, not a challenge: the requests come from the site's own JavaScript (`fetch`),
  which cannot solve a challenge page, so a challenged call simply fails.

Mobile carriers share addresses between many guests, which is why the limit is generous.

Check from your own computer. Use a path that the application does not have: it answers `404` for
every request, so the status can only change because of the edge rule. Do not use a real route for
this check: several of them have their own limit inside the application (the error-report route
`/api/errors` answers `429` after 10 requests a minute from one address) and the admin login has a
budget of five attempts, so their answers would look like a working edge rule when there is none.

```sh
for i in $(seq 1 60); do curl -s -o /dev/null -w '%{http_code}\n' -X POST https://H/api/ratelimit-probe; done | uniq -c
```

Expected: a run of `404` first, then, once the limit is passed, a different status (with Cloudflare's
default block response `429`) for the rest of the block duration. Look at one blocked answer with
`curl -si -X POST https://H/api/ratelimit-probe`: the body is Cloudflare's own block page, not the
application's. If all 60 answers are `404`, the rule does not match or is not enabled (wait for the
block duration to pass before you repeat the check).

## 7. Bot Fight Mode: a decision for the owner

Bot Fight Mode challenges traffic that Cloudflare classifies as automated. Look at its current state
in the dashboard (Cloudflare's defaults and plans change); the proposal below assumes it is off at
launch. Two consequences of switching it on:

- **Cookies.** Cloudflare's bot and challenge features can set their own cookies (for example `__cf_bm`
  for bot detection and `cf_clearance` after a challenge; Cloudflare's cookie documentation lists the
  current ones). The privacy notice (`src/i18n/domains/legal.ts`) lists the site's own five cookies and
  says that there are no analytics or advertising trackers. Switching the feature on is therefore also
  a decision about that notice, for the owner or a lawyer.
- **False positives.** Automated clients that you want to allow (the uptime monitor, link previews,
  search crawlers) can be challenged. Check the monitor after any change.

Proposal: leave it off at launch, look at the security events after two weeks, and decide with data. If
you switch it on, update the notice first and re-run the uptime monitor and the checks of section 6.

## 8. "I'm Under Attack" mode breaks the API

The "I'm Under Attack" security level shows every visitor an interstitial challenge page before the
site. A `fetch` call to `/api/...` receives that page instead of JSON, so sign-in, claims, check-in
and error reports fail for everyone, the uptime monitor reports an outage, and a challenge cookie is
set. Use it only during an attack that the application cannot absorb, and switch it off afterwards. A
better first response is a custom rule that challenges the page paths and excludes `/api/`.

## 9. Cloudflare Access for the admin (recommended second layer)

The admin is protected by one static secret (`ADMIN_DASH_SECRET`) and the sign-in limit of the
application (five attempts per 15 minutes per address, successful or not). Put an identity check in
front of it at the edge with Cloudflare Access: a self-hosted application on the canonical host that
covers `/admin` and `/api/admin` and everything below them (Cloudflare's documentation has the path
syntax and the Free plan's user limit), with a policy that allows only your own e-mail address(es)
(one-time PIN or your identity provider) and a session length you accept. Look at the result: both
`/admin/login` and `/api/admin/login` must ask for the Access login.

```sh
curl -sSI https://H/api/admin/flags | tr -d '\r' | grep -i -E '^(HTTP|location)'     # an Access redirect or 403, not the application's 401
```

Open `https://H/admin` in a private window: Cloudflare's login page first, then the application's. The
guest pages and `/api/portal/*`, `/api/check-in/*` stay public. This protection holds only because
Authenticated Origin Pull uses your own certificate (section 2): with the shared one, someone else's
zone could reach the origin around Access.

## 10. HSTS readiness

The application sends `Strict-Transport-Security: max-age=63072000; includeSubDomains` on every
response, without `preload`. Browsers that see it once will use HTTPS for the host and **every
subdomain** for two years, and the only way back is a new release that sends `max-age=0` over valid
HTTPS. Before the first real visit:

- Full (strict) works (section 2) and the site loads over HTTPS from a clean browser profile;
- every web-facing name of the zone is proxied or serves valid HTTPS itself. Universal SSL covers the
  apex and first-level subdomains only; do not host a web service on a deeper name without its own
  certificate;
- nothing in the zone relies on plain HTTP (a mail server's web interface, a test host);
- the registrable domain is a dedicated one (the decision of 2026-09-28 in the deployment target).

Do not submit the domain to the HSTS preload list. The check:

```sh
curl -sSI https://H/en | tr -d '\r' | grep -i '^strict-transport-security'
# strict-transport-security: max-age=63072000; includeSubDomains
```

## 11. Cloudflare IP ranges, every quarter

Cloudflare's address ranges are checked into `deploy/nginx/cloudflare-ips.json` and the two generated
Nginx includes. They change rarely and are announced in advance. Every quarter, and when Cloudflare
announces a change:

```sh
npm run check:cloudflare-ips            # the checked-in files agree with each other
npm run check:cloudflare-ips:current    # compares with Cloudflare's published ranges (needs the network)
```

If the current ranges differ, follow "CIDR and credential rotation" in the
[origin ingress runbook](origin-ingress-runbook.md): update the manifest and both includes together, run
`npm run test:nginx-ingress`, release, and change the Netcup firewall rules and the rendered Nginx in
the same window. Never apply a fetched list automatically: a wrong range either locks Cloudflare out or
lets someone else in.

## 12. Summary of checks

| Check | Command or place | Expect |
| --- | --- | --- |
| Proxied records only | Cloudflare DNS list | no grey cloud on the VPS address |
| Full (strict) | `curl -sSI https://H/` | 200 or a redirect to `/en`, never `526` |
| Always Use HTTPS | `curl -sSI http://H/` | `301` to https |
| TLS floor | the `openssl s_client -tls1_1` check of section 2, with its control | server alert "protocol version" for TLS 1.1, `TLSv1.2` for the control |
| Nothing injected | the `grep -c` of section 3 | `0` |
| Pages not cached | `cf-cache-status` of `/en` | `DYNAMIC` |
| Alias redirects | section 5 | `301` to the canonical host |
| Rate limit | the `/api/ratelimit-probe` loop of section 6 | `404` first, then a different status from Cloudflare's block page |
| Access on the admin | section 9 | Access login first |
| HSTS | section 10 | `max-age=63072000; includeSubDomains` |
| Authenticated Origin Pull | a request to the origin address without Cloudflare ([day-0 runbook](day-0-runbook.md), section 11) | no page: a timeout with the firewall, `400` without it |
