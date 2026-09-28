# Dues (baki) · endpoints

Money lent to people and borrowed from them, per person, with a running
balance, settling, and a reminder date.

## The counting rule (decided here, as DIRECTION.md §6 q6 asked)

**Lending is not spending, and borrowing is not income.** Money you lent is
still yours; money you borrowed is not. So a due never touches income,
spent or saved. Instead each book has one account of type `dues` ("Dues"),
held rather than spendable, and every due that moves money is a ledger
**transfer** between a real account and it, written by `LedgerWriter` in the
same database transaction as the due entry:

| Kind | Meaning | Ledger | Person's balance |
|---|---|---|---|
| `lent` | you gave them money | transfer your account → Dues | + (they owe you) |
| `got_back` | they paid you back | transfer Dues → your account | − |
| `borrowed` | they gave you money | transfer Dues → your account | − (you owe them) |
| `paid_back` | you paid them back | transfer your account → Dues | + |

Consequences, each intended:

- Your cash / bKash balance moves the day the money does.
- Net worth is unchanged by lending or borrowing, as it should be: the Dues
  account holds what is owed to you net of what you owe (a receivable, or a
  payable when it is below zero).
- The month's income, spending and savings rate never include a loan.
- **A person's balance is derived from the ledger**, never stored: the sum of
  the Dues-account legs of their entries, plus any reversal mirrors of those
  legs. Reverse a due's transfer in the Ledger and the person's balance drops
  back by itself.

Dues are kept in the Dues account's currency (the home currency, BDT). A
due from an account in another currency is refused with a 422.

## GET /api/dues?book=personal

```json
{ "data": {
  "book": "personal", "currency": "BDT",
  "account_id": "01J…",
  "owed_to_you_minor": 1250000, "you_owe_minor": 800000, "net_minor": 450000,
  "people": [ {
    "id": "01J…", "name": "Rahim", "phone": "01711…", "note": null,
    "balance_minor": 500000, "state": "owes_you",
    "last_on": "2026-09-12", "remind_on": "2026-10-01", "remind_due": false,
    "entries": 3
  } ]
} }
```

`state` is `owes_you` (balance > 0), `you_owe` (< 0) or `settled` (0).
People are ordered: a reminder that is due first, then by the size of the
balance, settled people last.

## GET /api/dues/people/{id}

One person with every entry, newest first, each with the balance after it:

```json
{ "data": { "person": { … as above … }, "entries": [ {
  "id": "01J…", "kind": "lent", "amount_minor": 500000, "signed_minor": 500000,
  "occurred_on": "2026-09-12", "note": "for the shop rent",
  "account_id": "01J…", "transaction_id": "01J…", "reversed": false,
  "balance_after_minor": 500000
} ] } }
```

## POST /api/dues/people

`{ "name": "Rahim", "phone": "01711…", "note": "…" }` → 201 with the person.

## PATCH /api/dues/people/{id}

`name`, `phone`, `note`, `remind_on` (a date, or null to clear).

## POST /api/dues/people/{id}/entries

`{ "kind": "lent|got_back|borrowed|paid_back", "amount_minor": 500000,
"account_id": "01J…", "occurred_on": "2026-09-12", "note": "…" }`

Writes the ledger transfer and the entry together, or neither. There is no
balance field: the balance is derived.

## POST /api/dues/people/{id}/settle

`{ "account_id": "01J…", "occurred_on": "…" }` — records `got_back` or
`paid_back` for the WHOLE outstanding balance as one real ledger entry. 422
when the balance is already zero. Also clears the reminder.

## Errors

404 for a person or an account that is not the owner's (never 403). 422 for
an account in another book or currency, a zero amount, or an unknown kind.

## Demo data

`hisab:demo` adds three people with lends, a borrow and a partial
repayment; `--clear` / `--fresh` remove exactly them and their ledger legs.

## Not built

- Dues in a currency other than the Dues account's.
- A due with no money moving (a sale on credit): today every due is a
  transfer.
- Sending the reminder: the screen hands a prepared message to the phone's
  share sheet; nothing is sent from the server.
