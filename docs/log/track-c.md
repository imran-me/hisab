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
  Reshot after A's palette and Anek (`3fae58b`, `df932b3`) in both themes:
  Home, Accounts and the detail match the v2 mock's structure.

### C2 — compose through the tab bar only

- A2's `+` is live, so Home drops the header Out / In; `mountCompose()`
  answers the bar's `EVENTS.COMPOSE`. Home no longer imports
  `entryActions()`, which B can now delete.
- Where it went still colours by `segmentColor()`; it switches to the
  category tint tokens when A ships them.

### v2 tokens and type on Home and Accounts (Dev A's notes)

- `overview.css`, `accounts.css` and the page scripts no longer read any v1
  alias (`--ink*`, `--surface*`, `--flow-*`, `--accent-ink`, `--r-1..4`,
  `--r-full`); checked with a grep. Reports, business, investments and budgets
  have no module CSS yet. No `.fab` markup is left in Track C's pages.
- Heroes are `--t-hero` at `--wd-hero` with `--track-figure`; In / Saved /
  Out and the net-worth pair `--t-fig`; strip balances `--t-fig-sm`; section
  titles `--t-section` at `--wd-title`; the month name `--t-head`.
- List rows and chips use `{ minor: 'never' }`: Home's Today rows, account
  chips and category rows; the Accounts list; the detail's entries and
  balance-after. Heroes keep the default (poisha shown small when not zero).
- Category glyphs and tints (`db2595d`) are in the sprite, but nothing maps a
  category to a tint yet. **Needs Track B:** a tint name per category (in the
  categories seed / API, and on the summary's `by_category` rows), so Home and
  Month colour a category by what it is rather than by its rank.
- Verified at 360×780 in both themes: Home 1073px, Accounts 891px, no
  OVERFLOW, figures in Anek, nothing cut.

### C4 prep — one month-and-book line for Home and Month

- The month picker and book pill moved out of `overview-page.js` into
  `modules/reports/period-top.js` + `period-top.css`, so the Month screen can
  open on the same line without a second copy. Home renders unchanged.
- `financeMonth()` / `financeArchive()` pass `?currency=`.
- A6's shared year grid landed (`8626c09`), so the month name now opens
  `openMonthGrid()` and the stand-in list sheet is deleted. Checked at 360 in
  the dark: the grid opens over Home, September marked, the future disabled.
- B's `spendable_minor` rename (`c0717ab`) needs nothing here: Home reads
  income, spent and held from the summary, never its kept figure.

### C4 — the Month screen (modules/reports/insights.html)

- Replaces the "not built yet" stub, and is listed in More (one line in
  `shell.js` SECONDARY). Opens on the shared month/book line, then:
  spent this month (hero) with in / saved / kept; **Day by day**, cumulative
  spend against last month (two lines, told apart by lightness, a line-key
  legend and a readout); **Six months**, income as a well with a green mark
  and spending as the fill inside it (shape, not hue: green against pink
  measured ΔE 3.1 for deuteranopia with the dataviz validator); **Against
  your usual**, the top six categories with a tick at their average over the
  earlier months that have data; **Was it worth it?**, the necessity bands,
  not-judged, the spend-quality grade and "could have kept" (MonthCockpit's
  leak); and the server's insight codes worded one line each.
- Charts: `charts.js`, inline SVG drawn at the container's real width, redrawn
  on resize, 2px lines, ≤24px columns with 4px rounded tops, ringed dots. A tap
  or drag picks a day or month and the readout says the values; arrow keys do
  the same; every chart has "As a table" underneath.
- **Found: the CSP blocks inline `style=""`** (`style-src 'self'`), so every
  `style="--w:…"` written into innerHTML renders as nothing on the real site;
  shoot-mobile bypasses the CSP, which hid it. New `style-vars.js` sets such
  values through the CSSOM from `data-vars`; Home's category bar and legend
  use it too. **For Dev A:** `shared/js/components/spark.js` (`barStrip`,
  `breakdownBar`) has the same `style=""` pattern.
- Verified at 360 both themes: 1854px, no OVERFLOW, no console errors; a
  synthetic tap on day 13 moved the crosshair and readout
  ("৳28,088 by 13 Sep · August: ৳30,715").

### Owner override 1 — the full account form

- Kind first (Cash · Bank · Mobile · Card · Other), then only that kind's
  fields. Bank: a searchable bank picker with marks, branch, holder, account
  number, account type (Savings/Current/Salary/FDR/DPS), routing number,
  currency. Mobile: bKash/Nagad/Rocket/Upay tiles and the wallet number. Card:
  issuing bank, network, last 4, credit limit, statement day. Other: online
  wallet / savings / investment. Every kind: opening balance and date, one of
  eight colours, notes.
- **Closing balance** is a reconcile field (balances stay derived): on edit,
  "Statement says ৳X on <date>" shows the gap to the ledger's balance and a
  one-tap "Post a ৳Y adjustment" entry.
- Backend: migration `2026_09_27_000100_add_details_to_accounts`, shared
  `AccountDetailRules`, `AccountBook::normalise()` (tail from the number, FDR
  and DPS filed as held, other kinds' fields nulled), the number encrypted and
  served only by `GET /api/accounts/{id}`. 6 new tests (25 in AccountsTest),
  plus a USD-row cockpit = ledger summary test Dev B asked for.
- Bank marks come from `modules/accounts/data/institutions.json` +
  `brand.js` (monograms in token colours) until A's `bankLogo()` lands.
- Verified: form at 360 (bank with the picker open, card, mobile), a bank
  account saved through the form (branch, tail 6789, number encrypted,
  salary, blue, ৳50,000 opening), the edit form showing a ৳1,250 gap and the
  adjustment button. Screens: scratchpad `c/f1d`, `c/f3d`, `c/f4l`, `c/f4d`.

### Owner override 2 — accounts as their cards

- `account-card.js`: every account printed like its card in the bank's brand
  colour (A's `bank-logo.js` / institutions) or the colour chosen in the form,
  with the tile, issuer and branch, account type or network, masked number,
  name and holder, Default / Below zero pills, and the balance. Ink is white or
  near-black by contrast; colours reach CSS through `style-vars.js` (moved to
  accounts; CSP). The list uses it; the account page uses it large as its
  header, with the last statement's gap and a one-tap adjustment under it.
- The form's bank picker and wallet tiles now use A's institutions and
  `bankLogo()`; my stand-in `institutions.json` is deleted.
- Card grounds for chosen colours are eight deep hexes in `brand.js`, as
  brand data like A's list (noted for review).
- Screens: scratchpad `c/k1d` (list, night), `c/k2l` (detail, day).
- Not done (deadline): step 3, red/green across Home, Accounts, detail and
  Month.

## 2026-09-28

### Budgets, the server half

- New module `modules/budgets/` (`Hisab\Budgets`): a `budgets` table holding
  ONLY the limit per expense category (one per category, cascade with it);
  `GET /api/budgets` computes spent, left, a floored per-day pace and a state
  (ok < 75% ≤ warn < 100% ≤ over) on every read; `PUT` / `DELETE
  /api/budgets/{categoryId}`. Contract first in `backend/endpoints.md`.
- Spent is summed here, not read from `BalanceSheet::summary()`, because the
  summary groups by the category's snapshot LABEL and a budget belongs to the
  category. Same rule (expense only, converted per row with the snapshot rule,
  mirror subtracts); a test pins Σ rows + `other_minor` to the summary's
  `expense_minor` for three demo months. **For Track B:** a `category_id` on
  the summary's `by_category` rows would let this read it instead.
- Each row carries last month, a three-month average and a round suggested
  limit, so setting a budget from a category is one tap.
- Demo: the provider listens for `hisab:demo` finishing (`CommandFinished`)
  instead of editing the ledger's command; `--clear` / `--fresh` purge exactly
  the `is_demo` budgets. **Not covered:** the Settings demo button, which
  calls `DemoData` directly — a hook there is Track B's call.
- Registration is the two permitted lines: the PSR-4 entry in
  `composer.json` and the provider in `bootstrap/providers.php` (Dev A's
  files; one line each, like the `SECONDARY` exception).
- Verified: `artisan test` 166 passed (10 new in `BudgetsTest`).

### Budgets, the screens

- `modules/budgets/list.html` is real (the stub is gone) and listed in More:
  one ring for every budget with what is left and the pace beside it; each
  budget most-used first as a ring (green → amber at 75% → red at 100%, the
  overrun drawn as a brighter second lap) with "৳X left · ৳Y/day"; then every
  other expense category with a one-tap "+ ৳7,500" at the server's
  suggestion, and Undo in the toast.
- Tapping any budget opens `budget-sheet.js`: the amount (current or
  suggested), three quick picks (suggested, last month, usual) and a live
  line of what it would leave and at what pace.
- Home: a Budgets section after Accounts with the three closest to their
  limit as ring tiles ("৳522 left" / "৳174/day"), each opening the same sheet;
  with none set, one line offers the costliest category ("Budget it").
- Rings carry a marigold tick at today's share of the month, so a fill past
  it is spending ahead of the calendar.
- Fixed while there: Home's Where-it-went legend swatches were always grey;
  only the bar was run through `applyStyleVars`.
- Verified at 360 in both themes: Home 901px, Budgets 1010px, the sheet over
  the list, no OVERFLOW. Shots: scratchpad `c/b1-dark`, `c/b1-light`,
  `c/b2-sheet`.

### Dues (baki)

- Counting rule decided (DIRECTION.md §6 q6) in `modules/dues/backend/
  endpoints.md`: lending is not spending and borrowing is not income. One
  held `dues` account per book; every due is a ledger transfer between a
  spendable account and it, written with the due in one DB transaction.
  A person's balance is never stored: the sum of their Dues legs plus any
  reversal mirrors, so reversing the transfer in the Ledger corrects them.
- `dues` added to `Account::TYPES` / `HELD_TYPES` and the client TYPES, so
  money lent stays in net worth and out of spendable.
- Screen `modules/dues/list.html` (in More): owed to you (green) / you owe
  (red), I lent / I borrowed, reminders that have come due, people with
  running balances. Person sheet: balance, one-tap Settle for the whole
  amount (a real ledger entry), lend more / part payment, remind-me dates,
  and a prepared reminder handed to the phone's share sheet.
- Demo: three people in all three states via `hisab:demo`.
- Verified: `artisan test` 175 passed (8 new in DuesTest); Dues screen,
  person sheet and record sheet at 360 in both themes (scratchpad
  `c/d1-*`, `c/d2-person`, `c/d3-record`).

### Review rounds 6 and 7 — Track C's money fixes

- H1 (`8b4ba99`): a statement is compared with the balance ON its date, by
  the server (`Reconciler`, `GET/POST /api/accounts/{id}/reconcile`); a card
  statement is the amount due, read as owed. M1: closing the gap moves the
  opening balance, never an income or an expense. 4 tests.
- H2 (`494cf5b`): `leak()` and `quality()` net a correction's mirror, like
  `by_need`; the leak is floored at zero. 2 tests.
- M8 (`c1f09c1`): the Budgets hero shows room left in the budgets under
  their limit and the overrun in the others side by side, never netted;
  archived categories refuse a budget; a failed `/api/budgets` is returned
  as a failure, not as "offline".

### Goals

- In the budgets module (context.md §5 gives it "savings goals"): a `goals`
  table holding only the target, the date and ONE link — an account (its
  derived balance) or a deposit category (deposits since the goal began,
  once each, a mirror subtracting). Linking both is refused: a DPS
  instalment would count twice.
- `GET /api/goals` adds left, whole months to the date, needed per month,
  the average that went in over the last three whole months, an ETA at that
  rate and a state (achieved / on_track / behind / no_date / unlinked).
- The Budgets screen (More: "Budgets & goals") gains a Goals section: each
  goal as a card with a violet bar, saved of target, and one line that
  answers "will I make it?"; the sheet takes name, icon, target, month and
  what feeds it, with a live "৳X a month for N months".
- Demo: Umrah on the DPS account, an emergency fund on the Shares deposits.
- Verified: `artisan test` 185 passed (4 new in GoalsTest); screen and sheet
  at 360 (scratchpad `c/g1`, `c/g2`).

### Settings demo button, and review round 8 (H4)

- `90eedeb`: the budgets and dues providers also listen for POST / DELETE
  `/api/ledger/demo` succeeding (`RequestHandled`), so Settings' button adds
  and removes demo budgets, goals and dues. No file outside the two modules
  changed. 2 tests (`DemoExtrasTest`).
- H4, my half: a due is corrected ONLY from the Dues sheet. Tap an entry:
  "Change amount" reverses its transfer, records the new one and moves the
  entry onto the new Dues leg in one DB transaction (`PATCH
  /api/dues/entries/{id}`); "Undo it" reverses the transfer and keeps the
  entry as history (`POST …/undo`, 409 once undone). Tested: lend ৳5,000,
  change to ৳6,000 → person ৳6,000, Dues account ৳6,000, cash −৳1,000 more.
  **Track B:** the Ledger refusing correct / repeat on a Dues leg is yours,
  as agreed; point the person to the Dues screen.

### Review round 8 (M11)

- The Dues account is system-kept: `dues` is out of `Account::CREATABLE_TYPES`
  (create and switch-to refused), PATCH and DELETE on it are 422, the Accounts
  card has no actions menu and its Edit goes to the Dues screen. An archived
  one is revived, never duplicated. 1 test.
- **Track B:** hide `accounts.isSystem()` accounts from the entry-sheet
  account picker (`modules/ledger/account-picker.js`), so no manual transfer
  can go into the Dues account.
