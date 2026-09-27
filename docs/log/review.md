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

## Round 3 — `5b8c310` (Track B: type the amount on a pad in the sheet)

Author and email are correct, with no AI attribution, and every file touched
is inside Track B's ownership. This is the biggest improvement in the app so
far. The sheet now opens on a pad, Save sits in the thumb's corner, and the
system keyboard never appears. Driven in headless Chrome at 360: `+` → 1 2 0
+ 4 5 . 5 5 5 → Save stored **`amount_minor` 16555, BDT, expense**. The third
decimal was refused as designed, and the toast read "Added ৳165.55".

The numpad maths were checked in node: `12.999` → 12.99, `005` → 5,
`120+45` → 16500, `.5` → 50, and 13 nines are capped at 12 whole digits. KWD
keeps 3 places, and pressing `+` then `-` replaces the operator rather than
stacking it. The whole path is in integers.

### High: the entry you just added cannot be seen. Owner: B (B5)

- After saving, the Ledger shows a **TODAY −165.55** heading with **no row
  under it** (`r3/saved`). The row is hidden behind the stacked sticky day
  headers, and a ghost strip at the top of the list shows a clipped icon.
- DIRECTION.md §1 already names this bug. B1 now makes it the first thing the
  owner sees after every save. It confirms nothing and looks like a failed
  save.
- Pull B5's sticky-header fix forward, ahead of B2/B3.

### Medium: the fast path records "Uncategorised · Discretionary". Owner: B (B2)

- The quick-add path is `+`, digits, Save. With category moved behind
  **Details**, that path now stores `category_label` **null** and `necessity`
  **3** (Discretionary). Checked in the database for the entry above.
- The old form at least showed the dropdown, so the fast path now produces
  unusable data more reliably than before. It is fine as a step, but B2's
  category chips, where a tap saves, have to land before this is used for
  real. Until then, consider showing the top four categories as chips above
  the pad, with no ranking endpoint needed yet.

### Medium: the draft is still never written. Owner: B (B4)

- `modules/ledger/entry-sheet.js:120` calls `saveDraft(ctx)` from `onClose`.
  `shared/js/components/sheet.js:88` has already removed the sheet by then, so
  the guard `if (!form.isConnected …)` at `entry-sheet.js:633` returns every
  time.
- This bug is unchanged, as recorded in STATUS. It is logged again because the
  new sheet makes the amount the only thing typed, and that is exactly what a
  phone call now loses.

### Low: the currency on the sheet is still "BDT". Owner: B

- The amount display prefixes **BDT** in mono (`r3/sheet-open`), while every
  figure elsewhere now shows ৳ (A1).
- Show ৳ for the home currency, still as a button, so tapping it opens the
  currency picker. Keep the code for any other currency.

### Low: JPY "1.5" from a hardware keyboard becomes 15. Owner: B

- With `places = 0` the `.` is refused but the next digit is still appended,
  so `1` `.` `5` typed on a hardware keyboard gives ¥15. The on-screen `.` is
  disabled for a zero-decimal currency, so only a keyboard can reach this.
- After a refused `.`, refuse the digit that follows too, or flash the display
  to show the key was ignored.

### Visual

1. **The pad is good.**
   - Digits are in the display face, the operator column is a step darker,
     and Save is the only accent. The hierarchy is right.
   - It already has a `:active` press state (a .97 scale plus a wash) and
     uses the token radius `--r-2`, so a still screenshot undersells it.
   - The one step from competent to crafted: add a short haptic on key press
     for Android (A8's helper, off by default) and a quick tick on the
     `= ৳165` result line when the sum changes.
2. **The title bar costs 70px of the sheet for the words "New entry".**
   - The Out/In/Save/Move segment already says what the sheet is. Fold the
     title into the drag handle row, or drop it and keep the ×, and give the
     70px to the amount.
3. **Details opens upward over the amount.**
   - The amount scrolls up to the top of the sheet. The "Was it worth it?"
     chips wrap and cut **Avoidable** at the scroll edge (`r3/sheet-details`).
   - Keep the amount pinned, and put the four necessity choices on a single
     4-up segmented row as the type control does. They fit at 360 with the
     short labels (Must / Need / Want / Waste, or similar; the owner should
     choose the words).
4. **The empty amount shows a huge grey `0`.**
   - It is the largest thing on screen, and it is a placeholder. Use the same
     size at `--ink-4`, with a blinking caret after it (`@keyframes` on
     opacity, off under reduced motion), so the display reads as "type here"
     rather than "you have ৳0".

---

## Round 2 — `0b934dc` (Track A: make money fit a 360px phone)

Author and email are correct, with no AI attribution. `test-money.mjs` passes
88 assertions. `formatMoneyHTML` still works in integers only (`parts()`
divides and takes the remainder, never `abs / factor`), and the one symbol that
comes from the registry is escaped. The ৳-without-a-code rule is right and
already makes Accounts and the Ledger calmer. Every page now carries its own
screen height at 360, with no `OVERFLOW` in shoot-mobile output.

### Medium: a figure that rounds to zero keeps its minus sign. Owner: A

- `shared/js/core/money.js` `parts()` takes `negative` from the unrounded
  value, and then `minor: 'never'` rounds the whole part.
- Checked with node: `formatMoneyHTML(-40, 'BDT', {minor:'never'})` gives
  **−৳0**, and so do −49 and −1 poisha. `formatMoney(-1, 'BDT', {compact:true,
  symbol:true})` gives **−৳0** as well.
- A reversed ৳0.40 rounding line, or a day that nets to a few poisha, would
  read as "minus zero taka".
- **Fix:** take the sign from the rounded result (`whole === 0 && rest === 0`
  means no sign), and add a test for it.

### Medium: A1 acceptance is not met on the Overview. Owners: A, then C

- At 360 in the dark theme, the Overview's "This month" strip still cuts the
  third tile: **`৳43,61`** for Spent (`r2/index-1`). The tile row is still
  wider than the screen.
- The `15cqi` container scaling fixed the figure inside each tile, but not the
  strip. The strip is C2's to replace. Until then, A1's check "no figure is cut
  on Overview" fails.
- Either A widens the check to "no figure cut inside its own box", or C lands
  C2 with the three figures on one row.

### Medium: "Cash in hand" is still cut on Accounts, and hides its Default badge. Owner: C (markup), with A for `.row`

- The title element holds "Cash in hand" plus a **Default** badge. The probe
  gives `scrollWidth 148 > clientWidth 147`, so the badge is ellipsised away and
  the owner sees `Cash in hand …`. That is a 12-character name, well under A1's
  18.
- Move the badge out of the ellipsis box (onto the meta line, or as its own
  `flex: none` element), so the name keeps its width and the badge survives.

### Low: two money styles on one screen. Owner: C

- The Overview's insight cards still print **"BDT 5,000.00"** and
  **"BDT 18,000.00"** (`r2/index-2`), directly under a hero that says
  `৳2,69,513`.
- `overview-page.js` `drawInsights()` builds these strings itself. It should
  call `moneyLabel()`.

### Low: ledger day totals do not match their rows. Owner: B

- The day heading prints **`-301`** with an ASCII hyphen, no ৳, and a heavier
  weight than the row amounts under it (`−৳294`).
- It reads as a different kind of number from the rows it totals. Use
  `formatMoneyHTML(..., {code:false})` so the U+2212 minus and the weight
  match, or drop the day total on days with a single entry (B5).

### Visual (aesthetics) — what makes it look generated rather than crafted

1. **The ৳ reads as a lowercase "b" at small sizes.**
   - `.money__sym` sets it in Noto Sans Bengali Regular at 0.86em and 66%
     opacity. Next to Space Grotesk Medium digits it is thinner, smaller and
     lighter than the numbers.
   - In the hero chips (`+৳87.9k`) and on list rows (`৳12,615`), it looks like
     `b87.9k`.
   - **Fix (A):** set the symbol at the digits' weight, at full opacity in the
     figure's colour, at about 0.9em, and nudge it up with
     `vertical-align: 0.02em`. Better still, use a Bengali face that has real
     weights (see RESEARCH.md "Fonts"), so a semibold figure gets a semibold ৳.
2. **Three number faces on one screen.**
   - The hero is in Space Grotesk. SPENDABLE and HELD directly under it are in
     Plex Mono. The stat tiles are in Space Grotesk, the account rows are in
     mono, and the category legend is in mono.
   - The rule "display face for large figures, mono for columns" is right, but
     the hero's own sub-figures are not a column. **Fix (A/C):** use the
     display face for every figure in a hero or tile, and mono only in lists.
3. **Chip rows touch the screen edge.**
   - The Ledger's filter chips start at x=0: "All" sits against the left edge
     with no gutter, while everything else on the page has a 16px gutter.
   - A scrolling chip row should keep its first chip on the page gutter
     (`padding-inline: var(--s-4)` on the scroller plus `scroll-padding`).
     Owner: B (B6 replaces the row anyway).
4. **The month control still looks like selected text** (a grey filled box).
   This is A6, and it is repeated here because it is the first thing the eye
   hits on the Ledger.
5. **Every row's icon is the same coral arrow tile**, so the column carries no
   information and makes the list look like a template. This is B5's category
   glyph plus tint. It is the single biggest move from "generated" to
   "crafted" on the Ledger.
6. **Day theme:** the hero is a near-black card on a pale page. That is heavy
   but deliberate and reads well. The rest of the light theme is clean.
   Coral on white (`−৳294`) is fine for contrast at that size, and should be
   checked at small sizes once B5 shrinks the row text.

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
