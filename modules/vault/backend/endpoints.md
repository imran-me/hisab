# Vault · endpoints

Read `../SECURITY.md` first. This file describes the wire format; that one
describes why it is shaped this way.

---

## The shape the server sees

```json
{
  "id": "01JBXQ8M4T2R5V7YWZ3F6K9NAC",
  "blob": { "v": 1, "iv": "9k2…", "ct": "Uy8f…" },
  "updated_at": "2026-09-05T14:02:11Z",
  "created_at": "2026-09-01T08:30:00Z"
}
```

**That is the entire row.** No title, no kind, no tags, no length hint beyond
the ciphertext's own size. The server cannot tell a credit card from a note.

### What is deliberately NOT a column

Every one of these was considered and rejected:

| Field | Why not |
|---|---|
| `title` | The whole point. A list of titles is most of the value of a vault to an attacker — knowing you have an account somewhere is often enough. |
| `kind` | Reveals that a row is a card rather than a note. |
| `tags` | Same, with more resolution. |
| `search_index` | A blind index over a keyed HMAC would allow server-side lookup, and leaks equality between entries. Not built; see SECURITY.md §2. |

`updated_at` is unavoidable — the server has to know what to sync — and it does
leak activity timing. Noted in SECURITY.md §8 rather than pretended away.

---

## The header

One row per user, holding everything needed to *attempt* a decryption and
nothing that helps one succeed.

```json
{
  "v": 1,
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 720000 },
  "salt": "aGVsbG8…",
  "wrap": { "iv": "…", "key": "…" },
  "verifier": { "v": 1, "iv": "…", "ct": "…" },
  "created_at": "2026-09-01T08:00:00Z"
}
```

None of it is secret. The salt is public by design, the wrapped DEK is useless
without the KEK, and the verifier is a known plaintext sealed under the DEK —
its only job is to let an unlock attempt fail cleanly instead of producing
garbage.

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/vault/header` | the header, or 404 if no vault has been set up |
| `POST` | `/api/vault/header` | first-time setup — refuses if one already exists |
| `PUT` | `/api/vault/header` | replace after a master-password change |
| `GET` | `/api/vault` | every blob for this user |
| `POST` | `/api/vault` | create |
| `PUT` | `/api/vault/{id}` | replace a blob wholesale |
| `DELETE` | `/api/vault/{id}` | delete |

### On the server side

- The `blob` column is encrypted **again** at rest with Laravel's `Crypt`, using
  the app key. This is the outer of the two layers. See SECURITY.md §2.
- **No validation of blob contents**, because there is nothing to validate — it
  is opaque. Only its size is checked, against a cap, so one entry cannot fill
  the database.
- **No logging of request bodies on these routes.** A framework that logs
  payloads on error would write ciphertext to a log file that is not encrypted
  at rest, which quietly removes the outer layer.
- `PUT` replaces the whole blob. There is no partial update, because the server
  cannot merge fields it cannot read.

### Rate limiting

`POST /api/vault/header` and any endpoint reachable during unlock are limited
far below the app default. This is a weak defence and is documented as such —
an attacker with the database skips the API entirely. It exists for the case of
someone picking up an unlocked phone.

---

## Not built

- **Sharing.** One owner, no sharing, no emergency access. Every one of those
  needs a second key hierarchy.
- **Attachments.** No files in the vault. A file store means a size budget and a
  streaming decrypt, and neither has been designed.
- **Password history.** A changed password is gone. Keeping the old one means
  storing more secrets, for a feature nobody asked for.
- **Breach checking.** Would mean sending a hash prefix to a third party. For
  this app's threat model, that is the wrong trade.
- **TOTP generation.** Planned, not built. It needs a base32 secret field and a
  30-second timer, and it is a natural fit — but it is not there today.
- **Server-side search.** See SECURITY.md §2.
