# External deployment-platform cleanup runbook

This is an instruction and evidence-preservation runbook. It does not authorize
an external mutation. Removing a domain, deployment, project, GitHub App,
credential, route, or repository setting requires a separately authorized
execution with current platform access.

## Scope

Retain:

- Cloudflare authoritative DNS, edge TLS, CDN, WAF, DDoS protection, and proxying
  to the Netcup VPS; and
- GitHub as source control and historical evidence storage.

Retire as application build, preview, hosting, or deployment systems:

- Vercel;
- Cloudflare Workers;
- Cloudflare Pages;
- GitHub Pages; and
- GitHub Actions.

Do not delete or disable the Cloudflare zone while removing Workers or Pages.
Cloudflare product names do not make those operations interchangeable.

## Fail-safe rules

Stop before any external change when any of these is true:

- the authoritative domain or current traffic path is unknown;
- the new Netcup origin, reverse proxy, TLS, firewall, health checks, workers, or
  backups are not proven;
- a rejected platform may still serve a real user or own a custom domain;
- environment-secret names/scopes and rotation ownership are not inventoried;
- current platform access cannot show production branch, auto-deploy, domain,
  route, build, and project state;
- required historical evidence has not been exported safely; or
- the action would remove the only known recovery evidence or require a force
  push/history rewrite.

There is no automatic fallback to a rejected platform. If the retained
architecture is not ready, do not cut over or decommission the existing path.

## Known historical evidence to preserve

At commit `f688b7c46717950b7f3ae953c622f99b57197b30`, read-only GitHub metadata
showed:

- a failed Vercel `Preview` deployment for that commit;
- Vercel `Production` deployments for consecutive `main` commits, including one
  prior success, proving that `main` had production deployment side effects;
- a Cloudflare check named `Workers Builds: stayinkalamata` whose details path
  identified a production Workers build; and
- earlier GitHub Pages build/deploy jobs plus the tracked `CNAME` value
  `www.bookinkalamata.com`. That hostname was not resolving when inspected and
  must not be treated as proof that no platform/domain binding exists.

Preserve a sanitized external baseline before cleanup. It should contain:

- UTC collection time, collector, repository and exact Git SHA;
- provider account/team and project names or stable IDs;
- connected repository, production branch, auto-deploy/auto-promotion setting,
  environment names, deployment/build IDs, timestamps, states and sanitized
  failure category;
- custom-domain names, branch/environment assignment, DNS records, certificate
  state, protection state and whether real traffic is observed;
- environment-variable **names and scopes only**;
- GitHub App installations, repository permissions, webhooks, deploy keys,
  Pages configuration, Actions configuration, environments and required checks;
  and
- retention/export location for sanitized logs and screenshots.

Do not commit access tokens, environment values, cookies, database URLs, provider
response bodies containing secrets, or private backup locations. Git history and
the four audit/remediation reports must not be rewritten to erase references to
retired systems.

## 1. Prepare the retained production path

Before disconnecting any platform:

1. verify the approved public hostname and Cloudflare zone ownership;
2. deploy and test the Netcup origin from the exact immutable release artifact
   without changing public traffic;
3. prove edge-to-origin TLS, origin firewall restrictions, reverse-proxy header
   overwriting, local-only application/PostgreSQL exposure, and public health;
4. prove the outbox and operations workers use the same release identity;
5. create, transfer, verify, and restore-test an encrypted off-site database
   backup; and
6. approve the DNS change, observation window, abort owner, and evidence record.

Do not copy secrets from a rejected platform to the VPS. Create or retrieve the
approved VPS secrets independently, then rotate or revoke credentials that were
available to the retired systems.

## 2. Stop automatic deployment triggers

Disable deployment triggers before the repository-cleanup commit is pushed.
Otherwise removal of the deployment configuration can itself initiate an
unreviewed production build.

Record the pre-change value and post-change value for every setting. Disable or
disconnect only the repository/project in scope. Do not remove organization-wide
integrations or unrelated projects.

## 3. Vercel cleanup

With fresh read-only access, first export the project metadata, Git connection,
production branch, ignored-build/deployment setting, auto-domain/promotion
behavior, deployments, failure logs, protection settings, domains and
environment-variable names/scopes.

Then, under separate mutation approval and in this order:

1. disable Git-triggered deployments and automatic production promotion/domain
   assignment;
2. confirm no build or deployment remains in progress;
3. disconnect the Git repository while retaining the current production
   deployment and domain for continuity;
4. detach custom domains only after the Netcup cutover and Cloudflare route are
   proven with current traffic evidence;
5. rotate or revoke every secret, webhook token, database credential, Redis
   credential, and deploy token that Vercel could access;
6. retain the last known production deployment and project without traffic for
   the approved evidence hold; and
7. delete the project only after the hold and an explicit deletion approval.

A failed Vercel status is not proof that the project is harmless. A later build
could succeed and receive a production domain.

## 4. Cloudflare Workers and Pages cleanup

Keep the Cloudflare zone, DNS records, edge certificates, CDN, WAF, DDoS controls
and proxy settings required by the accepted architecture.

For the Workers/Pages application surfaces, capture projects, builds,
deployments, Git integration, custom domains, Worker routes, environment names,
bindings, secrets by key name, KV/R2/D1/queue resources, service bindings and
access policies. Identify whether each resource is exclusive to this application
before removal.

Under separate approval:

1. disable the Workers/Pages Git build integration;
2. remove application custom-domain and Worker-route interception only after the
   Netcup origin route is proven;
3. rotate/revoke credentials and remove bindings used only by the retired
   compute project;
4. delete only exclusive Workers/Pages projects and resources after the evidence
   hold; and
5. re-check that the retained DNS zone and edge security configuration are
   unchanged.

Do not delete a zone, DNS record, edge certificate, WAF rule, or proxy setting
merely because it is managed in the same Cloudflare account.

## 5. GitHub cleanup

Preserve the repository, commits, tags required for evidence, audit reports,
deployment/status metadata, and sanitized workflow/deployment records.

Under separate approval:

1. disable GitHub Pages and remove its custom-domain setting;
2. disable GitHub Actions for this repository after exporting the PR-03 workflow
   result/history that must be retained;
3. remove obsolete required checks and environments without claiming that a
   manual local gate is equivalent protection;
4. remove or repository-restrict the Vercel and Cloudflare deployment Apps,
   webhooks and deploy keys;
5. verify no rejected provider retains repository write or deployment access;
   and
6. leave force-push and branch-deletion protections enabled where they do not
   imply a nonexistent pre-merge CI gate.

Do not delete workflow/deployment history merely to make external failures
disappear. Do not rewrite Git history to remove `CNAME`, workflow files, or
provider references; normal forward commits preserve the evidence.

## 6. Repository cleanup follow-up

The external triggers must be disabled before this local cleanup commit is ever
pushed. H0 does not perform that external step. The expected source disposition
is:

- remove `.github/workflows/ci.yml` and the GitHub-Actions-only validator/tests;
- remove `CNAME`;
- convert `docs/ci.md` and CI-named package scripts into the manual release
  verification policy rather than discarding the useful Prisma, PostgreSQL,
  integration, quality and build gates;
- remove the repository-level Vercel commit fallback; production `src/**`
  compatibility fallbacks and development CSP allowances remain outside H0 and
  require a separately reviewed source change before removal;
- retain `.vercel` in `.gitignore` as a defensive guard against accidentally
  committing stale local provider state;
- retain the original architecture/audit/remediation reports and append-only
  findings record unchanged; and
- add a small architecture-policy check that rejects reintroduction of the
  retired deployment files without pretending to be CI.

Dependency-update configuration such as Dependabot is not a deployment target.
Its use must be decided by repository governance and must not be removed as an
incidental side effect of hosting cleanup.

## 7. Verification after cleanup

The cleanup is complete only when current evidence shows all of the following:

- the public hostname resolves through retained Cloudflare DNS to the approved
  Netcup origin and passes TLS, health, security-header and client-IP tests;
- direct application and PostgreSQL origin access is blocked;
- Vercel has no active Git connection, automatic deployment, production-domain
  assignment, or custom domain for this application;
- no Cloudflare Worker route or Pages project serves or intercepts the
  application hostname, while the Cloudflare zone/CDN/WAF/DDoS path remains
  healthy;
- GitHub Pages and GitHub Actions are disabled for the repository;
- Vercel and Cloudflare deployment integrations no longer have repository
  access;
- credentials formerly available to rejected platforms are rotated or revoked;
- the first authorized repository commit after disconnection creates no Vercel,
  Workers, Pages, GitHub Pages, or GitHub Actions deployment/build record;
- the Netcup runtime uses only the recorded immutable image identity and the
  mandatory workers are healthy; and
- the sanitized before/after evidence and explicit completion approval are
  retained outside ephemeral provider dashboards.

If any verification fails, stop cleanup, preserve evidence, and resolve only the
failed platform boundary. Do not broaden the deletion scope and do not restore an
automatic deployment path without explicit authorization.
