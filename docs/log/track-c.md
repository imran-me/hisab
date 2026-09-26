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
