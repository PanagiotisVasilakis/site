# Audit του `project_info__1.md`

Ημερομηνία ελέγχου: 2026-07-10

Scope: διασταύρωση όλων των findings του report με τον τρέχοντα κώδικα του repo, χωρίς εφαρμογή διορθώσεων. Το working tree ήταν ήδη dirty πριν τον έλεγχο, άρα τα συμπεράσματα αφορούν την τρέχουσα τοπική κατάσταση.

## Εκτελεστική σύνοψη

Το report είναι χρήσιμο, αλλά δεν είναι ισοδύναμο με verified audit. Πολλά findings είναι σωστά ως κατεύθυνση, μερικά είναι υπερβολικά στη σοβαρότητα, και μερικά είναι λανθασμένα ή stale για τον τρέχοντα κώδικα.

Τα σημαντικότερα πραγματικά προβλήματα που πρέπει να αντιμετωπιστούν πρώτα είναι:

1. Analytics persistence: σε Vercel το server-side analytics storage δεν είναι durable.
2. CSP: production CSP κρατά `unsafe-inline` και δεν χρησιμοποιεί nonce.
3. Booking linkage: το report κάνει λάθος στο "always creates duplicates", αλλά υπάρχει πραγματικό data-integrity κενό: όταν βρεθεί υπάρχον booking δεν ενημερώνεται το `booking.userId`, ενώ sign-in/refresh βασίζονται στο `userId`.
4. Webhook delivery: check-in arrival webhook αποτυγχάνει σιωπηλά από πλευράς business flow.
5. Node/Edge duplication: security/tracing/metrics έχουν παράλληλες implementations που έχουν ήδη drift.
6. Regex-based SQLi/XSS middleware: είναι ενεργό, brittle, και τα tests κλειδώνουν αυτή τη συμπεριφορά αντί να την περιορίζουν.
7. Refresh token legacy path: η νέα ροή είναι καλή, αλλά legacy secret-only verification κάνει scan όλων των active tokens.
8. Service worker analytics queue: υπάρχει offline queue, αλλά στο flush τα items διαγράφονται πριν επιβεβαιωθεί επιτυχές replay και δεν ελέγχεται `response.ok`.

## Verification που έτρεξε

- `npx vitest run src/lib/bookingLastNameTokens.test.ts src/lib/__tests__/refreshTokenRepository.test.ts src/lib/analyticsStore.test.ts --reporter=default`
  - 3 test files passed, 10 tests passed.
- `npm run typecheck`
  - `tsc --noEmit` passed.
- `npm run test:security`
  - 3 test files passed, 43 tests passed, 1 skipped.
  - Τα stderr/stdout security logs είναι expected από tests που ελέγχουν failure paths.
- `env -u DATABASE_URL NODE_ENV=development npx tsx -e "import('./src/lib/guestDataStore.ts')..."`
  - Import πέρασε χωρίς `DATABASE_URL`, άρα το import-time crash claim για `guestDataStore` δεν επιβεβαιώνεται.
- `npm ls @sentry/node @prisma/dev --depth=4`
  - Και τα δύο package overrides αποδείχθηκαν ενεργά, όχι dead.

## Συμπεράσματα ανά finding

### 1. Raw text μέσα στο `buildBookingLastNameTokenSearchValues`

Verdict: Μερικώς σωστό, αλλά το report χάνει το legacy context.

Στο `src/lib/bookingLastNameTokens.ts:55-67`, η helper επιστρέφει HMAC tokens και raw normalized values. Στο `src/lib/prisma-repositories/bookingRepository.ts:60-71`, όλα μπαίνουν σε OR clauses για `lastNameToken` και `lastNameTokenNoWs`.

Αυτό όντως κάνει άχρηστα OR clauses όταν τα stored tokens είναι HMAC. Δεν είναι όμως απαραίτητα "by accident": το test `src/lib/bookingLastNameTokens.test.ts:28-34` λέει ρητά ότι τα raw values υπάρχουν για backward compatibility, και το `scripts/repair-booking-last-name-tokens.ts:28-46` τα χρησιμοποιεί για repair legacy raw tokens.

Συμπέρασμα: να μη σβηστεί τυφλά. Χρειάζεται migration plan: πρώτα audit/repair legacy rows, μετά να αφαιρεθούν raw candidates ή να μπουν πίσω από explicit legacy mode.

### 2. `linkUserToBookingWithAccess` πάντα δημιουργεί duplicate booking

Verdict: Λάθος όπως γράφτηκε, αλλά υπάρχει πραγματικό data-integrity bug.

Στο `src/lib/guestDataStore.ts:400-412` γίνεται lookup, και στο `src/lib/guestDataStore.ts:414-433` δημιουργείται νέο booking μόνο αν `!bookingDb`. Άρα το "always creates" είναι λάθος.

Το πραγματικό πρόβλημα είναι άλλο: όταν υπάρχει `bookingDb`, ο κώδικας κάνει access upsert στο `src/lib/guestDataStore.ts:435-451`, αλλά δεν ενημερώνει το `bookingDb.userId`. Μετά το sign-in ψάχνει booking από `userId` στο `src/lib/prisma-repositories/bookingRepository.ts:91-103`, και το refresh κάνει το ίδιο μέσω `findEligibleBookingForUser` στο `src/app/api/portal/refresh/route.ts:70-75`.

Συμπέρασμα: η υπάρχουσα πρόσβαση μπορεί να δουλέψει στο πρώτο session, αλλά μελλοντικό sign-in/refresh μπορεί να μη βρίσκει eligible booking αν το `userId` έμεινε null ή σε άλλον χρήστη. Επίσης δεν υπάρχει unique constraint στο `prisma/schema.prisma:51-75`, μόνο index, άρα race duplicates παραμένουν πιθανές.

### 3. Analytics non-functional σε Vercel

Verdict: Επιβεβαιωμένο με ακριβέστερη διατύπωση.

Το `src/lib/analyticsStore.ts:9-19` κρατά hits/vitals/firstSeen σε module-level memory. Το `persistEnabled` είναι false σε Vercel λόγω `&& !process.env.VERCEL`. Το `src/lib/storageAdapter.ts:308-314` επιστρέφει `NoopAdapter` αν `process.env.VERCEL`.

Συμπέρασμα: σε warm serverless instance μπορεί προσωρινά να υπάρχουν δεδομένα, αλλά δεν είναι durable, δεν είναι shared μεταξύ instances, και χάνονται σε cold start/deploy. Για production analytics είναι ουσιαστικά μη αξιόπιστο.

### 4. CSP nonces disabled

Verdict: Επιβεβαιωμένο.

Το proxy δημιουργεί security middleware με `enableNonce: false` στο `src/proxy.ts:24-30`. Το security config έχει `useNonce: false` σε development και production στο `src/lib/security-config.ts:106-125` και `src/lib/security-config.ts:191-210`. Production `scriptSrc` έχει `unsafe-inline` στο `src/lib/security-config.ts:196-198`.

Συμπέρασμα: τα security headers υπάρχουν, αλλά το CSP δεν προσφέρει ισχυρή προστασία απέναντι σε inline script injection. Η αιτία είναι τεχνική δυσκολία με static localized pages, όχι απλή παράλειψη.

### 5. Metrics session ID σε server code

Verdict: Επιβεβαιωμένο.

Το `trackEvent` βάζει `sessionId: this.getSessionId()` στο `src/lib/metrics-collector.ts:292-301`. Στον server, `getSessionId` επιστρέφει κάθε φορά `server_session_${Date.now()}` στο `src/lib/metrics-collector.ts:750-760`.

Συμπέρασμα: server-side business metrics δεν μπορούν να ομαδοποιηθούν σε σταθερό session. Θέλει request/session/correlation context αντί για `Date.now()`.

### 6. Check-in request webhook χωρίς retry

Verdict: Επιβεβαιωμένο.

Το `notifyHost` κάνει ένα fetch με timeout στο `src/app/api/check-in/arrival-request/route.ts:57-75`. Non-OK ή exception γίνονται warning στο `src/app/api/check-in/arrival-request/route.ts:77-88`. Το API επιστρέφει success μετά το `await notifyHost` στο `src/app/api/check-in/arrival-request/route.ts:132-139`.

Συμπέρασμα: το request αποθηκεύεται, αλλά host notification μπορεί να χαθεί χωρίς retry/dead-letter/status. Αυτό είναι business reliability issue.

### 7. Node/Edge duplication σε security/tracing/metrics

Verdict: Επιβεβαιωμένο.

Line counts:

- `security-middleware.ts`: 401 lines.
- `security-middleware-edge.ts`: 355 lines.
- `distributed-tracing.ts`: 428 lines.
- `distributed-tracing-lite.ts`: 131 lines.
- `metrics-collector.ts`: 769 lines.
- `metrics-lite.ts`: 26 lines.

Υπάρχει drift: για παράδειγμα Node security logging ελέγχει μόνο `monitoring.enabled` στο `src/lib/security-middleware.ts:166-168`, ενώ Edge ελέγχει και `logSecurityEvents` στο `src/lib/security-middleware-edge.ts:147-150`. Το Edge metrics είναι no-op στο `src/lib/metrics-lite.ts:15-24`.

Συμπέρασμα: το report έχει δίκιο. Θέλει shared interfaces και runtime adapters.

### 8. `signAdmin` επιτρέπει override `type`/`role`

Verdict: Μερικώς σωστό.

Το payload type στο `src/lib/auth/admin.ts:50` περιλαμβάνει `Partial<Pick<AdminAuthPayload, 'type' | 'role'>>`, και το spread είναι μετά τα defaults στο `src/lib/auth/admin.ts:51-55`. Runtime payload μπορεί να αντικαταστήσει defaults.

Με καθαρή TypeScript χρήση, τα literals είναι πάλι `'admin'`, άρα δεν είναι τόσο ανοιχτό όσο ακούγεται. Όμως από JS/`as any`/buggy caller μπορεί να γίνει override. Επίσης `verifyAdmin` ελέγχει μόνο `role`, όχι `type`, στο `src/lib/auth/admin.ts:64-73`.

Συμπέρασμα: χαμηλό κόστος fix. Τα defaults πρέπει να μπαίνουν τελευταία και το type signature να μην επιτρέπει αυτά τα fields.

### 9. Dial code switch δεν συμφιλιώνει phone number

Verdict: Επιβεβαιωμένο.

Το dropdown αλλάζει μόνο `phoneDial` στο `src/app/[locale]/guest/UnifiedGuestClient.tsx:88-91`. Το origin change επίσης αλλάζει dial code χωρίς να αγγίζει το `phone` στο `src/app/[locale]/guest/UnifiedGuestClient.tsx:123-129`. Στο submit γίνεται απλή συνένωση στο `src/app/[locale]/guest/UnifiedGuestClient.tsx:242-247`.

Συμπέρασμα: UX/data bug. Ένα ελληνικό local number μπορεί να γίνει λάθος E.164 όταν αλλάξει dial code.

### 10. Regex SQLi/XSS middleware

Verdict: Επιβεβαιωμένο ως design anti-pattern.

SQL patterns υπάρχουν στο `src/lib/api-security-middleware.ts:115-155`, XSS patterns στο `src/lib/api-security-middleware.ts:183-247`, και το combined middleware τα τρέχει στο `src/lib/api-security-middleware.ts:383-417`. Είναι ενεργά στο production config στο `src/lib/security-config.ts:258-269`.

Δεν βρέθηκε raw SQL surface με `rg` για `$queryRaw`, `$executeRaw`, `Prisma.sql`, κλπ. Τα tests μάλιστα assert-άρουν το blacklist behavior στο `src/__tests__/security.test.ts:247-315`.

Συμπέρασμα: να αφαιρεθεί ή να περιοριστεί σε logging-only / high-confidence detection. Η κύρια άμυνα πρέπει να είναι schema validation, Prisma parameterization, escaping/output encoding, και ισχυρό CSP.

### 11. `env.ts` strict secrets vs `crypto.ts` dev fallbacks

Verdict: Επιβεβαιωμένο ως ασυνέπεια, με mitigation.

Το `src/lib/env.ts:13-24` απαιτεί DB και secrets. Το `instrumentation.ts:7-19` καλεί `validateEnv()` σε startup και κάνει throw. Το `src/lib/crypto.ts:44-100` μπορεί να δημιουργήσει dev pepper/encryption key fallback.

Στο τρέχον repo υπάρχει mitigation: `scripts/check-pepper.js:29-35` προειδοποιεί χωρίς να κόβει το dev, και `scripts/ensure-pepper.js:27-50` συμπληρώνει missing local secrets. Αυτό ταιριάζει και με το προηγούμενο project memory: το stable local path είναι bootstrap/ensure-pepper.

Συμπέρασμα: όχι άμεσο blocker στην τρέχουσα `.env.local`, αλλά design debt. Το strict validator και οι crypto fallbacks πρέπει να ευθυγραμμιστούν.

### 12. `guestDataStore` import-time build crash λόγω cache

Verdict: Δεν επιβεβαιώνεται στον τρέχοντα κώδικα.

Το `src/lib/guestDataCache.ts:129-137` δημιουργεί resolvers ως lambdas, δεν καλεί DB στο constructor. Το `src/lib/prisma.ts:216-250` αφήνει proxy και κάνει throw μόνο όταν ζητηθεί ενεργός client χωρίς `DATABASE_URL`.

Έτρεξε import test χωρίς `DATABASE_URL` και πέρασε με `import ok`.

Συμπέρασμα: το claim είναι stale/λάθος. Το πραγματικό ρίσκο είναι runtime DB access χωρίς DB ή startup `validateEnv`, όχι απλό import του `guestDataStore`.

### 13. `getDictionary` κάνει JSON clone σε κάθε access

Verdict: Επιβεβαιωμένο, χαμηλής σοβαρότητας.

Το `src/i18n/dictionaries.ts:89-92` κάνει `JSON.parse(JSON.stringify(base))`. Υπάρχουν αρκετά call sites, π.χ. components και pages. Πολλά client σημεία το τυλίγουν με `useMemo`, αλλά όχι όλα.

Συμπέρασμα: χαμηλό performance debt. Προτιμότερο immutable/frozen canonical dictionary ή shallow clone ανά domain.

### 14. Double normalization στα booking last-name tokens

Verdict: Επιβεβαιωμένο.

Το `buildBookingLastNameTokenSearchValues` κάνει normalize στο `src/lib/bookingLastNameTokens.ts:55-57` και μετά καλεί `createBookingLastNameTokens(normalized)` στο `src/lib/bookingLastNameTokens.ts:58-60`, ενώ εκεί γίνεται ξανά normalize στο `src/lib/bookingLastNameTokens.ts:21-22`.

Συμπέρασμα: μικρή σπατάλη, εύκολο cleanup όταν φτιαχτεί το token API.

### 15. Distributed tracing span storage leak

Verdict: Μερικώς σωστό, αλλά "leak" είναι υπερβολικό.

Το `src/lib/distributed-tracing.ts:49-53` έχει Map με `maxSpans=10000` και retention 1 ώρα. Το `startSpan` κόβει oldest όταν περάσει το cap στο `src/lib/distributed-tracing.ts:160-166`. Cleanup παλιών spans υπάρχει στο `src/lib/distributed-tracing.ts:333-349`.

Συμπέρασμα: δεν είναι unbounded leak. Είναι bounded memory store με misleading 1-hour retention υπό traffic, O(n) cleanup και πιθανό high churn. Θέλει ring buffer/exporter ή sampling.

### 16. Analytics `loadHits` permanently disabled after first load error

Verdict: Επιβεβαιωμένο.

Στο `src/lib/analyticsStore.ts:28-91`, αν `storage.load()` πετάξει exception, το catch κάνει `loaded = true` στο `src/lib/analyticsStore.ts:86-89`. Μετά όλα τα μελλοντικά calls σταματούν στο `if (loaded || loading) return`.

Συμπέρασμα: για persistent modes εκτός Vercel, ένα transient load error κλειδώνει το analytics load μέχρι process restart.

### 17. Dead override entries σε `package.json`

Verdict: Λάθος στον τρέχοντα κώδικα.

Το report λέει ότι `@prisma/dev` και `@sentry/node` overrides είναι dead. Το `npm ls @sentry/node @prisma/dev --depth=4` έδειξε:

- `prisma@7.8.0 -> @prisma/dev@0.24.14 overridden`
- `lighthouse@13.4.0 -> @sentry/node@10.64.0`

Συμπέρασμα: να μην αφαιρεθούν χωρίς ξεχωριστό dependency audit. Το finding είναι refuted.

### 18. `verifySensitive` κάνει Buffer allocations κάθε call

Verdict: Επιβεβαιωμένο, αλλά χαμηλής προτεραιότητας.

Το `src/lib/crypto.ts:118-120` κάνει `Buffer.from` και για actual και expected hash κάθε φορά.

Συμπέρασμα: micro-performance issue. Να μη γίνει πριν διορθωθούν analytics/CSP/booking/webhooks. Αν γίνει, να διατηρηθεί constant-time behavior και length safety.

### 19. Double metrics στο check-in complete

Verdict: Επιβεβαιωμένο ως overlapping metrics, όχι ακριβώς ίδιο metric name.

Στο success path του `src/app/api/check-in/complete/route.ts:43-47`, γίνεται `metrics.trackApiCall(...)` και μετά `metrics.timer('api_checkin_complete_duration_ms', ...)`. Το `trackApiCall` γράφει δικό του `api.response_time` timer στο `src/lib/metrics-collector.ts:326-337`.

Συμπέρασμα: γράφονται δύο duration signals για το ίδιο request. Χρειάζεται ενιαία convention.

### 20. Inline `!important` σε React style

Verdict: Επιβεβαιωμένο και πιθανόν χειρότερο από redundant.

Υπάρχουν πολλά `color: 'var(--fg-default) !important'` στο `src/app/[locale]/guest/UnifiedGuestClient.tsx`, π.χ. `:575`, `:599`, `:631`, `:656`, `:682`, `:761`.

Συμπέρασμα: σε React inline style το `!important` μέσα στο value δεν είναι σωστός τρόπος να οριστεί priority και μπορεί να αγνοηθεί ως invalid value. Θέλει CSS class/token cleanup.

### 21. `UnifiedGuestClient.tsx` μεγάλο component

Verdict: Επιβεβαιωμένο, και το report υποτιμά το μέγεθος.

Το αρχείο έχει 795 γραμμές, όχι περίπου 600. Περιέχει mode switching, origin, phone dropdown, validation, error mapping, optional section, submit, analytics, session redirect.

Συμπέρασμα: refactor αξίζει, αλλά μετά τα data/security fixes. Να γίνει με tests για να μη σπάσει guest flow.

### 22. Inconsistent redirect status codes στο `proxy.ts`

Verdict: Επιβεβαιωμένο, χαμηλή σοβαρότητα.

Locale redirect χρησιμοποιεί default `NextResponse.redirect(url)` στο `src/proxy.ts:95-107`, που είναι 307. Legacy `/house` redirect χρησιμοποιεί 308 στο `src/proxy.ts:130-139`.

Συμπέρασμα: 308 για legacy SEO είναι λογικό. Locale redirect μάλλον πρέπει να είναι explicit 302/307 με σχόλιο. Χαμηλό priority.

### 23. Categories sort χωρίς tiebreaker

Verdict: Σχεδόν refuted ως πρακτικό πρόβλημα.

Το sort υπάρχει στο `src/lib/data.ts:13-17`. Οι τρέχουσες categories έχουν μοναδικά order values στο `src/data/categories.ts:3-6`. Επιπλέον, σε σύγχρονο JS το `Array.prototype.sort` είναι stable, άρα το "not spec-guaranteed" του report δεν ισχύει για σύγχρονα runtimes.

Συμπέρασμα: αν προστεθούν πολλές categories, ένα tiebreaker σε `title`/`slug` βοηθά, αλλά δεν είναι πραγματικό bug τώρα.

### 24. `isLegacyRawBookingLastNameToken` dead code

Verdict: Λάθος.

Η function ορίζεται στο `src/lib/bookingLastNameTokens.ts:70-72`, αλλά χρησιμοποιείται στο `scripts/repair-booking-last-name-tokens.ts:3-7` και `:28-46`, και καλύπτεται από tests στο `src/lib/bookingLastNameTokens.test.ts:36-43`.

Συμπέρασμα: δεν είναι dead code. Είναι migration/repair API. Μπορεί να αφαιρεθεί μόνο αφού αποδειχθεί ότι δεν υπάρχουν legacy raw rows και αποσυρθεί το repair script.

## Refactor recommendations του report

### R1. Runtime adapters για Node/Edge

Verdict: Σωστό. Να γίνει, αλλά σε οργανωμένο migration. Πρώτα shared types/contracts, μετά μεταφορά business policy, μετά Node/Edge implementations.

### R2. Shared link-user-to-booking logic

Verdict: Σωστό και πιο σημαντικό από όσο γράφει το report. Πρέπει να εξαχθεί κοινή helper που:

- βρίσκει booking με canonical token candidates,
- ενημερώνει `booking.userId` όταν είναι ασφαλές,
- κάνει upsert access,
- αποφεύγει duplicate create με unique constraint ή transaction-safe upsert strategy,
- χρησιμοποιείται από verify και onsite confirm.

### R3. Env/crypto mismatch

Verdict: Σωστό ως πρόβλημα, αλλά η λύση δεν πρέπει να είναι απλώς "warn only". Για local dev, `ensure-pepper` είναι καλύτερη πρακτική επειδή δίνει σταθερά secrets ανά restart. Για production, fail-fast πρέπει να μείνει.

### R4. Analytics σε PostgreSQL

Verdict: Σωστό. Υπάρχει ήδη `Metric` model στο `prisma/schema.prisma:236-246` και `Log` model στο `prisma/schema.prisma:248-257`, αλλά δεν υπάρχουν dedicated `AnalyticsHit`/`AnalyticsVital` models. Θέλει schema + repository + retention.

### R5. Αφαίρεση regex SQLi/XSS middleware

Verdict: Σωστό ως κατεύθυνση, με προσοχή. Να μη χαθεί payload size/content-type validation. Τα blacklist detectors είτε αφαιρούνται είτε γίνονται logging-only/high-confidence, και τα tests αλλάζουν ώστε να ελέγχουν validation και CSP, όχι false sense of blocking.

## Unverified σημεία του report που ελέγχθηκαν

### `check-pepper.js` και `ensure-pepper.js`

Το `check-pepper.js` μόνο προειδοποιεί και δεν κόβει dev startup. Το `ensure-pepper.js` συμπληρώνει `SECURITY_PEPPER`, `SECURITY_ENC_KEY_HEX`, `GUEST_JWT_SECRET`, `GUEST_WIFI_NETWORK`, `GUEST_WIFI_PASSWORD` idempotently. Άρα το report σωστά ζήτησε έλεγχο, αλλά αυτά τα scripts είναι μέρος της λύσης, όχι πρόσθετο πρόβλημα.

### `public/sw.js`

Υπάρχει offline analytics queue με IndexedDB, message handling και background sync. Άρα δεν είναι "unclear". Όμως βρέθηκε επιπλέον πρόβλημα: στο `flushQueue` τα entries διαγράφονται στο `public/sw.js:138-155` πριν σταλούν. Στο replay `public/sw.js:156-166`, γίνεται re-enqueue μόνο σε thrown fetch error, όχι όταν το `/api/analytics` επιστρέψει non-OK. Αυτό μπορεί να χάσει queued analytics.

### `refreshTokenRepository.ts`

Το report έχει δίκιο μόνο για legacy path. Η νέα μορφή `<token-id>.<secret>` είναι O(1) στο `src/lib/prisma-repositories/refreshTokenRepository.ts:121-137`. Το legacy secret-only path κάνει `findMany` όλων των active tokens στο `src/lib/prisma-repositories/refreshTokenRepository.ts:139-158`. Το rotation path έχει replay/family revocation στο `src/lib/prisma-repositories/refreshTokenRepository.ts:191-270`, και τα targeted tests πέρασαν.

### `/api/portal/refresh`

Το endpoint χειρίζεται POST και GET, κάνει safe internal redirects, καθαρίζει cookies σε unauthorized, και χειρίζεται replay status. Τα repository rotation tests υπάρχουν και πέρασαν. Όμως το broader `src/__tests__/portalApi.test.ts:40-85` που καλύπτει direct refresh flow είναι skipped, άρα θέλει ενεργό integration test με DB.

## Πρόσθετα findings που προέκυψαν από τον έλεγχο

### A1. Existing booking linkage δεν ενημερώνει `booking.userId`

Αυτό είναι το σημαντικότερο πρόσθετο finding. Όταν το transaction βρει υπάρχον booking, δεν κάνει update του `userId`. Επειδή sign-in και refresh βρίσκουν eligible booking από `booking.userId`, ο χρήστης μπορεί να αποκτήσει access αλλά να μη μπορεί να ξαναμπεί σωστά μετά.

Προτεινόμενο fix: μέσα στο shared link helper, αν το booking είναι unclaimed (`userId == null`) να γίνεται update σε `params.userId`. Αν είναι claimed από άλλον user, να απορρίπτεται ή να απαιτεί admin/manual reconciliation. Να μη γίνεται silent overwrite.

### A2. Service worker analytics replay μπορεί να χάσει payloads

Το `flushQueue` σβήνει queued payloads πριν βεβαιωθεί ότι στάλθηκαν επιτυχώς και δεν ελέγχει `response.ok`. Αυτό είναι σημαντικό αν το server analytics endpoint επιστρέψει 500/413/429.

Προτεινόμενο fix: peek/read entries, send, delete μόνο μετά από `response.ok`, με retry count και max age.

### A3. Production analytics KV mode είναι μη προσβάσιμο σε Vercel

Ακόμα και αν οριστεί `ANALYTICS_STORAGE=kv`, το `createStorageAdapter` γυρίζει `NoopAdapter` πρώτα όταν `process.env.VERCEL` είναι set. Άρα το KV mode δεν μπορεί να χρησιμοποιηθεί στη Vercel όπως είναι τώρα.

## Πλάνο αντιμετώπισης όλων των προβλημάτων

### Φάση 0: Safety baseline

1. Κρατάμε το παρόν audit ως baseline.
2. Τρέχουμε και κρατάμε καθαρό output για:
   - `npm run typecheck`
   - targeted booking/refresh/security tests
   - DB-backed booking flow tests, όταν υπάρχει `TEST_DATABASE_URL`.
3. Δεν πειράζουμε package overrides μέχρι να υπάρχει ξεχωριστό dependency audit, επειδή αποδείχθηκαν ενεργά.

### Φάση 1: Booking data integrity

1. Φτιάχνουμε shared helper για `findOrLinkBookingWithAccess`.
2. Διαχωρίζουμε canonical HMAC token candidates από legacy raw candidates.
3. Προσθέτουμε update του `booking.userId` για unclaimed existing bookings.
4. Ορίζουμε policy για booking already claimed by another user.
5. Προσθέτουμε DB unique/index strategy για `(reference, lastNameToken)` όπου επιτρέπεται από τα δεδομένα.
6. Γράφουμε integration tests για:
   - existing unclaimed booking linked to user,
   - existing claimed booking rejected,
   - no duplicate booking on repeated verify,
   - onsite confirm same behavior.
7. Τρέχουμε repair script dry-run για legacy raw tokens, μετά apply αν χρειάζεται.

### Φάση 2: Analytics persistence και queue reliability

1. Προσθέτουμε Prisma models για `AnalyticsHit` και `AnalyticsVital` ή ενιαίο event table.
2. Αντικαθιστούμε module arrays ως source of truth με repository-backed writes.
3. Κρατάμε small in-memory buffer μόνο ως performance cache, όχι persistence.
4. Διορθώνουμε `loadHits` ώστε transient load error να μην κάνει permanent `loaded=true`.
5. Διορθώνουμε `createStorageAdapter`: Vercel να μην force-άρει Noop πριν εξετάσει supported external backends.
6. Διορθώνουμε service worker replay: delete only after `response.ok`, retry count, max age.
7. Προσθέτουμε tests για persistence failure, Vercel mode, SW replay non-OK.

### Φάση 3: CSP και security middleware

1. Καταγράφουμε ποια inline scripts/styles απαιτούν `unsafe-inline`.
2. Ενεργοποιούμε nonce όπου γίνεται για dynamic routes.
3. Για static localized pages, αποφασίζουμε μία από τις εξής στρατηγικές:
   - move critical inline scripts out of inline path,
   - hash-based CSP για known static inline scripts,
   - split CSP profile ανά route type.
4. Αφαιρούμε `unsafe-inline` από production script-src όπου τεχνικά εφικτό.
5. Μετατρέπουμε regex SQLi/XSS blockers σε logging-only ή αφαιρούμε τα brittle checks.
6. Αναθεωρούμε security tests ώστε να μην επιβραβεύουν blacklist false positives.

### Φάση 4: Webhook delivery reliability

1. Προσθέτουμε delivery table ή job queue για check-in request notifications.
2. Το initial API response να ξεχωρίζει `requestCreated` από `notificationQueued`.
3. Retry με exponential backoff και max attempts.
4. Dead-letter status για μόνιμες αποτυχίες.
5. Admin visibility στο dashboard για failed notifications.
6. Tests για network error, 500 response, timeout, retry success.

### Φάση 5: Node/Edge adapter consolidation

1. Ορίζουμε shared interfaces για security headers, tracing, metrics.
2. Μεταφέρουμε CSP/header policy σε shared pure functions.
3. Κρατάμε Node/Edge μόνο ως runtime adapters.
4. Προσθέτουμε contract tests που τρέχουν και για Node και για Edge/lite implementation.
5. Αποφασίζουμε αν Edge metrics πρέπει να παραμένει no-op ή να στέλνει sampled events σε backend.

### Φάση 6: Auth/refresh cleanup

1. Διορθώνουμε `signAdmin` ώστε να μην δέχεται `type`/`role` και defaults να μπαίνουν τελευταία.
2. `verifyAdmin` να ελέγχει και `type === 'admin'`.
3. Στα refresh tokens, ορίζουμε deprecation plan για legacy secret-only tokens.
4. Μετά τη λήξη legacy window, αφαιρούμε `findMany` verification path.
5. Ενεργοποιούμε ή ξαναγράφουμε skipped portal refresh integration tests.

### Φάση 7: UI/UX refactor

1. Φτιάχνουμε phone normalization helper με tests.
2. Όταν αλλάζει dial code:
   - είτε καθαρίζει local phone,
   - είτε parse/re-prefix με libphonenumber-style logic.
3. Σπάμε `UnifiedGuestClient` σε:
   - `AuthModeToggle`
   - `OriginSelector`
   - `PhoneInput`
   - `PasswordField`
   - `IdentityFields`
   - `BookingOptionalSection`
   - `GuestAuthForm`
4. Αφαιρούμε inline `!important` και μεταφέρουμε styling σε classes/tokens.
5. Regression tests για submit payload και error rendering.

### Φάση 8: Low-priority cleanup

1. `getDictionary`: αντικατάσταση JSON deep clone με frozen dictionaries ή memoized clone.
2. Booking token normalization: API με raw/pre-normalized inputs χωρίς double normalize.
3. Tracing: ring buffer/sampling/exporter αντί για Map churn.
4. `check-in/complete`: ενιαία metrics convention.
5. Locale redirect: explicit status code και σχόλιο.
6. Category sort: optional tiebreaker μόνο αν προστεθούν categories ή αν θέλουμε deterministic readability.
7. `verifySensitive`: μόνο αν προκύψει profiling signal.

## Τελική προτεραιοποίηση

1. Booking linkage/data integrity.
2. Analytics persistence + SW replay reliability.
3. CSP nonce/unsafe-inline.
4. Webhook retry/dead-letter.
5. Node/Edge adapter consolidation.
6. Regex security middleware simplification.
7. Refresh legacy path deprecation.
8. UI phone handling και component split.
9. Low-priority performance/cosmetic cleanup.

