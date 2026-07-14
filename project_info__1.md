# QR City Guide — Codebase Analysis: Bugs, Refactors, & Redundancy

## Summary

This is a Next.js 16 Airbnb-style guest portal and city guide application. It provides check-in flows, guest identity verification (with MFA primitives), analytics, distributed tracing, security monitoring, and a localized (EN/EL) content catalog. The codebase is unusually ambitious for its size — it implements production-grade enterprise patterns (distributed tracing, metrics aggregation, security middleware, refresh token rotation) on top of a guest portal that appears to be for a single property.

However, the codebase has significant issues: severe duplication across Node/Edge runtimes, broken booking lookup logic that causes duplicate book database records, in-memory storage in serverless environments, and several security anti-patterns.

---

## 🚨 CRITICAL BUGS

### 1. Booking Lookup via `buildBookingLastNameTokenSearchValues` Returns Raw Text Next to HMAC Tokens — `bookingRepository.findByReferenceAndLastName` Succeeds Only by Accident

**Files**: `src/lib/bookingLastNameTokens.ts`, `src/lib/prisma-repositories/bookingRepository.ts`, `src/lib/guestDataStore.ts`

**The bug**: `buildBookingLastNameTokenSearchValues(lastName)` returns an array containing both:

- HMAC-SHA256 hex tokens (the correct lookup values)
- Raw normalized text (unhashed, e.g., `"papadopoulos"`)

The repository function `bookingRepository.findByReferenceAndLastName` loops over **all** returned values and generates OR clauses like:

```
{ lastNameToken: rawText }, { lastNameTokenNoWs: rawText }
```

Comparing raw text against stored HMAC hex values **never matches**. The function only works because the HMAC tokens are also included in the array and the Prisma query uses `OR` — if any clause matches, it returns the record. The raw text clauses are pure noise.

**Consequence**: The function works, but it's confusing, wasteful, and fragile. If the insertion order in `buildBookingLastNameTokenSearchValues` changes such that raw values come before HMAC values, the query would still work (OR), but any reader would think the raw values are meaningful. More critically, this pattern is **copied verbatim** into the `guestDataStore.ts` transaction methods `linkUserToBookingWithAccess` and `registerOnsiteGuest`, where the raw text comparison is also useless.

### 2. `guestDataStore.linkUserToBookingWithAccess` — Booking Lookup Inside Transaction Fails, Always Creating Duplicate Records

**File**: `src/lib/guestDataStore.ts` (line ~370)

**The bug**: The transaction method `linkUserToBookingWithAccess` attempts to find an existing booking by reference + lastName:

```
const tokenCandidates = buildBookingLastNameTokenSearchValues(params.lastName);
bookingDb = await tx.booking.findFirst({
  where: { reference: params.bookingRef, OR: ... }
});
```

This calls the ORM directly with the same broken raw-text-included search values. But more critically, even if the lookup _does_ find an existing booking (via the HMAC tokens), the subsequent code falls through to creating a new booking:

```
if (!bookingDb) {
  // Always creates a NEW booking
  bookingDb = await tx.booking.create({ ... });
}
```

**Consequence**: Every sign-up through `/api/portal/verify` creates a **new Booking record** instead of linking the user to an existing one. If a front-desk staff created an on-site booking (`ONSITE` source) and the guest signs up via the portal, they'll get two Booking records for the same stay. This is a data integrity bug.

**Same bug in `registerOnsiteGuest`** (line ~450): identical pattern — `buildBookingLastNameTokenSearchValues` + raw text clauses → lookup always "fails" → new booking created.

### 3. Analytics System Is Non-Functional on Vercel (Serverless)

**Files**: `src/lib/analyticsStore.ts`, `src/lib/storageAdapter.ts`

**The bug**: `analyticsStore.ts` stores all hits, vitals, and firstSeen data in **in-memory arrays** (`const hits: AnalyticsHit[] = []`). The `storageAdapter.ts`:

```typescript
export function createStorageAdapter(): AnalyticsStorageAdapter {
  const mode = process.env.ANALYTICS_STORAGE || 'file';
  if (process.env.VERCEL) return new NoopAdapter();  // ← Noop on Vercel!
  ...
}
```

- On Vercel: `NoopAdapter` — data is stored in memory and lost after each request (cold start).
- The `FileAdapter` uses `process.cwd()` to write JSON — on Vercel, the filesystem is ephemeral and read-only after deployment.
- Data written to `/tmp` might survive a request but not across instances.

**Consequence**: All analytics tracking (`addHits`, `addVital`, `trackEvent`) is effectively a no-op on Vercel. The entire analytics architecture needs a proper external storage backend (PostgreSQL, Redis, etc.) to work in serverless environments.

### 4. CSP Nonces Are Disabled, Weakening XSS Protection

**Files**: `src/proxy.ts`, `src/lib/security-config.ts`, `src/lib/security-middleware-edge.ts`

**The bug**: The proxy middleware creates security middleware with `enableNonce: false`:

```typescript
const securityMiddleware = createSecurityMiddleware({
  enableNonce: false,
  // Localized pages are statically generated, so their inline Next.js bootstrap
  // scripts cannot receive a per-request nonce.
});
```

The development config has `useNonce: false` in `security-config.ts`. The production config also has `useNonce: false`.

Without nonces, CSP `script-src` must use `'unsafe-inline'` (which is present in both configs), defeating the primary purpose of CSP — blocking inline script injection. The security headers look robust, but CSP is essentially cosmetic.

### 5. `metrics-collector.ts` Uses `window.sessionStorage` on the Server

**File**: `src/lib/metrics-collector.ts` (line ~580)

```typescript
private getSessionId(): string {
  if (typeof window !== 'undefined' && window.sessionStorage) { ... }
  return `server_session_${Date.now()}`;
}
```

This is called from `trackEvent()` which is called from server-side code (`trackApiCall`, `trackError`, etc.). When called on the server, it always returns a new unique session ID, meaning every server-side event has its own "session" — completely defeating session aggregation.

### 6. Check-In Request Webhook Has No Retry Logic

**File**: `src/app/api/check-in/arrival-request/route.ts`

The `notifyHost` function sends a webhook when a guest requests an arrival time. If the webhook fails (network error, 500 from host's server, timeout), the error is logged as a warning but the API response is still **200 OK**. The host is silently not notified. There's no retry queue, no dead-letter queue, no fallback notification mechanism.

---

## 🔴 HIGH-SEVERITY ISSUES

### 7. Triple Duplication: Security Middleware, Distributed Tracing, Metrics

Three feature pairs are each duplicated ~90% across Node.js and Edge runtimes:

| Feature Area        | Node Version                                    | Edge Version                                         |
| ------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| Security middleware | `src/lib/security-middleware.ts` (~310 lines) | `src/lib/security-middleware-edge.ts` (~290 lines) |
| Distributed tracing | `src/lib/distributed-tracing.ts` (~350 lines) | `src/lib/distributed-tracing-lite.ts` (~130 lines) |
| Metrics             | `src/lib/metrics-collector.ts` (~550 lines)   | `src/lib/metrics-lite.ts` (~40 lines)              |

**The problem**: The Node/Edge versions have drifted:

- The Node security middleware accesses `config.monitoring.logSecurityEvents` directly; the Edge version checks both `config.monitoring.enabled` and `config.monitoring.logSecurityEvents` (stricter).
- The Node tracer has span analysis, critical path building, and cleanup timers that exist only in the Node version.
- The Edge versions of all three are simplified/no-op, but they export the same public API. There is no shared interface or adapter pattern.

**Maintenance burden**: Any security policy change (add a header, modify CSP, change rate limit logic) must be manually applied to `security-middleware.ts` AND `security-middleware-edge.ts`. With the current drift already evident, this is unsustainable.

### 8. `auth/admin.ts` — Misleading Type Signature Allows Overriding `type` and `role`

**File**: `src/lib/auth/admin.ts`

```typescript
export function signAdmin(
  payload: Omit<AdminAuthPayload, 'type' | 'role' | 'iat' | 'exp'> 
    & Partial<Pick<AdminAuthPayload, 'type' | 'role'>>,
  expiresIn: ...
): string {
  const fullPayload = {
    type: 'admin',
    role: 'admin',
    ...payload,  // Will silently overwrite with user-supplied values
  };
  return sign(fullPayload, getJwtSecret(), { expiresIn });
}
```

The `Partial<Pick<...>>` in the type signature suggests callers can override `type` and `role`, but the spread order (`...payload` after the defaults) means user-supplied values **will** override the hardcoded defaults. The defaults should be spread last, or the `Partial` should be removed from the type signature.

### 9. `UnifiedGuestClient.tsx` — Dial Code Switch Doesn't Reconcile Phone Number

**File**: `src/app/[locale]/guest/UnifiedGuestClient.tsx`

When a user enters a Greek number (e.g., `6955810051` with `+30`) and switches the dial code to `+1`, the phone number stays unchanged. The submitted value becomes `+16955810051` which is incorrect. A proper implementation should either:

- Clear/reprompt the phone number when the dial code changes
- Or parse and re-prefix the number

### 10. `api-security-middleware.ts` — SQL Injection Protection via Regex Blacklisting

**File**: `src/lib/api-security-middleware.ts` (~lines 60-90)

```typescript
const sqlPatterns = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|OR|AND)\b)/i,
  ...
];
```

This is a well-known anti-pattern:

- **False positives**: Query parameters like `"DROPKICK"` or `"ORANGE"` will be blocked.
- **False negatives**: URL-encoded or Unicode-normalized SQL can bypass these patterns.
- **Unnecessary**: Prisma uses parameterized queries exclusively — raw SQL injection is already impossible through the ORM.

The same issue exists in `XSSProtectionMiddleware` which uses 15 regex patterns to detect XSS. Middleware-level XSS detection is always incomplete and should be replaced with proper output encoding + CSP.

### 11. `env.ts` Validates Secrets as Required, But `crypto.ts` Generates Dev Fallbacks

**File**: `src/lib/env.ts`, `src/lib/crypto.ts`

`env.ts` requires `SECURITY_PEPPER`, `SECURITY_ENC_KEY_HEX`, etc. with `.min(N)` validation. But `crypto.ts` silently generates fallbacks for all of these in development:

```
if (!generatedDevPepper) {
  generatedDevPepper = crypto.randomBytes(32).toString('hex');
}
```

This means either:

- `env.ts` validation runs first → fails because env vars aren't set → **app crashes at startup**
- Or `crypto.ts` is imported first → generates fallbacks → `env.ts` validation later sees the env vars are still unset → **app crashes**

In practice, the `instrumentation.ts` calls `validateEnv()` at startup, which throws if SECURITY_PEPPER isn't set — even though `crypto.ts` would work fine without it in development. This makes the dev experience worse: developers must set random-looking hex strings in `.env` just to start the app.

### 12. `guestDataStore.ts` — Module-Level Cache Created at Import Time

**File**: `src/lib/guestDataStore.ts`

```typescript
export const guestStore = {
  async createUser(input) {
    // ...
    guestDataCache.invalidate(['users']);
  },
  // ...
};
```

The `guestDataCache` is imported from `guestDataCache.ts` which eagerly creates resolvers that call `getGuestDatasetSnapshot()` — which uses `prisma`. During Next.js build, when `DATABASE_URL` is not set, importing `guestDataStore` will attempt to init the Prisma client and crash.

The `prisma.ts` module has a guard (`if (process.env.DATABASE_URL)`), but `guestDataStore` is imported unconditionally by API route files. Any API route that imports `guestDataStore` during build will crash.

---

## 🟡 MEDIUM-SEVERITY ISSUES

### 13. `i18n/dictionaries.ts` — Full JSON Serialization on Every Dictionary Access

```typescript
export function getDictionary(locale: Locale): Dictionary {
  const base = dictionaries[locale] ?? dictionaries.en;
  return JSON.parse(JSON.stringify(base)) as Dictionary;
}
```

Serializes and deserializes the entire dictionary (~20KB per locale) on every call. For a page that accesses the dictionary once per render, this is fine. But for components or hooks that call `getDictionary` in render loops or effects, this is wasted CPU. A shallow clone would achieve immutability at a fraction of the cost.

### 14. `bookingLastNameTokens.ts` — `createBookingLastNameTokens` Normalizes Twice

When called from `buildBookingLastNameTokenSearchValues`:

```typescript
const normalized = normalizeBookingLastName(lastName); // First normalization
const hmacTokens = normalized
  ? createBookingLastNameTokens(normalized)  // Second normalization inside
  : undefined;
```

`createBookingLastNameTokens` internally calls `normalizeBookingLastName` again on the already-normalized value. This is idempotent but wasteful. The function should accept both raw and pre-normalized values.

### 15. `distributed-tracing.ts` — In-Memory Span Storage Could Leak Memory

**MaxSpans**: 10,000. **Retention**: 1 hour. **Cleanup interval**: 6 minutes.

In production with moderate traffic (10 req/s), spans accumulate at ~20-30 per request (Prisma query events + API calls + business logic). In 6 minutes, that's 10 × 30 × 360 = 108,000 spans — 10× the max. The cleanup code removes the oldest span by key insertion order (`Array.from(this.spans.keys())[0]`), which is a Map's insertion order. But 10,000 spans retained means ~300 requests of history, not 1 hour. The cleanup logic is also O(n) where n = 10,000, running every 6 minutes.

### 16. `analyticsStore.ts` — `loadHits()` Called but Loading Guard May Block

The `loading` flag prevents concurrent loading:

```typescript
if (loaded || loading) return;
loading = true;
```

But if `loadHits` throws an error, `loading` is set back to `false` in the `finally` block, and `loaded` is set to `true`. So after the first error, all subsequent calls are no-ops with `loaded = true`. The analytics are permanently disabled after the first persistence error.

### 17. `packages.json` — Dead Override Entries

```json
"overrides": {
  "@prisma/dev": "0.24.14",
  "@sentry/node": "^10.64.0",
  "postcss": "$postcss"
}
```

- `@prisma/dev` at version `0.24.14` — Prisma is on 7.x. This is either a very old transitive dependency or a typo. It's almost certainly never resolved.
- `@sentry/node` at `^10.64.0` — There's no `@sentry/node` in dependencies. This override does nothing.

### 18. `crypto.ts` — `verifySensitive` Creates Buffers Every Call

```typescript
export function verifySensitive(value: string, salt: string, expectedHash: string): boolean {
  const h = crypto.createHash('sha256').update(PEPPER + ':' + salt + ':' + value).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(expectedHash, 'hex'));
}
```

The timing-safe comparison is correct, but creating `Buffer.from(...)` on every call is allocation-heavy for high-frequency operations like refresh token rotation. Consider caching expected hash as Buffer at write time.

---

## 🟢 LOW-SEVERITY / COSMETIC ISSUES

### 19. `check-in/complete/route.ts` — Double Metrics Recording

```typescript
metrics.timer('api_checkin_complete_duration_ms', Date.now() - start, { ... });
// ... then later:
metrics.trackApiCall('/api/check-in/complete', 'POST', 200, Date.now() - start);
```

`trackApiCall` internally calls `timer` again, recording the same duration twice. Use one or the other.

### 20. `UnifiedGuestClient.tsx` — Inline `!important` in CSS Custom Property

```tsx
style={{ color: 'var(--fg-default) !important', ... }}
```

Inline styles already have the highest specificity — `!important` is redundant. More importantly, CSS custom properties cannot be set via inline style in some older browsers.

### 21. `UnifiedGuestClient.tsx` — 600-Line Single Component

The client component handles:

- Two auth modes (sign-in/sign-up)
- Origin selection (GR/ABROAD)
- Multiple form fields with validation
- Custom country code dropdown with animations
- Error handling with field-specific messages
- Analytics tracking
- Session management

This should be split into smaller components (`AuthModeToggle`, `OriginSelector`, `PhoneInput`, `PasswordField`, `IdentityField`, `OptionalSection`).

### 22. `proxy.ts` — Inconsistent Redirect Status Codes

- Locale redirect: `NextResponse.redirect(url)` = 307 (Temporary)
- Legacy `/house` → `/apartment`: `NextResponse.redirect(url2, 308)` = 308 (Permanent)

The locale redirect should be 302 (Temporary — user preference can change) rather than 307, or the comment should explain why 307 was chosen.

### 23. `data/categories.ts` — Categories Sorted by `order` Field Without Tiebreaker

```typescript
.sort((a,b) => (a.order ?? 999) - (b.order ?? 999))
```

If two categories have the same `order` value, their relative order is implementation-dependent (stable in modern V8, but not spec-guaranteed).

### 24. `bookingLastNameTokens.ts` — `isLegacyRawBookingLastNameToken` Function Is Exported but Never Called

The function exists to detect legacy raw tokens, but no code path ever calls it. It's dead code that should either be removed or integrated into the lookup logic.

---

## 🔧 REFACTOR RECOMMENDATIONS

### R1. Consolidate Duplicate Runtime Adapters into a Shared Interface

**Problem**: Three feature areas have separate Node/Edge implementations that drift independently.

**Recommendation**: Create an adapter pattern:

```typescript
// lib/tracing/types.ts
export interface TracerAdapter {
  startSpan(name: string, parent?: TraceContext, tags?: Tags): Span;
  finishSpan(span: Span, status?: SpanStatus): void;
  injectTraceContext(ctx: TraceContext): Record<string, string>;
  extractTraceContext(headers: Record<string, string>): TraceContext | null;
}

// lib/tracing/node-tracer.ts — full implementation
// lib/tracing/edge-tracer.ts — lightweight implementation
// lib/tracing/index.ts — exports the appropriate one based on runtime
```

Same pattern for security middleware and metrics. This eliminates duplication and ensures parity.

### R2. Extract Common "Link User to Booking" Logic

**Problem**: `linkUserToBookingWithAccess` and `registerOnsiteGuest` in `guestDataStore.ts` share ~80% of their code (find-or-create user, find-or-create booking with lastName token matching, upsert access).

**Recommendation**: Extract a shared `_linkUserToBooking` private function that both methods call:

```typescript
async function _linkUserToBooking(tx: Transaction, params: {
  userId: string;
  phone: string;
  origin: string;
  bookingRef?: string;
  lastName?: string;
  startDate: string;
  endDate: string;
}): Promise<{ booking: Booking; access: BookingAccess }>
```

### R3. Fix `env.ts` / `crypto.ts` Validation Mismatch

**Problem**: `env.ts` requires all secrets, but `crypto.ts` generates dev fallbacks. This creates a confusing developer experience where `validateEnv()` crashes but the app would work fine without those env vars.

**Recommendation**: Make `env.ts` only warn (not throw) in development if secrets are missing, or document clearly that developers must set these values. The `crypto.ts` fallback logic is good for rapid development; don't break it with strict `env.ts` validation.

### R4. Replace In-Memory Analytics with PostgreSQL Storage

**Problem**: Analytics storage is entirely in-memory and broken on serverless.

**Recommendation**: Use the existing PostgreSQL database (via Prisma) for analytics persistence:

- `Metric` model already exists in the schema
- Add an `AnalyticsHit` model
- Add an `AnalyticsVital` model
- Use the existing `Log` model for structured logging

This eliminates the need for file adapters, KV adapters, and the `NoopAdapter` hack.

### R5. Remove Redundant SQL Injection / XSS Middleware

**Problem**: Regex-based XSS/SQLi detection in middleware is an anti-pattern that causes false positives, false negatives, and maintenance burden.

**Recommendation**: Remove `SQLInjectionProtectionMiddleware` and `XSSProtectionMiddleware` from the API security chain. Rely on:

1. Prisma's parameterized queries (SQL injection is impossible)
2. React's automatic output encoding (XSS is prevented at the framework level)
3. CSP with proper nonces (for defense-in-depth)

Keep the input validation middleware (payload size limits, content type checks).

---

## 🧹 SUMMARY TABLE

| #  | Severity        | Category      | File(s)                                                | Issue                                                                 |
| -- | --------------- | ------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| 1  | 🔴 Bug          | Booking       | `bookingLastNameTokens.ts`, `bookingRepository.ts` | Raw text returned alongside HMAC tokens, causing confusing OR queries |
| 2  | 🔴 Bug          | Booking       | `guestDataStore.ts`                                  | `linkUserToBookingWithAccess` always creates duplicate bookings     |
| 3  | 🔴 Bug          | Analytics     | `analyticsStore.ts`, `storageAdapter.ts`           | Entire analytics system is non-functional on Vercel                   |
| 4  | 🔴 Bug          | Security      | `proxy.ts`, `security-config.ts`                   | CSP nonces disabled,`unsafe-inline` required                        |
| 5  | 🔴 Bug          | Metrics       | `metrics-collector.ts`                               | `getSessionId()` uses `window.sessionStorage` in server code      |
| 6  | 🔴 Bug          | Check-in      | `check-in/arrival-request/route.ts`                  | Webhook failures are silent (no retry)                                |
| 7  | 🔴 Refactor     | Cross-cutting | 6 files across 3 feature pairs                         | Massive Node/Edge duplication with drift                              |
| 8  | 🟡 Type Bug     | Auth          | `auth/admin.ts`                                      | Misleading type allows overriding`type`/`role`                    |
| 9  | 🟡 UX Bug       | Portal        | `UnifiedGuestClient.tsx`                             | Dial code switch doesn't reconcile phone number                       |
| 10 | 🟡 Anti-pattern | Security      | `api-security-middleware.ts`                         | Regex-based XSS/SQLi detection                                        |
| 11 | 🟡 Config       | Dev UX        | `env.ts`, `crypto.ts`                              | Validation crashes in dev despite fallbacks existing                  |
| 12 | 🟡 Build        | Startup       | `guestDataStore.ts`                                  | Module-level cache crashes during build without DB                    |
| 13 | 🟢 Performance  | i18n          | `dictionaries.ts`                                    | Full JSON serialize/parse on every access                             |
| 14 | 🟢 Redundancy   | Booking       | `bookingLastNameTokens.ts`                           | Double normalization of lastName                                      |
| 15 | 🟢 Memory       | Tracing       | `distributed-tracing.ts`                             | Span storage could exceed maxSpans rapidly                            |
| 16 | 🟢 Resilience   | Analytics     | `analyticsStore.ts`                                  | After first error, analytics permanently disabled                     |
| 17 | 🟢 Config       | Package       | `package.json`                                       | Dead override entries for`@prisma/dev`, `@sentry/node`            |
| 18 | 🟢 Performance  | Crypto        | `crypto.ts`                                          | `verifySensitive` allocates Buffers every call                      |
| 19 | 🟢 Redundancy   | APIs          | `check-in/complete/route.ts`                         | Double duration recording                                             |
| 20 | 🟢 CSS          | UI            | `UnifiedGuestClient.tsx`                             | Redundant`!important` in inline styles                              |
| 21 | 🟢 Maintain     | UI            | `UnifiedGuestClient.tsx`                             | 600-line component should be split                                    |
| 22 | 🟢 Config       | Routing       | `proxy.ts`                                           | Inconsistent redirect status codes                                    |
| 23 | 🟢 Edge Case    | Data          | `data/categories.ts`                                 | Same`order` values produce undefined sort                           |
| 24 | 🟢 Dead Code    | Booking       | `bookingLastNameTokens.ts`                           | `isLegacyRawBookingLastNameToken` is exported but never called      |

---

## 🔍 UNVERIFIED / NEEDS FURTHER INVESTIGATION

- **`check-pepper.js` and `ensure-pepper.js`** — These scripts run during `predev` and `ensure-pepper`. The `check-pepper.js` likely validates the pepper at startup, but I haven't read the actual scripts to verify the logic.
- **`public/sw.js`** — A service worker file exists at the root of `public`. It's unclear how it interacts with the guest checkout flow and whether it properly handles offline analytics queuing (mentioned in `analyticsClient.ts`).
- **`src/lib/prisma-repositories/refreshTokenRepository.ts`** — The legacy token verification path iterates over ALL active tokens with `findMany`, which could be a performance issue with thousands of active refresh tokens.
- **`src/app/api/portal/refresh/`** — The refresh token endpoint exists but I haven't verified the implementation handles all edge cases (concurrent refresh, token theft, family revocation).
