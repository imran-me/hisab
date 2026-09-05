# The API contract

Rules every module's `backend/endpoints.md` and `backend/api.js` follow. Written
once here so that twelve modules do not each invent their own answer.

---

## 1. The seam

```
page script  →  modules/<feature>/backend/api.js  →  shared/js/core/http.js  →  Laravel
                                                  ↘  local store (no backend yet)
```

`api.js` is the **only door** into a module's data. A page script never calls
`http.js`, never touches `localStorage`, and never imports another module's
`api.js`.

Every `api.js` function returns the **same shape** whether it was answered by
Laravel or by the local store, so replacing one with the other changes nothing
in any consumer:

```js
{ ok: true,  data }
{ ok: false, reason: 'auth' | 'missing' | 'invalid' | 'offline' | 'server' | …, errors? }
```

### When the local store is used, and when it is not

```js
const online = await hasBackend();
if (!online) return local.list();      // no server at all — a static deployment
const res = await get('/accounts');
if (res.ok) return res;
if (res.reason === 'offline') return local.list();   // server exists, unreachable
return res;                                          // 401/403/404/422 — pass it through
```

**A 401 must never fall through to local data.** That is a real server saying
"not signed in", and answering it from this device's store would show one person
another person's ledger. This is the single most important rule in the file.

---

## 2. Envelope

Every successful response is an object, never a bare array:

```json
{ "data": [ … ], "meta": { "total": 128, "page": 1, "per_page": 50 } }
```

A bare array cannot grow a `meta` without breaking every consumer, and it will
need one the first time a list is paginated.

---

## 3. Field conventions

| Field | Type | Notes |
|---|---|---|
| `id` | string (ULID, 26 chars) | never an integer, never sequential |
| `amount_minor` | integer | the currency's minor unit — see `CONVENTIONS.md` |
| `currency` | string (ISO 4217) | always beside an amount, never implied |
| `occurred_on` | `YYYY-MM-DD` | a local date, **not** a timestamp |
| `created_at` / `updated_at` | ISO 8601 UTC | machine timestamps; these *are* instants |
| `archived_at` | ISO 8601 UTC or null | nothing is hard-deleted (§5) |

`snake_case` in JSON, matching Laravel. The frontend does not rename to
camelCase on the way in — a field that is `amount_minor` in the database, in the
API and in the JS is one name to grep for.

---

## 4. Errors

A `422` body is Laravel's shape, unmodified:

```json
{ "message": "The given data was invalid.", "errors": { "amount_minor": ["…"] } }
```

`api.js` passes `errors` straight through so a form can mark the exact field.

---

## 5. Deletion is archival

Nothing that has ever been referenced by a transaction is hard-deleted. An
account, a category or a business is **archived** — `archived_at` set — and
disappears from pickers while every historical row that points at it keeps
resolving.

Hard delete exists for exactly one case: a record created and removed without
ever being referenced, within the same session.

---

## 6. Ownership

Every query resolves **through the owner**:

```php
$user->transactions()->where('id', $id)->firstOrFail();   // yes
Transaction::findOrFail($id);                             // never
```

and returns **404, not 403**, for someone else's record. Confirming that an id
exists is itself information.

---

## 7. What the client may not send

Request classes have **no field** for a derived figure — balance, running total,
profit, savings rate, converted amount, share value. Not validated-and-ignored:
absent, so one cannot be smuggled in by accident.

The one apparent exception is the FX rate snapshotted onto a transaction, and it
is not an exception: the client sends the *rate id*, and the server reads the
rate from it.

---

## 8. Pagination

Cursor-based on `id`, not offset:

```
GET /transactions?after=01JBX…&limit=50
```

A ledger is written to while it is being read. Offset pagination shows a row
twice, or skips one, every time a record is inserted above the current page —
which for a transaction list is most of the time.
