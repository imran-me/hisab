# Vault · security model

What this protects, what it does not, and why each choice was made. Read this
before changing anything in `backend/crypto.js`.

---

## 1. What is stored

Cards, bank account numbers, site logins, API keys, secure notes, documents.
The things that, taken together, are worse to lose than the ledger they sit
beside.

## 2. Two layers, and why one is not enough

```
plaintext
   │  AES-256-GCM,  key derived from the master password
   ▼      (in the browser — the server never sees this happen)
client ciphertext
   │  Laravel Crypt, app key
   ▼      (on the server — the browser never sees this happen)
what the database row holds
```

Neither layer alone is sufficient for this content:

| | Attacker has | Result |
|---|---|---|
| Client-side only | the database | ciphertext, but they can grind the master password offline forever with no second factor |
| Server-side only | the server, or a log line | **everything, in plaintext** |
| Both | the database | useless without the app key |
| Both | the app key | useless without the master password, which the server has never received |

The cost is real and accepted:

- **No server-side search or sort on a secret field.** The server cannot read
  them. Search runs in the browser over the decrypted set. A blind index over a
  keyed HMAC of the title is the escape hatch if that ever gets slow, and it is
  deliberately **not built** — it leaks equality between entries, and that is a
  trade worth making consciously rather than by default.
- **A forgotten master password is unrecoverable.** By design. There is no
  reset, no recovery email, no support override. The export file (§7) is the
  only backup and it is protected by the same password.

## 3. Key hierarchy

```
master password
   │  PBKDF2-HMAC-SHA-256, 600,000 iterations, 16-byte random salt
   ▼
KEK  (key-encrypting key, 256-bit, never stored anywhere)
   │  AES-KW-equivalent: AES-GCM wrap
   ▼
DEK  (data-encrypting key, 256-bit, random, stored only in wrapped form)
   │  AES-256-GCM, a fresh 12-byte IV per entry, per save
   ▼
each entry's ciphertext
```

**Why a wrapped DEK rather than encrypting entries with the KEK directly:**
changing the master password re-wraps one 32-byte key. Without the indirection
it would mean decrypting and re-encrypting every entry in the vault — a
long operation that, if interrupted halfway, leaves a vault where some entries
open with the old password and some with the new. There is no good recovery
from that state.

**Why PBKDF2 and not Argon2id.** Argon2id is the better function and it is not
available in the Web Crypto API. Using it would mean shipping a WASM build,
which the locked rules exclude and which is a large dependency to trust with
exactly this. PBKDF2-SHA-256 at 600,000 iterations is the OWASP figure for this
choice, it is native, constant-maintenance, and it is measured on the target
device at setup — see `calibrate()` — so the number goes up on a fast phone
rather than being frozen at whatever was current when this was written.

## 4. What the plaintext is never allowed to do

- **Never leave the tab.** No plaintext in a request body, a URL, a query
  string, a `console.log`, an error message, or an analytics event.
- **Never be written to storage.** Not `localStorage`, not `sessionStorage`, not
  IndexedDB, not a cookie. `KEYS` in `shared/js/core/storage.js` has no entry
  for a decrypted value and must not grow one.
- **Never travel on the event bus.** A bus is a broadcast; every subscriber
  would receive it. `vault:changed` carries an id, never a value.
- **Never be interpolated into markup un-escaped.** A password can contain any
  character, including `<`.

## 5. Locking

- Locks on an idle timer (default 5 minutes, configurable down to 1).
- Locks on tab hide (`visibilitychange`), because the phone's app switcher
  renders a live thumbnail of the page.
- Locks on page unload, and the keys live in a module-scoped variable that dies
  with the tab regardless.
- Locking **zeroes the key material** and drops every decrypted value. It does
  not merely hide the screen.
- The lock screen **replaces** the content rather than blurring it. A blurred
  screenshot of a secret is still a screenshot of a secret.

## 6. Rate limiting

Unlock attempts are throttled client-side with an increasing delay, and the
count survives a reload. This is not a real defence — an attacker with the
ciphertext skips the UI entirely — and it is not pretending to be. It exists
for the realistic case: someone else picking up an unlocked phone.

The real defence against offline grinding is the 600,000-iteration KDF, which
makes each guess cost roughly a third of a second of dedicated hardware.

## 7. Export

`Settings → Export vault` writes a `.hisab-vault` file containing the same
ciphertext, the KDF parameters and the wrapped DEK. It opens with the same
master password on any device.

It is in `.gitignore`. It is a real secret in a file.

## 8. What this does NOT protect against

Stated plainly, because a security document that only lists strengths is
marketing:

- **A compromised browser or device.** A keylogger, a malicious extension with
  page access, or malware on the phone reads the plaintext as the person does.
  Nothing in a web page can prevent this.
- **A malicious or compromised server serving modified JavaScript.** The server
  cannot read the vault, but it delivers the code that can. Subresource
  Integrity and a strict CSP raise the bar; they do not remove it. This is the
  fundamental limitation of browser-delivered cryptography and it is the reason
  the app is self-hosted with no third-party scripts and no CDN.
- **Someone who knows the master password.**
- **Traffic analysis.** The server learns how many entries exist, roughly how
  large each is, and when each was last changed.
- **Shoulder surfing.** Reveal is per-field and per-tap, and it re-hides on a
  timer, but a screen is a screen.

## 9. Rules for anyone changing this code

1. No plaintext crosses the module boundary. `api.js` returns ciphertext to
   nobody and plaintext only to the page that asked, in memory.
2. Never `catch` a decryption failure and continue with a default. A GCM
   authentication failure means the data was tampered with or the key is wrong;
   both stop the operation.
3. Never compare secrets with `===` where timing matters. The verifier check
   uses GCM authentication, which is constant-time by construction.
4. Never reuse an IV. Every save generates a fresh 12-byte random IV. Reusing
   one with the same key in GCM is a catastrophic break, not a weakness.
5. Run `node tools/test-crypto.mjs` after any change. It asserts round trips,
   tamper detection, wrong-password rejection, and IV uniqueness.
