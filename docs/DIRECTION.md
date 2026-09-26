# Direction — the phone app

Written 2026-09-26, after the owner said of the current app: *"i am not liking
at all."* Their main use is a phone at 360px. This document says what is wrong,
what we are building instead, and how three developers build it at the same
time without stepping on each other.

It sits under `context.md` §2 (locked rules) and `CONVENTIONS.md`, and changes
one part of `context.md` §4 — see "Visual language" below, dated as a decision.

It adopts most of `docs/RESEARCH.md` (the reviewer's study of the same screens
and of Monzo, Revolut, Copilot, Money Manager, Monefy, Wallet, Hat-Khoroch and
Hishabee). "R#n" below means research item n. Only what this file adopts is a
decision. The rest of RESEARCH.md stays a backlog.

---

## 1. Diagnosis — what a phone user actually sees

Every screen was loaded signed in, with three months of demo data, in headless
Chrome with real mobile emulation at 360 × 780 (`tools/shoot-mobile.mjs`).
Judged as a picky user would judge it, not as the author would.

### The whole app

- **Half the app cannot be reached on a phone.** The tab bar carries Overview,
  Ledger, Accounts, Insights, Vault. Settings, Business, Investments, Budgets
  and Categories live only in the desktop rail, and `shell.js` says they are
  "reachable from Settings on a phone" — but nothing links to Settings. So on a
  phone there is no way to change the theme, sign out, or add demo data.
- **One of the five tabs is a dead end.** Insights is a page saying the feature
  is not built. So are Business, Investments, Budgets and Categories. Five
  "not built yet" pages break the spirit of the no-view-only-page rule.
- **Three buttons for one job.** Out and In in the header, plus a floating Add
  button. The header pair takes half the header width, so the page title has
  little room. The floating button sits on top of content: on the Overview it
  covers the category bar, and in the Ledger it covers the amounts in the
  bottom rows.
- **Figures do not fit, so they get cut off.** Every amount is printed as
  `BDT 2,64,477.01`, with the currency code in front and poisha after it, in
  a wide monospace font. At 360px the stat tiles cut off their own numbers
  (Overview "BDT 88,611." and the third tile half off-screen; Accounts "Held
  BDT 40,000.0"; Ledger "OUT BDT 46,165.28"). In the lists, the amount takes
  the width and the name loses it: "Cash in ha…", "Bank acco…", "Brokerage
  (D…", "Dining … · Cash in h…". The name is what you read first, and it is
  the part that gets cut.
- **It does not look like anything in particular.** Near-black, a hairline
  border on every card, uppercase grey labels, the same box repeated. It is
  tidy, but at 360px "instrument-panel density" comes across as clutter: every
  block carries the same weight, so nothing stands out as the answer.

- **Every tab opens on grey skeletons** for about 2.5 seconds, including
  figures you saw a minute ago (R#6).

### Overview (`index.html`)

- About 3.2 screens tall (2465px): net-worth hero, a strip of month tiles that
  scrolls sideways, the category bar, three insight sentences, all six
  accounts, and recent entries. There is no order of importance. The question
  a phone user opens the app to answer — *how am I doing this month, and how
  much can I still spend?* — is not at the top.
- The hero's three chips (`+৳88.6k −৳5k −৳46.2k`) have no labels, and "What
  the numbers say" is three paragraphs that nobody will read between errands.
- The **Recent list is broken for today**. Today's row sits behind the
  stacked sticky day headers, so you see a "TODAY" label with nothing
  readable under it and a clipped "Ub…" above it. The Ledger has the same bug.
  The entry you just added is the one you cannot see.

### Ledger (`modules/ledger/list.html`)

- The month label renders as a grey filled box that looks like the browser's
  default highlight, not a control.
- The filter chips (All, Out, In, Held, Moves, History) run past the right
  edge and give no sign that they scroll.
- Every row has the same coral arrow tile, so the icon tells you nothing. The
  category and the account are both cut off on the second line. At about 64px
  per row, a screen shows eight entries.

### Adding an expense (the entry sheet)

The most important screen in the product, and it is a desktop form in a
sheet:

- The type buttons are cut to "Expe…", "Inco…", "Depo…", "Trans…".
- The amount box is not the biggest thing on screen, and its currency cap has
  an odd partial border.
- Tapping the amount brings up the system keyboard, which covers half the
  sheet. Category is a native `<select>` that defaults to **Uncategorised**.
  "Was it worth it?" defaults to Discretionary. After that come Date, Paid with,
  Paid to and Note.
- The sticky "Add entry" button covers the "Paid to" field.
- Realistic cost of recording a ৳250 rickshaw: about 8 taps, a scroll, and a
  dropdown. It should be three taps plus the digits.
- The draft it promises is never saved (`docs/STATUS.md`), so a phone call
  in the middle of typing loses the entry.

### Accounts — and the parked cockpit

- The version on `main` works, but it has the cut-off problems above. There is
  also no account detail: tapping an account does not show that account's
  entries.
- The **uncommitted "month cockpit"** swapped this screen into a second design
  system: vendored Bootstrap, Inter and violet buttons. That is almost word
  for word the list `context.md` §4 says to avoid. It also dropped the tab
  bar for a hamburger menu, is 4253px tall, and shows a desktop table whose
  amount column is pushed off the right edge at 360px. On a phone you cannot
  see the amounts at all.
- **Two engines disagree about the same month.** For September the Overview
  says income ৳88,611 and the cockpit says ৳259,473. The cockpit's
  `MonthCockpit` adds the business book to the personal one, and the
  Overview's ledger summary does not. `CONVENTIONS.md` says "if a figure is
  computed in two places, one of them is already wrong". Mixing the books
  also breaks the "separate books" rule in `context.md` §1.

### What is fine

The Vault setup screen reads well, apart from a password placeholder with
padding for an icon that is not there. The research found one more problem:
Vault drops the tab bar, so the only way out is the browser's back gesture. Settings is clear, just unreachable.
The backend underneath all of this is solid and well tested (126 tests).
The problem is the experience on top of it, not the data model.

---

## 2. What happened to the uncommitted work

**Split.** The server half is committed (`2833ff8`): `MonthCockpit` gained rows,
per-day totals, the necessity mix, sectors and methods, insights, and
`GET /api/finance/archive`, all covered by 16 new tests. Any month view needs
these numbers, and the work is tested.

**The frontend half is parked** in `git stash` as *"cockpit WIP frontend
(parked by director)"*: `cockpit-page.js` (1371 lines) and `cockpit-modals.js`,
`opp-shell.js`, `opp-toast.js`, `assets/css/opp-extras.css`, the `list.html`
rewrite, the `check-pages.py` exemption and `tools/login-harness.html`. Reasons:
it is a second design system; it does not work at 360px; a 1371-line page
script breaks the "no single-file code" rule; and it replaced the Accounts
screen with something that is not a list of accounts. Dev C mines it for
ideas (the month-close banner, the necessity mix, "could save") and rebuilds
those ideas as phone screens in Hisab's own CSS. Nothing from the stash
should be copied in as it is.

The vendored OppTracker assets (`assets/vendor/`, 1.2 MB, still deployed) are
now used by nothing except `tools/check-vendor.html`. They get removed (A3).

---

## 3. The direction

### 3.1 Principle

**One thumb, one question per screen, the answer at the top.** Density belongs
in lists, where you scan. The top of every screen has room to breathe and one
figure that answers the screen's question.

| Screen | The one question it answers first |
|---|---|
| Home | How is this month going — what is left to spend? |
| Ledger | What did I spend, and on what? |
| Accounts | Where is my money right now? |
| Month (Insights) | Where did it go, and what could I have kept? |
| Vault | Find a secret, fast. |

### 3.2 Navigation

Bottom bar, five slots, the middle one is Add:

```
  Home    Ledger    [ + ]    Accounts    More
```

- **`+` is the only way to add an entry.** It sits in the tab bar, centred,
  raised, in the brand accent, in the thumb's natural arc. A tap opens quick
  entry as an expense. A long-press (or a swipe up on it) offers In, Save and
  Move. The Out/In header buttons and the floating Add button go.
- The bar is **on every screen, Vault included**.
- **More** opens a sheet, not a page. It holds Month, Vault, Business,
  Investments, Budgets, Categories and Settings, with the signed-in email and
  Sign out at the bottom. A destination that is not built does not appear in
  More. We stop shipping "not built yet" pages.
- **The header** is 48px: the title on the left and at most one icon action
  (search on the Ledger). On Home and the Ledger the month is chosen by
  swiping the header, or by tapping it to open a month grid.
- **Vault** moves into More. It is used far less than expense entry, and
  having it one tap further away costs nothing.
- The rail on wide screens stays as it is, listing the same destinations.

### 3.3 Information hierarchy

**Home**, in order, fitting in about 1.5 screens (R#4):
1. *Left to spend this month* as the one large figure. Until budgets exist it
   is income so far minus spent minus deposited. A pace line sits under it
   ("৳1,450 a day for the next 4 days"), then In / Saved / Out as three
   **labelled** short figures on one row that fits 360px. This replaces the
   strip of clipped tiles that scrolls sideways.
2. *Today*: spent today, and today's entries or "Nothing yet today".
3. *Accounts strip*: spendable accounts as chips with balances. A negative
   balance is flagged, since a negative bKash is an error in real life.
4. *Where it went*: the category bar with the top four categories. Tapping
   opens Month. The insight paragraphs become one-line cards that start with
   the number ("48% kept, above the 20% mark").

Net worth stops being the hero. It moves to the top of Accounts, which is
where it answers that screen's question.

**Lists** (Ledger, Recent, account detail): one row is about 56px. Left: a
category glyph in the category's own tint. Middle: the payee or category, then
account and time in small type. Right: the amount. **The name gets its width
first. The amount is never cut and never wraps.** Day headers show the day's
net and stick one at a time.

### 3.4 Quick entry — seconds, one thumb

The target is *tap `+`, type 2-5-0, tap a category chip, done*: three taps
plus the digits, under four seconds, with nothing touched above the middle of
the screen.

- **A numpad drawn in the sheet** (plain buttons, `inputmode="none"` on the
  display), not the system keyboard. It never covers the form. It offers `00`
  and `⌫`, plus `+` and `−` so `120+45` works like a calculator (R#1). It
  enforces the currency's `minor_unit`, so a `12.999` typo cannot be entered.
- **A strip of recent entries** at the top of the sheet (R#2): the last 5–8
  distinct payee + category + account combinations. Tapping one fills
  everything and selects the amount, so repeating yesterday's CNG fare is
  two taps.
- **The amount display is the largest type in the app**, coloured by type
  (coral for out, mint for in, violet for saved), as the existing sheet
  intends.
- **Out / In / Save / Move** is a segmented control with full labels.
  Expense is the default.
- **Category chips, not a dropdown**: the eight categories used most in the
  last 60 days, in a 4 × 2 grid just above the numpad, plus "More…". **Tapping
  a chip saves the entry.** The account defaults to the one used last for that
  category, shown as a chip you can change.
- **Details are one tap away and optional**: date (Today / Yesterday / pick),
  payee, note, necessity. The necessity default comes from the category rather
  than always being Discretionary.
- After saving: a light haptic (`navigator.vibrate(8)` where supported), the
  sheet closes, the new row slides into Today, and a toast offers **Undo** for
  5 seconds. Undo reverses the entry, because a recorded entry is final.
- **The draft really is kept** and comes back when the sheet reopens.
- **Paste a bKash / Nagad / Rocket SMS** (R#9, after the basics): it fills
  the amount, direction, account and date. The fee becomes its own
  "Fees & charges" line, and a TrxID seen before is refused.

### 3.4a Speed is part of the look (R#6)

The app should never show a skeleton for numbers it has already seen. A GET
paints at once from the last response cached on the device, labelled
"updated 2 min ago", then refreshes and ticks whatever changed. **The vault
and the session are never cached.** An app-shell service worker precaches
HTML, CSS, JS, fonts and the sprite, and never caches `/api/*`. An entry saved
offline goes to an outbox under its client ULID and is marked "waiting to
sync". It is not yet *recorded*, and the screen says so. Cross-document View
Transitions (R#14) crossfade tab changes, so the screen no longer flashes on
every tab.

### 3.5 Visual language — a dated change to `context.md` §4

> **2026-09-26 — §4 softened: "instrument-panel density" becomes "calm top,
> dense lists".** *(Director. Supersedes part of §4, and supersedes the
> 2026-09-11 move to rebuild screens in OppTracker's vendored design system.)*
>
> The owner dislikes the current look. At 360px the dense instrument panel
> comes across as clutter rather than precision. Kept: the near-black canvas
> with a blue cast, one meaningful colour per money flow, hairlines instead of
> shadows, the hand-drawn sprite, small radii, and tokens as the only source
> of values. Changed:
>
> 1. **Figures.** Large figures (hero, tiles) are set in **Space Grotesk with
>    tabular figures**, not the monospace. Mono stays for columns in lists.
>    The home currency shows as **৳** with no code. Minor units are hidden when
>    they are zero and shown small otherwise. A foreign currency keeps its
>    code (`USD 1,070`). Compact figures use lakh and crore (`৳2.66L`,
>    `৳1.2Cr`), with en-IN grouping kept. An outflow gets colour plus a sign,
>    not a sign, a colour and an arrow. Still produced only by
>    `formatMoney()`.
> 2. **Hierarchy through size and space, not boxes.** Fewer cards. A screen's
>    top section sits directly on the canvas, and cards are used for lists
>    and groups only. Uppercase micro-labels only where they label a figure.
> 3. **One accent for action.** The brand accent (the cyan of the wordmark) is
>    used for `+`, the primary button and the current tab. The flow colours
>    are never used on buttons again (goodbye, coral Out button).
> 4. **Category tints.** Each category gets a muted tint token, used for its
>    glyph and its segment of the bar. The flow colours stay reserved for
>    money moving.
> 5. **One design system.** `hisab.css` and its tokens. No vendored Bootstrap,
>    no Inter, no second reset on any page.

The research (R#3) reached the same verdict independently: the dark §4
language wins, and the light indigo cockpit reads as generated. This decision
refines §4 rather than replacing it.

Day theme stays a full equal, not an afterthought. Both themes get checked at
every increment.

### 3.6 Motion and touch

- **Sheets track the finger**: drag the handle down to dismiss, with a spring
  back if released early. They open in 220ms `--ease-out` and close in 160ms
  `--ease-in`.
- **Press feedback on everything tappable**: a scale of .97 and a surface step
  within 60ms of touch. Nothing relies on hover.
- **A changed value ticks** (`--ease-snap`) when a new entry updates a total.
  A new row slides in, and a reversed row collapses out.
- **Swipe a Ledger row**: left for Reverse, right for Repeat. A long-press
  menu and the detail view offer the same actions, because a swipe is never
  the only way (R#8, NN/g).
- **Swipe the header** on Home and the Ledger to change month.
- Tap targets of at least 48px, with 8px between neighbours. The bottom bar
  respects `env(safe-area-inset-bottom)`. The "reaching hand" setting mirrors
  the chip grid and the numpad's `⌫` side.
- Everything is behind `prefers-reduced-motion`: movement becomes an opacity
  change, and nothing loops.

---

## 4. Three tracks

Each developer works in their own git worktree, branched from `origin/main`.
**File ownership does not overlap.** If you need a change in a file you do not
own, ask its owner. Do not edit it.

### Dev A — Shell, design system, and the screens around the edges

**Owns:** `shared/**` (all CSS partials and `_variables.css`, `hisab.css`,
`shared/js/core/**` including `money.js`, `shared/js/components/**`,
`shared/icons/sprite.svg`, `shared/js/main.js`), `assets/**`, `404.html`,
`site.webmanifest`, `.htaccess`, `modules/settings/**`, `modules/auth/**`,
`modules/vault/**`, `app/`, `bootstrap/`, `config/`, `routes/`, `public/`,
`composer.*`, `tools/*.py`, `tools/*.html`, `tools/*.mjs` except where listed
below, `tools/deploy.sh`, and the `Tests/Feature` files for auth and vault.

**The one exception:** the `SECONDARY` array in `shell.js` (the entries in
More). A track that ships a destination adds its own single line there. That
rebases cleanly.

**Frozen for everyone, Dev A included, until the director lifts it:** the
inline pre-paint `<script>` block in every page, because `check-pages.py`
checks its hash against the CSP in `.htaccess`.

1. **A1 — Money that fits.** `formatMoney()` defaults: `৳` for the home
   currency, no code, minor units hidden when zero and small otherwise, codes
   for other currencies. `.money` never truncates and names ellipsize
   instead. Update `tools/test-money.mjs`.
   *Accept:* test-money passes. At 360 no figure is cut on Overview, Accounts
   or the Ledger (shoot-mobile, both themes), and the account names on
   Accounts show in full up to 18 characters.
2. **A2 — The new bottom bar and More.** Home · Ledger · `+` · Accounts · More,
   on every page including Vault.
   `+` emits `EVENTS.COMPOSE` on the bus and falls back to
   `modules/ledger/list.html?compose=1` when nothing on the page is
   listening. More is a sheet listing only destinations that are built.
   `.fab` is hidden on phones. The header is 48px.
   *Accept:* at 360, every built screen is reachable within 2 taps. Settings
   and Sign out are reachable. The bar's targets are 48px or more and sit
   above the safe area. No page's own files were edited.
3. **A3 — One design system.** Delete `assets/vendor/` and
   `tools/check-vendor.html`, and drop the vendor check from anything that
   runs it.
   *Accept:* `check-pages.py` passes, no 404 in any page's network log, and
   the deploy payload is 1.2 MB smaller.
4. **A4 — Visual tokens per §3.5**: display-face figures, category tint
   tokens, the single accent for action, fewer card borders, press states.
   *Accept:* shoot-mobile of all screens in both themes attached to the
   commit message description; qa-viewport 360/390 pass.
5. **A5 — The sheet tracks the finger**: drag to dismiss, snap back, keyboard
   safe via `visualViewport`, reduced-motion fallback.
   *Accept:* at 360 the sheet can be dismissed by dragging; with an input
   focused, its primary button is never covered.
6. **A6 — Header month swipe and the month grid** in `periodStepper()`, which
   replaces the grey label box.
7. **A7 — Settings as a grouped list** (theme, hand, home currency, demo data,
   account, about). Vault and login passes at 360, including the placeholder
   indent.
8. **A8 — Haptic, undo-toast and value-tick helpers** in components, so B
   and C call them rather than write their own.
9. **A9 — Instant paint** (§3.4a): `shared/js/core/http.js` gains a cached
   GET that paints the last response first and then revalidates, with a
   deny-list covering `/vault/*` and `/auth/*`. Module `api.js` files opt in
   with one option, and each owner switches their own.
   *Accept:* the second visit to Home at 360 shows figures in under 300ms
   with the network throttled, and no vault or session response is ever
   written to storage (checked in a browser test).
10. **A10 — App-shell service worker, PWA install and View Transitions**
    (R#6, R#11, R#14): PNG icons (192, 512, maskable), `apple-touch-icon`,
    cache versioning tied to the deploy commit, `/api/*` never cached, and
    `.htaccess` updated if the CSP needs a `worker-src`.

### Dev B — Capture and the Ledger

**Owns:** `modules/ledger/**` (the entry sheet, list, `ledger.css`, backend,
data), `modules/categories/**`, `tests/Feature/*Ledger*`,
`tests/Feature/*Categor*`, `tools/test-ledger-browser.html`.

1. **B1 — Quick entry, part one.** `entry-sheet.js` exports `mountCompose()`,
   which listens for `EVENTS.COMPOSE` and handles `?compose=1`, and the Ledger
   page calls it. Amount first with the in-sheet numpad, Out / In / Save /
   Move with full labels, the account as a chip, details collapsed. Remove
   the Ledger's own FAB and its header Out/In buttons.
   *Accept:* at 360, `+` → 250 → Save records an expense with the default
   account in at most 3 taps plus digits, nothing needed sits above the
   middle of the screen, the system keyboard never opens for the amount, and
   the ledger browser test passes.
2. **B2 — Category chips that save.** `GET /api/categories/frequent` (the
   top 8 by use in the last 60 days, falling back to the seed order), with
   the contract in `endpoints.md` first. The chip grid appears above the
   numpad, a tap saves, the necessity comes from the category, and the last
   account used for that category is the default.
   *Accept:* php artisan test with a new test for the ranking. At 360 the
   rickshaw case takes 3 taps plus digits.
3. **B3 — Recent and repeat** (R#2): the recent strip at the top of the
   sheet, built client-side from entries already loaded and deduplicated on
   payee + category + account.
   *Accept:* at 360, repeating an existing entry takes 2 taps plus an
   optional amount change.
4. **B4 — The draft works.** Save on input, restore on reopen, clear on save.
   Fix the `isConnected` ordering bug recorded in STATUS.
   *Accept:* type, background the tab, reopen: it is still there. The browser
   test covers it.
5. **B5 — Ledger rows.** Category glyph and tint, the name keeps its width,
   56px rows, a fix for the sticky day-header stacking that hides today's
   entries, and a lighter header for a day with a single entry, so half the
   list is not headers.
   *Accept:* at 360 today's rows are readable, no figure or name is cut
   before 18 characters, and at least 10 rows fit on one screen.
6. **B6 — Filters in one line** that fit at 360: a type segment plus a filter
   sheet for History, account and category. Search stays.
7. **B7 — Swipe rows** (R#8): Reverse to the left, Repeat to the right, plus a
   long-press menu with the same actions and undo.
8. **B8 — After-save feel**: the row slides into Today, a haptic, an Undo
   toast (using A8).
9. **B9 — Offline outbox** in `ledger/backend/api.js` (§3.4a): the entry is
   kept under its ULID, marked "waiting to sync", and POSTed on `online` or
   the next load. The server's ULID check makes a retry idempotent.
10. **B10 — Paste an MFS SMS** (R#9): the parser lives in its own file, with
    `tools/test-sms.mjs` (Dev B owns this file) run against real sample
    messages.
11. **B11 — Categories screen, for real**: rename, reorder, archive, and a
    default necessity per category. It adds its line to More.
12. **B12 — Search that understands money** (R#16): `>500`, `bkash`,
    `food sep`, with a total at the top of the results.

### Dev C — Home, money and the month

**Owns:** `index.html`, `modules/overview/**`, `modules/accounts/**` (including
`MonthCockpit` and the finance endpoints), `modules/fx/**`,
`modules/reports/**`, `modules/business/**`, `modules/investments/**`,
`modules/budgets/**`, `tests/Feature/*Account*`, `*Finance*`, `*Fx*`, and the
parked cockpit stash.

1. **C1 — One engine for a month.** Give `MonthCockpit` a `book` (defaulting to
   personal), and have Home and the finance endpoint agree with
   `/api/ledger/summary` for the same book and month. Alternatively, retire
   one of the two and say which in `context.md`.
   *Accept:* a test asserts both give the same income, spent, deposited and
   kept for September's demo data. Home shows ৳88,611 of income, not
   ৳259,473.
2. **C2 — Home, rebuilt** per §3.3: left to spend as the hero, then today,
   where it went, and compact accounts. Remove the index FAB and the header
   Out/In buttons, and call `mountCompose()`.
   *Accept:* at 360 × 780 the hero and today are above the fold, the whole
   page is at most 1.6 screens with demo data, nothing covers content, and
   the numbers match C1.
3. **C3 — Accounts, and an account detail.** Net worth at the top (spendable
   and held), rows that keep their names, and a tap opening
   `accounts/detail.html` with that account's balance and entries, reusing
   the ledger's row renderer through the ledger's `api.js`, not by copying it.
   *Accept:* at 360 no truncated name under 18 characters, and detail opens
   and goes back.
4. **C4 — Month** (`modules/reports/insights.html`, now real): the necessity
   mix, "could save", and three small hand-drawn SVG charts (R#10). The
   charts are six months of in vs out from `/api/finance/archive`, this
   month against a category's 3-month average, and cumulative spend by day
   of month against last month's line. At most seven bars, labels on the
   bars, tap to read a value, and a table view behind each chart. Cards, not
   tables. It adds its line to More, and the Insights stub is gone.
5. **C5 — Month close** on a phone: the end-of-month banner on Home,
   reviewed and closed in a sheet.
6. **C6 — Personal / Business book switch** on Home and Accounts (`state.book()`
   exists), then a Business page that is real, not a stub.
7. **C7 — Send home** (R#12): an AED → BDT transfer preset with the rate and
   the fee as its own line.
8. **C8 — Investments and Budgets**, each only when it can do real work.
   Until then they are not in More.
9. **C9 — Drop the stash** once C4 and C5 have taken what they need
   (`git stash drop`, noted in the log).

### Order across tracks

A1 and A2 land first. B1 and C2 depend on A2's `EVENTS.COMPOSE`, and until it
lands both can build against the `?compose=1` fallback. C2 calls B1's
`mountCompose()`: if B1 is not in yet, C2 keeps the old compose wiring and
switches in a follow-up commit. C3's account detail reuses B5's row
renderer, which B exports from `modules/ledger/` rather than C copying it.
A9's cached GET lands before B9's outbox and before C switches its `api.js`
calls to it. Nothing else depends across tracks.

---

## 5. Integration rules

1. **Branch from `origin/main`** in your own worktree
   (`git worktree add ../hisab-a origin/main -b track-a`).
2. **One increment is one commit and one push to `main`.** Small, working, and
   explained: the message says *why*, per `CONVENTIONS.md`.
3. **Before every push:** `git fetch && git rebase origin/main`, then run the
   checks that apply, and all of them if you touched `shared/`:
   - `"D:/My Lab/.toolchain/php83/php.exe" artisan test`
   - `node tools/test-money.mjs` and `node tools/test-crypto.mjs`
   - `python tools/check-pages.py` and `python tools/check-sprite.py`
   - `tools/run-browser-tests.sh` when ledger, settings, vault or auth changed
   - **`node tools/shoot-mobile.mjs` at 360 and look at every screen you
     touched**, in both themes. Any `OVERFLOW` in its output fails the
     increment.
4. `git push origin HEAD:main`. **Never force-push.** If the push is rejected,
   rebase again and re-run the checks.
5. **Author:** `Md Imran Hossain <rabitgulf@gmail.com>`. The local git config on
   this machine says a different address, so pass
   `-c user.email=rabitgulf@gmail.com` or set it in your worktree. **No AI
   attribution anywhere**: no `Co-Authored-By`, no mention of an assistant,
   in messages, trailers or file headers. (The last five commits before this
   document broke this rule. History is not rewritten, but it stops here.)
6. **Logs, not shared-doc edits.** Each track appends to its own
   `docs/log/track-a.md`, `track-b.md` or `track-c.md` (change log entries,
   decisions, and anything not executed). The reviewer folds these into
   `context.md` and `docs/STATUS.md`, so three people never edit those two
   files at once. `docs/DIRECTION.md` belongs to the director.
7. **The reviewer** pulls `main` after each push, runs shoot-mobile on the
   screens that changed, and files anything cut off, hidden or slow as a
   reply to that track. An increment whose screenshot shows a clipped figure
   is not done.

### Taking the screenshots

```bash
HISAB_DEV_TOOLS=1 "D:/My Lab/.toolchain/php83/php.exe" -S 127.0.0.1:8000 -t . tools/serve.php
EMAIL=owner@... PASSWORD=... node tools/shoot-mobile.mjs ../shots
```

To try things without touching the dev MySQL, point the server at a throwaway
SQLite file (`DB_CONNECTION=sqlite DB_DATABASE=/path/x.sqlite`), migrate and
seed it, create an owner, and run `artisan hisab:demo`.

---

## 6. Open questions for the owner

1. **Home's hero figure: "left to spend" needs a monthly target.** Do we use
   a budget you set, or default to "income so far minus spent"?
2. **Vault in More**: is that acceptable, or do you open the vault often
   enough to want it on the bar instead of Accounts?
3. **Poisha**: hide them everywhere except inside an entry, or keep them in
   lists too?
4. **Dark by default**, or should the phone follow the system theme (which
   is the current default)?
5. **Business book**: is it used daily (a switch on Home) or only for monthly
   profit (a page in More)?
6. **Dues (baki)** (R#13), money lent to and borrowed from people. Do you
   want it? It needs a counting rule decided in `context.md` before any code.
7. **Bangla**: should numbers and labels be available in Bangla (R#7), and
   is that a setting or the default?
