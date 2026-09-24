# Runtime credential contract

This document is the maintained contract for the authentication credentials
consumed by executable production code. It contains names and operational
rules only—never credential values.

## Active credential map

| Credential | Executable consumer | Security boundary | Rotation effect |
| --- | --- | --- | --- |
| `ADMIN_JWT_SECRET` | `src/lib/auth/admin.ts` | Signs and verifies admin session assertions only | Existing admin JWTs become invalid; revoke server-side admin sessions as part of the rotation |
| `GUEST_JWT_SECRET` | `src/lib/guestSession.ts` | Signs and verifies guest session assertions only | Existing guest assertions become invalid; revoke the affected refresh families and require a new claim/login |
| `ADMIN_DASH_SECRET` | Admin login (`src/app/api/admin/login/route.ts`) | Constant-time comparison for administrative authentication; never signs guest or admin JWTs | Distribute the replacement out of band and invalidate the retired login credential |

These three values are independently supplied. Production startup rejects a
missing value, visible whitespace or control characters, placeholder-like or
repeated patterns, insufficient estimated strength, or equality between any
two values. Each value must be generated from at least 32 random bytes and
injected only at runtime. The repository never generates production
credentials.

The retired names `JWT_SECRET`, `SESSION_SECRET`, `SECURITY_ENC_KEY_HEX`, and
`SECURITY_ENC_KEY_HEX_PREVIOUS` have no executable consumer and are not part of
the deployment contract. Do not recreate a consumer or alias to retain them.
Historical values of the credentials retired in incident IR-01
([secret scanning](secret-scanning.md)) remain permanently forbidden.

## Environment isolation

Production receives credentials from a root-owned environment file or an
equivalent local secret injection mechanism. Values must not enter Git,
container layers, `NEXT_PUBLIC_*` variables, browser bundles, health responses,
logs, diagnostics, or errors.

Development and tests are isolated:

- missing admin and guest JWT credentials produce process-local random signing
  values that disappear at process exit;
- a missing development dashboard credential disables admin login;
- release verification derives deterministic, explicitly non-production values
  inside its restricted subprocess environment;
- no development or test value is a production fallback.

## Startup and rotation

`scripts/start-standalone.mjs` validates the authoritative runtime schema before
loading the standalone server. The local release gate runs an isolated startup
matrix proving missing, invalid, and identical values fail with configuration
status 78, while independent valid synthetic values pass. Output is checked to
ensure no credential value is emitted.

Rotate one credential at a time using an atomic replacement in the runtime
secret source, restart the service, verify readiness and the affected
authentication flow, and then invalidate the retired credential and relevant
sessions. If a credential may have leaked, treat the event as an incident:
rotate first, revoke dependent sessions, investigate access, and never restore
the retired value.
