# Security notes for local development and secrets

This project uses a server-side secret named `SECURITY_PEPPER` for additional cryptographic salting/peppering in development and production. Treat it like any other secret.

Local development

- Use `.env.local` to store `SECURITY_PEPPER` and `SECURITY_ENC_KEY_HEX` locally. This repository ignores `.env*` files by default — do not commit `.env.local`.

- To generate secure values locally run:

  ```bash
  npm run ensure-pepper
  ```

  The command will create `.env.local` (if missing) and append securely generated hex values for `SECURITY_PEPPER` and `SECURITY_ENC_KEY_HEX` as needed. The script is idempotent and will not overwrite existing values.

CI / Production

- Use your environment's secrets manager (GitHub Actions secrets, Vercel / Netlify environment variables, Vault, Kubernetes secrets, etc.) to store `SECURITY_PEPPER`.

- Do NOT copy `.env.local` into CI artifacts or commit it to the repository.

Rotation & leakage

- If `SECURITY_PEPPER` is ever leaked, rotate it in your secret store and reissue/rehash any dependent tokens as necessary.
