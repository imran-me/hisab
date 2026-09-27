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
