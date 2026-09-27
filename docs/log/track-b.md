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
