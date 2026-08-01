# Trusted ingress security contract

## Invariant

Production client identity exists only when the request contains both
`X-Origin-Verified-Client-IP` and a valid `X-Origin-Proxy-Attestation`. Nginx
sets both after verifying that the TCP peer belongs to the checked-in Cloudflare
IPv4/IPv6 ranges. The application compares the attestation against
`ORIGIN_PROXY_SHARED_SECRET` with `crypto.timingSafeEqual` and validates one IP
literal. Missing, duplicated, malformed, or mismatched values resolve to
`unknown`; D1A then returns a generic `503` before sensitive persistence.

`CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`, and `Forwarded` are public
ingress data. They never establish application identity. The Cloudflare Ray ID
may be retained as a bounded correlation value, but it is not identity.

## Consumer inventory

| Consumer | Current source | Security impact | Required A2 behavior |
| --- | --- | --- | --- |
| `sensitiveRateLimit` and admin login, portal claims/sessions, booking requests, DSAR requests, analytics, vitals, client-error, CSP-report and alert-webhook writes | `requireCanonicalClientIp` | Durable limiter key and mutation admission | Require both private headers; generic `503` and zero write otherwise |
| `portalAuthHttp` claim/login/refresh/session issuance | `requireCanonicalClientIp` | Session/refresh context binding | Fail before any session, refresh-family or cookie mutation |
| `security-middleware-edge` CORS diagnostics and forwarded-protocol eligibility | `getClientIp` | Security-event correlation and permission to consider Nginx-overwritten protocol data | Verified identity or `unknown`; never use public forwarding headers as identity |
| `api-security-middleware` violation/auth diagnostics | `getClientIp` | Security event correlation only | Verified identity or `unknown`; never authorization |
| client error and CSP persistence diagnostics | `getClientIp` after the sensitive limiter | Privacy HMAC/hash input | Verified identity only; never store a raw public candidate |
| CORS violation diagnostics | `getClientIp` | Security event correlation only | Verified identity or `unknown`; Cloudflare Ray ID remains non-identity |
| request logging in `apiErrorHandler` | sanitized request headers | Operational diagnostics | Redact all public forwarding headers and both private headers |
| enterprise/security-event logging | recursive metadata sanitizer | Operational diagnostics | Redact attestation and named forwarding/client-IP fields |

Fetch `Headers` coalesces duplicate field lines into a comma-separated value.
Both the attestation and IP parsers reject commas, so duplicate private headers
fail closed rather than selecting an attacker-controlled first or last value.

## Secret lifecycle

Generate the value with `openssl rand -hex 32`. Production startup accepts only
a non-placeholder 64-character hexadecimal value. Store it in a root-owned
environment file and render it into a root-owned Nginx configuration; never put
it in Git, an image layer, a log, a metric label, or a diagnostic response.

Rotation is a coordinated maintenance action: install a new value in the app
environment and rendered Nginx configuration, validate both configurations,
restart the app and Nginx in one bounded window, run an attested write probe,
and invalidate the old rendered configuration. A mismatch fails closed with
`503`; there is no previous-secret grace path.

## Scope of proof

Repository checks prove the application contract, checked-in ranges, Nginx
syntax/overwrite behavior, and loopback app binding. They do not prove the live
Netcup firewall, Cloudflare dashboard proxy status, Full (strict) TLS mode, AOP
certificate installation, or the secrecy of operator-supplied runtime values.
