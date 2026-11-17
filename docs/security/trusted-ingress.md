# Trusted ingress security contract

## Invariant

Production client identity exists only when the request contains both
`X-Origin-Verified-Client-IP` and a valid `X-Origin-Proxy-Attestation`. The
trusted edge or proxy layer sets and overwrites both headers (e.g., via a
Cloudflare Transform Rule) before forwarding to the origin. The application
compares the attestation against `ORIGIN_PROXY_SHARED_SECRET` with
`crypto.timingSafeEqual` and validates one IP literal. Missing, duplicated,
malformed, or mismatched values resolve to `unknown`; sensitive routes then
return a generic `503` before any persistence.

`CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`, and `Forwarded` are public
ingress data. They never establish application identity. The Cloudflare Ray ID
may be retained as a bounded correlation value, but it is not identity.

## Consumer inventory

| Consumer | Current source | Security impact | Required behavior |
| --- | --- | --- | --- |
| `sensitiveRateLimit` and admin login, portal claim exchange/claims/sessions/refresh, client-error and CSP-report writes | `requireCanonicalClientIp` | Durable limiter key and mutation admission | Require both private headers; generic `503` and zero write otherwise |
| `portalAuthHttp` claim/login/refresh/session issuance | `requireCanonicalClientIp` | Session/refresh context binding | Fail before any session, refresh-family or cookie mutation |
| `security-middleware-edge` CORS diagnostics and forwarded-protocol eligibility | `getClientIp` | Security-event correlation and permission to consider proxy-overwritten protocol data | Verified identity or `unknown`; never use public forwarding headers as identity |
| client error and CSP persistence diagnostics | `getClientIp` after the sensitive limiter | Privacy HMAC/hash input | Verified identity only; never store a raw public candidate |
| CORS violation diagnostics | `getClientIp` | Security event correlation only | Verified identity or `unknown`; Cloudflare Ray ID remains non-identity |
| `withErrorHandler` 413/415 request-shape diagnostics | `getClientIp` | Security event correlation only | Verified identity or `unknown`; never authorization |
| enterprise/security-event logging | recursive metadata sanitizer | Operational diagnostics | Redact attestation and named forwarding/client-IP fields |

Fetch `Headers` coalesces duplicate field lines into a comma-separated value.
Both the attestation and IP parsers reject commas, so duplicate private headers
fail closed rather than selecting an attacker-controlled first or last value.

## Secret lifecycle

Generate the value with `openssl rand -hex 32`. Production startup accepts only
a non-placeholder 64-character hexadecimal value. Store it in the runtime
secret store / environment configuration and the edge transform rule; never put
it in Git, an image layer, a log, a metric label, or a diagnostic response.

Rotation is a coordinated maintenance action: install a new value in the app
environment and edge proxy configuration, validate both configurations,
restart/roll out the app in one bounded window, run an attested write probe,
and invalidate the old edge configuration. A mismatch fails closed with
`503`; there is no previous-secret grace path.

## Scope of proof

Repository checks prove the application contract, attestation comparison, and
header-overwrite test helpers. They do not prove the live edge proxy/Cloudflare
dashboard proxy status, Full (strict) TLS mode, edge transform rules, or the
secrecy of operator-supplied runtime values.
