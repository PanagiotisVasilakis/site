# Guest Portal — Sign‑in/Sign‑up & Check‑in Flow

## 1) Rephrased Prompt (final)
Create a **guest portal** that appears **before the home page** (or as a dedicated entry route) for users with a booking. The portal provides **Sign in / Sign up** and unlocks guest features if the visitor has:
- already **made a booking on another platform (OTA/channel)**, or
- **made a booking on our site**.

For on‑site bookings, once the guest **confirms the booking** on the booking page, redirect them to the **Check‑in page**.

If a visitor **has not made a booking**, show a clear secondary action to **go to the Home page** (or **start a new booking**) so they can book on our site.

During Sign in/Sign up, first collect where the guest is **coming from**: **Greece** or **Abroad**. Then collect:
- If **Greece**: **AFM** (Greek Tax ID) **and phone number**.
- If **Abroad**: **passport number** **and phone number**.

The portal verifies the guest’s booking (on‑site or imported from external platforms) and grants access to the provided features.

On the **Home** page there will be an extra **Check‑in** item (page/link). It is **hidden** if the visitor has not made a booking. Once a booking is completed (or verified via the guest portal sign‑in/up), the site **redirects to `/check-in`** and the **Check‑in** item becomes visible on Home for that session.

---

## 2) Objectives & Success Criteria
**Objectives**
- Provide a friction‑light path for booked guests to access check‑in and related features.
- Support verification for both **internal bookings** and **external bookings** (e.g., OTAs).
- Capture minimal, compliant PII (AFM or passport, plus phone) needed for verification and operations.

**Success Criteria**
- Guests with valid bookings can sign in/sign up and reach **Check‑in** within **< 2 minutes**.
- **< 2%** verification failures due to system issues (excluding incorrect user data).
- Complete analytics for funnel steps and drop‑offs.
- Meets **GDPR** requirements and secure data handling.

---

## 3) Scope (MVP)
In scope:
- Pre‑home **guest portal** route and/or intercept.
- Sign in/Sign up flow with **origin selector** (Greece/Abroad) and dynamic fields.
- **Booking verification** against our system and (where available) external sources or via booking reference matching.
- **Check‑in page** accessible after verification.
- Redirect from **on‑site booking confirmation** → **Check‑in**.
- Basic phone verification via identity checks.
- Analytics, privacy, security.

- **No‑booking CTA** from the portal to Home/Booking Start.

Out of scope (later):
- Payment collection, upsells, digital key, room selection (placeholders allowed).
- Full OTA API integrations beyond basic reference matching (unless available).

---

## 4) User Types & Primary Flows
**User Types**
- **Guest (Greece)**: provides AFM + phone.
- **Guest (Abroad)**: provides passport + phone.
- **Staff/Admin** (future): manual verification & support tools.

**Primary Flows**
1. **External booking → Guest Portal**
   - Entry: link in confirmation email/SMS, QR at property, or direct visit.
   - Portal: choose Greece/Abroad → enter identifiers → verify booking → access Check‑in and features.

2. **On‑site booking → Confirmation → Check‑in**
   - After completing booking on our site, user is **auto‑redirected** to **/check-in** with booking context.
   - If session lost, guest can return via the Portal.

3. **Returning guest**
   - Sign in with previously verified phone/email → skip re‑verification when the booking is recognized.

4. **No booking yet → Home / Start Booking**
   - On the Sign in/Sign up page, provide a secondary action: “No booking yet? Go to Home / Start booking.”
   - Clicking it sends the user to the Home page (or the booking start route) without collecting identity data.

5. **Conditional Home link exposure**
   - After a successful booking or verification, the **Check‑in** item appears in the Home navigation and remains available while the booking session is valid.

---

## 5) Information Architecture & Routes
- **/guest** — Guest Portal (entry). Optionally intercept before home when referrer is booking/OTA.
- **/guest/sign-in** — Sign in form.
- **/guest/sign-up** — Sign up form.
- **/guest/verify** — Legacy step (no longer used).
- **/check-in** — Check‑in page (requires verified booking session).
- **/booking/confirm** — Existing confirmation page (post‑purchase). On success → redirect to **/check-in**.

### Home Navigation (Conditional “Check‑in” item)
- The **Check‑in** link **MUST NOT** be visible on Home if the visitor has **no verified booking**.
- The **Check‑in** link **appears** only when:
  1) A booking is just completed on our site (after `/booking/confirm` success; session minted).
  2) The guest signs in/up via the Portal and verification succeeds (booking session minted).
- Session scope controls visibility. Remove/hide the link when the booking session expires or user signs out.
- Apply the same gating in **header**, **footer**, and **mobile** menus to ensure consistency.
- SSR recommendation: compute visibility server‑side to avoid flicker/leakage; hydrate client with the same state.
- SEO: set **noindex** for `/check-in`, **exclude it from the XML sitemap**, and prevent anonymous crawl.

- **/** (or **/home**) — Home/booking start. From the guest portal, provide a secondary link “No booking yet? Start here”.

**Redirect logic**
- On successful on‑site booking: `POST /api/bookings/:id/confirm` → 200 → client navigates `302` to **/check-in?bookingId=…**.
- On Portal verification success: navigate to **/check-in** with session token.

---

## 6) Forms & Field Logic
**Step 1 — Origin**
- Radio/select: **Greece** | **Abroad** (required).

**Step 2 — Identity & Contact (conditional)**
- If **Greece**:
  - **AFM** (required) — 9 digits, server‑side checksum validation.
  - **Phone** (required) — E.164; suggest auto‑prefix **+30** for Greece.
- If **Abroad**:
  - **Passport number** (required) — alphanumeric; length rules configurable per country (fallback: 5–20).
  - **Phone** (required) — E.164, country code detected.

**Optional supporting fields**
- **Booking reference** + **Last name** (recommended for OTA/external bookings without API integration).
- **Email** (for account linking & recovery).

**UX behaviors**
- Real‑time formatting hints, masked input, and inline validation.
- Accessibility: labels, error summaries, keyboard navigation.

**Exit path — No booking yet?**
- Show a clearly styled secondary link/button: “No booking yet? **Go to Home** / **Start booking**”.
- This action should **not** require any form input; it navigates to **/** (or **/home** or **/booking/start**, per routing).
- Remember the portal as the referrer in analytics.

---

## 7) Validation & Verification
**Client‑side (preflight)**
- Required fields present; format checks (digits, length, E.164 phone).

**Server‑side (authoritative)**
- AFM checksum validation (official algorithm; fail closed).
- Passport sanity checks (length/charset) and optional blacklist checks.
- Phone verification via server-side identity checks.
- **Booking verification** strategies (use one or more):
  1) Match **booking reference + last name** in our DB.
  2) Match **phone** and identity to an existing booking record for the stay window.
  3) Use OTA integration (if available) to confirm external booking.

On success, mint **short‑lived session** (JWT/HttpOnly cookie) scoped to booking.

**Navigation visibility guard**
- Home nav renders **Check‑in** only if `hasVerifiedBookingSession === true` (server‑side preferred), otherwise hidden.
- Never infer partial visibility from client hints; rely on signed server session or secure API flag.

---

## 8) Security, Privacy, Compliance
- **PII minimization**; store only necessary fields.
- **Encryption** in transit (TLS 1.2+) and at rest.
- Secrets in vault; rotate regularly.
- Rate limiting after N failures.
- GDPR: legal basis, consent/cookie banner where relevant, **Data Retention** policy for AFM/passport, **DSAR** readiness.
- Audit logs for verification attempts.

---

## 9) Data Model (proposed minimal)
```
User(id, email, phone_e164, country_origin, created_at, updated_at)
Identity(user_id, type: ENUM('AFM','PASSPORT'), value_hash, last4_mask, verified_at)
Booking(id, source: ENUM('ONSITE','EXTERNAL'), reference, last_name_hash, start_date, end_date, user_id?, created_at)
BookingAccess(user_id, booking_id, status: ENUM('PENDING','VERIFIED'), created_at, updated_at)
AuthSession(id, user_id, booking_id, expires_at, revoked_at)
```

**Notes**
- Store sensitive identifiers as **hash** (salted) and last4 for display.
- Link external bookings to users on first verification.

---

## 10) APIs (example contract)
**POST /api/portal/start**
- Body: `{ origin: 'GR'|'ABROAD' }` → returns form schema.

**POST /api/portal/verify**
- Body (GR): `{ afm, phone, bookingRef?, lastName? }`
- Body (ABROAD): `{ passport, phone, bookingRef?, lastName? }`
- Server: validate → locate/create booking → issue session.

- (Removed) legacy confirm endpoint
- On success issue session and redirect `/check-in`.

**GET /api/check-in**
- Auth: booking‑scoped session → returns check‑in payload.

**POST /api/bookings/:id/confirm**
- On success, client redirect to `/check-in?bookingId=…`.

---

## 11) Check‑in Page (MVP content)
- Booking summary (dates, guests, room).
- Pre‑arrival details (arrival time, special requests).
- Required legal fields (e.g., acceptance of terms, ID confirmation).
- Save & resume later (session‑based).
- **Placeholder OK for now** — owner will implement full content later; route and access control must still be complete.

---

## 12) Analytics & Events
Track with a unique **funnel/session id**:
- `portal_opened` (source, referrer)
- `no_booking_cta_clicked` (destination: /, /home, or /booking/start)
- `origin_selected` (GR/ABROAD)
- `form_submitted` (fields_present)
- `verification_started`
- `verification_failed` (reason)
- `verification_succeeded`
- `checkin_viewed`
- `checkin_completed`

- `checkin_nav_shown` (reason: booking_confirmed | portal_verified)
- `checkin_nav_hidden` (reason: signout | session_expired)
- `checkin_nav_clicked`

Dashboards: conversion %, time to verify, error rate, **nav exposure vs. usage**.

---

## 13) Edge Cases
- Multiple bookings for same guest (choose booking or auto‑select nearest upcoming).
- Name mismatches/typos (offer last‑name fuzzy match).
- No booking found (CTA to contact property or re‑enter details).
- Device change during flow (resume via magic link).
- International numbers without SMS delivery (fallback to email verification).
- **Stale session on Home**: ensure Check‑in link is hidden if session expired or user signed out.
- **Incognito/new device**: Check‑in link not shown until verification on that device.

---

## 14) Non‑functional Requirements
- Performance: First portal paint < 2s on 4G; form submit p95 < 800ms.
- Accessibility: WCAG 2.1 AA.
- Localization: EN + EL (copy keys from day 1).
- Observability: logs, distributed tracing, alerting on spike in `verification_failed`.

---

## 15) Work Breakdown Structure (WBS) & Tasks
**Phase 0 — Alignment**
- [ ] Finalize scope & flows (this doc).  
- [ ] Confirm OTA integration availability & fields.  
- [ ] Confirm legal requirements for AFM/passport storage.

**Phase 1 — UX Copy & Design**
- [ ] Wireframes for /guest, sign‑in/up, verify, check‑in.  
- [ ] Content in EN/EL.  
- [ ] Error states & empty states.

**Phase 2 — Backend**
- [ ] Data models & migrations.  
- [ ] AFM validation util (server‑side).  
- [ ] Passport rules config & sanitizer.  
- [ ] Booking lookup service (onsite + external reference matching).  
- [ ] Identity validation improvements.  
- [ ] Session issuance (booking‑scoped).  
- [ ] APIs: `/portal/start`, `/portal/verify`, `/check-in`.

**Phase 3 — Frontend**
- [ ] Routes & guards: /guest, /guest/*, /check-in.  
- [ ] Forms with conditional fields and i18n.  
- [ ] Client validation & accessibility.  
- [ ] Redirect logic from booking confirmation.  
- [ ] **Home nav conditional rendering** (SSR + hydration consistency).
- [ ] Footer/mobile menus apply the same condition; exclude `/check-in` from XML sitemap.  
- [ ] **Placeholder Check‑in page** shell with protected access.  
- [ ] Analytics events for nav shown/hidden/clicked.

**Phase 4 — Integrations**
- [ ] SMS provider (Twilio/other) + fallback email.  
- [ ] Analytics events + dashboard.  
- [ ] Optional OTA API if available.

**Phase 5 — QA & Security**
- [ ] Unit/integration tests; contract tests for APIs.  
- [ ] Pen‑test checklist; rate‑limit checks.  
- [ ] PII encryption, key rotation, backups, DR plan.

**Phase 6 — Launch**
- [ ] Staging UAT with real‑like data.  
- [ ] Staff training / support SOP.  
- [ ] Rollout plan & monitoring; rollback plan.

---

## 16) Acceptance Criteria (high‑level)
- A guest with a valid booking can complete the flow end‑to‑end and reach Check‑in.  
- Greece path requires AFM + phone; Abroad path requires passport + phone.  
- Server enforces validation; incorrect inputs yield clear errors.  
- On‑site bookings auto‑redirect to Check‑in after confirmation.  
- Analytics events fire for each funnel step.  
- All PII encrypted at rest; access logged.
- **Home page** shows **Check‑in** link **only** when a verified booking session exists; otherwise it is **not visible**.
- `/check-in` is inaccessible without a valid session; anonymous users are redirected to **/guest**.
- Users **without** a booking can clearly proceed to **Home/Start booking** from the portal.

---

## 17) Open Questions (to confirm)
1. Should the portal **always** intercept before home, or live at **/guest** and be linked from comms?  
2. Do we have **OTA APIs** (e.g., Booking.com/Airbnb/channel manager) to verify external bookings, or should MVP use **booking reference + last name** only?  
3. **AFM**: do we need real‑time 3rd‑party validation, or is checksum + booking match sufficient?  
4. **Phone verification**: Is an SMS step required for MVP or can it be post‑MVP?  
5. Multilingual requirements beyond EN/EL?  
6. Which guest **features** are included at MVP (exact list on Check‑in page)?

---

## 18) Next Steps
- If the above updates look good, we’ll implement **conditional navigation** first so UX matches requirements from day one.
- Proposed immediate tasks: 
  1) Add booking‑scoped session flag; SSR render Home with `showCheckIn`.
  2) Protect `/check-in`; add placeholder content.
  3) Wire analytics for nav shown/hidden/clicked.

---

## 20) Implementation Snippet (illustrative)
```tsx
// Server layout (Next.js / Remix style pseudo‑code)
export async function HomeLayout() {
  const session = await getSession();
  const hasBooking = Boolean(session?.bookingAccess?.status === 'VERIFIED');
  return (
    <Nav>
      <Link href="/">Home</Link>
      {/* other items */}
      {hasBooking ? <Link href="/check-in">Check‑in</Link> : null}
    </Nav>
  );
}

// Route protection
export async function CheckInPage() {
  const session = await getSession();
  if (!session?.bookingAccess || session.bookingAccess.status !== 'VERIFIED') {
    redirect('/guest');
  }
  return <CheckInShell />; // placeholder OK for now
}
```

