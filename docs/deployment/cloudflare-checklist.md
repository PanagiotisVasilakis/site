# Cloudflare checklist

The Cloudflare settings that this application depends on, each with the reason and a check.
Cloudflare Free is the edge in front of the origin ([deployment target](../architecture/deployment-target.md));
this page does not replace the [origin ingress runbook](origin-ingress-runbook.md), which specifies
the Nginx side, the firewall and the Authenticated Origin Pull trust. Work through it at step 8 of
the [day-0 runbook](day-0-runbook.md), and again after any change of the zone.

Status: written from the application's behaviour (headers, caching, the pages) as it follows from the
code, not checked against a live Cloudflare zone. The application side was checked on 2026-10-21
against a local run of the production build (the standalone server that the image runs) over plain
`http`, without Nginx: the response headers, the cache headers of pages, files and redirects, the `0`
of the injection check, the `404` of the rate-limit probe, the `403 CORS violation` of an alias origin,
the application's own `401` on `/api/admin/*`, and the semantics of the `openssl` commands against a
local TLS 1.2+ server. What Cloudflare itself does (its redirects, error codes, cache status values,
the behaviour of its optimisation features, cookies, plan limits) could not be tested offline:
statements about it are descriptions to check, not facts. Cloudflare renames and moves settings,
changes defaults and limits its plans, so this page names each setting by the name the application
depends on and the value it needs, and leaves the location in the dashboard, the labels, the rule
syntax, the defaults and the limits of the Free plan to Cloudflare's documentation. Search the
dashboard and the documentation for the setting's name. Replace `H` with the canonical host in every
check. Sections 1 to 5, 10 and 11 are things that the application or the Nginx template depends on;
sections 6 to 9 are recommended extra layers that nothing in the application needs.

## 1. DNS and the origin address

| Setting | Value | Why |
| --- | --- | --- |
| Records for the canonical host (`A`, and `AAAA` when the VPS has IPv6) | Proxied (orange cloud) | The firewall lets only Cloudflare reach port 443, and the application takes the client identity only from the attested Cloudflare hop. |
| Any other record that points at the VPS address | None, and never DNS-only (grey cloud) | A DNS-only record, a `mail.` or `ftp.` host, an `ip4:` entry in an SPF record, or an MX record whose target is the VPS publishes the address that the proxy hides. |
| Records for other names in the zone | Proxied, or serving valid HTTPS | The application sends HSTS with `includeSubDomains` (section 10). |
| Anything that changes the `CF-Connecting-IP` header, for example a "Pseudo IPv4" setting in a mode that overwrites it | Off (unverified: the setting's name and modes are from memory of Cloudflare's documentation; search for it, and ignore this row if there is no such setting) | Nginx takes the client address from `CF-Connecting-IP` (`real_ip_header`, `deploy/nginx/nginx.conf.template`) and the application keys its sign-in and report limits on it (an IPv4 address, or an IPv6 /64). A made-up address would make the limiter count the wrong clients. |

Origin address hygiene: do not put the VPS address in e-mail headers (send mail from elsewhere), in
error pages, in the repository or in tickets. If the address was ever served unproxied, treat it as
known: the Netcup firewall and Authenticated Origin Pull are what protect the origin then. Whether
Netcup can give the server another address is a question for Netcup.

## 2. SSL/TLS

| Setting | Value | Why |
| --- | --- | --- |
| SSL/TLS encryption mode | **Full (strict)** | Nginx serves an Origin CA certificate for the canonical host, which only Cloudflare trusts, and has no port 80 listener. Check that the mode reads "Full (strict)": Cloudflare's documentation describes Flexible as speaking plain HTTP to the origin, and Full as not validating the certificate. |
| Always Use HTTPS | On | The Nginx template listens on 443 only, so a plain HTTP request must be answered at the edge. Check that `http://H/` redirects to `https://H/` (below). |
| Minimum TLS Version | 1.2 | Hardening, not a dependency of the application: the same floor as `ssl_protocols TLSv1.2 TLSv1.3` in the Nginx template. |
| Automatic HTTPS Rewrites | Off | Nothing to rewrite: `git grep -n 'http://' -- 'src/*.tsx' src/data src/i18n` finds only the SVG namespace `http://www.w3.org/2000/svg`, which is not fetched, and the rendered pages `/en`, `/el`, `/en/apartment`, `/en/availability`, `/en/privacy` and `/en/stay` have no `http://` in a `src` or `href`. A feature that edits the HTML has no benefit here and is off like the ones in section 3. |
| HSTS (Cloudflare's own setting) | Off | The application sends `Strict-Transport-Security: max-age=63072000; includeSubDomains` on its pages, and one source for that header is enough (section 10). |
| Origin CA certificate | One, for the canonical host | The `origin.crt` of Nginx ([day-0 runbook](day-0-runbook.md), section 6). Note its expiry date. |
| Authenticated Origin Pulls | **On, with the certificate of this zone** | See below. |

**Authenticated Origin Pull with your own certificate.** Use Cloudflare's documentation for the
zone-level setup with a custom certificate, and the openssl recipe and the origin side in the
[day-0 runbook](day-0-runbook.md), section 6. The trap, as the day-0 runbook and the origin ingress
runbook describe it: Cloudflare also offers a setting that uses a shared certificate and publishes the
matching shared CA file (check this in Cloudflare's documentation). Do not enable it, and never put that CA
file into `cloudflare-origin-pull-ca.pem`: every Cloudflare customer's zone would then pass your Nginx,
so someone else's zone pointed at your address would bypass your Access, WAF and rate-limit rules. The
file name `cloudflare-origin-pull-ca.pem` is historical; the file is the CA that signed your client
certificate.

Checks:

```sh
curl -sSI http://H/ | head -n 3                                  # a redirect with location: https://H/
curl -sS --tlsv1.3 -o /dev/null -w '%{http_code}\n' https://H/en  # 200
```

The status code of the redirect is Cloudflare's choice (check that it is a `3xx` that points at
`https://H/`). The minimum TLS version needs a client that can still speak TLS 1.1, and many current
`curl` builds cannot (`curl --tls-max 1.1` then fails on your side with "no protocols available",
which proves nothing about the server; this was reproduced with curl 8.5.0 and OpenSSL 3.0.13). Use
`openssl s_client` and compare with a control:

```sh
openssl s_client -connect H:443 -servername H -tls1_1 -cipher 'DEFAULT:@SECLEVEL=0' </dev/null 2>&1 | grep -i -E 'alert number|Cipher is'
# refused by the server: "tlsv1 alert protocol version ... SSL alert number 70" and "Cipher is (NONE)"
openssl s_client -connect H:443 -servername H -tls1_2 </dev/null 2>&1 | grep -E '^ *Protocol'
# control: Protocol  : TLSv1.2
```

A server that still accepts TLS 1.1 prints `Cipher is <a cipher name>` and no alert. Do not grep for
`Protocol` in the first command: OpenSSL prints `Protocol  : TLSv1.1` there even when the handshake was
refused, because it names the version that was tried. (Run against a local server that accepts TLS 1.2
and 1.3 only, the first command printed the alert line and `Cipher is (NONE)`, and the control printed
`Protocol  : TLSv1.2`; what Cloudflare answers was not tested.) If your OpenSSL rejects the `-tls1_1`
option or reports that no protocol is available, the first check cannot be done from this computer; do
not read that as a pass.

## 3. Settings that must be off: they rewrite or inject into the page

The pages carry a per-request Content Security Policy nonce and React hydrates the HTML exactly as the
server rendered it. Anything that edits the HTML or adds a script breaks one of the two.

| Setting | Value | Why |
| --- | --- | --- |
| Email Address Obfuscation | **Off** | The host's e-mail address (`HOST_CONTACT` in `src/data/contact.ts`) is in the server-rendered HTML of several pages (found on `/en`, `/el`, `/en/apartment`, `/en/availability` and `/en/privacy`). Cloudflare describes this feature as replacing e-mail addresses in the HTML and loading a decoder script (`email-protection` in the check below is the marker it is generally reported to leave); check that it is off. Any change of the server-rendered HTML can make it differ from what React rendered (hydration errors). |
| Rocket Loader | **Off** | Cloudflare describes it as rewriting `<script>` tags so that they load later (`rocket-loader` and `data-cf-settings` in the check below are its generally reported markers). The pages depend on their inline scripts, which carry the nonce, running in order. |
| Web Analytics, automatic setup | **Off** | As Cloudflare describes it, it injects a beacon script (`cloudflareinsights` in the check below is the generally reported host name). The CSP (`script-src 'self'` plus the nonce, `connect-src 'self'`) would block that script and its requests, and every block would send a CSP violation report that the application stores as a `csp_violation` security event; the privacy notice states that the site has no analytics. |
| Every other feature that rewrites the HTML, JavaScript or CSS of a page or injects a script into it | Off | The same reason. Cloudflare's documentation lists its optimization features and says which are current; read each entry for "rewrites" or "injects". |

**The CSP does not guard this.** `script-src` is `'self'` plus the per-request nonce, so a script that
Cloudflare serves from the same host (a path below `/cdn-cgi/`) is allowed, and only an inline script
without the nonce or a script from another host is blocked. Do not read a clean browser console as
proof that nothing is injected; the check below looks at the HTML itself.

Check (must print `0`). The patterns are markers that these features are generally reported to leave
in the HTML; they were not tested against Cloudflare, so a feature could leave others. Against the
local production build the command printed `0`. When in doubt, read the HTML source of `/en`:

```sh
curl -sS https://H/en | grep -c -E 'email-protection|rocket-loader|data-cf-settings|cloudflareinsights|cdn-cgi/scripts'
```

## 4. Caching

| Setting | Value | Why |
| --- | --- | --- |
| Rules that cache HTML (a "cache everything" style rule, or an edge TTL on page paths) | **None** | Every page response carries its own CSP nonce and `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`. A cached page would hand one visitor's nonce to everyone, and a nonce that is the same for all and can be read from the page protects nothing. It would also show stale content, and a page response can set the `lang` cookie. |
| The redirect from `/` and from any path without a language prefix | Never cached | It depends on the `lang` cookie and `Accept-Language`, and is sent with `Cache-Control: private, no-store` and `Vary: Accept-Language, Cookie` (`src/proxy.ts`). A cached copy would send every visitor to the language of the first one. The permanent `308` redirects of the retired pages (`/book`, `/booking-details`, `/about`) are cacheable by design. |
| Browser Cache TTL | Respect Existing Headers | The application sets the headers deliberately. |
| `/sw.js`, `/version.json`, `/app.webmanifest` | No cache rule, no Edge TTL | They are served with `Cache-Control: public, max-age=0, must-revalidate`. The service worker finds a new build through `/version.json`; a cached copy delays every update. |
| `/_next/static/*` | No rule needed | These files have content hashes in their names and are served with `public, max-age=31536000, immutable`, so caching them at the edge is safe. Check that a second request for one of them shows `cf-cache-status: HIT` (Cloudflare's documentation describes static file types as cached by default); if it does not, an optional cache rule that makes them eligible for cache is safe for this path only. |
| Public media (`/house`, `/moments`, `/phones`, `/og`, `/brand`, `/design`, `/icons`) | No rule needed | They are served with `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` (`next.config.ts`), so that an edge cache may keep them for a day. The files do not have hashed names: a replaced photo can take a day (and up to a week while it revalidates) to show everywhere. |

Check: a page is never a cache hit. The status values are Cloudflare's: check its documentation. A page
must show `DYNAMIC` (or `BYPASS`); `HIT`, `MISS`, `EXPIRED` or `REVALIDATED` would mean that the page
is eligible for the cache, which is a finding.

```sh
curl -sSI https://H/en | tr -d '\r' | grep -i -E '^(cache-control|cf-cache-status)'
# cache-control: private, no-cache, no-store, max-age=0, must-revalidate
# cf-cache-status: DYNAMIC
```

The `cache-control` line was observed locally on `/en`, `/el`, `/en/apartment`, `/en/availability`,
`/en/privacy`, `/en/stay` and `/admin/login`; `/api/health/*` answers `no-store`. The `cf-cache-status`
line comes from Cloudflare and was not tested.

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
   `https://H` with the same path and the same query string. The rule must match the alias host name
   only: a rule that also matches `H` sends the canonical host to itself and the whole site stops
   loading.
3. Do not add the alias to `ALLOWED_ORIGINS` or to the Nginx `server_name`.

```sh
curl -sSI 'https://www.H/en?x=1' | tr -d '\r' | grep -i -E '^(HTTP|location)'     # 301, location: https://H/en?x=1
curl -sSI 'https://H/en' | tr -d '\r' | grep -i -E '^HTTP'                       # 200: the canonical host is not redirected
```

The URL is quoted because `?` is a wildcard for some shells (zsh stops with "no matches found"). The
`403 CORS violation` that an alias visit would get was reproduced locally by sending a `POST` with
`Host: guide.example.test` and `Origin: https://www.guide.example.test`; the redirect itself is
Cloudflare's and was not tested.

## 6. Rate limiting for the API

One rule at the edge, as a coarse net. The application does not need it: the layered contract names
Cloudflare as the coarse layer, and no part of the application depends on this rule. The authoritative
limits for sign-in, claims and the other sensitive operations are in PostgreSQL ([layered rate-limiting contract](../security/layered-rate-limiting.md)),
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

The loop must send more requests per window than the rule allows. Each `curl` here opens a new
connection, so on a slow connection 60 requests can take longer than the 10 seconds of the window and
never reach the limit; in that case send them in parallel:

```sh
seq 1 60 | xargs -P 10 -I{} curl -s -o /dev/null -w '%{http_code}\n' -X POST https://H/api/ratelimit-probe | sort | uniq -c
```

Expected: a run of `404` first, then, once the limit is passed, a different status for the rest of the
block duration (Cloudflare's rate-limiting documentation names the status of its block response). Look
at one blocked answer with `curl -si -X POST https://H/api/ratelimit-probe`: the body is Cloudflare's
own block page, not the application's. If all 60 answers are `404`, the rule does not match, is not
enabled, or the loop was too slow (wait for the block duration to pass before you repeat the check).
Locally, both forms printed `60 404` for the application alone. The check blocks your own address for
the block duration, for every `POST` under `/api/` (the admin login and the guests' sign-in among
them), so run it from a connection that you can spare, and do not choose a block duration longer than
you can live with.

## 7. Bot Fight Mode: a decision for the owner

As Cloudflare describes it, Bot Fight Mode challenges traffic that Cloudflare classifies as automated.
Look at its current state in the dashboard (Cloudflare's defaults and plans change); the proposal
below assumes it is off at launch. Two consequences to check before switching it on:

- **Cookies.** Check in Cloudflare's cookie documentation which cookies its bot and challenge features
  set (`__cf_bm` and `cf_clearance` are names to look for). The privacy notice
  (`src/i18n/domains/legal.ts`) lists the site's own five cookies (`lang`, `guest_session`, `guest_rt`,
  `booking_claim_exchange`, `admin_jwt`) and says that there are no analytics or advertising trackers.
  Switching the feature on may therefore also be a decision about that notice, for the owner or a
  lawyer. Before launch, open the site in a clean browser profile and look at its cookies in the
  developer tools: a first visit should leave `lang` only.
- **False positives.** Automated clients that you want to allow (the uptime monitor, link previews,
  search crawlers) can be challenged. Check the monitor after any change.

Proposal: leave it off at launch, look at the security events after two weeks, and decide with data. If
you switch it on, update the notice first and re-run the uptime monitor and the checks of section 6.

## 8. "I'm Under Attack" mode breaks the API

Cloudflare describes the "I'm Under Attack" security level as showing every visitor an interstitial
challenge page before the site (check its documentation). A `fetch` call to `/api/...` would then
receive that page instead of JSON, so sign-in, claims, check-in and error reports would fail for
everyone, the uptime monitor would report an outage, and a challenge cookie would be set (section 7).
Use it only during an attack that the application cannot absorb, and switch it off afterwards. A
milder first response may be a custom rule that challenges the page paths and excludes `/api/`;
check in the documentation that a rule can be written that way on your plan.

## 9. Cloudflare Access for the admin (recommended second layer)

The admin is protected by one static secret (`ADMIN_DASH_SECRET`) and the sign-in limit of the
application (five attempts per 15 minutes per address, successful or not). Put an identity check in
front of it at the edge with Cloudflare Access: a self-hosted application on the canonical host that
covers `/admin` and `/api/admin` and everything below them (Cloudflare's documentation has the path
syntax and the Free plan's user limit), with a policy that allows only your own e-mail address(es)
(one-time PIN or your identity provider) and a session length you accept. Look at the result: both
`/admin/login` and `/api/admin/login` must ask for the Access login.

```sh
curl -sSI https://H/api/admin/flags | tr -d '\r' | grep -i -E '^(HTTP|location)'     # anything but the application's own 401
```

The unprotected application answers this request with `HTTP/1.1 401 Unauthorized` (observed locally;
`/admin` redirects to `/admin/login`, which loads). If you see that `401`, nothing stopped the request
before the application, so Access is not in front of `/api/admin`. What Access answers instead (a
redirect to its login or a `403`) is its own behaviour: check it in its documentation.

Open `https://H/admin` in a private window: Cloudflare's login page first, then the application's. The
guest pages and `/api/portal/*`, `/api/check-in/*` stay public. That includes
`/api/check-in/preferences`, which the admin's edit mode on the public check-in page uses; it still
needs the admin session cookie, which only the login behind Access issues. This protection holds only
because Authenticated Origin Pull uses your own certificate (section 2): with the shared one, someone
else's zone could reach the origin around Access.

**Keep a way back.** A policy that does not match you locks you out of the admin (not of the server
and not of the guests' pages). Test the policy in a second browser profile before you rely on it, and
use an e-mail address whose mailbox you can reach from a clean device. If you are locked out, the
Access application can be edited or removed in the Cloudflare account; the admin is then protected by
its own secret and sign-in limit again.

## 10. HSTS readiness

The application sends `Strict-Transport-Security: max-age=63072000; includeSubDomains` on its pages,
redirects and normal API responses, without `preload` (production configuration in `src/lib/security-config.ts`,
applied by `src/proxy.ts`). The proxy skips paths with a dot and `/_next`, so files such as the images,
`/sw.js` and the scripts carry no such header: look at a page, not at a file. Browsers that see it once
will use HTTPS for the host and **every subdomain** for two years, and the only way back is a new
release that sends `max-age=0` over valid HTTPS. Before the first real visit:

- Full (strict) works (section 2) and the site loads over HTTPS from a clean browser profile;
- every web-facing name of the zone is proxied or serves valid HTTPS itself. The origin ingress runbook
  states that Universal SSL covers the apex and first-level subdomains only (check Cloudflare's
  documentation); do not host a web service on a deeper name without its own certificate;
- nothing in the zone relies on plain HTTP (a mail server's web interface, a test host);
- the registrable domain is a dedicated one (the decision of 2026-09-28 in the deployment target).

Do not submit the domain to the HSTS preload list. The check:

```sh
curl -sSI https://H/en | tr -d '\r' | grep -i '^strict-transport-security'
# strict-transport-security: max-age=63072000; includeSubDomains
```

## 11. Cloudflare IP ranges, every quarter

Cloudflare's address ranges are checked into `deploy/nginx/cloudflare-ips.json` and the two generated
Nginx includes. The origin ingress runbook says that Cloudflare publishes range changes before use.
Every quarter, and when Cloudflare announces a change:

```sh
npm run check:cloudflare-ips            # the checked-in files agree with each other
npm run check:cloudflare-ips:current    # compares with Cloudflare's published ranges (needs the network)
```

The first command printed "Cloudflare ingress manifest and generated includes are internally
consistent (offline)." when this page was checked; the second needs the network and was not run.

If the current ranges differ, follow "CIDR and credential rotation" in the
[origin ingress runbook](origin-ingress-runbook.md): update the manifest and both includes together, run
`npm run test:nginx-ingress`, release, and change the Netcup firewall rules and the rendered Nginx in
the same window. Never apply a fetched list automatically: a wrong range either locks Cloudflare out or
lets someone else in.

## 12. Summary of checks

| Check | Command or place | Expect |
| --- | --- | --- |
| Proxied records only | Cloudflare DNS list | no grey cloud on the VPS address |
| Full (strict) | `curl -sSI https://H/` | 200 or a redirect to `/en` or `/el` (by the visitor's language), never a Cloudflare `52x` page such as `526` |
| Always Use HTTPS | `curl -sSI http://H/` | a redirect to `https://H/` |
| TLS floor | the `openssl s_client -tls1_1` check of section 2, with its control | `SSL alert number 70` and `Cipher is (NONE)` for TLS 1.1, `Protocol  : TLSv1.2` for the control |
| Nothing injected | the `grep -c` of section 3 | `0` |
| Pages not cached | `cf-cache-status` of `/en` | `DYNAMIC` (or `BYPASS`), never `HIT` |
| Alias redirects | section 5 | `301` to the canonical host |
| Rate limit (optional layer) | the `/api/ratelimit-probe` loop of section 6 | `404` first, then a different status from Cloudflare's block page |
| Access on the admin (optional layer) | section 9 | not the application's own `401`; the Access login first |
| HSTS | section 10, on a page | `max-age=63072000; includeSubDomains` |
| Authenticated Origin Pull | a request to the origin address without Cloudflare ([day-0 runbook](day-0-runbook.md), section 11) | no page: a timeout with the firewall, `400` without it |
