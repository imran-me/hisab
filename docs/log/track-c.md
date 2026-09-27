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

### Review rounds 2 and 4 — Track C's Lows

- The cockpit's flag is now `unconvertible`, the ledger summary's spelling.
- `MonthCockpit::carry()` is private; it only ever ran inside `month()`,
  which sets the converter up first.
- `Converter::convert()` returns `null` for a code the currencies table does
  not know, instead of assuming 2 decimal places.
- Now that B's summary converts (`c47d5ab`), the "cockpit = ledger summary"
  test compares all four book-months of the demo data, dollar months included.
- **Decision, `kept`:** kept = income − spent (a deposit is kept), as the
  cockpit and endpoints.md have it. What is left in hand after deposits is
  `net_minor` on the cockpit and `spendable_minor` on the ledger summary.
  **Needs Track B:** the client `ledger.summary()`'s `kept_minor` means
  income − spent − held; rename it `spendable_minor` to match the server.
  Home (C2) does not read it.
- Already answered by C2: the clipped "This month" tile strip is gone, and the
  insight lines use `moneyLabel()`.
- Verified: `artisan test` 139 passed.

### C2 — Home, rebuilt

- Order per DIRECTION.md §3.3: left to spend (the one large figure, display
  face, on the canvas), the pace line, a meter with today's mark, In / Saved /
  Out as three labelled short figures on one row; then Today (spent today and
  up to two entries, or "Nothing yet today"); a strip of spendable accounts
  with a below-zero flag; where it went (top three plus the rest); up to three
  one-line notes, number first. Net worth, the tile strip that scrolled
  sideways, the sparkline and Recent are gone from Home (net worth moves to
  Accounts in C3).
- **Default until the owner answers §6 q1:** "left to spend" is the monthly
  budget minus spending when a budget is set (`/api/finance/settings`,
  personal book only), otherwise this month's income minus spent minus saved.
  The pace is that, floored to a whole taka, over the days left including
  today. A past month shows what it ended with instead of a pace.
- Money goes through `formatMoneyHTML()` / `moneyLabel()` with A1's defaults;
  the insight lines no longer build their own "BDT 5,000.00" (review round 2).
- Compose: `mountCompose()` (B1) is mounted; the FAB is gone. The header's Out
  / In stay until A2's tab-bar + lands, or Home would have no way to add.
- Home still reads the client `ledger.summary()`, which converts at the
  current rate; the cockpit converts at the rate for the row's date. They
  agree on the demo (one seeded rate) and can differ once dated rates exist.
- `accounts/backend/api.js` gained `financeSettings()`, `financeMonth()`,
  `financeArchive()` (the one door to `/api/finance`).
- Verified at 360×780, dark and light: 1233px tall (1.58 screens), hero and
  Today above the fold, no OVERFLOW, no console errors, nothing covered.
  `artisan test` 136, `test-money.mjs`, `check-pages.py` pass.

### C2 follow-up — Home laid out to the v2 mock (DIRECTION.md §3.7)

- Top row: the month name opens a sheet of the last twelve months (a stand-in
  for A6's shared month grid), and a book pill switches personal / business
  when a business book exists, otherwise it is a plain label.
- Hero label "Left to spend this month"; ৳ and poisha set small and quiet;
  a pace bar with an ink fill and an accent tick at today, captioned
  "৳X a day for N days" and "N% used · day D". The basis sentence moved into
  the label's title.
- In / Saved / Out as full whole-taka figures in hairline thirds; Out in ink.
  Row outflows in ink too (v2 item 2).
- Lighter section heads local to Home; accounts strip with "All N" and a
  danger ring on a spendable account below zero; Where it went as a stacked
  bar of the top four plus the rest, then the top three as rows. The notes
  lost the lines the screen already shows (saved, top category).
- Tokens only (current names; A's v2 aliases carry them over).
- Verified at 360×780 dark and light: 1123px (1.44 screens), hero, pace,
  flows and Today above the fold, no OVERFLOW, no console errors.

### C3 — Accounts, and one account

- Accounts opens on net worth (spendable + held, each converted first, so the
  figure can never disagree with the pair under it), on the canvas; then the
  spendable and held groups. A row is now a link to the account, with the
  actions button beside it rather than inside it.
- The Default badge moved off the title line onto the meta line as a
  `flex: none` chip, so "Cash in hand" keeps its full width (review round 2).
- New `modules/accounts/detail.html`: type, institution and ••tail; the name
  (wraps, never cut); the balance in the account's own currency; a note for a
  card's available credit, a spendable account below zero, or a held account;
  in and out of this account this month (transfers included); every entry,
  both legs of a transfer, newest first by day, 40 at a time, each with the
  balance after it, worked backwards from the ledger's derived balance so it
  cannot disagree with the figure at the top. Tapping an entry opens it in
  the entry sheet. Home's account chips now open it.
- Row markup is local until B exports the ledger's row renderer (B5); marked
  TODO(B5) in `detail-page.js`.
- **Seen, Track B's:** `BalanceSheet::balances()` and the client `balances()`
  add a row's `amount_minor` to its account whatever the row's currency, so a
  USD 12.99 charge on a taka account moves it by ৳12.99. The account detail
  mirrors that so its running balance agrees with the ledger; it should use
  the snapshotted converted amount once the ledger does.
- Verified at 360×780: list 946px, "Cash in hand" + Default in full, no
  OVERFLOW; detail opens from a row and from Home, back returns to the list,
  running balances check by hand (৳14,253 after ৳485 → ৳14,738 before).
