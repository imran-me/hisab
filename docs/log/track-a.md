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
Fix-up before push: the Ledger fallback is `?compose=<type>`, the form B's
`mountCompose()` reads; checked that + on Accounts opens the sheet there.

## Review round fixes

- `formatMoneyHTML(-40, 'BDT', { minor: 'never' })` printed `−৳0`. The sign
  now follows the figure as shown, so a negative that rounds to nothing is
  `৳0` (and a positive one is never `+0`). Four new assertions.
- `tests/Unit` was not tracked, so `artisan test` failed in a clean checkout
  (phpunit.xml names it). Committed with a `.gitkeep`.
- `shoot-mobile.mjs` crashed on Windows for a path with a query string: the
  file name kept `?` and `=`. Anything outside `[A-Za-z0-9_-]` is now `_`.

Verified: test-money (92), artisan test (139 passed), shoot-mobile of
`modules/ledger/list.html?compose=income` writes
`modules_ledger_list_compose_income-1.png`.

## A3 — One design system

Deleted `assets/vendor/` (Bootstrap, Bootstrap Icons, Inter, Plus Jakarta
Sans, JetBrains Mono, `opptracker.css`) and `tools/check-vendor.html`, the
only thing that loaded them. Nothing else referenced either (grep over html,
js, css, py, sh, mjs, .htaccess, the manifest). `assets/` went from 1,336 KB
to 160 KB; `deploy.sh` publishes `assets/` with `rsync --delete` (or a staged
swap), so the server copy goes too.

Verified: check-pages passes; shoot-mobile over all ten pages with a probe
listing every resource that answered 400+ or came from a vendor path: none,
except `/api/vault/header` 404 on the Vault, which is the known "no vault on
the server yet" answer the module handles (context.md, 2026-09-08).

## A4.1 — v2 tokens (DIRECTION §3.7)

`_variables.css` rewritten to the v2 names and values, both palettes:
`--bg-0…3`, `--line`, `--line-soft`, `--text-1…4`, marigold `--accent`,
`--accent-text`, `--on-accent`, `--plus-bg/--plus-ink` (the day + is ink
with a marigold plus), `--in/--out/--saved/--move/--warn/--danger` with
washes, eight `--cat-*` tints per theme, the v2 type scale (`--t-hero` …
`--t-key`, in rem) with `--wd-*` widths, the 4px space scale (`--s-5` 20,
`--s-6` 24, `--s-8` 32, `--s-10` 40), radii `--r-xs…--r-plus/--r-pill`,
`--shadow-sheet`, `--shadow-plus`, and the v2 motion (`--t-press` 90,
`--t-fast` 140, `--t-base` 220, `--t-leave` 160, `--t-tick` 420).
`--tabbar-h` is 64px per §3.7.6.

Every v1 name (`--void`, `--surface*`, `--ink*`, `--flow-*`, `--r-1…4`,
`--e-*`, `--hero*`, `--need-*`) is kept as an ALIAS of its v2 token, so B's
and C's CSS switched palette with no edit. Delete the aliases once no module
reads them (grep `--flow-\|--ink\|--surface` in modules/).

Decisions taken here, flag if wrong:
- **Vault colour.** v1 gold would be read as marigold ("tap here"). The
  vault now takes the steel cyan the app used to wear (`--vault` #5CC8D6
  night, #0B6E7C day), which nothing else uses.
- **Business book** keeps its own `--biz` (the transport-blue tint), since
  §3.7 does not name one and it must differ from the personal book.
- `.money--out` is now `--text-1` (outflows are plain ink). The wordmark's
  "b" uses `--accent-text`, since marigold is never text on paper.
- The page `<meta name="theme-color">` in each page's head still says the
  v1 `#06080B`; `applyTheme()` overwrites it at runtime with `--bg-0`, and
  the manifest is updated. Each page owner can change their meta line.

Verified: shoot-mobile of Home, Ledger, Accounts and Settings at 360 in both
themes: the new palettes apply through the aliases, no overflow;
check-pages passes.

## A4.2 — v2 fonts

`assets/fonts/` now holds exactly four files: `ibm-plex-sans-var.woff2`
(46 KB, kept), `anek-latin.woff2` (65 KB), `anek-bengali.woff2` (265 KB,
`unicode-range` U+0980–09FF so it loads only when Bengali is on screen) and
`hisab-taka.woff2` (1.4 KB, U+09F3 only, `font-display: block`). Space
Grotesk, both Plex Mono files and Noto Sans Bengali are deleted. The three
new files moved from `docs/visual-v2/f/`, which is gone; the mock's
`v2.css` now points at `assets/fonts/` so it still renders.

`.money` is Plex Sans 500 tabular in lists, with the ৳ at 0.9em in the
figure's own colour. From `--lg` up a figure is Anek 600 condensed
(`--wd-fig` 92%, `--wd-hero` 86% for xl and hero), with the ৳ at 0.5em and
the minor part at 0.42em in `--text-3`. Headings are Anek 600 at 96%.
`--font-mono` is now an alias of the body stack (no mono face ships).

Verified at 360, both themes, Home, Ledger, Accounts: `document.fonts`
lists only IBM Plex Sans, Anek Bangla (Latin half) and Hisab Taka as
loaded, so no figure uses another face and the ৳ comes from Hisab Taka
(the Bengali half is never fetched on these screens). Home compared against
`docs/visual-v2/shots/home-night.png`: the figures, taka and weights match;
the bar and tab colours differ until A4.4. check-pages passes.


## A4.3 — v2 partials: buttons, cards, rows, sheet, chips, segments

- Buttons: press is scale .97 plus a surface step in the 90ms press window.
  Primary is marigold at the body size; its hover mixes toward `--text-1`
  (never `--accent-text`, which is brown on paper). Secondary is an outline,
  the same edge as a chip. Danger hover text is `--bg-0`, not `#fff`.
- Segmented control (`.btn-group`): a `--bg-3` track with 3px padding, 34px
  segments, the selected one lifting to `--bg-1` with `--shadow-lift`. No
  accent.
- Cards and stat tiles: `--bg-1`, `--r-lg`, no border at night, a 1px
  `--line-soft` ring by day (new token `--ring-card`).
- Rows: 60px minimum; a 40px glyph tile at `--r-md` painted from `--tint`
  (the tint at 15% behind its icon, `--text-3` without one); `.cat-food` …
  `.cat-health` set `--tint` from the category tokens, for B5. Name 15/500,
  meta 12.5 `--text-3`. Separators start at the text (68px), not full width.
  The narrow-phone gap tweak from A1 is gone: v2's type fits without it.
- Day headers (`.list-group-head`): text only, no band, 12.5/500 `--text-3`.
- Sheet: `--bg-2`, `--r-lg` top corners, `--shadow-sheet`, no border, a
  36 × 4 `--text-4` handle, no rule under the head, 12px plus the safe area
  at the bottom. The dialog matches.
- Pills and choices: pill radius for pills; selected is a `--bg-3` fill in
  `--text-1` (a filter is a view, not an action, so no marigold). Badges
  (`.chip`) are `--r-xs` on `--bg-3`. Inputs are `--bg-3` wells, no border.

Verified at 360 in both themes on the Ledger, Accounts and Settings: no
figure clipped, no row name cut below 18 characters (the one ellipsis is
"Cash in hand" beside its Default badge, in C's markup); check-pages passes.
