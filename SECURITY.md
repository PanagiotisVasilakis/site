# Security notes for local development and secrets

This project uses a server-side secret named `SECURITY_PEPPER` for additional cryptographic salting/peppering in development and production. Treat it like any other secret.

Local development

- Use `.env.local` to store local development secrets such as `SECURITY_PEPPER`, `SECURITY_ENC_KEY_HEX`, and guest auth/Wi-Fi placeholders. This repository ignores `.env*` files by default — do not commit `.env.local`.

- To generate secure values locally run:

  ```bash
  npm run ensure-pepper
  ```

  The command will create `.env.local` (if missing) and append missing local-only values as needed. The script is idempotent and will not overwrite existing values.

CI / Production

- Use your environment's secrets manager (GitHub Actions secrets, Vercel / Netlify environment variables, Vault, Kubernetes secrets, etc.) to store `SECURITY_PEPPER`.

- Do NOT copy `.env.local` into CI artifacts or commit it to the repository.

Rotation & leakage

- If `SECURITY_PEPPER` is ever leaked, rotate it in your secret store and reissue/rehash any dependent tokens as necessary.

## Database credential incident response

If a database URL or password is committed, deleting the file in a later commit is
not sufficient because the value remains in Git history and existing clones.

1. Revoke or rotate the exposed database credential at the provider immediately.
2. Create separate least-privilege credentials for production, staging, and test.
3. Update deployment and CI secret stores, then verify connectivity and review
   provider access logs for unexpected activity.
4. Remove tracked environment files and keep only `.env.example` in the repository.
5. Run secret scanning against the current tree and Git history.

History removal is a separate repository-owner operation. It rewrites commit IDs
and requires a coordinated maintenance window:

```bash
git clone --mirror <repository-url> site-cleanup.git
cd site-cleanup.git
git filter-repo --invert-paths \
  --path .env.production \
  --path .env.staging \
  --path .env.test
# Review the rewritten repository before an explicitly approved force-push.
```

After an approved history rewrite, invalidate open pull-request branches that
retain the old objects and require contributors to replace existing clones.
Credential rotation must happen before any history rewrite.
