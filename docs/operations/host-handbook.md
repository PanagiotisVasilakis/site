# Host handbook

The host's day-to-day procedures for the guest guide: bookings, access codes for guests, arrival requests, the
Wi-Fi password, the switches, the admin login, and the Booking.com calendar.

- Verified against the code on 2026-10-21 (the branch `claude/nice-turing-uidc0s` on 2026-10-22, with the launch-readiness fixes, the admin login audit and the start-up
  checks of the Wi-Fi values merged). The returning-guest procedure (section 4.3) was run end to end on the real portal
  services against a PostgreSQL 16 database; the Docker Compose behaviour in section 6 was tested with Docker Compose
  v5.6.0; the start-up check of the Wi-Fi values was run on the real environment schema. Sources of every fact are
  listed in section 10.
- Steps marked **operator** need a login on the server. Everything else is done in the admin in a browser.
- Fields only the owner can fill are marked `<OWNER: ...>`.
- Related: [data subject requests](../privacy/dsar-runbook.md), [breach runbook](../privacy/breach-runbook.md),
  [setup and runtime](../../scripts/README.md).

## 1. At a glance

| When | What | Where |
| --- | --- | --- |
| Every day in arrival weeks | Look at the pending arrival requests and answer them. If no notification webhook is configured, **this is the only way you learn that a guest asked** | `/admin/requests` (the number is also on `/admin`) |
| Every day | The Booking.com calendar is fresh: "Last success" is recent and there is no "not synced" warning | `/admin/availability` |
| For every booking that should use the portal | Create the booking; from 7 days before check-in issue the access code and send it | `/admin/guests` |
| When a guest asks about their data | Follow the data subject requests runbook. The clock is one month | [dsar-runbook](../privacy/dsar-runbook.md) |
| When a secret or data may be exposed | Follow the breach runbook. The clock is 72 hours | [breach-runbook](../privacy/breach-runbook.md) |
| After a wrong turn | Section 4 below | |

Every guest write in this system is final: a booking cannot be edited or deleted, a decided arrival request cannot be
changed, and an erasure cannot be undone. Read the dialog before you press the button.

## 2. The admin

- Open `/admin/login` and enter the admin secret ("Admin Secret", then **Login**). The areas are:
  **Operations** (`/admin`), **Requests** (`/admin/requests`), **Guests** (`/admin/guests`, the "Guest Data Viewer"),
  **Availability & prices** (`/admin/availability`) and **Settings** (`/admin/settings`, "Operational settings").
- The top right corner shows "Session: ok" and **Logout**. A session ends after 2 hours without activity. While you work
  it renews itself, up to 24 hours after the login; then you log in again.
- A sixth login attempt within 15 minutes from the same network is refused until the 15 minutes (counted from the first
  attempt) are over. Every attempt counts, a correct one too. The apartment's Wi-Fi counts as one network for everyone using
  it.

## 3. A guest's stay, step by step

The site does **not** import reservations from Booking.com. It reads only which nights are blocked. A guest gets portal
access only if you create a booking for them and give them an access code.

### 3.1 Create the booking

`/admin/guests`, the box **Create Booking**:

- **Check-in** and **Check-out** (check-out after check-in; at most 180 nights).
- **Source**: "Direct / on-site" or "External platform".
- **Reference (optional)**: the reservation number from Booking.com, so that you can find the booking again with
  **Search Bookings**, **Booking Reference** (an exact match). A reference can be used once.

Check the dates before you press **Create booking**. A booking cannot be edited or deleted. If you made a typo, create
the right booking and use that one; a booking that nobody claims is linked to no one.

### 3.2 When "Issue claim" works

On the booking card, **Issue claim** is available for a booking that is **not yet claimed**. It is greyed out outside the
access window:

- from **7 days before check-in** up to and **including the check-out date**;
- the dates are compared as UTC calendar dates. The window opens at 00:00 UTC on the day that is 7 days before check-in
  (03:00 in Greece in summer, 02:00 in winter) and closes at 00:00 UTC after the check-out date (03:00 or 02:00 on the day
  after check-out).

The same window decides everything else about the guest: the access code only works inside it, the guest can sign in only
inside it, and an open session stops working when it closes. After the check-out date the guest is out of the portal.

### 3.3 The access code (claim token)

- Pressing **Issue claim** shows a card "One-time claim token" with the code. **The code is shown once.** Press **Copy**
  and send it at once. It is stored only as a digest; nobody can read it again.
- It works **once** and for **30 minutes** from the moment you press the button. (The screen cannot change that; the
  server accepts 5 minutes to 24 hours, the admin always asks for 30.) Issue it when the guest is ready: ask first.
- Pressing **Issue claim** again replaces the open code of that booking: the earlier code stops working.
- Send it only to the guest: in the Booking.com message of that reservation or in WhatsApp to the guest's own number. Never
  in a public place or a group.

### 3.4 How the guest uses it

1. Open `<site address>/en/guest` or `<site address>/el/guest` (the "Sign in" tile on the stay page also leads there).
2. Choose the tab **Sign-up** (Greek: **Εγγραφή**).
3. Paste the code (field "Booking claim token", Greek: «Κωδικός ενεργοποίησης κράτησης»).
4. "Where are you traveling from?": **Greece** or **Abroad** (Ελλάδα, Εξωτερικό).
5. The mobile number, in the form of section 3.5.
6. A password of at least 8 characters and at most 72 bytes (accented and Greek letters count as 2), not one repeated
   character, not a run such as 12345678 or abcdefgh, not the phone number. Accept the guest terms. Press **Continue** (Συνέχεια).
7. The guest lands on the check-in page (or on the stay page if check-in is switched off). From then on: tab
   **Sign-in** with the number and the password, inside the access window.

The Wi-Fi network and password, the check-out information and the house rules are on the check-in page. The Wi-Fi password is
shown from 24 hours before the check-in time on the check-in date until the check-out time on the check-out date (Greek
time; the defaults are 15:00 and 11:00). They are not shown at all while **Check-in workflow** (section 7) is off.

Message to send with the code:

English

> Hello [name], here is your access code for the guest portal: [code]. It works once and for 30 minutes from now, so
> please use it straight away. Open [site address]/en/guest, choose "Sign-up", paste the code, choose where you are
> travelling from (Greece or Abroad), type your mobile number with the country code (for example +30 691 234 5678 or
> +44 7911 123456, with no zero after the country code), choose a password of at least 8 characters and at most 72 bytes
> (accented and Greek letters count as 2; not one repeated character, not a run such as 12345678 or abcdefgh, and not your
> phone number), accept the terms and press Continue. After that you sign in with your phone number and your password.

Ελληνικά

> Γεια σας <όνομα>, ο κωδικός ενεργοποίησης για την πύλη επισκεπτών είναι: <κωδικός>. Ισχύει μία φορά και για 30 λεπτά από
> τώρα, γι' αυτό χρησιμοποιήστε τον αμέσως. Ανοίξτε το <διεύθυνση ιστότοπου>/el/guest, επιλέξτε «Εγγραφή», επικολλήστε τον
> κωδικό, επιλέξτε από πού ταξιδεύετε (Ελλάδα ή Εξωτερικό), γράψτε τον αριθμό κινητού σας μαζί με τον κωδικό χώρας (π.χ.
> +30 691 234 5678 ή +44 7911 123456, χωρίς μηδέν μετά τον κωδικό χώρας), διαλέξτε κωδικό πρόσβασης τουλάχιστον 8
> χαρακτήρων και το πολύ 72 byte (οι τονισμένοι και οι ελληνικοί χαρακτήρες μετρούν ως 2· όχι έναν χαρακτήρα που
> επαναλαμβάνεται, όχι ακολουθία όπως 12345678 ή abcdefgh, ούτε τον αριθμό τηλεφώνου σας), αποδεχτείτε τους όρους και
> πατήστε «Συνέχεια». Μετά συνδέεστε με τον αριθμό κινητού και τον κωδικό σας.

### 3.5 Phone number formats

The number is the guest's account. It is turned into one canonical form (`+`, country code, number) by the same code at
the sign-up and at every sign-in. Checked with the real code on 2026-10-21:

| What the guest types | Origin "Greece" | Origin "Abroad" |
| --- | --- | --- |
| `+30 691 234 5678`, `+30-691-234-5678` | +306912345678 | +306912345678 |
| `0030 691 234 5678` (international prefix 00) | +306912345678 | +306912345678 |
| `306912345678` (country code, no plus) | +306912345678 | +306912345678 |
| `6912345678` or `691 234 5678` (Greek national, 10 digits) | +306912345678 | **+6912345678 (wrong)** |
| `+44 7911 123456` | +447911123456 | +447911123456 |
| `06912345678`, `07911 123456` (any national number with a **leading 0**) | **rejected** | **rejected** |
| `+44 (0)7911 123456`, `+30 0691 234 5678` (a 0 after the country code) | accepted **with the 0 kept**: +4407911123456, +3006912345678 | the same |
| `2025550123` (a US number without the country code) | misread as Greek: +302025550123 | misread: +2025550123 |

What to tell guests:

- Write the number with `+` and the country code, then the number **without** the leading 0: `+30 691 234 5678`,
  `+44 7911 123456`. No `(0)`.
- Choose **Greece** only for a Greek number. Choose **Abroad** for a foreign number written with `+` and the country code.
- A number with a leading 0 or an unrecognised format is refused before any attempt is counted: the guest sees the hint
  "Start with + and the country code, e.g. +30 69… (without a leading 0)." (Greek: «Ξεκινήστε με + και τον κωδικό χώρας,
  π.χ. +30 69… (χωρίς αρχικό 0).»), which is also printed under the phone field of both forms. Ask them for the
  international form.

What it means for you: when you search a guest by **Phone Number** in `/admin/guests`, the search reads the number as typed
and, when it is a 10-digit number, also with `+30` in front. So typing `6912345678` finds whichever of the two forms is stored: a wrongly stored `+6912345678` is tried first, then
`+306912345678`, and when both accounts exist only the first one is shown. Typing `+306912345678` finds only that form. If a search finds nothing, try the 10-digit
number without `+30`, and ask the guest which form they used.

## 4. When something goes wrong

### 4.1 What the guest sees, and what it means

| Message the guest sees | Cause | What to do |
| --- | --- | --- |
| "This claim token is invalid, expired or already used. Ask your host for a new one." | The code is older than 30 minutes, was already used, was replaced by a newer code, was copied wrongly, or the booking is outside its window | **Issue claim** again and send the new code |
| "Start with + and the country code, e.g. +30 69… (without a leading 0)." (at **Sign-up** and **Sign-in**) | The phone number has a leading 0 or an unrecognised format. Nothing was counted against the limits of 4.5 | Ask for the international form (3.5) |
| "This password is too long. Use at most 72 bytes…" or "Choose a password that is harder to guess: not one repeated character, a run such as 12345678 or abcdefgh, or your phone number." (at **Sign-up**) | The new password breaks the rules of 3.4 | Ask the guest for another password |
| "We couldn't verify your identity. Check your details and try again." (at **Sign-up**) | The number already has an account and the password is wrong | If the guest stayed before: 4.3 |
| "This action cannot be completed due to a conflict. Try again or contact support." (at **Sign-up**) | The booking already belongs to an account with another phone number, for example after a **Reset access** the guest typed a different number than at the first sign-up | Ask for the number used the first time. If the number on the account is the wrong one: **Erase guest**, then **Issue claim** (4.4) |
| "We couldn't sign you in. Check your phone number and password. Access opens about 7 days before check-in and closes shortly after the check-out date." (at **Sign-in**) | Wrong number or password, the booking was not claimed, or the access window is closed | Check each; 4.2 for a forgotten password |
| "Too many attempts. Please wait up to an hour and try again." | A rate limit (4.5) | Wait; see 4.5 |
| The guest page or the check-in page does not exist (a 404) | **Guest portal** or **Check-in workflow** is switched off | Section 7 |

### 4.2 The guest forgot the password

Use **Reset access** on the **claimed** booking card. It is available when the booking is claimed and inside the access window.

1. Press **Reset access** and confirm "Reset the password and sign-in sessions of ... and issue a new claim token?".
2. It clears the password, signs the guest out everywhere, and shows a new one-time code (30 minutes, for the same booking).
3. Send the code. The guest uses **Sign-up** with the **same phone number** and chooses a new password. A different
   number is refused as already claimed.

If the booking is outside its window, or not claimed yet, the button is not available: see 4.3.

### 4.3 A returning guest cannot claim a new booking (the dead end)

A guest's phone number keeps its account until 12 months after the last stay ended (the automatic erasure). If a guest
comes back within that time with a new booking and has forgotten the old password, the claim fails ("We couldn't verify
your identity ...") because the number already has an account with a password. **Reset access** cannot help: it works only
for a claimed booking inside its window, and the new booking is not claimed yet while the old one is usually over.
**Issue claim** is not offered for the old booking, because it is already claimed.

If the guest remembers the old password, they simply claim the new booking with it. (Tested.)

**If the old booking is still inside its window** (its check-out date is today or later), the gentle way is: **Reset access**
on the old booking and send that code; the guest uses **Sign-up** with the same number and sets a new password; then
**Issue claim** for the new booking and send that code too; the guest claims it with the new password. Nothing is deleted.
(Tested.)

**Otherwise the working procedure is to replace the account:**

1. Make sure it is the guest: ask on WhatsApp, at the number of the old account, or in the Booking.com message of the new
   reservation. Tell the guest what happens: **the old portal account is deleted**.
2. `/admin/guests`, **Search Bookings**, **Phone Number**: find the guest. The old booking shows "Claimed" and the phone number.
3. On that card press **Erase guest**. Confirm the dialog "Erase all personal data of the guest ... This cannot be undone."
   Write a reason without a name, a phone number or an e-mail address, for example: `Returning guest forgot the password;
   account replaced at the guest's request.`
4. Wait for the list to refresh. The old bookings now show "No guest account linked yet" and "Unclaimed".
5. Find the **new** booking (by reference, or **Show All**) and press **Issue claim**. Copy the code and send it (3.3).
6. The guest uses **Sign-up** with the same phone number and chooses a new password (3.4).

What the erasure does (tested on the real code): it deletes the account, its sessions, the password and the record of
the accepted terms; it unlinks every booking of that guest (they become unclaimed again, the dates and reference
stay); it clears name, e-mail, phone and message on the guest's arrival requests, and turns an undecided request into
"rejected"; it cancels notifications not yet delivered; it writes an erasure record. It cannot be undone. If the guest also
has a **current** stay on the old account, they are signed out at once and need a new code for that booking too. The copy of
the arrival requests in the notification service stays unless you delete it (see the data subject requests runbook,
section 7.4). After the procedure there is exactly one account for the phone number.

### 4.4 The wrong number is stored, or the wrong person claimed the booking

The same two steps as in 4.3, steps 3 to 6: **Erase guest** on the account, then **Issue claim**, and the guest signs up
again with the right number and origin. (The operator can instead correct a number in place; see the data subject
requests runbook, section 8.) If the wrong person claimed it, change the Wi-Fi password if it was shown (section 6) and
read scenario S4 of the breach runbook.

### 4.5 Lock-outs and rate limits

| Where | Limit | Counted by | Window |
| --- | --- | --- | --- |
| Guest sign-in | 5 attempts | the phone number, **and** the network address | 15 minutes from the first counted attempt |
| Guest sign-up (claim) | 5 attempts | the access code (once the browser has exchanged it), **and** the network address | 1 hour |
| Access code check | 20 attempts | the network address | 1 hour |
| Admin login | 5 wrong tokens (a correct token gives its attempt back) | the network address | 15 minutes |
| Session renewal | 60 requests | the network address | 15 minutes |

- The sixth attempt in the window is refused. Further tries do not extend the window; it ends 15 minutes (or 1 hour)
  after the first counted attempt. The guest sees "Too many attempts. Please wait up to an hour and try again."; for the
  sign-in the real wait is at most 15 minutes.
- A correct sign-in gives its attempt back on the phone counter but not on the network counter. Everyone on the apartment's
  Wi-Fi shares one network address, so the family's six devices that sign in within 15 minutes can lock themselves out.
- Switching from Wi-Fi to mobile data changes the network address, so it clears the network limit; the phone-number limit
  of the sign-in stays until its window ends.
- After a sign-up lock-out a new **Issue claim** gives a new code with its own counter, but the network limit stays.
- **operator**, last resort: all counters can be cleared with `DELETE FROM rate_limits;` (tested). It also clears the admin
  login counter, and with it the protection against guessing, until new attempts fill it again. Use it only when the lock-out
  is certain to be a guest's.

## 5. Arrival requests

`/admin/requests` lists the guests' arrival-time requests (**Pending** first; **All** shows the others). Each card shows the
requested time, the standard check-in (15:00), the booking id, the guest's phone number and the message.

- **Approve** or **Reject**. A decision is final. The guest sees the status on their check-in page.
- A guest can send a request until the check-in date; there is one pending request per booking. After a rejection the
  guest can send a new one.
- If the notification webhook is configured, each request and each decision also goes to the notification service. If it is
  not, the request is stored and the host is told nothing: **open this page every day** during the weeks of arrivals.
  `<OWNER: is the webhook configured? Which service?>`
- A card with "Notification failed" and **Retry notification** means the delivery to the service failed ten times; the
  button puts it back in the queue.

## 6. The Wi-Fi password

The network name and password are values of the server environment (`GUEST_WIFI_NETWORK`, `GUEST_WIFI_PASSWORD`; the
name must not be empty and the password has at least 8 characters). Guests see them on the check-in page inside the
window of 3.4.

The server checks both values when `web` starts. In production it refuses a name or a password that contains one of
the words of the env template, `replace`, `changeme`, `placeholder` or `example`, in any letter case and anywhere in the
value (`MyExampleNet` is refused, `ex-ample` is not). The container then prints
`GUEST_WIFI_PASSWORD must not be a placeholder value` (or the same for `GUEST_WIFI_NETWORK`) and exits with code 78: the
site stays down until the file is corrected. Apart from the length, only these four words are checked: a short name or
a patterned password is accepted. A real password that happens to contain one of the four words is refused as well, so
choose another.

To change them (**operator**):

1. Change the password on the router first or at the same time.
2. Edit `GUEST_WIFI_PASSWORD` (and `GUEST_WIFI_NETWORK`, if the name changes) in the root-owned file that `APP_ENV_FILE`
   names. Keep the four words above out of both values, or the new container exits with code 78 (see above).
3. Recreate the web container: `docker compose -f docker/docker-compose.prod.yml up -d --wait web`.
   **Do not use `restart`**: tested with Docker Compose v5.6.0 on 2026-10-21, `restart` keeps the old values and
   `up -d` recreates the container with the new ones. The change takes effect when the container starts; the site is
   unavailable for a few seconds.
4. Check: while logged in to the admin in the same browser, open `<site address>/api/check-in/preferences`. The `wifi`
   part shows the network and password in use (it works only while the check-in workflow is switched on).
5. Tell the guests who are staying now. A guest's page shows the value valid at the time it loads.

## 7. The switches

`/admin/settings` has two: **Guest portal** and **Check-in workflow**. The changes apply at once for everyone.

| Switch | Off means |
| --- | --- |
| Guest portal | The guest page, sign-up, sign-in and the token renewal answer "not found". Check-in is off too (it needs the portal). The stay page hides the sign-in, Wi-Fi, check-out and house-rules tiles. Sessions stay in the database and are useless. |
| Check-in workflow | The check-in page (Wi-Fi, check-out information, house rules) and the arrival requests answer "not found". Sign-in still works. Guests lose the Wi-Fi password in the app. |

A database that was migrated from empty has **both on**; the production default applies only when the setting row is
missing, and it is off. Look at the page right after a release, and switch off what must not be live. The operator can
switch the portal off without the admin (breach runbook, section 5.1).

## 8. Admin hygiene

- There is **one** admin secret (`ADMIN_DASH_SECRET`) for everyone. Whoever knows it can read all guests' phone numbers
  and messages, erase guests, issue access codes and read the Wi-Fi password. Tell it to as few people as possible, only
  in person or through a password manager, never in a chat, an e-mail or a note on the fridge.
- Keep it in a password manager. Do not use the same value anywhere else. Log in only on devices you control.
- **Logout** when you are done. A forgotten session lives 2 hours; an active one up to 24 hours.
- Rotate the secret when someone who knew it should no longer have it, when a device is lost, when you suspect a leak, and
  at least once a year `<OWNER: confirm the interval>` (**operator**): generate a new value with `openssl rand -hex 32`,
  put it in the file `APP_ENV_FILE` names (it must differ from the other two credentials), run `docker compose -f
  docker/docker-compose.prod.yml up -d --wait web`, and **revoke the open sessions** (breach runbook, section 5.1): existing
  sessions do not depend on the secret and stay valid until they expire or are revoked.
- Five login attempts per 15 minutes are allowed from one network (section 2). A failed login raises no alert. The
  database keeps every attempt that the limit admitted as a security event for 90 days (`admin.login_succeeded`,
  `admin.login_failed`), and the refused ones as one `admin.login_rate_limited` event per 15-minute window; the
  **operator** reads them with query 8 of the breach runbook (section 6.2). The server log shows the status codes
  as well.
- If you think the secret leaked: breach runbook, scenario S1.

## 9. Booking.com and the calendar

- The public availability page shows free and **not available** nights, read from the calendar export of the Booking.com
  extranet (`BOOKING_ICAL_URL`, a secret). A reservation and a **closed date look the same** in the export: both are shown
  as booked. Only dates are stored.
- **Block phone and WhatsApp bookings, and your own use, in the Booking.com extranet** (close the dates). The site does not
  know about them otherwise: it would show them as free and Booking.com could sell them again. A closed date appears on the
  site after the next sync.
- The **minimum stay** on the site comes from the rate periods in `/admin/availability`: for the night of check-in, the
  minimum nights of the period that contains it (1 outside every period; 1 to 30 in the form). The site shows no price. **Keep
  the minimum nights equal to the rules in Booking.com**, otherwise the site and Booking.com tell guests different things.
  The price you type is only stored.
- The calendar is fetched by the operations worker at most every 30 minutes. In `/admin/availability`, "Last success"
  shows the last good sync; more than 3 hours without one shows a warning, and after 12 hours the public pages hide the
  calendar and show the ways to contact you. **Sync now** starts a sync at once (at most one per minute); it answers
  "Synced: N blocked nights".
- When the export link is set for the first time, or replaced, follow the first-sync checks in
  [scripts/README.md](../../scripts/README.md) ("Upgrading a database that already holds data", the paragraph on the
  migration `20261020120000_booking_calendar_source`): N must equal the blocked nights of the next 365 nights in the
  extranet, a known reservation and a date you closed by hand must appear as booked on `/en/availability` and
  `/el/availability`.
- The link in the extranet is a secret. Do not paste it in a chat or a ticket. If it was exposed, create a new one.

## 10. Where each fact comes from

| Topic | Source |
| --- | --- |
| The window for codes, sign-in and reset | `src/lib/portalBookingEligibility.ts`; the buttons in `src/app/admin/guests/page.tsx` |
| Code validity, replacement, single use | `src/lib/portalAuthService.ts` (`issueBookingClaimGrant`, `replaceOpenClaimGrant`, `consumeBookingClaimGrant`); `ttlMinutes: 30` in `src/app/admin/guests/page.tsx` |
| Reset access | `resetGuestAccess` in `src/lib/portalAuthService.ts`; `src/app/api/admin/bookings/[id]/access-reset/route.ts` |
| Erase guest | `src/lib/privacyService.ts`; `src/app/api/admin/guests/[userId]/erase/route.ts` |
| Phone formats | `src/lib/phone.ts`, probed with the real `normalizePhone` and `phoneLookupCandidates` |
| Messages shown to guests | `src/i18n/domains/portal.ts`, `src/lib/userFacingErrors.ts` |
| Rate limits | `src/lib/sensitiveRateLimit.ts`; the `checkSensitiveRateLimit` calls in `src/app/api/portal/**` and `src/app/api/admin/login/route.ts`; [layered rate limiting](../security/layered-rate-limiting.md) |
| Arrival requests and notifications | `src/app/admin/requests/AdminRequestsClient.tsx`, `src/app/api/check-in/arrival-request/route.ts`, `src/lib/bookingOutbox.ts` |
| Wi-Fi values and window | `src/app/api/check-in/preferences/route.ts`, `src/lib/propertyTime.ts`; the start-up check of the two values: `src/lib/runtime-env-schema.js` |
| The switches | `src/lib/featureFlags.ts`, `src/app/admin/settings/AdminSettingsClient.tsx`, the portal and check-in routes |
| Admin login and sessions | `src/app/api/admin/login/route.ts` (also the `admin.login_*` events), `src/lib/auth/admin.ts`, `src/components/AdminSessionManager.tsx` |
| Calendar and minimum stay | `src/lib/availability/calendarSync.ts`, `src/app/admin/availability/AdminAvailabilityClient.tsx`, `src/data/stayPolicy.ts`, [scripts/README.md](../../scripts/README.md) |
| `restart` versus `up -d` | tested with Docker Compose v5.6.0 on 2026-10-21 |
