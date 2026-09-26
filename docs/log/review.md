# Review log

The reviewer's findings on each batch pushed to `main` after `c0092c3`
(DIRECTION.md). Newest round first. Each finding has a severity, the commit, a
`file:line`, and the track that owns the fix.

**Severity:** **High** means wrong money, a security hole or a broken locked
rule, so fix it before the next increment on that track. **Medium** is a real
bug or a broken acceptance check. **Low** is polish, or a trap for later.

**How it was checked:** a detached worktree on `origin/main` with its own
`vendor/` (see the note at the end), a throwaway SQLite database with
`hisab:demo --months=3`, `php artisan test`, the API read directly with curl,
and `tools/shoot-mobile.mjs` at 360×780.

---

## Round 1 — `ea255c8` (Track C: one book at a time in the month cockpit)

The book split is right, and it fixes the ৳259,473 vs ৳88,611 disagreement for
BDT-only months. Author and email are correct, and there is no AI attribution.
`php artisan test` shows 129 passed, 484 assertions.

### High: server month totals add USD cents to BDT poisha. Owner: B (C inherits it)

- `modules/ledger/backend/Services/BalanceSheet.php:113-120` sums `amount_minor`
  over every counted row whatever its `currency`. The comment says "the client
  converts using the snapshot", but a sum that has already mixed currencies
  cannot be converted afterwards.
- In the demo data, August's personal income includes an Upwork payout of
  **USD 450.00** (`amount_minor` 45000, `currency` USD). `/api/ledger/summary`
  and, since `ea255c8`, `/api/finance/2026-08` both report income
  **8,796,300 poisha**. That is ৳87,513 of BDT plus "৳450" that is really
  $450, about ৳55,000 at the demo rate, so it is roughly a 120× under-count of
  that row. September's USD 12.99 expense is the same bug in reverse.
- `ea255c8` makes this worse in one way. `MonthCockpit::ledgerTotals()`
  (`modules/accounts/backend/Services/MonthCockpit.php`, `ledgerTotals`) now
  takes these figures from `BalanceSheet::summary()`, and the new test pins the
  cockpit **equal to** the summary. Both are wrong the same way, and the test
  now guards the wrong number.
- **Fix (B):** convert each row to the book's display currency using its
  `fx_rate` snapshot, or the rate as of `occurred_on` when there is none, the
  way `ledger/backend/api.js` `summary()` already does with `convertAndSum()`.
  Otherwise return totals per currency and never a single `*_minor` over mixed
  currencies. Then add a test with one USD row. **(C)** follows by adding a
  USD row to the "cockpit equals ledger" test.

### High: Home and the cockpit still disagree for any month with a foreign-currency row. Owner: C

- C1's acceptance says Home and the cockpit agree. Home does not read the
  server summary's total: `modules/ledger/backend/api.js:437` `summary()`
  converts row by row on the client. So for August, Home computes about ৳142k of
  income (from the code path, at the seed rate) and the cockpit shows ৳87,963. The test cannot see this, because it
  compares server with server.
- This goes away once the High above is fixed on the server and the client
  `summary()` reads the server's converted figure, not its own. Until then, C1
  is not met for months that hold USD.

### Medium: `kept_minor` means two different things. Owner: C, agree the name with B

- The cockpit sets `kept = income − expense`, with a deposit counted as kept
  (`MonthCockpit.php` `ledgerTotals`, and endpoints.md "The month").
- The client summary that Home reads sets
  `kept_minor = income − expense − held` (`ledger/backend/api.js:468`), which
  is the cockpit's `net_minor`.
- Same field name, different quantity, on the two engines that C1 exists to
  unify. C2 is about to build "left to spend" from one of them. Pick one
  meaning, and rename the other (`in_hand_minor` or `spendable_minor`).

### Medium: the cockpit still has a second engine. Owner: C

- The class comment says the month's totals come only from the ledger, so "the
  two screens cannot drift". But `carry()`, `archive()` and the month-on-month
  insight (`$this->totals($this->rowsFor(...))` in `insights()`) still sum rows
  through the cockpit's own private `totals()` (`MonthCockpit.php:564`).
- The opening balance, the archive's per-month figures and "spending up 12%"
  are therefore still computed separately from the month's headline figures.
  They agree today only because both copies share the same flaw.
- Route them through `BalanceSheet::summary()` too, or reword the comment so it
  claims less.

### Low: `?book=` accepts any string. Owner: C

- `FinanceController::book()` validates only `string|max:32`. `?book=persnal`
  returns a month of zeros with a 200, which looks like "no data" rather than a
  typo. It is scoped to `user_id`, so nothing leaks.
- Validate it against the books that exist (`in:personal,business`, or the
  owner's distinct books), and return 422 otherwise.

### Low: a fresh checkout cannot run `artisan test`. Owner: A

- `phpunit.xml` names `tests/Unit`, which is not in git because an empty
  directory is not tracked. From a clean worktree, `php artisan test` stops with
  *Test directory "…/tests/Unit" not found* before running anything.
- Commit a `tests/Unit/.gitkeep`, or drop the Unit suite from `phpunit.xml`.

### Screens

Nothing visible changed in this batch, since it is backend only. Baseline
shots of Home and the Ledger at `c0092c3` were taken for comparison.

---

## A note for anyone reviewing from a worktree

**Do not junction or symlink `vendor/` into a second worktree.**
`vendor/composer/autoload_psr4.php` resolves `$baseDir` through the real path,
so every `Hisab\*` module class loads from the tree the link points at, not
from the worktree. The server then runs the *main* tree's backend against the
worktree's frontend, and a review sees stale PHP without any error. Copy
`vendor/` and run `composer dump-autoload`. This is how round 1 first appeared
to show `ea255c8` "not working".
