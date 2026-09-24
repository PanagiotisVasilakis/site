# Booking claim capability transport

The booking claim grant is a short-lived, booking-bound, one-time database
record. Its capability travels through the browser as follows:

1. An authenticated administrator issues a grant. The raw token is returned
   once in a `no-store` response and shown for manual copy; the application does
   not construct a guest link containing it.
2. The guest pastes the token into the activation form. JavaScript sends it only
   in a same-origin `POST /api/portal/claim-exchange` JSON body.
3. The server re-hashes and authoritatively checks the unconsumed, unrevoked,
   unexpired grant and the canonical booking eligibility window. It stores only
   the existing digest in a Secure, HttpOnly, SameSite=Strict cookie whose
   lifetime is at most five minutes and never exceeds the grant expiry.
4. `POST /api/portal/claims` accepts credentials in JSON and the server-issued
   exchange cookie. Its existing Serializable transaction rechecks expiry,
   `businessToday + 7 days`, booking ownership, one-time consumption, and
   sibling revocation before issuing guest auth cookies.
5. The exchange cookie is cleared after every claim response, including
   success, validation/credential failure, expiry, and replay. A failed exchange
   clears any previously presented exchange cookie.

No claim value is accepted from a query parameter, path segment, fragment,
redirect, or `Location` header. The guest client removes the two legacy query
names and any legacy claim fragment from the current history entry without
using their values. The guest page sends `Referrer-Policy: no-referrer`;
application diagnostics record only pathnames; Nginx access logs use `$uri`
rather than `$request_uri`. Neither analytics nor security audit details contain
the token or its exchange digest.

The digest cookie is not a session and grants no access by itself. It is
bounded by the underlying grant and the claim transaction remains the only
domain mutation path.
