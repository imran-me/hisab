# Budgets · endpoints

A monthly limit per expense category, and how far into it this month is.

Written before the controller, per CONVENTIONS.md. `api.js` in this folder is
the only door the UI uses, and it returns these shapes unchanged.

## The rule

- A budget is **one amount per expense category**, repeating every month
  until it is changed or removed. There is no per-month override yet.
- **Spent is never stored.** It is the category's expense rows for the month,
  each converted into the budget's currency before it is added (the fx
  module's `Converter`, the same rate rule as `BalanceSheet::summary()`), with
  a reversal's mirror subtracting. A test pins the sum of every category's
  spent to the ledger summary's `expense_minor` for the same month.
- A **deposit is not spending**, so a DPS instalment never uses a budget, and
  a transfer has no category at all.
- **State** is how much is used: `ok` under 75%, `warn` from 75%, `over` at
  100% or more. The screen colours ok green, warn amber and over red.
- **Per day** is what is left, floored to a whole unit, over the days left in
  the month including today. A past month has no pace (`null`); a future
  month spreads the whole budget over all of its days.

## GET /api/budgets

Query: `month=YYYY-MM` (default this month), `book=personal|business`
(default personal), `currency=BDT` (the currency of the totals and of rows
without a budget; default BDT).

```json
{ "data": {
  "month": "2026-09", "book": "personal", "currency": "BDT",
  "days_in_month": 30, "days_left": 3, "is_current": true,
  "totals": { "budgeted_minor": 4500000, "spent_minor": 3120000,
              "left_minor": 1380000, "per_day_minor": 460000,
              "ratio": 0.693, "state": "ok", "count": 5, "over": 1 },
  "rows": [ {
    "category_id": "01J…", "key": "groceries", "label": "Groceries",
    "budget": { "id": "01J…", "amount_minor": 1200000, "currency": "BDT" },
    "currency": "BDT",
    "spent_minor": 1015000, "left_minor": 185000, "per_day_minor": 61000,
    "ratio": 0.846, "state": "warn", "count": 4,
    "last_month_minor": 1180000, "average_minor": 1103000,
    "suggested_minor": 1200000
  } ],
  "unconvertible": []
} }
```

- `rows` holds every active expense category of the book: the budgeted ones
  first (most used first), then the rest by what they spent, so the screen
  can offer "set a budget" on a category that is costing money.
- `budget` is `null` on a row without one; `left_minor`, `per_day_minor`,
  `ratio` and `state` are then `null` too.
- `average_minor` is the mean over the three months before this one that have
  any spending in the category; `suggested_minor` is the larger of that and
  last month, rounded up to a round figure (৳7,340 → ৳7,500). It is what the
  one-tap sheet offers first.
- `totals` are over budgeted categories only, converted into `currency`.
  `left_minor` is the NET (limits minus spending). The screen leads with
  `headroom_minor` (room left in the `under` budgets) and `overrun_minor`
  (spent past the limit in the `over` ones) side by side, because an
  overrun in one category does not use up another's room.
  `headroom_per_day_minor` is the pace over that room.
- `other_minor` is the month's spending with no row here (uncategorised, or
  in a category since archived), in `currency`. Every row's `spent_minor`
  plus this is the ledger summary's `expense_minor`, and a test says so.

## PUT /api/budgets/{categoryId}

Body: `{ "amount_minor": 1200000, "currency": "BDT" }` (`currency` optional,
BDT by default). Creates or replaces the category's budget. 404 for a
category that is not the owner's or is not an expense category. 422 for an
amount below 1 or a currency the currencies table does not know.

Returns `{ "data": { "id", "category_id", "book", "amount_minor", "currency" } }`.

## DELETE /api/budgets/{categoryId}

Removes the budget. 204, or 404 when there is none.

## Goals

A savings goal: a name, a target, an optional date, and ONE thing that feeds
it. Progress is never stored.

| Linked to | Saved so far |
|---|---|
| an account (a DPS, an FDR, a savings account) | that account's derived balance |
| a deposit category ("Shares", "DPS") | deposits under it since the goal began, once per deposit, a mirror subtracting |

Not both: a DPS instalment is a deposit AND lands in the DPS, and linking
both would count it twice (422).

### GET /api/goals

```json
{ "data": { "saved_minor": 9500000, "target_minor": 45000000, "goals": [ {
  "id": "01J…", "name": "Umrah", "icon": "globe", "currency": "BDT",
  "target_minor": 30000000, "target_on": "2028-03-01", "started_on": "2026-06-01",
  "account": { "id": "01J…", "name": "DPS", "type": "savings", … }, "category_id": null,
  "saved_minor": 2000000, "left_minor": 28000000, "ratio": 0.0667,
  "months_left": 18, "needed_per_month_minor": 1555556,
  "recent_per_month_minor": 500000, "eta": "2031-06",
  "state": "behind"
} ] } }
```

- `needed_per_month_minor`: what is left over the whole months to the date,
  this one included; `null` with no date.
- `recent_per_month_minor`: the average that went in over the last three
  whole months (this month excluded, so the 3rd does not read as a collapse).
- `eta`: the month the goal is reached at that rate; `null` when nothing is
  going in.
- `state`: `achieved`, `on_track` (recent ≥ needed), `behind`, `no_date`, or
  `unlinked` (nothing feeds it yet).

### POST /api/goals · PATCH /api/goals/{id} · DELETE /api/goals/{id}

`name`, `target_minor`, `target_on`, `account_id` or `category_id` (the
owner's; a category must be a deposit category, else 404), `icon`.

## Demo data

`php artisan hisab:demo` also adds two goals (Umrah on the DPS account,
an emergency fund on the Shares deposits) and sets six budgets (groceries, transport,
dining, utilities, internet, subscriptions), sized so the demo month shows
all three states. `--clear` / `--fresh` remove exactly those (`is_demo`).

## Not built

- A budget for one month only, or a rollover of what was left.
- A budget for the whole month rather than per category (the finance
  settings' `monthly_budget_minor` still feeds Home's hero).
- Budgets on the Settings screen's demo button: it calls the ledger's demo
  service directly, which this module cannot hook without editing it.
