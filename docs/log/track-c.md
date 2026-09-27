# Track C log — Home, money and the month

Dev C's change log, decisions and anything not executed. The reviewer folds
this into `context.md` and `docs/STATUS.md`. Newest last.

---

## 2026-09-27

### C1 — One engine for a month

- `MonthCockpit` now works on one book at a time (`personal` unless
  `?book=` says otherwise) and takes income, spent and deposited from the
  ledger's `BalanceSheet::summary()` instead of summing them a second time.
  The cockpit's own `totals()` survives only for the previous-month comparison
  inside the insights; the archive's single pass is pinned to the month view
  by the existing agreement test.
- Why the two disagreed: `counted()` had no `book` filter, so September's
  personal income picked up the business book's client invoices.
- Decision: the finance settings (opening balance, budget, goal) and the month
  review are the personal book's. Another book opens at zero, has no budget
  and shows `closed: null`. Recorded in `modules/accounts/backend/endpoints.md`.
- Not changed: both summaries still add minor units across currencies (the
  demo's USD rows). The frontend converts; the server does not. Same as before.
- Verified: `artisan test` 129 passed (3 new: cockpit = ledger summary for
  both books and two months of demo data; personal is the default; another
  book does not inherit the opening balance). `test-money.mjs`, `check-pages.py`
  pass. No screen consumes `/api/finance` on `main` yet, so nothing to shoot.

### Review round 1 — convert before adding (C's side of the two Highs)

- New `Hisab\Fx\Services\Converter` (fx module; bcmath on the stored decimal
  string, rounded once half away from zero like `money.js convert()`). Rate
  order: the row's snapshot for exactly this pair, the owner's rate over the
  seed, the latest on or before the day else the earliest after, then the
  inverse pair. No rate means `null`, never 1.
- `MonthCockpit` converts every row to `?currency=` (default BDT) before adding
  it, in ONE place (`amount()` / `signed()`), and every sum goes through it:
  the month's totals, the carry-over replay, the archive, the month-on-month
  insight, the leak and the quality score. It no longer borrows
  `BalanceSheet::summary()`, which still adds cents to poisha; the class
  comment now says so instead of claiming the ledger as its source. Responses
  carry `currency` and `unconverted`.
- Found while there: the carry-over replay subtracted BOTH legs of a two-leg
  deposit, so a deposit into a tracked DPS cost the next month's opening twice.
  Fixed, with a test.
- `?book=` is validated: `personal` or a book the owner has an account in,
  else 422.
- `kept_minor` naming: the cockpit keeps kept = income − spent and net =
  income − spent − deposited. Home does not read the client's `kept_minor`.
- **Needs Track B:** `BalanceSheet::summary()` should convert through
  `Converter` with the same rate rule, and the client `summary()`'s
  `kept_minor` (income − spent − held) should be renamed `in_hand_minor`.
  Once B's summary converts, the "cockpit = ledger summary" test can drop its
  BDT-only guard.
- Verified: FinanceCockpit tests 43 passed (7 new: dollar income converted;
  $12.99 rounds to 159,128 poisha; a row before every rate uses the first on
  file; EUR with no AED rate is named in `unconverted`; the archive converts
  like the month; a two-leg deposit leaves the opening once; unknown book 422).
