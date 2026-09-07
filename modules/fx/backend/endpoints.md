# FX · endpoints

Written before the controller, per `CONVENTIONS.md`. The mock in `api.js`
already returns these shapes, so pointing it at the API changes no consumer.

Currencies and the rates between them. **Every other module asks this one to
convert; none of them holds a rate.**

---

## Why this module exists before any other

`CONVENTIONS.md`: money is an integer in the currency's minor unit, and *the
number of decimal places comes from the currency row, never a constant*. It is
2 for USD, 3 for KWD and **0 for JPY**, so a hardcoded `/100` multiplies a
Kuwaiti figure by ten and divides a Japanese one by a hundred.

That makes `currencies.minor_unit` the single most load-bearing column in the
database. Nothing that stores an amount can be built correctly before it exists.

---

## `GET /api/fx/currencies`

Reference data. The same rows `registerCurrencies()` takes on the frontend.

```json
{ "data": [
  { "code": "BDT", "name": "Bangladeshi taka", "symbol": "৳",
    "minor_unit": 2, "group": "indian", "symbol_first": true }
] }
```

`code` is the primary key — ISO 4217, three characters. This is the one table in
the product **not** keyed by a ULID, and deliberately: the code is already a
stable, globally agreed public identifier, and a ULID beside it would create two
ways to name the same currency and a chance for them to disagree.

Currencies are **not owned**. They are facts about the world, identical for
everyone, and they are never created by the API — a currency that does not exist
is a migration, not a POST.

---

## `GET /api/fx/rates`

```json
{ "data": [
  { "base": "USD", "quote": "BDT", "rate": "122.5000000000",
    "as_of": "2026-09-01", "source": "manual" }
] }
```

`rate` is the number of **quote** units per one **base** unit — the direction
people quote it ("the dollar is at 122.50"). It is a **string**, not a JSON
number, for the same reason money is an integer: a rate is a decimal, and
IEEE-754 cannot hold 122.5 exactly any more than it can hold 0.1. The client
parses it.

### One row per pair, latest first

The table stores history — a rate has an `as_of` date because it was true on a
date. This endpoint returns only the **most recent row per pair**, because that
is what a conversion today needs. Older rows stay for the figures that
snapshotted them.

### `source`

`"seed"` or `"manual"`.

Seeded rates ship with the install so a fresh app can convert on day one. They
are **estimates**, and the UI already marks converted figures produced from them
as such. A `manual` rate is one the owner entered — the rate they actually got —
and it always wins over a seed for the same pair.

### Reciprocals are not stored

`USD/BDT` implies `BDT/USD`, and `api.js` derives it. Storing both would be two
rows to keep in step for one fact.

But a stored reverse is **never overwritten** by a derived one: a quoted reverse
rate is not the reciprocal of the forward rate — there is a spread — and
replacing a real quote with `1/x` loses that.

---

## `POST /api/fx/rates`

Record a rate by hand.

```json
{ "base": "USD", "quote": "BDT", "rate": "123.10", "as_of": "2026-09-07" }
```

**201** with the created row.

Rates are entered manually rather than pulled from a provider. That is a
decision, not a gap: an automatic feed is one more thing that can be down, one
more third party told which currencies a private ledger holds, and a source of
silent drift in historical figures. Someone converting a salary once a month is
better served by the rate they actually got.

### Validation

| | |
|---|---|
| `base`, `quote` | must exist in `currencies`, and must differ from each other |
| `rate` | numeric, **greater than zero**, at most 10 decimal places |
| `as_of` | a date, not in the future |

A rate of zero or less is not a rate; it would make every converted figure zero
or negative, and it is the kind of typo that is invisible in a total.

`as_of` in the future is rejected because a rate that "was true" on a date that
has not happened cannot have been.

### Writing the same pair and date twice

Updates that row rather than creating a second one. Two rates for one pair on
one day are not history, they are a correction — and keeping both leaves the
reader to guess which was meant.

---

## Ownership

`fx_rates.user_id` is **nullable**, and the null is meaningful:

- `null` — a seeded estimate, shipped with the install, shared by definition.
- set — the owner's own rate.

A read prefers the owner's row for a pair and falls back to the seed. This is
what lets a fresh install convert immediately while still letting a real rate
take over the moment one is entered, without a second table or a flag to keep in
step with the row it describes.

---

## Not built

Recorded so a gap does not look like an oversight later.

- **An automatic rate provider.** Deliberate; see above.
- **Historical lookup by date** (`?as_of=`). The table holds the history, but
  nothing reads it back yet — transactions snapshot their own rate at write
  time, which is what reports read.
- **Deleting a rate.** Correct it by writing the same pair and date again.
- **Currency creation over the API.** A new currency is a migration.
- **Triangulation.** `BDT/EUR` is not derived via USD when neither direction is
  stored; the pair is simply reported as unconvertible, which is honest, rather
  than inventing a figure from two spreads.
