# Accounts · endpoints

Written before the controller, per `CONVENTIONS.md`. The mock in `api.js`
returns these shapes exactly, so swapping the mock for the real endpoints
changes nothing in any consumer.

An **account** is a place money sits: cash in a drawer, a bank account, a bKash
wallet, a credit card, a DPS, a brokerage holding. It is not a category and not
a business — a business has its own book and may hold several accounts.

---

## The shape

```json
{
  "id": "01JBXQ8M4T2R5V7YWZ3F6K9NAC",
  "name": "bKash personal",
  "type": "mfs",
  "currency": "BDT",
  "book": "personal",
  "opening_balance_minor": 250000,
  "opening_on": "2026-01-01",
  "institution": "bKash",
  "number_tail": "4417",
  "credit_limit_minor": null,
  "is_default": true,
  "sort_order": 2,
  "archived_at": null,
  "created_at": "2026-01-01T09:12:44Z"
}
```

### `type`

One of `cash`, `bank`, `mfs`, `card`, `wallet`, `savings`, `investment`.

The type is not decoration. It decides three behaviours:

- **`card`** carries a `credit_limit_minor` and its balance is normally
  negative. Its "available" figure is `limit − |balance|`, not the balance.
- **`savings` and `investment`** are excluded from the "spendable" total on the
  dashboard. Money in a DPS is yours, but it is not money you can spend today,
  and rolling it into one figure is how a savings balance gets accidentally
  budgeted.
- **`cash`** cannot be the destination of a transfer from itself; nothing else
  is restricted.

### `book`

`"personal"`, or the id of a business. Accounts never move between books:
a business account that becomes personal is a real financial event
(a drawing), and re-labelling it would rewrite the history of both books.

### `opening_balance_minor`

What was in the account before the first recorded transaction. Without it, every
balance is wrong by a constant and the error is invisible.

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/accounts` | list, `?book=`, `?include_archived=` |
| `POST` | `/api/accounts` | create |
| `PATCH` | `/api/accounts/{id}` | rename, re-type, re-order, archive, restore |
| `DELETE` | `/api/accounts/{id}` | hard delete — only when never referenced |
| `GET` | `/api/accounts/{id}` | one account with its derived balance |

### `GET /api/accounts`

```json
{
  "data": [ { …account… } ],
  "meta": { "total": 7 }
}
```

**No balance is returned by this endpoint.** Balances are derived from the
ledger and are served by `GET /api/ledger/balances`, so there is exactly one
place that computes them. Returning a balance here as well would mean two
implementations of the same sum, and one of them would be wrong first.

### `POST /api/accounts`

Accepts: `name`, `type`, `currency`, `book`, `opening_balance_minor`,
`opening_on`, `institution`, `number_tail`, `credit_limit_minor`.

Does **not** accept: `balance`, `available`, any derived figure, or `id` —
the id is minted by the client as a ULID and sent, but the server re-validates
that it is a well-formed ULID and unused. A client-chosen id is safe here
precisely because it is not a capability: knowing an id grants nothing, since
every read resolves through the owner.

### `DELETE /api/accounts/{id}`

Refuses with `409` when any transaction references the account, and says how
many. Archiving is the answer in that case, and the client offers it.

---

## Not built

Stated here rather than left to look like an oversight:

- **Bank feed import.** No OFX/CSV ingestion. Every transaction is entered by
  hand or imported from a backup file.
- **Reconciliation against a statement.** There is no "cleared" flag and no
  statement-balance comparison. The ledger is trusted as written.
- **Shared accounts.** One owner per account. Splitting a household budget
  between two logins is not modelled.
- **Interest accrual.** A savings account does not grow on its own; interest is
  entered as an income transaction when it lands.
