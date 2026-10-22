# Data subject requests runbook

How the host answers a request to access, port, erase, correct or restrict personal data
within the one month that the privacy notice promises.

- Verified against the code on 2026-10-21 (the tree after commit `ae1449d`, with the complete per-guest
  export and the admin login audit merged). Every SQL statement below was run on PostgreSQL 16 after
  applying all migrations. The erasure and retention behaviour was checked by running the real code
  (`eraseGuestByAdmin`, `runRetention`) against that database, and so was the admin export
  (`getCompleteGuestExport`, section 6.1), whose file was compared with the statement of section 6.3.
- This is an operating guide, not legal advice. Fields only the owner can fill are marked
  `<OWNER: ...>`. Questions for a lawyer are marked `<OWNER/lawyer: ...>`.
- Related: [record of processing](record-of-processing.md), [processors](processors.md),
  [proposed notice changes](proposed-notice-changes.md), [breach runbook](breach-runbook.md),
  [host handbook](../operations/host-handbook.md).

## 1. What the notice promises

The privacy notice (`src/i18n/domains/legal.ts`, "Your rights") tells guests that they can ask for
access, rectification, erasure, restriction and portability, and object to processing based on
legitimate interest, by writing to the e-mail address shown on the page (`HOST_CONTACT.email` in
`src/data/contact.ts`). It also says:

> We reply within one month of receiving your request. For complex or numerous requests this
> period can be extended by two further months; we will tell you so within the first month.

So every request has a hard deadline, and an extension is only valid if the guest is told within the
first month. Answering is free of charge. Do not answer late because the work is "almost done":
send the extension notice (section 11) instead.

Two roles appear in this document:

- **The owner** decides and writes to the guest.
- **The operator** is whoever has `ssh` access to the server. The SQL steps are for the operator.
  One person can be both.

## 2. The one-month calendar

Day 0 is the day the request reaches you in any channel: the contact e-mail, a WhatsApp message, a
Booking.com message, a phone call. Count the same calendar date one month later (a request received
on 31 January is due at the end of February). When in doubt, count fewer days. Asking the guest to
prove who they are does not give you extra time unless a lawyer confirms it for your case.

| When | What | Who |
| --- | --- | --- |
| Day 0 to 2 | Create the log entry (section 12). Write the deadline in it. Send the acknowledgement (section 11). Start the identity check. | owner |
| Day 7 | Identity confirmed. If not, ask once more and say what you need. | owner |
| Day 10 | Search finished: database (section 5) and the places outside it (section 4). Decide whether the request is complex. | operator, owner |
| Day 14 | Draft answer ready. For erasure: the actions of section 7 are done. | owner |
| Day 21 | Answer sent and logged. | owner |
| Day 25 | Last internal day. If anything is still open, send the extension notice now (section 11). | owner |
| Day 0 plus one month | Legal deadline. | |

## 3. Step by step

1. **Log it.** One line in the log of section 12. Do not copy the guest's name, phone number, e-mail
   address or message text into the log.
2. **Acknowledge** within 2 days (template in section 11). Keep the original message in the mailbox
   or chat where it arrived. Do not forward it elsewhere.
3. **Check who is asking** (section 3.1).
4. **Search** (sections 4 and 5).
5. **Do what was asked**: access and portability (section 6), erasure (section 7), rectification
   (section 8), restriction or objection (section 9).
6. **Answer** with the template of section 11, through a channel you have verified.
7. **Close**: update the log, add the erasure to the ledger if there was one (section 10), delete
   your working files (the export, the notes).

### 3.1 Identity check

The aim is to be reasonably sure that the person is the guest, without collecting more personal data.
Do not ask for a copy of an ID card or passport.

| The request arrives by | Enough to proceed with an access request | For erasure, rectification or restriction |
| --- | --- | --- |
| The Booking.com message thread of the reservation | Yes | Yes |
| WhatsApp or SMS from the phone number stored in the portal account | Yes | Yes |
| E-mail from an address that already appears in your records for this guest | Yes, if the dates of the stay in the request match | Also confirm through the stored phone number or the Booking.com thread |
| E-mail from an address you have never seen | No: first send a message to the phone number you have on record, or in the Booking.com thread, asking the guest to confirm that they sent the request | Same: confirm there before changing anything |
| A third party for the guest | Only with a written authorisation from the guest, confirmed through the stored phone number | Same |

Erasure cannot be undone, so confirm it through the stored phone number or the Booking.com thread
even when the e-mail looks right. If the confirmation does not come, say so in the log and answer
within the month that you could not confirm the identity and what is needed.

If you are asked for the data of a person that the system does not know (no account, no booking with
their details), see "Nothing found" in section 11. You still answer within the month.

## 4. Where a guest's data can be

Inside the application database, which holds one row per fact:

| Table | What is in it about a guest | Links to the guest by |
| --- | --- | --- |
| `users` | phone number (E.164), a one-way hash of the password, created and updated time | the row itself |
| `bookings` | stay dates, source, reservation reference, claim time | `user_id` (cleared by an erasure) |
| `check_in_requests` | phone copy, requested arrival time, free-text message (up to 500 characters), decision | `user_id`, `booking_id` |
| `terms_acceptances` | which version of the guest terms was accepted and when | `user_id` |
| `sessions`, `refresh_token_families`, `refresh_tokens` | sign-in sessions: times, a keyed hash of the browser, hashed secrets | `user_id` |
| `booking_claim_grants` | the access links issued for the booking: times, no raw token | `booking_id` |
| `security_audit_events` | claim and access-reset events: time, booking id, for a claim a keyed hash of the IP address; refresh-token replay events: time and a random refresh-family id | `details.bookingId`; for a replay event `details.familyId` (section 6.2) |
| `outbox_events` | delivery status of the arrival notification (no phone or message in the row) | `check_in_request_id` |
| `privacy_requests` | earlier privacy requests: type, status, times, the audit note you typed | `user_id`, then only `subject_digest` after an erasure |

Outside the database. Search all of these before you answer, and tick the ones you do not use:

- [ ] The contact mailbox (`HOST_CONTACT.email`) and any other mailbox you used with the guest.
- [ ] WhatsApp, SMS, phone contacts and call history.
- [ ] The Booking.com extranet: the reservation, the guest's name and contact details, special requests,
      messages. Booking.com is also a controller for its own processing: the guest can ask Booking.com
      for what it holds. <OWNER/lawyer: confirm how to word this>
- [ ] The arrival-notification service that receives the webhook (`CHECKIN_REQUEST_WEBHOOK_URL`):
      <OWNER: name the service and where to search in it>. Each notification carries the guest's phone
      number and message. A second one is sent when you approve or reject the request.
- [ ] The tax and accounting records, including the short-term stay declaration to AADE.
      They are kept as long as tax law requires (<OWNER/lawyer: period>); say so in the answer.
- [ ] Backups (section 10), server logs (section 7.4) and Cloudflare (it sees every request).
- [ ] Paper notes, spreadsheets, photos of documents.

## 5. Finding the guest in the system

### 5.1 In the admin

1. Log in at `/admin/login` and open **Guests** (`/admin/guests`, the "Guest Data Viewer").
2. In **Search Bookings** choose **Phone Number** and type the number. The search resolves the number
   like sign-in does: the international reading first, then the Greek national form. If you type the
   number exactly as the guest wrote it and nothing is found, try it with and without `+30`
   (see the phone formats in the [host handbook](../operations/host-handbook.md)).
3. Other searches: **Booking Reference** (an exact match on the reservation reference you typed when
   you created the booking) and **Date**.
4. The booking cards show the guest's phone number. A card with "No guest account linked yet" is linked
   to no account.

### 5.2 In the database (the operator)

Commands below assume you are in the directory that holds `docker/docker-compose.prod.yml` and the
root-owned `.env`, as in [scripts/README.md](../../scripts/README.md). Run as root. Run
`unset HISTFILE` first, so that the shell does not save the phone numbers that you type into its
history, and `umask 077`, so that working files are private.

Save the statement in a file (`nano find.sql`), edit the first lines, then run it like this:

```
docker compose -f docker/docker-compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f -' < find.sql
```

Where is the guest? Every count should be explained before you answer. The statement also looks in
the free-text message, because a guest can type a phone number or a name there.

```sql
\set phone '+30XXXXXXXXXX'
\set email 'name@example.com'
\set name 'Surname'

SELECT 'users (phone)' AS found_in, count(*) AS "rows"
FROM users WHERE phone_e164 = :'phone'
UNION ALL
SELECT 'check_in_requests (phone, also in the message)', count(*)
FROM check_in_requests
WHERE guest_phone = :'phone' OR position(:'phone' in COALESCE(message, '')) > 0
UNION ALL
SELECT 'check_in_requests (e-mail, also in the message)', count(*)
FROM check_in_requests
WHERE lower(guest_email) = lower(:'email')
   OR position(lower(:'email') in lower(COALESCE(message, ''))) > 0
UNION ALL
SELECT 'check_in_requests (name, also in the message)', count(*)
FROM check_in_requests
WHERE lower(guest_name) = lower(:'name')
   OR position(lower(:'name') in lower(COALESCE(message, ''))) > 0;
```

`guest_name` and `guest_email` are never written by the current portal; only old rows can hold them.
The application stores no name or e-mail address of a guest anywhere else.

## 6. Access and portability

The guest may ask for a copy of the data (Article 15) and for the data they provided in a structured,
machine-readable form (Article 20). One JSON file answers both: the file of the admin export (6.1). The
statement of 6.3 reads the same data from the database again. It is the cross-check of that file, and the only
source of the four sets that the export leaves out on purpose (6.2).

### 6.1 The admin export

1. In `/admin/guests`, find the guest (section 5.1) and press **Export all guest data** on the card of any of
   their bookings. For a claimed guest every booking of the account gives the same file, except for the keys
   `exportedAt` and `booking`. On a card with "No guest account linked yet" the button exports that booking alone.
2. The browser saves `guest_data_<booking id>_<time>.json` (the time is the number of milliseconds since
   1 January 1970). The button calls `GET /api/admin/guests?action=export&bookingId=<booking id>`: the admin
   session cookie is the only authentication, a request whose Origin header names another site is refused, and
   the response is not cached.
3. The file is read in one database transaction (one snapshot), so a claim or an erasure that runs meanwhile
   cannot leave a half-erased file.

What the file holds:

| Key | Content |
| --- | --- |
| `exportedAt` | when the file was made |
| `booking` | the booking whose button was pressed (the same fields as one entry of `bookings`) |
| `user` | the portal account: `id`, `phone`, `createdAt`, `updatedAt`; `null` while nobody has claimed the booking |
| `bookings` | every booking linked to the account, by start date (only the pressed booking when there is no account): `id`, `source`, `startDate`, `endDate`, `provider`, `externalReference`, `accessStatus`, `claimedAt`, `createdAt`, `updatedAt` |
| `checkInRequests` | every arrival request of the account or on any of these bookings: `id`, `bookingId`, `userId`, `guestName`, `guestEmail`, `guestPhone`, `requestedTime`, `message`, `status`, `createdAt`, `updatedAt` |
| `termsAcceptances` | which version of the guest terms was accepted, and when: `bookingId`, `termsVersion`, `acceptedAt` |
| `privacyRequests` | earlier privacy requests of the account: `id`, `bookingId`, `requestType`, `status`, `requestedAt`, `completedAt`, `auditNote` |
| `portalSessions` | the portal sign-in sessions: `bookingId`, `createdAt`, `expiresAt`, `revokedAt` |

Times are ISO 8601 strings in UTC. `startDate` and `endDate` are midnight UTC of the calendar date
(`2030-07-14T00:00:00.000Z` is 14 July 2030). An empty column is `null`, so the file shows which columns exist.
For a booking that nobody has claimed, `user` is `null`, `bookings` holds that booking, `checkInRequests` holds
the arrival requests attached to it, and the three lists that exist only for an account (`termsAcceptances`,
`privacyRequests`, `portalSessions`) are empty.

The columns are named one by one in the code (`src/lib/guestDataExport.ts`), never taken with `include`: a
column that is added to the schema later stays out of the file until someone adds it there. The test
`tests/unit/guest-data-export.test.ts` checks that no list selects a secret and that every model that points at
a user or a booking is either exported or recorded as left out.

### 6.2 What the admin export leaves out

**On purpose, four sets of rows.** The code comment names them: they hold token digests, token hashes, device
and address hashes, or the host's own security log.

| Left out | Table | Why | What the statement of 6.3 shows of it |
| --- | --- | --- | --- |
| The access-link records | `booking_claim_grants` | token digests | `booking_claim_grants`: channel and the times of issue, expiry, use and revocation; no digest |
| The refresh-token families and tokens | `refresh_token_families`, `refresh_tokens` | token hashes, a device hash (the address-hash column is never written) | `refresh_token_families`: creation, absolute expiry and revocation times, the reason, and whether a device or address hash is stored; the tokens are not listed |
| The delivery rows of the arrival notifications | `outbox_events` | delivery bookkeeping without guest content | `outbox_events`: event type, status, creation and delivery time |
| The security log entries about the stays | `security_audit_events` | keyed address hashes and, for the portal events, a booking id | `security_audit_events` whose `details` name one of the account's bookings (claim, access reset): time, type, severity, path, details, and whether an address hash is stored |

**Also never selected, in the tables that are exported:** the password hash, the session id (it is also the
first half of the refresh token), the hash of the accepted terms text (the version names the text) and the
subject digest of an erasure record.

**Refresh-token replay events** (`portal.refresh_token_replay`, high severity) are left out of the admin export
and out of the statement. They belong to the security log above. They carry the random refresh-family id
(`details.familyId`), the reason, the path and, when the request had one, a correlation id, but no booking id, no
account id, no phone number and no address hash. The statement finds security events through
`details ->> 'bookingId'`, which they do not have. A person can be linked to one only through the family row of the
account, and only while that row exists: families are deleted 30 days after their absolute expiry, the event after
90 days (section 7.3), and an erasure deletes the family at once. If the owner decides that they belong in the
answer, find them by the family ids of the account (the statement lists the families):

```sql
\set phone '+30XXXXXXXXXX'

SELECT occurred_at, severity, details
FROM security_audit_events
WHERE event_type = 'portal.refresh_token_replay'
  AND details ->> 'familyId' IN (
    SELECT f.id FROM refresh_token_families f JOIN users u ON u.id = f.user_id WHERE u.phone_e164 = :'phone')
ORDER BY occurred_at;
```

`<OWNER/lawyer: open decision. Is the file of the admin export alone a sufficient answer to an access request,
or must the four omitted sets be added from the statement of 6.3, and the replay events from the separate
query above? The code leaves them out so that no digest or hash leaves the system; whether the times, the delivery
status and the security log entries are personal data that the answer must show is for the owner and a lawyer.
Until this is decided, the safe course is to run the statement, add the four lists to the answer, and run the replay
query as a separate optional step.>`

### 6.3 The cross-check (operator)

Run the statement for two purposes: to check that the downloaded file is complete, and to get the four omitted
sets if the owner decides that they belong in the answer. It starts from the phone number of the account, in the
form stored in the system (`+` and the country code, no spaces; check with the find statement of section 5.2).

For a claimed guest, these counts must be equal, apart from the difference noted below for `privacy_requests`; if
they are not, find out why before you send anything:

| Statement | Admin export |
| --- | --- |
| `users` (one row) | `user` (not `null`) |
| `bookings` | `bookings` |
| `check_in_requests` | `checkInRequests` |
| `terms_acceptances` | `termsAcceptances` |
| `privacy_requests` | `privacyRequests` |
| `sessions` | `portalSessions` |

Differences that are not errors:

- The statement starts from the account, the export from a booking. For a booking that nobody has claimed, the
  statement finds nothing, and the export holds the booking and the arrival requests attached to it.
- Key names are in `snake_case` in the statement and `camelCase` in the export. The statement writes the dates
  of a stay as plain dates (`2030-07-14`) and times with an offset (such as `+00:00`); the export writes
  midnight-UTC instants and times ending in `Z`.
- The statement adds `password_set` (whether a password exists) to `users`, and the `id` and `content_hash` (the
  hash of the terms text) to `terms_acceptances`. The export has none of the three.
- `privacy_requests`: the statement also finds erasure records by their digest, the export only by the link to
  the account.
- The four sets of 6.2 are only in the statement.

Save the statement as `cross-check.sql`, replace the phone number on the first line, and run:

```
docker compose -f docker/docker-compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At -f -' < cross-check.sql > cross-check.json
```

```sql
\set phone '+30XXXXXXXXXX'

WITH u AS (
  SELECT id, phone_e164, (password_hash IS NOT NULL) AS password_set, created_at, updated_at
  FROM users WHERE phone_e164 = :'phone'
),
b AS (
  SELECT id, source, provider, external_reference, start_date, end_date, access_status,
         claimed_at, created_at, updated_at
  FROM bookings WHERE user_id IN (SELECT id FROM u)
),
c AS (
  SELECT id, booking_id, user_id, guest_name, guest_email, guest_phone, requested_time, message,
         status, created_at, updated_at
  FROM check_in_requests
  WHERE user_id IN (SELECT id FROM u) OR booking_id IN (SELECT id FROM b)
),
t AS (
  SELECT id, booking_id, terms_version, content_hash, accepted_at
  FROM terms_acceptances WHERE user_id IN (SELECT id FROM u)
),
p AS (
  SELECT id, booking_id, request_type, status, requested_at, completed_at, audit_note
  FROM privacy_requests
  WHERE user_id IN (SELECT id FROM u)
     OR subject_digest IN (
       SELECT encode(sha256(convert_to('privacy-subject:v1:user:' || id::text, 'UTF8')), 'hex') FROM u)
),
s AS (
  SELECT booking_id, created_at, expires_at, revoked_at
  FROM sessions WHERE user_id IN (SELECT id FROM u)
),
f AS (
  SELECT id, created_at, absolute_expires_at, revoked_at, revocation_reason,
         (device_hash IS NOT NULL) AS device_hash_stored, (ip_hash IS NOT NULL) AS ip_hash_stored
  FROM refresh_token_families WHERE user_id IN (SELECT id FROM u)
),
g AS (
  SELECT id, booking_id, channel, created_at, expires_at, consumed_at, revoked_at
  FROM booking_claim_grants WHERE booking_id IN (SELECT id FROM b)
),
e AS (
  SELECT id, event_type, severity, occurred_at, path, (ip_hash IS NOT NULL) AS ip_hash_stored, details
  FROM security_audit_events WHERE details ->> 'bookingId' IN (SELECT id::text FROM b)
),
o AS (
  SELECT id, check_in_request_id, event_type, status, created_at, delivered_at
  FROM outbox_events WHERE check_in_request_id IN (SELECT id FROM c)
)
SELECT jsonb_pretty(jsonb_build_object(
  'exported_at', now(),
  'users', COALESCE((SELECT jsonb_agg(to_jsonb(u)) FROM u), '[]'::jsonb),
  'bookings', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.start_date) FROM b), '[]'::jsonb),
  'check_in_requests', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at) FROM c), '[]'::jsonb),
  'terms_acceptances', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.accepted_at) FROM t), '[]'::jsonb),
  'privacy_requests', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.requested_at) FROM p), '[]'::jsonb),
  'sessions', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at) FROM s), '[]'::jsonb),
  'refresh_token_families', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at) FROM f), '[]'::jsonb),
  'booking_claim_grants', COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.created_at) FROM g), '[]'::jsonb),
  'security_audit_events', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.occurred_at) FROM e), '[]'::jsonb),
  'outbox_events', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at) FROM o), '[]'::jsonb)
));
```

What the statement does not contain, on purpose: the password hash (only `password_set`), the session ids, the
hashes of refresh tokens, the digests of access links, and the keyed address and browser hashes themselves
(only whether one is stored). They are secrets or meaningless to the guest. If the guest explicitly asks for
the stored hashes, decide with a lawyer. An empty list means there is nothing in that table.

What the four extra keys mean, for the answer (if the owner decides to add them):

| Key | Meaning |
| --- | --- |
| `refresh_token_families` | sign-in families: times, whether a browser hash is stored |
| `booking_claim_grants` | the one-time access links issued for the stays: times and channel |
| `security_audit_events` | security log entries about the stays (claim, access reset) |
| `outbox_events` | whether the arrival notification was delivered |

Add what is outside the database (section 4): the reservation data in the Booking.com extranet, your
messages with the guest, the tax records.

**Delivering it.** Send the file through the verified channel (section 3.1), as an attachment and not
pasted into the message. If the arrival messages may contain sensitive text, or the request arrived
from an e-mail address that you could only confirm indirectly, encrypt the attachment and give the
password through a second channel (the stored phone number). Delete the downloaded
`guest_data_<booking id>_<time>.json`, `cross-check.json` and `cross-check.sql` when the request is closed.
Both the export and the statement list the data of this guest only; check that the file mentions no other
guest before you send it.

**Portability.** The file of the admin export satisfies Article 20 for the data the guest provided (phone
number, arrival time, message). If the guest asks you to send it to another controller, and it is technically
feasible, send the file there; confirm the recipient with the guest first.

## 7. Erasure

### 7.1 Before you erase

1. Confirm who asks (section 3.1) through the stored phone number or the Booking.com thread.
2. **Run the admin export of section 6.1 first, even if the guest only asked for erasure.** The file holds the
   identifiers (phone number, account id, booking ids, request ids) that you need to find and delete
   the copies outside the system (section 7.4). Keep it until section 7.4 is done, then delete it.
3. Tell the guest what happens (section 7.2), in particular that the portal account is gone for
   good and that a current stay would lose the portal access (including the Wi-Fi password in the
   app) until you issue a new claim.

### 7.2 Do it in the admin

1. `/admin/guests`, find the guest (section 5.1), and on any of their booking cards press
   **Erase guest** (shown when a guest account is linked).
2. Confirm the dialog "Erase all personal data of the guest ... This cannot be undone."
3. The second dialog asks for the **reason and how the request was verified**. Write it without any
   name, phone number or e-mail address, for example: `Erasure requested by e-mail, confirmed by
   WhatsApp to the number on the booking.` At least 3 characters. The note is stored and kept. The
   system masks e-mail addresses and phone numbers, but it does **not** remove names or reservation
   codes, so do not type them (checked: a name and a reservation code typed in the note were stored
   as typed).
4. If you see "Erasure is blocked while a related webhook delivery is active; retry shortly", an
   arrival notification is being sent at this moment. Wait a minute and press the button again.
5. The list refreshes and the guest's bookings show "No guest account linked yet".
6. The API behind the button is `POST /api/admin/guests/{userId}/erase`; the admin session cookie is
   the only authentication.

What the button does (checked by running the real `eraseGuestByAdmin` code on a seeded PostgreSQL 16):

- Deletes the account (`users` row: phone number and password hash) and with it the sign-in sessions,
  refresh-token families and tokens, and the terms acceptances.
- Keeps every booking of the guest, but unlinks it: no account, status back to unclaimed, claim time
  cleared. The one-time access links of these bookings are revoked. The bookings can be claimed again.
- On every arrival request of the guest or of these bookings: clears name, e-mail, phone and message
  and the link to the account. A request that was still undecided becomes **rejected** (so the booking
  can receive a new request). The requested time, the decision, the times and the link to the booking
  stay.
- Cancels arrival notifications that were not delivered yet (marks them dead with the content removed;
  the next operations run, within 5 minutes, deletes them).
- Writes an **erasure record** (`privacy_requests`, status COMPLETED) and a security event
  `privacy.erasure.completed`.

### 7.3 What stays, and for how long

Say this in your answer. Items marked "no automatic deletion" are kept until someone deletes them.

| What stays | Where | Why | How long |
| --- | --- | --- | --- |
| Booking row: dates, source (direct or platform), provider, reservation reference, created and updated time. No link to a person. | `bookings` | the host's tax and bookkeeping records | no automatic deletion; tax-law period `<OWNER/lawyer>` |
| The arrival request without name, e-mail, phone, message and account link: requested time, decision, times, booking link | `check_in_requests` | the booking keeps its history; without contact data it identifies nobody | no automatic deletion |
| The erasure record: id, request and completion time, a SHA-256 digest of the (random) account id, and your audit note | `privacy_requests` | proof that the request was handled | no automatic deletion today (see [proposed notice changes](proposed-notice-changes.md), item b) |
| The security events about the guest's claim (time, booking id, a keyed hash of the IP address) or access reset (time, booking id) | `security_audit_events` | abuse detection | deleted 90 days after the event |
| The event `privacy.erasure.completed` (request id and digest) | `security_audit_events` | audit | deleted 90 days after the event |
| `portal.refresh_token_replay` events (time, the path, the reason, a random refresh-family id in `details.familyId`; no booking id, no account id, no address hash). Neither the admin export nor the statement of section 6.3 returns them (section 6.2); after the erasure the family row is gone and the event no longer points to a person | `security_audit_events` | abuse detection | deleted 90 days after the event |
| Delivered notification rows (status and times only, no phone or message) | `outbox_events` | delivery tracking | deleted 30 days after delivery |
| Revoked access links (digests, no raw token) | `booking_claim_grants` | | deleted 30 days after they expire |
| Application logs of the `web` container: random ids of the account, booking and request in some lines, page paths, error text; no phone numbers or names | Docker `json-file` logs | operation | rotated by size (5 files of 10 MB per container), not by age; the worker containers are removed after each run |
| Web server error log: can hold an IP address and the requested page | Nginx on the host | operation | 14 days if the logrotate rule of the [origin runbook](../deployment/origin-ingress-runbook.md) is installed |
| Backups | off-site storage | recovery | until the backup expires, `<OWNER: backup retention>` (section 10) |
| The copy in the arrival-notification service | outside the system | received the webhook | until **you** delete it (section 7.4) |

### 7.4 Outside the system (do this yourself)

1. **Arrival-notification service.** Erasure in the admin cannot reach it. Open the service
   `<OWNER: name>` and delete every notification of this guest. The webhook body contains `eventId`,
   `requestId`, `bookingId`, `userId`, `guestPhone`, `requestedTime`, `message`, the status and the
   time, so search for the phone number, the account id (`userId`) and the booking id from the export
   file. Check also for copies the service forwarded (its mailbox, a spreadsheet, a chat channel).
2. **Your own mailbox, WhatsApp, notes.** Delete what is not needed any more. Keep the correspondence of
   this request itself and the log entry. Keep what tax law requires.
3. **Logs.** Single lines cannot be removed. After the erasure the ids in them no longer point to a
   person. Nothing to do; mention the log rotation in the answer if the guest asks.
4. **Cloudflare, hosting provider, Booking.com**: independent of this system; see [processors](processors.md).
   The guest can address Booking.com for what Booking.com holds.
5. **Backups**: see section 10.

### 7.5 Check that it worked

Run the find statement of section 5.2 again with the same phone number. Every count must be 0.
Then search the admin for the phone number: no booking should show it. Update the log and write the
ledger entry (section 10).

### 7.6 Automatic erasure after the stay

Nobody has to act on a stay that is over. Each run of the operations worker (every 5 minutes) clears
the contact data of the arrival requests of bookings that ended more than 12 months ago, and of
arrival requests without a booking that were created more than 12 months ago
(`GUEST_DATA_RETENTION_MONTHS` in `src/data/stayPolicy.ts`, confirmed by the owner on 2026-10-20) and
erases accounts whose bookings all ended more than 12 months ago, up to 25 accounts per run, through
the same audited path as the button (the erasure record then says "Automatic retention: ..."). An
account with one recent booking and one old one is kept; the old arrival request is still cleared. The
retention was run on the seeded test database to confirm these edges: a booking that ended 12 months
and 2 days ago was erased, one that ended 12 months minus 2 days ago was kept.

If the guest asks for erasure earlier, use the button. If the guest has a current booking and wants
to keep using the portal, tell them that erasure removes the account.

## 8. Rectification

There is no admin screen for it. Cases:

- **A wrong phone number** (typo, or the guest changed number, or "Abroad" was chosen for a national
  number): the app-supported way is **Erase guest** followed by **Issue claim** for the booking, so
  that the guest claims again with the right number (see the host handbook). The operator can instead
  correct the number in place:

  ```sql
  \set old_phone '+30XXXXXXXXXX'
  \set new_phone '+30YYYYYYYYYY'

  BEGIN;

  UPDATE users
  SET phone_e164 = :'new_phone', updated_at = now()
  WHERE phone_e164 = :'old_phone'
  RETURNING id, phone_e164;

  UPDATE check_in_requests
  SET guest_phone = :'new_phone'
  WHERE guest_phone = :'old_phone'
    AND user_id = (SELECT id FROM users WHERE phone_e164 = :'new_phone')
  RETURNING id, guest_phone;

  COMMIT;
  ```

  The new number must be `+`, a non-zero digit and 7 to 14 more digits, and no other account may
  use it. Otherwise the statement stops with an error (a unique-key or a check-constraint error, both
  tested) and **nothing is changed**, because `psql` stops at the first error and the open
  transaction is rolled back. Run it with `-v ON_ERROR_STOP=1` as in section 5.2, and check that the
  first `RETURNING` printed exactly one row. The guest then signs in with the new number. Correct the
  copy in the arrival-notification service by hand.
- **Booking dates or reference**: bookings cannot be edited in the admin. A booking created with a
  typo stays; create the correct booking and issue the claim for that one. A booking that is never
  claimed is linked to nobody.
- **Wrong arrival time or message**: the guest cannot edit a pending request. Reject the pending
  request in `/admin/requests`; the guest can then send a new one until the check-in date. A decided
  request is final.
- **Anything else** (a wrong name in your own records, in Booking.com, in the notification service):
  correct it where it is.

Tell the guest which data was corrected and where.

## 9. Restriction and objection

**Restriction (Article 18).** The application has no "on hold" switch. What the host can do today is to
stop using the data: block the sign-in, keep the rows, and do nothing else with them. The operator
runs this (it does what the admin "Reset access" does, without issuing a new token; tested):

```sql
\set phone '+30XXXXXXXXXX'

BEGIN;

CREATE TEMP TABLE target ON COMMIT DROP AS
  SELECT id FROM users WHERE phone_e164 = :'phone';

UPDATE users SET password_hash = NULL, updated_at = now()
WHERE id IN (SELECT id FROM target)
RETURNING id, (password_hash IS NULL) AS sign_in_blocked;

UPDATE sessions SET revoked_at = now()
WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM target);

UPDATE refresh_tokens SET revoked_at = now()
WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM target);

UPDATE refresh_token_families SET revoked_at = now(), revocation_reason = 'restriction_request'
WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM target);

UPDATE booking_claim_grants SET revoked_at = now()
WHERE revoked_at IS NULL AND consumed_at IS NULL
  AND booking_id IN (SELECT id FROM bookings WHERE user_id IN (SELECT id FROM target));

COMMIT;
```

Notes:

- The guest cannot sign in until you lift the restriction with **Reset access** on a booking that is
  claimed and inside the access window (the guest then sets a new password), or with an erasure.
- The automatic retention is not paused. If the restriction is requested because the guest needs the
  data for a legal claim (Article 18(1)(c)), run the admin export of section 6.1, store the file in the
  restricted case folder, and decide with a lawyer whether to keep it until the claim is settled. The
  application itself has no hold.
- Write in the log when the restriction started and ended, and tell the guest before you lift it.

**Objection (Article 21).** The notice names only processing based on legitimate interest: the
delivery and protection of the site, and security. The portal runs on the contract (Article 6(1)(b)).
An objection to the portal means ending the use of the portal: offer the erasure. An objection about
security events cannot be met item by item (they hold a keyed hash only and expire after 90 days);
note it in the log, explain this, and decide with a lawyer when in doubt.

## 10. Backups and restores

An erasure does not reach backups. The copy disappears when the backup expires.
`<OWNER: backup retention in days, from the backup runbook>`. Say that in the answer.

If the database is restored from a backup, everyone who was erased **after** that backup was taken
is back. Re-apply their erasures **before the portal is used again**. The `privacy_requests` table
cannot help, because it was restored too. The ledger can: it is kept outside the database.

**The ledger.** After every erasure on request, copy these values from the database into the ledger
(a private file outside the database and outside the repository checkout, readable by the owner and
the operator only; it must survive a restore). They carry no phone number and no name:

```sql
SELECT id, subject_digest, completed_at
FROM privacy_requests
WHERE request_type = 'ERASURE' AND status = 'COMPLETED'
ORDER BY completed_at DESC
LIMIT 5;
```

The newest row is the one you just made. The digest is the SHA-256 of `privacy-subject:v1:user:` plus
the account id, so it can be recomputed for every account in a restored database. Keep a ledger entry
until the oldest backup that could contain the guest has expired, then delete it.
Erasures done by the automatic retention are not needed in the ledger: the retention erases the
restored accounts again within minutes, because they still qualify.

**After a restore, do this in order:**

1. Stop the `web` service and the worker timers, then restore.
2. Switch the portal off in the database, so that nobody signs in while the old accounts exist:

   ```sql
   UPDATE operational_settings
   SET value = value || '{"portalEnabled": false}'::jsonb, updated_at = now()
   WHERE key = 'feature_flags'
   RETURNING key, value;
   ```

   It prints one row. If it prints none, the row is missing and the portal is off by default in
   production.

3. Start `web` (`docker compose -f docker/docker-compose.prod.yml up -d --wait web`).
4. Find the restored accounts that match the ledger. Put the digests in the list:

   ```sql
   SELECT id, phone_e164
   FROM users
   WHERE encode(sha256(convert_to('privacy-subject:v1:user:' || id::text, 'UTF8')), 'hex') IN (
     '<64-character digest from the ledger>',
     '<64-character digest of the next ledger entry>'
   );
   ```

5. For every row: search the phone number in `/admin/guests` and press **Erase guest** (reason:
   `Re-applied after a restore from backup.`). Do not delete rows by hand: a claimed booking cannot lose
   its account without being reset, and the database refuses it.
6. Run the find statement of section 5.2 for each of them. All counts 0.
7. Switch the portal back on in `/admin/settings` (the same change in the database with `true` also
   works), and start the worker timers again.
8. Write the restore and the re-erasures in the log.

## 11. Message templates

Fill the `<...>` fields. Keep each message short. Send them in the language the guest wrote in. These
texts promise only what the system does; adjust the fields in angle brackets.

### Acknowledgement

English

> Subject: Your data protection request
>
> Hello,
>
> We received your request of [date] to [access / receive a copy of / erase / correct / restrict the
> use of] your personal data. We will reply within one month of receiving it, that is by [date].
>
> To protect your data we first need to confirm that the request comes from you. Please confirm it by
> replying to the message we are sending to the phone number of your booking on WhatsApp, or tell us
> the dates of your stay. You do not need to send a copy of an ID.
>
> Kind regards,
> <OWNER: name>

Ελληνικά

> Θέμα: Το αίτημά σας για τα προσωπικά σας δεδομένα
>
> Γεια σας,
>
> Λάβαμε το αίτημά σας της <ημερομηνία> που αφορά τα προσωπικά σας δεδομένα (<πρόσβαση / αντίγραφο /
> διαγραφή / διόρθωση / περιορισμός της επεξεργασίας>). Θα σας απαντήσουμε το αργότερο έως τις
> <ημερομηνία>, δηλαδή μέσα σε έναν μήνα από τη λήψη του αιτήματος.
>
> Για να προστατεύσουμε τα δεδομένα σας, πρέπει πρώτα να βεβαιωθούμε ότι το αίτημα το κάνετε εσείς.
> Παρακαλούμε επιβεβαιώστε το απαντώντας στο μήνυμα που θα σας στείλουμε στο WhatsApp, στον αριθμό της
> κράτησής σας, ή γράψτε μας τις ημερομηνίες της διαμονής σας. Δεν χρειάζεται να μας στείλετε
> αντίγραφο ταυτότητας.
>
> Με εκτίμηση,
> <ΙΔΙΟΚΤΗΤΗΣ: όνομα>

### Extension (send within the first month)

English

> Subject: Your data protection request: more time needed
>
> Hello,
>
> About your request of [date]: it is [complex / one of several requests], because [short reason, for
> example: we need to search several systems]. We therefore need more time. As the General Data
> Protection Regulation allows (Article 12(3)), we extend the period by [one / two] further month(s).
> You will have our answer by [new date] at the latest.
>
> Kind regards,
> <OWNER: name>

Ελληνικά

> Θέμα: Το αίτημά σας για τα προσωπικά σας δεδομένα: χρειαζόμαστε περισσότερο χρόνο
>
> Γεια σας,
>
> Σχετικά με το αίτημά σας της <ημερομηνία>: είναι <σύνθετο / ένα από πολλά αιτήματα>, επειδή <σύντομος
> λόγος, π.χ. πρέπει να ψάξουμε σε περισσότερα συστήματα>. Γι' αυτό χρειαζόμαστε περισσότερο χρόνο.
> Όπως επιτρέπει ο Γενικός Κανονισμός Προστασίας Δεδομένων (άρθρο 12 παρ. 3), παρατείνουμε την
> προθεσμία κατά <έναν / δύο> ακόμη μήνα/μήνες. Θα έχετε την απάντησή μας το αργότερο έως τις <νέα
> ημερομηνία>.
>
> Με εκτίμηση,
> <ΙΔΙΟΚΤΗΤΗΣ: όνομα>

### Answer to an access or portability request

The text describes the file of the admin export (section 6.1). If the owner decides to add the four sets of
section 6.2, add them to the list of what is attached.

English

> Subject: Your data protection request: our answer
>
> Hello,
>
> Attached is a file (JSON) with the personal data that the guest portal system holds about you:
> your portal account (mobile number; the password itself is stored only as a one-way hash and is not
> included), the stays linked to it, your arrival requests (time, message, decision), the record that you
> accepted the guest terms, earlier requests about your data, and the times of your portal sign-ins.
>
> The data comes from you (mobile number, password, arrival requests) and from your booking record
> (dates and reservation reference), which we created. We make no automated decisions about you and
> do not profile you. The purposes, recipients and retention periods are in our privacy notice:
> [link to the privacy notice].
>
> Besides the system, we hold [your booking data in the Booking.com extranet / our messages with you /
> the records that tax law requires].
>
> You can also ask us to correct, erase or restrict the use of your data, and to object to processing
> based on legitimate interest. You can lodge a complaint with the Hellenic Data Protection Authority
> (www.dpa.gr).
>
> Kind regards,
> <OWNER: name>

Ελληνικά

> Θέμα: Το αίτημά σας για τα προσωπικά σας δεδομένα: η απάντησή μας
>
> Γεια σας,
>
> Επισυνάπτουμε αρχείο (JSON) με τα προσωπικά δεδομένα που τηρεί για εσάς το σύστημα της πύλης
> επισκεπτών: τον λογαριασμό σας στην πύλη (αριθμός κινητού· ο ίδιος ο κωδικός αποθηκεύεται μόνο ως μη
> αναστρέψιμο hash και δεν περιλαμβάνεται), τις διαμονές που συνδέονται με αυτόν, τα αιτήματα άφιξής
> σας (ώρα, μήνυμα, απόφαση), την καταγραφή ότι αποδεχθήκατε τους όρους, παλαιότερα αιτήματα για τα
> δεδομένα σας και τις ώρες των συνδέσεών σας στην πύλη.
>
> Τα δεδομένα προέρχονται από εσάς (αριθμός κινητού, κωδικός, αιτήματα άφιξης) και από την καταχώριση
> της κράτησής σας (ημερομηνίες και κωδικός κράτησης), που δημιουργήσαμε εμείς. Δεν παίρνουμε
> αυτοματοποιημένες αποφάσεις για εσάς και δεν δημιουργούμε προφίλ. Οι σκοποί, οι αποδέκτες και οι
> χρόνοι διατήρησης περιγράφονται στην ενημέρωσή μας για την προστασία δεδομένων: <σύνδεσμος>.
>
> Εκτός του συστήματος, τηρούμε <τα στοιχεία της κράτησής σας στο Booking.com extranet / τα μηνύματά
> μας μαζί σας / τα στοιχεία που απαιτεί η φορολογική νομοθεσία>.
>
> Μπορείτε επίσης να ζητήσετε τη διόρθωση, τη διαγραφή ή τον περιορισμό της χρήσης των δεδομένων σας
> και να εναντιωθείτε στην επεξεργασία που βασίζεται σε έννομο συμφέρον. Μπορείτε να υποβάλετε
> καταγγελία στην Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (www.dpa.gr).
>
> Με εκτίμηση,
> <ΙΔΙΟΚΤΗΤΗΣ: όνομα>

### Erasure done

English

> Subject: Your data has been erased
>
> Hello,
>
> We have erased your guest portal account (mobile number, password, sign-in sessions, record of the
> accepted terms) and cleared the contact details and the message from your arrival requests.
> [We have also deleted the copy that our notification service received. Delete this sentence if no
> notification service is configured, and send the mail only after step 7.4 is done.]
>
> Some records remain without any link to you: the dates and the reservation reference of your stay,
> which we keep for our tax obligations, with the arrival time you asked for; a record that the erasure
> took place, without your details; and, for at most 90 days, security log entries that contain no
> name or phone number. Backups expire by [date] and are erased again if one is ever restored.
>
> If you have a stay with us now, the portal will not know you any more; we can issue you a new
> access link.
>
> Kind regards,
> <OWNER: name>

Ελληνικά

> Θέμα: Τα δεδομένα σας έχουν διαγραφεί
>
> Γεια σας,
>
> Διαγράψαμε τον λογαριασμό σας στην πύλη επισκεπτών (αριθμός κινητού, κωδικός, συνεδρίες σύνδεσης,
> καταγραφή αποδοχής των όρων) και καθαρίσαμε τα στοιχεία επικοινωνίας και το μήνυμα από τα αιτήματα
> άφιξής σας. [Διαγράψαμε επίσης το αντίγραφο που είχε λάβει η υπηρεσία ειδοποιήσεών μας. Σβήστε αυτή την
> πρόταση αν δεν έχει ρυθμιστεί υπηρεσία ειδοποιήσεων και στείλτε το μήνυμα μόνο μετά το βήμα 7.4.]
>
> Κάποια στοιχεία παραμένουν χωρίς καμία σύνδεση με εσάς: οι ημερομηνίες και ο κωδικός κράτησης της
> διαμονής σας, που τηρούμε για τις φορολογικές μας υποχρεώσεις, μαζί με την ώρα άφιξης που ζητήσατε·
> μια καταγραφή ότι έγινε η διαγραφή, χωρίς τα στοιχεία σας· και, για το πολύ 90 ημέρες, εγγραφές
> ασφαλείας που δεν περιέχουν όνομα ή τηλέφωνο. Τα αντίγραφα ασφαλείας λήγουν έως τις <ημερομηνία>
> και, αν ποτέ γίνει επαναφορά από αντίγραφο, η διαγραφή εφαρμόζεται ξανά.
>
> Αν βρίσκεστε τώρα στη διαμονή σας, η πύλη δεν θα σας αναγνωρίζει πια· μπορούμε να σας δώσουμε νέο
> κωδικό ενεργοποίησης.
>
> Με εκτίμηση,
> <ΙΔΙΟΚΤΗΤΗΣ: όνομα>

### Nothing found

English

> Subject: Your data protection request
>
> Hello,
>
> We searched the guest portal system, our mailbox and our booking records for the details you gave us
> ([what you searched for, for example: the phone number and the dates of the stay]) and found no
> personal data about you. If you used another phone number, e-mail address or other dates, please
> tell us and we will search again. You can lodge a complaint with the Hellenic Data Protection
> Authority (www.dpa.gr) and seek a judicial remedy.
>
> Kind regards,
> <OWNER: name>

Ελληνικά

> Θέμα: Το αίτημά σας για τα προσωπικά σας δεδομένα
>
> Γεια σας,
>
> Ψάξαμε στο σύστημα της πύλης επισκεπτών, στο γραμματοκιβώτιό μας και στα αρχεία των κρατήσεών μας
> με τα στοιχεία που μας δώσατε (<τι ψάξατε, π.χ. τον αριθμό κινητού και τις ημερομηνίες της
> διαμονής>) και δεν βρήκαμε προσωπικά δεδομένα για εσάς. Αν χρησιμοποιήσατε άλλο αριθμό τηλεφώνου,
> άλλη διεύθυνση e-mail ή άλλες ημερομηνίες, πείτε μας και θα ψάξουμε ξανά. Μπορείτε να υποβάλετε
> καταγγελία στην Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (www.dpa.gr) και να προσφύγετε στη
> δικαιοσύνη.
>
> Με εκτίμηση,
> <ΙΔΙΟΚΤΗΤΗΣ: όνομα>

### When you do not act on a request

If you decline a request, or part of it, tell the guest within the month why, and that they can lodge a
complaint with the Hellenic Data Protection Authority and seek a judicial remedy (Article 12(4)).
Do this with a lawyer. Typical cases: you cannot confirm the identity; the data is needed for a legal
obligation (the tax records); the request is manifestly unfounded or excessive (then you may ask a
reasonable fee or refuse, and you must be able to show why).

## 12. Request log

Keep it in a file or sheet that only the owner and the operator can open: `<OWNER: where>`.
**No personal data in it**: no names, phone numbers, e-mail addresses, or text copied from messages.
The correspondence itself stays in the mailbox or chat; the log refers to it by the label you give it.

| Field | Content |
| --- | --- |
| Request id | `R-<year>-<running number>` |
| Received on / by | date; channel (e-mail, WhatsApp, Booking.com message, phone) |
| Mailbox label or chat reference | for example `DSAR/R-2026-03` |
| Right | access, portability, erasure, rectification, restriction, objection |
| Deadline | day 0 plus one month; extension informed on (date) and new deadline |
| Identity confirmed on / how | date; "stored phone", "Booking.com thread", "address known" |
| Places searched | tick list of section 4 |
| Action taken | export sent on (date); erased on (date); corrected; restricted from / to |
| Outside-the-system cleanup | notification service done on (date); mailbox done on (date) |
| Erasure ledger entry | the request id and the `subject_digest` of section 10 (erasure only) |
| Answer sent on | date; template used |
| Closed on | date; working files deleted on (date) |
| Notes | decisions, lawyer consulted, nothing personal |

Review the log once a quarter: is any request open that is past day 21?
`<OWNER: who reviews>`

## 13. How this was verified

- The statements of sections 5, 6, 8, 9 and 10 were executed on PostgreSQL 16 (the digest-pinned image
  of `docker/docker-compose.prod.yml`), after applying every `prisma/migrations/*/migration.sql` in
  order, on rows inserted with plain `INSERT`s. The failure cases of section 8 (a number that is
  already used, a number in the wrong format) printed the database error and changed nothing.
- The admin export (section 6.1) was run through the real `getCompleteGuestExport` on that database (synthetic
  rows: two accounts, a booking linked to an account without a claim, and an unclaimed booking), and its file
  was compared with the output of the statement of 6.3. For the account, the bookings, the arrival requests, the
  accepted terms and the sessions the two matched field by field. The statement listed one privacy request more,
  an erasure record planted with the digest of the account and no link to it, as section 6.3 says. The four
  extra sets appeared only in the statement. No planted hash, digest or session id was in either file. For the
  unclaimed booking the export held the booking and its arrival request and the statement found nothing. The
  keys and the left-out sets were read from `src/lib/guestDataExport.ts`, `src/app/api/admin/guests/route.ts`
  and `tests/unit/guest-data-export.test.ts`.
- The SQL digest of section 10 equals the digest that `privacySubjectDigest` computes in
  `src/lib/privacyService.ts`.
- `eraseGuestByAdmin` and `runRetention` were run on that database and the rows were compared before
  and after (section 7.2, 7.3 and 7.6). The sign-in, claim and admin behaviour was read from the code:
  `src/lib/portalAuthService.ts`, `src/app/api/admin/guests/**`, `src/lib/privacyService.ts`,
  `src/lib/operationalMonitor.ts`, `src/lib/bookingOutbox.ts`.
- Not verified, because it depends on the live setup: the name and location of the notification
  service, the backup retention, the Docker log driver actually in use, and the installed logrotate
  rule.
