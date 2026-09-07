# Categories · endpoints

Written before the controller, per `CONVENTIONS.md`. The mock in `api.js`
already returns these shapes.

A category is what a transaction is *for*. Categories live in the database with
a seeder rather than in a constant — `CONVENTIONS.md`, "rules live in data": a
category list hardcoded in PHP means a deployment every time spending habits
change.

---

## Three types, and the one that is missing

`income`, `expense`, `deposit`.

**`transfer` is deliberately absent.** Moving money between two of your own
accounts is not a category of spending. Offering a category for it produces a
ledger where half the transfers are filed under "Other" and the totals no longer
balance — and the transfer already carries its own meaning in the pair of legs
it writes.

`deposit` is a first-class type for the reason in `CONVENTIONS.md`: money moved
into savings leaves what you can spend without being spending. Folding it into
`expense` makes saving look like spending and suppresses every savings figure.

---

## The shape

```json
{
  "id": "01JBXQ8M4T2R5V7YWZ3F6K9NAC",
  "key": "groceries",
  "label": "Food & groceries",
  "type": "expense",
  "book": "personal",
  "necessity": 1,
  "archived_at": null,
  "created_at": "2026-01-01T09:12:44Z"
}
```

### `key`

A slug, for stable references and export filenames. Generated from the label,
**falling back to the id** when the label produces nothing — `slugify()` drops
Bengali and Arabic letters rather than transliterating them, so a category named
entirely in Bangla slugs to an empty string. That is why the fallback exists and
is not defensive padding.

`key` is not unique across the product and is not a lookup key. The id is.

### `necessity`

`1`–`4`, and **only on `expense`**. Income and deposits carry `null`: there is
no sense in which a salary is "discretionary", and a band there would be a field
people feel obliged to fill in with something meaningless.

Bands are reference data, `GET /api/categories/necessity`.

### `book`

`personal` or `business`. A category belongs to one book and does not move
between them — the two books are answering different questions, and a shared
category would put a household grocery bill in a profit figure.

---

## `GET /api/categories`

| Query | |
|---|---|
| `book` | `personal` (default) or `business` |
| `type` | `income`, `expense` (default) or `deposit` |
| `include_archived` | `true` to include archived rows |

Archived categories are excluded by default because they exist for history, not
for picking.

## `GET /api/categories/necessity`

The four bands, as reference data.

## `GET /api/categories/methods`

Payment methods — cash, bKash, card and so on. Reference data, not owned.

---

## `POST /api/categories`

```json
{ "label": "Vet bills", "type": "expense", "book": "personal", "necessity": 2 }
```

**201** with the created row.

### Duplicate names are rejected, case-insensitively

Two categories differing only in case split a year of spending across two rows
in every report, and the person who made them cannot tell them apart in the
picker. The check is scoped to the same `book` and `type`, and ignores archived
rows — a name freed by archiving can be used again.

### `necessity` is forced to match the type

Sent on an `income` or `deposit`, it is **ignored rather than rejected**. This
is the one place the API is lenient, because the client sends a whole form and
rejecting the request over a field that has no meaning for the chosen type
would be a validation error the person cannot see the cause of. On an `expense`
it defaults to `3` (discretionary) when absent.

---

## `PATCH /api/categories/{id}`

Renames. `label` only.

**The type and the book cannot be changed.** Both would rewrite history: a
category that moves from `expense` to `income` flips the sign of every
transaction already filed under it, and one that moves between books moves that
spending into or out of a profit figure. The correct action is to archive it and
create the right one.

---

## `DELETE /api/categories/{id}`

**Archival, not deletion** — `CONVENTIONS.md` §5. Sets `archived_at`; the row
disappears from pickers while every historical transaction pointing at it keeps
resolving.

Hard delete happens in exactly one case: a category **no transaction has ever
referenced**. That is the "created it by mistake a minute ago" case, and keeping
a tombstone for it is clutter with no history to protect.

The response says which happened:

```json
{ "data": { "id": "01J…", "deleted": false, "archived_at": "2026-09-08T11:02:00Z" } }
```

## `POST /api/categories/{id}/restore`

Clears `archived_at`. Refuses with **422** when an active category in the same
book and type now holds that name, rather than silently creating the duplicate
the create endpoint would have rejected.

---

## Ownership

Categories are **owned**. Every query resolves through `$user`, and someone
else's id returns **404, not 403** — confirming an id exists is itself
information.

The defaults are seeded **per owner**, not shared, so that renaming or archiving
one is an ordinary row update rather than a per-user override of a shared row.
Seeding happens when the owner is created, and the seeder also fills in any
owner who predates the module.

---

## Not built

- **Reordering.** `sort_order` exists on the row; nothing sets it yet.
- **Merging two categories**, moving every transaction from one to the other.
  Wanted, not written — it is the honest answer to a duplicate, which is why
  duplicates are refused at creation rather than cleaned up later.
- **Sub-categories.** One level. A tree makes every report a choice about which
  level to total at, and the answer is never the same twice.
- **Per-category budgets.** That is the budgets module.
- **Icons and colours per category.** The picker uses the type's icon.
