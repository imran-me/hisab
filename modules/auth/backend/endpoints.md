# Auth · endpoints

Written before the controller, per `CONVENTIONS.md`.

Hisab has **one owner**. That is not a simplification to be undone later — it is
in `docs/STATUS.md` under "deliberately not planned", and every other module
depends on it by resolving every query through `$user`.

Phase 1 needed no authentication at all, because the ledger lived in the
browser: a stranger who found the URL got their own empty storage, not your
money. **Phase 2 removes that property.** The moment a ledger is on a server,
the URL alone must not be enough to read it. This module is what replaces the
protection that moving the data to a server takes away.

---

## Why session cookies, and not a token

The frontend is static HTML on the same origin as the API. Both options work;
they fail differently.

A bearer token has to be stored somewhere the page's JavaScript can read, which
in a browser means `localStorage`. **The vault's encrypted blob is already in
`localStorage`**, and its whole threat model (`modules/vault/SECURITY.md`)
assumes an attacker who gets script execution has already won that round. There
is no reason to hand the same attacker the session as well.

So: a `HttpOnly`, `Secure`, `SameSite=Lax` session cookie, which script cannot
read at all, plus a CSRF token for the writes. Same-origin means this needs no
Sanctum, no CORS and no token refresh — Laravel's own session middleware,
applied to the API routes.

`SameSite=Lax` rather than `Strict`: the app is opened from a phone home-screen
icon, and `Strict` withholds the cookie on that first top-level navigation, so
the app opens logged out every time and the fix looks like "it forgot me again".

---

## CSRF

Because authentication is a cookie, a write has to prove it came from this app
rather than from a page the owner happened to have open elsewhere.

`GET /api/auth/session` always sets an `XSRF-TOKEN` cookie. Every unsafe request
(`POST`, `PATCH`, `DELETE`) must echo it back in the `X-XSRF-TOKEN` header.
`http.js` does this for every module, so no module deals with it.

A missing or stale token is **419**, not 401 — they mean different things and
the client recovers differently. 401 means sign in; 419 means re-read the token
and retry once, which is what happens after a session expires while a page sits
open.

---

## `GET /api/auth/session`

Who is signed in. **Always 200**, never 401 — this is the endpoint the app calls
on boot to decide which screen to show, and a 401 here would be indistinguishable
from a real authorisation failure elsewhere.

```json
{ "data": { "authenticated": true,
            "user": { "id": "01JBXQ8M4T2R5V7YWZ3F6K9NAC",
                      "name": "Md Imran Hossain",
                      "email": "rabitgulf@gmail.com" } } }
```

Signed out:

```json
{ "data": { "authenticated": false, "user": null } }
```

Nothing about whether an owner exists at all is disclosed either way.

---

## `POST /api/auth/login`

```json
{ "email": "…", "password": "…", "remember": true }
```

**200** on success, returning the same body as `GET /api/auth/session`. The
session id is regenerated on success — without that, a session id captured
before login stays valid after it, which is session fixation.

**422** on failure, in Laravel's validation shape so the form can mark the field:

```json
{ "message": "Those details do not match.",
  "errors": { "email": ["Those details do not match."] } }
```

### The failure is deliberately uninformative

One message for every failure: no such account, wrong password, archived owner.
`CONVENTIONS.md` requires it, and it is not only about the words — **when the
email matches no account, a hash comparison still runs against a dummy hash**,
so the response *time* does not answer the question the message refused to.

### Rate limiting

**5 attempts per minute**, keyed on the email *and* the client IP together, and
**20 per hour** on the IP alone.

Keying on IP alone lets an attacker with a botnet spread attempts across
addresses; keying on email alone lets anyone lock the owner out of their own
account by guessing at it. Both keys, both limits.

Over the limit is **429** with `Retry-After`. The app default is far higher and
is deliberately not used here.

---

## `POST /api/auth/logout`

**204.** Invalidates the session server-side and rotates the CSRF token — a
logout that only drops the cookie leaves a session that still works if the
cookie is replayed.

Always succeeds, even when not signed in. A logout endpoint that errors is a
logout endpoint that leaves people signed in.

**The vault is locked separately and by the browser**, not by this. The vault
key never reaches the server, so the server cannot lock it — `list-page.js`
clears it from memory. Signing out does not decrypt or destroy anything.

---

## How the owner is created

There is **no registration endpoint**, and there will not be one. An open
registration route on a single-owner app is a way in, not a feature.

The owner is created from the command line, where the password is typed rather
than committed:

```sh
php artisan hisab:owner
```

It prompts, hides the input, and refuses to create a second owner. Run again
with an existing owner, it offers to reset that owner's password instead.

---

## Not built

Recorded so a gap does not look like an oversight later.

- **Password reset by email.** There is no mail configuration in this project
  and one owner with shell access does not need a reset flow — `hisab:owner`
  is the reset flow. `password_reset_tokens` exists because Laravel's own
  migration creates it; nothing uses it.
- **Two-factor.** Worth having, not written. When it is, `CONVENTIONS.md`
  requires it to be rate-limited like the login.
- **Multiple users, roles, sharing.** Deliberately not planned.
- **Remembering the device beyond the session lifetime.** `remember` uses
  Laravel's own remember-me cookie; there is no device list and no way to
  revoke one device without changing the password.
