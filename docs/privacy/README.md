# Privacy operating documents

The documents the host needs to run the guest guide in line with GDPR, written against the code and the schema of
2026-10-21 (the tree after commit `ae1449d`, with the admin login audit, the complete per-guest export and the
start-up checks of the Wi-Fi values and the site URL merged). They are operating guides, not legal advice. Fields that
only the owner can fill are marked `<OWNER: ...>`; questions for a lawyer are marked `<OWNER/lawyer: ...>`.

| Document | Use it when | Clock |
| --- | --- | --- |
| [Data subject requests runbook](dsar-runbook.md) | A guest asks for access, a copy, erasure, correction or restriction | One month from receipt |
| [Breach runbook](breach-runbook.md) | Personal data may have been exposed, lost, changed or accessed by the wrong person | 72 hours from awareness (the authority) |
| [Record of processing](record-of-processing.md) | The processing changes, the authority asks, once a year | Review yearly |
| [Processors and other recipients](processors.md) | A service is added or removed, once a year | Review yearly |
| [Proposed notice changes](proposed-notice-changes.md) | The owner or a lawyer decides what the privacy notice should say. **Nothing in it is applied** | Before the go-live |
| [Host handbook](../operations/host-handbook.md) | Day-to-day: bookings, access codes, arrival requests, Wi-Fi, switches, Booking.com | |

The privacy notice itself is in `src/i18n/domains/legal.ts`. It is owner and lawyer territory and is not changed by
these documents.

## What the owner has to decide

1. **Name the notification service** that receives the arrival requests, and adopt the rule for the copy it holds
   (delete it 12 months after the booking ended at the latest, and on an erasure request). Without it, an erasure is
   not complete.
2. **Data processing agreements**: hosting provider, Cloudflare, the notification service, the backup provider. Record the
   date and where the copy is kept in [processors](processors.md).
3. **Backups**: provider, location, encryption, retention. None exists in the repository yet; the erasure promise depends
   on it (the [data subject requests runbook](dsar-runbook.md), section 10).
4. **Retention that has no end today**: the erasure records, the arrival-request rows without contact data, the bookings
   (tax-law period), the request log, the Nginx access log, the container logs.
5. **The proposed notice changes** (items a to e), with a lawyer, and the five legal questions that the README keeps open.
6. **Contacts for an incident**: who is the operator, the lawyer, the hosting provider's support
   ([breach runbook](breach-runbook.md), section 2). Open the Hellenic Data Protection Authority's notification page once.
7. **Who answers requests** and where the request log lives ([data subject requests runbook](dsar-runbook.md), section 12).
8. **Whether the admin export alone answers an access request.** It leaves out the access-link records, the
   refresh-token families, the notification delivery rows and the security log entries about the stays (including
   the refresh-token replay events) on purpose; the cross-check statement shows the first four, and a separate query
   shows the replay events ([data subject requests runbook](dsar-runbook.md), sections 6.2 and 6.3).
9. **A review date** for each document.

## Keeping them true

Change the documents in the same change as the code:

- a new table or column with personal data: [record of processing](record-of-processing.md) (section 3) and the
  [data subject requests runbook](dsar-runbook.md) (the export and the cross-check statement in section 6, the
  erasure in section 7). The admin export names its columns, so a new column stays out of the file until it is
  added to `src/lib/guestDataExport.ts`;
- a new recipient or tool: [processors](processors.md) and the notice;
- a new cookie or storage key: the notice and `tests/unit/privacy-storage-inventory.test.ts`;
- a changed retention number: [record of processing](record-of-processing.md) (section 4), the notice, and the handbook;
- a new admin action or secret: the [breach runbook](breach-runbook.md) (sections 5 and 10) and the handbook.

## Where the behaviour is defined

The documents state the behaviour of the code as it is. These are the files that define it; check them when a
document and the code seem to disagree.

- The admin login events (`admin.login_succeeded`, `admin.login_failed`, `admin.login_rate_limited`, none of them
  high severity, kept 90 days): `src/app/api/admin/login/route.ts`, `runRetention` in
  `src/lib/operationalMonitor.ts`, `tests/security/admin-login-audit.test.ts`. Used in the
  [breach runbook](breach-runbook.md) (sections 6.1 and 6.2, query 8), the
  [record of processing](record-of-processing.md) (P6 and P10) and the
  [host handbook](../operations/host-handbook.md) (section 8).
- The complete per-guest export (**Export all guest data**, `guest_data_<booking id>_<time>.json`):
  `src/lib/guestDataExport.ts` (`getCompleteGuestExport`), the `export` action of
  `src/app/api/admin/guests/route.ts`, `src/app/admin/guests/page.tsx`, `tests/unit/guest-data-export.test.ts`. Used in
  the [data subject requests runbook](dsar-runbook.md) (section 6).
- The start-up check of the Wi-Fi values (the words `replace`, `changeme`, `placeholder` and `example` are refused
  in production, exit 78): `src/lib/runtime-env-schema.js`, `tests/security/runtime-env-schema.test.ts`. Used in the
  [host handbook](../operations/host-handbook.md) (section 6) and the [breach runbook](breach-runbook.md)
  (section 5.2). The same file requires `NEXT_PUBLIC_SITE_URL` and `BUILD_SITE_URL` to be a bare lowercase https
  origin in production (no path, query, fragment or credentials; one trailing slash is accepted).
