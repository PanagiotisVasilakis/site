# Personal data breach runbook

What to do when personal data may have been exposed, lost, changed or accessed by someone who must not
have it. Steps for this system under GDPR Articles 33 (notify the authority within 72 hours) and 34
(tell the people concerned).

- Verified against the code on 2026-10-21 (the branch `claude/nice-turing-uidc0s` on 2026-10-22, with the admin login audit and the
  complete per-guest export merged). The SQL statements were run on PostgreSQL 16 after applying all migrations.
- An operating guide, not legal advice. Fields only the owner can fill are marked `<OWNER: ...>`;
  questions for a lawyer are marked `<OWNER/lawyer: ...>`.
- Related: [data subject requests](dsar-runbook.md), [record of processing](record-of-processing.md),
  [processors](processors.md), [runtime credential contract](../security/runtime-credential-contract.md),
  [trusted ingress](../security/trusted-ingress.md), [SECURITY.md](../../SECURITY.md).

## 1. When to use it

A personal data breach is a security incident that leads to the accidental or unlawful destruction,
loss, alteration, unauthorised disclosure of, or access to, personal data. In this system:

- someone used the admin without being entitled to (the admin secret leaked, a logged-in browser was
  stolen);
- a database dump, a backup or the environment file left the server;
- the server, the Cloudflare account, the hosting account or the mailbox was taken over;
- a claim token reached the wrong person, who then claimed a guest's booking;
- the arrival-notification service or any other receiver exposed what it received;
- a message with a guest's data went to the wrong person.

When in doubt, treat it as a breach and start the clock. Stopping a false alarm later costs nothing.
Missing the deadline for a real one does.

## 2. People and contacts

| Role | Who | Contact |
| --- | --- | --- |
| Owner: decides, notifies, speaks to the guests | `<OWNER: name>` | the phone and e-mail in the privacy notice (`HOST_CONTACT`), `<OWNER: private number>` |
| Operator: has `ssh` access, runs the technical steps | `<OWNER: name>` | `<OWNER: phone>` |
| Hosting provider support | `<OWNER: provider, support channel and customer number>` | `<OWNER: ...>` |
| Lawyer or data protection adviser | `<OWNER: name>` | `<OWNER: ...>` |
| Hellenic Data Protection Authority (HDPA) | the authority named in the "Complaints" section of the privacy notice | 1-3 Kifisias Avenue, 115 23 Athens, Greece, www.dpa.gr |

The HDPA publishes the way to notify a breach on its website. **Open www.dpa.gr once now** and read what the
notification asks for, so that you are not learning it at hour 60. This document does not copy a link or
a form, because they change.

If the incident happened at a processor (hosting provider, Cloudflare, notification service, backup
provider), their message to you is what starts your clock. Write down when it arrived.

## 3. The 72-hour clock

**T0 is the moment you become aware** that a breach has happened, with reasonable certainty that
personal data is affected. Write the date and time down at once in the breach register (section 11).

| Time from T0 | What must be done |
| --- | --- |
| 1 hour | Containment started; evidence saved (section 4) |
| 24 hours | What happened, which data, how many people: first answer |
| 48 hours | The notification to the HDPA is written and checked |
| 72 hours | The notification is **sent** (Article 33(1)) |

Unless the breach is unlikely to result in a risk to the people concerned, the authority must be told
without undue delay and, where feasible, within 72 hours. If you cannot meet 72 hours, send what you
have and say why you are late. Information may be sent in phases (Article 33(4)). Even a breach that you
do not report must be documented (Article 33(5)): the facts, the effects and the action taken. Write down
why you decided not to report it.

## 4. The first 60 minutes

Print this page. Do the steps in order. Do not delete anything and do not "clean up" first.

**Minutes 0 to 10: note and call**

- [ ] Write down: time you became aware (T0), who found it, how, and what exactly was seen.
- [ ] Call the other of owner and operator. Decide who leads. One person writes the register.
- [ ] Keep the original evidence (the e-mail, the screenshot, the alert) as it is.

**Minutes 10 to 25: save evidence before you change anything**

Recreating a container (`up -d` after a changed environment) **deletes its log**. Save first, on the server,
into a private folder (`umask 077`; `mkdir incident-<date>`):

```
docker compose -f docker/docker-compose.prod.yml logs --no-color --timestamps web > incident-web.log
docker compose -f docker/docker-compose.prod.yml logs --no-color --timestamps db > incident-db.log
```

- [ ] Run the investigation queries of section 6 and save their output (`> incident-queries.txt`).
- [ ] Copy the Nginx logs of the host: `error.log` and `access.log`.
- [ ] Take screenshots of the Cloudflare security events and of the alert that started this.
- [ ] If a secret will be rotated: the keyed hashes in the database (IP hashes in
      `security_audit_events`) stop matching new ones after a `SECURITY_PEPPER` rotation, so the
      queries must be saved first.

**Minutes 25 to 45: contain**

Choose from section 5 by what happened. The usual first moves:

- [ ] Revoke every admin session (statement in section 5.1) if the admin may be involved.
- [ ] Rotate the secret that may have leaked (table in section 5.2) and recreate `web`.
- [ ] Switch the guest portal off if guest accounts are at risk (`/admin/settings`, or the SQL of
      section 5.1 if the admin is not trusted).
- [ ] Close the way in: remove the exposed file, reset the compromised account password, enable two-step
      login on the account, block the address in Cloudflare.

**Minutes 45 to 60: assess and plan**

- [ ] Count: how many people and which data (queries of section 6).
- [ ] Decide notifiability with the decision aid of section 7. Write the decision and the reasons in
      the register, even if the answer is "not notifiable".
- [ ] Put T0 plus 48 hours in the calendar for the draft notification.
- [ ] Tell the affected provider or processor, and the lawyer.

## 5. Contain

### 5.1 The levers, and what each one really does

| Lever | How | Effect |
| --- | --- | --- |
| Revoke all admin sessions | SQL below | Every logged-in admin browser is logged out at once; the next request is refused. The admin secret itself still works until it is rotated. |
| Rotate `ADMIN_DASH_SECRET` | 5.2 | New logins need the new secret. Sessions that already exist stay valid until they expire (idle 2 hours, absolute 24 hours) or are revoked, so do both. |
| Revoke all guest sessions | SQL below | Every guest is signed out; their sign-in cookies stop working. Guests can sign in again with phone and password if they have an eligible booking. |
| Block all guest passwords | SQL below | Nobody can sign in. A guest with a claimed booking in the access window gets in again through **Reset access** (new password). A guest whose only booking is new and unclaimed cannot use Reset access and cannot claim with the blocked account: use **Erase guest**, then **Issue claim** (host handbook 4.3). |
| Revoke open access links | SQL below | Issued but unused claim tokens stop working. |
| Switch the portal off | `/admin/settings`, **Guest portal**, or SQL below | Sign-up, sign-in, the claim exchange and the token refresh answer 404; the check-in page and the arrival-request API answer 404 as well (they need the portal); the stay hub hides the sign-in, Wi-Fi, check-out and house-rules tiles. Existing sessions are not deleted, they are only useless. The Wi-Fi password, the check-out information and the house rules are all on the check-in page, so guests lose them in the app while the portal is off. |
| Switch check-in off only | `/admin/settings`, **Check-in workflow** | The check-in page (Wi-Fi, check-out information, house rules), the arrival requests and the Wi-Fi display answer 404. Sign-in still works. |
| Stop the site | `docker compose -f docker/docker-compose.prod.yml stop web` | The public site and the admin are down. The database and the workers keep running. |
| Block at the edge | Cloudflare dashboard | Blocks a source or challenges traffic. The origin accepts only Cloudflare sources and an attested client address (see trusted ingress). |

All SQL below is run as in the DSAR runbook: from the directory with `docker/docker-compose.prod.yml` and
the `.env`, as root, after `unset HISTFILE`:

```
docker compose -f docker/docker-compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f -' < file.sql
```

Revoke all admin sessions:

```sql
UPDATE admin_sessions
SET revoked_at = now(), updated_at = now()
WHERE revoked_at IS NULL
RETURNING id;
```

Revoke all guest sessions, refresh tokens and open access links:

```sql
BEGIN;

UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL;

UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL;

UPDATE refresh_token_families
SET revoked_at = now(), revocation_reason = 'incident_response'
WHERE revoked_at IS NULL;

UPDATE booking_claim_grants SET revoked_at = now()
WHERE revoked_at IS NULL AND consumed_at IS NULL;

COMMIT;
```

Block all guest passwords (only when the password hashes may be cracked; see scenario S2):

```sql
UPDATE users SET password_hash = NULL, updated_at = now() WHERE password_hash IS NOT NULL;
```

Switch the portal off without the admin (and, with `true`, back on):

```sql
UPDATE operational_settings
SET value = value || '{"portalEnabled": false}'::jsonb, updated_at = now()
WHERE key = 'feature_flags'
RETURNING key, value;
```

The row is created by the first migration with both flags on. If the statement returns no row, the
setting is missing and the production default applies: portal and check-in are off.

### 5.2 Rotating secrets: what each one does

The effects below are those of the [runtime credential contract](../security/runtime-credential-contract.md)
and of [trusted ingress](../security/trusted-ingress.md); read them before you rotate.

Generate a value with `openssl rand -hex 32` (at least 32 random bytes) and use a different one for every
name: start-up refuses a credential that equals another credential, and a pepper that equals a credential.
Edit the root-owned file named by `APP_ENV_FILE`, then **recreate** the web container:

```
docker compose -f docker/docker-compose.prod.yml up -d --wait web
```

Do not use `restart`: it keeps the old environment (checked on 2026-10-21 with Docker Compose v5.6.0:
after editing the env file, `restart` kept the old value and `up -d` recreated the container with the
new one). Check readiness afterwards (`/api/health/ready`). The workers (`outbox`, `operations`) start
a new container for every run, so they take the new value at their next run.

| Secret | If it leaked | What rotating does | Also do |
| --- | --- | --- | --- |
| `ADMIN_DASH_SECRET` | Anyone with it can log in as admin | New logins need the new value; existing admin sessions stay valid | Revoke all admin sessions; hand the new value over out of band |
| `ADMIN_JWT_SECRET` | Anyone with it could forge admin session cookies, but each cookie is also checked against a database session | All existing admin cookies become invalid | Revoke all admin sessions |
| `GUEST_JWT_SECRET` | Forged guest cookies are possible in theory; each is also checked against a database session | All existing guest assertions become invalid | Revoke the refresh families (SQL above); guests sign in again |
| `SECURITY_PEPPER` | Allows testing guesses against the keyed IP and device hashes | No stored refresh token verifies: every guest signs in again when the current session ends; a claim whose exchange came before the rotation fails once with 401; rate-limit buckets start empty; hashed addresses written before no longer match new ones | Save the investigation queries first |
| `CLAIM_TOKEN_PEPPER` | Allows testing guesses against the stored digests of access links | No unconsumed access link can be claimed any more | Issue new links for guests who still need one |
| `ORIGIN_PROXY_SHARED_SECRET` | A caller could try to pose as the proxy | A coordinated change in the app and the rendered Nginx configuration, then a restart of both; a mismatch answers 503; there is no grace period | Follow trusted ingress, "Secret lifecycle" |
| `CHECKIN_REQUEST_WEBHOOK_TOKEN`, `ALERT_WEBHOOK_TOKEN` | Someone could post to, or impersonate, the receiver | The receiver and the env file must be changed together | Rotate at the receiving service |
| `BOOKING_ICAL_URL` | The calendar export of the extranet can be read | Create a new export link in the Booking.com extranet and set it; `<OWNER: confirm in the extranet that the old link stops working>` | |
| `GUEST_WIFI_PASSWORD` | Anyone can join the apartment's Wi-Fi | Change it on the router and in the env file, then recreate `web`. Start-up refuses a value that contains `replace`, `changeme`, `placeholder` or `example` in any letter case, or has fewer than 8 characters: `web` then exits with code 78 | An admin compromise exposes it too: the admin can read it |
| Database role passwords (`POSTGRES_PASSWORD`, the two roles `qr_app` and `qr_migrator`) | Direct access to every table | `ALTER ROLE ... PASSWORD`, then every file that holds the old value (the two env files, and wherever the Compose variable `POSTGRES_PASSWORD` is kept, such as `docker/.env`), then recreate `web` and the next worker runs | Check who connected, `<OWNER: operator>` |
| Account passwords: server login and `ssh` keys, hosting, Cloudflare, Booking.com extranet, mailbox, GitHub, domain registrar | Takeover of the platform | Change, enable two-step login, remove unknown keys and sessions, read the account's activity log | Treat as scenario S3 if the server is involved |

`CARTO_BASEMAPS_KEY` is public by design (it is in the map URLs). If misused, restrict it by domain in
the CARTO dashboard.

## 6. Detect and investigate: what happened, what was exposed

### 6.1 How a breach shows up in this system

| Signal | Where | What it means | Limit |
| --- | --- | --- | --- |
| Alert "Recent high-severity security events" | the alert receiver (`ALERT_WEBHOOK_URL`) and the `alerts` table (query 5 below) | `portal.refresh_token_replay`: a refresh token was presented twice, so a copy of a guest's sign-in cookie was probably used. The token family was revoked at once. Check the event type first (query 4) | The only security rule. High-severity events have two writers: `portal.refresh_token_replay` and `operations.retention_step_failed` (an operations fault, not a breach: a retention step of the operations worker failed; `details.step` names it, see the [monitoring guide](../deployment/monitoring-and-alerting.md)) |
| Alerts "Dead outbox events" and "Stale pending outbox" | same | Arrival notifications fail or wait: the receiver is down, or its token or address changed. Not a breach by itself | |
| Alert "Stale availability calendar" | same | The calendar sync fails (for example the export link was replaced or revoked) | |
| Security events | queries 3, 4 and 8 below | Claims, access resets and erasures that you did not make. Every admin login that reaches the rate limiter: `admin.login_succeeded` (low), `admin.login_failed` (medium) and, once per 15-minute window, `admin.login_rate_limited` (medium) | None of the admin events is high severity, so none of them opens an alert. Kept 90 days. A request that ends before the limiter writes no event (login disabled, invalid body, no attested client address) |
| Admin sessions | query 1 below | One row per admin login | No address, no name |
| Application log | `docker compose -f docker/docker-compose.prod.yml logs web` | `Admin login successful`; 401 then 429 on `/api/admin/login` is a guessing attempt | Lost when the container is recreated; kept by size, not by age |
| Cloudflare dashboard | the Cloudflare account | Blocked or challenged requests, with addresses | Depends on the plan |
| People and providers | e-mail, messages | A guest receives a message from a stranger that quotes their booking; the hosting provider, Cloudflare, Booking.com, GitHub or a researcher writes to you | |

Gaps to know about: alerts are evaluated and sent only by the operations worker, so if its timer stops no alert
opens; alerts reach you only if `ALERT_WEBHOOK_URL` is configured, otherwise the table is the only record; failed
admin logins are stored (query 8) but raise no alert (the one security rule counts high-severity events only).
`<OWNER: arrange an outside check that the operations run happens>`

### 6.2 The queries

Save every output into the incident folder. These statements only read. Run them as in 5.1 (here
without `-At`, to get tables).

```sql
\echo === 1 admin logins (one row per login; no address, no name)
SELECT id, created_at, expires_at, absolute_expires_at, revoked_at
FROM admin_sessions
ORDER BY created_at DESC
LIMIT 20;

\echo === 2 access links issued per admin session (last 30 days)
SELECT issued_by_admin_session_id, count(*) AS grants, min(created_at) AS first_grant, max(created_at) AS last_grant
FROM booking_claim_grants
WHERE created_at > now() - interval '30 days'
GROUP BY issued_by_admin_session_id
ORDER BY first_grant DESC;

\echo === 3 portal and privacy security events (last 30 days)
SELECT occurred_at, event_type, severity, details
FROM security_audit_events
WHERE (event_type LIKE 'portal.%' OR event_type LIKE 'privacy.%')
  AND occurred_at > now() - interval '30 days'
ORDER BY occurred_at DESC
LIMIT 100;

\echo === 4 high and critical security events
SELECT occurred_at, event_type, severity, path, details
FROM security_audit_events
WHERE severity IN ('high', 'critical')
ORDER BY occurred_at DESC
LIMIT 50;

\echo === 5 open alerts
SELECT r.name, r.severity, a.status, a.value, a.opened_at, a.notification_delivered_at, a.notification_last_error
FROM alerts a
JOIN alert_rules r ON r.id = a.rule_id
WHERE a.status IN ('OPEN', 'ACKNOWLEDGED')
ORDER BY a.opened_at;

\echo === 6 failed arrival notifications
SELECT id, event_type, status, attempt_count, last_error, updated_at
FROM outbox_events
WHERE status = 'DEAD' AND NOT (payload @> '{"redacted": true}')
ORDER BY updated_at DESC;

\echo === 7 how many people are in the database
SELECT
  (SELECT count(*) FROM users) AS accounts,
  (SELECT count(*) FROM users WHERE password_hash IS NOT NULL) AS accounts_with_password_hash,
  (SELECT count(*) FROM bookings WHERE user_id IS NOT NULL) AS bookings_linked_to_an_account,
  (SELECT count(*) FROM bookings) AS bookings_total,
  (SELECT count(*) FROM check_in_requests
     WHERE guest_phone IS NOT NULL OR guest_email IS NOT NULL OR guest_name IS NOT NULL OR message IS NOT NULL
  ) AS arrival_requests_with_contact_data,
  (SELECT min(created_at) FROM users) AS oldest_account,
  (SELECT max(created_at) FROM users) AS newest_account;

\echo === 8 admin login events (last 30 days; kept 90 days)
SELECT occurred_at, event_type, severity, left(ip_hash, 10) AS source, details
FROM security_audit_events
WHERE event_type IN ('admin.login_succeeded', 'admin.login_failed', 'admin.login_rate_limited')
  AND occurred_at > now() - interval '30 days'
ORDER BY occurred_at DESC
LIMIT 100;
```

How to read them, and where the evidence stops:

- **Query 1** shows when someone logged in as admin: one row per login, with the validity window. It
  holds no address and no name. A login at a time when nobody of you logged in is the signal.
- **Query 2** links access links to the admin session that issued them. A burst of links from a session
  you do not recognise means someone tried to take over bookings.
- **Query 3** shows claims (`portal.booking_claimed`), access resets (`portal.access_reset`) and
  erasures (`privacy.erasure.completed`). An erasure you did not make means data was destroyed.
  Claims carry a keyed hash of the IP address; the same hash on two claims means the same address.
- **Query 4** shows high-severity events. `portal.refresh_token_replay` (a refresh token
  was presented twice, so a copy of a sign-in cookie was probably used; the family is revoked at once)
  is the security one. `operations.retention_step_failed` is an operations fault (a retention step failed;
  `details.step` and an error code, no personal data): it is not a breach and starts no clock.
- **Query 7** answers "approximate number of data subjects and records" for the notification.
- **Query 8** shows the outcomes of admin logins. `admin.login_succeeded` (low) has `details.adminSessionId`,
  the id of the admin session it created, the same id as in query 1. `admin.login_failed` (medium) has
  `details.remainingAttempts`, the attempts the source still had in its window after this one (every attempt
  counts, a correct one too; the fifth leaves 0). `admin.login_rate_limited` (medium) is a refused attempt: one row per limiter
  window and bucket, however many requests were refused, with `details.limit` (5), `details.windowMinutes` (15)
  and `details.windowEndsAt`. `source` is the start of the keyed hash of the full client address: the same value
  means the same address. Addresses of one IPv6 /64 share one attempt budget but have different `source`
  values, and the refusal row of a window carries the `source` of its first refused request. A success from a
  `source` that you do not recognise, or a success right after a run of failures from the same `source`, is the
  signal. Nothing names a person: there is one shared admin secret, and the secret that was typed is not
  stored, nor its length. The write is best effort: if the database refused it, the answer to the login was the
  same and the application log has the line `Admin login audit event could not be stored`, so a missing row is
  not proof that nobody tried. A request that ends before the rate limiter (login disabled, invalid or
  oversized body, no attested client address, a limiter failure) leaves no row.
- **The application log** (`incident-web.log`) holds the line `Admin login successful` and, for every
  API call, `API request completed` with the path and status (no query string, no address). A run of
  401 and then 429 on `/api/admin/login` is a guessing attempt; the 429 means the limit of 5 attempts
  per 15 minutes per address worked. **A failed admin login raises no alert; its record in the database is
  the `admin.login_failed` event of query 8.**
- **Nginx** `access.log` has the request id, method, path, status and the Cloudflare ray id, but no
  address. The `error.log` can hold addresses. **Cloudflare** holds the addresses of requests (its
  dashboard, as far as the plan shows them).

What the database could expose, by table (all of it is in a dump):

| Data | Table | In the clear? |
| --- | --- | --- |
| Phone numbers (the guest identifier) | `users`, copy in `check_in_requests` | yes |
| Stay dates and reservation references | `bookings` | yes |
| Arrival requests: time, free-text message (up to 500 characters, so it may hold anything the guest wrote, including health or family details), decision | `check_in_requests` | yes |
| Password hashes (bcrypt, cost 12) | `users` | no, but a weak password can be guessed offline |
| Claim token digests | `booking_claim_grants` | keyed with `CLAIM_TOKEN_PEPPER`, which the database does not hold |
| Refresh token hashes | `refresh_tokens` | keyed with `SECURITY_PEPPER` and salted |
| IP address and browser hashes | `security_audit_events`, `refresh_token_families` | keyed with `SECURITY_PEPPER` |
| Rate-limit buckets | `rate_limits` | keyed with `SECURITY_PEPPER` |

Never stored by the application: guest names and e-mail addresses (the columns exist for old rows and are
not written), postal addresses, payment data, identity documents.

## 7. Assess and decide

**Is it a breach?** Was personal data actually exposed, lost, changed or accessed? "Could have been"
with no sign of access may still be a breach if the protection failed; write down what you know.

**Questions for the register:**

1. What happened, when did it start, when did it stop?
2. Which data (table above), how many people, which period?
3. Was the data unintelligible to the attacker (an encrypted backup whose key stayed safe)?
4. What can an attacker do with it: phishing and scam calls that use the booking, takeover of a booking
   or an account, guessing reused passwords, learning when the apartment is empty, learning what a
   guest wrote in a free-text message?
5. Is it contained, and is there evidence?

**Suggested decision aid** (confirm with `<OWNER/lawyer: ...>`):

| Situation | HDPA (within 72 h) | The guests |
| --- | --- | --- |
| Phone numbers or booking data were read or copied by an unauthorised person | Notify | Notify if the person could misuse it (messages, calls) or the data is sensitive; otherwise document why not |
| Admin access by an unauthorised person | Notify (all guest data in the system was readable) | Notify: the person could act as the host |
| A dump or backup in the clear left the server | Notify | Notify (phone numbers, messages and password hashes) |
| Encrypted backup left the server, key safe, encryption proven | Document; probably no notification | No |
| One claim token reached a wrong person who did not use it | Document | No |
| One claim token reached a wrong person who used it | Document; notify if personal data of the real guest was seen | Tell that guest |
| A message went to the wrong guest | Document; notify if sensitive | Tell the person concerned |

The test for the authority is "unless the breach is unlikely to result in a risk"; for the guests it is
"likely to result in a high risk". When unsure, notify the authority.

## 8. Notify the authority (Article 33)

Use the way the HDPA publishes on www.dpa.gr. Be ready with the four things Article 33(3) asks for.
Prefilled for this system, to be checked against what happened:

| Required content | What to write |
| --- | --- |
| (a) The nature of the breach, the categories and approximate numbers of people and records | What happened (confidentiality, availability or integrity). Categories: phone numbers, stay dates and reservation references, arrival times and free-text messages, password hashes. Numbers: from query 7 of section 6 (accounts, bookings, requests with contact data) |
| (b) The contact point | The owner: `HOST_CONTACT` legal name, e-mail and phone from the privacy notice. No data protection officer is appointed, `<OWNER: confirm>` |
| (c) The likely consequences | See the questions of section 7: unwanted messages, takeover of a booking, password reuse, a free-text message becoming known, knowledge of occupancy |
| (d) The measures taken or proposed | Sessions revoked, secrets rotated, portal switched off or restricted, cause removed, guests informed, monitoring added |

If you cannot fill everything in 72 hours, send what you have, say that more follows, and send it
(Article 33(4)). Keep a copy of what you sent and the confirmation you receive.

## 9. Tell the guests (Article 34)

Do it without undue delay when the risk is high. Write in plain language, one message per person, in the
language of their stay, through a channel that you know reaches them (WhatsApp to the stored number, the
Booking.com thread, e-mail). If writing to each person is disproportionate, a public notice on the site
that reaches them in an equally effective way is allowed (Article 34(3)(c)): ask the lawyer.

English

> Subject: A security incident that concerns your data
>
> Hello,
>
> We are writing to tell you about a security incident. On [date] we found that [plain description, for
> example: a person without permission could see the guest data of our website]. This [affected / may
> have affected] your [phone number / stay dates / arrival request and message / the stored form of
> your password]. It did not involve [payment data, identity documents, your address: say only what is
> true].
>
> What we have done: [for example: closed the access, replaced all passwords and keys, informed the
> Hellenic Data Protection Authority on (date)].
>
> What this may mean for you: [for example: you may receive unwanted messages or calls that use your
> booking details. Your portal password is stored only in a protected form, but if you use the same
> password elsewhere, please change it there].
>
> What you can do: [for example: be careful with messages that mention your booking, never give a code
> or password to anyone who calls or writes to you, change a reused password].
>
> Questions: <OWNER: name, e-mail, phone>. You may also lodge a complaint with the Hellenic Data
> Protection Authority (www.dpa.gr).
>
> Kind regards,
> <OWNER: name>

Ελληνικά

> Θέμα: Περιστατικό ασφάλειας που αφορά τα δεδομένα σας
>
> Γεια σας,
>
> Σας γράφουμε για να σας ενημερώσουμε για ένα περιστατικό ασφάλειας. Στις <ημερομηνία> διαπιστώσαμε ότι
> <απλή περιγραφή, π.χ. άτομο χωρίς άδεια μπορούσε να δει τα στοιχεία των επισκεπτών του ιστότοπού μας>.
> Το περιστατικό <αφορά / μπορεί να αφορά> <τον αριθμό κινητού σας / τις ημερομηνίες της διαμονής σας /
> το αίτημα άφιξης και το μήνυμά σας / τη μορφή με την οποία αποθηκεύεται ο κωδικός σας>. Δεν αφορούσε
> <στοιχεία πληρωμής, έγγραφα ταυτότητας, τη διεύθυνσή σας: γράψτε μόνο ό,τι ισχύει>.
>
> Τι κάναμε: <π.χ. κλείσαμε την πρόσβαση, αλλάξαμε όλους τους κωδικούς και τα κλειδιά, ενημερώσαμε την
> Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα στις (ημερομηνία)>.
>
> Τι μπορεί να σημαίνει για εσάς: <π.χ. μπορεί να λάβετε ανεπιθύμητα μηνύματα ή κλήσεις που
> χρησιμοποιούν τα στοιχεία της κράτησής σας. Ο κωδικός σας στην πύλη αποθηκεύεται μόνο σε προστατευμένη
> μορφή, αλλά αν χρησιμοποιείτε τον ίδιο κωδικό αλλού, παρακαλούμε αλλάξτε τον και εκεί>.
>
> Τι μπορείτε να κάνετε: <π.χ. να προσέχετε μηνύματα που αναφέρουν την κράτησή σας, να μη δίνετε ποτέ
> κωδικό σε όποιον σας καλεί ή σας γράφει, να αλλάξετε έναν κωδικό που χρησιμοποιείτε και αλλού>.
>
> Για ερωτήσεις: <ΙΔΙΟΚΤΗΤΗΣ: όνομα, e-mail, τηλέφωνο>. Μπορείτε επίσης να υποβάλετε καταγγελία στην
> Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (www.dpa.gr).
>
> Με εκτίμηση,
> <ΙΔΙΟΚΤΗΤΗΣ: όνομα>

## 10. Scenarios

### S1. The admin secret (or a logged-in admin browser) is compromised

What an unauthorised admin could do, from the code: read every booking with the guest's phone number
(`/admin/guests`, "Show All") and every arrival request with its message (`/admin/requests`); download
the complete export of any guest (**Export all guest data**: account, bookings, arrival requests with
messages, accepted terms, privacy requests, sign-in times); issue access links for unclaimed bookings and claim them; reset a guest's password; **erase**
guests (irreversible); approve or reject requests; switch the portal and check-in on or off; create
bookings; change prices and minimum nights; start a calendar sync; and read the Wi-Fi name and password
(the admin sees them in the check-in preferences, while check-in is enabled).

1. Revoke all admin sessions (5.1). Rotate `ADMIN_DASH_SECRET` (5.2) and recreate `web`. If the server may
   be involved, rotate `ADMIN_JWT_SECRET` too.
2. Save the investigation (section 6, queries 1 to 3 and 8). Look for logins
   outside your times, bursts of access links, erasures you did not make, claims you did not expect.
3. Treat **all guests in the database** as exposed for the period between the earliest suspicious login
   and the revocation (query 7 for the numbers). Compare with the Cloudflare events and the application
   log for the same period.
4. Change the Wi-Fi password (router and `GUEST_WIFI_PASSWORD`).
5. Check the data you hold for damage: erased guests (query 3), changed prices or minimum nights
   (`/admin/availability`), changed flags (`/admin/settings`), claimed bookings that should not be.
   Restore from a backup only with the re-erasure procedure of the DSAR runbook (section 10).
6. Notify per section 7 (an unauthorised admin is notifiable). Tell the guests.
7. Find out how the secret leaked (chat, e-mail, a shared screen, a note, a keylogger) and fix that.

### S2. A database dump or a backup leaked

1. Establish what leaked: a plaintext SQL dump, a physical copy, a backup file, access with a database
   role? When was it made, and what has changed since?
2. Find and close the way it left: a public folder, a mailbox, a shared drive, an unprotected off-site
   bucket, a laptop. Rotate the credentials that gave access. Rotate the database role passwords (5.2).
3. Decide whether the app secrets also leaked. A database dump does not hold them: they are in the root-owned
   env file. If the leak came from the server, treat it as S3.
4. What the dump allows: phone numbers, stay dates and references and messages in the clear (section 6);
   password hashes that can be attacked offline. A weak password can be recovered; the portal accepts
   8 to 72 bytes and refuses one repeated character, a simple run such as 12345678 and the phone number;
   there is no other complexity rule. The keyed values (access-link digests, IP and device hashes,
   rate-limit keys, refresh hashes) are useless without the peppers.
5. Guests whose stay has ended cannot sign in (no eligible booking), but the password may be reused
   elsewhere: tell them to change it there. For guests in the access window, consider **Block all guest
   passwords** (5.1) and a **Reset access** for each, if you believe the hashes are in hostile hands. A guest whose only booking is new and unclaimed needs **Erase guest** and a new **Issue claim** instead (host handbook 4.3).
6. If the leaked item was an **encrypted** backup and its key was never with the leaked item: keep the
   proof (how it was encrypted, where the key is) in the register. This may make the incident not
   notifiable (section 7). `<OWNER/lawyer: confirm with the backup design>`
7. Notify per section 7.

### S3. The server, the env file or the hosting account is taken over

1. Assume every secret in the env file leaked and every table was read.
2. Disconnect the server from the network at the provider (or stop `web` and the workers), keep the disk
   as evidence, and ask the provider for support and logs. Tell the provider in writing.
3. Prepare a clean server following the deployment documents ([scripts/README.md](../../scripts/README.md),
   "Production", and the [origin runbook](../deployment/origin-ingress-runbook.md)), with **all** secrets
   new (5.2, every row), all passwords and keys new, firewall rules checked.
4. Restore the data from the last backup known to be clean, then re-apply erasures made since
   (DSAR runbook, section 10).
5. Notify per section 7: treat it as S1 and S2 together. Tell the guests.

### S4. A claim token reached the wrong person

1. **Issue claim** again for the booking: a new token revokes the earlier open one.
2. If the wrong person already claimed the booking: **Erase guest** (reason: `Claim by an unauthorised
   person`), then issue a new link to the right guest through a verified channel. The unauthorised
   person saw only what the portal shows a signed-in guest of that booking: the stay information, the
   Wi-Fi password in the window, and the booking's arrival request. Change the Wi-Fi password if it was
   shown.
3. Write it in the register. It is usually not notifiable; say why.

### S5. A receiver or an account outside the system is compromised

The arrival-notification service (it holds phone numbers and messages), the mailbox, WhatsApp, the
Booking.com extranet, Cloudflare, the hosting account, the backup storage. Rotate its credentials and the
token you gave it, review its activity log, enable two-step login, remove unknown sessions and keys.
Decide notifiability by what that account held. A Cloudflare takeover exposes traffic in transit, including
guest passwords and the admin secret as they are typed: treat it like S1 and rotate those secrets.

## 11. Evidence and the breach register

Keep, in a private folder that only the owner and the operator can open, for as long as the lawyer says
(`<OWNER/lawyer: period>`):

- the register entry (below);
- the saved logs and query outputs (section 4), the screenshots, the alert;
- copies of what was sent to the authority and to the guests, and the replies;
- the decisions with reasons, including a decision not to notify.

Do not copy personal data into the register beyond what is needed. Counts and categories are enough.

| Field | Content |
| --- | --- |
| Breach id | `B-<year>-<running number>` |
| T0 | date and time you became aware; who; how |
| What happened | facts, in order, with times |
| Scenario | S1 to S5 or other |
| Data and people | categories; approximate numbers |
| Cause | root cause, once known |
| Containment | what was done, when, by whom |
| Assessment | risk questions, decision aid, decision, reasons |
| Authority | notified on (date, time, way); reference; further information sent on |
| Guests | informed on (date, way) or reasons for not informing |
| Evidence | where it is kept |
| Follow-up | actions with owners and dates |
| Closed on | date |

## 12. Afterwards

Within 14 days, write a short post-mortem without blame, with these headings: timeline; how it was
detected and how long it took; root cause; what worked; what did not; what changes (code, configuration,
habits, this runbook); who does what by when. Where the cause is code or configuration, open the change in
the repository and update the tests and the documents in the same change. Review this runbook once a year
and after every incident. Update the [record of processing](record-of-processing.md) if the processing
changed.

## 13. How this was verified

- The statements of sections 5 and 6 were executed on PostgreSQL 16 after applying all migrations.
- Every effect of a secret in section 5.2 is quoted from `docs/security/runtime-credential-contract.md`
  and `docs/security/trusted-ingress.md`. The statement that `restart` keeps the old environment and `up -d`
  recreates the container was tested with Docker Compose v5.6.0 on 2026-10-21.
- The list of what an admin can do was read from `src/app/api/admin/**`, `src/app/api/check-in/preferences`
  and `src/lib/rbac.ts`. The effects of the feature flags were read from `src/lib/featureFlags.ts`, the
  portal and check-in routes and `src/components/CheckInInfo.tsx`.
- Which events carry which severity: `src/app/api/admin/login/route.ts`,
  `src/lib/prisma-repositories/refreshTokenRepository.ts`, `src/lib/portalAuthService.ts`,
  `src/lib/privacyService.ts`, `src/lib/security-monitoring.ts`, `src/app/api/errors/route.ts`. Which alerts
  exist: `src/lib/operationalMonitor.ts`; the 90-day retention is `runRetention` there.
- Query 8 and the admin login events: the real route (`src/app/api/admin/login/route.ts`) was run against the
  scratch database with a wrong secret, the right secret and a run of refused attempts, and query 8 printed the
  rows as described in section 6.2, with the details keys of the code and the tests
  (`tests/security/admin-login-audit.test.ts`). Eight admin events were written for ten requests: the refusals
  of one window made one row.
- Not verified, because it depends on the live setup: the alert receiver and whether it is configured,
  the installed log rotation, the Cloudflare plan and its logs, the backup design and its encryption.
