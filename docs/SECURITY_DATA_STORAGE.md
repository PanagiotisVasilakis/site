# Security: Secrets & Guest Data Storage

This project treats secrets and PII as first‑class. This doc summarizes how to store them safely in dev and prod.

## Secrets (credentials, API keys)

- Production: use your platform’s secret manager (e.g., Vercel `vercel env`, Azure Key Vault, AWS Secrets Manager). Never commit secrets.
- Development: store in `.env.local` (Git‑ignored). Example:

```env
ADMIN_DASH_SECRET=... # for /admin/analytics
ADMIN_JWT_SECRET=...   # admin JWTs
GUEST_JWT_SECRET=...   # guest booking session JWTs
SECURITY_PEPPER=...    # extra hash input for sensitive identifiers
SECURITY_ENC_KEY_HEX=... # 32 bytes hex for AES-256-GCM
VALID_API_KEYS=key1,key2
ALLOWED_ORIGINS=https://yourdomain.com
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

## Guest data (PII) storage

MVP design:

- Production: relational DB (e.g., Postgres) with:
  - `User`, `Identity`, `Booking`, `BookingAccess`, `AuthSession` tables.
  - Hash AFM/passport values with salt + pepper; store `last4_mask` for display.
  - Encrypt at rest (disk) and consider column‑level encryption for sensitive fields.

- Development: encrypted file store (no external DB needed):
  - `secure-data.enc.json` at project root, AES‑256‑GCM encrypted using `SECURITY_ENC_KEY_HEX`.
  - Access via `src/lib/guestDataStore.ts`.
  - This file is moderately sensitive; do not commit it. `.gitignore` already ignores `.env*`; ensure you do not check in `secure-data.enc.json`.

## Crypto utilities

- `src/lib/crypto.ts` provides:
  - `hashSensitive` / `verifySensitive`: SHA‑256 with salt + pepper (PEPPER from env)
  - `encryptJSON` / `decryptJSON`: AES‑256‑GCM with 96‑bit IV; key from `SECURITY_ENC_KEY_HEX`
  - `maskLast4`: UI‑friendly masking for display

## Sessions

- Admin sessions: `admin_jwt` cookie (already in repo), secret from `ADMIN_JWT_SECRET`.
- Guest booking sessions: `guest_session` cookie (HttpOnly), signed with `GUEST_JWT_SECRET`.

## Backups & retention

- Production: use managed automated backups and defined retention for PII (GDPR/Data Retention policy).
- Development: optional manual snapshots; do not copy dev PII to prod.

## Audit & observability

- Use existing tracing/metrics; add audit logs on verification attempts and access changes.
