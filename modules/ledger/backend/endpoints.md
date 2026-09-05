# Ledger · endpoints

The transaction record. Everything else in Hisab is a view over this table.

---

## The shape

A transaction row is **one leg**: one effect on one account.

```json
{
  "id": "01JBXQ8M4T2R5V7YWZ3F6K9NAC",
  "group_id": null,
  "type": "expense",
  "direction": "out",
  "account_id": "01JBX…",
  "amount_minor": 45000,
  "currency": "BDT",
  "category_id": "01JBX…",
  "category_label": "Food & groceries",
  "necessity": 1,
  "method": "bkash",
  "payee": "Shwapno",
  "note": "Weekly shop",
  "occurred_on": "2026-09-05",
  "book": "personal",
  "fx_rate": null,
  "fx_as_of": null,
  "created_at": "2026-09-05T14:02:11Z",
  "updated_at": "2026-09-05T14:02:11Z"
}
```

### `type` — four values, and the reason there are four

| Type | Meaning | Counts as |
|---|---|---|
| `income` | money came in | inflow |
| `expense` | money is gone | outflow |
| `deposit` | moved into savings, DPS, FDR, shares | **held** — out of spendable, still yours |
| `transfer` | moved between two of your own accounts | neither; net zero |

`deposit` is not a kind of expense. Folding it in makes saving money look like
spending it and suppresses every savings figure on the dashboard. This
distinction is load-bearing; see `CONVENTIONS.md`.

### `direction` — the effect on **this row's** account

`in` adds to the account balance, `out` subtracts. It is stored rather than
derived from `type`, because a `deposit` and a `transfer` each produce one row
of each direction.

### `group_id` — the two-leg pair

A `transfer` **always** writes two rows sharing one `group_id`: an `out` leg on
the source account and an `in` leg on the destination.

A `deposit` writes two legs when the destination is a tracked account (moving
cash into a DPS you have set up as an account), and **one** leg when it is not
(money leaving for a DPS held elsewhere).

Both legs are written inside one database transaction. A half-applied transfer
is money that has left one account and arrived nowhere, and the balances never
recover from it without manual repair.

### Counting rules — the part that is easy to get wrong

- `income` total — sum of `type = income`
- `expense` total — sum of `type = expense`
- `deposit` total — sum of `type = deposit AND direction = out`, **once**.
  Summing both legs of a two-leg deposit doubles it.
- `transfer` — excluded from every total. It is not income and not spending;
  including it inflates both sides by the same amount and makes the savings
  rate meaningless.
- account balance — `opening_balance + Σ(in) − Σ(out)` over that account's rows,
  regardless of type.

### `fx_rate` / `fx_as_of`

Set only when the transaction's currency differs from its account's. Both are
**snapshotted at save time** and reports read the snapshot — converting last
year's total at today's rate silently rewrites history.

### `necessity`

`1..4`, best to worst, on `expense` rows only. Null everywhere else: there is no
meaningful sense in which receiving a salary was avoidable.

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/ledger` | list, filtered and cursor-paginated |
| `POST` | `/api/ledger` | create (writes both legs when paired) |
| `PATCH` | `/api/ledger/{id}` | edit (rewrites both legs when paired) |
| `DELETE` | `/api/ledger/{id}` | delete (removes both legs when paired) |
| `GET` | `/api/ledger/balances` | derived balance per account |
| `GET` | `/api/ledger/summary` | one period's totals, by category and method |

### `GET /api/ledger`

Query: `book`, `period` (`YYYY-MM`), `from`, `to`, `type`, `account_id`,
`category_id`, `q`, `after`, `limit`.

Cursor pagination on `id`, not offset — see `api-contract.md` §8.

### `GET /api/ledger/balances`

```json
{ "data": { "01JBX…": 1250000, "01JBY…": -34000 }, "meta": { "as_of": "2026-09-05" } }
```

The **only** place a balance is computed. Accounts deliberately does not do it.

### `POST /api/ledger`

Does **not** accept: `direction`, `group_id`, `balance`, or any running total —
all derived server-side from `type` and the accounts named.

Accepts `to_account_id` for `transfer` and `deposit`; the server writes the
second leg itself.

---

## Not built

- **Recurring transactions.** No schedule, no auto-posting. A monthly rent entry
  is typed each month, or duplicated from last month's row.
- **Attachments.** No receipt images. Storing them means a file store, a size
  budget and a privacy question that has not been answered yet.
- **Splits across categories.** One transaction, one category. A shopping trip
  that is half groceries and half a gadget is two entries.
- **Multi-currency within one transaction.** The amount is in one currency; the
  conversion to the account's currency is a snapshot, not a second amount.
- **Undo beyond the toast.** Deleting is soft for six seconds and then final.
