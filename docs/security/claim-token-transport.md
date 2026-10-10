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
   the existing digest and a MAC of it under the server's security pepper
   (`digest.mac`, both 64 hex characters) in a Secure, HttpOnly,
   SameSite=Strict cookie whose lifetime is at most five minutes and never
   exceeds the grant expiry. The five minutes are the cookie's `Max-Age`, which only
   the browser enforces: the MAC binds no issue time, so the server accepts a
   presented cookie for as long as the grant itself is unexpired, unconsumed and
   unrevoked and its booking is inside the eligibility window, the same bound as
   the raw token.
4. `POST /api/portal/claims` accepts credentials in JSON and the server-issued
   exchange cookie. Its existing Serializable transaction rechecks expiry,
   `businessToday + 7 days`, booking ownership, one-time consumption, and
   sibling revocation before issuing guest auth cookies.
5. The exchange cookie is cleared after every claim response, including
   success, validation/credential failure, expiry, and replay. A failed exchange
   clears any previously presented exchange cookie.

Access reset. For a guest who lost the password of a claimed booking, the
administrator uses `POST /api/admin/bookings/{id}/access-reset`. In one
transaction it clears the account's password, revokes its sessions, refresh
families and refresh tokens, and issues a new REMOTE grant for the same booking.
The token travels exactly as in steps 1–5. Claiming it with the account's phone
sets the new password. A password-less account can set a password only through
a grant for a booking it already owns, so another booking's token cannot take it
over; a different phone is refused as already claimed.

No claim value is accepted from a query parameter, path segment, fragment,
redirect, or `Location` header. The guest client removes the two legacy query
names and any legacy claim fragment from the current history entry without
using their values. The guest page sends `Referrer-Policy: no-referrer`;
application diagnostics record only pathnames; Nginx access logs use `$uri`
rather than `$request_uri`. Security audit details never contain the token or
its exchange digest.

The exchange cookie is not a session and grants no access by itself. A digest
read from the database (a backup, a replica, a reporting role) is not enough to
build it, because its MAC is keyed with a pepper the database never holds; the
claims route compares the MAC in constant time and treats any other value,
including a bare digest, as absent. A `SECURITY_PEPPER` rotation therefore
invalidates every exchange cookie in flight (see [runtime credential
contract](runtime-credential-contract.md)). The cookie is bounded by the
underlying grant and the claim transaction remains the only domain mutation
path.

The `portal-claim` limiter of `POST /api/portal/claims` keys its identifier
bucket on the verified digest (five attempts per hour), next to the
client-address bucket, and not on the phone number. A caller without the
exchange cookie can therefore spend only its own address budget, never a
guest's claim budget. Sign-in keeps its per-phone bucket.
