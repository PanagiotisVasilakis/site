# Secret scanning and IR-01 disposition

## Sanitized incident disposition

IR-01 is recorded as `COMPLETE_CONTAINED`. On 2026-07-28 the operator reported
that the affected Neon project had been deleted and retained no project,
branch, recoverable backup, or operational authentication state. That Neon
disposition is operator-provided evidence; this repository cannot independently
prove provider-side deletion.

Six historical credentials remain permanently retired. Their values must never
be recovered, printed, reused, injected, or copied into tests. The versioned
incident baseline contains only six immutable scanner fingerprints,
classifications, the historical commit, path, rule, and line encoded by those
fingerprints. It is not a content allowlist and is never applied to a current
tree or release artifact. History was not rewritten; revocation and provider
deletion, not Git deletion, are the containment boundary.

## Mandatory local gate

`npm run verify:release` scans repository-controlled source/build inputs before
the other release checks and scans generated Next.js server/static artifacts
immediately after the production build. Ignored local `.env*` files are not
selected as sources, are excluded by `.dockerignore`, and are rejected if they
appear in a build artifact. Findings are emitted only as path, line, rule,
classification, and a redacted stable fingerprint.

The gate uses Gitleaks 8.30.1. Download the exact official release artifact
listed in `config/secret-scanning/tool.lock.json`, verify the upstream checksum
file and archive hashes, extract it into a user-protected directory, and set:

```bash
GITLEAKS_BIN=/absolute/protected/path/gitleaks npm run verify:release
```

The gate independently verifies the extracted binary hash and exact version.
It performs no network download. The only accepted current findings are
versioned, location-exact synthetic test fixtures or documented placeholders.
Adding, moving, or removing such a fixture requires an explicit reviewed
allowlist diff; any other finding fails closed. Scanner reports exist only in a
mode-`0700` operating-system temporary directory, are mode `0600`, and are
deleted after redacted evaluation.

The automated current/artifact gate does not repeat the restricted all-ref
incident investigation. A future history investigation must use protected
evidence storage and compare findings to the six exact historical fingerprints;
any seventh or changed finding is a new incident.
