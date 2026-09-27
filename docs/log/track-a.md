# Track A log — shell, design system, edges

Newest last. Each entry: what shipped, what was verified, what was not.

## Defaults used while the owner's questions are open (DIRECTION §6)

- Dark theme by default; Settings offers "follow the phone" as a toggle.
- Vault lives in More.
- Poisha hidden in lists, shown in detail and edit views. The formatter's
  display default is "hidden when zero, small otherwise"; a list passes
  `{ minor: 'never' }`, a detail or edit view `{ minor: 'always' }`.
- Bangla digits: an optional setting, off by default.

---

## A1 — Money that fits

`formatMoneyHTML()` (the display form) now shows the home currency as `৳`
with no code, keeps the code for any other currency (`USD 1,070`), hides a
zero minor part and sets a non-zero one small, and puts the sign first
(`−৳450`). New options: `minor: 'auto' | 'always' | 'never'` (never rounds
half away from zero, it does not truncate) and `compact` in the HTML form.
`code: true` still forces the code, `code: false` still drops the marker.
The home currency is the display currency: `state.js` pushes it into
`money.js` via `setHomeCurrency()`.

`formatMoney()` (the text form) keeps its old defaults on purpose: it fills
input fields and must round-trip through `parseAmount()`. `symbol: true` now
means "৳ at home, the code abroad". `moneyLabel()` is new: the text form with
display defaults, for toasts, aria labels and titles.

CSS: from `.money--lg` up, figures are set in Space Grotesk (tabular), not
the mono. A stat tile is a size container and its figure scales to fit
(`min(--fs-23, 15cqi)`). At 380px and below a row's gaps and side padding
step down and a trailing ⋮ hangs into the padding, so the name gets the width.

Verified: test-money (88 assertions), test-crypto, check-pages, check-sprite.
shoot-mobile at 360 in both themes on Overview, Ledger, Accounts, with a
probe that reports any `.money` clipped by an ancestor and any truncated
`.row__title`: none on any of the three. An 18-character name
("Brokerage (DSE) ac") was written into every Accounts row and measured: it
fits on every row except the one that also carries a Default chip (the name
fits, the chip ellipsizes).

For B and C: pass `{ minor: 'never' }` on list rows (the owner default), and
switch `formatMoney(…, { code: true })` in toasts and titles to
`moneyLabel(…)`. The Overview's sideways-scrolling tile strip still puts its
third tile off-screen by design; C2 replaces it.

Tooling: `shoot-mobile.mjs` takes `CDP_PORT` (a fixed debug port, so agents
on one machine do not collide) and `PROBE` (a JS expression evaluated per
page, its result printed).

## A2 — The bottom bar, +, and More

The phone bar is Home · Ledger · + · Accounts · More on every page, Vault
included. Each slot measures 72 × 55 at 360px. The header is 48px.

- **+** is raised, centred, and the only accent fill on the bar. Tap asks for
  an expense; hold (420ms) or drag up offers In, Save and Move in a menu.
  It emits `EVENTS.COMPOSE` (`{ type }`) when something listens
  (`hasListeners()` is new in bus.js). Until B1/C2 ship `mountCompose()`, it
  clicks the page's own `[data-compose]` trigger (so it opens the existing
  sheet on Home and the Ledger today), and otherwise goes to
  `modules/ledger/list.html?compose=<type>` (the form B's `mountCompose()` reads). The bridge in `compose()`
  should be deleted once no page has `[data-compose]` left.
- **More** is a sheet: Vault and Settings (the only built destinations in
  it), then the signed-in email and Sign out. `SECONDARY` in shell.js lists
  only built destinations; Insights, Business, Investments, Budgets and
  Categories are out of the bar, the More sheet and the rail until their
  track ships them and adds its line.
- The rail gets an "Add an entry" button at the top.
- `.fab` is hidden everywhere (`display:none !important`); `main.js` no
  longer tucks it. Home and the Ledger still carry fab markup and header
  Out/In buttons: B1 and C2 remove them.
- Vault: the lock screen stops at the tab bar on phones, so there is a way
  out; its own Add moved from the floating button into the header (gold,
  shown only while unlocked), so a secret is never one mis-aimed tap from an
  expense.
- Toasts sit 28px above the bar, clear of the raised +.

Verified at 360: all ten pages render the new bar, header 48px, no
horizontal overflow; + on Home opens the entry sheet, + on Accounts lands on
the Ledger with the sheet open; hold opens the type menu above +; More opens
with Vault, Settings, the email and Sign out, on the Ledger and on the locked
Vault. Both themes checked. test-money, check-pages, check-sprite pass.
Browser tests: settings passes; vault has one flaky assertion (a generated
24-char password has no digit about 8% of the time: a real generator gap, to
fix in the vault); auth fails because it expects owner@hisab.test, which the
throwaway DB does not have (not a regression). `run-browser-tests.sh` now
takes `DEBUG_PORT` from the environment; shoot-mobile takes `BEFORE`.
