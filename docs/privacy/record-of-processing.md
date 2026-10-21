# Record of processing activities (Article 30 GDPR)

A draft, pre-filled from `prisma/schema.prisma`, the code and the privacy notice
(`src/i18n/domains/legal.ts`). The owner completes and signs it.

- Status: **draft, 2026-10-21**, prepared against the code after commit `ae1449d` (with the admin login audit and
  the complete per-guest export merged). Last reviewed by the owner:
  `<OWNER: date, name>`.
- Fields only the owner can fill are marked `<OWNER: ...>`. Questions for a lawyer are marked
  `<OWNER/lawyer: ...>`. Nothing in this record is a legal conclusion.
- "Legal basis" is copied from what the privacy notice states. Where the notice states none, this record
  says so and does not invent one.
- Article 30(5) frees small businesses from the record, but not where the processing is not occasional.
  The host processes guest data every season, so keep it. `<OWNER/lawyer: confirm>`
- Keep it up to date: change it in the same change as any change of the processing (new data, new
  recipient, new retention). Review it once a year.
- Related: [processors](processors.md), [proposed notice changes](proposed-notice-changes.md),
  [data subject requests](dsar-runbook.md), [breach runbook](breach-runbook.md).

## 1. Controller (Article 30(1)(a))

| Item | Entry |
| --- | --- |
| Controller | The host of the apartment, as named in the "Who is responsible" section of the privacy notice and in `HOST_CONTACT` (`src/data/contact.ts`): Παναγιώτης Βασιλάκης / Panagiotis Vasilakis (the accented Greek spelling still awaits the owner's confirmation, see the README) |
| Brand shown on the site | Dolce Far Niente · Kalamata (`BRAND_NAME`); the brand is not a legal person |
| Address | Αρχιμήδους 21, 241 00 Καλαμάτα, Greece |
| E-mail, phone | the e-mail address and phone number shown in the notice (`HOST_CONTACT`) |
| Joint controllers | none recorded. `<OWNER: the hostess and the owner both run the apartment. If two people decide together on the purposes and means of this processing, record who decides what; "the controller entry" is one of the five open legal questions in the README>` |
| Representative | not needed (established in Greece) |
| Data protection officer | none appointed. `<OWNER/lawyer: confirm that none is required>` |

## 2. Processing activities

Each activity lists purposes, people concerned, data, source, legal basis as stated in the notice,
recipients, transfers, retention as implemented, and the security measures (section 6).

### P1. Delivering and protecting the public site

- **Purpose**: serve the guide, the apartment page, the availability page and the privacy notice;
  protect the site against abuse.
- **People**: visitors.
- **Data**: IP address and the request (page, browser headers, time) as they reach Cloudflare and the
  server. The application stores no raw IP address: it keeps keyed hashes only (P6). The Nginx access
  log (`origin_safe` format) has no address, no query string and no body; the Nginx error log can hold
  the address and the request line.
- **Source**: the visitor's browser.
- **Legal basis in the notice**: legitimate interest in delivering and protecting the site
  (Article 6(1)(f)).
- **Recipients**: hosting provider and Cloudflare (processors); the map providers (independent, P2).
- **Transfers**: Cloudflare, Inc. (USA): EU-US Data Privacy Framework and standard contractual clauses, as
  the notice states.
- **Retention**: Nginx error log 14 days (the notice; the rotation rule is in the
  [origin runbook](../deployment/origin-ingress-runbook.md), and its installation on the live server is
  not verified), Nginx access log: no rotation rule yet, `<OWNER: set one>`. Cloudflare's own logs:
  `<OWNER: what the plan keeps>`. Container logs of the web and database services: rotated by size
  (5 files of 10 MB each per container), not by age.

### P2. Maps

- **Purpose**: show the guide map.
- **Data**: the visitor's browser requests map tiles directly from CARTO (`basemaps.cartocdn.com`, when
  `CARTO_BASEMAPS_KEY` is set; the key is part of the tile URL) or from the OpenStreetMap Foundation
  (`tile.openstreetmap.org`). They receive the IP address, the usual browser headers, the address of our
  site and the tile coordinates. The position of a visitor who presses the locate button is not sent to
  us; it moves the map, so the tile requests change.
- **Legal basis in the notice**: stated under "Browsing" (Article 6(1)(f)).
- **Recipients**: CARTO or the OpenStreetMap Foundation, as independent recipients.
- **Open question**: `<OWNER/lawyer: embedding third-party content that loads straight from the provider can
  make the host a joint controller for the collection and transmission (CJEU Fashion ID, C-40/17). Options:
  accept and document, or serve the tiles through our own server (a code change). Verify.>`

### P3. Guest portal accounts and sign-in

- **Purpose**: let the guest sign in, see the stay information (Wi-Fi, check-out, house rules) and arrange the
  arrival.
- **People**: guests of a booking that the host made claimable and the guest claimed.
- **Data**: `users` (phone number in E.164, bcrypt hash of the password, created and updated time),
  `sessions` (ids, booking, times), `refresh_token_families` and `refresh_tokens` (hashed secrets, a
  keyed hash of the browser, times), `booking_claim_grants` (keyed digest of the one-time token, channel,
  times, which admin session issued it), `terms_acceptances` (version and hash of the accepted guest
  terms, time).
- **Source**: the guest (phone number, password, acceptance), the host (the access link).
- **Legal basis in the notice**: performance of the contract for the stay (Article 6(1)(b)).
- **Recipients**: hosting provider, Cloudflare (in transit). The access link is handed to the guest by a
  channel the host chooses (WhatsApp, Booking.com messages): `<OWNER: list the channels you use>`.
- **Retention (as implemented)**: the account, with its sessions, tokens and terms acceptances, is erased
  once every booking of the account ended more than 12 months ago; sessions are deleted 7 days after they
  expire; refresh tokens and families 30 days after they expire; access links 30 days after they
  expire. Details in section 4.

### P4. Booking records

- **Purpose**: the host's bookkeeping, the link between a stay and the portal account, the access window.
- **People**: guests, indirectly: no name is stored.
- **Data**: `bookings`: stay dates, source (direct or platform), provider (`manual` for every booking
  created in the admin), the reservation reference the host typed (for example a Booking.com
  reservation number), claim status and time.
- **Source**: the host.
- **Legal basis in the notice**: legal obligation of tax law (Article 6(1)(c)), "the booking records that
  Greek tax law requires, for example for the short-term stay declaration to ... (AADE)".
- **Recipients**: hosting provider; AADE receives the declaration, which the host makes outside this system.
- **Retention (as implemented)**: the application never deletes a booking. An erasure unlinks it from the
  person. `<OWNER/lawyer: the period that tax law requires for these rows; "the tax retention of the
  unlinked booking rows" is one of the five open legal questions>`

### P5. Arrival requests and notifications

- **Purpose**: arrange the arrival time; tell the host.
- **People**: guests who send an arrival request.
- **Data**: `check_in_requests`: copy of the phone number, requested time (HH:MM), message (free text, up
  to 500 characters), decision, times. The columns for name and e-mail exist but are not written by the
  current portal. `outbox_events`: event type, status, attempt counters, error text; the payload holds only
  the statuses. When a webhook is configured, every new request and every decision is sent to the
  notification service with: event name, event id, request id, booking id, account id, guest name and
  e-mail (empty today), phone number, requested time, message, status, previous status, time.
- **Source**: the guest.
- **Legal basis in the notice**: performance of the contract (Article 6(1)(b)).
- **Recipients**: the notification service `<OWNER: name, see processors>`; hosting provider.
- **Retention (as implemented)**: name, e-mail, phone and message are cleared when the booking ended more
  than 12 months ago (or at an erasure). The row itself (requested time, decision, times, booking link) is
  never deleted. Outbox rows: delivered 30 days after delivery, dead 30 days after the last update,
  cancelled by an erasure at the next operations run. **The copy in the notification service is outside
  the system and outside the notice's retention line**; the rule proposed in
  [proposed notice changes](proposed-notice-changes.md) item a is to delete it 12 months after the
  booking ended at the latest, and on an erasure request. `<OWNER: adopt a rule>`

### P6. Security and abuse prevention

- **Purpose**: protect accounts and the site.
- **People**: visitors, guests, the admin.
- **Data**: `security_audit_events`: event type, severity, correlation id, keyed hash of the IP address,
  page path (no query string), details (sanitised: phone numbers, e-mail addresses and token shapes are
  masked, sensitive field names are blanked). Written events: client error reports (`client.error`, from
  the browser, with the error name, message and a short stack, redacted), content-security-policy
  reports, claims, access resets, erasures, refresh-token replays and the outcomes of admin sign-ins
  (`admin.login_succeeded`, low, with the id of the admin session; `admin.login_failed`, medium, with the
  attempts left; `admin.login_rate_limited`, medium, with the limit, the window and its end; each with the
  keyed address hash and the path `/api/admin/login`; the secret that was typed is not stored, nor its
  length, nor logged; a refusal is stored once per rate-limit window). `rate_limits`: counters under HMAC
  keys of the client address and of the identifier (phone number, token digest), with the reset time.
  `refresh_token_families.device_hash`: keyed hash of the browser. Request-shape and cross-origin violations
  are logged, not stored.
- **Legal basis in the notice**: legitimate interest in keeping the site and the account secure
  (Article 6(1)(f)).
- **Recipients**: hosting provider.
- **Retention (as implemented)**: security events 90 days; counters until their window ends (deleted by
  the next operations run); families 30 days after absolute expiry.

### P7. Handling privacy requests

- **Purpose**: answer the rights of the guests, and show that it was done.
- **Data**: `privacy_requests` (written for erasures only): subject digest (SHA-256 of the random account id),
  status, times, the audit note typed by the host. Outside the application: the request log and the
  correspondence ([data subject requests](dsar-runbook.md)).
- **Legal basis**: **not stated in the notice**. `<OWNER/lawyer: usually the legal obligation to answer, Articles 12
  to 22>`
- **Recipients**: none.
- **Retention**: the erasure record is never deleted by the application. The log: `<OWNER/lawyer: period>`.

### P8. Operations and monitoring

- **Purpose**: run the site: workers, alerts, settings, the calendar sync.
- **Data**: no personal data about guests. `alerts`, `alert_rules` (rule names and figures; the alert
  webhook carries only these), `operational_settings` (feature flags, check-in and check-out times),
  `calendar_sync_state` (blocked nights as dates, error codes), `rate_periods` (prices and minimum
  nights), `admin_sessions` (ids and times; the admin has no personal identity in the system).
- **Legal basis in the notice**: none needed for guest data; the notice says that alerts contain no
  personal data.
- **Recipients**: the alert service `<OWNER: name>`.
- **Retention**: admin sessions deleted 90 days after absolute expiry; the other tables are not deleted.

### P9. Booking.com calendar

- **Purpose**: show which nights are free.
- **Data**: the server downloads the iCal export from Booking.com with the secret `BOOKING_ICAL_URL`
  and keeps only dates (booked or closed nights, not told apart) and error codes. Nothing about a guest is sent
  to Booking.com or kept. The request carries the secret token and the server's address.
- **Legal basis in the notice**: none needed (no personal data); the notice has an item for Booking.com.

### P10. Administration

- **Purpose**: the host manages bookings, access links, requests, prices, flags.
- **Data**: the admin enters a shared secret; the server records one `admin_sessions` row per login (no
  address, no name). Each sign-in attempt that the rate limiter admits is also stored as a security event
  (P6), and so is the first refusal of each rate-limit window. The admin screens show guests' phone numbers
  and messages to whoever has the secret, and the admin export (**Export all guest data**) gives one guest's
  complete record as a file: the account, its bookings, arrival requests with messages, accepted terms,
  privacy requests and portal sign-in times, but no digest or hash ([data subject
  requests](dsar-runbook.md), section 6).
- **Security**: see section 6; the single shared secret is a known limit (no per-person accounts, and no
  audit of what a session did, except that each access link records the session that issued it).

### P11. Backups

- **Status**: the architecture decision requires encrypted off-site backups; no backup process exists in the
  repository yet. `<OWNER: provider, location, what is copied, encryption, retention, restore test>`
- **Effect on the rights of the guests**: an erasure reaches a backup only when the backup expires, and an
  erasure must be applied again after a restore ([data subject requests](dsar-runbook.md), section 10).
- **Not in the privacy notice** (see [proposed notice changes](proposed-notice-changes.md) item c).

### P12. Outside the application

- **Communications** with guests: the contact mailbox, WhatsApp, Booking.com messages, phone calls.
  Purposes: reply, hand over the access link, arrange arrival. `<OWNER: list the channels and their
  retention>`
- **Tax and accounting records**, and the short-term stay declaration (AADE). `<OWNER/lawyer: records, period>`
- **Booking.com extranet**: the reservations, with the guest data that Booking.com gives the host.
  `<OWNER/lawyer: role of Booking.com and of the host for this data>`
- **Paper, spreadsheets, photos**: `<OWNER: list or "none">`

## 3. Data inventory by table

| Table | Personal data | Kind | Activity |
| --- | --- | --- | --- |
| `users` | `phone_e164`; `password_hash` (derived from a secret the guest chose) | identifier, credential | P3 |
| `bookings` | dates, `external_reference`, `user_id` link | booking data, pseudonymous alone | P3, P4 |
| `sessions` | ids, times, links to user and booking | technical | P3 |
| `refresh_token_families` | `device_hash` (keyed hash of the browser); `ip_hash` is never written | pseudonymous | P3, P6 |
| `refresh_tokens` | hashed secrets, times | credential-derived | P3 |
| `booking_claim_grants` | keyed digest, times, channel | credential-derived | P3 |
| `terms_acceptances` | terms version and hash, time | proof of acceptance | P3 |
| `check_in_requests` | `guest_phone`, `message` (free text); `guest_name`, `guest_email` unused | contact data, free text | P5 |
| `outbox_events` | none in the row; the personal data is joined from `check_in_requests` at send time | technical | P5 |
| `security_audit_events` | `ip_hash`, `path`, sanitised `details` | pseudonymous | P6 |
| `rate_limits` | HMAC keys of address and identifier | pseudonymous | P6 |
| `privacy_requests` | `subject_digest`, `audit_note` (free text typed by the host) | pseudonymous, free text | P7 |
| `alerts`, `alert_rules`, `operational_settings`, `calendar_sync_state`, `rate_periods` | none | none | P8, P9 |
| `admin_sessions` | none about a named person | technical | P10 |

## 4. Retention as implemented

Verified in `src/lib/operationalMonitor.ts` (`runRetention`), `src/lib/privacyService.ts` and
`src/data/stayPolicy.ts` (`GUEST_DATA_RETENTION_MONTHS` = 12, confirmed by the owner on 2026-10-20), and by
running `runRetention` on a seeded PostgreSQL 16 database. The operations worker runs it every 5 minutes.

| Data | Rule | Where |
| --- | --- | --- |
| Name, e-mail, phone and message of an arrival request | cleared when the booking's end date is more than 12 calendar months ago | `runRetention`, update of `check_in_requests` |
| Portal account (phone, password hash) with its sessions, tokens, families and terms acceptances | erased when every booking of the account ended more than 12 months ago; at most 25 accounts per run; the cutoff is checked again inside the erasure transaction, so an account with a newer booking is skipped | `eraseGuestForRetention` |
| Sessions | deleted 7 days after `expires_at` | `runRetention` |
| Refresh tokens | deleted 30 days after `expires_at` | `runRetention` |
| Refresh token families | deleted 30 days after `absolute_expires_at` | `runRetention` |
| Access links (`booking_claim_grants`) | deleted 30 days after `expires_at` | `runRetention` |
| Security events | deleted 90 days after `occurred_at` | `runRetention` |
| Outbox rows | delivered: 30 days after delivery; dead: 30 days after the last update; cancelled by an erasure: at the next run | `runRetention` |
| Admin sessions | deleted 90 days after `absolute_expires_at` | `runRetention` |
| Rate-limit counters | deleted when `reset_time` has passed | `runRetention` |
| Bookings | never deleted | no job |
| Arrival-request rows (without contact data) | never deleted | no job |
| Erasure records (`privacy_requests`) | never deleted | no job |
| Alerts and rules | never deleted (no personal data) | no job |
| Nginx error log | 14 days (the notice; logrotate rule in the origin runbook) | host |
| Container logs | by size, 5 files of 10 MB per container | Docker `json-file` |
| Backups | `<OWNER: ...>` | backup process |
| Copy in the notification service | no rule yet | `<OWNER: ...>` |
| Records that tax law requires | as long as the law sets | the notice |

Cookie lifetimes (set by the application): `lang` 1 year; `guest_session` 2 hours; `guest_rt` 7 days;
`booking_claim_exchange` at most 5 minutes; `admin_jwt` 2 hours (renewed while the admin works, 24 hours at
most).

## 5. Recipients and transfers

Recipients, roles and the status of the data processing agreements are in [processors](processors.md).
Transfers outside the EEA that the notice states: Cloudflare, Inc. (USA), under the EU-US Data Privacy
Framework and the standard contractual clauses. Not stated and to be established: the location and the
safeguards for CARTO, the OpenStreetMap Foundation, the notification service and the backup provider
(`<OWNER/lawyer: ...>`).

## 6. Security measures (Article 32)

As implemented in the code and the documented design. Items marked "design" are specified in the repository
but not proven for the live server (see the "Evidence" notes of the architecture decision).

- **Passwords**: bcrypt, cost 12; minimum length 8; never logged or exported.
- **Access links**: 256 random bits, one use, 30 minutes by default (5 minutes to 24 hours); stored only as an
  HMAC-SHA256 digest keyed with `CLAIM_TOKEN_PEPPER`; the claim travels in a POST body and an exchange cookie, never in a
  URL.
- **Sessions**: signed cookies (2 hours) tied to a database session; rotating refresh tokens with replay
  detection (a replay revokes the family and writes a high-severity event); absolute lifetime 30 days per family;
  cookies are HttpOnly, Secure in production, SameSite Lax (guest) or Strict (admin, claim exchange).
- **Admin**: one shared secret compared in constant time; 5 attempts per 15 minutes per address (an IPv4
  address or an IPv6 /64), every admitted attempt recorded as a security event; session 2 hours idle and 24 hours
  absolute; the admin cookie is HttpOnly and SameSite Strict; the export of a guest's data refuses a request
  whose Origin header names another site.
- **Pseudonymisation**: IP addresses and browser details are stored only as HMACs keyed with
  `SECURITY_PEPPER`, which the database does not hold.
- **Minimisation**: the portal asks only for a phone number and a password; no name, e-mail, address,
  payment data or documents are stored. Logs redact sensitive field names and mask phone numbers and
  e-mail addresses in stored text.
- **Rate limits**: PostgreSQL-backed, per client address and per identifier (sign-in 5 per 15 minutes,
  claim 5 per hour, claim exchange 20 per hour, error and CSP reports bounded); Nginx limits are in observation mode.
- **Transport and edge** (design): HTTPS only, Cloudflare in front with the origin accepting only its
  networks, authenticated origin pull, HSTS, a nonce-based content security policy, the application bound to
  loopback, the database not published.
- **Containers**: read-only file system, no capabilities, `no-new-privileges`; secrets only from
  root-owned runtime files; the image holds no environment file.
- **Retention automation**: section 4.
- **Backups** (design): encrypted before leaving the server; restores proven periodically. Not implemented
  yet.
- **Known limits**: one shared admin secret and no per-person audit; failed admin logins are recorded (medium
  severity) but not alerted; no alert for a missing operations run; Nginx rate limits in dry-run; the live
  evidence of the firewall, Cloudflare settings and the timers is still to be recorded.

## 7. Open points for the owner

1. Controller entry and any joint controller (section 1).
2. The data processing agreement of every processor (see [processors](processors.md)); the location of the
   hosting data centre, the notification service, the alert service and the backup provider.
3. The retention of backups, of the request log, of the erasure record, of the Nginx access log, and the rule for the
   copy in the notification service.
4. The legal basis of P7 and the tax-law period of P4.
5. Whether to change the privacy notice as proposed in [proposed notice changes](proposed-notice-changes.md).
6. A date for the next review: `<OWNER: date>`.
