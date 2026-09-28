# Track B log — capture and the Ledger

Newest last. Each entry: what shipped, what was verified, what was not.

---

## B1 — Quick entry, part one: the pad

The entry sheet is now amount-first with a number pad drawn in the sheet
(`modules/ledger/numpad.js`): 1–9, `.`, `0`, `00`, `⌫`, `−`, `+` and Save in
the bottom corner. The display is `inputmode="none"`, so the system keyboard
never opens for the amount; a hardware keyboard still types through the same
`press()` the pad uses. `120+45` works like a calculator and shows `= ৳165`
under the display; sums are integer minor units per operand, so `0.1+0.2` is
exactly 30 poisha. The minor unit is enforced as you type (`12.999` cannot be
keyed; JPY has no decimal key).

Out / In / Save / Move is a segmented control with words that fit at 320px.
The account, the destination (Move, Save) and the date are chips that show
their value; everything else is behind Details, which opens upward and is the
only part of the sheet that scrolls, so the pad never leaves the thumb.
`data-hand="left"` puts the action column (and Save) on the left.

`mountCompose()` is exported: it listens for `EVENTS.COMPOSE` on the bus (falls
back to the string `'compose:requested'` until A2 defines it), handles
`?compose=1` / `?compose=income` and strips it from the URL, and wires any
`[data-compose]` button. The Ledger calls it. Its header Out/In buttons are
gone. `entryActions()` stays exported, marked deprecated, only because the
Overview still imports it (C2 removes that call; then delete it).

The sheet's CSS is its own file, `entry-sheet.css`, loaded by `entry-sheet.js`
and awaited on first open, because the sheet also opens on pages that do not
load `ledger.css`.

**Not done yet, on purpose:** the Ledger's FAB is still in `list.html`. Removing
it before A2's `+` lands would leave the Ledger with no way to add an entry.
It goes in a follow-up once A2 is on main (A2 also hides `.fab` on phones).

**Found, pre-existing:** with a backend, `categories/backend/api.js` never reads
the server, so the category ids it offers are client ULIDs the server has
never seen. Every categorised entry is refused with 422 "The selected category
id is invalid". Before this change the refusal was silent (no error slot for
`category_id`); the sheet now shows it. Fixed in B2.

**Verified:** ledger browser harness 33 assertions (17 new, for the pad's
maths and refusals), settings 13, vault 51; `test-money` 88; `check-pages` ok.
At 360×780, signed in against a throwaway SQLite with demo data:
`?compose=1` → 2-5-0 → Save records a ৳250 expense on the default account
(3 taps plus digits from +), the sheet top sits at y≈244 with nothing needed
above the middle, focus is on the display with no keyboard. Looked at the
sheet in both themes and with Details open. No overflow.

## Review round 1, High — server totals no longer add dollars to taka

`BalanceSheet::summary()` converts every row into one currency (`?currency=`,
default BDT) BEFORE summing, through the fx module's `Converter` that C added
in `18e1b3b` (one converter for both screens, not two): the row's own
`fx_rate` snapshot when its account is in the target currency, else the rate
as of the row's date, either direction.
A row with no rate is left out and named in `unconvertible`, never counted 1:1.
`by_category` / `by_method` / `by_necessity` use the converted amounts too.
The response gains `currency` and `unconvertible`; nothing was removed, so
`MonthCockpit::ledgerTotals()` picks the fix up unchanged.

**Verified:** `php artisan test` 139 passed, on top of C's `18e1b3b` (3 new: a USD income converted at
the as-of rate, a snapshot beating a later owner rate, a JPY row reported as
unconvertible in EUR). On the demo data, August personal income is now
14,044,300 poisha (৳140,443) instead of 8,796,300.

**For C:** add the USD row to the "cockpit equals ledger" test, as the review
asks. **Not done:** the client `summary()` in `ledger/backend/api.js` still
converts at today's rate rather than the snapshot/as-of rate, so Home can
differ from the server by the rate drift on foreign rows. The fix is for the
client to read the server's figure when a backend is present; queued after B3.

## Review round 3, High — the entry you just added is visible (B5, part one)

Cause: `.card--flush` has `overflow: hidden`, which makes the card the box a
sticky heading sticks in. Every day heading sat `--header-h` below the top of
the CARD, over the first rows, so today's entry was covered the moment it was
saved. The Ledger's card now uses `overflow: clip` (`.ledger-card`), which
clips the corners without becoming a scroll container. Each day is its own
`<li class="ledger-day">` with its own `<ul>`, so one heading sticks at a time
and pushes the last out; they stick under the filter bar, whose height is
measured (ResizeObserver → `--ledger-bar-h`).

**For A:** the same `overflow: hidden` on `.card--flush` in `_surfaces.css`
causes the Overview Recent bug; `overflow: clip` there fixes it everywhere.
The day net is U+2212 (checked in the DOM); it reads as a hyphen because of
the face at that size, so the Ledger's day net now uses the display face.

**Verified:** 360×780 signed in: `?compose=1` → 1-6-5 → Save shows TODAY with
both of today's rows under it and the toast; scrolled, the current day's
heading sits under the filter bar and the rows scroll beneath it. No overflow.
Ledger harness still 33.

A2 landed while this was in flight, so the Ledger's FAB markup is removed too
(B1's pending item). Checked: the tab bar's + opens the entry sheet on the
Ledger through `mountCompose()` (`EVENTS.COMPOSE` is `'compose:requested'`,
the same string B1 used as its fallback).

## Found and fixed: every correction was recorded twice on the server

`ledger/backend/api.js` `update()` built its replacement by calling
`create()`, which POSTed it as an ordinary new entry, and then PATCHed the
original, which on the server reverses it AND records its own replacement.
So each correction made in the app with a backend left three new rows instead
of two: the mirror, the linked replacement, and a stray copy of the new amount
that nothing points at and every total counts. Pre-existing (since the
reversal rule landed); proved on the throwaway DB: one correction went from
110 to 113 rows, the extra row `corrects_id: null` with the new amount.

Fixed: the local replacement is built by an internal `record(…, { sync: false })`;
only the PATCH reaches the server. Also: `create()` now sends the source leg's
ULID, so this device and the server hold the same id (a same-session reverse
or undo used to name an id the server had never seen); a refused PATCH or
reverse rolls the local rows back; a successful one drops the cache so the
server's mirror ids are read next.

**Verified** against the server: create 777 → correct to 778 → reverse leaves
exactly four rows (original, mirror, replacement linked by `corrects_id`, the
replacement's mirror). Ledger harness 33 (local path unchanged).

**For the owner / reviewer:** any correction made in the app against the real
database before this commit left a stray duplicate. They can be found as
standing rows with `corrects_id` null whose amount, account and type match a
`corrects_id` row created within a few seconds of them. Not cleaned up here:
removing rows is not something this app does, so each needs a reversal, and
which ones to reverse is the owner's call.

## B2 — Category tiles that save, and the sheet laid out to the v2 mock

`GET /api/categories/frequent` (contract in categories `endpoints.md` first):
the top N active categories by standing uses in the last 60 days, filled in
seed order, each with `uses` and `last_account_id`. Counted through the schema,
so categories still does not depend on the ledger. 6 tests
(`CategoriesFrequentTest`): ranking and fill, reversed entries and mirrors not
counted, the window, archived excluded, last account, another owner's rows.

**Fixed, pre-existing:** `categories/backend/api.js` never read the server, so
with a backend every categorised entry was refused (client ids). It now loads
every book and type from `/api/categories` (archived included, for `find()`),
creates through the server and keeps the server's row, and never falls
through to device data on a 401.

The sheet, per DIRECTION §3.7.6 and review round 3: no title bar (the title
stays for assistive tech; dismiss by handle, backdrop or Escape); the amount
centred with ৳ (or the code, for another currency) as the currency button, in
plain ink for Out, `--in` for In, `--saved` for Save; the sum on the line under
it ("250 + 120") while the big figure shows the result; account / Today /
Details pills; a 4 × 2 grid of the seven most used categories plus More; the
4 × 4 pad with +, − and a two-row marigold Save, and 00 · 0 · ⌫ on the bottom
row. **Tapping a tile saves.** Save without a category says "Tap a category
to save" and nudges the grid (only when categories exist). The tile's
`last_account_id` becomes the account unless the person chose one; the toast
names what was used ("Added ৳250 · Transport · Cash in hand").
**Necessity is never pre-set**: it is sent only when picked in Details (a 4-up
segmented row that says which band the category will apply), otherwise the
category's band applies on both sides. Details replaces the tiles in the
middle of the sheet, so the amount stays pinned and the pad never moves.

**Decision, flagged:** the mock's pad has no decimal key. A long-press on 00
types the point (its corner shows "·"), as does "." on a keyboard; a currency
with no minor unit has none. Also from review round 3 (Low): a point refused in
yen now refuses the digit after it too and shakes the figure, so ¥1.5 can no
longer become ¥15.

Tints are the `--cat-*` tokens through `modules/categories/glyphs.js` (keyed
on the category's stable `key`). Icons are existing sprite icons until the
category glyphs are in the sprite; that map is the one place to change.

**Verified:** php artisan test 145 passed. Ledger harness 33. Against the
server at 360×780: + → 2-5-0 → Save says "Tap a category to save"; tapping
Transport saves `amount_minor` 25000, `category_label` Transport, `necessity`
1 (from the category, not 3) and closes the sheet. Screenshots in both themes
with a sum on the pad: the sheet top is at y≈141, nothing scrolls, no overflow.
**Not yet:** the recent strip (B3) and the draft (B4) are next.

Follow-up in the same push: the tiles use A's `.cat-<tint>` classes and
`cat-<tint>` sprite glyphs (db2595d), and ⌫ uses the sprite's `backspace`.

## Fixed (C's request 1): a foreign row moved its account by the wrong amount

Both `BalanceSheet::balances()` and the client `balances()` added a row's
`amount_minor` whatever its currency, so a USD 12.99 charge on a taka account
moved it by ৳12.99. Rows in another currency than their account are now
converted first, by the row's `fx_rate` snapshot (currency → account currency)
or else the as-of rate (server, via fx `Converter`) / current rate (client);
with no rate the row is left out and named in `meta.unconverted`. Same-currency
rows are still summed by the database.

**Verified:** php artisan test (LedgerTest 39 passed, 2 new: snapshot and
as-of conversion on a taka card, a JPY row on a EUR account reported as
unconverted). Ledger harness 35 (2 new: a local USD row snapshots a rate and
moves the taka balance by its converted value).

## C's request 2: `kept_minor` → `spendable_minor` in the client summary

The client `summary()` called income − spent − held `kept_minor`; the server
and the cockpit call it `spendable_minor` and use `kept_minor` for income −
spent. Renamed. Nothing read the old name (grep across modules, index, shared).

C's request 4 in the next commit: `entryActions()` deleted (no references left).

## Review (Medium): a snapshotted rate must be for the row's own pair

`LedgerWriter::snapshotRate()` accepted any visible `fx_rate_id`, so a EUR/BDT
rate could be snapshotted onto a USD charge on a taka card. It now requires
`base` = the row's currency and `quote` = the account's; anything else (another
pair, the inverse pair, a rate that is not the owner's or a seed) is a 422 on
`fx_rate_id` for the leg the rate was chosen for. The incoming leg of a pair,
on another account, simply is not snapshotted when the rate does not fit it.
The browser never sends `fx_rate_id` today, so no client change.

**Verified:** php artisan test 149 passed (2 new: another pair refused with
nothing written; the inverse pair refused).

## B4 — The draft works (review round 3, Medium)

The draft was only written from `onClose`, after `sheet.js` had already removed
the sheet, so `if (!form.isConnected) return;` returned every time. It is now
written on every change (debounced 250ms: pad keys, tiles, any field), at once
on `visibilitychange` → hidden (a phone call; a hidden tab may be killed with
no further event), and on dismiss. It is never written after a save (a late
debounced write would resurrect the saved entry) or for a correction. Clearing
the amount (and payee and note) removes it. The reopened sheet shows the
amount selected, so the first digit replaces it.

**Verified:** ledger harness 39 (4 new, driving the real sheet: typing writes
the draft before any close; it survives a dismiss; the reopened sheet shows
250; clearing the amount clears it).

## B3 — Recent and repeat

A row of up to 8 recent-entry chips under the pills ("CNG ৳158"), built from
the rows the ledger already holds for this type, newest first, distinct on
payee + category + account. A chip fills payee, category, account, method,
note and currency, and sets the amount SELECTED (the next digit replaces it);
the date stays today. So repeating an entry is + → chip → Save. Filled chips
without a border (§3.7.6), one scrolling row that fades at the edge. Hidden for
a transfer and when correcting.

**Verified** against the server at 360×780: 8 chips; tapping the first filled
250 / Transport / Cash in hand, and Save recorded it ("Added ৳250 · Transport
· Cash in hand"). Looked at the sheet with the strip: it matches the mock.
Ledger harness 39, check-pages ok.

## The browser's month totals read each row's snapshot

`summary()` (and `series()`) in `ledger/backend/api.js` converted every row at
today's rate, so entering a new USD rate rewrote last month's spending, and
Home could differ from the server. Rows now go through `sumIn()`: the row's
`fx_rate` snapshot when its account is in the target currency (the server's
rule), else today's rate (the browser holds no rate history, the one place it
can still differ from the server's as-of rate), else named as missing.
`series()` also netted nothing: a reversal mirror (still type expense) was
ADDED, and a deposit mirror ignored. It now counts exactly as `summary()` does.
(`series()` has no caller today.)

**Verified:** ledger harness 40 (1 new: setting a new USD rate leaves
September's converted expense unchanged).

## Owner override — the entry sheet is five things

The owner's spec: "entry will be simple: amount, type, category, note, from
cash or bank account". The sheet is now exactly that, top to bottom:

- **Type** in plain words: Expense / Income / Transfer. A Transfer INTO a
  savings or investment account is recorded as a `deposit` (still a
  first-class type, so savings figures stay right) without the person having
  to know the word.
- **Amount** on the pad, large: red for Expense, green for Income, ink for a
  Transfer, via `--money-out` / `--money-in` with `--danger` / `--in` as the
  fallback until A's tokens land.
- **Account** as a card: logo, name, masked number, and the balance before
  (struck through) and after this entry. From for an expense, To for income,
  From → To for a transfer (each card shows its balance after the move).
  Tapping opens a new **account picker sheet** (`account-picker.js`) grouped
  Cash / Bank / Mobile wallet / Card / Savings & investments; each row has a
  logo (a tinted monogram until A's `bankLogo()` lands; `logoFor()` is the one
  place to swap), name, institution and •• tail, and current balance.
- **Category** as icon chips in colour circles, one scrolling row; the chosen
  one fills with its colour. More opens the full list. Choosing a category
  switches to the account last used with it (remembered on the device, and
  from the server's `last_account_id`), and the card flashes to say so.
- **Note**: one line, always visible. **Date**: a small chip beside it.
- One slim "Again?" row of recent entries stays.

Gone from the default view: necessity, the Details drawer, the pills, payee
and method (payee and method are carried hidden so a repeat or a correction
keeps them). Necessity always comes from the category now. Save: a haptic, the
Save key turns into a check, the figure drops toward the account card, then
the sheet closes (420ms; an opacity fade under reduced motion). Tapping a
category no longer saves by itself, since the note is on screen: amount →
category → Save.

**Verified** at 360×780 against the server, dark and day (screenshots in the
session scratchpad under `devb/owner/`): expense, income, transfer and the
picker. Saving 120 + Transport + note stored `expense` 12000 Transport,
necessity 1 from the category, the note. Ledger harness 40, check-pages ok.

## Ledger rows to the owner's rule, and one exported row renderer (C's request 3)

`modules/ledger/row.js` exports `rowLook()` (accounts, categories and the
reversed set, fetched once per render) and `entryRowHTML(row, look, opts)`:
a category icon in its colour circle (the type's glyph for a transfer), the
title (payee, else the note, else the category), the category and the
account's logo + name on the sub-line, and the amount through the shared
formatter with `type` so an expense is red with − and income green with +
(a reversal mirror is coloured by its sign), `minor: 'never'`. Options:
`showAccount: false` for an account's own screen, `after` for a running
balance line, `cells` for the Ledger's wide-screen columns. Its CSS
(`row.css`) loads itself. **For C:** Home's Today and account detail can drop
their local `entryRow()` for this.

Account logos are now A's `accountLogo()` (bank-logo.js) everywhere in the
ledger, sheet and picker. Also fixed: a day heading being pushed out slid over
the translucent filter bar (same z-index, later in the page).

**Verified** at 360×780, dark and day: rows show tinted circles, bKash's pink
tile, red −৳ amounts, the note as the title. No overflow.

## Performance: the Ledger paints in 5s, not 18s (one categories call)

`GET /api/categories/all` returns every book and type, archived included, in
one response (contract in categories `endpoints.md`; the test
`test_all_returns_every_book_and_type_in_one_call_archived_included` checks
that it matches the six per-type calls row for row and holds nothing of
another owner's). `categories/backend/api.js` uses it and keeps the set in
session storage for the tab, keyed to the signed-in owner's id, so another
sign-in in the same tab never sees the first person's names. A copy older
than 10 minutes is used, then refreshed after the paint.

The larger cause was not the six calls but eighteen: `load()` memoised only
the finished value, so the row renderer, the page and the sheet each started
their own six-call load before the first answered. The in-flight promise is
shared now, in categories and in the ledger (two full ledger reads per page
became one).

Also fixed on the way, pre-existing: `archive()` sent `PATCH {archived:
true}`, which the server refuses for want of a label, so no archive ever
reached it. It now uses `DELETE` (and drops a hard-deleted row). `restore()`
never told the server; it now POSTs `/restore`.

**Measured** (signed in, 360×780, php -S, three months of demo data, time from
navigation to the first day group):

| | first visit | next visit in the tab | /api calls |
|---|---|---|---|
| before | 17,966ms | 15,308ms | 24 / 23 (18 categories, 2 ledger) |
| after | 5,365ms | 4,209ms | 7 / 5 (1 categories, 1 ledger) |

**For C:** `/api/accounts` and `/api/fx/rates` are each fetched twice on one
Ledger load. The cause is the same (only the finished value is memoised) in
`accounts/backend/api.js` and `fx/backend/api.js`, and the same few-line fix
there takes the Ledger to 5 calls on a first visit.

**Note for whoever runs the harnesses:** `test-auth-browser.html` generates
demo data and removes it again, so a throwaway DB is empty afterwards; run
`hisab:demo` again before screenshots.

## B7 — Swipe rows, hold for the menu

`modules/ledger/row-gestures.js`, attached to the Ledger's list:

- **Swipe right: Repeat today.** The same entry again (same account, the
  other leg of a transfer, category, payee, note), dated today, at once, with
  a toast whose Undo reverses the copy. `ledger.repeat(id, { occurred_on })`
  is the one door for it.
- **Swipe left: Reverse**, after the confirm the sheet already used. The row
  collapses out, and the toast's Undo records the entry again **on its own
  date** rather than reversing the reversal. Decision: a reversed reversal
  leaves the original marked reversed, so the list keeps hiding it and the
  server refuses to reverse it ever again ("already reversed"). A fresh copy
  has neither problem, and History still shows exactly what happened.
- **Hold (or right-click): Edit, Repeat today, Copy amount, Reverse.** A
  reversal or an already-reversed row does not swipe and its menu offers only
  Copy amount. Copy gives the bare figure (`1995`, `12.50`), which is what a
  bKash or bank app's amount field accepts.
- Feel: 1:1 to the arming point (28% of the row, at least 84px), then a third
  of the movement; one tick (A's `haptic('drag')`) when it arms, the layer
  fills (marigold for Repeat, danger for Reverse) and its icon grows; release
  springs home on `--ease-snap`. The direction is decided in the first 10px
  and `touch-action: pan-y` leaves vertical scrolling to the browser. A swipe
  or a hold never also opens the entry.

**Found while testing:** a touch's implicit pointer capture sits on the child
under the finger, so taking capture onto the row fires `lostpointercapture`
first; ending the swipe on that event killed every swipe in its first frame.
Only the row's own loss counts now. A cancelled swipe (the browser took the
gesture) springs back instead of staying pushed aside.

**Found, pre-existing, not fixed here:** `BalanceSheet::summary()` signs a
row by `reverses_id === null ? +1 : -1`, so a reversal of a reversal (which
`LedgerWriter::reverse()` allows, and says is how a wrong correction is
undone) is subtracted a second time instead of restoring the original. The
app never does this (Undo re-records instead), but the API allows it. The
fix is to sign by the depth of the reversal chain.

**Verified:** ledger harness 46 (6 new: repeat is a new row dated today with
the payee and account; the Undo-after-reverse copy keeps its own date; a
reversal is refused; a transfer repeats with both legs). Driven at 360×780
by CDP touch against the server, dark and day: swipe right armed, released →
"Repeated ৳1,995 · local bazar today", one row more; swipe left armed →
confirm → the row collapses, "Reversed …" → Undo → it is back; a hold opens
the four-item menu and not the entry; a 60px swipe springs back and does
nothing; a cancelled swipe leaves no layer behind; a tap still opens the
entry. php artisan test 167, check-pages ok.

## Merchant marks on ledger rows

`row.js` draws A's `merchantGlyph(row)` (69d9ebc) in place of the category
circle when the payee or note names a known merchant ("Foodpanda dinner",
"Uber to office", "Daraz order", "Netflix"), and falls back to the category
glyph otherwise. One line, so Home's Today and account detail get it too
once they use `entryRowHTML()`.

**Verified** at 360×780, dark and day: four seeded entries show the
Foodpanda, Uber, Daraz and Netflix marks; "local bazar" keeps its tinted
food circle. No overflow.

## Smart entry: the note files the entry

`modules/ledger/smart-entry.js` reads the note as it is typed (140ms
debounce) and the sheet acts on it:

- the merchant's mark appears inside the note field (A's `findMerchant()`, so
  a row's logo and a suggestion agree about who "Uber" is);
- the category is chosen, unless one was chosen by hand (a tile, More, a
  recent chip, a draft or a correction), and the account follows it unless
  one was picked by hand; the card flashes;
- last time's amount waits in one chip ("Uber · Transport · Cash in hand
  ৳444  Use") while the pad is empty. It takes the recent strip's place, so
  the pad never moves.

Trust order: the owner's own history (same note, then same merchant, then a
note that starts with what is typed), then `MERCHANT_CATEGORY` (42
merchants → seed category keys, first one the book has). If their Foodpanda
goes under Groceries, it goes under Groceries. The amount is the per-note
memory (`hisab:m:ledger-notes`, written on every save, capped at 300 notes),
else the matched entry's.

**Verified:** ledger harness 54 (8 new, on the matcher). At 360×780 against
the server, dark and day: "uber" → Uber mark, Transport, Cash in hand,
chip ৳444; Use fills 444 and the card shows the balance after; "KFC" → Dining
out by the merchant map with no chip; "local baz" → Food by history.
