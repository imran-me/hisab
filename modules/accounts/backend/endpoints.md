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

### The details (2026-09-27)

`branch`, `holder_name`, `bank_account_type` (`savings` · `current` ·
`salary` · `fdr` · `dps`), `routing_number`, `card_network` (`visa` ·
`mastercard` · `amex` · `unionpay` · `other`), `statement_day` (1–31),
`colour` (a token name: `marigold` `green` `violet` `blue` `rose` `teal`
`orange` `slate`), `notes`, and `statement_balance_minor` + `statement_on`.

- **`account_number`** is accepted on create and update, stored encrypted
  (the app key), and returned ONLY by `GET /api/accounts/{id}`. The list and
  the create/update responses never carry it; `number_tail` is derived from
  it on the server.
- A bank account whose `bank_account_type` is `fdr` or `dps` is stored as
  `type: savings`: it is held, not spendable.
- Fields a type has no use for are nulled, not refused (a branch on cash, a
  network on a wallet).
- **The statement is not a balance.** It is what a statement said on a date.
  The balance stays derived (`/api/ledger/balances`); the client shows the gap
  and can post an ordinary adjustment entry to close it.

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

## The month — `/api/finance/*`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/finance/{YYYY-MM}` | one month: totals, carry-over, rows, per-day, necessity mix, insights |
| `GET` | `/api/finance/archive` | every month on file, with a lifetime roll-up |
| `GET` | `/api/finance/months` | which months have anything in them |
| `GET`/`PATCH` | `/api/finance/settings` | opening balance, carry-forward, monthly budget, savings goal |
| `POST`/`DELETE` | `/api/finance/{YYYY-MM}/close` | file or reopen a month's review |

**One book at a time.** The three `GET`s take `?book=`, `personal` when absent —
the same default as `/api/ledger/summary`. A book that is neither `personal`
nor one the owner has an account in is a `422`, not a month of zeros.

**One currency per figure.** `?currency=` (default `BDT`) names the currency
every figure is in, and the response echoes it as `currency`. Each row is
converted before it is added (`Hisab\Fx\Services\Converter`): its own rate
snapshot when that is for exactly this pair, else the owner's rate for the
pair, else the seeded one — the latest dated on or before the row's day, else
the earliest after it — else the inverse pair. A currency with no rate is left
out and listed in `unconvertible`; it is never counted at a rate of 1.

The names: `net_minor` is income − spent − deposited (what moved in your hand,
the ledger's `spendable_minor`); `kept_minor` is income − spent (a deposit is
kept). For a month held in one currency the totals equal
`/api/ledger/summary`'s; that endpoint does not convert yet.

The settings and the month review belong to the personal book. Another book
opens at zero, has no budget, and reports `closed: null`.

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
