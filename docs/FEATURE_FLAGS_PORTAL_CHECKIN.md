# Feature flags: Guest Portal and Check-in

This adds runtime-toggleable feature flags for the Guest Portal and Check-in page, without requiring a deployment.

Flags live in an encrypted file at the project root: `feature-flags.enc.json` and are loaded by `src/lib/featureFlags.ts`.

## Flags

- `portalEnabled` (default: true): Controls visibility of the Guest Portal routes (`/{locale}/guest`, `/{locale}/guest/verify`). When false, these routes return 404.
- `checkinEnabled` (default: true): Controls visibility of the Check-in route (`/{locale}/check-in`) and the Check-in nav button. When false, the page returns 404 and the nav is hidden, even if a verified session exists.

## How it works

- Pages gate via `getFeatureFlags()` at request-time. No server restart or deploy required; flags are read from an encrypted JSON file with a small in-process cache. Writes update the file and cache.
- An admin-only API `GET/POST /api/admin/flags` lets you read and set flags quickly. It uses the existing Admin RBAC: you must present both a valid `admin_jwt` cookie and the `x-admin-secret` header or `?token=` query string matching `ADMIN_DASH_SECRET`.

## Enablement steps (rollout)

1. Prereqs

- Ensure `ADMIN_DASH_SECRET` and `ADMIN_JWT_SECRET` are set in your environment.
- Sign in to admin (obtain `admin_jwt` cookie via existing admin gate).

1. Inspect current flags

- PowerShell:

```powershell
$headers = @{ 'x-admin-secret' = $env:ADMIN_DASH_SECRET }
iwr -UseBasicParsing -Headers $headers "http://localhost:3000/api/admin/flags" | Select-Object -ExpandProperty Content
```
 
1. Soft launch: enable portal while keeping check-in hidden

- PowerShell:

```powershell
$headers = @{ 'x-admin-secret' = $env:ADMIN_DASH_SECRET; 'Content-Type' = 'application/json' }
$body = '{"portalEnabled":true,"checkinEnabled":false}'
iwr -UseBasicParsing -Method Post -Headers $headers -Body $body "http://localhost:3000/api/admin/flags" | Select-Object -ExpandProperty Content
```

Verify:

- `/{locale}/guest` resolves; `/{locale}/guest/verify` resolves.
- `/{locale}/check-in` returns 404 and the Check-in nav button is hidden.

1. Full rollout: enable both

- PowerShell:

```powershell
$headers = @{ 'x-admin-secret' = $env:ADMIN_DASH_SECRET; 'Content-Type' = 'application/json' }
$body = '{"portalEnabled":true,"checkinEnabled":true}'
iwr -UseBasicParsing -Method Post -Headers $headers -Body $body "http://localhost:3000/api/admin/flags" | Select-Object -ExpandProperty Content
```

Verified users can access `/{locale}/check-in`; nav button appears when session is verified.

## Rollback steps

- Immediate rollback (hide both Portal and Check-in):

  ```powershell
  $headers = @{ 'x-admin-secret' = $env:ADMIN_DASH_SECRET; 'Content-Type' = 'application/json' }
  $body = '{"portalEnabled":false,"checkinEnabled":false}'
  iwr -UseBasicParsing -Method Post -Headers $headers -Body $body "http://localhost:3000/api/admin/flags" | Select-Object -ExpandProperty Content
  ```
 
- Partial rollback (keep portal, hide check-in):

  ```powershell
  $headers = @{ 'x-admin-secret' = $env:ADMIN_DASH_SECRET; 'Content-Type' = 'application/json' }
  $body = '{"checkinEnabled":false}'
  iwr -UseBasicParsing -Method Post -Headers $headers -Body $body "http://localhost:3000/api/admin/flags" | Select-Object -ExpandProperty Content
  ```
 

## Operational notes

- Flags are persisted encrypted using the same crypto module used by the dev data store. Commit the file only if intended; treat it as environment-specific state.
- If you need to reset to defaults quickly, delete `feature-flags.enc.json` (the app will re-create it in memory with defaults) or call a small script that invokes `resetFeatureFlags()`.
- Security: The admin route uses RBAC (`isAdminRequest`) which requires both the secret and a valid `admin_jwt` cookie; do not bypass.
- Observability: When flipping flags, consider annotating your dashboards. You can also extend the admin route to emit a metric/event.
