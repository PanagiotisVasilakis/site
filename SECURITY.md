# Security notes for local development and secrets

The sanitized IR-01 disposition and the maintained local release scanner are
documented in [`docs/security/secret-scanning.md`](docs/security/secret-scanning.md).
The historical credential values remain permanently retired and must never be
recovered or reused.
The maintained production credential map and rotation boundaries are documented
in [`docs/security/runtime-credential-contract.md`](docs/security/runtime-credential-contract.md).

This project uses server-side secrets named `SECURITY_PEPPER` and `CLAIM_TOKEN_PEPPER` for additional cryptographic salting/peppering in development and production. Treat them like any other secret.

## Local development

- Use `.env.local` to store local development secrets such as
  `SECURITY_PEPPER` and guest auth/Wi-Fi values. This repository ignores
  `.env*` files by default — do not commit `.env.local`.

- To generate secure values locally run:

  ```bash
  npm run ensure-pepper
  ```

  The command will create `.env.local` (if missing) and append missing local-only values as needed. The script is idempotent and will not overwrite existing values.

## Production

- Inject every production secret at runtime from root-owned VPS configuration
  (never baked into the image) for every secret listed in
  [`scripts/README.md`](scripts/README.md#required-runtime-configuration).

- Do not copy `.env.local` into deployment artifacts or commit it to the repository.

## Rotation and leakage

- If `SECURITY_PEPPER` or `CLAIM_TOKEN_PEPPER` is ever leaked, rotate it in your secret store and use the rotation effects listed in [`docs/security/runtime-credential-contract.md`](docs/security/runtime-credential-contract.md) to plan the response.

## Database credential incident response

If a database URL or password is committed, deleting the file in a later commit is
not sufficient because the value remains in Git history and existing clones.

1. Revoke or rotate the exposed database credential at the provider immediately.
2. Create separate least-privilege credentials for production and staging.
3. Update deployment secret stores, then verify connectivity and review
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

## Known exposure in this repository's Git history

The history contains three committed environment files, `.env.production`,
`.env.staging` and `.env.test`, each with one database connection string for a
Neon project. They were added in commit `b5a5c86` (2026-05-20) and removed from
the tree in commit `610ffed` (2026-07-10); removing them did not remove them from
history. The sanitized disposition is in
[`docs/security/secret-scanning.md`](docs/security/secret-scanning.md): the
operator reported on 2026-07-28 that the Neon project had been deleted, and this
repository cannot prove that.

The owner must confirm the retirement in the Neon provider console: the project and
its roles are deleted, or every credential is revoked. Record the date here:
`<OWNER: confirmed on (date)>`. Until then treat the historical values as live. Never
copy them out of history, and keep them out of this repository, its issues and any
chat. This note deliberately names no value.
